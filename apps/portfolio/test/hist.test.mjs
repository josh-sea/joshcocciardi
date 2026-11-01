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
  decodeGrid, cube, toggle, noSelection, isEmptySelection,
  viewMonths, viewWeekdays, viewHours, viewHeat, viewScope, DAY_SEP,
} from '../../disney-trivia/js/hist.js';
import { unwrap, unwrapFields, ageWords } from '../../disney-trivia/js/histdata.js';

const require = createRequire(import.meta.url);
const roll = require('../../../functions/parkrollup.js');
const hoursCjs = require('../../../functions/parkhours.js');

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

/* ── cross-filtering ───────────────────────────────────────────────────────
 *
 * The charts share one fact table so they can filter each other. Two things
 * decide whether that feels right, and both are easy to get backwards.
 *
 *   A chart is aggregated with every filter except its own. Apply a chart's
 *   own filter to itself and it collapses to one bar: nothing to compare
 *   against and nowhere left to click.
 *
 *   Medians are recomputed over the selection, never combined from stored
 *   ones. A median of medians is not a median, and the error is invisible.
 */

const hoursOf = (...vals) => vals.join(',');

/* Four days across two months and two weekdays, with values chosen so a
 * mean and a median differ and so each bucket is distinguishable.
 *
 *   2025-11-03 Mon  Nov  hours 0,1,2 = 10, 20, 30
 *   2025-11-08 Sat  Nov  hours 0,1,2 = 40, 50, 60
 *   2025-12-01 Mon  Dec  hours 0,1,2 = 100, 100, 100
 *   2025-12-06 Sat  Dec  hours 0,1,2 =  1, 1, 1
 */
const GRID = [
  hoursOf(10, 20, 30),      // 2025-11-03 Mon
  '', '', '', '',           // 4th to 7th: nothing
  hoursOf(40, 50, 60),      // 2025-11-08 Sat
  ...new Array(22).fill(''),// 9 Nov to 30 Nov
  hoursOf(100, 100, 100),   // 2025-12-01 Mon
  '', '', '', '',           // 2nd to 5th
  hoursOf(1, 1, 1),         // 2025-12-06 Sat
].join(DAY_SEP);

const C = cube('2025-11-03', decodeGrid(GRID));

is(C.days.length, 34, 'the cube covers every day of the window, gaps included');
is(C.months, ['2025-11', '2025-12'], 'and knows which months it spans');
is(C.days[0].date, '2025-11-03', 'day zero is the window start');
is(C.days[0].dow, 1, 'and 3 November 2025 is a Monday');
is(C.days[5].date, '2025-11-08', 'a gap does not shift the days after it');
is(C.days[1].slots, null, 'a day with nothing is null, not a row of zeroes');

/* Unfiltered. The median of all twelve cells: 1,1,1,10,20,30,40,50,60,
 * 100,100,100 -> the middle pair is 30 and 40.
 */
{
  const scope = viewScope(C, noSelection());
  is(scope.days, 4, 'four days have anything');
  is(scope.cells, 12, 'twelve cells between them');
  is(scope.value, 35, 'and the median is over the cells, not an average of days');
}

/* Selecting a month. The months chart must still show both months, because
 * it is the one chart the month filter is not applied to.
 */
{
  const sel = toggle(noSelection(), 'months', '2025-12');
  const months = viewMonths(C, sel);
  is(months.length, 2, 'the months chart still shows every month');
  is(months.map((m) => m.key), ['2025-11', '2025-12'], 'including the ones not selected');
  is(months[0].value, 35, 'and November is unchanged, so it can be compared and clicked');

  // Everything else narrows to December: 100,100,100 and 1,1,1.
  const hours = viewHours(C, sel);
  is(hours[0], 50.5, 'the hours chart is December only, median of 100 and 1');
  is(viewScope(C, sel).days, 2, 'two December days');
  is(viewScope(C, sel).cells, 6, 'six cells');

  const dows = viewWeekdays(C, sel);
  const mon = dows.find((d) => d.key === '1');
  const sat = dows.find((d) => d.key === '6');
  is(mon.value, 100, 'December Mondays');
  is(sat.value, 1, 'December Saturdays');
  is(mon.days, 1, 'each from one day');
  const tue = dows.find((d) => d.key === '2');
  is(tue.value, null, 'a weekday with nothing selected is empty, not zero');
  is(tue.days, 0, 'and says so');
}

