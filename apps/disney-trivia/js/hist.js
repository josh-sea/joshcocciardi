/* Park Planner: reading the wait archive.
 *
 * The archive holds a median wait per ride per day, going back as far as the
 * API would let us read when we copied it. This file is the arithmetic over
 * it: decoding the stored series, and the three questions worth asking of a
 * year of waits.
 *
 *   by month    is November quieter than December
 *   by weekday  is Tuesday quieter than Saturday
 *   by range    was that week unusual, and for which rides
 *
 * Pure. No DOM, no fetch. `histui.js` draws it and `histdata.js` fetches it.
 *
 * Every figure here is a median, never a mean. A mean wait is dragged around
 * by whichever headliner broke down that afternoon; a median moves when the
 * park moves. That choice is why the numbers are comparable at all.
 */

/* A series is "15,12.5,,20": one slot per day from the rollup's `from`, empty
 * where the archive has nothing. Empty is not zero. A ride genuinely posting
 * a zero-minute wait and a ride nobody recorded are different facts, and
 * collapsing them would quietly pull every average down.
 */
export function decodeSeries(text) {
  if (typeof text !== 'string' || !text.length) return [];
  return text.split(',').map((t) => (t === '' ? null : Number(t)));
}

export const PARK_TZ = 'America/New_York';

const at = (dateStr) => new Date(`${dateStr}T12:00:00Z`);

