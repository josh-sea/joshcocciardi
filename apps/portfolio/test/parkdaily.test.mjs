/* Park Planner: the wait-time archive.
 *
 * What this suite is defending. The archive is written once per park-day and
 * then kept for years, so a shaping mistake is not a bug you notice and fix:
 * it is a year of data that quietly means something other than you think.
 * And `pick` decides which days we ever ask for, so a fencepost there loses
 * days silently, inside the only window in which they can still be read.
 *
 * Pure arithmetic on fixtures. No emulator, no network, no install.
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { nudge, shouldNudge, ENDPOINT } from '../../disney-trivia/js/history.js';

const require = createRequire(import.meta.url);
const {
  addDays, median, leanRide, leanDay, parkIndex,
  daysInWindow, pick, daysToFetch, isDate, WINDOW_MAX,
} = require('../../../functions/parkdaily.js');

let checks = 0;
const is = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const ok = (v, msg) => { assert.ok(v, msg); checks++; };

/* ── dates ──────────────────────────────────────────────────────────────── */

is(addDays('2026-10-31', 1), '2026-11-01', 'rolls into a new month');
is(addDays('2026-01-01', -1), '2025-12-31', 'rolls back a year');
is(addDays('2024-02-28', 1), '2024-02-29', 'knows a leap year');
is(addDays('2026-02-28', 1), '2026-03-01', 'knows a common year');

// The reason dates are parsed at noon UTC rather than at midnight. These four
// pass trivially when the runner is itself in UTC, which CI is, so on their
// own they prove nothing: see the zone sweep at the bottom, which is what
// actually holds the parsing honest.
is(addDays('2026-10-31', 1), '2026-11-01', 'crosses the autumn DST seam');
is(addDays('2026-11-01', 1), '2026-11-02', 'and the day after it');
is(addDays('2026-03-07', 1), '2026-03-08', 'crosses the spring DST seam');
is(addDays('2026-03-08', 1), '2026-03-09', 'and the day after it');

ok(isDate('2026-10-31'), 'accepts a real date');
ok(!isDate('2026-10-3'), 'rejects a short day');
ok(!isDate(''), 'rejects empty');
ok(!isDate(null), 'rejects null');

/* ── median ─────────────────────────────────────────────────────────────── */

is(median([5]), 5, 'one value');
is(median([10, 20]), 15, 'two values average');
is(median([30, 10, 20]), 20, 'odd count, unsorted input');
is(median([40, 10, 20, 30]), 25, 'even count, unsorted input');
is(median([]), null, 'nothing is null, not zero or NaN');
is(median([null, undefined, 10, NaN, 20]), 15, 'ignores holes rather than counting them as zero');
is(median(['12', 10]), 10, 'a numeric string is not a number');

/* ── one ride's day ─────────────────────────────────────────────────────── */

// Shaped like the real payload: a whole-day block plus an inParkHours copy
// restricted to the park's published hours.
const sdmt = {
  id: 'ride-sdmt',
  name: 'Seven Dwarfs Mine Train',
  days: [{
    date: '2026-10-30',
    operatingMinutes: 957,
    downMinutes: 0,
    standby: { min: 7, p50: 45, mean: 44, p90: 60, max: 90 },
    inParkHours: {
      operatingMinutes: 928,
      downMinutes: 0,
      standby: { min: 10, p50: 30, mean: 31, p90: 45, max: 50 },
    },
  }],
};

const row = leanRide(sdmt, '2026-10-30');
is(row.n, 'Seven Dwarfs Mine Train', 'keeps the name, so the archive stands alone');
is(row.p50, 30, 'prefers the in-park-hours median');
is(row.p90, 45, 'prefers the in-park-hours p90');
is(row.max, 50, 'prefers the in-park-hours max');
is(row.op, 928, 'prefers the in-park-hours operating minutes');

// This is the whole point of preferring inParkHours, so it gets said twice:
// the whole-day median is 45 and the real one is 30. A wait posted at 2am on
// a day the park shut at six is a feed artefact, and taking the whole-day
// figure would have us record the park as half again as busy as it was.
ok(row.p50 < sdmt.days[0].standby.p50, 'the whole-day figure would have been higher');

