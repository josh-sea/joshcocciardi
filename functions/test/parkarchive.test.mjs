/* Park Planner: the wait-time archive, end to end.
 *
 * Needs the Firestore emulator; the ThemeParks.wiki calls are real. Run it
 * from the repo root:
 *
 *   npx --yes firebase-tools@13 emulators:start --only firestore --project josh-cocciardi
 *   node functions/test/parkarchive.test.mjs
 *
 * `parkdaily.test.mjs` (in apps/portfolio/test, wired into CI) covers the
 * arithmetic on fixtures. This covers the half that fixtures cannot: that the
 * documents actually land, that a second run is a no-op, that a hole in the
 * middle of the window is found and refilled, and that the API's own refusal
 * for a day outside the window is read as a boundary rather than thrown.
 *
 * Exits non-zero if any case fails.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'josh-cocciardi';

import { createRequire } from 'node:module';
// Anchored inside functions/ so bare specifiers resolve against its
// node_modules, exactly as they do when the function runs.
const require = createRequire(new URL('../index.js', import.meta.url));
const admin = require('firebase-admin/app');
const fs = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'josh-cocciardi' });

const { archive, archiveHours, _internal } = require('./parkhistory.js');
const db = fs.getFirestore();
const { addDays: nextDayRaw } = require('./parkdaily.js');
const nextDay = (d) => nextDayRaw(d, 1);

// Start from an empty archive. The emulator can outlive a run (the npx
// wrapper's pid is not the jar's), so a suite that assumes a fresh database
// is a suite that passes or fails on whether the last one shut down.
{
  // Every collection this suite writes, not just the first one it grew.
  // park_hours was added later and not cleared, so a second run found the
  // hourly days already stored and reported "up to date" for work it had
  // not done. A suite that only half-resets is a suite that passes on
  // yesterday's state.
  let cleared = 0;
  for (const name of ['park_history', 'park_hours', 'park_rollups']) {
    const old = await db.collection(name).get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
    cleared += old.size;
  }
  console.log(`cleared ${cleared} documents from a previous run`);
}

let bad = 0;
const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); if (!c) bad++; };

// ---- run 1: cold archive, anonymous window
const r1 = await archive({ limit: 3 });
console.log('\nrun 1:', JSON.stringify(r1.report, null, 1).slice(0, 600));
ok('stored something', r1.stored > 0, r1.stored);
ok('stored at most 3 per park', r1.stored <= 12, r1.stored);

const all = await db.collection('park_history').get();
const docs = all.docs.filter((d) => d.id !== '_cursor');
ok('one doc per park-day', docs.length === r1.stored, { docs: docs.length, stored: r1.stored });

const one = docs[0].data();
ok('doc id is park_date', docs[0].id === `${one.park}_${one.date}`, docs[0].id);
ok('has an index', one.index && typeof one.index.rides === 'number', one.index);
ok('has rides keyed by entity id', Object.keys(one.rides).length > 0, Object.keys(one.rides).length);
ok('a ride row carries its name', Object.values(one.rides).every((r) => typeof r.n === 'string'), null);
ok('no null values stored', !JSON.stringify(one.rides).includes('null'), null);
ok('source recorded', one.source === 'themeparks.daily', one.source);
ok('fetchedAt is a timestamp', !!one.fetchedAt, one.fetchedAt);

// ---- the response has to make a keyless run obvious
//
// Hosting eats the Authorization header on a rewrite, so an authenticated
// backfill can arrive keyless and walk 7 days while answering 200. The only
// defence is the response saying which it was, so the caller can refuse it.
ok('an unkeyed run says so', r1.keyed === false, r1.keyed);
ok('and echoes the window floor it walked', /^\d{4}-\d{2}-\d{2}$/.test(r1.from), r1.from);
{
  // budgetMs of -1 so this reads the window and writes nothing: an assertion
  // placed mid-suite must not move the state later assertions were set up
  // against. Storing a day here silently broke the cursor checks below.
  const asked = '2026-10-26';
  const r = await archive({ limit: 1, from: asked, budgetMs: -1 });
  ok('an explicit from is echoed back', r.from === asked, r.from);
  ok('and nothing was stored to get that answer', r.stored === 0, r.stored);
}

// ---- the cursor
const cur = (await db.collection('park_history').doc('_cursor').get()).data();
console.log('cursor newest:', JSON.stringify(cur.newest));
ok('cursor names at least one park', Object.keys(cur.newest).length > 0, cur.newest);
for (const [p, d] of Object.entries(cur.newest)) {
  const held = docs.filter((x) => x.data().park === p).map((x) => x.data().date).sort();
  ok(`cursor for ${p} is its newest stored day`, d === held[held.length - 1], { cursor: d, held });
}

// ---- run 2: the window fills over successive visits, oldest first
const r2 = await archive({ limit: 3 });
console.log('\nrun 2:', JSON.stringify(r2.report).slice(0, 240));
ok('a second run collects the days the cap left behind', r2.stored > 0, r2.stored);

const allNow = (await db.collection('park_history').get()).docs.filter((d) => d.id !== '_cursor');
const mkDays = allNow.filter((d) => d.data().park === 'mk').map((d) => d.data().date).sort();
ok('and the result is contiguous, no holes', mkDays.every((d, i) => i === 0 || d === nextDay(mkDays[i - 1])), mkDays);
console.log('   mk now holds', mkDays.join(', '));

// ---- run 3: now there is genuinely nothing left, so nothing happens
const before = allNow.map((d) => d.id).sort().join();
const r3 = await archive({ limit: 3 });
const after = (await db.collection('park_history').get()).docs.filter((d) => d.id !== '_cursor').map((d) => d.id).sort().join();
console.log('run 3:', JSON.stringify(r3.report).slice(0, 160));
ok('a run with nothing missing stores nothing', r3.stored === 0, r3.stored);
ok('and changes no documents', before === after, null);
ok('and says so per park', Object.values(r3.report).every((v) => v === 'up to date'), r3.report);

// ---- run 3: a gap in the middle is found, not masked by the cap
const gapDoc = docs.find((d) => d.data().park === 'mk');
if (gapDoc) {
  await db.collection('park_history').doc(gapDoc.id).delete();
  const r4 = await archive({ limit: 3 });
  const back = await db.collection('park_history').doc(gapDoc.id).get();
  ok('a hole punched in the middle is re-fetched', back.exists, gapDoc.id);
  ok('and only that day', r4.stored === 1, r4.stored);
}

// ---- the hourly pass, which is a separate and far more expensive job
//
// One API call per park-day against a real 1.66MB response, so this does two
// days rather than the window. What it has to prove is the write path: that
// a profile lands, that it is 24 slots, that it agrees with what the reducer
// produced, and that the rollup is built from it.
{
  const r = await archiveHours({ limit: 2, budgetMs: 60000 });
  console.log('   hours:', JSON.stringify(r.report));
  ok('the hourly pass stored something', r.stored > 0, r.stored);
  ok('and reports how many park-days are still missing', typeof r.left === 'number', r.left);

  const stored = await db.collection('park_hours').get();
  ok(`park_hours has documents (${stored.size})`, stored.size > 0, stored.size);

  const one = stored.docs[0].data();
  ok('a day is filed under its park and date', one.park && /^\d{4}-\d{2}-\d{2}$/.test(one.date), one.date);
  const idx = one.index.split(',');
  ok('the park profile has 24 slots', idx.length === 24, idx.length);
  const ride = Object.values(one.rides)[0];
  ok('and so does a ride', ride && ride.h.split(',').length === 24, ride && ride.h);
  ok('rides carry their names', ride && typeof ride.n === 'string' && ride.n.length > 0, ride && ride.n);
  ok('an hour with no observation is empty, not zero',
    idx.some((v) => v === ''), idx.join(','));

  // The rollup is a projection of what was just written, not a second copy.
  const roll = await db.collection('park_rollups').doc(`${one.park}_hours`).get();
  ok('an hourly rollup was built', roll.exists, null);
  if (roll.exists) {
    const d = roll.data();
    ok('with seven weekday profiles', Array.isArray(d.index.dow) && d.index.dow.length === 7, d.index.dow && d.index.dow.length);
    ok('and an overall one of 24 slots', d.index.all.split(',').length === 24, d.index.all);
    const names = Object.values(d.rides).map((x) => x.n);
    ok(`naming its rides (${names.length})`, names.length > 0 && names.every(Boolean), names.slice(0, 2));
    ok('each ride having seven weekday profiles',
      Object.values(d.rides).every((x) => Array.isArray(x.dow) && x.dow.length === 7), null);
  }

  /* Asking again must move forward, not re-spend calls on days already
   * held. Counting what a pass stored proves nothing: a pass that re-fetched
   * the same two days would report the same number and overwrite in place.
   * What matters is that the documents are distinct and the backlog shrank.
   */
  const firstIds = (await db.collection('park_hours').get()).docs.map((d) => d.id).sort();
  const again = await archiveHours({ limit: 2, budgetMs: 60000 });
  const secondIds = (await db.collection('park_hours').get()).docs.map((d) => d.id).sort();

  ok('a second pass adds new park-days rather than redoing the same ones',
    secondIds.length === firstIds.length + again.stored,
    { before: firstIds.length, stored: again.stored, after: secondIds.length });
  ok('none of the first pass\'s days were fetched again',
    firstIds.every((id) => secondIds.includes(id)), null);
  ok('and the backlog shrank by what was stored', again.left === r.left - again.stored,
    { was: r.left, now: again.left, stored: again.stored });
}

