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

/* Where this playing's peephole sits, in normalised photo coordinates.
 *
 * Fresh every time a round is dealt, so the same photo can come back around
 * and still be a puzzle. The cost is that two people playing one deck get
 * different openings on the same photo, which makes a leaderboard a rough
 * comparison rather than an exact one. For a family game that trade is worth
 * it: a photo you have already solved is worth nothing on a second pass.
 *
 * `rand` is injectable so tests can pin it.
 */
export function freshCentre(rand = Math.random) {
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

/* How to lay the photo out behind the peephole.
 *
 * The obvious rendering, fitting the whole photo into the box and masking a
 * circle, is wrong on a phone: a 1400px-wide photo squeezed into a 343px box
 * shrinks a 142px radius down to 35px, so the player studies a postage stamp
 * surrounded by dead space.
 *
 * Instead the circle is pinned to a constant share of the box and the photo
 * is scaled to suit. Early taps therefore come up zoomed in and later ones
 * pull back, which reads as the picture opening up. What is revealed does not
 * change at all: the mask is still a circle of radius `r` in photo pixels, so
 * the fraction of the photo on show is exactly what REVEAL_STEPS says.
 */
export const PEEP_FILL = 0.84;   // share of the box's short side the circle spans

export function peepLayout(centre, r, photoW, photoH, boxW, boxH, fill = PEEP_FILL) {
  if (!(r > 0) || !(photoW > 0) || !(photoH > 0) || !(boxW > 0) || !(boxH > 0)) return null;
  const radius = (Math.min(boxW, boxH) * fill) / 2;
  const scale = radius / r;
  const width = photoW * scale;
  const height = photoH * scale;
  const width_ = width, height_ = height;
  return {
    radius,
    scale,
    width: width_,
    height: height_,
    // Put the peephole's centre at the centre of the box.
    left: boxW / 2 - centre.cx * width_,
    top: boxH / 2 - centre.cy * height_,
    /* Where to put the mask, in the displayed photo's own coordinates.
     * This is not the middle of the photo and it is not the middle of the
     * box either: the mask is painted on the photo, which is bigger than the
     * box and offset behind it, so a mask at "50% 50%" lands at the photo's
     * centre and drifts off screen. Returning it here keeps that arithmetic
     * in one tested place. */
    maskX: centre.cx * width_,
    maskY: centre.cy * height_,
  };
}


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

/* ── the parks ─────────────────────────────────────────────────────────────
 *
 * Four fixed maps ship with the app, so a deck is just a name and a password
 * and nobody has to find a map to upload. Each round names the park it was
 * taken in, and the guesser has to work that out too: picking the right park
 * is half the puzzle, which is why the answer carries it.
 *
 * The dimensions are the shipped images' own, because distance has to be
 * measured in a map's pixels rather than in normalised units.
 */
export const PARKS = {
  mk: { name: "Magic Kingdom",     short: "Magic Kingdom",  w: 915,  h: 896  },
  ep: { name: "EPCOT",             short: "EPCOT",          w: 1292, h: 1500 },
  hs: { name: "Hollywood Studios", short: "Hollywood",      w: 1167, h: 1344 },
  ak: { name: "Animal Kingdom",    short: "Animal Kingdom", w: 1402, h: 1500 },
};

export const PARK_ORDER = ["mk", "ep", "hs", "ak"];

export function isPark(key) { return Object.prototype.hasOwnProperty.call(PARKS, key); }

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

/* Judge a whole guess: which park, and where in it.
 *
 * The wrong park is simply wrong. There is no sense in measuring how far a
 * pin in EPCOT is from an answer in Animal Kingdom, and the two maps are not
 * even the same shape, so `distance` is null rather than a misleading number.
 * The verdict still says which mistake was made, because "right park, wrong
 * corner" and "wrong park entirely" deserve different faces.
 */
export function judgeGuess(guess, answer, tolerance = DEFAULT_TOLERANCE) {
  if (!guess || !answer || !isPark(answer.park)) {
    return { rightPark: false, within: false, bullseye: false, distance: null, off: null };
  }
  if (guess.park !== answer.park) {
    return { rightPark: false, within: false, bullseye: false, distance: null, off: null };
  }
  const { w, h } = PARKS[answer.park];
  return { rightPark: true, ...judge(guess, answer, w, h, tolerance) };
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
