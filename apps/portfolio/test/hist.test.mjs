/* Park Planner: the history screen's arithmetic.
 *
 * Two implementations meet in this feature and they have to agree exactly.
 * The Cloud Function (CommonJS) encodes a year of waits into a string; the
 * browser (ESM) decodes it and indexes into it by date. If they disagree
 * about where day N sits, every chart is silently shifted and still looks
 * perfectly plausible. So the seam between them is what most of this suite
 * is about, not either side alone.
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {
  decodeSeries, median, byMonth, byWeekday, slice, rangeStats, compareRange,
  rankRides, extremes, bars, indexOfDate, dateAt, addDays,
} from '../../disney-trivia/js/hist.js';
import { unwrap, unwrapFields, ageWords } from '../../disney-trivia/js/histdata.js';

const require = createRequire(import.meta.url);
const roll = require('../../../functions/parkrollup.js');

let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };

/* ── the seam: encode there, decode here ────────────────────────────────── */

const trip = [15, 12.5, null, 0, 47.5, null];
is(decodeSeries(roll.encodeSeries(trip)), trip,
  'a series survives the trip from the function to the browser');

// The distinction the whole format turns on. A ride posting a genuine zero
// and a day nobody recorded are different facts, and a format that collapsed
// them would quietly drag every median down.
const zeroes = decodeSeries(roll.encodeSeries([0, null, 0]));
is(zeroes, [0, null, 0], 'zero survives as zero and absent stays absent');
ok(zeroes[0] === 0 && zeroes[1] === null, 'and they are not the same value');

is(decodeSeries(roll.encodeSeries([12.5, 37.5])), [12.5, 37.5], 'halves survive');
is(decodeSeries(''), [], 'an empty series is empty, not [null]');
is(decodeSeries(undefined), [], 'a missing series is empty');

// Trailing empties are trimmed to save space, which must not move anything.
// A ride that stopped reporting in March still has to read correctly for
// January, or its whole chart slides.
const stopped = [20, 25, 30, null, null, null];
const trimmed = roll.trimTail(roll.encodeSeries(stopped));
ok(!trimmed.endsWith(','), 'the tail is trimmed');
is(decodeSeries(trimmed), [20, 25, 30], 'and what is left still starts at day 0');
is(decodeSeries(trimmed)[2], 30, 'so an early day reads the same either way');

// Leading empties are not trimmable: they are what makes a series positional.
const late = roll.trimTail(roll.encodeSeries([null, null, 40]));
is(decodeSeries(late), [null, null, 40], 'a ride that opened late keeps its offset');

/* ── the seam: day numbering ─────────────────────────────────────────────── */

// The function counts days by stepping a date; the browser divides a
// millisecond difference. Across a year with two DST changes in it, those are
// two different ways to be wrong, so they are checked against each other
// rather than each against my arithmetic.
const FROM = '2025-09-27';
for (const date of ['2025-09-27', '2025-11-01', '2025-11-02', '2025-12-31',
                    '2026-03-07', '2026-03-08', '2026-06-15', '2026-10-30']) {
  is(indexOfDate(FROM, date), roll.dayIndex(FROM, date), `both agree on where ${date} sits`);
}
is(roll.dayCount(FROM, '2026-10-30'), 399, 'and on how many days that window holds');
is(indexOfDate(FROM, '2026-10-30') + 1, 399, 'which is the last index plus one');

// Round-tripping a date through its own offset must be the identity.
for (const i of [0, 1, 35, 36, 162, 163, 398]) {
  is(indexOfDate(FROM, dateAt(FROM, i)), i, `offset ${i} round-trips`);
}
is(indexOfDate(FROM, '2025-09-26'), -1, 'a date before the window is not an index');

/* ── median ─────────────────────────────────────────────────────────────── */

is(median([10, 20, 30]), 20, 'odd count');
is(median([10, 20, 30, 40]), 25, 'even count averages the middle pair');
is(median([30, 10, 20]), 20, 'unsorted input');
is(median([]), null, 'nothing is null');
is(median([null, 10, null, 20]), 15, 'holes are skipped, not counted as zero');
is(median([0, 0, 10]), 0, 'but a real zero counts');

/* ── building a rollup ──────────────────────────────────────────────────── */

const day = (date, p50, rides) => ({
  park: 'mk', date,
  index: { p50, p90: p50 + 10, rides: Object.keys(rides).length, waits: Object.keys(rides).length },
  rides,
});

const built = roll.build('mk', [
  // Deliberately out of order: the archive is read with a query, which
  // promises nothing about order.
  day('2025-11-03', 20, { r1: { n: 'Space Mountain', p50: 25, p90: 40 }, r2: { n: 'Dumbo', p50: 10, p90: 15 } }),
  day('2025-11-01', 15, { r1: { n: 'Space Mtn', p50: 20, p90: 35 } }),
  day('2025-11-02', 25, { r1: { n: 'Space Mountain', p50: 30, p90: 45 },
                          r3: { n: 'Walkthrough', op: 600 } }),
]);

is(built.from, '2025-11-01', 'from is the earliest day whatever order they arrived');
is(built.to, '2025-11-03', 'to is the latest');
is(built.days, 3, 'and the window is inclusive');
is(decodeSeries(built.index.p50), [15, 25, 20], 'the park series is in date order');

is(built.rides.r1.n, 'Space Mountain',
  'a ride takes its name from the most recent day, not the first seen');
is(decodeSeries(built.rides.r1.p50), [20, 30, 25], 'its series is positional');
is(decodeSeries(built.rides.r2.p50), [null, null, 10],
  'a ride that only appears later keeps its leading gap');
ok(!built.rides.r3, 'a ride that never posted a wait is not in the rollup');

