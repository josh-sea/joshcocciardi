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

const { archive, _internal } = require('./parkhistory.js');
const db = fs.getFirestore();
const { addDays: nextDayRaw } = require('./parkdaily.js');
const nextDay = (d) => nextDayRaw(d, 1);

// Start from an empty archive. The emulator can outlive a run (the npx
// wrapper's pid is not the jar's), so a suite that assumes a fresh database
// is a suite that passes or fails on whether the last one shut down.
{
  const old = await db.collection('park_history').get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
  console.log(`cleared ${old.size} documents from a previous run`);
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
  const page = await _internal.getPage(
    `https://api.themeparks.wiki/v1/entity/${MK}/history/daily?from=2026-10-25&to=2026-10-30`, null);
  ok('a range request succeeds', page.ok === true, page);
  const dates = new Set();
  for (const e of page.data.entities || []) for (const d of e.days || []) dates.add(d.date);
  ok('and carries many days in one call', dates.size >= 5, dates.size);
  console.log(`   one call returned ${dates.size} days for ${(page.data.entities || []).length} entities`);
  // Six days is inside one 31-day page, so there is nothing after it.
  ok('with no next page for a short range', !page.data.next, page.data.next);
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
