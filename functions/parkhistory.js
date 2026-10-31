// ---------------------------------------------------------------------------
// Park Planner: copying ThemeParks.wiki's history into our own archive.
//
//   parkArchive   HTTPS → store the daily wait summary for any park-day we
//                 are missing and can still read
//
// Why this exists at all, given parkCollect already polls live waits:
// ThemeParks.wiki records every wait-time change and holds it back to
// 2021-07-03, but a free key may only *read* the last 30 days (7 without a
// key). Their summary of a day is better than anything we can assemble from
// five-minute snapshots, and it is complete for days we were not running. So
// we copy each day once, while it is still readable, and keep it for good.
//
// Two ways in, deliberately different:
//
//   GET  (no auth)                catch up on days inside the no-key window.
//                                 The app calls this when it notices the
//                                 archive is behind. Takes no input at all.
//   GET  Bearer <collector token> backfill ?from=&to=, using the stored API
//                                 key, so it reaches the full 30 days.
//
// The open path is safe because nothing the caller sends is ever stored: the
// request carries no parameters, the dates come from the park's own clock,
// and the values come from the API. The worst a flood achieves is making us
// re-read one small Firestore doc, which the cursor check answers in a single
// read. Writes are bounded at one per park per day by the archive itself.
//
// ── Backfilling the full 30 days ───────────────────────────────────────────
//
// A free key is free and raises the readable window from 7 days to 30, plus
// the hourly history budget from 60 calls to 600. It is worth having purely
// for the one-time backfill; nothing afterwards needs it, because the open
// path only ever asks for recent days. A paid key reaches further back (400
// days on Pro, the whole archive on Business) and needs no change here: the
// window comes from /v1/me, not from a constant.
//
//   1. Get a key at https://www.themeparks.wiki/pricing ("Create a free
//      API key"). No card.
//   2. Add it to the existing collector secret, as a new field beside the
//      bearer token, in Firestore: park_secrets/collector { apiKey: "..." }
//      It must not go in the browser: a key in client-side JS is public, and
//      the free tier's limits are per key.
//   3. Actions tab -> "Backfill park waits" -> Run workflow. Leave `from`
//      blank: the run asks /v1/me how far back the key may read and takes
//      all of it, so it is correct on free (30 days), Pro (400) or a
//      full-archive plan without anyone editing a number here. Set `from`
//      only to deliberately take less than the plan allows.
//
// That workflow holds the bearer token already, as the repo secret the
// collector cron uses, so nothing has to be copied anywhere. It also retries
// the resumable passes for you. The equivalent by hand, if you would rather:
//
//     curl -sSL -H "X-Park-Token: $PARK_COLLECT_TOKEN" \
//       'https://www.joshcocciardi.com/api/park/archive?from=2026-10-01'
//
// Note the www and the -L. The bare host answers 301 to www, and a 301 is
// not a 2xx, which is how the first real backfill run failed. X-Park-Token
// does survive that cross-host redirect; Authorization would not have.
//
// Note the header. Hosting does not forward `Authorization` through a
// rewrite, so a bearer token sent that way is silently dropped and the call
// runs as the keyless 7-day path while still answering 200. See the note on
// the handler below.
//
// The response reports per park what it stored, plus `keyed` and `from`, so
// a caller can tell a 30-day run from a 7-day one rather than inferring it
// from a 200. `incomplete: true` means it ran out of its time budget; call
// it again and it continues where it stopped. Calling it with nothing
// missing is cheap and says "up to date".
//
// Without the key in step 2 the backfill still works, just inside the 7-day
// no-key window, so a missing key degrades rather than fails.
// ---------------------------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { timingSafeEqual } = require('node:crypto');

const { leanDay, daysInWindow, pick, addDays } = require('./parkdaily');
const rollup = require('./parkrollup');
const { _internal: live } = require('./parks');

const { PARKS, localDate } = live;

const db = () => getFirestore();
const API = 'https://api.themeparks.wiki/v1';
const UA = 'joshcocciardi.com park planner (personal, non-commercial)';