/* Selecting a weekday. Now it is the weekday chart that keeps all seven, and
 * the months chart that narrows: this is the same rule in the other
 * direction, and getting it right once does not mean it is right both ways.
 */
{
  const sel = toggle(noSelection(), 'dows', 6);   // Saturday
  const dows = viewWeekdays(C, sel);
  is(dows.length, 7, 'the weekday chart still shows all seven');
  is(dows.find((d) => d.key === '1').value, 65, 'Monday unchanged at median of 10,20,30,100,100,100');

  const months = viewMonths(C, sel);
  is(months[0].value, 50, 'November narrows to its Saturday: median of 40,50,60');
  is(months[1].value, 1, 'and December to its own');
}

/* Selecting an hour, which is the direction that was impossible before: the
 * hour dimension did not exist in the same table as the months.
 */
{
  const sel = toggle(noSelection(), 'hours', 2);
  const months = viewMonths(C, sel);
  is(months[0].value, 45, 'November at hour 2 is the median of 30 and 60');
  is(months[1].value, 50.5, 'December at hour 2 is the median of 100 and 1');

  const hours = viewHours(C, sel);
  is(hours[0], 25, 'the hours chart itself keeps every hour, hour 0 unchanged');
  is(hours[2], 45, 'and hour 2 is the median of all four days at that hour');
}

/* Two dimensions at once. December AND Saturday is one day, three cells.
 */
{
  let sel = toggle(noSelection(), 'months', '2025-12');
  sel = toggle(sel, 'dows', 6);
  const scope = viewScope(C, sel);
  is(scope.days, 1, 'one day matches both');
  is(scope.value, 1, 'with its own median');
  // The months chart drops the month filter but keeps the weekday one.
  const months = viewMonths(C, sel);
  is(months[0].value, 50, 'November shows its Saturdays, not all of November');
  // And the weekday chart drops the weekday filter but keeps the month one.
  const dows = viewWeekdays(C, sel);
  is(dows.find((d) => d.key === '1').value, 100, 'Monday shows December only');
}

/* The heatmap groups by weekday AND hour, so neither of those filters
 * applies to it, but the month filter does.
 */
{
  const sel = toggle(noSelection(), 'months', '2025-11');
  const heat = viewHeat(C, sel);
  is(heat.rows.length, 7, 'seven rows');
  is(heat.rows[0].key, '1', 'Monday first for reading');
  is(heat.top, 60, 'scaled to the busiest cell in November, not in the whole window');
  const monday = heat.rows[0].cells;
  is(monday[0].value, 10, 'Monday at midnight is November Monday');
  is(monday[0].pct, 17, 'scaled against 60');
  is(monday[3].value, null, 'an hour with nothing is empty');
  is(monday[3].pct, null, 'and has no height rather than a zero one');
  const saturday = heat.rows.find((r) => r.key === '6').cells;
  is(saturday[2].value, 60, 'Saturday at hour 2 is the top cell');
  is(saturday[2].pct, 100, 'so it is the full-strength one');
}

// Unfiltered the heat scale is the whole window, which is what makes a quiet
// month read quiet rather than being stretched to fill its own range.
/* The heatmap groups by weekday and by hour, so NEITHER of those filters
 * applies to it. Only testing it under a month selection let a real bug
 * through: `skip` was a single name compared with ===, the heatmap passed
 * two names, and so it applied both of the filters it was meant to ignore.
 * Selecting Saturday collapsed it to one row.
 */
{
  const sel = toggle(noSelection(), 'dows', 6);   // Saturday
  const heat = viewHeat(C, sel);
  is(heat.rows.length, 7, 'selecting a weekday leaves all seven rows');
  const monday = heat.rows.find((r) => r.key === '1').cells;
  is(monday[0].value, 55, 'and Monday still carries its own values');
  const saturday = heat.rows.find((r) => r.key === '6').cells;
  is(saturday[0].value, 20.5, 'alongside the Saturday that was selected');
}
{
  const sel = toggle(noSelection(), 'hours', 2);
  const heat = viewHeat(C, sel);
  const monday = heat.rows.find((r) => r.key === '1').cells;
  is(monday.length, 24, 'selecting an hour leaves all twenty-four columns');
  is(monday[0].value, 55, 'including the hours that were not selected');
  is(monday[2].value, 65, 'as well as the one that was');
}
// Both at once, which is the state the bug made unreachable.
{
  let sel = toggle(noSelection(), 'dows', 6);
  sel = toggle(sel, 'hours', 2);
  const heat = viewHeat(C, sel);
  is(heat.rows.length, 7, 'both together still leave the whole grid');
  is(heat.rows.find((r) => r.key === '1').cells[0].value, 55, 'untouched');
}