is(leanRide(sdmt, '2026-10-29'), null, 'a day the entity has no row for');
is(leanRide({ id: 'x', name: 'X', days: [] }, '2026-10-30'), null, 'no days at all');

// Falls back to the whole-day block when there are no published hours, which
// is what a day with no OPERATING schedule entry actually looks like.
const noHours = {
  id: 'r2', name: 'Astro Orbiter',
  days: [{ date: '2026-10-30', operatingMinutes: 500, downMinutes: 12, standby: { p50: 15, p90: 20 } }],
};
is(leanRide(noHours, '2026-10-30').p50, 15, 'falls back to the whole day');
is(leanRide(noHours, '2026-10-30').down, 12, 'carries downtime');

// A ride that never posted a wait but did run is still worth a row: the
// archive has to be able to say "open, no queue" rather than leaving a hole
// that reads the same as "we were not looking".
const noWait = { id: 'r3', name: 'Walkthrough', days: [{ date: '2026-10-30', operatingMinutes: 600 }] };
const walk = leanRide(noWait, '2026-10-30');
ok(walk && walk.op === 600, 'keeps an open ride with no queue');
ok(walk && walk.p50 === undefined, 'but invents no median for it');

// Nothing at all: no wait, no operating time. That is a hole, and a hole is
// what it should stay.
is(leanRide({ id: 'r4', name: 'Shut', days: [{ date: '2026-10-30', downMinutes: 0 }] }, '2026-10-30'),
  null, 'a day with neither a wait nor operating time is not a row');

// Absent numbers must be absent, not null or zero: a stored zero would read
// as "no wait at all" forever after.
const partial = { id: 'r5', name: 'Partial', days: [{ date: '2026-10-30', operatingMinutes: 100, standby: { p50: 20 } }] };
const pr = leanRide(partial, '2026-10-30');
is(pr.p50, 20, 'keeps what is there');
ok(!('p90' in pr), 'leaves out what is not, rather than storing null');
ok(!('max' in pr), 'same for max');

/* ── the park's day ─────────────────────────────────────────────────────── */

const entities = [
  sdmt, noHours, noWait,
  { id: 'r6', name: 'Big Thunder', days: [{ date: '2026-10-30', operatingMinutes: 700, standby: { p50: 25, p90: 30 } }] },
  { id: 'r7', name: 'Haunted Mansion', days: [{ date: '2026-10-30', operatingMinutes: 700, standby: { p50: 35, p90: 40 } }] },
  { id: 'r8', name: 'Elsewhere', days: [{ date: '2026-10-29', standby: { p50: 99 } }] },
  null,
  { name: 'no id', days: [] },
];

const day = leanDay(entities, '2026-10-30');
is(Object.keys(day.rides).length, 5, 'one row per entity with something that day');
ok(!day.rides['r8'], 'ignores an entity whose only row is another day');
is(day.index.waits, 4, 'counts only the rides that posted a wait');
is(day.index.rides, 5, 'but reports every row it stored');

// Medians of 30, 15, 25, 35 → 27.5. A mean would be 26.25 and would move
// whenever a headliner broke down; the point of the index is that it tracks
// the park, not the worst-behaved ride in it.
is(day.index.p50, 27.5, 'park index is the median of the rides own medians');

is(leanDay([], '2026-10-30'), { rides: {}, index: { rides: 0, waits: 0, p50: null, p90: null } },
  'an empty park is empty, not a crash');
is(leanDay(null, '2026-10-30').index.rides, 0, 'null entities');
is(parkIndex(null).rides, 0, 'null rides');

/* ── which days to fetch ────────────────────────────────────────────────── */

// Today is never fetched: it is still being recorded.
const w = daysInWindow({ today: '2026-10-31', earliest: '2026-10-25' });
is(w[0], '2026-10-25', 'starts at the earliest day allowed');
is(w[w.length - 1], '2026-10-30', 'stops at yesterday, never today');
is(w.length, 6, 'six days, inclusive at both ends');