// How many park-days one request may fetch. The open path stays small so a
// cold archive fills over a few visits rather than in one long request that
// risks the function timeout; a backfill asks for the lot.
const OPEN_LIMIT = 8;
// Ranges made days almost free to fetch, so this is now bounded by writes
// and wall clock rather than by the history budget. The job is resumable,
// so overshooting costs a second run and never a lost day.
const BACKFILL_LIMIT = 400;

/* The budget that matters is Firebase Hosting's, not the function's.
 *
 * onRequest is configured for 300s and Cloud Run would allow it, but every
 * caller reaches this through the /api/park/archive rewrite, and Hosting caps
 * a request to a function at 60 seconds and answers 504. The function is not
 * cancelled by that: it keeps running and writing while the caller has given
 * up, and curl's --retry then starts a second one on top of the first.
 *
 * That is exactly what the first Pro backfill did. One dispatch produced two
 * overlapping invocations: the first filled 618 park-days before Hosting cut
 * the caller off at 60s, the second filled the remaining 862 and reported
 * only its own share, so the log read "mk: up to date" for a park that had
 * just been filled by an invocation nobody could see. The archive came out
 * complete and gap-free because the writes are idempotent, which is luck, not
 * design: it spent twice the API budget and produced a report that did not
 * describe what happened.
 *
 * So the budget sits well under Hosting's cap, and a large backfill finishes
 * across several passes instead of one long call. 40s of work plus the page
 * in flight lands comfortably inside 60.
 */
const { BUDGET_MS, FETCH_SHARE_MS, HOSTING_CAP_MS } = require('./parkhistory-limits.cjs');

const CURSOR = '_cursor';

/* ── the API ──────────────────────────────────────────────────────────────
 *
 * One page of daily summaries. Asked for by URL rather than by park and
 * date, because the response's `next` is an absolute URL with the caller's
 * parameters already carried forward, and following it as given is both
 * simpler and less likely to drift from what the server meant.
 *
 * Returns `{ ok, data }`, or `{ windowExceeded, earliest }` for the one
 * error treated as information rather than failure: a 403 naming the oldest
 * day this key may read is exactly the boundary we want, and far better than
 * computing it from "30 days" and hoping we agree with the server.
 *
 * Why a range and not a day at a time, which is what this did first: a park
 * range answers with up to 31 park-local days per page and costs one unit of
 * the hourly history budget either way. Day-at-a-time, a 400-day backfill of
 * four parks is 1,600 calls against a Pro budget of 1,200 an hour, so it
 * cannot finish. By range it is 52. Identical data, 30x less of the budget.
 */
async function getPage(url, apiKey) {
  const headers = { 'user-agent': UA };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(url, { headers });

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const err = body && body.error;
    if (err && err.type === 'HISTORY_WINDOW_EXCEEDED') {
      return { windowExceeded: true, earliest: err.earliestAllowedDate || null };
    }
    throw new Error(`daily -> 403 ${(err && err.type) || ''}`);
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(`rate limited: ${(body.error && body.error.type) || '429'}`);
    e.rateLimited = true;
    e.retryAfter = (body.error && body.error.retryAfter) || null;
    throw e;
  }
  if (!res.ok) throw new Error(`daily -> ${res.status}`);

  return { ok: true, data: await res.json() };
}

/* How far back this key may actually read.
 *
 * Asked rather than assumed. The floor used to be `today - 29`, which was
 * right for a free key and silently wrong the moment the plan changed: a Pro
 * key reaching 400 days would still have been asked for 30. /v1/me reports
 * `historyEarliestDate` directly, costs no history budget, and is correct on
 * every tier including a full-archive one.
 *
 * Returns null rather than throwing: a failure here should fall back to the
 * conservative default, not lose the run.
 */
