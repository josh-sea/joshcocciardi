// ---------------------------------------------------------------------------
// Narrative Lab: Firestore access shared by the pipeline. Every collection is
// prefixed nl_ so the catch-all rule in firestore.rules can exclude the whole
// tool in one line.
//
//   nl_items       one doc per piece of content (the pipeline's state lives here)
//   nl_raw         the original capture, written once, never edited
//   nl_sources     people and outlets
//   nl_narratives  recurring storylines
//   nl_claims      atomic claims, linked to every item that makes them
//   nl_edges       derivation links between two items, with transformations
//   nl_log         append-only record of every ingest and rescoring
//   nl_settings    model and effort per stage, monthly budget
//   nl_counters    spend per month (server-written)
//   nl_secrets     the Anthropic key (write-only from the browser)
// ---------------------------------------------------------------------------

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { DEFAULT_MODEL, MODELS, EFFORTS } = require('./llm');

const db = () => getFirestore();
const col = (name) => db().collection(`nl_${name}`);
const now = () => FieldValue.serverTimestamp();

// Same allowlist as src/work/access.js and the nl_* block in firestore.rules.
const ADMIN_EMAILS = ['joshua.cocciardi@gmail.com'];

const isAdminToken = (token) =>
  !!token &&
  token.email_verified === true &&
  typeof token.email === 'string' &&
  ADMIN_EMAILS.includes(token.email.trim().toLowerCase());

const LLM_STAGES = ['extract', 'blind', 'resolve', 'relate', 'narrate'];

// Effort per stage: extraction and filing are clerical; the blind pass and the
// source comparison are where judgment matters.
const DEFAULT_SETTINGS = {
  model: DEFAULT_MODEL,
  stages: {
    extract: { effort: 'low' },
    blind: { effort: 'high' },
    resolve: { effort: 'low' },
    relate: { effort: 'high' },
    narrate: { effort: 'medium' },
  },
  budgetMonthlyUsd: 25,
};

/* Settings merged over the defaults, with anything invalid replaced. A
   browser-edited doc can never pick a model or effort the pipeline does not
   know how to call. */
const readSettings = async () => {
  const snap = await col('settings').doc('global').get();
  const s = snap.exists ? snap.data() : {};
  const model = MODELS.includes(s.model) ? s.model : DEFAULT_SETTINGS.model;
  const stages = {};
  for (const k of LLM_STAGES) {
    const given = (s.stages && s.stages[k]) || {};
    stages[k] = {
      model: MODELS.includes(given.model) ? given.model : model,
      effort: EFFORTS.includes(given.effort) ? given.effort : DEFAULT_SETTINGS.stages[k].effort,
    };
  }
  const budget = Number(s.budgetMonthlyUsd);
  return { model, stages, budgetMonthlyUsd: Number.isFinite(budget) && budget >= 0 ? budget : DEFAULT_SETTINGS.budgetMonthlyUsd };
};

/* The tool's own key, else the one Seasonal Box HQ already stores, so one key
   can serve both. `source` says which, for the Settings page. */
const readApiKey = async () => {
  for (const [path, source] of [['nl_secrets', 'narrative-lab'], ['sbox_secrets', 'seasonal-box']]) {
    const snap = await db().collection(path).doc('anthropic').get();
    const key = snap.exists ? snap.data().apiKey : null;
    if (typeof key === 'string' && key.trim()) return { key: key.trim(), source };
  }
  return { key: null, source: null };
};

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

const monthSpend = async () => {
  const snap = await col('counters').doc(`month-${monthKey()}`).get();
  return snap.exists ? Number(snap.data().usd) || 0 : 0;
};

const addSpend = async (usd) => {
  if (!usd) return;
  await col('counters').doc(`month-${monthKey()}`).set({ usd: FieldValue.increment(usd), updatedAt: now() }, { merge: true });
};

const log = (entry) => col('log').add({ ...entry, at: now() });

/* Stable short hash (FNV-1a) for deterministic document ids, so a retried
   stage overwrites instead of duplicating. */
const hash = (s) => {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

const slug = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

module.exports = {
  db,
  col,
  now,
  FieldValue,
  ADMIN_EMAILS,
  isAdminToken,
  LLM_STAGES,
  DEFAULT_SETTINGS,
  readSettings,
  readApiKey,
  monthKey,
  monthSpend,
  addSpend,
  log,
  hash,
  slug,
};