// `through` can only pull the end in, never push it past yesterday, or a
// backfill with a to= in the future would ask for days that do not exist.
is(daysInWindow({ today: '2026-10-31', earliest: '2026-10-25', through: '2026-12-01' }).at(-1),
  '2026-10-30', 'a future `through` is clamped to yesterday');
is(daysInWindow({ today: '2026-10-31', earliest: '2026-10-25', through: '2026-10-27' }).at(-1),
  '2026-10-27', 'a `through` inside the window is honoured');

is(daysInWindow({ today: '2026-10-31', earliest: '2026-11-05' }), [], 'floor after the newest day is empty');
is(daysInWindow({ today: 'nonsense', earliest: '2026-10-25' }), [], 'a bad today yields nothing');
ok(daysInWindow({ today: '2026-10-31', earliest: '1990-01-01' }).length === WINDOW_MAX,
  'an absurd range is capped rather than looping forever');

// The cap must not be mistakable for a plan limit. A Pro key reads 400 days
// and a full-archive one reaches 2021, so a 400-wide guard would clip a real
// window while looking like a sanity check.
ok(WINDOW_MAX > 400, 'the guard is wider than any plan it could be confused with');
is(daysInWindow({ today: '2026-10-31', earliest: '2025-09-26' }).length, 400,
  "a Pro-sized window is not clipped");
// 1946, not 1945: the window is inclusive at both ends, floor through
// yesterday. 2021-07-03 to 2026-10-30 is a difference of 1945 days and a
// count of 1946, and the first number I wrote here was the difference.
is(daysInWindow({ today: '2026-10-31', earliest: '2021-07-03' }).length, 1946,
  'nor is a full-archive one');

// The ordering bug this suite exists for. A full cap of held days must not
// hide a gap behind them: cap-then-filter returns nothing here, and the day
// we are missing is never asked for while it can still be read.
const held = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'];
is(pick(w, held, 4), ['2026-10-29', '2026-10-30'],
  'the cap applies after dropping held days, not before');
is(pick(w, [], 2), ['2026-10-25', '2026-10-26'], 'oldest first, so a short run stays contiguous');
is(pick(w, w, 8), [], 'nothing missing');
is(pick(w, new Set(held), 4), ['2026-10-29', '2026-10-30'], 'accepts a Set as well as an array');
is(pick(w, [], 0), [], 'a zero cap asks for nothing');

// A gap in the middle is found, which is the case a "newest day" cursor alone
// would miss entirely.
is(pick(w, ['2026-10-25', '2026-10-26', '2026-10-28', '2026-10-29', '2026-10-30'], 8),
  ['2026-10-27'], 'finds a hole in the middle');

is(daysToFetch({ today: '2026-10-31', earliest: '2026-10-25', have: held, limit: 4 }),
  ['2026-10-29', '2026-10-30'], 'the one-call form agrees with the two-step form');

