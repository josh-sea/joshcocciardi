/* Park Planner: what is remembered, and for how long.
 *
 * The bug this file is about is not a crash. Everything the planner knew was
 * filed under a date, including the things that are not facts about a date:
 * your must-dos, your pace, your wait limit. So every morning they were gone
 * and you set them again, and nothing anywhere looked broken.
 *
 * Which makes the migration the part that matters. Changing where must-dos
 * live is easy; carrying across the ones already starred, from whichever
 * mornings they were starred on, is the bit that is silently wrong if nobody
 * checks it.
 */

import assert from 'node:assert/strict';
import {
  PREFS_KEY, dayKey, parseDayKey, freshPrefs, freshDay, readPrefs, readDay,
  llWindow, byStart, migrate, LL_MINUTES,
  dayDocId, withStamp, stampOf, pickNewer, adopt,
} from '../../disney-trivia/js/plan.js';
import { DEFAULT_PACE } from '../../disney-trivia/js/park.js';

let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };

/* ── keys ──────────────────────────────────────────────────────────────── */

is(dayKey('2026-11-06', 'mk'), 'parkPlanner.day.2026-11-06.mk', 'a day is filed by date and park');
ok(!PREFS_KEY.includes('2026'), 'preferences are not filed under a date');
ok(!PREFS_KEY.match(/\.(mk|ep|hs|ak)$/), 'nor under a park');

is(parseDayKey('parkPlanner.day.2026-11-06.mk'), { date: '2026-11-06', park: 'mk' },
  'a day key reads back as its date and park');
is(parseDayKey(PREFS_KEY), null, 'the preferences key is not a day');
is(parseDayKey('parkPlanner.park'), null, 'nor is the remembered park');
is(parseDayKey('parkPlanner.day.6-11-2026.mk'), null, 'nor a date the wrong way round');
is(parseDayKey('somethingelse'), null, 'nor anything else in storage');
is(parseDayKey(null), null, 'and nothing at all does not throw');

// The old key and the new day key are the same shape on purpose, so a
// migrated day is written back over itself.
is(parseDayKey(dayKey('2025-12-25', 'ep')), { date: '2025-12-25', park: 'ep' },
  'the key this module writes is one it can read');

/* ── reading back what is stored ──────────────────────────────────────────
 *
 * Storage is not a contract. A half-written record, or one from a version
 * that stored something else, has to come back usable rather than throwing
 * on the first `.includes`.
 */

is(readPrefs(null), freshPrefs(), 'nothing stored gives the defaults');
is(readPrefs('nonsense'), freshPrefs(), 'and so does a string');
is(readPrefs({}).pace, DEFAULT_PACE, 'a missing pace falls back to the default');
is(readPrefs({ pace: 'brisk' }).pace, DEFAULT_PACE, 'and so does a pace that is not a number');
is(readPrefs({ mustDo: ['a', 2, null, 'b'] }).mustDo, ['a', 'b'],
  'must-dos that are not ride ids are dropped rather than crashing a lookup');
is(readPrefs({ maxWaitMin: null }).maxWaitMin, null, 'no wait limit stays no wait limit');
is(readPrefs({ maxWaitMin: 45 }).maxWaitMin, 45, 'and a real one survives');
is(readPrefs({ skipHeld: false }).skipHeld, false, 'a false setting is kept, not treated as missing');
is(readPrefs({ skipHeld: 'no' }).skipHeld, true, 'while a non-boolean falls back to the default');

is(readDay(undefined), freshDay(), 'no day stored is an empty day');
is(readDay({ done: ['r1'], llWindows: [] }).done, ['r1'], 'what you rode comes back');
is(readDay({ llWindows: [{ attractionId: 'r1', start: 'x', end: 'y' }] }).llWindows.length, 1,
  'and a Lightning Lane with a ride and a start');
is(readDay({ llWindows: [{ start: 'x' }, { attractionId: 'r1' }, null] }).llWindows, [],
  'while one missing either is dropped, not kept as a window onto nothing');

/* ── Lightning Lanes ───────────────────────────────────────────────────────
 *
 * A return window is an hour. Asking for both ends asked for something the
 * app already knew, and let you enter a window that ends before it starts.
 */

