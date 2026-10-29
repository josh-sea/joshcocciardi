/* The per-ride day curve, and whether right now is a good moment.
 *
 * The claim this code makes on screen is "go now, this is posting well
 * under what it usually does". Getting that wrong sends a family across a
 * park for nothing, so the thresholds and the edges are worth pinning.
 */

import {
  points, hasCurve, bars, bestAhead, peak, coversUntil,
  verdict, verdictWords, rightNow,
  BETTER_AT, WORSE_AT, MIN_EXPECTED,
} from '../../disney-trivia/js/curve.js';

let failures = 0;
const ok = (name, cond, extra) => {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};
const T = (h, m = 0) => new Date(Date.UTC(2026, 10, 7, h, m, 0)).toISOString();
const ms = (h, m = 0) => new Date(T(h, m)).getTime();

// A real shape: quiet at open, a late-morning dip, a mid-afternoon peak.
const curve = [
  { time: T(9),  waitTime: 20, percentage: 20 },
  { time: T(10), waitTime: 45, percentage: 45 },
  { time: T(11), waitTime: 30, percentage: 30 },
  { time: T(12), waitTime: 60, percentage: 60 },
  { time: T(13), waitTime: 100, percentage: 100 },
  { time: T(14), waitTime: 70, percentage: 70 },
];

/* ── reading it ──────────────────────────────────────────────────────────── */
console.log('\nreading the curve');
{
  const p = points(curve);
  ok('every point is parsed', p.length === 6);
  ok('and sorted by time', p.every((x, i) => i === 0 || p[i - 1].t <= x.t));
  ok('a curve is recognised', hasCurve(curve));
  ok('nothing is not a curve', !hasCurve(null) && !hasCurve([]));
  ok('a single point is not enough to draw', !hasCurve([{ time: T(9), waitTime: 10 }]));
  ok('junk points are dropped', points([{ time: 'nope', waitTime: 5 }, { time: T(9), waitTime: 10 }]).length === 1);
  ok('a point with no wait is dropped', points([{ time: T(9) }]).length === 0);
  ok('out-of-order input comes back in order',
    points([{ time: T(12), waitTime: 1 }, { time: T(9), waitTime: 2 }]).map((x) => x.waitMin).join() === '2,1');
}
{
  ok('the peak is the worst hour', peak(curve).waitMin === 100);
  ok('and knows when it is', new Date(peak(curve).t).getUTCHours() === 13);
  ok('no curve has no peak', peak([]) === null);
  ok('coverage is the last point', coversUntil(curve) === ms(14));
  ok('and null with nothing', coversUntil(null) === null);
}

/* ── the bars ────────────────────────────────────────────────────────────── */
console.log('\ndrawing it');
{
  const b = bars(curve, ms(11, 30));
  ok('one bar per hour', b.length === 6);
  // Heights are relative to the ride's own peak, not an absolute scale, so
  // a quiet ride still draws a readable shape.
  ok('the peak is full height', b.find((x) => x.waitMin === 100).rel === 1);
  ok('half the peak is half height', Math.abs(b.find((x) => x.waitMin === 45).rel - 0.45) < 0.001);
  ok('nothing is drawn at zero height', b.every((x) => x.rel >= 0.06));

  ok('now is the bar it falls inside', b.filter((x) => x.isNow).length === 1);
  ok('and that is the 11am bar', new Date(b.find((x) => x.isNow).t).getUTCHours() === 11);
  ok('earlier bars are past', b.filter((x) => x.isPast).length === 2);
  ok('later bars are not', b.slice(3).every((x) => !x.isPast && !x.isNow));
}
{
  // Before the curve starts, nothing is "now" yet and nothing is past.
  const early = bars(curve, ms(7));
  ok('before the first hour, no bar is now', early.every((x) => !x.isNow));
  ok('and none is past', early.every((x) => !x.isPast));
  // After it ends, the last bar is now.
  const late = bars(curve, ms(23));
  ok('after the last hour, the last bar is now', late[late.length - 1].isNow);
  ok('no curve draws no bars', bars(null, ms(11)).length === 0);
}

/* ── when to come back ───────────────────────────────────────────────────── */
console.log('\nwhen to come back');
{
  const b = bestAhead(curve, ms(9, 30), 2);
  ok('it only looks forward', b.every((x) => x.t > ms(9, 30)));
  /* After 9:30 the hours ahead are 45, 30, 60, 100, 70, so the two quietest
   * are 30 and 45. My first version asserted 30 and 60, which was me
   * misreading my own fixture rather than the code being wrong. */
  ok('and finds the quietest hours', b.map((x) => x.waitMin).join() === '45,30',
    b.map((x) => [new Date(x.t).getUTCHours(), x.waitMin]));
  ok('returned in time order, not score order', b[0].t < b[1].t);
  ok('late in the day there may be nothing left', bestAhead(curve, ms(20)).length === 0);
  ok('no curve suggests nothing', bestAhead(null, ms(9)).length === 0);
}

