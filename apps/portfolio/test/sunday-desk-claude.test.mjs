// Request shaping and stream parsing for the Claude sidebar.
//
// The per-model branching matters because getting it wrong is a 400, not a
// worse answer: Haiku 4.5 rejects `effort`, and Fable rejects any explicit
// thinking config because thinking is always on there.
//
//   node test/sunday-desk-claude.test.mjs

import {
  buildRequest,
  capabilities,
  estimateCost,
  formatCost,
  modelById,
  streamMessage,
} from "../src/tools/sunday-desk/claude.js";
import { cleanKey, looksLikeKey, maskKey } from "../src/tools/sunday-desk/apikey.js";

let pass = 0, fail = 0;
const t = (label, cond, detail) => {
  if (cond) { console.log("  PASS", label); pass++; }
  else { console.log("  FAIL", label, detail !== undefined ? "→ " + JSON.stringify(detail) : ""); fail++; }
};
const base = { system: "s", messages: [{ role: "user", content: "hi" }] };

console.log("per-model request shaping:");
const sonnet = buildRequest({ ...base, model: "claude-sonnet-5" });
t("Sonnet 5 uses adaptive thinking", sonnet.thinking?.type === "adaptive", sonnet.thinking);
t("Sonnet 5 sends no budget_tokens (removed, 400s)", !("budget_tokens" in (sonnet.thinking || {})));
t("Sonnet 5 sets effort inside output_config", sonnet.output_config?.effort === "medium", sonnet.output_config);

const opus = buildRequest({ ...base, model: "claude-opus-5" });
t("Opus 5 uses adaptive thinking", opus.thinking?.type === "adaptive", opus.thinking);

const haiku = buildRequest({ ...base, model: "claude-haiku-4-5" });
t("Haiku 4.5 sends NO thinking block", haiku.thinking === undefined, haiku.thinking);
t("Haiku 4.5 sends NO effort (it errors there)", haiku.output_config === undefined, haiku.output_config);

const fable = buildRequest({ ...base, model: "claude-fable-5-1" });
t("Fable 5.1 sends NO explicit thinking (always on, config 400s)", fable.thinking === undefined, fable.thinking);
t("Fable 5.1 still sets effort", fable.output_config?.effort === "medium", fable.output_config);

console.log("\nweb search tool version:");
const sonnetWeb = buildRequest({ ...base, model: "claude-sonnet-5", webSearch: true });
t("Sonnet 5 gets the dynamic-filtering variant",
  sonnetWeb.tools?.[0]?.type === "web_search_20260209", sonnetWeb.tools);
const haikuWeb = buildRequest({ ...base, model: "claude-haiku-4-5", webSearch: true });
t("Haiku 4.5 gets the basic variant",
  haikuWeb.tools?.[0]?.type === "web_search_20250305", haikuWeb.tools);
t("no tools unless web search is on", buildRequest({ ...base, model: "claude-sonnet-5" }).tools === undefined);
t("streaming is always on", sonnet.stream === true);

console.log("\nmodel ids are exact (no invented date suffixes):");
["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5", "claude-fable-5-1"].forEach((id) => {
  t(`${id} resolves and has no date suffix`, modelById(id).id === id && !/\d{8}$/.test(id));
});
t("an unknown id falls back to the default rather than throwing", modelById("nope").id === "claude-sonnet-5");

