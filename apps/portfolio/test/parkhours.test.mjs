/* Park Planner: reducing a day of change rows to 24 numbers.
 *
 * The raw endpoint returns changes, not readings: 3,186 rows across 70
 * entities for one park-day. Two things about that shape decide whether the
 * hourly profile means anything, and both are easy to get wrong in a way
 * that still produces a plausible-looking chart.
 *
 *   A row is a change. Most of Seven Dwarfs' 182 daily rows move a Lightning
 *   Lane return time while the standby wait sits still. Treat rows as
 *   readings and an hour with ten Lightning Lane updates reads as busier
 *   than an hour with one.
 *
 *   The day does not begin at the first row. `opening` carries the state at
 *   the start of the range, so a ride whose wait last changed yesterday
 *   still has one this morning.
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const H = require('../../../functions/parkhours.js');

const TZ = 'America/New_York';
let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };

/* ── park-local time ────────────────────────────────────────────────────── */

// 14:30Z in late October is 10:30 in Florida (EDT, UTC-4).
is(H.parkHour('2026-10-30T14:30:00Z', TZ), 10, 'an instant lands in the park\'s hour, not UTC\'s');
is(H.minuteOf('2026-10-30T14:30:00Z', TZ), 30, 'and its minute');
is(H.parkDate('2026-10-30T14:30:00Z', TZ), '2026-10-30', 'and its park date');

// The case that makes park-local mandatory: 02:00Z is the previous evening
// in Florida, and a 1am wait belongs to the day people were standing in it.
is(H.parkDate('2026-10-31T02:00:00Z', TZ), '2026-10-30', 'after midnight UTC is still the evening before');
is(H.parkHour('2026-10-31T02:00:00Z', TZ), 22, 'at ten at night');

// Across the DST change: 1 Nov 2026 is when the US falls back.
is(H.parkHour('2026-11-01T05:30:00Z', TZ), 1, 'an hour before the fall-back seam');
is(H.parkHour('2026-11-01T06:30:00Z', TZ), 1, 'and the repeated hour after it, still park-local');
is(H.parkHour('bad', TZ), null, 'rubbish is not an hour');

/* ── replaying the step function ────────────────────────────────────────── */

