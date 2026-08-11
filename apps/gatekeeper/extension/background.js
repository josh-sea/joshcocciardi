/* Gatekeeper - background service worker
 *
 * Decision pipeline, in order of cost:
 *   1. bypass hosts        -> instant allow
 *   2. denylist            -> instant block
 *   3. allowlist           -> instant allow
 *   4. cache               -> stored verdict, TTL'd
 *   5. Claude              -> the gray zone only
 *
 * Every outcome is written to a day-bucketed activity log in
 * chrome.storage.local, which survives browser restarts and is not
 * touched by Chrome's "clear browsing data".
 */

// Cloud client (pairing, server-side Claude proxy, activity/request mirror).
// importScripts keeps this a classic worker; `Cloud` is a global from cloud.js.
importScripts("cloud.js");

const API_URL = "https://api.anthropic.com/v1/messages";

const DEFAULTS = {
  enabled: true,
  apiKey: "",
  fastModel: "claude-haiku-4-5-20251001",
  deepModel: "claude-sonnet-5",
  kidName: "Campbell",
  kidAge: 9,
  projectContext:
    "Breadboard circuits, LEDs, resistors, simple motors, Arduino and Raspberry Pi. " +
    "Also baseball, Lego, and drawing. School topics: 4th grade math, reading, science.",
  allowlist: [
    "wikipedia.org", "arduino.cc", "raspberrypi.com", "raspberrypi.org",
    "adafruit.com", "sparkfun.com", "khanacademy.org", "falstad.com",
    "circuitlab.com", "tinkercad.com", "scratch.mit.edu", "code.org",
    "nasa.gov", "britannica.com", "mlb.com"
  ],
  denylist: [],
  bypassHosts: ["localhost", "127.0.0.1", "chrome.google.com"],
  checkAllNavigations: true,
  forceSafeSearch: true,
  failMode: "closed",
  cacheTtlMinutes: 10080,
  passMinutes: 30,
  parentPin: "",
  logVisits: true,
  retentionDays: 0,
  autoArchive: true,
  gamesEnabled: true,
  secondsPerToken: 600,
  maxTokens: 3,
  questCooldownMinutes: 10,
  graceSeconds: 120,
  dadMinutes: 60,
  requireSession: true
};

let settings = { ...DEFAULTS };

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  settings = { ...DEFAULTS, ...(stored.settings || {}) };
  return settings;
}
loadSettings();
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const before = changes.settings.oldValue, after = changes.settings.newValue;
  await loadSettings();
  if (before && after && before.enabled && !after.enabled) await endSession();
});

/* ---------- activity log ----------
 * Stored as one array per local day under "log:YYYY-MM-DD", with a
 * sorted index under "logDays". Bucketing keeps writes small even
 * after months of history.
 */

let eventSeq = 0;

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

async function logEvent(evt) {
  const ts = Date.now();
  const day = dayKey(ts);
  const bucketKey = "log:" + day;
  const store = await chrome.storage.local.get([bucketKey, "logDays"]);
  const bucket = store[bucketKey] || [];
  const id = `${day}-${ts.toString(36)}-${(eventSeq++ % 1296).toString(36)}`;
  const entry = { id, ts, ...evt };
  bucket.push(entry);
  const days = new Set(store.logDays || []);
  days.add(day);
  await chrome.storage.local.set({
    [bucketKey]: bucket,
    logDays: [...days].sort().reverse()
  });
  Cloud.mirrorEvent(entry);   // fire-and-forget → parent's live history
  return id;
}

async function patchEvent(id, patch) {
  const day = String(id).split("-").slice(0, 3).join("-");
  const bucketKey = "log:" + day;
  const store = await chrome.storage.local.get(bucketKey);
  const bucket = store[bucketKey];
  if (!bucket) return;
  const evt = bucket.find((e) => e.id === id);
  if (!evt) return;
  Object.assign(evt, patch);
  await chrome.storage.local.set({ [bucketKey]: bucket });
  Cloud.mirrorEvent({ id: evt.id, ts: evt.ts, ...patch });   // keep cloud copy in sync
}

async function readDays(days) {
  const keys = days.map((d) => "log:" + d);
  const store = await chrome.storage.local.get(keys);
  return days.flatMap((d) => store["log:" + d] || []).sort((a, b) => b.ts - a.ts);
}

async function pruneOldDays() {
  if (!settings.retentionDays) return;
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  const cutoff = dayKey(Date.now() - settings.retentionDays * 86400000);
  const drop = logDays.filter((d) => d < cutoff);
  if (!drop.length) return;
  await chrome.storage.local.remove(drop.map((d) => "log:" + d));
  await chrome.storage.local.set({ logDays: logDays.filter((d) => d >= cutoff) });
}

/* One-time migration from the flat v1.0 log array. */
async function migrateLog() {
  const { log } = await chrome.storage.local.get("log");
  if (!Array.isArray(log) || !log.length) return;
  const buckets = {};
  for (const e of log) {
    const day = dayKey(e.ts);
    (buckets["log:" + day] ||= []).push({ id: `${day}-legacy-${e.ts.toString(36)}`, ...e });
  }
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  const days = new Set(logDays);
  Object.keys(buckets).forEach((k) => days.add(k.slice(4)));
  await chrome.storage.local.set({ ...buckets, logDays: [...days].sort().reverse() });
  await chrome.storage.local.remove("log");
}

/* ---------- weekly archive to Downloads ---------- */

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Build a downloadable file from the activity log."
  });
}

