// ---------------------------------------------------------------------------
// Park Planner: reducing a day of change rows to an hour-by-hour profile.
//
// Pure. No requires, no Firestore, no network.
//
// /history/daily gives one median per ride per day, which answers "was that
// week busy" and cannot answer "when should I walk over". That needs the raw
// endpoint, which returns every change: 3,186 rows across 70 entities for one
// park-day, 1.66MB. Far too much to keep, and the shape is wrong anyway.
//
// So it is reduced here to 24 numbers per ride per day.
//
// Two things about the raw rows decide how:
//
//   A row is a *change*, not a reading. Seven Dwarfs posts 182 rows in a day
//   and most of them change a Lightning Lane return time while the standby
//   wait sits still. Counting rows per hour would say an hour with ten
//   Lightning Lane updates was busier than an hour with one. The rows are a
//   step function and have to be replayed as one.
//
//   The day does not start at its first row. `opening` carries the state at
//   the start of the range, with its own observedAt, so a ride whose wait
//   last changed yesterday still has a wait this morning. Starting from the
//   first row would lose every early hour of a ride that opened steady.
//
// Each hour is then the value the board actually showed at its half hour,
// which is both the simplest rule to explain and the one that matches what
// "popular times" means: not an average over the hour, but what you would
// have seen standing there. An hour the ride was not OPERATING is empty,
// which is not a zero.
// ---------------------------------------------------------------------------

'use strict';

const HOURS = 24;

/* The park-local hour of an instant. The park's own clock decides which hour
 * a wait belongs to: a 1am posted wait is the previous day's late evening to
 * everyone who was standing in it.
 */
function parkHour(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d);
  const n = Number(h === '24' ? '00' : h);
  return Number.isInteger(n) && n >= 0 && n < HOURS ? n : null;
}

/* The park-local date of an instant, so a row that belongs to the next
 * calendar day in UTC is still filed under the park day it happened on.
 */
