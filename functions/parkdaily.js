// ---------------------------------------------------------------------------
// Park Planner: shaping a day of history into something worth keeping.
//
// Pure. No requires, no Firestore, no network, so the suite that covers it
// needs neither an emulator nor an npm install. `parkhistory.js` holds the
// endpoint and all the I/O; everything here is arithmetic on fixtures.
//
// The job: ThemeParks.wiki holds every wait-time change back to 2021, but a
// free key only lets us *read* the last 30 days. So we copy each day into our
// own store once, while it is still inside that window, and from then on it
// is ours. The archive outlives the window.
//
// We keep the daily summary rather than the raw change rows. A day of raw
// history for one ride is ~180 rows; the summary is five numbers over all of
// them, computed by the people who recorded them. For "was this November
// busy", the five numbers are the answer and the 180 rows are weight.
// ---------------------------------------------------------------------------

'use strict';

// Dates are handled as YYYY-MM-DD strings in park-local time, and parsed at
// noon UTC so that adding a day can never land on a DST seam and come back
// as the same date or skip one.
const at = (dateStr) => new Date(`${dateStr}T12:00:00Z`);

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function addDays(dateStr, n) {
  const d = at(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// String compare is date compare for this format, which is the whole reason
// for using it. Wrapped so call sites read as intent, not as a trick.
const before = (a, b) => a < b;

function median(nums) {
  const s = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[mid - 1] + s[mid]) / 2;
}

/* ── one ride's day ────────────────────────────────────────────────────────
 *
 * The API gives both whole-day figures and an `inParkHours` copy restricted
 * to the park's published hours. We take `inParkHours` when it is there: a
 * wait posted at 2am on a day the park shut at 6pm is a feed artefact, and
 * the whole-day figure includes it.
 *
 * The name is stored with the row, which is a little redundant 56 times a
 * day, and is the point: in three years "Rivers of America" will not be in
 * the live feed to look the id up in. The archive has to stand alone.
 */
function leanRide(entity, date) {
  const day = (entity.days || []).find((d) => d.date === date);
  if (!day) return null;

  const scoped = day.inParkHours && day.inParkHours.standby ? day.inParkHours : day;
  const w = scoped.standby;
  // A row with no wait at all is a closed ride or a non-queueing entity. We
  // keep it only if it has operating time worth recording, so the archive can
  // tell "shut all day" from "we were not looking".
  const op = num(scoped.operatingMinutes);
  if (!w && !op) return null;

  const row = { n: String(entity.name || '').slice(0, 120) };
  if (w) {
    put(row, 'p50', w.p50);
    put(row, 'p90', w.p90);
    put(row, 'mean', w.mean);
    put(row, 'min', w.min);
    put(row, 'max', w.max);
  }
  put(row, 'op', op);
  put(row, 'down', num(scoped.downMinutes));
  return row;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const put = (obj, k, v) => { const n = num(v); if (n !== null) obj[k] = n; };

/* ── the park's day ────────────────────────────────────────────────────────
 *
 * `index` is the one number that answers "how busy was the park", and it is
 * a median of the rides' own medians rather than a mean of everything. A mean
 * is dragged around by whichever headliner happened to break down, and by the
 * long tail of walk-ons; the median of medians moves when the park moves.
 */
function leanDay(entities, date) {
  const rides = {};
  for (const e of entities || []) {
    if (!e || !e.id) continue;
    const row = leanRide(e, date);
    if (row) rides[e.id] = row;
  }
  return { rides, index: parkIndex(rides) };
}

function parkIndex(rides) {
  const rows = Object.values(rides || {});
  const waits = rows.filter((r) => typeof r.p50 === 'number');
  return {
    rides: rows.length,
    waits: waits.length,
    p50: median(waits.map((r) => r.p50)),
    p90: median(waits.map((r) => r.p90)),
  };
}

/* ── which days to go and get ──────────────────────────────────────────────
 *
 * Two steps, and the order matters. `daysInWindow` lists every day we are
 * allowed to ask for, oldest first; `pick` drops the ones already held and
 * then takes at most `limit`. Capping before the held-check would be the
 * obvious single pass and is wrong: with a full window of held days the cap
 * is reached by days we already have, and a gap behind them is never seen.
 *
 * Oldest first, so a run cut short by a timeout or a rate limit still leaves
 * the archive contiguous from the back rather than riddled with holes.
 *
 * `earliest` is the API's own answer about how far back this key may read,
 * taken from a 403 rather than worked out here: the published window is "7
 * days" or "30 days" but the boundary is the server's to draw, and guessing
 * it off-by-one costs either a lost day or a wasted 403 on every run.
 */
const WINDOW_MAX = 400;

function daysInWindow({ today, earliest, through = null } = {}) {
  if (!isDate(today)) return [];
  // Yesterday is the newest day worth taking: today is still being recorded.
  let newest = isDate(through) ? through : addDays(today, -1);
  const yesterday = addDays(today, -1);
  if (before(yesterday, newest)) newest = yesterday;

  const floor = isDate(earliest) ? earliest : addDays(today, -6);
  if (before(newest, floor)) return [];

  const out = [];
  for (let d = floor; !before(newest, d) && out.length < WINDOW_MAX; d = addDays(d, 1)) out.push(d);
  return out;
}

function pick(days, have = [], limit = 40) {
  const held = have instanceof Set ? have : new Set(have);
  return days.filter((d) => !held.has(d)).slice(0, Math.max(0, limit));
}

// Kept as one call for the common case, now correctly ordered.
function daysToFetch({ have = [], today, earliest, through = null, limit = 40 } = {}) {
  return pick(daysInWindow({ today, earliest, through }), have, limit);
}

module.exports = {
  addDays, before, median, leanRide, leanDay, parkIndex,
  daysInWindow, pick, daysToFetch, isDate, WINDOW_MAX,
};