async function archiveNow(manual = false) {
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  if (!logDays.length) return { ok: false, reason: "Nothing logged yet." };
  const events = await readDays(logDays);
  const payload = JSON.stringify(
    { exportedAt: new Date().toISOString(), kid: settings.kidName, events },
    null, 2
  );
  await ensureOffscreen();
  const url = await chrome.runtime.sendMessage({
    type: "MAKE_BLOB_URL",
    target: "offscreen",
    text: payload,
    mime: "application/json"
  });
  if (!url) return { ok: false, reason: "Could not build the file." };
  await chrome.downloads.download({
    url,
    filename: `gatekeeper/activity-${dayKey()}.json`,
    saveAs: manual,
    conflictAction: "overwrite"
  });
  await chrome.storage.local.set({ lastArchive: Date.now() });
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "REVOKE_BLOB_URL", target: "offscreen", url }).catch(() => {});
  }, 20000);
  return { ok: true, count: events.length };
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULTS });
    chrome.runtime.openOptionsPage();
  }
  await migrateLog();
  chrome.alarms.create("gk-maintenance", { periodInMinutes: 360 });
  chrome.alarms.create("gk-cloud-poll", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("gk-maintenance", { periodInMinutes: 360 });
  chrome.alarms.create("gk-cloud-poll", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "gk-cloud-poll") { await pollCloudVerdicts(); return; }
  if (alarm.name !== "gk-maintenance") return;
  await loadSettings();
  await pruneOldDays();
  if (!settings.autoArchive) return;
  const { lastArchive = 0 } = await chrome.storage.local.get("lastArchive");
  if (Date.now() - lastArchive > 7 * 86400000) {
    try { await archiveNow(false); } catch {}
  }
});

/* ---------- cloud verdict reconciliation ----------
 * A parent approves or denies in the web app; the extension learns about it
 * here (polled, since MV3 has no persistent socket) and turns the decision
 * into a cached verdict so the child's next attempt reflects it immediately.
 * Approvals also grant a topic pass, matching a successful appeal.
 */
async function pollCloudVerdicts() {
  if (!(await Cloud.isPaired())) return;
  const verdicts = await Cloud.pollVerdicts();
  if (!verdicts.length) return;

  const { pending = [] } = await chrome.storage.local.get("pending");
  let pendingChanged = false;

  for (const v of verdicts) {
    const approved = v.status === "approved";
    const verdict = approved
      ? { decision: "allow", reason: v.note || "A grown-up approved this.", topic: v.topic || "" }
      : { decision: "block", reason: v.note || "A grown-up said not this one.", topic: v.topic || "" };
    await writeCache(cacheKey(v.kind, v.target), verdict);
    if (approved) await grantPass(v.topic || v.target, settings.passMinutes || 30);

    // Drop the matching local "Waiting on you" entry — it's decided now.
    const i = pending.findIndex((p) => p.cloudRequestId === v.requestId);
    if (i >= 0) { pending.splice(i, 1); pendingChanged = true; }

    try {
      await chrome.notifications.create("gkv-" + v.requestId, {
        type: "basic",
        iconUrl: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        title: approved ? "Gatekeeper: approved" : "Gatekeeper: not this one",
        message: `${String(v.topic || v.target).slice(0, 90)} — ${approved ? "you can open it now" : "kept closed"}`
      });
    } catch {}
  }

  if (pendingChanged) await chrome.storage.local.set({ pending: pending.slice(0, 50) });
}

/* ---------- small helpers ---------- */

const TRACKING = /^(utm_|fbclid|gclid|msclkid|ref|ref_src|_ga)/i;
const KEEP_QUERY_HOSTS = ["youtube.com", "youtu.be", "google.com", "bing.com", "duckduckgo.com"];

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function matchesList(host, list) {
  if (!host) return false;
  return list.some((entry) => {
    const e = entry.trim().toLowerCase().replace(/^www\./, "");
    if (!e) return false;
    return host === e || host.endsWith("." + e);
  });
}

function cacheKey(kind, value) {
  if (kind === "search") return "q:" + value.trim().toLowerCase().replace(/\s+/g, " ");
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./, "");
    let key = "u:" + host + u.pathname.replace(/\/$/, "");
    if (KEEP_QUERY_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
      const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort();
      if (params.length) key += "?" + params.map(([k, v]) => k + "=" + v).join("&");
    }
    return key;
  } catch {
    return "u:" + value;
  }
}

async function readCache(key) {
  const { cache = {} } = await chrome.storage.local.get("cache");
  const hit = cache[key];
  if (!hit || Date.now() > hit.expiresAt) return null;
  return hit;
}

async function writeCache(key, verdict) {
  const { cache = {} } = await chrome.storage.local.get("cache");
  cache[key] = { ...verdict, expiresAt: Date.now() + settings.cacheTtlMinutes * 60000 };
  const entries = Object.entries(cache);
  if (entries.length > 3000) {
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (const [k] of entries.slice(0, 800)) delete cache[k];
  }
  await chrome.storage.local.set({ cache });
}

async function activePasses() {
  const { passes = [] } = await chrome.storage.local.get("passes");
  const live = passes.filter((p) => p.expiresAt > Date.now());
  if (live.length !== passes.length) await chrome.storage.local.set({ passes: live });
  return live;
}

async function grantPass(topic, minutes) {
  if (!topic) return;
  const passes = await activePasses();
  const existing = passes.find((p) => p.topic.toLowerCase() === topic.toLowerCase());
  const expiresAt = Date.now() + (minutes || settings.passMinutes) * 60000;
  if (existing) existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
  else passes.push({ topic, grantedAt: Date.now(), expiresAt });
  await chrome.storage.local.set({ passes });
}