// A hole in the middle has to stay a hole.
const gapped = roll.build('mk', [day('2025-11-01', 15, {}), day('2025-11-03', 20, {})]);
is(decodeSeries(gapped.index.p50), [15, null, 20], 'a missing day is a gap, not a shift');
is(roll.build('mk', []), null, 'no documents, no rollup');
is(roll.build('mk', null), null, 'and null does not throw');

/* ── grouping ───────────────────────────────────────────────────────────── */

// 2025-11-03 is a Monday. Seven days, one per weekday, so each bucket holds
// exactly one value and the mapping is checkable by eye.
const week = [10, 20, 30, 40, 50, 60, 70];
const wd = byWeekday(week, '2025-11-03');
is(wd.map((r) => r.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  'weekdays start on Monday, so the weekend is not split across the chart');
is(wd.map((r) => r.value), [10, 20, 30, 40, 50, 60, 70], 'and each day lands in its own bucket');

const across = byMonth([10, 20, 30], '2025-10-30');
is(across.map((r) => r.key), ['2025-10', '2025-11'], 'months split on the real boundary');
is(across[0].value, 15, 'October gets the 30th and 31st');
is(across[1].value, 30, 'November gets the 1st');
is(across[0].days, 2, 'and the day counts are honest');

const holey = byMonth([10, null, null], '2025-10-30');
is(holey[1].value, null, 'a month with no data is null, not zero');
is(holey[1].days, 0, 'and says it has nothing');

/* ── ranges ─────────────────────────────────────────────────────────────── */

const year = Array.from({ length: 399 }, (_, i) => (i >= 40 && i <= 45 ? 40 : 10));
is(slice(year, FROM, dateAt(FROM, 40), dateAt(FROM, 45)).length, 6,
  'a range is inclusive at both ends');

const cmp = compareRange(year, FROM, dateAt(FROM, 40), dateAt(FROM, 45));
is(cmp.median, 40, 'the range median');
is(cmp.overall, 10, 'against the whole window');
is(cmp.delta, 30, 'the difference in minutes');
is(cmp.pct, 300, 'and as a percentage, which is what makes a number mean anything');

const empty = compareRange(year, FROM, '2030-01-01', '2030-01-05');
is(empty.median, null, 'a range outside the window has no median');
is(empty.pct, null, 'and no percentage rather than a misleading zero');

/* ── rides ──────────────────────────────────────────────────────────────── */

const ranked = rankRides({
  a: { n: 'Slinky Dog Dash', p50: roll.encodeSeries([55, 60, 50]) },
  b: { n: 'Alien Swirling Saucers', p50: roll.encodeSeries([10, 15, 10]) },
  c: { n: 'Closed All Window', p50: roll.encodeSeries([null, null, null]) },
}, '2025-11-01', '2025-11-01', '2025-11-03');

is(ranked.map((r) => r.name), ['Slinky Dog Dash', 'Alien Swirling Saucers'],
  'ranked by median, busiest first');
ok(!ranked.some((r) => r.name === 'Closed All Window'),
  'a ride with nothing in range is left out, not sorted to the bottom as a zero');
is(ranked[0].median, 55, 'with its median in the chosen range');

const ex = extremes([30, null, 10, 75], '2025-11-01');
is(ex.best, { value: 10, date: '2025-11-03' }, 'the quietest day, with its date');
is(ex.worst, { value: 75, date: '2025-11-04' }, 'and the busiest');
is(extremes([null, null], '2025-11-01'), { best: null, worst: null }, 'nothing has no extremes');

/* ── bars ───────────────────────────────────────────────────────────────── */

const drawn = bars([{ value: 10 }, { value: 40 }, { value: null }, { value: 20 }]);
is(drawn.map((r) => r.pct), [25, 100, 0, 50], 'scaled to the tallest in its own set');
is(bars([{ value: null }]).map((r) => r.pct), [0], 'all-null does not divide by zero');
is(bars([]).length, 0, 'and an empty set draws nothing');

// `=== null` is not enough here. Math.max coerces null to 0, so that guard
// did nothing at all, and an undefined would have come through as NaN and
// taken the whole chart with it. Ride rows carry `median`, not `value`, so
// handing them to bars is a one-character mistake away.
is(bars([{ value: 10 }, { median: 40 }]).map((r) => r.pct), [100, 0],
  'a row with no value at all is absent, not NaN');
is(bars([{ value: 10 }, { value: NaN }]).map((r) => r.pct), [100, 0], 'NaN is absent too');
is(bars([{ value: undefined }, { value: 20 }]).map((r) => r.pct), [0, 100],
  'and undefined does not become the tallest bar');
ok(bars([{ median: 40 }]).every((r) => Number.isFinite(r.pct)),
  'every pct is a real number whatever came in');

/* ── the REST unwrapper ─────────────────────────────────────────────────── */

is(unwrap({ stringValue: '15,20' }), '15,20', 'a string');
is(unwrap({ integerValue: '399' }), 399, 'an integer arrives as a string and leaves as a number');
is(unwrap({ doubleValue: 12.5 }), 12.5, 'a double');
is(unwrap({ nullValue: null }), null, 'a null');
is(unwrapFields({ a: { mapValue: { fields: { b: { stringValue: 'x' } } } } }), { a: { b: 'x' } },
  'a nested map');
is(unwrap({ arrayValue: { values: [{ integerValue: '1' }] } }), [1], 'an array');
is(unwrapFields({}), {}, 'no fields');
is(unwrapFields(undefined), {}, 'missing fields do not throw');

is(ageWords(0), 'just now', 'age in words');
is(ageWords(3 * 86400000), '3 days ago', 'and stays vague when precision would be false');

console.log(`hist: ${checks} assertions passed`);
process.exit(0);