/* ── the poke ───────────────────────────────────────────────────────────
 *
 * The browser side decides only whether to poke the endpoint. Getting this
 * wrong is cheap in one direction and expensive in the other: poking too
 * often wastes reads, while never poking means days age out of the 30-day
 * window and are gone for good.
 */
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };

  ok(shouldNudge(null, '2026-10-31'), 'a device that has never poked, pokes');
  ok(!shouldNudge('2026-10-31', '2026-10-31'), 'but not twice in the same park-day');
  ok(shouldNudge('2026-10-30', '2026-10-31'), 'and again once the park-day rolls over');
  ok(!shouldNudge('2026-10-30', null), 'no date, no poke');

  // A park-local afternoon. The device's own zone must not come into it.
  const noon = new Date('2026-10-31T16:00:00Z');
  const calls = [];
  const okFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ stored: 2 }) }; };

  const first = await nudge({ now: noon, fetchImpl: okFetch });
  is(calls.length, 1, 'the first open of the day pokes once');
  is(calls[0].url, ENDPOINT, 'at the same-origin rewrite, so no CORS and no project id in the client');
  is(calls[0].opts.method, 'GET', 'a plain GET');
  ok(!('body' in calls[0].opts), 'sends no body: the endpoint takes nothing from us');
  ok(first.ran, 'and reports what the endpoint did');

  const second = await nudge({ now: noon, fetchImpl: okFetch });
  is(calls.length, 1, 'a second open on the same day does not poke again');
  ok(second.skipped, 'and says why');

  // The asymmetry worth pinning: a failed poke still spends the day. A phone
  // with no signal in a queue is the planner's normal state, and retrying on
  // every load would be a request per page view for as long as it lasts.
  store.clear();
  let tries = 0;
  const deadFetch = async () => { tries++; throw new Error('offline'); };
  const failed = await nudge({ now: noon, fetchImpl: deadFetch });
  ok(failed.failed, 'an offline poke reports failure');
  is(tries, 1, 'having tried once');
  await nudge({ now: noon, fetchImpl: deadFetch });
  is(tries, 1, 'and does not try again on the next load');

  // A non-OK response is reported, not thrown: the planner must not care.
  store.clear();
  const res503 = await nudge({ now: noon, fetchImpl: async () => ({ ok: false, status: 503 }) });
  is(res503.failed, 503, 'a server error comes back as a value, not an exception');

  // The park's clock, not the device's. 00:30 UTC on 1 November is still
  // 31 October in Florida, so it is the same park-day as the run above.
  store.clear();
  await nudge({ now: new Date('2026-10-31T16:00:00Z'), fetchImpl: okFetch });
  const before = calls.length;
  await nudge({ now: new Date('2026-11-01T00:30:00Z'), fetchImpl: okFetch });
  is(calls.length, before, 'still the same park-day at half past midnight UTC');

  delete globalThis.localStorage;
}

/* ── the same arithmetic, in somebody else's clock ───────────────────────
 *
 * Every date here is park-local and handled as a string, so none of it may
 * depend on the zone the process happens to run in. That is easy to believe
 * and easy to get wrong: parse 'YYYY-MM-DD' without a zone and you get local
 * midnight, which in a UTC+9 zone is the *previous* UTC day, and adding a day
 * then lands you back where you started.
 *
 * CI runs in UTC, where that mistake is invisible. So the date assertions are
 * re-run in a child process in two zones that would expose it: Tokyo, where
 * local midnight is the day before in UTC, and Kiritimati at UTC+14, the
 * furthest ahead there is. A server moving region must not silently shift
 * which day a wait time belongs to.
 */
const ZONES = ['Asia/Tokyo', 'Pacific/Kiritimati', 'America/New_York', 'UTC'];

if (process.env.PARKDAILY_ZONE_CHILD) {
  // Re-run as a child: the assertions above have already executed by the
  // time we get here, under the zone the parent set. Reaching this line at
  // all means they passed.
  console.log(`ok ${process.env.TZ}`);
} else {
  for (const tz of ZONES) {
    const out = execFileSync(process.execPath, [new URL(import.meta.url).pathname], {
      env: { ...process.env, TZ: tz, PARKDAILY_ZONE_CHILD: '1' },
      encoding: 'utf8',
    });
    ok(out.includes(`ok ${tz}`), `the same answers in ${tz}`);
  }
  console.log(`parkdaily: ${checks} assertions passed (date arithmetic re-checked in ${ZONES.length} zones)`);
}

/* Exit explicitly, as every suite here does. Not decoration: these files are
 * .js modules under a package.json that declares no "type", so Node emits a
 * MODULE_TYPELESS_PACKAGE_JSON warning on each one it loads. The warning is
 * queued on the next tick, and exiting drops it. That is the only reason the
 * other suites look clean, so this one does not get to pretend otherwise.
 * Declaring the type properly means either a stray package.json inside a
 * directory that is published as static files, or a root-level change across
 * the whole monorepo. Neither is worth it for a cosmetic warning.
 *
 * assert throws on failure, so a failing run never reaches this line.
 */
process.exit(0);
