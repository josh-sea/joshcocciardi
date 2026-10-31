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
// path only ever asks for recent days.
//
//   1. Get a key at https://www.themeparks.wiki/pricing ("Create a free
//      API key"). No card.
//   2. Add it to the existing collector secret, as a new field beside the
//      bearer token, in Firestore: park_secrets/collector { apiKey: "..." }
//      It must not go in the browser: a key in client-side JS is public, and
//      the free tier's limits are per key.
//   3. Actions tab -> "Backfill park waits" -> Run workflow, with `from` set
//      to the oldest day you want (blank goes as far back as the key allows).
//
// That workflow holds the bearer token already, as the repo secret the
// collector cron uses, so nothing has to be copied anywhere. It also retries
// the resumable passes for you. The equivalent by hand, if you would rather:
//
//     curl -H "Authorization: Bearer $PARK_COLLECT_TOKEN" \
//       'https://joshcocciardi.com/api/park/archive?from=2026-10-01'
//
// The response reports per park what it stored. `incomplete: true` means it
// ran out of its time budget; call it again and it continues where it
// stopped. Calling it with nothing missing is cheap and says "up to date".
//
// Without the key in step 2 the backfill still works, just inside the 7-day
// no-key window, so a missing key degrades rather than fails.
// ---------------------------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { timingSafeEqual } = require('node:crypto');

const { leanDay, daysInWindow, pick, addDays } = require('./parkdaily');
const { _internal: live } = require('./parks');

const { PARKS, localDate } = live;

const db = () => getFirestore();
const API = 'https://api.themeparks.wiki/v1';
const UA = 'joshcocciardi.com park planner (personal, non-commercial)';

// How many park-days one request may fetch. The open path stays small so a
// cold archive fills over a few visits rather than in one long request that
// risks the function timeout; a backfill asks for the lot.
const OPEN_LIMIT = 8;
const BACKFILL_LIMIT = 40;

// The function's own timeout is 300s. A full 30-day backfill is 120 API calls
// across four parks, which should finish well inside that but is not
// guaranteed to: a slow day upstream could run us over and the platform would
// kill us mid-write. So we stop starting new days at 240s and report what is
// left, which is safe precisely because the job is resumable: it walks
// oldest-first and skips what it holds, so running it again continues.
const BUDGET_MS = 240 * 1000;

const CURSOR = '_cursor';

/* ── the API ──────────────────────────────────────────────────────────────
 *
 * Returns `{ ok, data }`, or `{ windowExceeded, earliest }` for the one error
 * we treat as information rather than failure: a 403 naming the oldest day
 * this key may read is exactly the boundary we need, and far better than
 * computing it from "7 days" and hoping we agree with the server about what
 * that means.
 */
async function getDay(parkId, date, apiKey) {
  const headers = { 'user-agent': UA };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(`${API}/entity/${parkId}/history/daily?date=${date}`, { headers });

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const err = body && body.error;
    if (err && err.type === 'HISTORY_WINDOW_EXCEEDED') {
      return { windowExceeded: true, earliest: err.earliestAllowedDate || null };
    }
    throw new Error(`daily ${date} -> 403 ${(err && err.type) || ''}`);
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(`rate limited: ${(body.error && body.error.type) || '429'}`);
    e.rateLimited = true;
    e.retryAfter = (body.error && body.error.retryAfter) || null;
    throw e;
  }
  if (!res.ok) throw new Error(`daily ${date} -> ${res.status}`);

  return { ok: true, data: await res.json() };
}

/* ── what we already hold ──────────────────────────────────────────────────
 *
 * Asked by document id rather than with a query, so it needs no composite
 * index and costs exactly one read per candidate day.
 */
async function held(park, dates) {
  if (!dates.length) return new Set();
  const refs = dates.map((d) => db().collection('park_history').doc(`${park}_${d}`));
  const snaps = await db().getAll(...refs);
  return new Set(snaps.filter((s) => s.exists).map((s) => s.data().date));
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
  const deadline = Date.now() + budgetMs;
  const report = {};
  const storedByPark = {};
  let stored = 0;
  let ranOut = false;

  for (const [key, park] of Object.entries(PARKS)) {
    // The whole readable window first, then drop what we hold, then cap. See
    // the note on ordering in parkdaily.js: capping first hides gaps.
    const windowFloor = from || addDays(today, apiKey ? -29 : -6);
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

    const done = [];
    for (const date of todo) {
      if (Date.now() > deadline) {
        ranOut = true;
        done.push(`${date}: out of time, run again`);
        break;
      }
      try {
        const res = await getDay(park.id, date, apiKey);
        if (res.windowExceeded) { report[key] = `out of window before ${res.earliest || '?'}`; break; }

        const { rides, index } = leanDay(res.data.entities, date);
        if (!index.rides) { done.push(`${date}: empty`); continue; }

        await db().collection('park_history').doc(`${key}_${date}`).set({
          park: key, date, rides, index,
          source: 'themeparks.daily',
          fetchedAt: FieldValue.serverTimestamp(),
        });
        stored++;
        (storedByPark[key] || (storedByPark[key] = [])).push(date);
        done.push(`${date}: ${index.waits} waits, median ${index.p50}`);
      } catch (err) {
        if (err.rateLimited) { report[key] = `rate limited, retry after ${err.retryAfter}s`; break; }
        console.error(`[parkArchive] ${key} ${date} failed`, err);
        done.push(`${date}: failed`);
      }
    }
    if (done.length) report[key] = done;
  }

  if (stored) await writeCursor(storedByPark);
  return { today, stored, report, ...(ranOut ? { incomplete: true } : {}) };
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
    const header = req.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

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
exports._internal = { getDay, held, writeCursor, OPEN_LIMIT, BACKFILL_LIMIT, BUDGET_MS };
