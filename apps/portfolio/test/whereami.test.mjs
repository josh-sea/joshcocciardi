/* Where Am I: the game rules, tested without a browser.
 *
 * The two things worth proving are that the photo never opens up more than it
 * is allowed to (the whole game collapses if it does), and that a pin is
 * judged the same way on a square map and a panoramic one.
 *
 * Run: node apps/portfolio/test/whereami.test.mjs
 */
import {
  REVEAL_STEPS, MAX_REVEAL, CENTRE_BAND, TAPS_ALLOWED, MAX_POINTS, DEFAULT_TOLERANCE,
  PARKS, PARK_ORDER, isPark,
  seedFrom, mulberry32, peepholeCentre, radiusForFraction, revealAt,
  visibleFraction, pinDistance, judge, judgeGuess, scoreRound,
} from '../../disney-trivia/js/game.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); failures++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('\npeephole geometry');
{
  // The radius for a fraction must actually expose that fraction, when the
  // circle has room to be a whole circle.
  const w = 1200, h = 900;
  for (const f of REVEAL_STEPS) {
    const r = radiusForFraction(f, w, h);
    ok(`r for ${f} gives pi*r^2/(w*h) == ${f}`, near((Math.PI * r * r) / (w * h), f, 1e-12));
  }
  ok('steps only ever grow', REVEAL_STEPS.every((f, i) => i === 0 || f > REVEAL_STEPS[i - 1]));
  ok('three taps after the opening view', TAPS_ALLOWED === 3);
}

console.log('\nthe ceiling holds');
{
  // The real guarantee: across every round id and both extremes of the centre
  // band, on wildly different aspect ratios, the visible slice never exceeds
  // MAX_REVEAL. Measured by integrating the circle/photo overlap, not by
  // trusting the table.
  const shapes = [[1000, 1000], [1600, 900], [900, 1600], [4000, 800], [800, 4000]];
  let worst = 0, worstAt = '';
  for (const [w, h] of shapes) {
    for (let i = 0; i < 400; i++) {
      const { cx, cy } = peepholeCentre('round-' + i);
      const r = revealAt(TAPS_ALLOWED, w, h);
      const seen = visibleFraction(cx, cy, r, w, h);
      if (seen > worst) { worst = seen; worstAt = `${w}x${h} round-${i}`; }
    }
  }
  ok(`worst case ${(worst * 100).toFixed(1)}% stays under ${MAX_REVEAL * 100}%`, worst <= MAX_REVEAL, worstAt);
  ok('final step is a real clue, not a sliver (>15%)', worst > 0.15, `worst ${(worst * 100).toFixed(1)}%`);

  // An absurd request still cannot blow the ceiling.
  const r = radiusForFraction(5, 1000, 1000);
  ok('a 500% request clamps to the ceiling', near((Math.PI * r * r) / 1e6, MAX_REVEAL, 1e-12));

  // visibleFraction has to be right, or the assertion above proves nothing.
  // A circle wholly inside a photo should measure its own area.
  const rr = radiusForFraction(0.2, 1000, 1000);
  ok('integrator matches a known circle', near(visibleFraction(0.5, 0.5, rr, 1000, 1000), 0.2, 1e-3));
  // A circle centred on a corner shows a quarter of itself.
  ok('integrator handles clipping', near(visibleFraction(0, 0, rr, 1000, 1000), 0.05, 1e-3));
}

console.log('\nsame round, same puzzle');
{
  const a = peepholeCentre('abc123'), b = peepholeCentre('abc123');
  ok('a round id always yields the same centre', a.cx === b.cx && a.cy === b.cy);
  ok('different rounds differ', peepholeCentre('abc123').cx !== peepholeCentre('abc124').cx);
  const [lo, hi] = CENTRE_BAND;
  let inBand = true;
  for (let i = 0; i < 2000; i++) {
    const { cx, cy } = peepholeCentre('r' + i);
    if (cx < lo || cx > hi || cy < lo || cy > hi) inBand = false;
  }
  ok('centres stay inside the band', inBand);
  ok('seedFrom is stable', seedFrom('hello') === seedFrom('hello'));
  const rand = mulberry32(42);
  const vals = [rand(), rand(), rand()];
  ok('prng stays in [0,1)', vals.every(v => v >= 0 && v < 1));
  ok('prng is not constant', new Set(vals).size === 3);
}