// Unfiltered the scale is the busiest cell as drawn, which is the largest
// median of a weekday-hour bucket (Monday at 2am, median of 30 and 100) and
// not the largest raw value anywhere in the window. Scaling to a raw value
// no cell displays would leave the darkest cell short of full strength.
is(viewHeat(C, noSelection()).top, 65, 'unfiltered, the scale is the busiest cell drawn');

/* Toggling. A second click on the same bar clears it, which is how a chart
 * that is also a control stops being a trap.
 */
{
  const one = toggle(noSelection(), 'months', '2025-11');
  is(one.months, ['2025-11'], 'a click selects');
  const off = toggle(one, 'months', '2025-11');
  is(off.months, [], 'and a second click on the same bar clears it');
  const two = toggle(one, 'months', '2025-12');
  is(two.months, ['2025-11', '2025-12'], 'while a different bar adds to the selection');
  is(one.months, ['2025-11'], 'without mutating the selection it was given');
  // Numbers and strings arrive from dataset attributes as strings either way.
  is(toggle(toggle(noSelection(), 'dows', 6), 'dows', '6').dows, [],
    'a weekday selected as a number is cleared by the same value as a string');
}

ok(isEmptySelection(noSelection()), 'an empty selection is empty');
ok(isEmptySelection(null), 'and so is nothing at all');
ok(!isEmptySelection(toggle(noSelection(), 'hours', 9)), 'one hour is not empty');

/* Two months selected at once. This is the case a stored per-month profile
 * could never answer correctly, because medians do not combine: the right
 * answer is the median of all twelve cells, not the median of two medians.
 */
{
  let sel = toggle(noSelection(), 'months', '2025-11');
  sel = toggle(sel, 'months', '2025-12');
  is(viewScope(C, sel).value, 35, 'two months selected gives the median of every cell in both');
  is(viewScope(C, sel).value, viewScope(C, noSelection()).value,
    'which here is the same as selecting neither, since that is all the data');
}

/* The wire format. A grid short of its window is normal: trailing empty days
 * are trimmed on write, so decoding must not invent them.
 */
is(decodeGrid(''), [], 'an empty grid decodes to nothing');
is(decodeGrid(null), [], 'and so does a missing one');
is(decodeGrid('1,2;;3,4').length, 3, 'a grid keeps its interior gaps');
is(decodeGrid('1,2;;3,4')[1], null, 'as nulls');
is(decodeGrid('1,2;;3,4')[2], [3, 4], 'and the day after a gap is still in place');
{
  // Built by the function, read by the browser: the seam this suite exists
  // for. The same grid string has to mean the same days on both sides.
  const r = (v) => ({ r1: { n: 'Space Mountain', h: hoursCjs.encode(v) } });
  const built = hoursCjs.buildHours('mk', [
    { park: 'mk', date: '2025-11-03', index: hoursCjs.encode([10, 20]), rides: r([10, 20]) },
    { park: 'mk', date: '2025-11-06', index: hoursCjs.encode([40]), rides: r([40]) },
  ]);
  const decoded = decodeGrid(built.grids.r1.h);
  is(decoded.length, 4, 'the browser sees the same number of days the function wrote');
  is(decoded[0][0], 10, 'with the first day in place');
  is(decoded[1], null, 'the gap preserved');
  is(decoded[3][0], 40, 'and the last day where the function put it');
  const c = cube(built.from, decoded);
  is(c.days[3].date, '2025-11-06', 'so a cube built on it dates the last day correctly');
}

console.log(`hist: ${checks} assertions passed`);
process.exit(0);