is(LL_MINUTES, 60, 'a return window is an hour');
{
  const w = llWindow('r1', new Date('2026-11-06T14:30:00Z'));
  is(w.attractionId, 'r1', 'the window knows its ride');
  is(w.start, '2026-11-06T14:30:00.000Z', 'it starts when you said');
  is(w.end, '2026-11-06T15:30:00.000Z', 'and ends an hour later, which is not something to type');
}
// Across the hour the clocks go back, an hour is still an hour: the window is
// built in absolute time, so a local-time seam cannot stretch or collapse it.
{
  const w = llWindow('r1', new Date('2026-11-01T05:30:00Z'));
  is(new Date(w.end) - new Date(w.start), 3600000, 'an hour across the fall-back seam is still an hour');
}
is(llWindow('', new Date()), null, 'no ride, no window');
is(llWindow('r1', null), null, 'no start, no window');
is(llWindow('r1', new Date('rubbish')), null, 'and an unparseable time is not a window either');

{
  const a = llWindow('r1', new Date('2026-11-06T16:00:00Z'));
  const b = llWindow('r2', new Date('2026-11-06T11:00:00Z'));
  is([a, b].sort(byStart).map((w) => w.attractionId), ['r2', 'r1'], 'windows sort by when they open');
}

/* ── carrying across what is already starred ──────────────────────────────
 *
 * The thing that is silently wrong if nobody checks it.
 */

const legacy = [
  { key: dayKey('2026-11-04', 'mk'), date: '2026-11-04',
    value: { done: ['d1'], mustDo: ['space', 'tron'], llWindows: [], pace: 55, maxWaitMin: 30, skipHeld: true } },
  { key: dayKey('2026-11-06', 'ep'), date: '2026-11-06',
    value: { done: ['d2', 'd3'], mustDo: ['frozen'], llWindows: [{ attractionId: 'r9', start: 's', end: 'e' }],
      pace: 85, maxWaitMin: null, skipHeld: false } },
  { key: dayKey('2026-11-05', 'hs'), date: '2026-11-05',
    value: { done: [], mustDo: ['tron', 'rise'], llWindows: [], pace: 70, maxWaitMin: 90, skipHeld: true } },
];

const moved = migrate(legacy);

/* Unioned, not taken from the newest. Starring says "while we are here", and
 * those stars were spread over whichever mornings they were set on; taking
 * only the last day's would drop the rest without saying so.
 */
is(moved.prefs.mustDo.sort(), ['frozen', 'rise', 'space', 'tron'],
  'every ride ever starred comes across, from whichever day it was starred on');
is(moved.prefs.mustDo.filter((x) => x === 'tron').length, 1, 'and one starred twice is still one');

// There is no sensible union of two walking paces, so these come from the
// most recent day, which is the one the settings were last touched on.
is(moved.prefs.pace, 85, 'the pace is the one from the most recent day');
is(moved.prefs.maxWaitMin, null, 'and so is the wait limit, including having none');
is(moved.prefs.skipHeld, false, 'and a setting turned off stays off');

// Newest by date, not by position: storage hands keys back in whatever order
// it likes, and 5 November is in the middle of this list.
ok(legacy[1].date > legacy[2].date, 'the fixture is deliberately out of order');

{
  const reordered = migrate([legacy[1], legacy[0], legacy[2]]);
  is(reordered.prefs.pace, 85, 'the newest day wins whatever order the keys arrive in');
}

// Days keep their own halves and lose the preference fields.
is(moved.days.length, 3, 'every day is kept');
{
  const ep = moved.days.find((d) => d.key === dayKey('2026-11-06', 'ep'));
  is(ep.value.done, ['d2', 'd3'], 'with what was ridden that day');
  is(ep.value.llWindows.length, 1, 'and the Lightning Lanes held that day');
  is(Object.keys(ep.value).sort(), ['done', 'llWindows'],
    'and nothing else: a day no longer carries the settings it used to');
}