async function addPending(entry) {
  const { pending = [] } = await chrome.storage.local.get("pending");
  const id = "p" + Date.now() + Math.random().toString(36).slice(2, 6);

  // Mirror to the account as a live request the parent can approve/deny from
  // their phone, and get pushed about. The returned id lets pollCloudVerdicts
  // reconcile the decision back onto this local pending entry.
  let cloudRequestId = null;
  if (await Cloud.isPaired()) {
    try {
      const session = await getSession();
      const r = await Cloud.createRequest({
        kind: entry.kind,
        target: entry.target,
        reason: entry.appeal || "",
        topic: entry.topic || "",
        title: entry.title || "",
        sessionGoal: session?.goal || "",
      });
      cloudRequestId = r.requestId;
    } catch {}
  }

  pending.unshift({ id, ts: Date.now(), cloudRequestId, ...entry });
  await chrome.storage.local.set({ pending: pending.slice(0, 50) });
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      title: "Gatekeeper: request waiting",
      message: `${settings.kidName} asked about: ${String(entry.target).slice(0, 90)}`
    });
  } catch {}
  return id;
}

/* ---------- page metadata ---------- */

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${prop}["']`, "i");
  return (html.match(re) || html.match(alt) || [])[1] || "";
}

async function fetchMeta(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "omit" });
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return { title: "", description: "", excerpt: "" };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 60000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    try { reader.cancel(); } catch {}
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || metaTag(html, "og:title");
    const description = metaTag(html, "description") || metaTag(html, "og:description");
    const bodyStart = Math.max(0, html.search(/<body[^>]*>/i));
    const excerpt = stripTags(html.slice(bodyStart, bodyStart + 12000)).slice(0, 900);
    return {
      title: stripTags(title || "").slice(0, 200),
      description: description.slice(0, 400),
      excerpt
    };
  } catch (e) {
    return { title: "", description: "", excerpt: "", error: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Claude ---------- */

async function callClaude(model, system, userText, maxTokens = 400) {
  // Paired to an account: run through the server proxy so the Anthropic key
  // stays server-side and out of this browser's devtools. Only fall back to a
  // locally-stored key if the server has none set.
  if (await Cloud.isPaired()) {
    try {
      return await Cloud.screen({ model, system, userText, maxTokens });
    } catch (e) {
      if (e.code !== "no_key") throw e;
      if (!settings.apiKey) throw new Error("No Anthropic key set — add one in the parent app.");
    }
  }
  if (!settings.apiKey) throw new Error("No API key set in Gatekeeper settings.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }]
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function screenSystemPrompt(passes, goal) {
  const passLine = passes.length
    ? `Active topic passes (an appeal already cleared these, treat closely related material as allowed): ${passes.map((p) => p.topic).join(", ")}.`
    : "No active topic passes.";
  return `You decide whether a ${settings.kidAge}-year-old named ${settings.kidName} may open a web page or run a search during a focused session that a grown-up started with him.

Today's session goal, the thing they sat down together to do:
"${goal}"

Background on ${settings.kidName} (general interests, not today's task): ${settings.projectContext}

${passLine}

Decide:
- "allow": fits the session goal, is supporting knowledge that clearly helps with it, or is plainly harmless reference a step or two away. Follow the goal's thread generously, but keep it pointed at the goal.
- "offsession": safe for a kid but clearly unrelated to today's goal (for example the goal is about circuits and this is a video game or a cartoon). He cannot talk his way past this, because only a grown-up can change what the session is about. Use this for off-topic-but-harmless.
- "ask": on the goal's thread but you are unsure, or mildly age-questionable but not clearly harmful. He will get to explain himself.
- "block": genuinely unsuitable for a young child (sexual content, graphic violence or gore, self-harm, drugs, gambling, hate, unmoderated adult chat or dating, piracy, or anything designed to extract money or personal information from a child). Block regardless of the goal.

Reply with JSON only, no prose around it:
{"decision":"allow"|"offsession"|"ask"|"block","confidence":0.0-1.0,"reason":"one short sentence written to ${settings.kidName} himself, plain words, no lecturing","topic":"two or three word tag"}`;
}

function appealSystemPrompt(passes) {
  return `You are hearing an appeal from a ${settings.kidAge}-year-old named ${settings.kidName}. A first-pass filter stopped him and he has written a reason he should be allowed through.

What he is working on right now:
${settings.projectContext}

Active topic passes: ${passes.map((p) => p.topic).join(", ") || "none"}.

Be genuinely persuadable. A specific, curious, honest reason should usually win, even if the topic is far from his stated project. Learning to argue for what he wants to learn is a skill his parent is deliberately trying to build, so reward real reasoning. A vague reason ("I just want to", "because") is not enough on its own, but respond to it by explaining what a better reason would look like rather than shutting the door.

Never grant access to sexual content, graphic violence, self-harm, drugs, gambling, hate, unmoderated adult chat, or anything built to take money or personal details from a child, no matter how good the argument is. For those, deny and say plainly that this one is not up to you.

Use "escalate" when the reason is plausible but the material sits in territory you think his parent should rule on personally.

When you allow, set ttl_minutes between 15 and 60 and name the topic broadly enough that he can follow the thread without appealing again on every link.

Reply with JSON only:
{"decision":"allow"|"deny"|"escalate","reason":"two sentences at most, written to ${settings.kidName}, warm and direct","topic":"two or three word tag","ttl_minutes":number}`;
}

function describeTarget(kind, value, meta, pageContext) {
  if (kind === "search") {
    return `He typed this search: "${value}"${pageContext?.engine ? `\nSearch engine: ${pageContext.engine}` : ""}`;
  }
  const parts = [`He is trying to open: ${value}`, `Site: ${hostOf(value)}`];
  if (pageContext?.linkText) parts.push(`Link text he clicked: "${pageContext.linkText}"`);
  if (pageContext?.fromUrl) parts.push(`He is coming from: ${pageContext.fromUrl}`);
  if (meta?.title) parts.push(`Page title: ${meta.title}`);
  if (meta?.description) parts.push(`Page description: ${meta.description}`);
  if (meta?.excerpt) parts.push(`Start of page text: ${meta.excerpt}`);
  if (meta?.error) parts.push(`(Could not read the page: ${meta.error})`);
  return parts.join("\n");
}

/* ---------- pipeline ---------- */

async function record(kind, value, verdict, extra = {}) {
  if (verdict.decision === "allow" && !settings.logVisits) return null;
  return logEvent({
    kind,
    target: value,
    host: kind === "search" ? "" : hostOf(value),
    decision: verdict.decision,
    source: verdict.source,
    reason: verdict.reason || "",
    topic: verdict.topic || "",
    ...extra
  });
}

async function evaluate({ kind, value, pageContext }) {
  if (!settings.enabled) return { decision: "allow", reason: "", source: "disabled" };
  if (await dadActive()) return { decision: "allow", reason: "", source: "dad" };
  if (await needsSession()) return { decision: "nosession", reason: "Ask a grown-up to open Gatekeeper and start a session first.", source: "nosession" };

  const host = kind === "search" ? "" : hostOf(value);

  if (host && matchesList(host, settings.bypassHosts))
    return { decision: "allow", reason: "", source: "bypass" };

  let verdict = null;

  if (host && matchesList(host, settings.denylist)) {
    verdict = { decision: "block", reason: "This site is on your dad's blocked list.", source: "denylist", topic: host };
  } else if (host && matchesList(host, settings.allowlist)) {
    verdict = { decision: "allow", reason: "", source: "allowlist" };
  }

  const key = cacheKey(kind, value);
  if (!verdict) {
    const cached = await readCache(key);
    if (cached) verdict = { ...cached, source: "cache" };
  }

  let meta = null;

  if (!verdict) {
    const passes = await activePasses();
    const sess = await getSession();
    const goal = (sess && sess.goal) || settings.projectContext;
    if (kind !== "search") meta = await fetchMeta(value);
    try {
      const raw = await callClaude(
        settings.fastModel,
        screenSystemPrompt(passes, goal),
        describeTarget(kind, value, meta, pageContext),
        300
      );
      verdict = parseJson(raw);
      verdict.source = "model";
      if (verdict.decision === "allow") await writeCache(key, verdict);
    } catch (e) {
      const failOpen = settings.failMode === "open";
      verdict = {
        decision: failOpen ? "allow" : "ask",
        confidence: 0,
        reason: failOpen
          ? "Could not reach the checker, letting this through."
          : "The checker could not be reached. Tell me what you are looking for and I will pass it along.",
        topic: "checker offline",
        source: "error",
        error: String(e.message || e)
      };
    }
  }

  const eventId = await record(kind, value, verdict, {
    title: meta?.title || pageContext?.linkText || "",
    from: pageContext?.fromUrl || "",
    engine: pageContext?.engine || ""
  });

  return { ...verdict, eventId };
}

async function appeal({ kind, value, reason, pageContext }) {
  const passes = await activePasses();
  const meta = kind === "search" ? null : await fetchMeta(value);
  const userText =
    describeTarget(kind, value, meta, pageContext) + `\n\nHis reason for wanting this:\n"${reason}"`;

  let result;
  try {
    const raw = await callClaude(settings.deepModel, appealSystemPrompt(passes), userText, 400);
    result = parseJson(raw);
  } catch {
    result = {
      decision: "escalate",
      reason: "I could not reach the checker, so I sent this to your dad instead.",
      topic: "checker offline"
    };
  }

  if (result.decision === "allow") {
    await grantPass(result.topic, result.ttl_minutes);
    await writeCache(cacheKey(kind, value), {
      decision: "allow", reason: result.reason, topic: result.topic
    });
    await awardToken("good appeal");
  }

  if (result.decision === "escalate") {
    await addPending({ kind, target: value, appeal: reason, topic: result.topic });
  }

  const eventId = await logEvent({
    kind,
    target: value,
    host: kind === "search" ? "" : hostOf(value),
    decision: result.decision,
    source: "appeal",
    appeal: reason,
    reason: result.reason || "",
    topic: result.topic || "",
    title: meta?.title || ""
  });

  return { ...result, eventId };
}

/* ---------- suggestions ----------
 * The popup asks for things worth looking at next. Anything this
 * returns is pre-approved into the cache, so clicking a suggestion
 * never runs into the gate.
 */

async function recentInterests(limit = 25) {
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  const events = await readDays(logDays.slice(0, 3));
  const seen = new Set();
  const out = [];
  for (const e of events) {
    if (e.decision !== "allow") continue;
    const label = e.kind === "search" ? `searched "${e.target}"` : e.title || e.host;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

function suggestSystemPrompt(trusted, recent, goal) {
  return `You suggest what a curious ${settings.kidAge}-year-old named ${settings.kidName} could look at next. Keep him moving forward on today's session rather than drifting off it.

Today's session goal:
"${goal}"

Background interests: ${settings.projectContext}

What he has looked at in the last few days:
${recent.length ? recent.map((r) => "- " + r).join("\n") : "- nothing yet"}

Sites his parent already trusts: ${trusted.join(", ")}

Write searches the way he would type them, but sharper, and keep every one tied to today's session goal. Part of the job is showing him what a good search looks like, so favor specific wording over vague wording, and keep each under about eight words. Do not repeat things he has already looked at; go one step further along the goal.

Only give a URL if you are confident the page exists and is stable. Prefer the trusted sites above, and prefer section or topic pages over deep links that go stale. If you are not sure a URL is real, leave it out and give a search instead.

Every suggestion needs a "why" written to him directly: one short sentence saying what he will get out of it. No praise, no exclamation marks.

Reply with JSON only:
{"searches":[{"q":"...","why":"..."}],"resources":[{"title":"...","url":"https://...","why":"..."}]}
Give 4 searches and up to 4 resources.`;
}

function refineSystemPrompt(trusted, goal) {
  return `${settings.kidName}, age ${settings.kidAge}, wants to find something out and has told you roughly what it is. Turn that into searches that will actually work, and point him at good starting places.

Today's session goal:
"${goal}"

Background interests: ${settings.projectContext}

Sites his parent already trusts: ${trusted.join(", ")}

He may attach a photo of what he is working on, because he does not always have the words for it. If there is a photo, look at it carefully and let it drive your answer: name what you see, and turn "I want to make the LED light up" plus a picture of his parts into searches and starting points that fit exactly what is in front of him.

Teach by rewriting. If his wording is vague, show him sharper wording and say in one sentence what you changed and why. That tip is the most useful thing you can give him, so make it concrete.

Only give a URL if you are confident it exists and is stable. Otherwise give a search instead.

If what he is asking for is sexual content, graphic violence, self-harm, drugs, gambling, hate, unmoderated adult chat, or anything built to take money or personal details from a child, set ok to false, leave both lists empty, and say plainly in "note" that this one is not something you can help with. If it is safe but clearly unrelated to today's session goal, also set ok to false and say in "note" that it's not part of today's session and a grown-up can change the session. Otherwise set ok to true and help him properly, keeping suggestions tied to the goal.

Reply with JSON only:
{"ok":true,"note":"one sentence tip about his wording, or the refusal","searches":[{"q":"...","why":"..."}],"resources":[{"title":"...","url":"https://...","why":"..."}]}
Give up to 4 searches and up to 3 resources.`;
}

async function urlIsReal(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "omit", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function preapprove(data) {
  const { cache = {} } = await chrome.storage.local.get("cache");
  const expiresAt = Date.now() + Math.max(settings.cacheTtlMinutes, 1440) * 60000;
  for (const s of data.searches || []) {
    cache[cacheKey("search", s.q)] = { decision: "allow", reason: "", source: "suggested", topic: "suggested", expiresAt };
  }
  for (const r of data.resources || []) {
    cache[cacheKey("link", r.url)] = { decision: "allow", reason: "", source: "suggested", topic: "suggested", expiresAt };
  }
  await chrome.storage.local.set({ cache });
}

async function buildSuggestions({ wanted, force, image }) {
  const trusted = (settings.allowlist || []).slice(0, 20);
  const recent = await recentInterests();
  const sess = await getSession();
  const goal = (sess && sess.goal) || settings.projectContext;

  if (!wanted) {
    const stamp = (goal || "").length + ":" + dayKey() + ":" + recent.length;
    const { suggestions } = await chrome.storage.local.get("suggestions");
    if (!force && suggestions && suggestions.stamp === stamp && Date.now() - suggestions.ts < 6 * 3600000) {
      return { ...suggestions.data, cached: true };
    }
    const raw = await callClaude(settings.fastModel, suggestSystemPrompt(trusted, recent, goal), "What should he look at next?", 900);
    const data = parseJson(raw);
    data.resources = await filterReal(data.resources);
    await preapprove(data);
    await chrome.storage.local.set({ suggestions: { stamp, ts: Date.now(), data } });
    await logEvent({ kind: "suggest", target: "next steps", decision: "allow", source: "popup", reason: "", topic: "suggestions" });
    return data;
  }

  const content = [];
  if (image && image.data) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mime || "image/jpeg", data: image.data } });
  }
  content.push({ type: "text", text: wanted ? `He wants to find out: "${wanted}"` : "He sent a photo of what he is working on. Help him with what it shows." });

  const raw = await callClaude(settings.deepModel, refineSystemPrompt(trusted, goal), content, 1100);
  const data = parseJson(raw);
  if (data.ok === false) {
    await logEvent({ kind: "suggest", target: wanted || "(photo)", decision: "block", source: "popup", reason: data.note || "" });
    return { ok: false, note: data.note, searches: [], resources: [] };
  }
  data.resources = await filterReal(data.resources);
  await preapprove(data);
  await logEvent({ kind: "suggest", target: (wanted || "(photo)") + (image ? " +photo" : ""), decision: "allow", source: "popup", reason: data.note || "" });
  return data;
}

async function filterReal(resources) {
  if (!Array.isArray(resources) || !resources.length) return [];
  const checks = await Promise.all(resources.map((r) => urlIsReal(r.url)));
  return resources.filter((_, i) => checks[i]);
}

/* ---------- dad mode ----------
 * A PIN-gated window where the gate stands down so a parent can browse
 * freely alongside the kid, and any configured game is playable without a
 * ticket. Requires a parent PIN to exist, so the kid can't switch it on.
 */

async function dadActive() {
  const { dadMode } = await chrome.storage.local.get("dadMode");
  return !!(dadMode && dadMode.until > Date.now());
}
async function dadUntil() {
  const { dadMode } = await chrome.storage.local.get("dadMode");
  return dadMode && dadMode.until > Date.now() ? dadMode.until : 0;
}
async function startDad(pin) {
  if (!settings.parentPin) return { ok: false, reason: "Set a parent PIN in settings first." };
  if (pin !== settings.parentPin) return { ok: false, reason: "That PIN doesn't match." };
  const until = Date.now() + (settings.dadMinutes || 60) * 60000;
  await chrome.storage.local.set({ dadMode: { until } });
  await logEvent({ kind: "dad", target: "browsing opened", decision: "allow", source: "dad", reason: "Dad mode on" });
  return { ok: true, until };
}
async function endDad() {
  await chrome.storage.local.set({ dadMode: null });
  await logEvent({ kind: "dad", target: "browsing closed", decision: "allow", source: "dad", reason: "Dad mode off" });
  return { ok: true };
}

/* ---------- sessions ----------
 * A session is a stated goal a grown-up sets with the child. It frames what
 * the gate treats as relevant. Starting or changing one needs the parent PIN,
 * so a child can't point a session somewhere off-limits. With no active
 * session (and sessions required), browsing is held until one is started.
 */

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session && session.goal ? session : null;
}

async function needsSession() {
  if (!settings.enabled || !settings.requireSession) return false;
  return !(await getSession());
}

async function startSession(pin, goal) {
  if (!settings.parentPin) return { ok: false, reason: "A grown-up needs to set a PIN in settings first." };
  if (pin !== settings.parentPin) return { ok: false, reason: "That PIN doesn't match." };
  goal = String(goal || "").trim().slice(0, 300);
  if (goal.length < 3) return { ok: false, reason: "Say what this session is for." };

  const prev = await getSession();
  const { sessionHistory = [] } = await chrome.storage.local.get("sessionHistory");
  if (prev) sessionHistory.unshift({ goal: prev.goal, startedAt: prev.startedAt, endedAt: Date.now() });

  const session = { id: "s" + Date.now(), goal, startedAt: Date.now() };
  // a new frame means old per-topic decisions no longer apply
  await chrome.storage.local.set({ session, sessionHistory: sessionHistory.slice(0, 100), passes: [], cache: {} });
  await logEvent({ kind: "session", target: goal, decision: "allow", source: "session", reason: "Session started" });
  Cloud.mirrorSession({ id: session.id, goal, active: true, startedAt: session.startedAt });
  return { ok: true, session };
}

async function endSession() {
  const prev = await getSession();
  if (prev) {
    const { sessionHistory = [] } = await chrome.storage.local.get("sessionHistory");
    sessionHistory.unshift({ goal: prev.goal, startedAt: prev.startedAt, endedAt: Date.now() });
    await chrome.storage.local.set({ sessionHistory: sessionHistory.slice(0, 100), session: null });
    await logEvent({ kind: "session", target: prev.goal, decision: "allow", source: "session", reason: "Session ended" });
    Cloud.mirrorSession({ id: prev.id, goal: prev.goal, active: false, startedAt: prev.startedAt, endedAt: Date.now() });
  } else {
    await chrome.storage.local.set({ session: null });
  }
  return { ok: true };
}

async function sessionState() {
  return {
    requireSession: !!settings.requireSession,
    hasPin: !!settings.parentPin,
    needsSession: await needsSession(),
    session: await getSession()
  };
}

/* ---------- side quests: tokens, questions, game tickets ----------
 * Investigation earns tokens. A token buys a shot at a game, gated by a
 * question generated from what he actually read, so it can't be searched
 * for. Passing mints a single-use ticket the game window checks on load.
 */

async function getGameState() {
  const { gameState = {} } = await chrome.storage.local.get("gameState");
  return {
    tokens: 0,
    readingBank: 0,
    credited: {},
    cooldownUntil: 0,
    quest: null,
    ticket: null,
    lifetimeTokens: 0,
    ...gameState
  };
}

async function saveGameState(s) {
  await chrome.storage.local.set({ gameState: s });
  return s;
}

async function awardToken(reason) {
  if (!settings.gamesEnabled) return;
  const s = await getGameState();
  const max = settings.maxTokens || 3;
  if (s.tokens >= max) return;
  s.tokens += 1;
  s.lifetimeTokens = (s.lifetimeTokens || 0) + 1;
  await saveGameState(s);
  await logEvent({ kind: "token", target: reason, decision: "allow", source: "reward", reason: "Earned a game token" });
}

async function accrueReading(eventId, seconds) {
  if (!settings.gamesEnabled || !eventId) return;
  const s = await getGameState();
  const already = s.credited[eventId] || 0;
  const delta = Math.max(0, seconds - already);
  if (!delta) return;
  s.credited[eventId] = seconds;
  s.readingBank += delta;
  const per = settings.secondsPerToken || 600;
  const max = settings.maxTokens || 3;
  let minted = false;
  while (s.readingBank >= per && s.tokens < max) {
    s.readingBank -= per;
    s.tokens += 1;
    s.lifetimeTokens = (s.lifetimeTokens || 0) + 1;
    minted = true;
  }
  if (s.tokens >= max) s.readingBank = Math.min(s.readingBank, per);
  if (Object.keys(s.credited).length > 300) s.credited = { [eventId]: seconds };
  await saveGameState(s);
  if (minted) await logEvent({ kind: "token", target: "reading", decision: "allow", source: "reward", reason: "Earned a game token by reading" });
}

async function questSource() {
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  const events = await readDays(logDays.slice(0, 3));
  const pages = events.filter(
    (e) => e.decision === "allow" && e.kind !== "search" && (e.seconds || 0) >= 30 && (e.title || e.host)
  );
  const searches = events.filter((e) => e.decision === "allow" && e.kind === "search" && e.target);
  const pool = pages.length ? pages : searches;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * Math.min(pool.length, 8))];
}

