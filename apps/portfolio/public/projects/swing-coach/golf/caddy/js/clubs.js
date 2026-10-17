/**
 * The bag, and how far each club goes.
 *
 * Defaults come from Shot Scope's tracked-shot data for male golfers at 5, 15
 * and 25 handicap, which is measured rather than self-reported — shot-tracking
 * studies find golfers overestimate their own carry by 10 to 20 percent, so a
 * survey chart would start the caddy out too optimistic.
 *
 * Note the defaults and the learned numbers are not the same measurement. The
 * chart is carry. A distance the caddy learns from two GPS marks is total:
 * carry plus roll. Total is the honest number for "can I reach that", so once
 * a club has enough logged shots the measured number wins, and the UI says
 * which one it is using.
 */

/** Carry in yards at [5 handicap, 15 handicap, 25 handicap]. */
const BASELINE = {
  driver: [261, 236, 204],
  "3w":   [234, 215, 178],
  "5w":   [225, 206, 170],
  "7w":   [218, 200, 165],
  "2h":   [222, 205, 170],
  "3h":   [216, 197, 162],
  "4h":   [208, 191, 156],
  "5h":   [203, 188, 153],
  "3i":   [210, 193, 158],
  "4i":   [201, 186, 151],
  "5i":   [183, 169, 143],
  "6i":   [172, 162, 137],
  "7i":   [164, 154, 132],
  "8i":   [153, 146, 122],
  "9i":   [139, 136, 108],
  pw:     [126, 121,  90],
  gw:     [109, 104,  79],
  // The source's wedge rows wobble — it has the lob wedge going further for a
  // 15 handicap than a 5, and the sand wedge barely moving across 20 strokes.
  // Full-swing wedge shots are rare enough that the sample is thin. Smoothed
  // so the bag stays monotonic, which the recommender relies on.
  sw:     [ 86,  84,  72],
  lw:     [ 71,  68,  55],
  putter: null,
};

export const CLUB_CATALOG = [
  { id: "driver", label: "Driver",         category: "wood",   loft: 10.5 },
  { id: "3w",     label: "3 Wood",         category: "wood",   loft: 15 },
  { id: "5w",     label: "5 Wood",         category: "wood",   loft: 18 },
  { id: "7w",     label: "7 Wood",         category: "wood",   loft: 21 },
  { id: "2h",     label: "2 Hybrid",       category: "hybrid", loft: 17 },
  { id: "3h",     label: "3 Hybrid",       category: "hybrid", loft: 19 },
  { id: "4h",     label: "4 Hybrid",       category: "hybrid", loft: 22 },
  { id: "5h",     label: "5 Hybrid",       category: "hybrid", loft: 25 },
  { id: "3i",     label: "3 Iron",         category: "iron",   loft: 21 },
  { id: "4i",     label: "4 Iron",         category: "iron",   loft: 24 },
  { id: "5i",     label: "5 Iron",         category: "iron",   loft: 27 },
  { id: "6i",     label: "6 Iron",         category: "iron",   loft: 30 },
  { id: "7i",     label: "7 Iron",         category: "iron",   loft: 34 },
  { id: "8i",     label: "8 Iron",         category: "iron",   loft: 38 },
  { id: "9i",     label: "9 Iron",         category: "iron",   loft: 42 },
  { id: "pw",     label: "Pitching Wedge", category: "wedge",  loft: 46 },
  { id: "gw",     label: "Gap Wedge",      category: "wedge",  loft: 50 },
  { id: "sw",     label: "Sand Wedge",     category: "wedge",  loft: 56 },
  { id: "lw",     label: "Lob Wedge",      category: "wedge",  loft: 60 },
  { id: "putter", label: "Putter",         category: "putter", loft: 3 },
];

/** What a starter set usually holds. */
export const STARTER_BAG = ["driver", "3w", "4h", "6i", "7i", "8i", "9i", "pw", "sw", "putter"];

