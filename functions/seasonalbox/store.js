// Firestore and Storage access shared by the Seasonal Box runtime. Every
// collection is prefixed sbox_ so the catch-all rule in firestore.rules can
// exclude the whole tool in one line.

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { ACTIONS, DEFAULT_SETTINGS } = require('./config');

const db = () => getFirestore();
const col = (name) => db().collection(`sbox_${name}`);

const COLLECTIONS = {
  settings: 'sbox_settings',
  agents: 'sbox_agents',
  seasons: 'sbox_seasons',
  briefs: 'sbox_briefs',
  themes: 'sbox_themes',
  makers: 'sbox_makers',
  products: 'sbox_products',
  kits: 'sbox_kits',
  tiers: 'sbox_tiers',
  runs: 'sbox_runs',
  proposals: 'sbox_proposals',
  notes: 'sbox_notes',
  ledger: 'sbox_ledger',
  counters: 'sbox_counters',
  secrets: 'sbox_secrets',
};

const now = () => FieldValue.serverTimestamp();

const readSettings = async () => {
  const snap = await col('settings').doc('global').get();
  const s = snap.exists ? snap.data() : {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s.thresholds || {}) },
    budgets: { ...DEFAULT_SETTINGS.budgets, ...(s.budgets || {}) },
  };
};

const readApiKey = async () => {
  const snap = await col('secrets').doc('anthropic').get();
  const key = snap.exists ? snap.data().apiKey : null;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
};

// ── Spend counters ──────────────────────────────────────────────────────────
// Summing the ledger on every step would cost a read per entry, so spend is
// also accumulated into small counter docs with atomic increments. The ledger
// stays the record; the counters are for enforcing caps quickly.
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

const counterIds = ({ agentId, seasonId, category }) => {
  const ids = [`${category}-month-${monthKey()}`];
  // Per-agent daily caps are AI caps: a purchase order an agent drafted must
  // not use up that agent's model budget for the day.
  if (agentId && category === 'ai') ids.push(`agent-${agentId}-day-${dayKey()}`);
  if (seasonId) ids.push(`season-${seasonId}-${category}`);
  return ids;
};

/* Writes one ledger entry and bumps every counter it belongs to, in a batch,
   so the counters can never disagree with the ledger by a partial write. */
const recordSpend = async ({ category, amount, agentId = null, seasonId = null, runId = null, refId = null, model = null, usage = null, note = '' }) => {
  const usd = Math.max(0, Number(amount) || 0);
  const batch = db().batch();
  const entry = col('ledger').doc();
  batch.set(entry, {
    category,
    amount: usd,
    agentId,
    seasonId,
    runId,
    refId,
    model,
    usage: usage
      ? {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cacheWrite: usage.cache_creation_input_tokens || 0,
          webSearches: usage.server_tool_use?.web_search_requests || 0,
        }
      : null,
    note,
    timestamp: now(),
  });
  for (const id of counterIds({ agentId, seasonId, category })) {
    batch.set(col('counters').doc(id), { amount: FieldValue.increment(usd), updatedAt: now() }, { merge: true });
  }
  await batch.commit();
  return entry.id;
};

const readCounter = async (id) => {
  const snap = await col('counters').doc(id).get();
  return snap.exists ? Number(snap.data().amount) || 0 : 0;
};

const aiMonthSpend = () => readCounter(`ai-month-${monthKey()}`);
const agentDaySpend = (agentId) => readCounter(`agent-${agentId}-day-${dayKey()}`);
const seasonOperatingSpend = (seasonId) => readCounter(`season-${seasonId}-operating`);

// ── Approval levels ─────────────────────────────────────────────────────────
/* The level an action needs, from the agent's autonomy map, clamped by the
   rules that are not up to the agent config: money never goes green, some
   actions are always red, and anything over the dollar threshold is red. */
const levelFor = (agent, actionType, amountUsd, settings) => {
  const def = ACTIONS[actionType] || { level: 'red', money: true };
  let level = agent?.autonomy?.[actionType] || def.level;
  if (!['green', 'yellow', 'red'].includes(level)) level = def.level;
  if (def.alwaysRed) level = 'red';
  if (def.money && level === 'green') level = 'yellow';
  if (def.money && Number(amountUsd) > Number(settings.thresholds.yellowToRedUsd)) level = 'red';
  return level;
};

// ── Large payloads ──────────────────────────────────────────────────────────
// A step's raw model output (web search results especially) can run past
// Firestore's 1MB document limit. Anything over ~700KB goes to Storage and the
// step doc keeps a pointer.
const INLINE_LIMIT = 700 * 1024;

const putJson = async (path, value) => {
  const text = JSON.stringify(value);
  if (text.length <= INLINE_LIMIT) return { inline: text };
  await getStorage().bucket().file(path).save(text, { contentType: 'application/json', resumable: false });
  return { storagePath: path };
};

const getJson = async (ref) => {
  if (!ref) return null;
  if (typeof ref.inline === 'string') return JSON.parse(ref.inline);
  if (ref.storagePath) {
    const [buf] = await getStorage().bucket().file(ref.storagePath).download();
    return JSON.parse(buf.toString('utf8'));
  }
  return null;
};

const parseJson = (s, fallback = null) => {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
};

module.exports = {
  db,
  col,
  COLLECTIONS,
  now,
  FieldValue,
  Timestamp,
  readSettings,
  readApiKey,
  recordSpend,
  aiMonthSpend,
  agentDaySpend,
  seasonOperatingSpend,
  dayKey,
  monthKey,
  levelFor,
  putJson,
  getJson,
  parseJson,
};
