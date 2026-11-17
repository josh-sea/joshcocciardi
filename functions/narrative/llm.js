// ---------------------------------------------------------------------------
// One structured Claude call for a pipeline stage.
//
// Every LLM stage returns JSON constrained by a schema (output_config.format),
// so stages never parse prose. Calls stream so a long transcript never trips
// the HTTP timeout. Opus, Sonnet and Fable opt into server-side refusal
// fallbacks, so a turn a safety classifier declines is re-run on a fallback
// model inside the same call; cost is priced per model that actually ran.
// ---------------------------------------------------------------------------

const AnthropicMod = require('@anthropic-ai/sdk');

const Anthropic = AnthropicMod.default || AnthropicMod;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// The models Settings may pick. Opus 5.5 is the default for every stage.
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'];
const DEFAULT_MODEL = 'claude-opus-5-5';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// USD per million tokens. Cache writes bill at 1.25x input.
const PRICES = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
  'claude-fable-5-2': { in: 8, out: 40, cacheRead: 0.2 },
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25 },
};
const UNKNOWN_PRICE = { in: 8, out: 40, cacheRead: 0.25 }; // err high

const costOfUsage = (model, usage) => {
  if (!usage) return 0;
  const parts = Array.isArray(usage.iterations) && usage.iterations.length
    ? usage.iterations.map((it) => ({ model: it.model || model, u: it }))
    : [{ model, u: usage }];
  let usd = 0;
  for (const { model: m, u } of parts) {
    const p = PRICES[m] || UNKNOWN_PRICE;
    usd +=
      ((u.input_tokens || 0) * p.in +
        (u.cache_creation_input_tokens || 0) * p.in * 1.25 +
        (u.cache_read_input_tokens || 0) * p.cacheRead +
        (u.output_tokens || 0) * p.out) /
      1e6;
  }
  return usd;
};

/* Request shape per model family:
   - Opus 5.5 and Fable 5.2 always think: no `thinking` field, depth by effort.
   - Sonnet 5.5 takes adaptive thinking plus effort.
   - Haiku 5.5 thinks adaptively by default and has no server-side fallback. */
const buildRequest = ({ model, system, user, schema, effort = 'medium', maxTokens = 32000 }) => {
  const m = MODELS.includes(model) ? model : DEFAULT_MODEL;
  const body = {
    model: m,
    max_tokens: maxTokens,
    // The system prompt carries the library and is identical across items, so
    // it is the cache breakpoint.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort: EFFORTS.includes(effort) ? effort : 'medium',
      format: { type: 'json_schema', schema },
    },
  };
  if (m.startsWith('claude-sonnet')) body.thinking = { type: 'adaptive' };
  if (!m.startsWith('claude-haiku')) {
    body.betas = [FALLBACK_BETA];
    body.fallbacks = 'default';
  }
  return body;
};

class StageError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

const clientFor = (apiKey) => new Anthropic({ apiKey, maxRetries: 3, timeout: 8 * 60 * 1000 });

/* Runs one stage call and returns { data, cost, model, usage }. Throws a
   StageError with a plain-language message on refusal, truncation, or JSON
   that does not parse. */
const callJson = async (apiKey, req) => {
  const client = clientFor(apiKey);
  let message;
  try {
    const stream = req.betas ? client.beta.messages.stream(req) : client.messages.stream(req);
    message = await stream.finalMessage();
  } catch (e) {
    throw new StageError(describeError(e), { retryable: isRetryable(e) });
  }
  const model = message.model || req.model;
  const cost = costOfUsage(model, message.usage);
  if (message.stop_reason === 'refusal') {
    const cat = message.stop_details && message.stop_details.category;
    const err = new StageError(`The model declined this content${cat ? ` (${cat})` : ''}. Try another model in Settings, or skip this item.`);
    err.cost = cost;
    throw err;
  }
  if (message.stop_reason === 'max_tokens') {
    const err = new StageError('The response ran past the output limit. The item may be too long for one pass; try a higher-capacity setting or split the text.');
    err.cost = cost;
    throw err;
  }
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new StageError('The model returned output that was not valid JSON.', { retryable: true });
    err.cost = cost;
    throw err;
  }
  return { data, cost, model, usage: message.usage };
};

const describeError = (e) => {
  if (e instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Update it in Settings.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'The API key is not allowed to use this model.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Press Retry in a few minutes.';
  if (e instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${String(e.message).slice(0, 300)}`;
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status || ''}: ${String(e.message).slice(0, 300)}`;
  return String((e && e.message) || e).slice(0, 300);
};

const isRetryable = (e) =>
  e instanceof Anthropic.RateLimitError ||
  e instanceof Anthropic.APIConnectionError ||
  (e instanceof Anthropic.APIError && (e.status || 0) >= 500);

module.exports = { MODELS, DEFAULT_MODEL, EFFORTS, PRICES, costOfUsage, buildRequest, callJson, clientFor, describeError, StageError };