function questGenPrompt() {
  return `Write ONE short question that checks whether ${settings.kidName}, age ${settings.kidAge}, actually read and understood something he looked at online. His parent uses this to make sure a game reward is earned by real reading, not by opening tabs.

Ask "why", "how", or "what would happen if". Never ask for a definition or a fact he could copy off the page. The question should be answerable by a kid who read and understood, and unanswerable by one who did not. One sentence, plain words, no preamble.

Also write a private grading note describing what a kid who understood would say. The child never sees this note.

Reply with JSON only:
{"question":"...","expects":"..."}`;
}

function judgePrompt(question, expects) {
  return `You are grading a ${settings.kidAge}-year-old's answer, and you grade generously. Perfect wording and spelling do not matter. Pass if he shows he genuinely engaged with the idea, even loosely. Fail only if the answer is empty, off topic, or an obvious blind guess.

Question he was asked: ${question}
What a real answer shows: ${expects}

Reply with JSON only:
{"correct":true|false,"hint":"if wrong, one warm sentence nudging him back to the idea without giving the answer; empty string if right"}`;
}

async function startQuest() {
  if (!settings.gamesEnabled) return { error: "Side quests are off." };
  const s = await getGameState();
  if (s.quest) {
    return { question: s.quest.question, sourceLabel: s.quest.sourceLabel, attemptsLeft: s.quest.attemptsLeft };
  }
  if (Date.now() < s.cooldownUntil) {
    return { cooldown: Math.ceil((s.cooldownUntil - Date.now()) / 60000) };
  }
  if (s.tokens < 1) return { error: "No tokens yet. Read a bit more and one will show up." };

  const src = await questSource();
  if (!src) return { error: "Look a few things up first, then I can make you a quest about them." };

  let context = "";
  let sourceLabel = "";
  if (src.kind === "search") {
    context = `He searched for "${src.target}".`;
    sourceLabel = `your search: ${src.target}`;
  } else {
    sourceLabel = src.title || src.host;
    const meta = await fetchMeta(src.target).catch(() => null);
    context =
      `He read a page titled "${src.title || src.host}".` +
      (meta?.excerpt ? `\nSome of what was on it:\n${meta.excerpt}` : "");
  }

  let gen;
  try {
    gen = parseJson(await callClaude(settings.fastModel, questGenPrompt(), context, 300));
  } catch {
    return { error: "Could not build a quest right now. Try again in a second." };
  }

  s.quest = {
    id: "q" + Date.now(),
    question: gen.question,
    expects: gen.expects || "",
    sourceLabel,
    attemptsLeft: 3
  };
  await saveGameState(s);
  return { question: s.quest.question, sourceLabel, attemptsLeft: 3 };
}

