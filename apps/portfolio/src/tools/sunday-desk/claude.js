// ---------------------------------------------------------------------------
// Claude, called straight from the browser with the user's own key.
//
// The Anthropic API blocks cross-origin browser calls unless you opt in with
// `anthropic-dangerous-direct-browser-access`. Verified against the live API:
// without that header the preflight returns 400 and no allow-origin; with it,
// 200 and `access-control-allow-origin: *`.
//
// Opting in is deliberate. It means every user's key stays in their own
// browser and never reaches this site's server or database — nobody here is
// custodian of anyone's billable credential. The cost is that the key is
// readable by script on the page, which is why it is a scoped, revocable,
// spend-capped API key and not an account password.
// ---------------------------------------------------------------------------

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

/* Prices are per million tokens, for showing a running estimate. Cache reads
   bill at roughly a tenth of the input rate and cache writes at ~1.25x, so the
   number shown is an estimate and is labelled as one. */
export const MODELS = [
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "The default. Fast and cheap enough to leave running.",
    ctx: "1M",
    price: { in: 2, out: 10 },
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    blurb: "Better judgement on messy questions. 2.5x the price.",
    ctx: "1M",
    price: { in: 5, out: 25 },
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Cheapest and quickest. Good for lookups, not analysis.",
    ctx: "200K",
    price: { in: 1, out: 5 },
  },
  {
    id: "claude-fable-5-1",
    label: "Fable 5.1",
    blurb: "Most capable, 5x Sonnet's output price. Not on every account.",
    ctx: "1M",
    price: { in: 10, out: 50 },
  },
];

export const DEFAULT_MODEL = "claude-sonnet-5";
export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

/* The request shape is not uniform across these models, and getting it wrong
   is a 400 rather than a degraded answer:
     - Haiku 4.5 predates adaptive thinking and rejects `effort`; it takes the
       older budget_tokens form, which we simply don't use here.
     - Fable 5.1 has thinking always on and rejects any explicit thinking
       config, so the parameter is omitted entirely.
     - Sonnet 5 and Opus 5 take adaptive thinking plus an effort level.
   Web search has two tool versions; the older models only know the basic one. */
export const capabilities = (id) => {
  if (id === "claude-haiku-4-5") {
    return { adaptiveThinking: false, effort: false, webSearchType: "web_search_20250305" };
  }
  if (id === "claude-fable-5-1") {
    return { adaptiveThinking: "always-on", effort: true, webSearchType: "web_search_20260209" };
  }
  return { adaptiveThinking: true, effort: true, webSearchType: "web_search_20260209" };
};

const authHeaders = (apiKey) => ({
  "content-type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": VERSION,
  "anthropic-dangerous-direct-browser-access": "true",
});

export class ClaudeError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const explain = (status, body) => {
  const msg = body?.error?.message || "";
  if (status === 401) return new ClaudeError("auth", "That API key was rejected. Check it in Setup.");
  if (status === 403) return new ClaudeError("auth", "That key isn't allowed to call this model.");
  if (status === 429) return new ClaudeError("rate", "Rate limited by Anthropic. Wait a moment and retry.");
  if (status === 400 && /credit|balance/i.test(msg)) {
    return new ClaudeError("billing", "Anthropic reports no credit on this key.");
  }
  if (status === 400) return new ClaudeError("request", msg || "Anthropic rejected the request.");
  return new ClaudeError("other", msg || `Anthropic returned ${status}.`);
};

/* Which models this particular key can actually use. Gating the picker on a
   live answer beats guessing: Fable is not on every account, and an account
   configured for zero data retention cannot use it at all. */
export const listModels = async (apiKey) => {
  const res = await fetch(`${API}/models?limit=100`, { headers: authHeaders(apiKey) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw explain(res.status, body);
  const ids = new Set((body?.data || []).map((m) => m.id));
  return MODELS.filter((m) => ids.has(m.id));
};

export const estimateCost = (model, usage) => {
  const p = modelById(model).price;
  const inTok = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  const cacheWrite = usage?.cache_creation_input_tokens || 0;
  return (
    (inTok * p.in + cacheRead * p.in * 0.1 + cacheWrite * p.in * 1.25 + outTok * p.out) / 1_000_000
  );
};

export const formatCost = (usd) => {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};

/* Build the request body for one turn. Kept separate from the transport so the
   per-model branching above can be tested without touching the network. */
export const buildRequest = ({ model, system, messages, webSearch, maxTokens = 4096 }) => {
  const caps = capabilities(model);
  const body = { model, max_tokens: maxTokens, system, messages, stream: true };
  // Fable has thinking on permanently and 400s on any explicit config.
  if (caps.adaptiveThinking === true) body.thinking = { type: "adaptive" };
  // Medium keeps a sidebar responsive; the default is high, which is slower
  // and dearer than a roster question warrants.
  if (caps.effort) body.output_config = { effort: "medium" };
  if (webSearch) {
    body.tools = [{ type: caps.webSearchType, name: "web_search", max_uses: 5 }];
  }
  return body;
};

/* Stream a turn. onDelta receives text as it arrives; the promise resolves with
   the assembled text plus usage, so the caller can price the turn. */
export const streamMessage = async ({
  apiKey,
  model,
  system,
  messages,
  webSearch,
  maxTokens,
  onDelta,
  onSearch,
  signal,
}) => {
  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(buildRequest({ model, system, messages, webSearch, maxTokens })),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw explain(res.status, body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage = {};
  let stopReason = null;

  // SSE frames are separated by a blank line and can split across chunks, so
  // hold the tail until a separator actually arrives.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch (e) {
        continue;
      }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        text += evt.delta.text;
        if (onDelta) onDelta(evt.delta.text);
      } else if (evt.type === "content_block_start" && evt.content_block?.type === "server_tool_use") {
        if (onSearch) onSearch(evt.content_block.name || "web_search");
      } else if (evt.type === "message_start") {
        usage = { ...usage, ...(evt.message?.usage || {}) };
      } else if (evt.type === "message_delta") {
        usage = { ...usage, ...(evt.usage || {}) };
        stopReason = evt.delta?.stop_reason || stopReason;
      } else if (evt.type === "error") {
        throw new ClaudeError("other", evt.error?.message || "Anthropic stream error.");
      }
    }
  }
  return { text, usage, stopReason, cost: estimateCost(model, usage) };
};