/* ---- a ride's per-day grid lands in its own document
 *
 * The charts cross-filter each other, which needs the values per day rather
 * than the collapsed profiles: a median cannot be re-aggregated, so a stored
 * per-month profile could not answer "October Saturdays" correctly.
 *
 * Per ride and per document because all of a park's grids together are about
 * 566KB against a 1MB limit and grow with every day collected. The park
 * document must not carry them, or splitting them out bought nothing.
 */
{
  const head = await db.collection('park_rollups').doc('mk_hours').get();
  ok('the hourly rollup exists', head.exists, null);
  const h = head.data();
  ok('it carries no grids of its own', !h.grids, Object.keys(h));
  ok('and no park grid either, which nothing reads yet', !h.grid, Object.keys(h));
  ok('while still carrying the profiles the list is drawn from',
    !!h.index && !!h.index.all && Array.isArray(h.index.dow), null);
  ok('and the span of the window', typeof h.span === 'number' && h.span > 0, h.span);

  const rideIds = Object.keys(h.rides || {});
  ok(`the rollup names its rides (${rideIds.length})`, rideIds.length > 0, null);

  // By document id, not by a query: an equality and an inequality on
  // different fields needs a composite index, which the emulator does not
  // enforce and production does. A test is a bad place to teach that.
  const grids = await db.collection('park_rollups').get();
  const got = grids.docs.filter((d) => d.id.startsWith('mk_hours_'));
  ok(`one grid document per ride (${got.length})`, got.length === rideIds.length,
    { rides: rideIds.length, grids: got.length });

  const one = got[0].data();
  ok('filed under the park and the ride', one.park === 'mk' && !!one.ride, one.ride);
  ok('with the ride name, so the document stands alone',
    typeof one.n === 'string' && one.n.length > 0, one.n);
  ok('and the window it is positional against', one.from === h.from && one.span === h.span,
    { grid: one.from, head: h.from });

  const days = one.h.split(';');
  ok(`the grid is a series per day (${days.length})`, days.length > 0 && days.length <= h.span,
    { days: days.length, span: h.span });
  const filled = days.filter(Boolean);
  ok('with at least one day carrying values', filled.length > 0, filled.length);
  ok('each of which is 24 slots wide',
    filled.every((d) => d.split(',').length === 24), filled[0]);

  // The grid and the profile have to be the same ride, or the chart and the
  // chart it filters describe two different attractions.
  ok('the grid document matches the rollup entry for that ride',
    h.rides[one.ride] && h.rides[one.ride].n === one.n,
    { grid: one.n, head: h.rides[one.ride] && h.rides[one.ride].n });

  // Size is the reason for the split, so it is worth measuring rather than
  // assuming.
  const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
  const biggest = Math.max(...got.map((d) => bytes(d.data())));
  ok(`the biggest grid is well inside the 1MB limit (${biggest} bytes)`,
    biggest < 900000, biggest);
}

