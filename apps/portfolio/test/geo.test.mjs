/* Where Am I — judging a guess against the world instead of a drawing.
 *
 * The old answer was a point on a park map that is artwork: not to scale,
 * not north-up, a different shape per park. "How far out were you" could
 * only ever be a share of a picture. Metres mean the same thing everywhere,
 * and are the same units the photo's own GPS speaks.
 *
 * Two things here are easy to get wrong in ways that still look plausible:
 * dropping the cos(latitude) term from a flat distance, which is a 12%
 * longitude error at Orlando, and drawing a random point in a disc without
 * the sqrt, which quietly clusters every opening near the middle.
 */

import assert from 'node:assert/strict';
import {
  PARK_CENTRES, PARK_REACH_M, isPoint, metresBetween, parkAt, judgeGeo,
  offWords, WITHIN_M, BULLSEYE_M,
} from '../../disney-trivia/js/geo.js';
import { pointInDisc, centreFor, isRegion, CENTRE_BAND } from '../../disney-trivia/js/game.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalogue = require('../../disney-trivia/parks/attractions.json');

let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (${a} vs ${b})`); checks++; };

/* ── points ────────────────────────────────────────────────────────────── */

ok(isPoint({ lat: 28.4, lng: -81.5 }), 'a real coordinate is a point');
ok(!isPoint(null), 'nothing is not');
ok(!isPoint({ lat: 28.4 }), 'nor half a coordinate');
ok(!isPoint({ lat: 'x', lng: -81.5 }), 'nor a string');
ok(!isPoint({ lat: 91, lng: 0 }), 'nor a latitude off the planet');
ok(!isPoint({ lat: 0, lng: 181 }), 'nor a longitude off it');
// 0,0 is in the Atlantic, but it is a real place and a real parse result.
ok(isPoint({ lat: 0, lng: 0 }), 'and null island is a point, not a missing value');

/* ── distance ──────────────────────────────────────────────────────────── */

is(metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.4, lng: -81.5 }), 0, 'nowhere is no distance');
is(metresBetween(null, { lat: 28.4, lng: -81.5 }), null, 'a missing point has no distance');

// A tenth of a degree of latitude is about 11.1km anywhere on Earth.
near(metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.5, lng: -81.5 }), 11119, 20,
  'a tenth of a degree of latitude is about 11.1 km');

/* The same step in longitude at Orlando is shorter by cos(28.4°) = 0.880.
 * Omitting that factor is the single likeliest mistake here and would read
 * as 11.1 km instead of 9.8 km.
 */
near(metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.4, lng: -81.4 }), 9783, 30,
  'and in longitude it is shorter, by the cosine of the latitude');
ok(metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.4, lng: -81.4 })
   < metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.5, lng: -81.5 }),
  'so a longitude step is measurably shorter than a latitude one');

is(metresBetween({ lat: 28.4, lng: -81.5 }, { lat: 28.5, lng: -81.5 }),
   metresBetween({ lat: 28.5, lng: -81.5 }, { lat: 28.4, lng: -81.5 }),
  'distance is the same in both directions');

/* ── which park ────────────────────────────────────────────────────────────
 *
 * Driven by the real catalogue, not fixtures: every attraction we hold a
 * coordinate for has to land in the park it belongs to. That is 99 rides,
 * and it is the assertion that would catch a centre typed wrong.
 */
{
  let wrong = [];
  let total = 0;
  for (const key of ['mk', 'ep', 'hs', 'ak']) {
    for (const r of (catalogue.parks[key].rides || [])) {
      if (!Number.isFinite(r.lat)) continue;
      total++;
      if (parkAt({ lat: r.lat, lng: r.lng }) !== key) wrong.push(`${r.name} -> ${parkAt(r)}`);
    }
  }
  ok(total > 90, `the catalogue carries coordinates to test with (${total})`);
  is(wrong, [], 'every attraction in the catalogue lands in its own park');
}

is(parkAt({ lat: PARK_CENTRES.mk.lat, lng: PARK_CENTRES.mk.lng }), 'mk', 'a park centre is in that park');
is(parkAt({ lat: 28.5383, lng: -81.3792 }), null, 'downtown Orlando is in no park');
is(parkAt(null), null, 'and nothing is nowhere');

// The reach has to be bigger than the widest park and smaller than half the
// gap to the nearest other one, or the two tests contradict each other.
{
  const gap = metresBetween(PARK_CENTRES.ep, PARK_CENTRES.hs);
  ok(PARK_REACH_M < gap / 2,
    `the reach stays inside half the closest park gap (${Math.round(gap)}m)`);
}

/* Nearest wins, not whichever park happens to be listed first.
 *
 * At the real reach no point is ever within range of two parks, so this
 * cannot be told apart there, and testing it needs the reach the function
 * takes as an argument. It still matters: the day someone widens the reach,
 * the difference between these two rules is an answer that depends on the
 * order the parks are written down in.
 *
 * Both points below are in range of EPCOT and Hollywood Studios at once.
 * EPCOT is listed first, so one of them catches a first-wins rule and the
 * other catches a last-wins one.
 */
is(parkAt({ lat: 28.36665, lng: -81.55379 }, 3000), 'ep',
  'a point 697m from EPCOT and 1294m from Hollywood is EPCOT');
is(parkAt({ lat: 28.36211, lng: -81.55705 }, 3000), 'hs',
  'and one the other way round is Hollywood, though EPCOT is listed first');

/* ── judging ───────────────────────────────────────────────────────────── */

const SPACE = { lat: 28.41932, lng: -81.57767 };   // roughly Space Mountain

// Due north by a known number of metres, so the thresholds are tested at
// their edges rather than somewhere vaguely near them.
const northOf = (p, m) => ({ lat: p.lat + (m / 111320), lng: p.lng });

ok(judgeGeo(SPACE, SPACE).bullseye, 'the exact spot is a bullseye');
ok(judgeGeo(northOf(SPACE, 10), SPACE).bullseye, 'and so is ten metres away');
ok(!judgeGeo(northOf(SPACE, 40), SPACE).bullseye, 'forty metres is not a bullseye');
ok(judgeGeo(northOf(SPACE, 40), SPACE).within, 'but it is still right');
ok(!judgeGeo(northOf(SPACE, 200), SPACE).within, 'two hundred metres is not');
near(judgeGeo(northOf(SPACE, 200), SPACE).distance, 200, 2, 'and it says how far out, in metres');

ok(BULLSEYE_M < WITHIN_M, 'a bullseye is tighter than merely being right');

// The wrong park is reported as such, which is a different mistake from
// being in the right park and off by a hundred metres.
ok(!judgeGeo({ lat: PARK_CENTRES.ak.lat, lng: PARK_CENTRES.ak.lng }, SPACE).rightPark,
  'a guess in Animal Kingdom is not the right park for a Magic Kingdom answer');
ok(judgeGeo(northOf(SPACE, 200), SPACE).rightPark,
  'while being two hundred metres out in the same park is the right park');

is(judgeGeo(null, SPACE).distance, null, 'a missing guess has no distance');
is(judgeGeo(null, SPACE).within, false, 'and is not right');

/* ── saying it ─────────────────────────────────────────────────────────── */

is(offWords(4.2), '4 m', 'close up it is whole metres');
is(offWords(137), '135 m', 'further out it rounds to five, which is all the precision there is');
is(offWords(2400), '2.4 km', 'and past a kilometre it changes units');
is(offWords(NaN), '', 'nothing measurable says nothing');

/* ── the start region ──────────────────────────────────────────────────────
 *
 * The opening is drawn from inside a circle set when the photo was added, so
 * it cannot land on blank sky, and is still different on every deal so a
 * photo you have solved is worth playing again.
 */

ok(isRegion({ x: 0.5, y: 0.5, r: 0.1 }), 'a circle is a region');
ok(!isRegion({ x: 0.5, y: 0.5, r: 0 }), 'a circle with no radius is not');
ok(!isRegion(null), 'and neither is nothing');
ok(!isRegion({ x: 0.5, r: 0.1 }), 'nor half a circle');

{
  // Every draw lands inside the circle it was given.
  let worst = 0;
  let rand = 0;
  const seq = () => { rand = (rand * 9301 + 49297) % 233280; return rand / 233280; };
  for (let i = 0; i < 2000; i++) {
    const p = pointInDisc({ x: 0.5, y: 0.5 }, 0.2, seq);
    worst = Math.max(worst, Math.hypot(p.cx - 0.5, p.cy - 0.5));
  }
  ok(worst <= 0.2 + 1e-9, `every draw is inside the circle (worst ${worst.toFixed(4)})`);
  ok(worst > 0.18, 'and the outer part of it is actually used');
}

/* The sqrt. Without it half the points fall inside the inner half-radius,
 * which is a quarter of the area, and every opening clusters in the middle
 * of the region.
 *
 * Uniform over area means half the points fall outside r/sqrt(2) = 0.707R.
 */
{
  let rand = 12345;
  const seq = () => { rand = (rand * 9301 + 49297) % 233280; return rand / 233280; };
  let beyondHalfArea = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const p = pointInDisc({ x: 0.5, y: 0.5 }, 0.2, seq);
    if (Math.hypot(p.cx - 0.5, p.cy - 0.5) > 0.2 * Math.SQRT1_2) beyondHalfArea++;
  }
  near(beyondHalfArea / N, 0.5, 0.05,
    'half the openings fall in the outer half of the area, so they are spread evenly');
}

{
  // With no region at all, behaviour is exactly what it was before.
  const c = centreFor(null, () => 0.5);
  const [lo, hi] = CENTRE_BAND;
  is(c, { cx: (lo + hi) / 2, cy: (lo + hi) / 2 }, 'no region falls back to the old free-floating centre');
}

{
  // A region near the edge still cannot open mostly outside the photo.
  const [lo, hi] = CENTRE_BAND;
  for (let i = 0; i < 200; i++) {
    const c = centreFor({ x: 0.02, y: 0.02, r: 0.05 }, Math.random);
    ok(c.cx >= lo - 1e-9 && c.cy >= lo - 1e-9 && c.cx <= hi + 1e-9 && c.cy <= hi + 1e-9,
      'a region at the corner is still clamped into the band');
    checks -= 1;   // counted once below rather than two hundred times
  }
  checks += 1;
}

{
  // Two deals from the same region differ, which is the whole reason it is a
  // region and not a point.
  const region = { x: 0.5, y: 0.5, r: 0.15 };
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const c = centreFor(region, Math.random);
    seen.add(`${c.cx.toFixed(4)},${c.cy.toFixed(4)}`);
  }
  ok(seen.size > 40, `a photo opens somewhere new each deal (${seen.size} of 50 distinct)`);
}

console.log(`geo: ${checks} assertions passed`);
process.exit(0);
