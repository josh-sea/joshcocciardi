/* Park Planner: the routing rules.
 *
 * Pure maths, no network, no emulator. The planner decides where a family
 * walks next on a day that costs a lot of money and cannot be repeated, so
 * the interesting cases here are the ones that would quietly waste an hour:
 * a suggestion that makes you late for a Lightning Lane, a ride that is down,
 * a wait read from the wrong hour of the forecast.
 */

import {
  haversine, walkMinutes, DEFAULT_PACE, DETOUR,
  blendWait, forecastAt, urgency,
  holdsFor, collidesWithLL,
  scoreCandidate, candidates, planAhead, explain,
  MUST_DO_BOOST, mustDoPressure, mustDoCost, PRESSURE_MAX,
} from '../../disney-trivia/js/park.js';

let failures = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

/* ── geography ───────────────────────────────────────────────────────────── */
console.log('\ndistance and walking');

// Cinderella Castle and Space Mountain, real coordinates, about 390m apart.
const castle = { lat: 28.4189, lng: -81.5812 };
const space  = { lat: 28.4189, lng: -81.5772 };
{
  const m = haversine(castle, space);
  ok('a known pair comes out at the right distance', near(m, 391, 15), Math.round(m));
  ok('distance is symmetric', near(m, haversine(space, castle), 0.001));
  ok('a point is zero from itself', haversine(castle, castle) === 0);
  ok('nonsense input returns null rather than NaN', haversine(null, space) === null);
  /* The bug this guards: an object with no coordinates gave NaN, which is not
   * null, so it passed every null check and produced a NaN score that sorted
   * at random. It cost the look-ahead its entire second step. */
  ok('a place with no coordinates is null, not NaN', haversine({ name: 'nowhere' }, space) === null);
  ok('and so is the walk to it', walkMinutes({ name: 'nowhere' }, space) === null);
}
{
  const min = walkMinutes(castle, space);
  // 391m * 1.45 detour / 67 m-per-min ~ 8.5 minutes.
  ok('walking adds a detour factor', near(min, (391 * DETOUR) / DEFAULT_PACE, 0.4), min);
  ok('a faster pace is a shorter walk', walkMinutes(castle, space, 100) < min);
  ok('walking is never free between different places', min > 0);
  ok('a zero pace does not divide by zero', walkMinutes(castle, space, 0) === null);
}

/* ── the forecast curve ──────────────────────────────────────────────────── */
console.log('\nreading the forecast');

const T = (h, m = 0) => new Date(Date.UTC(2026, 10, 7, h, m, 0)).toISOString();
const curve = [
  { time: T(9),  waitTime: 10 },
  { time: T(10), waitTime: 30 },
  { time: T(11), waitTime: 50 },
  { time: T(12), waitTime: 40 },
];
{
  ok('an exact hour reads straight off', forecastAt(curve, T(10)) === 30);
  ok('half past interpolates', forecastAt(curve, T(10, 30)) === 40, forecastAt(curve, T(10, 30)));
  ok('a quarter past interpolates', forecastAt(curve, T(10, 15)) === 35);
  ok('before the first point holds the first value', forecastAt(curve, T(6)) === 10);
  ok('after the last point holds the last value', forecastAt(curve, T(23)) === 40);
  ok('an empty forecast is null, not zero', forecastAt([], T(10)) === null);
  ok('a missing forecast is null', forecastAt(undefined, T(10)) === null);
  ok('a junk timestamp is null', forecastAt(curve, 'not a date') === null);
  // The trap this guards: reading 10:50 as the 10:00 number on a ride that
  // doubles between 10 and 11.
  ok('ten to eleven is nearly the eleven number', near(forecastAt(curve, T(10, 50)), 46.7, 0.1));
}

/* ── blending live with forecast ─────────────────────────────────────────── */
console.log('\nwhat the wait will be when you get there');
{
  ok('standing at the gate, trust what is posted', blendWait(20, 60, 0) === 20);
  ok('far away, trust the forecast', blendWait(20, 60, 60) === 60);
  ok('halfway to the horizon, halfway between', blendWait(20, 60, 12.5) === 40);
  ok('no forecast falls back to posted', blendWait(20, null, 30) === 20);
  ok('no posted number falls back to forecast', blendWait(null, 60, 5) === 60);
  ok('neither one is null, not zero', blendWait(null, null, 5) === null);
  ok('a posted zero is a real zero, not a missing value', blendWait(0, 60, 0) === 0);
}