console.log("\ncost estimate:");
const c = estimateCost("claude-sonnet-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 });
t("1M in + 1M out on Sonnet 5 is $12", Math.abs(c - 12) < 0.001, c);
const cached = estimateCost("claude-sonnet-5", { input_tokens: 0, cache_read_input_tokens: 1_000_000 });
t("1M cache-read tokens bill at a tenth of input", Math.abs(cached - 0.2) < 0.001, cached);
t("tiny amounts keep four decimals", formatCost(0.0004) === "$0.0004", formatCost(0.0004));
t("zero reads as $0.00", formatCost(0) === "$0.00");

console.log("\nkey validation:");
t("accepts a plausible key", looksLikeKey("sk-ant-api03-" + "a".repeat(40)));
t("rejects an OpenAI-style key", !looksLikeKey("sk-proj-" + "a".repeat(40)));
t("rejects empty", !looksLikeKey(""));
t("rejects a bare prefix with nothing after it", !looksLikeKey("sk-ant-"));
t("mask never shows the middle", !maskKey("sk-ant-api03-SECRETSECRET1234").includes("SECRETSECRET"));

/* The previous version of this check asserted a character class for the body
   of the key, and the test used "aaaa..." — which agreed with the regex
   instead of testing it, so a real key that contained anything else was
   rejected in production while the suite stayed green. These cases exist so
   that cannot happen again: the body is not ours to police. */
const BODY_CHARS = ["+", "/", "=", ".", "~", "*", "!", "$", "%", "@", "#", "(", ")", "|", ":", ";", "?"];
for (const ch of BODY_CHARS) {
  t(`accepts a key whose body contains ${JSON.stringify(ch)}`,
    looksLikeKey("sk-ant-api03-" + "a".repeat(20) + ch + "b".repeat(20)));
}
t("accepts an admin key", looksLikeKey("sk-ant-admin01-" + "a".repeat(40)));
t("accepts mixed case, digits, dashes and underscores together",
  looksLikeKey("sk-ant-api03-aB3_x-Y9" + "z".repeat(30)));

/* A key pasted out of a web page arrives with passengers. Every one of these
   is invisible in a password input, and any single one of them would both
   fail the check and, if stored, produce an invalid HTTP header. */
t("survives a trailing newline", looksLikeKey("sk-ant-api03-" + "a".repeat(40) + "\n"));
t("survives surrounding spaces", looksLikeKey("  sk-ant-api03-" + "a".repeat(40) + "  "));
t("survives a non-breaking space in the middle",
  looksLikeKey("sk-ant-api03-" + "a".repeat(20) + "\u00A0" + "b".repeat(20)));
t("survives a zero-width space in the middle",
  looksLikeKey("sk-ant-api03-" + "a".repeat(20) + "\u200B" + "b".repeat(20)));
t("survives a byte-order mark", looksLikeKey("\uFEFFsk-ant-api03-" + "a".repeat(40)));
t("cleaning removes the passengers rather than keeping them",
  cleanKey(" sk-ant-api03-aaa\u200Bbbb\n") === "sk-ant-api03-aaabbb");
t("cleaning a non-string is empty, not a crash", cleanKey(null) === "" && cleanKey(undefined) === "");
t("a cleaned key is safe to put in a header",
  /^[\x20-\x7E]+$/.test(cleanKey("sk-ant-api03-aaa\u200Bbbb\n")));

console.log("\nSSE parsing (frames deliberately split mid-chunk):");
const frames = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Start "}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"server_tool_use","name":"web_search"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Judkins."}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n',
].join("");
// Chop the stream into 7-byte pieces so almost every frame straddles a boundary.
const pieces = [];
for (let i = 0; i < frames.length; i += 7) pieces.push(frames.slice(i, i + 7));
const enc = new TextEncoder();
let idx = 0;
globalThis.fetch = async () => ({
  ok: true,
  body: { getReader: () => ({ read: async () =>
    idx < pieces.length ? { done: false, value: enc.encode(pieces[idx++]) } : { done: true } }) },
});

let searched = false;
const out = await streamMessage({
  apiKey: "sk-ant-test", model: "claude-sonnet-5", ...base,
  onSearch: () => { searched = true; },
});
t("reassembles text across chunk boundaries", out.text === "Start Judkins.", out.text);
t("merges usage from message_start and message_delta",
  out.usage.input_tokens === 11 && out.usage.output_tokens === 7, out.usage);
t("reports the stop reason", out.stopReason === "end_turn", out.stopReason);
t("notices a server-side web search", searched);
t("prices the turn", out.cost > 0, out.cost);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