/* ---- the hourly pass respects a floor, so `left` can reach zero
 *
 * The count of outstanding park-days is what decides whether the catch-up
 * job calls itself finished. If it counts days the key can no longer read,
 * it can never reach zero: every run would report the archive incomplete
 * and spend a call per park rediscovering the same boundary, for ever.
 *
 * Driven here with an explicit `from`, which takes the same path a plan
 * floor from /v1/me does. Run with a key, the floor arrives on its own.
 */
{
  /* The write cursor lives in this collection too, as a document with no
   * date, and an undefined sorts to the end of an array rather than being
   * ignored. So the newest day has to be taken from the dated documents
   * only. The production path never sees it: every read of this collection
   * is scoped `where('park', '==', key)`.
   */
  const all = (await db.collection('park_history').get()).docs
    .map((d) => d.data().date)
    .filter((d) => typeof d === 'string')
    .sort();
  const days = [...new Set(all)].sort();
  const floor = days[days.length - 1];  // the newest day the archive holds

  const r = await archiveHours({ from: floor, limit: 0, budgetMs: 60000 });
  ok('a floor is reported back, so a caller can see it was applied',
    r.from === floor, r.from);

  /* limit: 0 fetches nothing, so `left` here is purely the count. With the
   * floor at the newest archived day, the only day that can count is that
   * day, and the hourly pass above already holds it for every park. Zero is
   * the number that matters: it is what lets the catch-up job stop.
   */
  ok('nothing outside the floor is counted as outstanding', r.left === 0,
    { left: r.left, floor });

  /* And unbounded it is not zero, which is what proves the floor did the
   * work rather than the archive happening to be complete. Without this the
   * assertion above passes on an empty collection.
   */
  const open = await archiveHours({ limit: 0, budgetMs: 60000 });
  ok('while the same count unbounded still has days outstanding', open.left > 0,
    { bounded: r.left, unbounded: open.left });
  ok('and reports no floor when none applies', open.from === null, open.from);

  /* The floor decides what is asked for as well as what is counted, and the
   * two are separate code paths. A pass that counts correctly but still
   * asks for unreachable days spends a call per park per pass rediscovering
   * a boundary it was already told about.
   *
   * `days[1]` is older than anything the hourly pass above profiled, so
   * there is exactly one day per park inside this floor to fetch and one
   * day outside it that must be left alone. Ignore the floor and the pass
   * takes both, because it works newest-first through everything unheld.
   */
  const mid = days[1];
  const before = new Set((await db.collection('park_hours').get()).docs.map((d) => d.id));
  await archiveHours({ from: mid, limit: 2, budgetMs: 60000 });
  const added = (await db.collection('park_hours').get()).docs
    .map((d) => d.id).filter((id) => !before.has(id));

  ok('a pass fetched something, so the next assertion is not vacuous',
    added.length > 0, added);
  ok('and nothing older than its floor', added.every((id) => id.slice(-10) >= mid),
    { added, floor: mid });
}