export function addDays(dateStr, n) {
  const d = at(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* The date at a position in a series, and the position of a date. Both are
 * arithmetic on the rollup's `from`, which is what lets a series carry no
 * dates of its own.
 */
export const dateAt = (from, i) => addDays(from, i);

export function indexOfDate(from, date) {
  if (!from || !date) return -1;
  const ms = at(date).getTime() - at(from).getTime();
  const days = Math.round(ms / 86400000);
  return days >= 0 ? days : -1;
}

export function median(values) {
  const s = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[mid - 1] + s[mid]) / 2;
}

/* ── grouping ──────────────────────────────────────────────────────────────
 *
 * Each returns `{ key, label, value, days }` rows, with `value` null for a
 * bucket the archive has nothing for. A null bucket is drawn as absent rather
 * than as zero, which is the whole reason it is not simply left out: a gap in
 * the middle of a year should look like a gap.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function byMonth(series, from) {
  const buckets = new Map();
  series.forEach((v, i) => {
    const date = dateAt(from, i);
    const key = date.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(v);
  });
  return [...buckets.entries()].map(([key, values]) => ({
    key,
    label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
    value: median(values),
    days: values.filter((v) => v !== null).length,
  }));
}

export function byWeekday(series, from) {
  const buckets = DOW.map(() => []);
  series.forEach((v, i) => {
    // The park's own calendar day, read back as UTC because that is how the
    // date string was built. No zone conversion belongs here: the day a wait
    // was posted on was already decided when it was recorded.
    buckets[at(dateAt(from, i)).getUTCDay()].push(v);
  });
  // Monday first: a week that starts on Sunday puts the two busiest days at
  // opposite ends of the chart and hides that they are adjacent.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((d) => ({
    key: String(d),
    label: DOW[d],
    value: median(buckets[d]),
    days: buckets[d].filter((v) => v !== null).length,
  }));
}

/* ── a range ───────────────────────────────────────────────────────────────
 *
 * `slice` is inclusive at both ends, because a date range a person typed is.
 */
export function slice(series, from, a, b) {
  const lo = Math.max(0, indexOfDate(from, a));
  const hi = Math.min(series.length - 1, indexOfDate(from, b));
  if (hi < lo) return [];
  return series.slice(lo, hi + 1);
}

export function rangeStats(series, from, a, b) {
  const cut = slice(series, from, a, b);
  const have = cut.filter((v) => v !== null);
  return { median: median(cut), days: have.length, asked: cut.length };
}

/* How a range compares with the whole window, which is the only way a number
 * like "15 minutes" means anything. Returns the difference in minutes and as
 * a percentage, and null when either side has nothing to compare.
 */
export function compareRange(series, from, a, b) {
  const inRange = rangeStats(series, from, a, b);
  const overall = median(series);
  if (inRange.median === null || overall === null || overall === 0) {
    return { ...inRange, overall, delta: null, pct: null };
  }
  return {
    ...inRange,
    overall,
    delta: Math.round((inRange.median - overall) * 10) / 10,
    pct: Math.round((inRange.median / overall - 1) * 100),
  };
}

/* ── rides ─────────────────────────────────────────────────────────────────
 *
 * Ranked by median in the chosen range, and a ride with nothing in that range
 * is left out rather than sorted to the bottom as a zero.
 */
export function rankRides(rides, from, a, b) {
  const out = [];
  for (const [id, ride] of Object.entries(rides || {})) {
    const series = decodeSeries(ride.p50);
    if (!series.length) continue;
    const stats = compareRange(series, from, a, b);
    if (stats.median === null) continue;
    out.push({ id, name: ride.n || id, ...stats });
  }
  return out.sort((x, y) => y.median - x.median || x.name.localeCompare(y.name));
}

/* The extremes, for a ride's own page. Reported with their dates, because
 * "busiest: 75 minutes" is trivia and "busiest: 75 minutes on 27 December"
 * is a reason to avoid a date.
 */
export function extremes(series, from) {
  let best = null;
  let worst = null;
  series.forEach((v, i) => {
    if (v === null) return;
    if (!best || v < best.value) best = { value: v, date: dateAt(from, i) };
    if (!worst || v > worst.value) worst = { value: v, date: dateAt(from, i) };
  });
  return { best, worst };
}

/* Bars scaled to the tallest in their own set, so a quiet park still draws a
 * readable shape. The question a chart answers is "when is this busy", not
 * "is it busier than somewhere else", and a shared scale answers neither.
 */
export function bars(rows) {
  // Any non-finite value is absent, not zero. `=== null` was not enough:
  // Math.max coerces null to 0 so the old guard did nothing, and it let an
  // `undefined` through as NaN, which is reachable the moment a caller hands
  // this ride rows (which carry `median`) instead of bucket rows.
  const height = (r) => (Number.isFinite(r && r.value) ? r.value : null);
  const top = Math.max(0, ...rows.map((r) => height(r) ?? 0));
  return rows.map((r) => {
    const v = height(r);
    return { ...r, pct: top > 0 && v !== null ? Math.round((v / top) * 100) : 0 };
  });
}

/* ── hours ─────────────────────────────────────────────────────────────────
 *
 * The hourly rollup gives every ride a 24-slot profile over the whole window
 * and seven more split by day of the week. `dow` is indexed by JavaScript's
 * own weekday numbering, Sunday first, because that is what produced it; the
 * UI reorders for display and must not reorder the data.
 */
export const HOURS = 24;

// Monday first for reading, Sunday first in the data. Keeping the mapping in
// one place is the difference between a chart that is rotated by a day and
// one that is not.
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const hourLabel = (h) => {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
};

/* The hours a park is actually open, so a chart does not spend a third of
 * its width on empty pre-dawn slots. Falls back to the whole day when there
 * is nothing to go on, rather than showing nothing.
 */
export function openHours(series) {
  let first = -1;
  let last = -1;
  series.forEach((v, h) => {
    if (v === null) return;
    if (first < 0) first = h;
    last = h;
  });
  if (first < 0) return { from: 0, to: HOURS - 1 };
  return { from: first, to: last };
}

export function hourRows(series, { from = 0, to = HOURS - 1 } = {}) {
  const rows = [];
  for (let h = from; h <= to && h < HOURS; h++) {
    rows.push({ key: String(h), label: hourLabel(h), value: series[h] ?? null, hour: h });
  }
  return rows;
}

/* The quietest and busiest hour a ride is open. The point of the hourly data
 * is a decision, and the decision is which hour to walk over.
 */
export function bestHour(series) {
  let best = null;
  let worst = null;
  series.forEach((v, h) => {
    if (v === null) return;
    if (!best || v < best.value) best = { hour: h, value: v };
    if (!worst || v > worst.value) worst = { hour: h, value: v };
  });
  return { best, worst };
}

/* A weekday-by-hour grid: seven rows of 24, each cell scaled against the
 * busiest cell in the whole grid rather than against its own row. A per-row
 * scale would make a quiet Tuesday look exactly as red as a heaving
 * Saturday, which is the opposite of what a heatmap is for.
 */
export function heatGrid(dowSeries) {
  const decoded = dowSeries.map((t) => decodeSeries(t));
  let top = 0;
  for (const row of decoded) for (const v of row) if (v !== null && v > top) top = v;

  return DOW_ORDER.map((d) => ({
    key: String(d),
    label: WEEKDAYS_SHORT[d],
    cells: Array.from({ length: HOURS }, (_, h) => {
      const v = decoded[d] ? decoded[d][h] ?? null : null;
      return { hour: h, value: v, pct: top > 0 && v !== null ? Math.round((v / top) * 100) : null };
    }),
  }));
}

const WEEKDAYS_SHORT = DOW;

export const WEEKDAYS = DOW;
export const MONTH_NAMES = MONTHS;