async function answerQuest(answer) {
  const s = await getGameState();
  if (!s.quest) return { error: "No quest running." };

  let verdict;
  try {
    verdict = parseJson(
      await callClaude(
        settings.fastModel,
        judgePrompt(s.quest.question, s.quest.expects),
        `His answer: "${answer}"`,
        200
      )
    );
  } catch {
    verdict = { correct: false, hint: "I couldn't check that one. Try saying it another way." };
  }

  if (verdict.correct) {
    s.tokens = Math.max(0, s.tokens - 1);
    s.ticket = { game: "arcade", expiresAt: Date.now() + 5 * 60000 };
    const label = s.quest.sourceLabel;
    s.quest = null;
    await saveGameState(s);
    await logEvent({ kind: "quest", target: label, decision: "allow", source: "quest", reason: "Answered and unlocked a game" });
    return { correct: true, game: "arcade" };
  }

  s.quest.attemptsLeft -= 1;
  if (s.quest.attemptsLeft <= 0) {
    const label = s.quest.sourceLabel;
    s.quest = null;
    s.cooldownUntil = Date.now() + (settings.questCooldownMinutes || 10) * 60000;
    await saveGameState(s);
    await logEvent({ kind: "quest", target: label, decision: "ask", source: "quest", reason: "Ran out of tries" });
    return { correct: false, over: true, hint: verdict.hint || "", cooldown: settings.questCooldownMinutes || 10 };
  }

  await saveGameState(s);
  return { correct: false, attemptsLeft: s.quest.attemptsLeft, hint: verdict.hint || "" };
}

