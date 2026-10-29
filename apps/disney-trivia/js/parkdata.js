/* Park Planner: talking to ThemeParks.wiki, and surviving not being able to.
 *
 * You are going to open this in a queue, on park wifi, with three bars of
 * nothing. Every fetch here has a cached answer behind it and every caller
 * gets told how old the data is, because a planner that silently routes you
 * on an hour-old wait time is worse than one that says it does not know.
 *
 * Data from ThemeParks.wiki: free, no key, attribution shown in the footer.
 */

const API = 'https://api.themeparks.wiki/v1';

// Bumped when the cached shape changes, so an old cache is dropped rather
// than half-read.
const CACHE_V = 1;
const key = (what) => `parkPlanner.v${CACHE_V}.${what}`;

/* Live waits go stale fast; the day's schedule does not change at all. Both
 * are served from cache first when the network is slow or gone.
 */
export const LIVE_FRESH_MS = 3 * 60 * 1000;
export const SCHEDULE_FRESH_MS = 6 * 60 * 60 * 1000;

const readCache = (what) => {
  try {
    const raw = localStorage.getItem(key(what));
    if (!raw) return null;
    const box = JSON.parse(raw);
    return box && box.at && box.data ? box : null;
  } catch { return null; }
};

const writeCache = (what, data) => {
  try { localStorage.setItem(key(what), JSON.stringify({ at: Date.now(), data })); }
  catch { /* full or private; the app works without it */ }
};

async function fetchJson(path, signal) {
  const res = await fetch(`${API}${path}`, { signal });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* Fetch, falling back to whatever we last managed to get.
 *
 * The returned `age` is what the UI shows. It is the one number that keeps
 * the planner honest when the signal is bad.
 */
async function cached(what, path, freshMs, { force = false, signal } = {}) {
  const box = readCache(what);
  const age = box ? Date.now() - box.at : Infinity;
  if (box && !force && age < freshMs) return { data: box.data, age, from: 'cache' };

  try {
    const data = await fetchJson(path, signal);
    writeCache(what, data);
    return { data, age: 0, from: 'network' };
  } catch (err) {
    if (box) return { data: box.data, age, from: 'stale', error: err };
    throw err;
  }
}

/* ── the four parks ──────────────────────────────────────────────────────── */

export const PARK_IDS = {
  mk: '75ea578a-adc8-4116-a54d-dccb60765ef9',
  ep: '47f90d2c-e191-4239-a466-5892ef59a88b',
  hs: '288747d1-8b4f-4a64-867e-ea7c9b27bad8',
  ak: '1c84a229-8862-4648-9c71-378ddd2c7693',
};

/* Live state for one park, reshaped into what the planner wants: a map from
 * attraction id to status, standby wait, the hourly forecast, and the current
 * Lightning Lane return window.
 */
export async function liveFor(park, opts = {}) {
  const id = PARK_IDS[park];
  if (!id) throw new Error(`unknown park ${park}`);

  const { data, age, from, error } = await cached(
    `live.${park}`, `/entity/${id}/live`, LIVE_FRESH_MS, opts
  );

  /* Shows are kept, not dropped. They are what explains an odd-looking
   * hour on a ride's curve: a parade at two, fireworks at nine. They cost
   * nothing extra, being in the same payload. */
  const shows = (data.liveData || [])
    .filter((e) => e.entityType === 'SHOW' && Array.isArray(e.showtimes) && e.showtimes.length)
    .map((e) => ({ id: e.id, name: e.name, status: e.status, showtimes: e.showtimes }));

  const rides = {};
  for (const e of data.liveData || []) {
    if (e.entityType !== 'ATTRACTION') continue;
    const standby = e.queue && e.queue.STANDBY ? e.queue.STANDBY.waitTime : null;
    const ret = e.queue && e.queue.RETURN_TIME ? e.queue.RETURN_TIME : null;
    rides[e.id] = {
      status: e.status || null,
      waitMin: typeof standby === 'number' ? standby : null,
      forecast: Array.isArray(e.forecast) ? e.forecast : null,
      ll: ret ? { state: ret.state, start: ret.returnStart, end: ret.returnEnd } : null,
    };
  }
  return { rides, shows, age, from, error };
}

/* Today's hours, including Early Entry. */
export async function hoursFor(park, dateStr, opts = {}) {
  const id = PARK_IDS[park];
  if (!id) throw new Error(`unknown park ${park}`);

  const { data, age, from } = await cached(
    `sched.${park}`, `/entity/${id}/schedule`, SCHEDULE_FRESH_MS, opts
  );

  const today = (data.schedule || []).filter((s) => s.date === dateStr);
  const operating = today.find((s) => s.type === 'OPERATING');
  const early = today.find((s) => s.description === 'Early Entry');
  return {
    open: operating ? operating.openingTime : null,
    close: operating ? operating.closingTime : null,
    earlyOpen: early ? early.openingTime : null,
    /* The raw rows as well: ticketed parties live here, and they are what
     * explain a park that shuts at six. */
    schedule: data.schedule || [],
    age, from,
  };
}

/* The date in park time, which is the only date a park day has. A plan made
 * at 11pm Florida time belongs to that day, not to tomorrow.
 */
export function parkDate(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(now);
}

export function parkClock(when) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  }).format(when instanceof Date ? when : new Date(when));
}

/* How old, in words. "just now" is a promise; "14 min ago" is a warning. */
export function ageWords(ms) {
  if (!Number.isFinite(ms)) return 'no data yet';
  const min = Math.round(ms / 60000);
  if (min <= 0) return 'just now';
  if (min === 1) return '1 min ago';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h === 1 ? 'an hour ago' : `${h} hours ago`;
}