// The empty cases, which is what a new install and a cleared browser look
// like. Neither should produce something other than the defaults.
is(migrate([]).prefs, freshPrefs(), 'nothing to migrate gives the defaults');
is(migrate([]).days, [], 'and no days');
is(migrate(null).prefs, freshPrefs(), 'and no list at all does not throw');
is(migrate([{ key: 'k', date: '2026-01-01', value: null }]).days, [],
  'an unreadable record is skipped rather than migrated as an empty day');
is(migrate([{ key: 'k', date: '2026-01-01', value: {} }]).prefs.mustDo, [],
  'a day with nothing starred contributes nothing');

// A legacy day that only ever held defaults must not overwrite a real pace
// with a missing one.
{
  const thin = migrate([
    { key: dayKey('2026-11-01', 'mk'), date: '2026-11-01', value: { mustDo: ['a'], pace: 95 } },
    { key: dayKey('2026-11-02', 'mk'), date: '2026-11-02', value: { mustDo: ['b'] } },
  ]);
  is(thin.prefs.pace, DEFAULT_PACE,
    'a newest day with no pace falls back to the default rather than inventing one');
  is(thin.prefs.mustDo.sort(), ['a', 'b'], 'while the stars from both days still come across');
}

/* ── keeping two copies honest ────────────────────────────────────────────
 *
 * Last write wins per record. Not a union: a union cannot represent a
 * removal, so un-ticking a ride on one phone and merging with a cloud copy
 * that still has it would bring it back, which is a worse bug than the one
 * it fixes.
 */

is(dayDocId('2026-11-06', 'mk'), '2026-11-06_mk', 'a day document is named for its date and park');

is(stampOf(null), 0, 'nothing has no stamp');
is(stampOf({}), 0, 'and neither does a record written before stamping existed');
is(stampOf({ updatedAt: 'soon' }), 0, 'a stamp that is not a number is no stamp');
is(withStamp({ done: ['a'] }, 1000), { done: ['a'], updatedAt: 1000 }, 'stamping keeps the record');

{
  const local = { done: ['a'], updatedAt: 200 };
  const remote = { done: ['b'], updatedAt: 100 };
  is(pickNewer(local, remote).from, 'local', 'the newer copy wins');
  is(pickNewer(remote, local).from, 'remote', 'whichever side it is on');
}
{
  // The case that matters: the removal. A union would hand back both.
  const local = { done: [], updatedAt: 200 };
  const remote = { done: ['a'], updatedAt: 100 };
  is(pickNewer(local, remote).value.done, [],
    'un-ticking a ride is not undone by a cloud copy that still has it');
}
is(pickNewer({ done: [] }, null).from, 'local', 'with no cloud copy the phone wins');
is(pickNewer(null, { done: [] }).from, 'remote', 'and with no local copy the cloud does');
is(pickNewer(null, null).value, null, 'neither is nothing');

// Ties go local: the same record on both sides is the normal case, and
// preferring the cloud would write back on every load for no change.
is(pickNewer({ a: 1, updatedAt: 5 }, { a: 2, updatedAt: 5 }).from, 'local',
  'an equal stamp keeps the local copy rather than writing back for nothing');

/* First sign-in. Everything set before signing in has to come up, or
 * signing in reads as "it forgot my stars".
 */
{
  const local = { mustDo: ['space'] };           // set before signing in, unstamped
  const got = adopt(local, null, 7000);
  is(got.from, 'local', 'with an empty cloud the phone is adopted');
  is(got.value.mustDo, ['space'], 'keeping what was there');
  is(got.value.updatedAt, 7000, 'and gaining a stamp so later merges have something to compare');
}
is(adopt({ a: 1, updatedAt: 3 }, null, 9).value.updatedAt, 3,
  'an already stamped record keeps its own stamp rather than being re-dated');
is(adopt(null, null).from, 'neither', 'nothing on either side is nothing');
{
  // An unstamped local record is adopted, not treated as infinitely old: it
  // predates stamping rather than losing a race.
  const got = adopt({ mustDo: ['a'] }, { mustDo: ['b'], updatedAt: 500 });
  is(got.from, 'remote', 'but against a stamped cloud copy the cloud still wins');
}

console.log(`plan: ${checks} assertions passed`);
process.exit(0);