/* ── urgency ─────────────────────────────────────────────────────────────── */
console.log('\nhow much worse it gets later');
{
  const climbing = [{ time: T(9), waitTime: 10 }, { time: T(11), waitTime: 70 }];
  const easing  = [{ time: T(9), waitTime: 70 }, { time: T(11), waitTime: 15 }];
  const flat    = [{ time: T(9), waitTime: 30 }, { time: T(11), waitTime: 30 }];
  ok('a ride about to get much worse is urgent', urgency(climbing, T(9), 10) > 1.2);
  ok('a ride that is easing off can wait', urgency(easing, T(9), 70) < 1);
  ok('a flat ride is exactly neutral', near(urgency(flat, T(9), 30), 1, 0.001), urgency(flat, T(9), 30));
  ok('urgency is clamped so one ride cannot swamp the day', urgency(climbing, T(9), 1) <= 1.6);
  ok('no forecast means no opinion', urgency(null, T(9), 30) === 1);
}

/* ── Lightning Lane ──────────────────────────────────────────────────────── */
console.log('\nLightning Lane windows');

const LL_SPACE = { attractionId: 'space', start: T(11, 20), end: T(12, 20) };
{
  ok('you hold it before the window closes', holdsFor([LL_SPACE], 'space', T(10)) === true);
  ok('and still during it', holdsFor([LL_SPACE], 'space', T(11, 45)) === true);
  ok('but not after it has gone', holdsFor([LL_SPACE], 'space', T(13)) === false);
  ok('a different ride is not covered', holdsFor([LL_SPACE], 'pirates', T(10)) === false);
  ok('no windows means no holds', holdsFor([], 'space', T(10)) === false);
}
{
  /* The window shuts at 12:20 and the walk to it is about 8.5 minutes, so
   * the real deadline is 12:11. Finishing at 12:15 misses it.
   *
   * My first version of this used a 12:10 finish and expected a collision,
   * which was simply wrong arithmetic on my part: 12:10 plus an 8.5-minute
   * walk arrives at 12:18, comfortably inside the window. The code was right
   * and the test was wrong. */
  const rideById = (id) => (id === 'space' ? space : null);
  const clash = collidesWithLL(T(12, 15), [LL_SPACE], rideById, castle, DEFAULT_PACE);
  ok('finishing too late to make the window is a collision', clash === LL_SPACE);

  const fine = collidesWithLL(T(12, 10), [LL_SPACE], rideById, castle, DEFAULT_PACE);
  ok('finishing with just enough time to walk over is not', fine === null);

  const early = collidesWithLL(T(11, 0), [LL_SPACE], rideById, castle, DEFAULT_PACE);
  ok('finishing well before it is certainly not', early === null);

  // The subtle one: finishing exactly at the window's end still misses it,
  // because you are not standing at the ride when you finish the other one.
  const onTheLine = collidesWithLL(T(12, 19), [LL_SPACE], rideById, castle, DEFAULT_PACE);
  ok('the walk to the Lightning Lane counts against the window', onTheLine === LL_SPACE);

  const past = collidesWithLL(T(14, 0), [{ ...LL_SPACE, end: T(12, 20) }], rideById, castle);
  ok('a window that has already gone cannot be collided with', past === null);
}

/* ── scoring ─────────────────────────────────────────────────────────────── */
console.log('\nscoring one option');
{
  const base = { walkMin: 5, waitMin: 15, rideMin: 5, value: 1, urgency: 1 };
  const s = scoreCandidate(base);
  ok('score is value over total minutes', near(s, 1 / 25, 0.0001), s);
  ok('a longer wait scores worse', scoreCandidate({ ...base, waitMin: 45 }) < s);
  ok('a longer walk scores worse', scoreCandidate({ ...base, walkMin: 20 }) < s);
  ok('a must-do outranks the same ride without the flag',
    near(scoreCandidate({ ...base, mustDo: true }), s * MUST_DO_BOOST, 0.0001));
  ok('urgency lifts the score', scoreCandidate({ ...base, urgency: 1.5 }) > s);
  ok('a zero-minute option cannot divide by zero',
    scoreCandidate({ walkMin: 0, waitMin: 0, rideMin: 0 }) === 0);
  // The trade the objective is built on: these two cost the same 25 minutes,
  // so the planner must be indifferent rather than preferring the near one.
  ok('ten minutes of walking equals ten minutes of queueing',
    near(scoreCandidate({ ...base, walkMin: 15, waitMin: 5 }), s, 0.0001));
}

