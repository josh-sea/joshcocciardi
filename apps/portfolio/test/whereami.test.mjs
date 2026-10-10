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
  PARKS, PARK_ORDER, isPark, PEEP_FILL,
  freshCentre, peepLayout, radiusForFraction, revealAt,
  visibleFraction, pinDistance, judge, judgeGuess, scoreRound,
} from '../../disney-trivia/js/game.js';
import {
  DEFAULT_VOLUME, clampVolume, trackLabel, nextIndex as nextTrack, orderFor,
} from '../../disney-trivia/js/music.js';

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
      const { cx, cy } = freshCentre();
      const r = revealAt(TAPS_ALLOWED, w, h);
      const seen = visibleFraction(cx, cy, r, w, h);
      if (seen > worst) { worst = seen; worstAt = `${w}x${h}`; }
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

console.log('\na fresh opening every time');
{
  // The peephole deliberately moves on every deal, so a photo already solved
  // is still a puzzle when it comes round again.
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const c = freshCentre();
    seen.add(`${c.cx.toFixed(4)},${c.cy.toFixed(4)}`);
  }
  ok('centres vary between plays', seen.size > 450, `${seen.size} distinct of 500`);

  const [lo, hi] = CENTRE_BAND;
  let inBand = true;
  for (let i = 0; i < 5000; i++) {
    const { cx, cy } = freshCentre();
    if (cx < lo || cx > hi || cy < lo || cy > hi) inBand = false;
  }
  ok('and still never leave the band', inBand);

  // Injectable randomness, so the extremes can be pinned rather than hoped for.
  ok('rand=0 lands on the near edge of the band', near(freshCentre(() => 0).cx, lo));
  const hiC = freshCentre(() => 0.9999999);
  ok('rand~1 lands on the far edge of the band', hiC.cx > hi - 1e-5 && hiC.cx <= hi);
}