async function questState() {
  const s = await getGameState();
  const onCooldown = Date.now() < s.cooldownUntil;
  const canOffer = settings.gamesEnabled && s.tokens > 0 && !onCooldown;
  return {
    enabled: !!settings.gamesEnabled,
    tokens: s.tokens,
    readingBank: s.readingBank,
    secondsPerToken: settings.secondsPerToken || 600,
    maxTokens: settings.maxTokens || 3,
    questActive: !!s.quest,
    question: s.quest?.question || "",
    sourceLabel: s.quest?.sourceLabel || "",
    attemptsLeft: s.quest?.attemptsLeft || 0,
    cooldownMinutes: onCooldown ? Math.ceil((s.cooldownUntil - Date.now()) / 60000) : 0,
    // fanfare only; play is available whenever tokens > 0
    offer: canOffer && Math.random() < 0.6
  };
}

async function consumeTicket(game) {
  const s = await getGameState();
  if (s.ticket && s.ticket.game === game && s.ticket.expiresAt > Date.now()) {
    s.ticket = null;
    await saveGameState(s);
    return { ok: true };
  }
  return { ok: false };
}

/* ---------- game builder ----------
 * Turns a plain request plus the current game code into new game code. The
 * model writes against a fixed engine, so common asks map to robust built-in
 * abilities and only unusual ones need the onUpdate hook. Output is code
 * only; the builder tests it in the sandbox before keeping it.
 */