/* ── must-dos as a deadline ──────────────────────────────────────────────── */
console.log('\nmust-dos get more urgent as the day runs out');
{
  ok('loads of slack, no hurry', mustDoPressure(600, 100) === 1);
  ok('exactly three times the time needed is still no hurry', mustDoPressure(300, 100) === 1);
  ok('only just enough time is maximum pressure', mustDoPressure(100, 100) === PRESSURE_MAX);
  ok('not enough time is maximum pressure', mustDoPressure(40, 100) === PRESSURE_MAX);
  ok('the park already shut is maximum pressure', mustDoPressure(-10, 100) === PRESSURE_MAX);
  ok('nothing left to do means no pressure', mustDoPressure(60, 0) === 1);
  ok('an unknown closing time means no opinion', mustDoPressure(Infinity, 100) === 1);

  const mid = mustDoPressure(200, 100);   // slack 2, halfway
  ok('it rises in between', mid > 1 && mid < PRESSURE_MAX, mid);
  ok('and it is eased, so it stays out of the way until late',
    mid < 1 + (PRESSURE_MAX - 1) / 2, mid);
  ok('pressure only ever rises as time runs out',
    [600, 400, 300, 250, 200, 150, 120, 100, 60].map((t) => mustDoPressure(t, 100))
      .every((v, i, a) => i === 0 || a[i - 1] <= v));
}
{
  const rides = [
    { id: 'a', name: 'A', lat: 0, lng: 0, queued: true, minutes: 4 },
    { id: 'b', name: 'B', lat: 0, lng: 0, queued: true, minutes: 6 },
  ];
  const live = { a: { waitMin: 50 }, b: { waitMin: 20 } };
  ok('cost adds queue, ride and a walk for each must-do',
    mustDoCost(rides, live, ['a', 'b']) === (50 + 4 + 8) + (20 + 6 + 8),
    mustDoCost(rides, live, ['a', 'b']));
  ok('one already ridden stops counting',
    mustDoCost(rides, live, ['a', 'b'], ['a']) === 20 + 6 + 8);
  ok('a must-do with no posted wait is assumed to be a real queue',
    mustDoCost(rides, {}, ['b']) === 30 + 6 + 8);
  ok('no must-dos cost nothing', mustDoCost(rides, live, []) === 0);
}

/* ── the candidate list ──────────────────────────────────────────────────── */
console.log('\nchoosing what to do next');

const RIDES = [
  { id: 'space',   name: 'Space Mountain', lat: 28.4189, lng: -81.5772, queued: true,  minutes: 3 },
  { id: 'pirates', name: 'Pirates',        lat: 28.4181, lng: -81.5845, queued: true,  minutes: 9 },
  { id: 'dumbo',   name: 'Dumbo',          lat: 28.4203, lng: -81.5796, queued: true,  minutes: 2 },
  { id: 'castle',  name: 'Cinderella Castle', lat: 28.4189, lng: -81.5812, queued: false, minutes: 0 },
];
const LIVE = {
  space:   { status: 'OPERATING', waitMin: 35, forecast: curve },
  pirates: { status: 'OPERATING', waitMin: 10, forecast: curve },
  dumbo:   { status: 'OPERATING', waitMin: 5,  forecast: curve },
  castle:  { status: 'OPERATING', waitMin: null },
};
const baseState = { from: castle, now: T(10), pace: DEFAULT_PACE };