// ---- a missing rollup is built even when nothing was stored
//
// The case this gets wrong exactly once: the first run after the feature
// ships. The archive is already complete, so nothing is stored, nothing is
// marked stale, and a rollup triggered only by storing would never be built.
// The history screen would report no data for a complete archive.
{
  await db.collection('park_rollups').doc('mk').delete();
  await db.collection('park_rollups').doc('mk_rides').delete();
  const before = await db.collection('park_rollups').doc('mk').get();
  ok('the rollup is gone to start with', !before.exists, null);

  const r = await archive({ limit: 8 });
  ok('and the run stores nothing, because the archive is complete', r.stored === 0, r.stored);
  const after = await db.collection('park_rollups').doc('mk').get();
  ok('yet the missing rollup is rebuilt anyway', after.exists, r.rollups);
  ok('and its rides document with it',
    (await db.collection('park_rollups').doc('mk_rides').get()).exists, null);
}

// ---- the rollups, which are what the history screen actually reads
//
// The archive is written per day and read per ride, so everything on screen
// comes from these derived documents rather than from park_history. An
// archive that is perfect and a rollup that is empty looks, to a reader,
// exactly like having no data at all.
{
  const parkDoc = await db.collection('park_rollups').doc('mk').get();
  const rideDoc = await db.collection('park_rollups').doc('mk_rides').get();
  ok('a park rollup was written', parkDoc.exists, null);
  ok('and a rides rollup beside it', rideDoc.exists, null);

  if (parkDoc.exists && rideDoc.exists) {
    const head = parkDoc.data();
    const series = head.index.p50.split(',').map((t) => (t === '' ? null : Number(t)));
    ok('the park series has one slot per day in the window',
      series.length === head.days, { series: series.length, days: head.days });
    ok('and its first day matches the window start',
      typeof head.from === 'string' && head.from <= head.to, { from: head.from, to: head.to });

    // The rollup must agree with the archive it claims to summarise, which
    // is the whole reason it is rebuilt rather than patched.
    const day = await db.collection('park_history').doc(`mk_${head.from}`).get();
    ok('and day zero equals that day in the archive',
      day.exists && series[0] === day.data().index.p50,
      { rollup: series[0], archive: day.exists ? day.data().index.p50 : null });

    const rides = rideDoc.data().rides || {};
    const names = Object.values(rides).map((r) => r.n);
    ok(`the rides rollup names its rides (${names.length})`,
      names.length > 0 && names.every((n) => typeof n === 'string' && n), names.slice(0, 2));
    ok('every ride series is a string, not an array',
      Object.values(rides).every((r) => typeof r.p50 === 'string'), null);
    ok('and stays well inside the 1MB document limit',
      JSON.stringify(rides).length < 900000, JSON.stringify(rides).length);
  }

  // The stale marker has to be cleared, or every later run rebuilds forever.
  const cur = (await db.collection('park_history').doc('_cursor').get()).data() || {};
  ok('no park is left marked stale once its rollup is built',
    !(cur.stale || []).length, cur.stale);
}