function builderSystemPrompt() {
  return `You help a ${settings.kidAge}-year-old named ${settings.kidName} change a side-scrolling platform game by editing its code. You are given the current game as a JavaScript object literal and a plain-language request. Return the FULL updated object literal and nothing else: no explanation, no markdown fences, no "here is" preamble. It must be valid JavaScript that evaluates to one object.

The object has these fields:
- meta: { name: string }
- world: { length: number, groundY: number }   // groundY is around 280; length is how long the level is
- theme: { sky, ground, player }                // hex colors
- player: { doubleJump, fly, dash, weapon, stompKill }  // booleans; these are real built-in abilities, prefer them
- platforms: [ { x, y, w, h } ]                  // floating platforms; y less than groundY sits above the ground
- enemies: [ { x, y, type, speed, dir } ]        // type is "walker", "flyer", or "shooter"; y near 258 sits on the ground
- coins: [ { x, y } ]
- powerups: [ { x, y, kind } ]                   // kind is "grow" (bigger, takes an extra hit), "fly", "fire" (shoot fireballs), "speed", or "heart" (+1 heart). Place them on platforms or along the path.
- goal: { x }                                    // the finish flag, near world.length
- knobs: [ { id, label, min, max, step, value } ] // sliders the kid can tune live; always keep gravity, jump, speed, hearts
- hooks: { onUpdate: function(api){ ... } }       // OPTIONAL, only for things the fields above can't express

Mapping common requests:
- "Let me fly" -> player.fly true. "Double jump" -> player.doubleJump true. "Give me a laser/gun/fireballs/shooting" -> player.weapon true. "Dash" -> player.dash true.
- "Power-ups", "make me bigger", "special powers", "power up that makes me fly/shoot" -> add entries to powerups with the right kind. For "bigger" use kind "grow". For fireballs use "fire". Scatter a handful across the level so he finds them.
- "More enemies" adds enemy entries spread across the level. "Bouncier" raises the jump knob value. "Harder" adds enemies or raises their speed.

Rules:
- Keep everything that already exists unless the request implies changing it. This is an edit, not a rewrite.
- Keep coordinates inside the world. Keep it fun and beatable for a young kid.
- Only add an onUpdate hook for genuinely novel behavior. Inside it you have api.player, api.enemies, api.coins, api.input, api.spawnBullet(x,y,vx,vy,fromPlayer), api.knob(id,default), api.W, api.H, api.time. Never write loops that could run forever.
- Keep it well under 400 lines.

Output format, follow exactly:
- Return ONE JavaScript object literal and nothing else.
- No comments, no "..." or ellipsis, no trailing commas, no extra text. Every array element must be complete.
- Functions are allowed ONLY as values inside the hooks field.

If the request cannot be done in a flat 2D side-scroller (for example making it 3D, or first-person, or adding online multiplayer), do NOT write code. Instead reply with exactly one line:
CANNOT: <one friendly sentence for ${settings.kidName} saying it can't be done here and suggesting something that can>`;
}

