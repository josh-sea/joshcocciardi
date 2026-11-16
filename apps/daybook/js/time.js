/* Dates without time zones.
 *
 * Every date in Daybook is a local "YYYY-MM-DD" string and every time is
 * minutes after midnight. That keeps the layout maths plain integers and
 * stops a day from sliding when the device changes zone.
 */

export const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const today = (now = new Date()) => dateKey(now);

export const addDays = (key, n) => {
  const d = parseDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const dayOfWeek = (key) => parseDate(key).getDay();

/** The Monday-or-Sunday that starts the week holding `key`. */
export const weekStart = (key, firstDay = 0) => {
  const back = (dayOfWeek(key) - firstDay + 7) % 7;
  return addDays(key, -back);
};

export const weekDays = (key, firstDay = 0) => {
  const start = weekStart(key, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

export const daysBetween = (a, b) =>
  Math.round((parseDate(b) - parseDate(a)) / 86400000);

/** "09:30" -> 570 */
export const toMin = (hhmm) => {
  if (hhmm == null || hhmm === '') return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** 570 -> "09:30" */
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const nowMin = (now = new Date()) => now.getHours() * 60 + now.getMinutes();

/** 570 -> "9:30a", 720 -> "12p" */
export const clock = (min) => {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 || 12;
  const ap = h24 < 12 ? 'a' : 'p';
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
};

/** 150 -> "2h 30m", 45 -> "45m", 120 -> "2h" */
export const span = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const label = (key, style = 'short') => {
  const d = parseDate(key);
  if (style === 'dow') return DOW[d.getDay()];
  if (style === 'long') return `${DOW_LONG[d.getDay()]}, ${MON_LONG[d.getMonth()]} ${d.getDate()}`;
  if (style === 'month') return `${MON_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return `${MON[d.getMonth()]} ${d.getDate()}`;
};

/** "Nov 16 – 22" or "Nov 30 – Dec 6" */
export const weekLabel = (days) => {
  const a = parseDate(days[0]), b = parseDate(days[days.length - 1]);
  if (a.getMonth() === b.getMonth()) return `${MON[a.getMonth()]} ${a.getDate()} – ${b.getDate()}`;
  return `${MON[a.getMonth()]} ${a.getDate()} – ${MON[b.getMonth()]} ${b.getDate()}`;
};