console.log('\nthe patch is shown at a useful size');
{
  // The bug this replaces: fitting a whole photo into a phone-width box
  // shrank the revealed circle to about a quarter of its useful size.
  const boxW = 343, boxH = 343;
  const photoW = 1402, photoH = 1500;
  const centre = { cx: 0.5, cy: 0.5 };

  for (let tap = 0; tap <= TAPS_ALLOWED; tap++) {
    const r = revealAt(tap, photoW, photoH);
    const L = peepLayout(centre, r, photoW, photoH, boxW, boxH);
    ok(`tap ${tap}: circle spans ${(PEEP_FILL * 100).toFixed(0)}% of the box`,
      near(L.radius * 2, boxW * PEEP_FILL, 1e-9));
    ok(`tap ${tap}: the photo still covers the box`,
      L.width >= boxW - 1e-9 && L.height >= boxH - 1e-9,
      `${Math.round(L.width)}x${Math.round(L.height)} vs ${boxW}x${boxH}`);
  }

  // Early taps are zoomed in, later ones pull back. That ordering is the
  // feel of the thing, so it is worth asserting.
  const scales = [0, 1, 2, 3].map(t => peepLayout(centre, revealAt(t, photoW, photoH), photoW, photoH, boxW, boxH).scale);
  ok('each tap pulls further back', scales.every((v, i) => i === 0 || v < scales[i - 1]),
    scales.map(v => v.toFixed(2)).join(' > '));

  // The peephole centre must land in the middle of the box, whatever corner
  // of the photo it is in.
  for (const c of [{ cx: 0.22, cy: 0.22 }, { cx: 0.78, cy: 0.78 }, { cx: 0.5, cy: 0.3 }]) {
    const r = revealAt(1, photoW, photoH);
    const L = peepLayout(c, r, photoW, photoH, boxW, boxH);
    ok(`centre (${c.cx},${c.cy}) sits at the box centre`,
      near(L.left + c.cx * L.width, boxW / 2, 1e-9) && near(L.top + c.cy * L.height, boxH / 2, 1e-9));

    /* The mask is painted on the photo, not on the box, and the photo is
     * bigger than the box and offset behind it. A mask at "50% 50%" therefore
     * lands at the photo's centre and slides off screen, which is exactly the
     * bug this field exists to stop. maskX/maskY must put it at the box
     * centre once the photo's own offset is accounted for. */
    ok(`mask for (${c.cx},${c.cy}) resolves to the box centre`,
      near(L.left + L.maskX, boxW / 2, 1e-9) && near(L.top + L.maskY, boxH / 2, 1e-9),
      `mask lands at ${Math.round(L.left + L.maskX)},${Math.round(L.top + L.maskY)} want ${boxW/2},${boxH/2}`);
    ok(`mask for (${c.cx},${c.cy}) is not simply the photo's middle`,
      c.cx === 0.5 || !near(L.maskX, L.width / 2, 1));
  }

  // A wide photo and a tall one both work.
  for (const [w, h] of [[2000, 1000], [1000, 2000], [1000, 1000]]) {
    const L = peepLayout(centre, revealAt(2, w, h), w, h, boxW, boxH);
    ok(`a ${w}x${h} photo still covers the box`, L.width >= boxW - 1e-9 && L.height >= boxH - 1e-9);
  }

  ok('nonsense input returns nothing rather than NaN', peepLayout(centre, 0, 1, 1, 1, 1) === null);
  ok('a zero-width box returns nothing', peepLayout(centre, 10, 100, 100, 0, 100) === null);
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

console.log('\nbackground music');
{
  // Volume comes from a slider, from storage, and from whatever the last
  // release wrote. Anything unusable must land on the default, because NaN
  // silences the element with no way back.
  ok('a sane volume passes through', clampVolume(0.4) === 0.4);
  ok('too loud is clamped', clampVolume(5) === 1);
  ok('negative is clamped', clampVolume(-2) === 0);
  ok('a numeric string works, since storage returns strings', clampVolume('0.25') === 0.25);
  ok('junk falls back to the default', clampVolume('loud') === DEFAULT_VOLUME);
  ok('null falls back to the default', clampVolume(null) === DEFAULT_VOLUME);
  ok('undefined falls back to the default', clampVolume(undefined) === DEFAULT_VOLUME);
  ok('an empty string falls back too', clampVolume('') === DEFAULT_VOLUME);
  ok('but a real zero is still zero', clampVolume(0) === 0 && clampVolume('0') === 0);
  ok('NaN never escapes', !Number.isNaN(clampVolume(NaN)));
  ok('the default is background, not foreground', DEFAULT_VOLUME > 0 && DEFAULT_VOLUME < 0.6);

  ok('a file name becomes a title', trackLabel('music/main-street_loop.mp3') === 'Main street loop');
  ok('a bare name works', trackLabel('parade.m4a') === 'Parade');
  ok('nested paths work', trackLabel('/a/b/c/quiet-night.mp3') === 'Quiet night');
  ok('a nameless file still gets a label', trackLabel('') === 'Untitled');
  ok('so does rubbish', trackLabel(null) === 'Untitled');

  ok('the playlist wraps', nextTrack(2, 3) === 0);
  ok('and steps', nextTrack(0, 3) === 1);
  ok('from nowhere it starts at the beginning', nextTrack(-1, 3) === 0);
  ok('an empty playlist has nowhere to go', nextTrack(0, 0) === -1);

  const order = orderFor(6, false);
  ok('unshuffled order is in order', order.join() === '0,1,2,3,4,5');
  const shuffled = orderFor(6, true, (() => { let i = 0; const seq = [0.9, 0.1, 0.8, 0.2, 0.7]; return () => seq[i++ % seq.length]; })());
  ok('a shuffle keeps every track exactly once',
    [...shuffled].sort().join() === '0,1,2,3,4,5', shuffled.join());
  ok('an empty list shuffles to nothing', orderFor(0).length === 0);
  ok('a one-track list is itself', orderFor(1).join() === '0');
}

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
