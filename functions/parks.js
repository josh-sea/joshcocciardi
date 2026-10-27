// ---------------------------------------------------------------------------
// Park Planner: the wait-time collector.
//
//   parkCollect   HTTPS, bearer-token gated → poll ThemeParks.wiki for the
//                 four Walt Disney World parks and store a snapshot
//
// Why HTTPS and not onSchedule: a scheduled function needs Cloud Scheduler
// enabled on the project, and this repo's CI deploys every function in one
// command, so a scheduler that isn't enabled would fail the whole site's
// deploy (the same reasoning as seasonalbox/index.js). A GitHub Actions cron
// calls this endpoint instead, which needs no GCP change and cannot take the
// site down. To move to a real schedule later, enable Cloud Scheduler and
// export onSchedule('every 5 minutes', () => collect()) from here; `collect`
// is already the whole job and takes no request.
//
// Data from ThemeParks.wiki: free, no key, 300 requests a minute, 60-second
// cache. We poll four parks every five minutes, which is 48 requests an hour
// against a budget of 18,000. The app credits them in the planner's footer.
// ---------------------------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { timingSafeEqual } = require('node:crypto');

const db = () => getFirestore();

const API = 'https://api.themeparks.wiki/v1';
const TZ = 'America/New_York';

// The four theme parks. Water parks are out of scope.
const PARKS = {
  mk: { id: '75ea578a-adc8-4116-a54d-dccb60765ef9', name: 'Magic Kingdom' },
  ep: { id: '47f90d2c-e191-4239-a466-5892ef59a88b', name: 'EPCOT' },
  hs: { id: '288747d1-8b4f-4a64-867e-ea7c9b27bad8', name: 'Hollywood Studios' },
  ak: { id: '1c84a229-8862-4648-9c71-378ddd2c7693', name: 'Animal Kingdom' },
};

/* ── park-local time ───────────────────────────────────────────────────────
 *
 * Everything about a park day is in its own clock: hours, the 15-minute slot
 * a wait belongs to, which date a 11pm snapshot counts as. The server runs in
 * UTC, so every one of those has to be asked for explicitly. Intl does it
 * without a dependency.
 */
const parts = (date) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const out = {};
  for (const p of f.formatToParts(date)) out[p.type] = p.value;
  // en-CA gives 24-hour time, but midnight can come back as '24'.
  if (out.hour === '24') out.hour = '00';
  return out;
};

