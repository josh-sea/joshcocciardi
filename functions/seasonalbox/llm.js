// ---------------------------------------------------------------------------
// One Claude call, shaped correctly for whichever tier is running it.
//
// The three tiers do not take the same request:
//   - Opus 5.5 always thinks; sending a `thinking` block other than adaptive
//     is a 400, so it is omitted and depth is set with effort.
//   - Sonnet 5.5 takes adaptive thinking plus an effort level.
//   - Haiku 4.5 predates adaptive thinking and rejects `effort`, and only
//     knows the basic web search / fetch tool versions.
// Opus and Sonnet also opt into server-side refusal fallbacks, so a turn a
// safety classifier declines is re-run on a fallback model inside the same
// call instead of stopping the agent. The ledger prices that rescue at the
// model that actually ran (config.costOfUsage reads usage.iterations).
// ---------------------------------------------------------------------------

const AnthropicMod = require('@anthropic-ai/sdk');
const { TIERS, costOfUsage } = require('./config');

const Anthropic = AnthropicMod.default || AnthropicMod;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const capabilities = (model) => {
  if (model.startsWith('claude-haiku-4-5')) {
    return { thinking: null, effort: false, search: 'web_search_20250305', fetch: 'web_fetch_20250910', fallbacks: false };
  }
  if (model.startsWith('claude-opus-5-5')) {
    return { thinking: null, effort: true, search: 'web_search_20260209', fetch: 'web_fetch_20260209', fallbacks: true };
  }
  return { thinking: { type: 'adaptive' }, effort: true, search: 'web_search_20260209', fetch: 'web_fetch_20260209', fallbacks: true };
};

const modelForTier = (tier) => TIERS[tier] || TIERS.standard;

/* Anthropic-hosted tools for this model. Results come back inside the same
   response, so the runner never executes them itself. */
const serverTools = (model, { webSearch, webFetch }) => {
  const caps = capabilities(model);
  const out = [];
  if (webSearch) out.push({ type: caps.search, name: 'web_search', max_uses: 6 });
  if (webFetch) out.push({ type: caps.fetch, name: 'web_fetch', max_uses: 6 });
  return out;
};

const buildRequest = ({ model, system, messages, tools, effort = 'medium', maxTokens = 32000 }) => {
  const caps = capabilities(model);
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    // Automatic caching on the growing conversation, on top of the explicit
    // breakpoints the runner puts on the system prompt and taste notes.
    cache_control: { type: 'ephemeral' },
  };
  if (tools && tools.length) body.tools = tools;
  if (caps.thinking) body.thinking = caps.thinking;
  if (caps.effort) body.output_config = { effort };
  if (caps.fallbacks) {
    body.betas = [FALLBACK_BETA];
    body.fallbacks = 'default';
  }
  return body;
};

const clientFor = (apiKey) => new Anthropic({ apiKey, maxRetries: 3, timeout: 8 * 60 * 1000 });

/* Streams so long outputs never trip the HTTP timeout, and hands back the
   assembled message. Uses the beta surface only when the request carries a
   beta flag. */
const callClaude = async (apiKey, req) => {
  const client = clientFor(apiKey);
  const stream = req.betas ? client.beta.messages.stream(req) : client.messages.stream(req);
  const message = await stream.finalMessage();
  return { message, cost: costOfUsage(message.model || req.model, message.usage) };
};

/* Plain-language reason for a failed call, safe to show in the UI and to
   store on the run. Never includes the key. */
const describeError = (e) => {
  if (e instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Update it in Settings.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'The API key is not allowed to use this model.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. The step will retry.';
  if (e instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${String(e.message).slice(0, 300)}`;
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status || ''}: ${String(e.message).slice(0, 300)}`;
  return String(e?.message || e).slice(0, 300);
};

const isRetryable = (e) =>
  e instanceof Anthropic.RateLimitError ||
  e instanceof Anthropic.APIConnectionError ||
  (e instanceof Anthropic.APIError && (e.status || 0) >= 500);

module.exports = { capabilities, modelForTier, serverTools, buildRequest, callClaude, describeError, isRetryable, clientFor };