async function planFloor(apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${API}/me`, { headers: { 'user-agent': UA, 'X-API-Key': apiKey } });
    if (!res.ok) return null;
    const me = await res.json();
    return typeof me.historyEarliestDate === 'string' ? me.historyEarliestDate : null;
  } catch {
    return null;
  }
}

/* ── what we already hold ──────────────────────────────────────────────────
 *
 * Asked by document id rather than with a query, so it needs no composite
 * index and costs exactly one read per candidate day.
 */
const LOOKUP_CHUNK = 300;

async function held(park, dates) {
  if (!dates.length) return new Set();
  const out = new Set();
  // Chunked: a getAll of several thousand refs is not a request anyone
  // should send, and a full-archive window is exactly that size.
  for (let i = 0; i < dates.length; i += LOOKUP_CHUNK) {
    const slice = dates.slice(i, i + LOOKUP_CHUNK);
    const refs = slice.map((d) => db().collection('park_history').doc(`${park}_${d}`));
    const snaps = await db().getAll(...refs);
    for (const snap of snaps) if (snap.exists) out.add(snap.data().date);
  }
  return out;
}

/* ── one park's missing days ───────────────────────────────────────────────
 *
 * Walks the range in the pages the API hands back, writing each page's days
 * before asking for the next. Page by page rather than accumulating: a
 * 31-day page of one park is well over a megabyte, so holding 400 days of
 * four parks in memory at once would be tens of megabytes for no reason.
 *
 * Writes are batched per page. One `set` per park-day was fine at 92 of
 * them and is not at 1,600.
 */
async function fillRange(key, park, todo, apiKey, deadline) {
  const want = new Set(todo);
  const stored = [];
  const notes = [];

  let url = `${API}/entity/${park.id}/history/daily?from=${todo[0]}&to=${todo[todo.length - 1]}`;
  let pages = 0;

  while (url) {
    const page = await getPage(url, apiKey);
    if (page.windowExceeded) {
      notes.push(`out of window before ${page.earliest || '?'}`);
      break;
    }
    pages++;
    const entities = page.data.entities || [];

    // Which of the days we still want does this page actually carry?
    const here = new Set();
    for (const e of entities) for (const d of e.days || []) if (want.has(d.date)) here.add(d.date);

    const batch = db().batch();
    let queued = 0;
    for (const date of [...here].sort()) {
      const { rides, index } = leanDay(entities, date);
      if (!index.rides) continue;
      batch.set(db().collection('park_history').doc(`${key}_${date}`), {
        park: key, date, rides, index,
        source: 'themeparks.daily',
        fetchedAt: FieldValue.serverTimestamp(),
      });
      queued++;
      stored.push(date);
    }
    if (queued) await batch.commit();

    url = page.data.next || null;
    if (url && Date.now() > deadline) { notes.push('out of time, run again'); return { stored, notes, ranOut: true }; }
  }

  notes.unshift(`${stored.length} days over ${pages} page${pages === 1 ? '' : 's'}`);
  return { stored, notes };
}

/* ── the job ───────────────────────────────────────────────────────────────
 *
 * One park at a time, oldest day first. A park that fails does not cost the
 * others their run, and a window refusal stops only that park's walk back:
 * it means every older day is out of reach too, so there is nothing to gain
 * by asking again for each of them.
 */
async function archive({ now = new Date(), apiKey = null, from = null, to = null, limit = OPEN_LIMIT, budgetMs = BUDGET_MS } = {}) {
  const today = localDate(now);
  const started = Date.now();
  // Fetching gets the first share; whatever is left goes to rollups. Both
  // are resumable, so an overrun costs a pass and never a day.
  const deadline = started + Math.min(budgetMs, FETCH_SHARE_MS);
  const hardStop = started + budgetMs;
  const report = {};
  const storedByPark = {};
  let stored = 0;
  let ranOut = false;

  /* Hoisted and reported, because a backfill that quietly walks a 7-day
   * window when it was asked for 400 looks exactly like one that worked.
   * The caller gets to check rather than trust.
   *
   * An explicit `from` wins. Otherwise the key's own plan decides, asked
   * from /v1/me rather than assumed: the floor was `today - 29`, which was
   * right for a free key and would have quietly held a Pro key to 30 days
   * of the 400 it can read. Keyless falls back to the published 7.
   */
  const windowFloor = from || (await planFloor(apiKey)) || addDays(today, -6);

  for (const [key, park] of Object.entries(PARKS)) {
    // The whole readable window first, then drop what we hold, then cap. See
    // the note on ordering in parkdaily.js: capping first hides gaps.
    const window = daysInWindow({ today, earliest: windowFloor, through: to });
    if (!window.length) { report[key] = 'nothing in range'; continue; }

    let have;
    try {
      have = await held(key, window);
    } catch (err) {
      report[key] = `lookup failed: ${err.message || err}`;
      continue;
    }

    const todo = pick(window, have, limit);
    if (!todo.length) { report[key] = 'up to date'; continue; }

    if (Date.now() > deadline) { ranOut = true; report[key] = 'out of time, run again'; continue; }

    try {
      const res = await fillRange(key, park, todo, apiKey, deadline);
      if (res.ranOut) ranOut = true;
      if (res.stored.length) {
        stored += res.stored.length;
        storedByPark[key] = res.stored;
      }
      report[key] = res.notes;
    } catch (err) {
      if (err.rateLimited) {
        report[key] = `rate limited, retry after ${err.retryAfter}s`;
      } else {
        console.error(`[parkArchive] ${key} failed`, err);
        report[key] = `failed: ${err.message || err}`;
      }
    }
  }

  if (stored) await writeCursor(storedByPark);

  /* Rollups. Anything stored this run invalidates that park's charts, and a
   * park left stale by an earlier pass is picked up here even when this pass
   * stored nothing: that is the case a "rebuild what I just wrote" approach
   * would drop on the floor.
   */
  const freshlyStale = Object.keys(storedByPark);
  if (freshlyStale.length) await markStale(freshlyStale);

  const rolled = {};
  let rollupsLeft = 0;
  try {
    const todo = await staleParks();
    for (const key of todo) {
      if (Date.now() > hardStop) { rollupsLeft++; continue; }
      try {
        const out = await rebuildRollup(key);
        await clearStale(key);
        rolled[key] = out ? `${out.rides} rides over ${out.days} days` : 'nothing to roll up';
      } catch (err) {
        console.error(`[parkArchive] rollup ${key} failed`, err);
        rolled[key] = `failed: ${err.message || err}`;
        rollupsLeft++;
      }
    }
  } catch (err) {
    console.error('[parkArchive] stale lookup failed', err);
  }
  if (rollupsLeft) ranOut = true;

  return {
    today,
    stored,
    // `keyed` says whether the ThemeParks API key was in play, which is what
    // decides a 7-day window from a 30-day one. `from` echoes the floor
    // actually walked, so a caller can see it was honoured.
    keyed: !!apiKey,
    from: windowFloor,
    report,
    ...(Object.keys(rolled).length ? { rollups: rolled } : {}),
    ...(ranOut ? { incomplete: true } : {}),
  };
}

/* ── rollups ───────────────────────────────────────────────────────────────
 *
 * The archive is one document per park-day, which is right for writing and
 * useless for reading: a history chart wants one ride across the year, a
 * column through 399 documents. So each park keeps two derived documents a
 * browser can fetch whole. See parkrollup.js for why they hold strings.
 *
 * Rebuilt from the archive rather than patched in place. A rebuild costs the
 * park's documents in reads, which is more than an incremental splice would,
 * and buys something worth more: the rollup cannot drift from the archive it
 * claims to summarise, because it is never anything but a fresh projection
 * of it.
 *
 * Which parks need one is kept on the cursor, so a rebuild that runs out of
 * budget is picked up by the next pass instead of being silently skipped and
 * leaving a stale chart.
 */
async function rebuildRollup(key) {
  const snap = await db().collection('park_history').where('park', '==', key).get();
  const docs = snap.docs.map((d) => d.data());
  const built = rollup.build(key, docs);
  if (!built) return null;

  const { rides, ...head } = built;
  await Promise.all([
    db().collection('park_rollups').doc(key).set({
      ...head, builtAt: FieldValue.serverTimestamp(),
    }),
    db().collection('park_rollups').doc(`${key}_rides`).set({
      park: key, from: built.from, to: built.to, days: built.days,
      rides, builtAt: FieldValue.serverTimestamp(),
    }),
  ]);
  return { days: built.days, rides: Object.keys(rides).length };
}

async function markStale(parks) {
  if (!parks.length) return;
  await db().collection('park_history').doc(CURSOR)
    .set({ stale: FieldValue.arrayUnion(...parks) }, { merge: true });
}

async function clearStale(key) {
  await db().collection('park_history').doc(CURSOR)
    .set({ stale: FieldValue.arrayRemove(key) }, { merge: true });
}

async function staleParks() {
  const snap = await db().collection('park_history').doc(CURSOR).get();
  const list = (snap.exists && snap.data().stale) || [];
  return list.filter((k) => Object.prototype.hasOwnProperty.call(PARKS, k));
}

/* The cursor exists so the app can tell whether the archive is behind with a
 * single public read, instead of calling this function on every page view.
 * It is a cache of the archive, never the truth: `archive` always re-checks
 * the documents themselves, so a stale or missing cursor costs a wasted call
 * and never a wrong answer.
 *
 * Built from what this run stored, merged forward over what the cursor
 * already said, rather than by asking Firestore for each park's newest day.
 * That query (`where park == x, orderBy date desc`) needs a composite index,
 * and a function that fails until someone remembers to deploy an index is a
 * trap. Nothing here needs one.
 */
async function writeCursor(storedByPark) {
  const ref = db().collection('park_history').doc(CURSOR);
  const prev = await ref.get();
  const newest = { ...((prev.exists && prev.data().newest) || {}) };

  for (const [key, dates] of Object.entries(storedByPark)) {
    for (const d of dates) if (!newest[key] || newest[key] < d) newest[key] = d;
  }

  await ref.set({ newest, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return newest;
}

/* ── the endpoint ────────────────────────────────────────────────────────── */

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

const asDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

exports.parkArchive = onRequest(
  // No CORS: the app reaches this through the /api/park/archive hosting
  // rewrite, which is proxied server-side and so same-origin to the browser.
  // Nothing here needs to be callable from another site's page.
  { cors: false, timeoutSeconds: 300, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    /* Two ways to present the token, for one measured reason.
     *
     * Firebase Hosting does not forward `Authorization` through a rewrite.
     * Tested against the deployed function: a deliberately wrong bearer
     * token came back 200 on the unauthenticated path rather than 403, which
     * it could only do if the header never arrived. That is the dangerous
     * shape of failure, because an authenticated backfill asking for 30 days
     * would quietly walk 7 and report success.
     *
     * `X-Park-Token` is a header Hosting has no opinion about, so it reaches
     * the function through the rewrite and nobody has to know the function's
     * own URL. `Authorization` is still read, for a direct call that bypasses
     * Hosting, and because taking it away would be a trap of its own.
     */
    const header = req.get('Authorization') || '';
    const token = req.get('X-Park-Token')
      || (header.startsWith('Bearer ') ? header.slice(7) : '')
      || '';

    let authed = false;
    let apiKey = null;
    if (token) {
      const snap = await db().collection('park_secrets').doc('collector').get();
      const secrets = snap.exists ? snap.data() : {};
      if (!sameSecret(token, secrets.token)) { res.status(403).json({ error: 'forbidden' }); return; }
      authed = true;
      // Optional: without it the backfill still runs, just inside the 7-day
      // no-key window, so a missing key degrades rather than fails.
      apiKey = secrets.apiKey || null;
    }

    try {
      res.json(await archive(authed
        ? { apiKey, from: asDate(req.query.from), to: asDate(req.query.to), limit: BACKFILL_LIMIT }
        : { limit: OPEN_LIMIT }));
    } catch (err) {
      console.error('[parkArchive] failed', err);
      res.status(500).json({ error: String(err.message || err) });
    }
  }
);

exports.archive = archive;
exports._internal = {
  getPage, planFloor, held, fillRange, writeCursor,
  rebuildRollup, markStale, clearStale, staleParks,
  OPEN_LIMIT, BACKFILL_LIMIT, BUDGET_MS, FETCH_SHARE_MS, HOSTING_CAP_MS, LOOKUP_CHUNK,
};