const localDate = (date = new Date()) => {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

// 'yyyyMMddHHmm' in park time, which sorts correctly as a string and makes a
// snapshot id you can read.
const localStamp = (date = new Date()) => {
  const p = parts(date);
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}`;
};

/* ── the API ─────────────────────────────────────────────────────────────── */

async function get(path, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { 'user-agent': 'joshcocciardi.com park planner (personal, non-commercial)' },
      });
      if (res.status === 429) {
        // Respect the server's own answer about when to come back.
        const wait = Number(res.headers.get('retry-after') || 5) * 1000;
        await new Promise((r) => setTimeout(r, Math.min(wait, 20000)));
        continue;
      }
      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

/* ── park hours ────────────────────────────────────────────────────────────
 *
 * Fetched once a day and cached in Firestore, because the schedule endpoint
 * returns the whole month and none of it changes between polls.
 */
async function hoursFor(dateStr) {
  const ref = db().collection('park_days').doc(dateStr);
  const snap = await ref.get();
  if (snap.exists && snap.data().parks) return snap.data().parks;

  const parksOut = {};
  for (const [key, park] of Object.entries(PARKS)) {
    try {
      const sched = await get(`/entity/${park.id}/schedule`);
      const today = (sched.schedule || []).filter((s) => s.date === dateStr);
      const operating = today.find((s) => s.type === 'OPERATING');
      const early = today.find((s) => s.description === 'Early Entry');
      parksOut[key] = {
        open: operating ? operating.openingTime : null,
        close: operating ? operating.closingTime : null,
        earlyOpen: early ? early.openingTime : null,
      };
    } catch (err) {
      // One park's schedule failing must not cost us the other three.
      parksOut[key] = { open: null, close: null, earlyOpen: null, error: String(err.message || err) };
    }
  }

  await ref.set({ date: dateStr, parks: parksOut, fetchedAt: FieldValue.serverTimestamp() }, { merge: true });
  return parksOut;
}

/* Is this park worth polling right now? An hour before opening (rope-drop
 * waits start posting then) until half an hour after close. Outside that the
 * feed is all CLOSED and we would be paying to store that 288 times a day.
 */
function withinHours(hours, now = new Date()) {
  if (!hours || !hours.open || !hours.close) return true;  // unknown: poll anyway
  const start = new Date(hours.earlyOpen || hours.open).getTime() - 60 * 60 * 1000;
  const end = new Date(hours.close).getTime() + 30 * 60 * 1000;
  const t = now.getTime();
  return t >= start && t <= end;
}

/* ── shaping a snapshot ────────────────────────────────────────────────────
 *
 * Deliberately lean. A full raw payload per ride includes the API's 24-entry
 * hourly forecast, which is the same numbers over and over: storing it 288
 * times a day would be about 40x the bytes for no extra information. We keep
 * what actually changes within a day and store the forecast once, separately.
 *
 * Per ride, in order: status code, standby minutes, Lightning Lane state,
 * and the LL return window as park-local HH:MM. Arrays rather than objects
 * because this is written 1,152 times a day and the keys would outweigh the
 * values.
 */
const STATUS = { OPERATING: 1, DOWN: 2, CLOSED: 3, REFURBISHMENT: 4 };
const LL = { AVAILABLE: 1, TEMPORARILY_FULL: 2, FINISHED: 3, PAUSED: 4 };

const hhmm = (iso) => {
  if (!iso) return null;
  const p = parts(new Date(iso));
  return `${p.hour}:${p.minute}`;
};

function shape(liveData) {
  const rides = {};
  let open = 0, waits = 0, sum = 0;

  for (const e of liveData || []) {
    if (e.entityType !== 'ATTRACTION') continue;
    const standby = e.queue && e.queue.STANDBY ? e.queue.STANDBY.waitTime : null;
    const ret = e.queue && e.queue.RETURN_TIME ? e.queue.RETURN_TIME : null;

    // A ride with no queue and no status tells us nothing; don't store a row.
    if (standby === null && !e.status) continue;

    rides[e.id] = [
      STATUS[e.status] || 0,
      typeof standby === 'number' ? standby : null,
      ret ? (LL[ret.state] || 0) : 0,
      ret ? hhmm(ret.returnStart) : null,
    ];

    if (e.status === 'OPERATING') open++;
    if (typeof standby === 'number') { waits++; sum += standby; }
  }

  return { rides, open, counted: waits, meanWait: waits ? Math.round(sum / waits) : null };
}

/* ── the job ─────────────────────────────────────────────────────────────── */

async function collect(now = new Date()) {
  const date = localDate(now);
  const stamp = localStamp(now);
  const hours = await hoursFor(date);
  const report = {};

  for (const [key, park] of Object.entries(PARKS)) {
    if (!withinHours(hours[key], now)) { report[key] = 'outside hours'; continue; }
    try {
      const live = await get(`/entity/${park.id}/live`);
      const { rides, open, counted, meanWait } = shape(live.liveData);
      if (!counted && !open) { report[key] = 'nothing open'; continue; }

      const body = { park: key, date, stamp, ts: FieldValue.serverTimestamp(), open, counted, meanWait, rides };

      await Promise.all([
        // What the app reads: one doc, always the latest.
        db().collection('park_live').doc(key).set(body),
        // What the forecasts are eventually built from.
        db().collection('park_snaps').doc(`${key}_${stamp}`).set(body),
      ]);
      report[key] = `${counted} waits, mean ${meanWait}`;
    } catch (err) {
      // Log and carry on: three parks of data beats none.
      console.error(`[parks] ${key} failed`, err);
      report[key] = `failed: ${err.message || err}`;
    }
  }

  return { date, stamp, report };
}

/* ── the endpoint ──────────────────────────────────────────────────────────
 *
 * Gated on a bearer token kept in Firestore, following the same pattern as
 * the other private endpoints here. Not because wait times are a secret, but
 * because an open endpoint that writes to Firestore is somebody else's free
 * write quota to burn.
 */
const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // sorts, so compare lengths first and keep the comparison constant-time.
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

exports.parkCollect = onRequest(
  { cors: false, timeoutSeconds: 120, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const header = req.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    const snap = await db().collection('park_secrets').doc('collector').get();
    const want = snap.exists ? snap.data().token : null;
    if (!want) { res.status(503).json({ error: 'collector token not configured' }); return; }
    if (!sameSecret(token, want)) { res.status(403).json({ error: 'forbidden' }); return; }

    try {
      res.json(await collect());
    } catch (err) {
      console.error('[parks] collect failed', err);
      res.status(500).json({ error: String(err.message || err) });
    }
  }
);

// Exported for tests and for a future onSchedule wrapper.
exports.collect = collect;
exports._internal = { shape, withinHours, localDate, localStamp, hhmm, PARKS, STATUS, LL };