export const SKILLS = ["beginner", "intermediate", "pro"];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * One number standing in for how far this player hits it.
 *
 * Handicap is the scale the distance data is indexed on, so a beginner with no
 * handicap gets one estimated from their average score. A 110 on a par 72 is
 * 38 over, which lands near 32 — roughly three quarters of an average
 * amateur's distance, which matches where the data puts a high handicap.
 */
export function effectiveHandicap(profile = {}) {
  const { skill = "beginner", handicap, avgScore } = profile;
  if (skill === "pro") return clamp(Number.isFinite(handicap) ? handicap : 2, -5, 12);
  if (skill === "intermediate") return clamp(Number.isFinite(handicap) ? handicap : 15, 0, 32);
  if (Number.isFinite(avgScore)) return clamp((avgScore - 72) * 0.85, 15, 45);
  return 28;
}

function rawCarry(row, handicap) {
  const [d5, d15, d25] = row;
  if (handicap <= 5) return d5 + ((5 - handicap) / 10) * (d5 - d15);
  if (handicap <= 15) return lerp(d5, d15, (handicap - 5) / 10);
  if (handicap <= 25) return lerp(d15, d25, (handicap - 15) / 10);
  // Past 25 the table runs out, so carry on down the club's own slope, with a
  // floor so a very high handicap does not extrapolate into nonsense.
  return Math.max(d25 * 0.55, d25 + ((handicap - 25) / 10) * (d25 - d15));
}

// Every club falls off at its own rate — the data has wedges dropping far
// faster than drivers between 15 and 25 — so extrapolating each one
// independently past the end of the table lets them cross over. At a 35
// handicap the 5 iron came out longer than the 4 iron. The recommender ranks
// the bag by distance and sizes lay-ups off it, so a bag that reshuffles
// itself is a real problem, not a cosmetic one.
//
// The fix: the order the measured data puts the clubs in is the order they
// stay in. Extrapolation may compress the gaps, never reorder them.
const REFERENCE_ORDER = Object.keys(BASELINE)
  .filter((id) => BASELINE[id])
  .sort((a, b) => BASELINE[b][1] - BASELINE[a][1]);

const bagCache = new Map();

function baselineBag(handicap) {
  const key = Math.round(handicap * 10) / 10;
  const hit = bagCache.get(key);
  if (hit) return hit;
  const out = {};
  let ceiling = Infinity;
  for (const id of REFERENCE_ORDER) {
    const v = Math.min(rawCarry(BASELINE[id], key), ceiling);
    out[id] = Math.round(v);
    ceiling = v;
  }
  bagCache.set(key, out);
  return out;
}

/** Baseline carry in yards for a club at a given handicap, or null for a putter. */
export function baselineCarry(clubId, handicap) {
  if (!BASELINE[clubId]) return null;
  const v = baselineBag(handicap)[clubId];
  return Number.isFinite(v) ? v : null;
}