const ride = (opening, history) => ({ id: 'r1', name: 'Test', entityType: 'ATTRACTION', opening, history });
const at = (h, m = 0) => {
  // Park-local hour h on 2026-10-30 as a UTC instant (EDT, UTC-4).
  const utc = h + 4;
  const day = utc >= 24 ? 31 : 30;
  return `2026-10-${String(day).padStart(2, '0')}T${String(utc % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
};

// A wait set once in the morning and never changed again must fill every
// later hour. This is the carry-forward: rows are changes, and no change
// means the board still said the same thing.
const steady = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 20 } } },
  [{ time: at(9), status: 'OPERATING', queue: { STANDBY: { waitTime: 30 } } }],
), '2026-10-30', TZ);
is(steady[10], 30, 'a wait set at nine still stands at ten');
is(steady[17], 30, 'and at five in the afternoon');
is(steady[8], 20, 'and the opening value covers the hours before the first row');

// A row that changes something else must not touch the wait. This is the
// mistake that makes a busy-looking hour out of Lightning Lane churn.
const llChurn = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 25 } } },
  [
    { time: at(11, 5), changed: ['queue.PAID_RETURN_TIME.returnStart'], queue: { PAID_RETURN_TIME: { returnStart: 'x' } } },
    { time: at(11, 10), changed: ['queue.PAID_RETURN_TIME.returnEnd'], queue: { PAID_RETURN_TIME: { returnEnd: 'y' } } },
    { time: at(11, 20), changed: ['queue.PAID_RETURN_TIME.price.amount'], queue: { PAID_RETURN_TIME: { price: { amount: 1 } } } },
  ],
), '2026-10-30', TZ);
is(llChurn[11], 25, 'three Lightning Lane changes do not move the standby wait');

// Closed is not zero, and a stale wait left on the board after close is not
// a queue. Without this every evening grows a phantom peak.
const closes = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 40 } } },
  [{ time: at(18), status: 'CLOSED', changed: ['status'] }],
), '2026-10-30', TZ);
is(closes[17], 40, 'open at five');
is(closes[19], null, 'and empty at seven, not forty and not zero');

// Down is the same: the ride is not a 40-minute queue while it is broken.
const breaks = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 40 } } },
  [
    { time: at(13), status: 'DOWN', changed: ['status'] },
    { time: at(15), status: 'OPERATING', changed: ['status'] },
  ],
), '2026-10-30', TZ);
is(breaks[14], null, 'a ride that is down has no wait');
is(breaks[15], 40, 'and picks its wait back up when it reopens');

// The half-hour rule: a change at 10:45 belongs to eleven, not ten, because
// at 10:30 the board still said the old number.
const late = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 10 } } },
  [{ time: at(10, 45), status: 'OPERATING', queue: { STANDBY: { waitTime: 60 } } }],
), '2026-10-30', TZ);
is(late[10], 10, 'a change after the half hour does not reach back into that hour');
is(late[11], 60, 'it lands in the next one');

const early = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 10 } } },
  [{ time: at(10, 15), status: 'OPERATING', queue: { STANDBY: { waitTime: 60 } } }],
), '2026-10-30', TZ);
is(early[10], 60, 'a change before the half hour does count for that hour');

// Rows out of order must not corrupt the replay.
const shuffled = H.sampleDay(ride(
  { status: 'OPERATING', queue: { STANDBY: { waitTime: 5 } } },
  [
    { time: at(15), status: 'OPERATING', queue: { STANDBY: { waitTime: 50 } } },
    { time: at(10), status: 'OPERATING', queue: { STANDBY: { waitTime: 20 } } },
  ],
), '2026-10-30', TZ);
is(shuffled[11], 20, 'rows are replayed in time order whatever order they arrive in');
is(shuffled[16], 50, 'so the later change still wins later');

is(H.sampleDay(null, '2026-10-30', TZ).filter((v) => v !== null).length, 0, 'no entity, no profile');
is(H.sampleDay(ride({}, []), '2026-10-30', TZ).filter((v) => v !== null).length, 0,
  'an entity with no state and no rows has nothing to say');

/* ── a whole park-day ───────────────────────────────────────────────────── */

const day = H.reduceDay([
  ride({ status: 'OPERATING', queue: { STANDBY: { waitTime: 10 } } }, []),
  { ...ride({ status: 'OPERATING', queue: { STANDBY: { waitTime: 30 } } }, []), id: 'r2', name: 'Two' },
  { ...ride({ status: 'OPERATING', queue: { STANDBY: { waitTime: 50 } } }, []), id: 'r3', name: 'Three' },
  // Given a standby wait on purpose. Without one it would be dropped for
  // having posted nothing, and the entity-type filter would never be the
  // reason it is excluded, which is a test that proves nothing.
  { id: 'show1', name: 'A Parade', entityType: 'SHOW',
    opening: { status: 'OPERATING', queue: { STANDBY: { waitTime: 90 } } }, history: [] },
  { ...ride({ status: 'CLOSED' }, []), id: 'r4', name: 'Shut all day' },
], '2026-10-30', TZ);

is(day.counted, 3, 'only attractions that posted a wait are kept');
ok(!day.rides.show1, 'a show is excluded even when it posts a standby wait');
is(H.decode(day.index)[12], 30,
  'and is kept out of the park median, where 90 minutes would have skewed it');
ok(!day.rides.r4, 'and a ride that was shut all day is not stored as 24 empties');
is(H.decode(day.index)[12], 30, 'the park hour is the median across its rides');
is(H.decode(day.rides.r1.h)[12], 10, 'and each ride keeps its own');
is(day.rides.r2.n, 'Two', 'with its name');

is(H.reduceDay([], '2026-10-30', TZ).counted, 0, 'an empty park');
is(H.reduceDay(null, '2026-10-30', TZ).counted, 0, 'and a null one');

/* ── the rollup ─────────────────────────────────────────────────────────── */

// 2025-11-03 is a Monday, 2025-11-08 a Saturday. Two Mondays and one
// Saturday, so the weekday split has something to actually split.
const hourly = (date, v) => ({
  park: 'mk', date,
  index: H.encode(new Array(24).fill(v)),
  rides: { r1: { n: 'Space Mountain', h: H.encode(new Array(24).fill(v)) } },
});

const built = H.buildHours('mk', [
  hourly('2025-11-08', 50),   // Saturday
  hourly('2025-11-03', 10),   // Monday, deliberately out of order
  hourly('2025-11-10', 20),   // Monday
]);

is(built.from, '2025-11-03', 'the window starts at the earliest day whatever order they arrive');
is(built.to, '2025-11-10', 'and ends at the latest');
is(built.days, 3, 'over the days actually held, which need not be contiguous');

is(H.decode(built.index.all)[12], 20, 'the overall profile is the median of 10, 20 and 50');
is(H.decode(built.index.dow[1])[12], 15, 'Monday is the median of its two days only');
is(H.decode(built.index.dow[6])[12], 50, 'Saturday is its one day');
is(H.decode(built.index.dow[0])[12], null, 'and a weekday with no days is empty, not zero');

is(H.decode(built.rides.r1.all)[12], 20, 'a ride gets the same treatment');
is(built.rides.r1.dow.length, 7, 'with all seven weekdays');
is(H.decode(built.rides.r1.dow[1])[12], 15, 'split the same way');
// The name has to change across the days for first-vs-latest to be a real
// distinction. With the same name every day the assertion proves nothing.
const renamed = H.buildHours('mk', [
  { park: 'mk', date: '2025-11-05', index: H.encode([20]), rides: { r1: { n: 'Space Mtn', h: H.encode([20]) } } },
  { park: 'mk', date: '2025-11-03', index: H.encode([10]), rides: { r1: { n: 'Old Name', h: H.encode([10]) } } },
]);
is(renamed.rides.r1.n, 'Space Mtn',
  'a ride takes the name from its most recent day, not the first one seen');

// A ride present in the documents but with nothing in any hour is not a row
// of empty charts.
const sparse = H.buildHours('mk', [{
  park: 'mk', date: '2025-11-03',
  index: H.encode(new Array(24).fill(null)),
  rides: { ghost: { n: 'Ghost', h: H.encode(new Array(24).fill(null)) } },
}]);
ok(!sparse.rides.ghost, 'a ride with no observations at all is left out');

/* ── the per-day grid ──────────────────────────────────────────────────────
 *
 * The profiles above cannot answer "when is this busy in October", because
 * building them throws the date axis away, and a median cannot be
 * re-aggregated afterwards to put it back. So the values go out per day as
 * well, and everything about that is positional: day 40 has to land on day
 * 40 or every month boundary is wrong.
 *
 * `built` holds 3 November, 8 November and 10 November, so the grid is eight
 * days long with gaps, not three days long.
 */
is(built.span, 8, 'the span is the window, inclusive, not the count of days held');
{
  const grid = built.grids.r1.h.split(H.DAY_SEP);
  is(grid.length, 8, 'the grid has a slot per day of the window');
  is(H.decode(grid[0])[12], 10, 'the first day is where it belongs');
  is(grid[1], '', 'a day the archive has nothing for is empty, not missing');
  is(grid[2], '', 'and stays empty rather than collapsing the ones after it');
  is(H.decode(grid[5])[12], 50, 'so the sixth day is 8 November, five days on');
  is(H.decode(grid[7])[12], 20, 'and the last is 10 November');
}

// Leading gaps are the ones that matter: dropping them shifts every day in
// the grid and silently rotates the calendar.
{
  const late = H.buildHours('mk', [
    { park: 'mk', date: '2025-11-03', index: H.encode([]), rides: {} },
    { park: 'mk', date: '2025-11-06', index: H.encode([5]), rides: { r1: { n: 'A', h: H.encode([5]) } } },
  ]);
  const grid = late.grids.r1.h.split(H.DAY_SEP);
  is(grid[0], '', 'a window opening on a day this ride has nothing for keeps its empty slot');
  is(H.decode(grid[3])[0], 5, 'so the day three on is still three on');
}

// Trailing gaps carry no information, and trimming them is what keeps the
// string from growing every time a park closes for a season.
{
  const trailing = H.buildHours('mk', [
    { park: 'mk', date: '2025-11-03', index: H.encode([7]), rides: { r1: { n: 'A', h: H.encode([7]) } } },
    { park: 'mk', date: '2025-11-09', index: H.encode([]), rides: {} },
  ]);
  ok(!trailing.grids.r1.h.endsWith(H.DAY_SEP), 'trailing empty days are trimmed');
  is(trailing.grids.r1.h, '7', 'down to the last day that has anything');
  is(trailing.span, 7, 'while the span still records how wide the window was');
}

/* Ride grids travel beside the rollup, not inside it: all of Magic Kingdom's
 * together are about 566KB against a 1MB document limit, and they grow with
 * every day collected. The park keeps no grid of its own at all, because
 * nothing reads one yet and `{park}_hours` is fetched on every page open.
 */
ok(!('grid' in built), 'the park rollup carries no grid of its own');
is(Object.keys(built.grids), ['r1'], 'every ride that survived gets a grid');
is(built.grids.r1.n, 'Space Mountain', 'carrying the name the rollup settled on');
{
  const grid = built.grids.r1.h.split(H.DAY_SEP);
  is(grid.length, 8, 'positional over the same window as the park');
  is(H.decode(grid[0])[12], 10, 'with the ride\'s own values');
  is(grid[1], '', 'and the same gaps');
  is(H.decode(grid[7])[12], 20, 'to the same last day');
}
ok(!sparse.grids.ghost, 'a ride dropped for posting nothing gets no grid either');

// The grid and the profile have to describe the same ride. If they disagree
// the chart and the chart it filters are two different rides.
is(H.median(H.decode(built.grids.r1.h.split(H.DAY_SEP)[0])),
  H.median(H.decode(built.grids.r1.h.split(H.DAY_SEP)[0])),
  'a grid day decodes to the same 24 slots it was built from');
is(H.decode(built.grids.r1.h.split(H.DAY_SEP)[0]).length, 24, 'a grid day is 24 slots wide');

/* The arithmetic the positions rest on. Inclusive at both ends: a window
 * from the 3rd to the 10th is eight days, not seven.
 */
is(H.dayCount('2025-11-03', '2025-11-10'), 8, 'a span is inclusive at both ends');
is(H.dayCount('2025-11-03', '2025-11-03'), 1, 'one day is one day');
is(H.dayIndex('2025-11-03', '2025-11-03'), 0, 'the first day is index zero');
is(H.dayIndex('2025-11-03', '2025-11-10'), 7, 'and the eighth is index seven');
// Across the US fall-back, where a naive hour count gives 7.04 days.
is(H.dayCount('2026-10-29', '2026-11-05'), 8, 'a span across the DST seam is still eight days');

is(H.buildHours('mk', []), null, 'no documents, no rollup');
is(H.buildHours('mk', null), null, 'and null does not throw');

/* ── the wire format ────────────────────────────────────────────────────── */

is(H.decode(H.encode([0, null, 12.5])), [0, null, 12.5], 'a profile survives the round trip');
ok(H.decode(H.encode([0, null]))[0] === 0 && H.decode(H.encode([0, null]))[1] === null,
  'and zero stays distinct from absent, which is the whole point of the format');
is(H.encode(new Array(24).fill(null)), ','.repeat(23), 'an empty day is 24 empty slots');

/* ── the same answers in somebody else's clock ───────────────────────────
 *
 * Everything above is park-local by construction: dates are strings and the
 * weekday comes from parsing one at noon UTC. That is easy to believe and
 * easy to break. `new Date('2025-11-03').getDay()` is UTC midnight read in
 * the runner's zone, which in any negative-offset zone is the day before, so
 * every Monday files as a Sunday and the weekday split is silently rotated.
 *
 * CI runs in UTC, where that mistake is invisible, so the assertions are
 * re-run in zones where it is not.
 */
const ZONES = ['America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati', 'UTC'];

if (process.env.PARKHOURS_ZONE_CHILD) {
  console.log(`ok ${process.env.TZ}`);
} else {
  const { execFileSync } = await import('node:child_process');
  for (const tz of ZONES) {
    const out = execFileSync(process.execPath, [new URL(import.meta.url).pathname], {
      env: { ...process.env, TZ: tz, PARKHOURS_ZONE_CHILD: '1' }, encoding: 'utf8',
    });
    ok(out.includes(`ok ${tz}`), `the same answers in ${tz}`);
  }
  console.log(`parkhours: ${checks} assertions passed (re-checked in ${ZONES.length} zones)`);
}

process.exit(0);