console.log('\njudging a pin');
{
  const ans = { x: 0.5, y: 0.5 };
  // On a 1000x1000 map, tolerance 0.08 is 80px.
  ok('dead centre is a bullseye', judge({ x: 0.5, y: 0.5 }, ans, 1000, 1000).bullseye);
  ok('just inside counts', judge({ x: 0.57, y: 0.5 }, ans, 1000, 1000).within);
  ok('just outside does not', !judge({ x: 0.59, y: 0.5 }, ans, 1000, 1000).within);

  // The aspect-ratio trap: on a 2000x500 map the same normalised sideways
  // step is four times the distance of the same step vertically, so a
  // normalised-only distance would call both of these the same.
  const wide = judge({ x: 0.55, y: 0.5 }, ans, 2000, 500);
  const tall = judge({ x: 0.5, y: 0.55 }, ans, 2000, 500);
  ok('sideways on a wide map is 100px', near(wide.distance, 100, 1e-9));
  ok('vertical on a wide map is 25px', near(tall.distance, 25, 1e-9));
  ok('the two are judged differently', wide.within !== tall.within);
  ok('tolerance follows the shorter side', near(pinDistance({ x: 0.5, y: 0.55 }, ans, 2000, 500), 25));
  ok('"off" means the same on any map',
    near(judge({ x: 0.6, y: 0.5 }, ans, 1000, 1000).off, 0.1, 1e-9));
  ok('default tolerance is a tenth-ish of the map', DEFAULT_TOLERANCE > 0 && DEFAULT_TOLERANCE < 0.25);
}

console.log('\nthe parks');
{
  ok('four parks ship with the app', PARK_ORDER.length === 4);
  ok('every ordered key has a map', PARK_ORDER.every(k => PARKS[k] && PARKS[k].w > 0 && PARKS[k].h > 0));
  ok('every park has a name', PARK_ORDER.every(k => typeof PARKS[k].name === 'string' && PARKS[k].name));
  ok('isPark accepts a real one', isPark('mk'));
  ok('isPark rejects nonsense', !isPark('xx') && !isPark('toString'));
  // The four maps are genuinely different shapes, which is the whole reason
  // distance is measured per park rather than in normalised units.
  const shapes = new Set(PARK_ORDER.map(k => (PARKS[k].w / PARKS[k].h).toFixed(3)));
  ok('the maps are not all the same shape', shapes.size > 1);
}

console.log('\nguessing the park as well as the spot');
{
  const answer = { park: 'mk', x: 0.5, y: 0.5 };
  ok('right park, dead on',       judgeGuess({ park: 'mk', x: 0.5,  y: 0.5 }, answer).bullseye);
  ok('right park, close enough',  judgeGuess({ park: 'mk', x: 0.54, y: 0.5 }, answer).within);
  const nearMiss = judgeGuess({ park: 'mk', x: 0.85, y: 0.5 }, answer);
  ok('right park, wrong corner is still a miss', nearMiss.rightPark && !nearMiss.within);

  // The same coordinates in the wrong park must never score, however close
  // the numbers happen to look.
  const wrongPark = judgeGuess({ park: 'ak', x: 0.5, y: 0.5 }, answer);
  ok('identical coordinates in the wrong park miss', !wrongPark.within);
  ok('wrong park is flagged as such', !wrongPark.rightPark);
  ok('wrong park reports no distance', wrongPark.distance === null,
    'a distance across two different maps would be meaningless');
  ok('wrong park can never be a bullseye', !wrongPark.bullseye);

  ok('a junk park key misses safely', !judgeGuess({ park: 'nope', x: .5, y: .5 }, answer).within);
  ok('a junk answer park misses safely', !judgeGuess({ park: 'mk', x: .5, y: .5 }, { park: 'nope', x: .5, y: .5 }).within);
  ok('a missing guess misses safely', !judgeGuess(null, answer).within);

  // Tolerance must follow each park's own map, not one shared number.
  const inMk = judgeGuess({ park: 'mk', x: 0.57, y: 0.5 }, { park: 'mk', x: 0.5, y: 0.5 });
  const inAk = judgeGuess({ park: 'ak', x: 0.57, y: 0.5 }, { park: 'ak', x: 0.5, y: 0.5 });
  ok('judged against each park\'s own dimensions',
    inMk.distance !== inAk.distance,
    `mk ${inMk.distance} vs ak ${inAk.distance}`);
}

console.log('\nscoring');
{
  const hit = judge({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 1000);
  const close = judge({ x: 0.55, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 1000);
  const miss = judge({ x: 0.9, y: 0.9 }, { x: 0.5, y: 0.5 }, 1000, 1000);
  const wrongPark = judgeGuess({ park: 'ep', x: 0.5, y: 0.5 }, { park: 'mk', x: 0.5, y: 0.5 });
  ok('the wrong park scores nothing, even on the first look', scoreRound(wrongPark, 0) === 0);
  ok('a miss scores nothing', scoreRound(miss, 0) === 0);
  ok('a miss scores nothing however few taps', scoreRound(miss, 3) === 0);
  ok('first-look bullseye is the top score', scoreRound(hit, 0) === MAX_POINTS + 20);
  ok('taps cost points', scoreRound(close, 0) > scoreRound(close, 1));
  ok('scores never go negative', scoreRound(close, 99) >= 0);
  ok('spending every tap still scores', scoreRound(close, TAPS_ALLOWED) > 0);
}

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