{
  const c = candidates(RIDES, LIVE, baseState);
  ok('walk-through attractions are never suggested', !c.some((x) => x.id === 'castle'));
  ok('everything suggested has a wait we can name', c.every((x) => typeof x.waitMin === 'number'));
  ok('the list is sorted best first', c.every((x, i) => i === 0 || c[i - 1].score >= x.score));
  ok('short wait nearby beats long wait far away', c[0].id === 'dumbo', c.map((x) => x.id));
}
{
  const c = candidates(RIDES, LIVE, { ...baseState, done: ['dumbo'] });
  ok('a ride you have done is not suggested again', !c.some((x) => x.id === 'dumbo'));
}
{
  const down = { ...LIVE, dumbo: { status: 'DOWN', waitMin: 5, forecast: curve } };
  const c = candidates(RIDES, down, baseState);
  ok('a ride that is down is not suggested', !c.some((x) => x.id === 'dumbo'));
}
{
  const c = candidates(RIDES, LIVE, { ...baseState, mustDo: ['space'] });
  ok('a must-do climbs the list', c[0].id === 'space', c.map((x) => x.id));
}
{
  const held = { ...baseState, llWindows: [{ attractionId: 'dumbo', start: T(11), end: T(12) }] };
  ok('a ride you hold a Lightning Lane for is skipped',
    !candidates(RIDES, LIVE, held).some((x) => x.id === 'dumbo'));
  ok('unless you say you want to ride it twice',
    candidates(RIDES, LIVE, { ...held, skipHeld: false }).some((x) => x.id === 'dumbo'));
}
{
  const c = candidates(RIDES, LIVE, { ...baseState, maxWaitMin: 12 });
  ok('a wait ceiling filters the long ones out', c.every((x) => x.waitMin <= 12), c.map((x) => [x.id, Math.round(x.waitMin)]));
  const withMust = candidates(RIDES, LIVE, { ...baseState, maxWaitMin: 12, mustDo: ['space'] });
  ok('but a must-do is exempt from it', withMust.some((x) => x.id === 'space'));
}
{
  const c = candidates(RIDES, LIVE, baseState);
  const d = c.find((x) => x.id === 'dumbo');
  ok('arrival is now plus the walk', d.arrival.getTime() > new Date(T(10)).getTime());
  ok('finish is arrival plus wait plus ride',
    near(d.finish.getTime(), d.arrival.getTime() + (d.waitMin + d.rideMin) * 60000, 1));
}
{
  ok('nothing open means an empty list, not a crash',
    candidates(RIDES, {}, baseState).length === 0);
  ok('an empty park is an empty list', candidates([], LIVE, baseState).length === 0);
}

/* The case a fixed multiplier could not handle.
 *
 * An 80-minute headliner against a 5-minute walk-on next door. At nine in
 * the morning the walk-on is genuinely the right call: you get it in ten
 * minutes and the headliner will still be there. At eight in the evening it
 * is not, because there is no "still be there" left.
 *
 * This is what made me replace the multiplier. At 5x the headliner lost to
 * the walk-on at every hour of the day, which is how you go home without
 * riding the thing you came for.
 */
console.log('\nthe headliner you came for');
{
  const pair = [
    { id: 'tron',  name: 'TRON',  lat: 28.4215, lng: -81.5790, queued: true, minutes: 2 },
    { id: 'dumbo', name: 'Dumbo', lat: 28.4203, lng: -81.5796, queued: true, minutes: 2 },
  ];
  const liveNow = {
    tron:  { status: 'OPERATING', waitMin: 80, forecast: null },
    dumbo: { status: 'OPERATING', waitMin: 5,  forecast: null },
  };
  const where = { from: castle, mustDo: ['tron'], closing: T(22) };

  const morning = candidates(pair, liveNow, { ...where, now: T(9) });
  ok('in the morning, throughput wins and the walk-on goes first',
    morning[0].id === 'dumbo', morning.map((c) => [c.id, +c.score.toFixed(4)]));

  const evening = candidates(pair, liveNow, { ...where, now: T(20, 30) });
  ok('in the evening, the must-do you have not ridden wins',
    evening[0].id === 'tron', evening.map((c) => [c.id, +c.score.toFixed(4), +c.pressure.toFixed(2)]));

  ok('pressure is what changed, not the ride',
    morning.find((c) => c.id === 'tron').pressure < evening.find((c) => c.id === 'tron').pressure);

  ok('a ride that is not a must-do never feels pressure',
    evening.find((c) => c.id === 'dumbo').pressure === 1);

  // And once it is ridden, the pressure comes off everything else.
  const after = candidates(pair, liveNow, { ...where, now: T(20, 30), done: ['tron'] });
  ok('riding it releases the pressure', after.every((c) => c.pressure === 1));

  // Without a closing time there is no deadline to be late for.
  const noClose = candidates(pair, liveNow, { ...where, now: T(20, 30), closing: null });
  ok('with no closing time it falls back to throughput', noClose[0].id === 'dumbo');

  ok('and the card says why', /day is running out/.test(explain(evening[0])), explain(evening[0]));
}