/* ── is now a good moment ────────────────────────────────────────────────── */
console.log('\nwhether right now is worth it');
{
  // At 13:00 the curve says 100.
  ok('well under the curve is "better"', verdict(50, curve, ms(13)).state === 'better');
  ok('right on the curve is normal', verdict(100, curve, ms(13)).state === 'normal');
  ok('well over is "worse"', verdict(150, curve, ms(13)).state === 'worse');
  ok('the threshold is where it says it is',
    verdict(100 * BETTER_AT, curve, ms(13)).state === 'better'
      && verdict(100 * BETTER_AT + 1, curve, ms(13)).state === 'normal');
  ok('and so is the other one',
    verdict(100 * WORSE_AT, curve, ms(13)).state === 'worse'
      && verdict(100 * WORSE_AT - 1, curve, ms(13)).state === 'normal');

  /* The guard that stops it crying wolf: a short queue wobbles by more than
   * it means, so 3 against an expected 6 is not a rare opportunity. */
  const tiny = [{ time: T(9), waitTime: 6 }, { time: T(14), waitTime: 6 }];
  ok('a tiny queue is never announced as a find', verdict(1, tiny, ms(12)).state === 'normal');
  ok('even though the ratio alone would say otherwise', 1 / 6 < BETTER_AT);
  ok('the floor is where it says it is', MIN_EXPECTED === 12);

  ok('no posted wait means no opinion', verdict(null, curve, ms(13)).state === 'unknown');
  ok('no curve means no opinion', verdict(30, null, ms(13)).state === 'unknown');
  ok('a posted zero is a real reading', verdict(0, curve, ms(13)).state === 'better');
  ok('the numbers are carried for the caller to show', verdict(50, curve, ms(13)).expected === 100);
}
{
  ok('the words name both numbers', /50 against 100/.test(verdictWords(verdict(50, curve, ms(13)))),
    verdictWords(verdict(50, curve, ms(13))));
  ok('and tell you to move', /go now/i.test(verdictWords(verdict(50, curve, ms(13)))));
  ok('busy says so', /busier/i.test(verdictWords(verdict(150, curve, ms(13)))));
  ok('normal is not alarming', /expect/i.test(verdictWords(verdict(100, curve, ms(13)))));
  ok('unknown says nothing at all', verdictWords(verdict(null, curve, ms(13))) === '');
  ok('and so does nothing', verdictWords(null) === '');
}

/* ── the board of what to do now ─────────────────────────────────────────── */
console.log('\nwhat is worth dropping everything for');
{
  const rides = [
    { id: 'head', name: 'Headliner', queued: true },
    { id: 'kiddie', name: 'Kiddie', queued: true },
    { id: 'normal', name: 'Normal', queued: true },
    { id: 'shut', name: 'Shut', queued: true },
    { id: 'walkthru', name: 'Walk through', queued: false },
  ];
  const flat = (n) => [{ time: T(9), waitTime: n }, { time: T(20), waitTime: n }];
  const live = {
    head:   { status: 'OPERATING', waitMin: 20, forecast: flat(60) },   // saves 40
    kiddie: { status: 'OPERATING', waitMin: 5,  forecast: flat(15) },   // saves 10
    normal: { status: 'OPERATING', waitMin: 58, forecast: flat(60) },
    shut:   { status: 'DOWN',      waitMin: 5,  forecast: flat(60) },
    walkthru: { status: 'OPERATING', waitMin: 0, forecast: flat(60) },
  };
  const board = rightNow(rides, live, ms(12));
  ok('only the ones genuinely under their curve', board.map((r) => r.id).join() === 'head,kiddie',
    board.map((r) => [r.id, r.saves]));
  /* Ranked by minutes saved, not by ratio: the kiddie ride is a bigger
   * proportion off its curve but the headliner is the one worth walking for. */
  ok('ranked by minutes saved, not by ratio', board[0].id === 'head');
  ok('and says how many', board[0].saves === 40);
  ok('a ride that is down is never suggested', !board.some((r) => r.id === 'shut'));
  ok('nor is a walk-through', !board.some((r) => r.id === 'walkthru'));
  ok('an empty park suggests nothing', rightNow([], {}, ms(12)).length === 0);
  ok('missing live data does not throw', rightNow(rides, {}, ms(12)).length === 0);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
