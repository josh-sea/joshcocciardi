/* Park Planner: fetching the wait archive's rollups.
 *
 * Read straight over the Firestore REST API rather than through the Firebase
 * SDK, for two reasons. The planner carries no Firebase at all and this is
 * not a good reason to give it some. And these documents are public by rule,
 * so there is nothing to authenticate: the web API key below is the same one
 * already shipped in store.js, and it identifies the project, not a user.
 *
 * Two documents per park, fetched separately on purpose:
 *
 *   park_rollups/{park}        a few KB. The screen opens on it.
 *   park_rollups/{park}_rides  a couple of hundred KB. Only when a ride list
 *                              is actually asked for.
 *
 * Both are cached, because a year of history does not change while you are
 * looking at it, and the whole point of the archive is that it is readable
 * standing in a queue on bad wifi.
 */

const PROJECT = 'josh-cocciardi';
const KEY = 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Yesterday's row appears once a day, so an hour is fresh enough, and a
// stale answer is better than no answer when the signal is gone.
export const FRESH_MS = 60 * 60 * 1000;
const CACHE_V = 1;
const cacheKey = (doc) => `parkHistory.v${CACHE_V}.${doc}`;

/* Firestore's REST shape wraps every value in its type: a number comes back
 * as {"integerValue":"15"}. This walks that off. It is also the reason the
 * rollups hold series as strings rather than arrays: one wrapper for a
 * whole year instead of one per day.
 */
export function unwrap(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return unwrapFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(unwrap);
  return null;
}

export function unwrapFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = unwrap(v);
  return out;
}

const readCache = (doc) => {
  try {
    const raw = localStorage.getItem(cacheKey(doc));
    if (!raw) return null;
    const box = JSON.parse(raw);
    return box && box.at && box.data ? box : null;
  } catch { return null; }
};

const writeCache = (doc, data) => {
  try { localStorage.setItem(cacheKey(doc), JSON.stringify({ at: Date.now(), data })); }
  catch { /* quota or private mode: the screen works without a cache */ }
};

/* Returns `{ data, age, from }` where `from` is 'cache', 'network' or
 * 'stale', so the screen can say how old its numbers are instead of
 * presenting last week's as current.
 */
async function doc(name, { force = false, fetchImpl = fetch } = {}) {
  const box = readCache(name);
  const age = box ? Date.now() - box.at : Infinity;
  if (box && !force && age < FRESH_MS) return { data: box.data, age, from: 'cache' };

  try {
    const res = await fetchImpl(`${BASE}/park_rollups/${name}?key=${KEY}`);
    if (res.status === 404) return { data: null, age: 0, from: 'network', missing: true };
    if (!res.ok) throw new Error(`${res.status}`);
    const body = await res.json();
    const data = unwrapFields(body.fields);
    writeCache(name, data);
    return { data, age: 0, from: 'network' };
  } catch (err) {
    if (box) return { data: box.data, age, from: 'stale', error: err };
    throw err;
  }
}

export const parkRollup = (park, opts) => doc(park, opts);
export const ridesRollup = (park, opts) => doc(`${park}_rides`, opts);
// The hourly rollup. Missing until the hourly backfill has run, which is why
// every caller has to cope with `data` being null rather than assume it.
export const hoursRollup = (park, opts) => doc(`${park}_hours`, opts);

/* One ride's hour-by-hour grid, a value per day per hour.
 *
 * Its own document, and fetched only when that ride is opened. All of a
 * park's grids together are about 566KB and grow with every day collected,
 * which is both a document-size limit with a date on it and half a megabyte
 * to draw one chart on park wifi. Separately each is about 21KB.
 *
 * Missing is normal: a ride added since the last rollup, or a park whose
 * hourly backfill has not reached it. Callers cope with null.
 */
export const rideHours = (park, id, opts) => doc(`${park}_hours_${id}`, opts);

/* How old, in words. Deliberately vague past a point: "3 days ago" is the
 * honest answer and "73 hours" pretends to a precision nobody needs.
 */
export function ageWords(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  const min = Math.round(ms / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}
