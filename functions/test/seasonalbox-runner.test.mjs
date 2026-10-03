// End-to-end tests for the Seasonal Box agent runtime: the real runner,
// tools, executors, and stage machine against the Firestore and Storage
// emulators, with a local fake of the Claude Messages API that streams
// scripted responses. No API key and no spend.
//
// Covers: a full run from queue to brief (steps persisted, conversation
// replayed byte for byte, escalation to the heavy model, per-tier request
// shape, prompt-cache breakpoints, taste notes injected), the ledger and
// counters, approval levels (green executes, yellow waits, money goes red over
// the threshold), approving a Trend Brief creating themes and advancing the
// season (which starts the Maker Scout), budget pause and continue, cancel,
// duplicate trigger delivery, and resume after a failed call.
//
//   firebase emulators:start --only firestore,storage --project josh-cocciardi
//   cd functions && npm ci && node test/seasonalbox-runner.test.mjs

import http from "http";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ── Fake Claude API ─────────────────────────────────────────────────────────
// Each request pops the next scripted reply. Replies are content blocks plus
// a stop reason and usage; the server streams them as SSE the way the real API
// does, so the SDK's own stream assembly is what the runner consumes.

const requests = [];
let script = [];
let failNext = 0;
let rateLimitNext = 0;

const sse = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    requests.push({ url: req.url, headers: req.headers, body: parsed });
    if (rateLimitNext > 0) {
      rateLimitNext -= 1;
      res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
      res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "scripted 429" } }));
      return;
    }
    if (failNext > 0) {
      failNext -= 1;
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "scripted failure" } }));
      return;
    }
    const reply = script.shift();
    if (!reply) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "script exhausted" } }));
      return;
    }
    const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...(reply.usage || {}) };
    res.writeHead(200, { "content-type": "text/event-stream" });
    sse(res, "message_start", {
      message: { id: `msg_${requests.length}`, type: "message", role: "assistant", model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } },
    });
    reply.content.forEach((block, index) => {
      if (block.type === "text") {
        sse(res, "content_block_start", { index, content_block: { type: "text", text: "" } });
        sse(res, "content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
      } else if (block.type === "server_tool_use" || block.type.endsWith("_tool_result")) {
        // Hosted tool blocks arrive whole in content_block_start.
        sse(res, "content_block_start", { index, content_block: block });
      } else if (block.type === "tool_use") {
        sse(res, "content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
        sse(res, "content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
      }
      sse(res, "content_block_stop", { index });
    });
    sse(res, "message_delta", { delta: { stop_reason: reply.stop || "tool_use", stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
    sse(res, "message_stop", {});
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT = "josh-cocciardi";
process.env.SBOX_BACKOFF_MS = "300";

const { initializeApp } = require("firebase-admin/app");
initializeApp({ projectId: "josh-cocciardi", storageBucket: "josh-cocciardi.firebasestorage.app" });
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

const { runStep } = require("../seasonalbox/runner.js");
const { onProposalWritten } = require("../seasonalbox/executors.js");
const { costOfUsage } = require("../seasonalbox/config.js");

// ── Harness ─────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${label}${cond || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
};

const clear = async () => {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/josh-cocciardi/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`could not clear Firestore emulator: ${res.status}`);
};

const doc = (c, id) => db.collection(c).doc(id);
const get = async (c, id) => (await doc(c, id).get()).data();
const all = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

/* Stands in for the Firestore trigger: keep stepping while the run is active,
   exactly as each write to the run doc would fire sboxRunStep again. */
const drive = async (runId, max = 12) => {
  for (let i = 0; i < max; i++) {
    const r = await get("sbox_runs", runId);
    if (!["queued", "running"].includes(r.status)) return r;
    await runStep(runId);
  }
  return get("sbox_runs", runId);
};

/* Stands in for the proposal trigger after a client decision. */
const decideAs = async (id, patch) => {
  const before = await get("sbox_proposals", id);
  await doc("sbox_proposals", id).update(patch);
  const after = await get("sbox_proposals", id);
  await onProposalWritten(id, before, after);
  // A green executor run or a second hop (manual completion) re-fires too.
  const again = await get("sbox_proposals", id);
  if (JSON.stringify(again) !== JSON.stringify(after)) await onProposalWritten(id, after, again);
};

const queue = async (fields) => {
  const ref = db.collection("sbox_runs").doc();
  await ref.set({ trigger: { type: "manual" }, instructions: "", status: "queued", tick: 0, cost: 0, steps: 0, createdAt: new Date(), ...fields });
  return ref.id;
};

const tool = (id, name, input) => ({ type: "tool_use", id, name, input });

const TREND = {
  season: "Holiday 2027",
  themes: [
    { name: "Ember and Oak", story: "Fireside warmth.", palette: [{ hex: "#7A3E1D", name: "ember" }], scentNotes: ["cedar"], categoriesByKit: { bath: ["soap"] }, evidence: [], signalStrength: "high", risks: [] },
    { name: "Frost Garden", story: "Cool greens.", palette: [{ hex: "#9DB8A8", name: "sage" }], scentNotes: ["fir"], categoriesByKit: { bath: ["soap"] }, evidence: [], signalStrength: "medium", risks: [] },
  ],
  recommendation: "Ember and Oak.",
};

const seed = async () => {
  await clear();
  await doc("sbox_settings", "global").set({
    baseLocation: "Katonah, NY",
    sourcingRadiusMiles: 60,
    thresholds: { yellowToRedUsd: 150 },
    budgets: { aiMonthlyUsd: 150, operatingPerSeasonUsd: 1000, defaultPerRunUsd: 3, defaultPerDayUsd: 10 },
    autoStartAgents: true,
  });
  await doc("sbox_secrets", "anthropic").set({ apiKey: "sk-ant-test" });
  const base = { enabled: true, maxSteps: 10, inputBriefTypes: [], actionTypes: [], autonomy: {}, budgets: { perRunUsd: 3, perDayUsd: 10 }, outputSchema: "{}", systemPrompt: "Test agent." };
  await doc("sbox_agents", "trend-researcher").set({
    ...base,
    name: "Trend Researcher",
    org: "insights",
    modelTier: "standard",
    tools: ["db_read", "save_note", "escalate", "web_search"],
    readScopes: ["seasons"],
    briefType: "trend",
    briefLabel: "Trend Brief",
    briefLevel: "red",
  });
  await doc("sbox_agents", "maker-scout").set({ ...base, name: "Maker Scout", org: "sourcing", modelTier: "standard", tools: [], readScopes: [], briefType: "scout", briefLevel: "yellow" });
  await doc("sbox_agents", "procurement").set({
    ...base,
    name: "Procurement",
    org: "sourcing",
    modelTier: "light",
    tools: ["propose_action"],
    readScopes: [],
    actionTypes: ["email.send", "order.create_po", "makers.upsert"],
    autonomy: { "email.send": "yellow", "order.create_po": "green", "makers.upsert": "green" },
    briefType: "quote",
    briefLevel: "red",
  });
  await doc("sbox_notes", "n1").set({ scope: "agent", scopeId: "trend-researcher", text: "Avoid pumpkin spice.", pinned: true, createdAt: new Date() });
  await doc("sbox_notes", "n2").set({ scope: "agent", scopeId: "maker-scout", text: "Scout-only note.", createdAt: new Date() });
  await doc("sbox_seasons", "S1").set({ name: "Holiday 2027", shipDate: "2027-11-15", lockDate: "2027-10-11", stage: 2, status: "active", flags: {}, history: [] });
};

// ── 1. A full run ───────────────────────────────────────────────────────────

console.log("a full run, queue to brief:");
await seed();
script = [
  { content: [{ type: "text", text: "Checking the season." }, tool("t1", "db_read", { collection: "seasons", id: "S1" })] },
  { content: [tool("t2", "save_note", { text: "Ember tones trending." }), tool("t3", "escalate", { reason: "ready to synthesize" })] },
  { content: [tool("t4", "submit_brief", { title: "Holiday themes", summary: "Two themes.", content: TREND })], usage: { cache_read_input_tokens: 900 } },
];
requests.length = 0;
const r1 = await queue({ agentId: "trend-researcher", seasonId: "S1", trigger: { type: "stage", stage: 2 } });
const done1 = await drive(r1);
ok("run ends awaiting approval", done1.status === "awaiting_approval", done1.status);
ok("three model calls", requests.length === 3, requests.length);
ok("three steps persisted", (await db.collection("sbox_runs").doc(r1).collection("steps").get()).size === 3);
ok("standard tier runs on Sonnet 5.5", requests[0].body.model === "claude-sonnet-5-5", requests[0].body.model);
ok("Sonnet gets adaptive thinking and an effort", requests[0].body.thinking?.type === "adaptive" && !!requests[0].body.output_config?.effort);
ok("Sonnet opts into server-side fallbacks", requests[0].body.fallbacks === "default" && String(requests[0].headers["anthropic-beta"]).includes("server-side-fallback-2026-07-01"));
ok("escalate switches the next step to Opus 5.5", requests[2].body.model === "claude-opus-5-5", requests[2].body.model);
ok("Opus gets no thinking block (it always thinks)", requests[2].body.thinking === undefined);
ok("system prompt and taste notes carry cache breakpoints", requests[0].body.system.length === 2 && requests[0].body.system.every((b) => b.cache_control?.type === "ephemeral"));
ok("automatic caching on the conversation", requests[0].body.cache_control?.type === "ephemeral");
ok("the agent's own taste note is injected", requests[0].body.system[1].text.includes("Avoid pumpkin spice."));
ok("another agent's note is not", !requests[0].body.system[1].text.includes("Scout-only note."));
ok("hosted web search is declared", requests[0].body.tools.some((t) => t.type === "web_search_20260209"));
ok("tools not granted are absent", !requests[0].body.tools.some((t) => t.name === "propose_action"));
ok("submit_brief is always present", requests[0].body.tools.some((t) => t.name === "submit_brief"));
ok("context message carries the season", JSON.stringify(requests[0].body.messages[0]).includes("Holiday 2027"));
const m2 = requests[1].body.messages;
ok("step 2 replays step 1's assistant turn", JSON.stringify(m2[1].content) === JSON.stringify([{ type: "text", text: "Checking the season." }, { type: "tool_use", id: "t1", name: "db_read", input: { collection: "seasons", id: "S1" } }]));
ok("db_read result fed back as a tool_result", m2[2].content[0].type === "tool_result" && m2[2].content[0].tool_use_id === "t1" && m2[2].content[0].content.includes("Holiday 2027"));
ok("step 3 prefix is exactly step 2's messages (append-only)", JSON.stringify(requests[2].body.messages.slice(0, m2.length)) === JSON.stringify(m2));
ok("system prompt identical across steps (cacheable)", JSON.stringify(requests[0].body.system) === JSON.stringify(requests[2].body.system));
ok("run remembers which notes it read", (done1.notesUsed || []).map((n) => n.text).join() === "Avoid pumpkin spice.");
ok("working note saved on the run", (done1.notes || [])[0]?.text === "Ember tones trending.");

const briefs1 = await all("sbox_briefs");
ok("one brief, pending", briefs1.length === 1 && briefs1[0].status === "pending" && briefs1[0].type === "trend");
ok("brief content stored intact", JSON.parse(briefs1[0].contentJson).themes.length === 2);
const props1 = await all("sbox_proposals");
const briefProp = props1.find((p) => p.actionType === "brief.approve");
ok("brief approval is red (agent's briefLevel)", briefProp?.level === "red" && briefProp?.status === "pending");

const ledger1 = await all("sbox_ledger");
const expected = costOfUsage("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 200 }) * 2 + costOfUsage("claude-opus-5-5", { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 900 });
const total1 = ledger1.reduce((s, e) => s + e.amount, 0);
ok("one ledger entry per model call", ledger1.length === 3, ledger1.length);
ok("ledger total is the priced usage", Math.abs(total1 - expected) < 1e-9, { total1, expected });
ok("run cost matches the ledger", Math.abs(done1.cost - total1) < 1e-9, { cost: done1.cost, total1 });
const month = (await get("sbox_counters", `ai-month-${new Date().toISOString().slice(0, 7)}`)).amount;
ok("monthly counter matches the ledger", Math.abs(month - total1) < 1e-9);
ok("Opus cache reads priced at $0.20/M", Math.abs(costOfUsage("claude-opus-5-5", { cache_read_input_tokens: 1e6 }) - 0.2) < 1e-12);
ok("web searches priced at $10 per 1000", Math.abs(costOfUsage("claude-sonnet-5-5", { server_tool_use: { web_search_requests: 3 } }) - 0.03) < 1e-12);

// ── 2. Approving the Trend Brief ────────────────────────────────────────────

console.log("approving the Trend Brief:");
await decideAs(briefProp.id, { status: "approved", decision: { by: "josh", selection: [0], comment: "Go with ember." } });
const executed = await get("sbox_proposals", briefProp.id);
ok("executor marks it done", executed.execution?.status === "done", executed.execution);
ok("brief approved", (await get("sbox_briefs", briefProp.briefId)).status === "approved");
const themes = await all("sbox_themes");
ok("only the selected theme becomes a theme record", themes.length === 1 && themes[0].name === "Ember and Oak");
const s1 = await get("sbox_seasons", "S1");
ok("season advances to Scouting", s1.stage === 3, s1.stage);
ok("season records the themes", (s1.themeIds || []).length === 1);
ok("run settles to completed", (await get("sbox_runs", r1)).status === "completed");
const scoutRuns = (await all("sbox_runs")).filter((r) => r.agentId === "maker-scout");
ok("entering Scouting queues the Maker Scout once", scoutRuns.length === 1 && scoutRuns[0].trigger?.stage === 3);
{
  // A duplicate delivery of the approval event.
  const cur = await get("sbox_proposals", briefProp.id);
  await onProposalWritten(briefProp.id, { ...cur, status: "pending", execution: null }, { ...cur, execution: null });
}
ok("re-delivery executes nothing twice", (await all("sbox_themes")).length === 1);

// ── 3. Approval levels and executors ────────────────────────────────────────

console.log("proposals:");
await seed();
script = [
  {
    content: [
      tool("p1", "propose_action", { actionType: "email.send", title: "Email Hilltop", summary: "Outreach", payload: { to: "a@b.c", subject: "Hi", body: "Hello" } }),
      tool("p2", "propose_action", { actionType: "order.create_po", title: "PO Hilltop", summary: "Order", payload: { total: 400 }, amountUsd: 400 }),
      tool("p3", "propose_action", { actionType: "makers.upsert", title: "Add maker", summary: "New", payload: { makers: [{ name: "Hilltop Soap Co.", location: "Bedford, NY" }] } }),
      tool("p4", "propose_action", { actionType: "customer.refund", title: "Refund", summary: "no", payload: {} }),
    ],
  },
  { content: [tool("p5", "submit_brief", { title: "Quotes", summary: "s", content: { quotes: [] } })] },
];
requests.length = 0;
const r2 = await queue({ agentId: "procurement", seasonId: "S1" });
await drive(r2);
ok("light tier runs on Haiku 4.5", requests[0].body.model === "claude-haiku-4-5-20251001");
ok("Haiku gets no thinking, effort, or fallbacks", requests[0].body.thinking === undefined && requests[0].body.output_config === undefined && requests[0].body.fallbacks === undefined);
const props2 = await all("sbox_proposals");
const by = (t) => props2.find((p) => p.actionType === t);
ok("email.send waits at yellow", by("email.send")?.level === "yellow" && by("email.send")?.status === "pending");
ok("a purchase order is red even when the agent says green", by("order.create_po")?.level === "red");
ok("makers.upsert is green and approved by policy", by("makers.upsert")?.level === "green" && by("makers.upsert")?.status === "approved");
ok("an action the agent isn't allowed is refused", !by("customer.refund"));
const refused = requests[1].body.messages.at(-1).content.find((b) => b.tool_use_id === "p4");
ok("…and the refusal is an error tool_result", refused?.is_error === true);
// The green proposal fires the trigger on create.
await onProposalWritten(by("makers.upsert").id, null, by("makers.upsert"));
ok("green maker upsert executes", (await get("sbox_makers", "hilltop-soap-co"))?.location === "Bedford, NY");
await decideAs(by("email.send").id, { status: "approved", decision: { by: "josh", editedPayloadJson: JSON.stringify({ to: "a@b.c", subject: "Edited", body: "Hello" }) } });
const email = await get("sbox_proposals", by("email.send").id);
ok("an approved email is handed back to do by hand", email.execution?.status === "manual");
await decideAs(by("order.create_po").id, { status: "approved", decision: { by: "josh" } });
await decideAs(by("order.create_po").id, { manual: { done: true, amountUsd: 412.5 } });
const po = await get("sbox_proposals", by("order.create_po").id);
ok("marking a PO done closes it", po.execution?.status === "done" && po.manual?.recorded === true);
const op = (await all("sbox_ledger")).filter((e) => e.category === "operating");
ok("…and records operating spend once", op.length === 1 && op[0].amount === 412.5);
ok("…on the season's operating counter", (await get("sbox_counters", "season-S1-operating")).amount === 412.5);
const procDay = (await get("sbox_counters", `agent-procurement-day-${new Date().toISOString().slice(0, 10)}`))?.amount || 0;
ok("…and not against the agent's daily AI cap", procDay < 1, procDay);

console.log("operating budget:");
await doc("sbox_agents", "procurement").update({ autonomy: { "order.create_po": "red", "shipping.buy_labels": "yellow" }, actionTypes: ["email.send", "shipping.buy_labels"] });
script = [
  { content: [tool("o1", "propose_action", { actionType: "shipping.buy_labels", title: "Labels", summary: "Batch", payload: {}, amountUsd: 100 })] },
  { content: [tool("o2", "propose_action", { actionType: "shipping.buy_labels", title: "Labels 2", summary: "Batch", payload: {}, amountUsd: 900 })] },
  { content: [tool("o3", "submit_brief", { title: "t", summary: "s", content: {} })] },
];
const r3 = await queue({ agentId: "procurement", seasonId: "S1" });
ok("run with an over-budget proposal still finishes", (await drive(r3)).status === "awaiting_approval");
const labels = (await all("sbox_proposals")).filter((p) => p.actionType === "shipping.buy_labels").sort((a, b) => a.amountUsd - b.amountUsd);
ok("labels under the threshold stay yellow", labels[0]?.level === "yellow", labels[0]?.level);
ok("labels that would break the season budget go red", labels[1]?.level === "red" && labels[1]?.summary.startsWith("Over budget"), labels[1]?.summary?.slice(0, 40));

// ── 4. Budgets ──────────────────────────────────────────────────────────────

console.log("budget caps:");
await seed();
await doc("sbox_agents", "trend-researcher").update({ budgets: { perRunUsd: 0.01, perDayUsd: 10 } });
script = [
  { content: [tool("b1", "save_note", { text: "x" })], usage: { input_tokens: 20000 } }, // ~$0.04, over the cap
  { content: [tool("b2", "submit_brief", { title: "t", summary: "s", content: TREND })] },
];
requests.length = 0;
const r4 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
const paused = await drive(r4);
ok("run pauses at its cap", paused.status === "budget_paused", paused.status);
ok("no model call past the cap", requests.length === 1);
const cont = (await all("sbox_proposals")).find((p) => p.actionType === "budget.continue");
ok("a red continue proposal is raised", cont?.level === "red" && cont?.status === "pending");
await decideAs(cont.id, { status: "approved", decision: { by: "josh" } });
const resumed = await drive(r4);
ok("approving it resumes the run to the end", resumed.status === "awaiting_approval", resumed.status);
ok("the run kept its first step", requests.length === 2 && (await db.collection("sbox_runs").doc(r4).collection("steps").get()).size === 2);

// ── 5. Cancel, duplicates, failure and resume ───────────────────────────────

console.log("cancel, duplicate delivery, resume:");
await seed();
script = [{ content: [tool("c1", "save_note", { text: "x" })] }];
requests.length = 0;
const r5 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
await runStep(r5);
await doc("sbox_runs", r5).update({ status: "cancelled" });
await runStep(r5);
ok("a cancelled run makes no further calls", requests.length === 1);

script = [{ content: [tool("d1", "save_note", { text: "x" })] }, { content: [tool("d2", "submit_brief", { title: "t", summary: "s", content: TREND })] }];
requests.length = 0;
const r6 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
await Promise.all([runStep(r6), runStep(r6), runStep(r6)]);
// A late duplicate may legitimately pick up the *next* step once the first
// finishes; what must never happen is the same step running twice.
const dupSteps = (await db.collection("sbox_runs").doc(r6).collection("steps").get()).docs.map((d) => d.data().n);
ok("three simultaneous deliveries never run a step twice", dupSteps.length === requests.length && new Set(dupSteps).size === dupSteps.length, { calls: requests.length, dupSteps });
ok("…and only one of them claims step 1", dupSteps.filter((n) => n === 0).length === 1);

script = [{ content: [tool("f2", "submit_brief", { title: "t", summary: "s", content: TREND })] }];
failNext = 1;
requests.length = 0;
const r7 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
const failed = await drive(r7);
ok("a rejected call fails the run, resumable", failed.status === "failed" && failed.resumable === true, failed.status);
ok("the error is readable", /Anthropic rejected the request/.test(failed.error || ""), failed.error);
await doc("sbox_runs", r7).update({ status: "queued", error: null });
const fixed = await drive(r7);
ok("resume finishes the run from the same step", fixed.status === "awaiting_approval" && requests.length === 2, fixed.status);

console.log("web search errors and rate limits:");
await seed();
script = [
  {
    content: [
      { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "beeswax candles Hudson Valley" } },
      { type: "web_search_tool_result", tool_use_id: "srv1", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } },
      tool("w1", "save_note", { text: "search limited" }),
    ],
  },
  {
    content: [
      { type: "server_tool_use", id: "srv2", name: "web_search", input: { query: "beeswax candles Hudson Valley" } },
      { type: "web_search_tool_result", tool_use_id: "srv2", content: [{ type: "web_search_result", url: "https://example.com", title: "x", encrypted_content: "e" }] },
      tool("w2", "submit_brief", { title: "t", summary: "s", content: TREND }),
    ],
  },
];
requests.length = 0;
const r9 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
await runStep(r9);
const afterErr = await get("sbox_runs", r9);
const step0 = (await db.collection("sbox_runs").doc(r9).collection("steps").doc("0000").get()).data();
ok("a search error is recorded with its code", step0.serverCalls?.[0]?.error === "too_many_requests", step0.serverCalls);
ok("…and remembered on the run", afterErr.lastSearchError === "too_many_requests");
const t0 = Date.now();
await runStep(r9);
ok("the next step waits out the limit first", Date.now() - t0 >= 300, Date.now() - t0);
const step1 = (await db.collection("sbox_runs").doc(r9).collection("steps").doc("0001").get()).data();
ok("a successful search records its result count", step1.serverCalls?.[0]?.results === 1, step1.serverCalls);
ok("the replayed search error reaches the model intact", JSON.stringify(requests[1].body.messages).includes("too_many_requests"));
ok("agents are told a search error is temporary", requests[0].body.system[0].text.includes("too_many_requests"));

script = [{ content: [tool("z1", "submit_brief", { title: "t", summary: "s", content: TREND })] }];
rateLimitNext = 4; // the SDK's own 3 retries, plus one more
requests.length = 0;
const r10 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
const survived = await drive(r10);
ok("a 429 that outlasts the SDK's retries is waited out and retried", survived.status === "awaiting_approval", survived.status);
rateLimitNext = 20;
const r11 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
script = [{ content: [tool("z2", "submit_brief", { title: "t", summary: "s", content: TREND })] }];
const stuck = await drive(r11);
rateLimitNext = 0;
ok("a lasting 429 fails resumably with an honest message", stuck.status === "failed" && stuck.resumable && /Press Resume/.test(stuck.error), stuck.error);

console.log("heartbeat and stage machine:");
await seed();
await doc("sbox_agents", "orchestrator").set({ name: "Orchestrator", org: "command", enabled: true, modelTier: "standard", tools: [], readScopes: [], briefType: "dailyBriefing", briefLevel: "green" });
const { heartbeat, evaluateSeason } = require("../seasonalbox/orchestrator.js");
await doc("sbox_seasons", "S2").set({ name: "Spring 2028", shipDate: "2028-03-20", lockDate: "2028-02-14", stage: 1, status: "active", flags: {}, history: [] });
const [hbA, hbB] = await Promise.all([heartbeat(), heartbeat()]);
const hb2 = await heartbeat();
ok("two tabs opening at once queue one Daily Briefing", [hbA, hbB].filter((h) => h.briefingRunId).length === 1);
ok("a later heartbeat the same day does not", !hb2.briefingRunId);
const s2 = await get("sbox_seasons", "S2");
ok("a season with dates moves from Planning to Trend Research", s2.stage === 2, s2.stage);
ok("…and says what it's waiting on", s2.blocker === "Approve a Trend Brief.", s2.blocker);
// Racing triggers (the stage write re-fires the season trigger mid-flight).
await Promise.all([evaluateSeason("S2"), evaluateSeason("S2"), evaluateSeason("S2")]);
const trendRuns = (await all("sbox_runs")).filter((r) => r.agentId === "trend-researcher" && r.seasonId === "S2");
ok("its Trend Researcher starts exactly once", trendRuns.length === 1, trendRuns.length);
await doc("sbox_seasons", "S2").update({ stage: 1, hold: true });
await evaluateSeason("S2");
ok("a held season stays where Josh put it", (await get("sbox_seasons", "S2")).stage === 1);

await doc("sbox_secrets", "anthropic").delete();
const r8 = await queue({ agentId: "trend-researcher", seasonId: "S1" });
const nokey = await drive(r8);
ok("no API key fails with a clear message", nokey.status === "failed" && /No Anthropic API key/.test(nokey.error));

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
