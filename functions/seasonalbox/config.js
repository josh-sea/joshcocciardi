// ---------------------------------------------------------------------------
// Seasonal Box HQ: fixed facts the agent runtime relies on.
//
// Agent definitions (prompts, tiers, tools, autonomy, budgets) live in
// Firestore so they can be edited from the admin UI. What lives here is what
// must NOT be editable from a browser: who is an admin, what each model costs,
// which actions move money, and the stage machine. The client keeps its own
// copy of STAGES and ACTIONS for display (src/tools/seasonal-box/seed.js);
// apps/portfolio/test/seasonal-box.test.mjs fails if the two drift apart.
// ---------------------------------------------------------------------------

// Same allowlist as src/work/access.js and the sbox_* block in firestore.rules.
const ADMIN_EMAILS = ['joshua.cocciardi@gmail.com'];

const isAdminToken = (token) =>
  !!token &&
  token.email_verified === true &&
  typeof token.email === 'string' &&
  ADMIN_EMAILS.includes(token.email.trim().toLowerCase());

// Model routing (spec 3.3). Fable is reserved and never selected by a tier.
const TIERS = {
  light: 'claude-haiku-4-5-20251001',
  standard: 'claude-sonnet-5-5',
  heavy: 'claude-opus-5-5',
};

// USD per million tokens. Cache writes are billed at 1.25x input (5 minute
// TTL), cache reads at the listed rate. Fallback models are here so a turn the
// API re-routed after a refusal is still priced at what it actually cost.
const PRICES = {
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1 },
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25 },
};
// Anything unrecognised is priced as the dearest Opus so the ledger errs high.
const UNKNOWN_PRICE = { in: 5, out: 25, cacheRead: 0.5 };
const WEB_SEARCH_PER_REQUEST = 10 / 1000;

const priceFor = (model) => PRICES[model] || UNKNOWN_PRICE;

/* Cost of one API response, from the usage block it returned. `iterations`
   (present when a server-side fallback ran) is priced per model so a rescue
   on a different model isn't billed at the requested model's rate. */
const costOfUsage = (model, usage) => {
  if (!usage) return 0;
  const parts = Array.isArray(usage.iterations) && usage.iterations.length
    ? usage.iterations.map((it) => ({ model: it.model || model, u: it }))
    : [{ model, u: usage }];
  let usd = 0;
  for (const { model: m, u } of parts) {
    const p = priceFor(m);
    usd +=
      ((u.input_tokens || 0) * p.in +
        (u.cache_creation_input_tokens || 0) * p.in * 1.25 +
        (u.cache_read_input_tokens || 0) * p.cacheRead +
        (u.output_tokens || 0) * p.out) /
      1e6;
  }
  const searches = usage.server_tool_use?.web_search_requests || 0;
  return usd + searches * WEB_SEARCH_PER_REQUEST;
};

// Season pipeline (spec 6.1). `owner` names the agent started on entry.
const STAGES = [
  { n: 1, key: 'planning', name: 'Planning', owner: 'orchestrator' },
  { n: 2, key: 'trend', name: 'Trend Research', owner: 'trend-researcher' },
  { n: 3, key: 'scouting', name: 'Scouting', owner: 'maker-scout' },
  { n: 4, key: 'quotes', name: 'Outreach and Quotes', owner: 'procurement' },
  { n: 5, key: 'ordering', name: 'Ordering', owner: 'procurement' },
  { n: 6, key: 'box', name: 'Box Design', owner: 'box-curator' },
  { n: 7, key: 'reveal', name: 'Presale / Reveal', owner: 'storefront' },
  { n: 8, key: 'lock', name: 'Lock', owner: 'orchestrator' },
  { n: 9, key: 'receiving', name: 'Receiving', owner: 'fulfillment' },
  { n: 10, key: 'shipping', name: 'Packing and Shipping', owner: 'fulfillment' },
  { n: 11, key: 'retro', name: 'Retro', owner: 'analyst' },
];

// Every action an agent can propose (spec 4.3). `money` actions can never be
// green in the MVP; `alwaysRed` ones are red whatever the autonomy map says.
// None of the external ones are wired to a live integration yet: approving
// them hands the drafted action back to Josh to do by hand (see executors.js).
const ACTIONS = {
  'email.send': { level: 'yellow', money: false, label: 'Send email' },
  'order.create_po': { level: 'red', money: true, alwaysRed: true, label: 'Send purchase order' },
  'storefront.publish': { level: 'yellow', money: false, label: 'Publish to storefront' },
  'shipping.buy_labels': { level: 'yellow', money: true, label: 'Buy shipping labels' },
  'customer.reply': { level: 'yellow', money: false, label: 'Reply to customer' },
  'customer.refund': { level: 'red', money: true, alwaysRed: true, label: 'Refund customer' },
  'makers.upsert': { level: 'green', money: false, internal: true, label: 'Update maker directory' },
  'stage.advance': { level: 'yellow', money: false, internal: true, label: 'Advance season stage' },
  'brief.approve': { level: 'yellow', money: false, internal: true, label: 'Approve brief' },
  'budget.continue': { level: 'red', money: false, internal: true, label: 'Continue past budget' },
};

const DEFAULT_SETTINGS = {
  thresholds: { yellowToRedUsd: 150 },
  budgets: { aiMonthlyUsd: 150, operatingPerSeasonUsd: 5000, defaultPerRunUsd: 3, defaultPerDayUsd: 10 },
  autoStartAgents: true,
};

module.exports = {
  ADMIN_EMAILS,
  isAdminToken,
  TIERS,
  PRICES,
  priceFor,
  costOfUsage,
  STAGES,
  ACTIONS,
  DEFAULT_SETTINGS,
};