// ---- the time budget stops cleanly rather than being killed mid-write
{
  const wipe = await db.collection('park_history').get();
  await Promise.all(wipe.docs.map((d) => d.ref.delete()));
  const r = await archive({ limit: 8, budgetMs: -1 });
  ok('a spent budget stores nothing', r.stored === 0, r.stored);
  ok('and says the run is incomplete', r.incomplete === true, r);
  const left = await db.collection('park_history').get();
  ok('and leaves no half-written documents', left.size === 0, left.size);

  // Resumable is the whole reason stopping early is safe.
  const again = await archive({ limit: 8 });
  ok('and the next run picks the same days up', again.stored > 0, again.stored);
  ok('without reporting itself incomplete', !again.incomplete, again.incomplete);
}

// ---- the window refusal is information, not a crash
const MK = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const far = await _internal.getPage(
  `https://api.themeparks.wiki/v1/entity/${MK}/history/daily?date=2020-01-01`, null);
ok('an out-of-window day reports the boundary', far.windowExceeded === true && !!far.earliest, far);
console.log('   API says the earliest readable day is', far.earliest);

// ---- a range comes back paged, which is the whole point of the rewrite
{
  /* Derived from the boundary the call above just reported, not written
   * down. This read `from=2026-10-25&to=2026-10-30`, which was inside the
   * keyless seven-day window on the day it was written and fell out of it
   * six days later: the suite then failed on a hardcoded date in a test
   * whose whole subject is a window that slides. `far.earliest` is the
   * oldest readable day according to the API itself, so the range is the
   * full keyless window and stays correct on any day it is run.
   */
  const from = far.earliest;
  const to = nextDayRaw(from, 5);
  const page = await _internal.getPage(
    `https://api.themeparks.wiki/v1/entity/${MK}/history/daily?from=${from}&to=${to}`, null);
  ok('a range request succeeds', page.ok === true, page);
  const dates = new Set();
  for (const e of page.data.entities || []) for (const d of e.days || []) dates.add(d.date);
  ok('and carries many days in one call', dates.size >= 5, dates.size);
  console.log(`   one call returned ${dates.size} days for ${(page.data.entities || []).length} entities`);
  // Six days is inside one 31-day page, so there is nothing after it.
  ok('with no next page for a short range', !page.data.next, page.data.next);
}

/* ---- a range that straddles the window boundary is retried, not abandoned
 *
 * The range endpoint refuses the whole request and names the oldest day it
 * will serve. So one unreachable day at the old end of a request costs every
 * reachable day behind it: the pass stores nothing and the next pass asks
 * for the same range again.
 *
 * Keyless here on purpose. With a key the floor comes from /v1/me and the
 * window never contains an unreachable day; without one the floor is
 * unknown, which is the case the retry exists for. Driven against the real
 * API's own refusal rather than a fixture, and derived from the boundary it
 * reported above so it cannot go stale.
 */
{
  const wipe = await db.collection('park_history').get();
  await Promise.all(wipe.docs.map((d) => d.ref.delete()));

  const straddle = nextDayRaw(far.earliest, -2);  // two days past what it will serve
  const r = await archive({ from: straddle, limit: 8 });
  console.log('   straddling:', JSON.stringify(r.report));

  ok('a straddling range stores the days it can reach', r.stored > 0, r.stored);
  ok('and says it clamped rather than claiming the whole window',
    Object.values(r.report).some((n) => /clamped to /.test(String(n))), r.report);

  const got = (await db.collection('park_history').get()).docs
    .map((d) => d.data().date).filter((d) => typeof d === 'string');
  ok('storing nothing the API refused to serve',
    got.every((d) => d >= far.earliest), { oldest: got.sort()[0], boundary: far.earliest });
}

// ---- /v1/me decides the window, and says nothing useful without a key
ok('no key means no plan floor', (await _internal.planFloor(null)) === null, 'expected null');
ok('a bad key degrades to null rather than throwing',
  (await _internal.planFloor('not-a-real-key')) === null, 'expected null');

// ---- today is never stored
const todayDoc = docs.find((d) => d.data().date === r1.today);
ok('today is never archived', !todayDoc, r1.today);

console.log(bad ? `\n${bad} failing` : '\nall passing');
process.exit(bad ? 1 : 0);
