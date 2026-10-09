/* The rules of the game, with no browser and no network in sight.
 *
 * Two mechanics live here. The peephole decides how much of a photo you are
 * allowed to see; the pin decides whether your guess counts. Both are pure
 * functions of their inputs so the whole thing can be tested in plain node,
 * and so every player of a shared round sees exactly the same puzzle.
 */

/* ── the peephole ──────────────────────────────────────────────────────────
 *
 * A round opens as a small circular window onto the photo and widens with
 * each tap. The sizes below are fractions of the photo's AREA, not its width,
 * because area is what "how much can I see" actually means: a circle of
 * radius 0.3w covers 28% of a square photo, not 30% of it.
 */
export const REVEAL_STEPS = [0.03, 0.08, 0.17, 0.30];

// A hard ceiling, checked at render time rather than trusted from the table
// above, so no future edit can quietly turn the game into "here is the photo".
export const MAX_REVEAL = 0.5;

// Keeping the centre off the very edge stops a round opening on a corner,
// where most of the circle would fall outside the photo and the player would
// get a sliver instead of a clue.
export const CENTRE_BAND = [0.22, 0.78];

/* Deterministic PRNG (mulberry32). The peephole has to be identical for
 * everyone playing a shared round, so its position comes from the round's own
 * id rather than from Math.random: same round, same puzzle, no extra field to
 * store and no way for two players to get different difficulty.
 */
export function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where this round's peephole sits, in normalised photo coordinates.
export function peepholeCentre(roundId) {
  const rand = mulberry32(seedFrom(String(roundId)));
  const [lo, hi] = CENTRE_BAND;
  return { cx: lo + rand() * (hi - lo), cy: lo + rand() * (hi - lo) };
}

/* Radius, in photo pixels, that exposes `fraction` of the photo's area.
 * From pi*r^2 = fraction*w*h. Clamped to MAX_REVEAL first so the ceiling
 * holds whatever the caller asks for.
 */
export function radiusForFraction(fraction, w, h) {
  const f = Math.min(Math.max(fraction, 0), MAX_REVEAL);
  return Math.sqrt((f * w * h) / Math.PI);
}

// How much of the photo a given tap exposes. Taps past the last step stay at
// the last step rather than running off the end of the table.
export function revealAt(tap, w, h) {
  const i = Math.min(Math.max(tap, 0), REVEAL_STEPS.length - 1);
  return radiusForFraction(REVEAL_STEPS[i], w, h);
}

export const TAPS_ALLOWED = REVEAL_STEPS.length - 1;

/* The area actually on screen, as a fraction of the photo.
 *
 * Not the same as the step it was asked for: a circle near an edge is clipped
 * by the photo, so the player sees less than the nominal share. Integrating
 * the circle-rectangle overlap numerically is accurate enough to assert the
 * ceiling against, and only ever runs in tests and asserts.
 */
export function visibleFraction(cx, cy, r, w, h, slices = 2000) {
  const px = cx * w, py = cy * h;
  const top = Math.max(py - r, 0), bottom = Math.min(py + r, h);
  if (bottom <= top) return 0;
  const step = (bottom - top) / slices;
  let area = 0;
  for (let i = 0; i < slices; i++) {
    const y = top + (i + 0.5) * step;
    const half = Math.sqrt(Math.max(r * r - (y - py) * (y - py), 0));
    const left = Math.max(px - half, 0), right = Math.min(px + half, w);
    if (right > left) area += (right - left) * step;
  }
  return area / (w * h);
}

/* ── the pin ───────────────────────────────────────────────────────────────
 *
 * The answer is a point on the deck's map image, and so is the guess. Both
 * are stored normalised (0..1) so they survive the map being displayed at any
 * size, but distance has to be measured in the map's own pixels: on a map
 * twice as wide as it is tall, a normalised step sideways is half as far as
 * the same step down.
 */

// Tolerance is a share of the map's SHORTER side, so a wide map does not
// quietly become an easy one.
export const DEFAULT_TOLERANCE = 0.08;

export function pinDistance(guess, answer, mapW, mapH) {
  const dx = (guess.x - answer.x) * mapW;
  const dy = (guess.y - answer.y) * mapH;
  return Math.hypot(dx, dy);
}

export function tolerancePx(tolerance, mapW, mapH) {
  return tolerance * Math.min(mapW, mapH);
}

/* Judge a guess. `within` is what counts as right; the band below it earns a
 * "nailed it" purely for bragging rights, and `off` is how far out you were
 * as a share of the map's shorter side, which is the number worth showing a
 * player because it means the same thing on every map.
 */
export function judge(guess, answer, mapW, mapH, tolerance = DEFAULT_TOLERANCE) {
  const dist = pinDistance(guess, answer, mapW, mapH);
  const tol = tolerancePx(tolerance, mapW, mapH);
  return {
    distance: dist,
    off: dist / Math.min(mapW, mapH),
    within: dist <= tol,
    bullseye: dist <= tol * 0.34,
  };
}

/* Score a finished round. Guessing early is worth more, so the player who
 * spends taps pays for them, and a miss is worth nothing rather than
 * negative: this is a game for a family in a queue.
 */
export const MAX_POINTS = 100;

export function scoreRound(verdict, tapsUsed) {
  if (!verdict.within) return 0;
  const spent = Math.min(Math.max(tapsUsed, 0), TAPS_ALLOWED);
  const base = MAX_POINTS - spent * 20;
  return verdict.bullseye ? base + 20 : base;
}
