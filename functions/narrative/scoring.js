// ---------------------------------------------------------------------------
// Scoring. The model produces findings; this file turns them into numbers, so
// every score is reproducible and old findings can be rescored when a formula
// changes. Pure functions, no dependencies.
//
// Four scores, never combined into one (see the framework doc, "Scoring"):
//   technique density   per item, Layers 2 and 3 only
//   pressure profile    per item, 0 to 3 on five invariants plus direction
//   fidelity            per derivation edge, claim-level against the source
//   source profile      per source, only shown from 20 items up
// ---------------------------------------------------------------------------

const CONFIDENCE_WEIGHT = { high: 1, medium: 0.6, low: 0.25 };
const MIN_WORDS = 50; // below this a per-1,000-words rate is noise
const GENRE_BASELINE_MIN = 200; // items of a genre before a percentile means anything
const PROFILE_MIN_ITEMS = 20;
const INVARIANT_IDS = ['epistemic', 'axiological', 'identificatory', 'social', 'teleological'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
const round1 = (n) => Math.round(n * 10) / 10;

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/* Weighted Layer 2 and 3 findings per 1,000 words. Only located findings
   count: a finding whose quote is not in the text has no evidence. */
const densityRaw = (findings, words) => {
  if (!words || words < MIN_WORDS) return null;
  const sum = (findings || [])
    .filter((f) => f.layer === 2 || f.layer === 3)
    .reduce((s, f) => s + (CONFIDENCE_WEIGHT[f.confidence] || 0), 0);
  return round1((sum / words) * 1000);
};

/* Percentile of `value` among `others` (ties count half), 0 to 100. Null until
   the genre has enough items to be a baseline. */
const percentile = (value, others) => {
  if (typeof value !== 'number') return null;
  const xs = (others || []).filter((x) => typeof x === 'number');
  if (xs.length < GENRE_BASELINE_MIN) return null;
  let below = 0;
  let equal = 0;
  for (const x of xs) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  return Math.round(((below + equal / 2) / xs.length) * 100);
};

/* Claim-level fidelity of a derivative to one source, 0 to 100.
   Each carried claim and each dropped item weighs its materiality (1 to 3).
   Faithful earns full credit, distorted earns less the worse the distortion
   (severity 3 earns nothing), unsupported and dropped earn none. Null when
   there is nothing to compare. */
const fidelity = ({ carried = [], dropped = [] } = {}) => {
  let total = 0;
  let credit = 0;
  for (const c of carried) {
    const w = clamp(c.materiality, 1, 3);
    total += w;
    if (c.status === 'faithful') credit += w;
    else if (c.status === 'distorted') credit += w * (1 - clamp(c.severity, 1, 3) / 3);
  }
  for (const d of dropped) total += clamp(d.materiality, 1, 3);
  if (!total) return null;
  return Math.round((credit / total) * 100);
};

/* Checks the model's invariant scores against the chain rule: a score above 1
   must cite lower-layer findings that exist. Unsupported scores are capped at
   1 and listed, so the report can say so. */
const pressureProfile = (invariants, knownFindingIds) => {
  const known = new Set(knownFindingIds || []);
  const scores = Object.fromEntries(INVARIANT_IDS.map((id) => [id, 0]));
  const support = Object.fromEntries(INVARIANT_IDS.map((id) => [id, []]));
  const rationale = {};
  const capped = [];
  for (const inv of invariants || []) {
    if (!INVARIANT_IDS.includes(inv.id)) continue;
    const ids = [...new Set((inv.supportingFindingIds || []).filter((x) => known.has(x)))];
    let score = clamp(inv.score, 0, 3);
    if (score > 1 && !ids.length) {
      score = 1;
      capped.push(inv.id);
    }
    if (score >= scores[inv.id]) {
      scores[inv.id] = score;
      support[inv.id] = ids;
      rationale[inv.id] = String(inv.rationale || '');
    }
  }
  const peak = Math.max(...Object.values(scores));
  return { scores, support, rationale, capped, peak };
};

const counts = (list, key) => {
  const out = {};
  for (const x of list || []) {
    const k = x && x[key];
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
};

const top = (countMap, n = 5) =>
  Object.entries(countMap || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id, count]) => ({ id, count }));

const addCounts = (into, from) => {
  for (const [k, v] of Object.entries(from || {})) into[k] = (into[k] || 0) + v;
  return into;
};

/* Aggregate over a source's finished items. `shown` is false below the
   minimum; the numbers are kept anyway so the count is visible. */
const sourceProfile = (items) => {
  const list = items || [];
  const techniques = {};
  const transformations = {};
  const genres = {};
  const times = [];
  for (const it of list) {
    addCounts(techniques, it.techniqueCounts);
    addCounts(transformations, it.transformationCounts);
    const g = it.genre || 'unknown';
    genres[g] = (genres[g] || 0) + 1;
    if (typeof it.at === 'number') times.push(it.at);
  }
  const fid = list.map((it) => it.fidelity).filter((x) => typeof x === 'number');
  return {
    items: list.length,
    shown: list.length >= PROFILE_MIN_ITEMS,
    densityMedian: median(list.map((it) => it.densityRaw)),
    fidelityMedian: median(fid),
    fidelityItems: fid.length,
    topTechniques: top(techniques),
    topTransformations: top(transformations),
    genres,
    firstSeen: times.length ? Math.min(...times) : null,
    lastSeen: times.length ? Math.max(...times) : null,
  };
};

/* Hop distance from a primary source: 0 for an item with no stored upstream,
   else one more than its nearest upstream. */
const hopOf = (upstreamHops) => {
  const hs = (upstreamHops || []).filter((h) => typeof h === 'number');
  return hs.length ? Math.min(...hs) + 1 : 0;
};

const lagHours = (fromIso, toIso) => {
  const a = Date.parse(fromIso || '');
  const b = Date.parse(toIso || '');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return round1((b - a) / 3600000);
};

module.exports = {
  CONFIDENCE_WEIGHT,
  MIN_WORDS,
  GENRE_BASELINE_MIN,
  PROFILE_MIN_ITEMS,
  INVARIANT_IDS,
  clamp,
  median,
  densityRaw,
  percentile,
  fidelity,
  pressureProfile,
  counts,
  top,
  sourceProfile,
  hopOf,
  lagHours,
};
