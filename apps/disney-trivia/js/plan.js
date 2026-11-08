/* Park Planner: what is remembered, and for how long.
 *
 * Everything the planner remembered used to live under one key:
 *
 *   parkPlanner.day.2026-11-06.mk
 *
 * which is a fact about Friday at Magic Kingdom. Your must-dos are not. Nor
 * is how fast you walk, or the longest queue you will stand in. Those are
 * how you tour, and filing them under a date means they are gone tomorrow,
 * so you star the same six rides again every morning.
 *
 * So there are two things now, with two different lifetimes:
 *
 *   preferences  must-dos, pace, the wait limit, whether to skip a ride you
 *                hold a Lightning Lane for. Set once, kept.
 *   the day      what you have ridden and the Lightning Lanes you hold.
 *                True of one park on one date and meaningless the next day.
 *
 * Pure. No DOM, no storage, no network: `planner.js` does the reading and
 * writing, which is what makes the part worth getting right testable.
 */

import { DEFAULT_PACE } from './park.js';

export const PREFS_KEY = 'parkPlanner.prefs';
export const dayKey = (date, park) => `parkPlanner.day.${date}.${park}`;

/* The old key and the new day key are deliberately the same shape. The day
 * half of what was stored there is still exactly what belongs there, so a
 * migrated day is written back over itself and old and new installs of the
 * app never disagree about where to look.
 */
const DAY_KEY = /^parkPlanner\.day\.(\d{4}-\d{2}-\d{2})\.([a-z]+)$/;

export function parseDayKey(key) {
  const m = DAY_KEY.exec(String(key || ''));
  return m ? { date: m[1], park: m[2] } : null;
}

export const freshPrefs = () => ({
  mustDo: [], pace: DEFAULT_PACE, maxWaitMin: null, skipHeld: true,
});

export const freshDay = () => ({ done: [], llWindows: [] });

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/* Read back whatever is in storage without trusting its shape. A half-written
 * record, or one from a version that stored something else, must come back as
 * a usable object rather than throwing on the first `.includes`.
 */
export function readPrefs(raw) {
  const base = freshPrefs();
  if (!raw || typeof raw !== 'object') return base;
  return {
    mustDo: list(raw.mustDo),
    pace: Number.isFinite(raw.pace) ? raw.pace : base.pace,
    maxWaitMin: Number.isFinite(raw.maxWaitMin) ? raw.maxWaitMin : null,
    skipHeld: typeof raw.skipHeld === 'boolean' ? raw.skipHeld : base.skipHeld,
  };
}

export function readDay(raw) {
  if (!raw || typeof raw !== 'object') return freshDay();
  return {
    done: list(raw.done),
    llWindows: (Array.isArray(raw.llWindows) ? raw.llWindows : [])
      .filter((w) => w && typeof w.attractionId === 'string' && typeof w.start === 'string'),
  };
}

/* ── Lightning Lanes ───────────────────────────────────────────────────────
 *
 * A return window is an hour, so an hour is all it can be. Asking for both
 * ends was asking for a fact the app already knows, and getting it wrong,
 * or getting "to" before "from", was a thing you could do.
 *
 * The end is still stored. The planner reasons about a window, not a start,
 * and a stored end means that reasoning does not have to know the rule, or
 * change if Disney ever does.
 */
export const LL_MINUTES = 60;

export function llWindow(attractionId, start, minutes = LL_MINUTES) {
  if (!attractionId || !(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  return {
    attractionId,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60000).toISOString(),
  };
}

export const byStart = (a, b) => new Date(a.start) - new Date(b.start);

/* ── moving what is already there ──────────────────────────────────────────
 *
 * Nobody re-stars six rides because the storage shape changed, so the
 * must-dos already saved have to come across.
 *
 * They are unioned over every day found, not taken from the newest. Starring
 * is how you say "while we are here", and those stars were spread over
 * whichever mornings you happened to set them; taking only the last day's
 * would silently drop the rest. The single-valued settings do come from the
 * newest day, because there is no sensible union of two walking paces.
 *
 * Days keep their own `done` and Lightning Lanes, rewritten without the
 * preference fields that no longer belong to them.
 */
export function migrate(entries) {
  const usable = (entries || []).filter((e) => e && e.value && typeof e.value === 'object');

  const prefs = freshPrefs();
  const mustDo = new Set();
  let newest = null;

  for (const e of usable) {
    for (const id of list(e.value.mustDo)) mustDo.add(id);
    if (!newest || String(e.date) > String(newest.date)) newest = e;
  }

  prefs.mustDo = [...mustDo];
  if (newest) {
    const v = newest.value;
    if (Number.isFinite(v.pace)) prefs.pace = v.pace;
    if (Number.isFinite(v.maxWaitMin)) prefs.maxWaitMin = v.maxWaitMin;
    if (typeof v.skipHeld === 'boolean') prefs.skipHeld = v.skipHeld;
  }

  return {
    prefs,
    days: usable.map((e) => ({ key: e.key, value: readDay(e.value) })),
  };
}