function parkDate(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const waitOf = (row) => {
  const q = row && row.queue && row.queue.STANDBY;
  const v = q ? q.waitTime : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/* One ride's day, as 24 slots.
 *
 * Replays the change rows as a step function and reads it at each half hour.
 * `status` is carried alongside the wait because a closed ride with a stale
 * wait still on the board is not a 40-minute queue, and recording it as one
 * would put a phantom peak in every evening after close.
 */
function sampleDay(entity, date, tz) {
  const out = new Array(HOURS).fill(null);
  if (!entity) return out;

  const open = entity.opening || {};
  let status = typeof open.status === 'string' ? open.status : null;
  let wait = waitOf(open);

  // Rows in time order; the API gives them that way but a sort costs nothing
  // and removes the assumption.
  const rows = (entity.history || [])
    .filter((r) => r && typeof r.time === 'string')
    .slice()
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  let i = 0;
  for (let h = 0; h < HOURS; h++) {
    // Advance the step function to this hour's half-hour mark.
    while (i < rows.length) {
      const row = rows[i];
      const rowDate = parkDate(row.time, tz);
      const rowHour = parkHour(row.time, tz);
      if (rowDate === null || rowHour === null) { i++; continue; }
      // Past the mark? Stop; this row belongs to a later hour.
      const past = rowDate > date || (rowDate === date && rowHour > h)
        || (rowDate === date && rowHour === h && minuteOf(row.time, tz) >= 30);
      if (past) break;
      if (typeof row.status === 'string') status = row.status;
      // Only a row that actually carries the field changes it. A row about a
      // Lightning Lane says nothing about the standby queue.
      if (row.queue && row.queue.STANDBY && 'waitTime' in row.queue.STANDBY) wait = waitOf(row);
      i++;
    }
    out[h] = status === 'OPERATING' ? wait : null;
  }
  return out;
}

function minuteOf(iso, tz) {
  const m = new Intl.DateTimeFormat('en-GB', { timeZone: tz, minute: '2-digit' }).format(new Date(iso));
  const n = Number(m);
  return Number.isInteger(n) ? n : 0;
}

function median(values) {
  const s = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[mid - 1] + s[mid]) / 2;
}

const encode = (values) => values
  .map((v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''))
  .join(',');

const decode = (text) => (typeof text === 'string' && text.length
  ? text.split(',').map((t) => (t === '' ? null : Number(t)))
  : []);

/* A whole park-day: every attraction that posted a wait, plus the park's own
 * hourly shape as the median across them. A ride that posted nothing all day
 * is left out rather than stored as 24 empties.
 */
function reduceDay(entities, date, tz) {
  const rides = {};
  const byHour = Array.from({ length: HOURS }, () => []);

  for (const e of entities || []) {
    if (!e || !e.id) continue;
    if (e.entityType && e.entityType !== 'ATTRACTION') continue;
    const slots = sampleDay(e, date, tz);
    if (!slots.some((v) => v !== null)) continue;
    rides[e.id] = { n: String(e.name || '').slice(0, 120), h: encode(slots) };
    slots.forEach((v, h) => { if (v !== null) byHour[h].push(v); });
  }

  return {
    date,
    rides,
    index: encode(byHour.map(median)),
    counted: Object.keys(rides).length,
  };
}

/* ── the rollup ────────────────────────────────────────────────────────────
 *
 * 399 stored park-days turned into the shape a chart wants: for the park and
 * for every ride, one 24-hour profile over the whole window, and seven more
 * split by day of the week.
 *
 * Split by weekday because that is where the hourly data earns its keep. A
 * single profile says a ride peaks at two; the weekday split says it peaks at
 * two on a Saturday and barely at all on a Thursday, which is the difference
 * between a fact and a plan.
 *
 * Medians throughout, and an hour with no observations stays empty. The two
 * must not be confused: a ride that was closed every Tuesday morning has no
 * Tuesday-morning wait, which is not the same as a zero-minute one.
 */
/* ── the per-day grid ──────────────────────────────────────────────────────
 *
 * The profiles below answer "when is this busy". They cannot answer "when is
 * this busy in October", because building them throws the date axis away.
 *
 * That is not a gap a richer summary fixes. A median cannot be
 * re-aggregated: ship a median per month and a reader who selects two
 * months, or a month and a weekday, has no correct number available. Any
 * cross-filtering worth the name needs the values themselves, grouped at
 * read time over whatever is selected.
 *
 * So one 24-slot series per day goes out as well, positional from `from` the
 * same way the daily rollup's series are, with an empty entry for a day the
 * archive has nothing for. About 20KB per ride over Magic Kingdom's 398
 * days, against the 1MB document limit.
 *
 * Per ride only. The park's own grid is another 22KB in a document fetched
 * on every page open, and the park-level charts do not cross-filter yet, so
 * it would be 44% added to a hot path for data nothing reads. It is four
 * lines to add back when those charts want it, and the rollup is a
 * projection, so adding it is a rebuild and not a migration.
 */
const DAY_SEP = ';';

const at = (dateStr) => new Date(`${dateStr}T12:00:00Z`);

function dayIndex(from, date) {
  return Math.round((at(date).getTime() - at(from).getTime()) / 86400000);
}

function dayCount(from, to) {
  return dayIndex(from, to) + 1;  // inclusive at both ends
}

/* Trailing empty days are dropped; leading ones never are. The grid is
 * positional, so an empty slot at the front is what makes day 40 land on day
 * 40, while an empty one at the end carries no information at all.
 */
const encodeGrid = (perDay) => perDay
  .map((slots) => (slots ? encode(slots) : ''))
  .join(DAY_SEP)
  .replace(new RegExp(`(?:${DAY_SEP})+$`), '');

function buildHours(park, docs) {
  const rows = (docs || [])
    .filter((d) => d && typeof d.date === 'string')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!rows.length) return null;

  const span = dayCount(rows[0].date, rows[rows.length - 1].date);
  // id -> 24-slot series per day, positional from the first day
  const gridByRide = new Map();

  // id -> { n, all: [24][], dow: [7][24][] }
  const rides = new Map();
  const parkAll = Array.from({ length: HOURS }, () => []);
  const parkDow = Array.from({ length: 7 }, () => Array.from({ length: HOURS }, () => []));

  for (const row of rows) {
    // The park's own date string, read back as UTC because that is how it was
    // written. No zone conversion belongs here: which day this was has
    // already been decided.
    const dow = at(row.date).getUTCDay();
    const i = dayIndex(rows[0].date, row.date);

    decode(row.index).forEach((v, h) => {
      if (v === null) return;
      parkAll[h].push(v);
      parkDow[dow][h].push(v);
    });

    for (const [id, ride] of Object.entries(row.rides || {})) {
      if (!ride) continue;
      let slot = rides.get(id);
      if (!slot) {
        slot = {
          n: '',
          all: Array.from({ length: HOURS }, () => []),
          dow: Array.from({ length: 7 }, () => Array.from({ length: HOURS }, () => [])),
        };
        rides.set(id, slot);
      }
      // Rows are sorted, so the last name wins: the one a reader recognises.
      if (typeof ride.n === 'string' && ride.n) slot.n = ride.n;

      const hours = decode(ride.h);
      if (i >= 0 && i < span && hours.length) {
        let grid = gridByRide.get(id);
        if (!grid) { grid = new Array(span).fill(null); gridByRide.set(id, grid); }
        grid[i] = hours;
      }

      hours.forEach((v, h) => {
        if (v === null) return;
        slot.all[h].push(v);
        slot.dow[dow][h].push(v);
      });
    }
  }

  const profile = (buckets) => encode(buckets.map(median));
  const ridesOut = {};
  for (const [id, slot] of rides) {
    if (!slot.all.some((b) => b.length)) continue;
    ridesOut[id] = { n: slot.n || id, all: profile(slot.all), dow: slot.dow.map(profile) };
  }

  /* The per-ride grids are returned beside the rollup rather than inside it.
   * All of them together are about 620KB for Magic Kingdom and grow with
   * every day collected, so they belong in a document each, fetched when a
   * ride is actually opened. The caller writes them; this only shapes them.
   */
  const grids = {};
  for (const [id, grid] of gridByRide) {
    if (!ridesOut[id]) continue;  // a ride dropped for posting nothing
    const h = encodeGrid(grid);
    if (h) grids[id] = { n: ridesOut[id].n, h };
  }

  return {
    park,
    from: rows[0].date,
    to: rows[rows.length - 1].date,
    days: rows.length,
    span,
    index: { all: profile(parkAll), dow: parkDow.map(profile) },
    rides: ridesOut,
    grids,
  };
}

module.exports = {
  HOURS, parkHour, parkDate, minuteOf, sampleDay, reduceDay, buildHours,
  median, encode, decode,
  encodeGrid, dayIndex, dayCount, DAY_SEP,
};
