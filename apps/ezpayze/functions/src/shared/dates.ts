// Calendar-day helpers. A "date key" is "YYYY-MM-DD" in the owner's own time
// zone. Keys compare correctly as strings, so Firestore range queries on them
// need no composite index.

export interface LocalParts {
  dateKey: string;
  minutes: number; // minutes since local midnight
}

/** The calendar date and wall-clock time at `now` in `timeZone`. */
export function localParts(now: number, timeZone: string): LocalParts {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return localParts(now, 'America/New_York');
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(now))) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

/**
 * The owner's local date if their local clock has reached `hhmm` today, else
 * null. Drives both the morning list and the send time, per time zone.
 */
export function passedLocalTime(now: number, timeZone: string, hhmm: string): string | null {
  const { dateKey, minutes } = localParts(now, timeZone);
  return minutes >= timeToMinutes(hhmm) ? dateKey : null;
}

export function todayKey(timeZone: string, now = Date.now()): string {
  return localParts(now, timeZone).dateKey;
}

/** "07:30" -> 450. Bad input falls back to 7am. */
export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return 7 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return utcToKey(keyToUtc(s)) === s;
}

export function addDays(key: string, days: number): string {
  return utcToKey(keyToUtc(key) + days * 86400000);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / 86400000);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Same day-of-month `n` months later, clamped to the month's length. */
export function addMonths(key: string, n: number, dayOfMonth?: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(dayOfMonth ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Nov 1" or "Nov 1, 2027" when the year differs from `relativeTo`. */
export function shortDate(key: string, relativeTo?: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  if (relativeTo && relativeTo.slice(0, 4) === key.slice(0, 4)) return base;
  return `${base}, ${y}`;
}

export function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${LONG_MONTHS[m - 1]} ${d}, ${y}`;
}

/** "11:00" -> "11am", "13:30" -> "1:30pm". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}

/** "5 days late", "due today", "due in 3 days". */
export function lateLabel(dueKey: string, today: string): string {
  const late = daysBetween(dueKey, today);
  if (late === 0) return 'Due today';
  if (late === 1) return '1 day late';
  if (late > 1) return `${late} days late`;
  if (late === -1) return 'Due tomorrow';
  return `Due in ${-late} days`;
}