/* ── looking ahead ───────────────────────────────────────────────────────── */
console.log('\nlooking past the next move');
{
  const p = planAhead(RIDES, LIVE, baseState, 2, 3);
  ok('every suggestion carries its chain', p.every((x) => Array.isArray(x.chain) && x.chain.length >= 1));
  ok('a chain does not repeat a ride', p.every((x) => new Set(x.chain.map((c) => c.id)).size === x.chain.length));
  ok('results are sorted by the look-ahead total', p.every((x, i) => i === 0 || p[i - 1].total >= x.total));
  ok('depth 1 is plain greedy', planAhead(RIDES, LIVE, baseState, 1)[0].id === candidates(RIDES, LIVE, baseState)[0].id);
  ok('an empty park plans nothing', planAhead([], LIVE, baseState).length === 0);

  /* What look-ahead is actually for.
   *
   * It is NOT rescuing you from a long walk to one good queue: dividing value
   * by total minutes already prices a 25-minute walk out of contention on its
   * own, so greedy never takes that bait. Asserting otherwise would be a test
   * passing for a reason that does not exist.
   *
   * Where it earns its keep is a near-tie. Two openings score within a hair of
   * each other; one sits beside two more good rides and the other is on its
   * own. The immediate score cannot tell them apart. Playing two moves forward
   * can.
   */
  const lone  = { lat: 28.4210, lng: -81.5812 };   // ~230m north of the castle
  const hubA  = { lat: 28.4189, lng: -81.5789 };   // ~230m east
  const spread = [
    { id: 'lone',  name: 'On its own', ...lone, queued: true, minutes: 3 },
    { id: 'hub1',  name: 'Cluster one', ...hubA, queued: true, minutes: 3 },
    { id: 'hub2',  name: 'Cluster two', lat: 28.4190, lng: -81.5788, queued: true, minutes: 3 },
    { id: 'hub3',  name: 'Cluster three', lat: 28.4188, lng: -81.5790, queued: true, minutes: 3 },
  ];
  const flatLive = {
    lone: { status: 'OPERATING', waitMin: 9,  forecast: null },
    hub1: { status: 'OPERATING', waitMin: 10, forecast: null },
    hub2: { status: 'OPERATING', waitMin: 10, forecast: null },
    hub3: { status: 'OPERATING', waitMin: 10, forecast: null },
  };
  const where = { from: castle, now: T(10) };
  const greedy = candidates(spread, flatLive, where);
  ok('greedy cannot tell the near-tie apart', greedy[0].id === 'lone'
    && Math.abs(greedy[0].score - greedy[1].score) / greedy[0].score < 0.12,
    greedy.map((x) => [x.id, +x.score.toFixed(4)]));

  const looked = planAhead(spread, flatLive, where, 3, 4)[0];
  ok('looking ahead opens into the cluster', looked.id !== 'lone', looked.id);
  ok('and the chain it found really is the cluster',
    looked.chain.slice(0, 3).every((c) => c.id.startsWith('hub')), looked.chain.map((c) => c.id));

  /* And the guarantee that matters either way: look-ahead must never return
   * an option that greedy would not have considered at all. */
  const ids = new Set(greedy.map((c) => c.id));
  ok('look-ahead invents nothing', planAhead(spread, flatLive, where, 3, 4).every((c) => ids.has(c.id)));
}

/* ── the explanation ─────────────────────────────────────────────────────── */
console.log('\nsaying why');
{
  const all = candidates(RIDES, LIVE, { ...baseState, mustDo: ['space'] });
  const c = all.find((x) => x.id === 'space');
  const text = explain(c);
  ok('it names the walk', /\d+ min walk/.test(text), text);
  ok('it names the posted wait', /posted/.test(text), text);
  ok('it says when a ride is a must-do', /must-do/.test(text), text);
  ok('it is one readable line', text.length < 120 && !text.includes('\n'));
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