/** Average of the last `n` logged shots with a club, or null. */
export function rollingAverage(club, n = 5) {
  const recent = (club?.measured?.recent || []).slice(-n);
  if (!recent.length) return null;
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

/** Lifetime average of every logged shot with a club, or null. */
export function lifetimeAverage(club) {
  const m = club?.measured;
  if (!m || !m.count) return null;
  return Math.round(m.sum / m.count);
}

/**
 * The distance the caddy should actually plan with, and where it came from.
 * A number you typed beats one it measured, which beats the chart.
 */
export function playingDistance(club, handicap, { prefer = "lifetime", minShots = 3 } = {}) {
  if (Number.isFinite(club?.carryOverride) && club.carryOverride > 0) {
    return { yards: Math.round(club.carryOverride), source: "yours", label: "you set this" };
  }
  const count = club?.measured?.count || 0;
  if (count >= minShots) {
    const yards = prefer === "rolling" ? rollingAverage(club) : lifetimeAverage(club);
    if (Number.isFinite(yards)) {
      return {
        yards,
        source: "measured",
        label: prefer === "rolling" ? `last ${Math.min(5, count)} shots` : `${count} shots`,
      };
    }
  }
  const yards = baselineCarry(club.id, handicap);
  if (!Number.isFinite(yards)) return null;
  return { yards, source: "estimate", label: `estimated for a ${Math.round(handicap)} handicap` };
}

/** Every non-putter in the bag with a distance, longest first. */
export function rankedBag(bag, handicap, opts) {
  return bag
    .filter((c) => c.inBag !== false && c.id !== "putter")
    .map((c) => ({ club: c, ...(playingDistance(c, handicap, opts) || {}) }))
    .filter((e) => Number.isFinite(e.yards))
    .sort((a, b) => b.yards - a.yards);
}

/**
 * Whether a measured shot is believable enough to learn from.
 *
 * Two GPS marks will happily tell you a 9 iron went 165 yards if you tapped
 * the wrong spot, walked to the wrong ball, or the fix jumped. A club's
 * average is built from few enough shots that one of those shifts it for
 * good, so the wild ones are logged but not taught.
 *
 * The window is lopsided on purpose, because the physics is lopsided. Hitting
 * a club far shorter than usual is ordinary — a chunk, a top, a shank — and
 * that is genuinely what this club does for this player, so it belongs in the
 * average. Hitting one half again further than usual is not something a swing
 * can do; it means the wrong club was recorded, the wrong ball was walked to,
 * or the fix jumped. So: generous below, tight above.
 */
const TOO_FAR = 1.5;
const TOO_SHORT = 0.35;

export function believableShot(yards, expectedYards) {
  if (!Number.isFinite(yards) || yards <= 0) return { ok: false, why: "no distance" };
  if (!Number.isFinite(expectedYards) || expectedYards <= 0) return { ok: true };
  if (yards > expectedYards * TOO_FAR) {
    return { ok: false, why: `${Math.round(yards)} yards is well past anything this club does (about ${Math.round(expectedYards)})` };
  }
  if (yards < expectedYards * TOO_SHORT) {
    return { ok: false, why: `${Math.round(yards)} yards is far too short to be a real swing with this club (about ${Math.round(expectedYards)})` };
  }
  return { ok: true };
}

/** Fold a freshly measured shot into a club's running record. */
export function recordShot(club, yards) {
  const m = club.measured || { count: 0, sum: 0, recent: [] };
  const recent = [...(m.recent || []), Math.round(yards)].slice(-20);
  return { ...club, measured: { count: m.count + 1, sum: m.sum + yards, recent } };
}

export function clubLabel(id) {
  return CLUB_CATALOG.find((c) => c.id === id)?.label || id;
}

/**
 * Club averages, derived from the shot log rather than accumulated into the
 * bag as you go.
 *
 * This is what makes a shot editable after the fact. If the running totals
 * lived on the club, changing a shot's club later would mean unpicking one
 * average and adding to another, and a deleted shot would leave its yards
 * behind forever. Recomputing from the log means an edit is just an edit.
 *
 * Shots must be in the order they were hit: each one is judged against what
 * the club looked like at the time, which is the baseline until there are
 * enough real shots to beat it.
 */
export function measuredFromShots(shots, handicap) {
  const byClub = {};
  for (const s of shots) {
    if (!s.club || s.club === "putter" || !Number.isFinite(s.yards)) continue;
    const m = (byClub[s.club] ||= { count: 0, sum: 0, recent: [], rejected: 0 });
    const expected = m.count >= 3 ? m.sum / m.count : baselineCarry(s.club, handicap);
    if (believableShot(s.yards, expected).ok) {
      m.count += 1;
      m.sum += s.yards;
      m.recent.push(Math.round(s.yards));
      if (m.recent.length > 20) m.recent.shift();
    } else {
      m.rejected += 1;
    }
  }
  return byClub;
}

/** The bag with every club's measured record rebuilt from the log. */
export function bagWithMeasured(bag, shots, handicap) {
  const stats = measuredFromShots(shots, handicap);
  return bag.map((c) => ({ ...c, measured: stats[c.id] || { count: 0, sum: 0, recent: [], rejected: 0 } }));
}