async function buildGame({ request, code }) {
  if (!settings.apiKey) return { error: "No API key set in settings." };
  const user = `Current game:\n${code}\n\nHis request: "${request}"\n\nReturn the full updated object literal only.`;
  let raw;
  try {
    raw = await callClaude(settings.deepModel, builderSystemPrompt(), user, 3000);
  } catch (e) {
    return { error: "The game maker could not be reached. " + (e.message || "") };
  }
  const trimmed = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  if (/^CANNOT:/i.test(trimmed)) {
    const note = trimmed.replace(/^CANNOT:\s*/i, "").trim().slice(0, 240);
    await logEvent({ kind: "build", target: request, decision: "ask", source: "builder", reason: "Not possible in this engine" });
    return { declined: true, note: note || "That one can't be done in this kind of game." };
  }
  let out = trimmed;
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start === -1 || end === -1) return { error: "The game maker sent something I couldn't use. Try wording it differently." };
  out = out.slice(start, end + 1);
  await logEvent({ kind: "build", target: request, decision: "allow", source: "builder", reason: "Customized a game" });
  return { code: out, note: "Done. Give it a try." };
}

/* ---------- messaging ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false;

  (async () => {
    try {
      switch (msg.type) {
        case "EVALUATE":
          sendResponse(await evaluate(msg));
          break;
        case "APPEAL":
          sendResponse(await appeal(msg));
          break;
        case "SETTINGS": {
          const s = await loadSettings();
          pollCloudVerdicts().catch(() => {});   // opportunistic: catch decisions on open
          const cs = await Cloud.state();
          const cloud = { paired: await Cloud.isPaired(), householdId: cs.householdId || null, kidName: cs.kidName || "" };
          sendResponse({ ...s, dadActive: await dadActive(), dadUntil: await dadUntil(), needsSession: await needsSession(), session: await getSession(), cloud });
          break;
        }
        case "PAIR":
          try {
            const info = await Cloud.pair(msg.code, msg.label);
            sendResponse({ ok: true, ...info });
          } catch (e) {
            sendResponse({ ok: false, error: e.code || String(e.message || e) });
          }
          break;
        case "UNPAIR":
          await Cloud.unpair();
          sendResponse({ ok: true });
          break;
        case "CLOUD_STATE": {
          const cs = await Cloud.state();
          sendResponse({
            paired: await Cloud.isPaired(),
            householdId: cs.householdId || null,
            kidName: cs.kidName || "",
            projectContext: cs.projectContext || ""
          });
          break;
        }
        case "SESSION_STATE":
          sendResponse(await sessionState());
          break;
        case "START_SESSION":
          sendResponse(await startSession(msg.pin, msg.goal));
          break;
        case "END_SESSION":
          sendResponse(await endSession());
          break;
        case "START_DAD":
          sendResponse(await startDad(msg.pin));
          break;
        case "END_DAD":
          sendResponse(await endDad());
          break;
        case "CHECK_DAD":
          sendResponse({ active: await dadActive(), until: await dadUntil() });
          break;
        case "HEARTBEAT":
          if (msg.id) {
            await patchEvent(msg.id, { seconds: msg.seconds, title: msg.title || undefined });
            await accrueReading(msg.id, msg.seconds || 0);
          }
          sendResponse({ ok: true });
          break;
        case "ESCALATE":
          await addPending({ kind: msg.kind, target: msg.value, appeal: msg.reason || "" });
          sendResponse({ ok: true });
          break;
        case "READ_LOG":
          sendResponse(await readDays(msg.days));
          break;
        case "QUEST_STATE":
          sendResponse(await questState());
          break;
        case "START_QUEST":
          sendResponse(await startQuest());
          break;
        case "ANSWER_QUEST":
          sendResponse(await answerQuest(msg.answer));
          break;
        case "CONSUME_TICKET":
          sendResponse(await consumeTicket(msg.game));
          break;
        case "BUILD_GAME":
          sendResponse(await buildGame(msg));
          break;
        case "SUGGEST":
          sendResponse(await buildSuggestions({ wanted: msg.wanted, force: msg.force, image: msg.image }));
          break;
        case "ARCHIVE_NOW":
          sendResponse(await archiveNow(true));
          break;
        default:
          sendResponse({ error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ decision: "ask", reason: "Something broke on my end. Try again.", error: String(e.message || e) });
    }
  })();
  return true;
});
