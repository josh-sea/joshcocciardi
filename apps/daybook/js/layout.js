/* Where things sit on a horizontal day.
 *
 * A day is a strip from `from` to `to` (minutes). Timed events become
 * blocks positioned as a fraction of that strip, so an empty afternoon
 * looks empty. Overlapping events stack into lanes; events that do not
 * touch anything stay full height. The space between busy stretches is
 * reported as named gaps so the strip can say "2h free".
 */

import { toMin } from './time.js';

/** Expand an event (which may repeat) into the occurrence on `day`, or null. */
export const occursOn = (ev, day, dow, daysFrom) => {
  if (ev.date === day) return true;
  if (!ev.repeat || ev.repeat === 'none') return false;
  if (day < ev.date) return false;
  if (ev.until && day > ev.until) return false;
  if ((ev.skip || []).includes(day)) return false;
  const d = daysFrom(ev.date, day);
  switch (ev.repeat) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return d % 7 === 0;
    case 'biweekly': return d % 14 === 0;
    case 'monthly': return day.slice(8) === ev.date.slice(8);
    case 'yearly': return day.slice(5) === ev.date.slice(5);
    default: return false;
  }
};

/** Events on a day, split into all-day and timed (with numeric start/end). */
export const eventsForDay = (events, day, { dow, daysFrom, visible = () => true }) => {
  const allDay = [], timed = [];
  for (const ev of events) {
    if (!visible(ev)) continue;
    // Multi-day all-day events cover every day up to endDate.
    const multi = ev.allDay && ev.endDate && ev.endDate > ev.date && day >= ev.date && day <= ev.endDate;
    if (!multi && !occursOn(ev, day, dow, daysFrom)) continue;
    if (ev.allDay) { allDay.push(ev); continue; }
    const start = toMin(ev.start);
    let end = toMin(ev.end);
    if (end == null || end <= start) end = start + 30;
    timed.push({ ...ev, s: start, e: Math.min(end, 24 * 60) });
  }
  timed.sort((a, b) => a.s - b.s || b.e - a.e);
  return { allDay, timed };
};

/**
 * Put timed events into lanes. Returns each event with `lane` and `lanes`
 * (the number of lanes in its overlap cluster) so a cluster of three
 * overlapping meetings splits the strip height in three, while a lone
 * dentist appointment next to it keeps the full height.
 */
export const lanes = (timed) => {
  const out = [];
  let cluster = [], laneEnds = [], clusterEnd = -1;
  const flush = () => {
    for (const ev of cluster) ev.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = []; laneEnds = []; clusterEnd = -1;
  };
  for (const src of timed) {
    const ev = { ...src };
    if (cluster.length && ev.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.e); }
    else laneEnds[lane] = ev.e;
    ev.lane = lane;
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  if (cluster.length) flush();
  return out;
};

/** Merge busy intervals and return the free ones inside [from, to]. */
export const gaps = (timed, from, to, minGap = 15) => {
  const busy = timed
    .map((ev) => [Math.max(ev.s, from), Math.min(ev.e, to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s - cursor >= minGap) free.push({ s: cursor, e: s, len: s - cursor });
    cursor = Math.max(cursor, e);
  }
  if (to - cursor >= minGap) free.push({ s: cursor, e: to, len: to - cursor });
  return free;
};

/** Total busy minutes inside the window (overlaps counted once). */
export const busyMinutes = (timed, from, to) => {
  const free = gaps(timed, from, to, 0).reduce((n, g) => n + g.len, 0);
  return to - from - free;
};

/**
 * The window to draw. Starts from the preferred hours but stretches to
 * the hour when something happens outside them, so a 5:30am flight or a
 * late game is never cut off.
 */
export const windowFor = (timedLists, pref = { from: 7 * 60, to: 22 * 60 }) => {
  let from = pref.from, to = pref.to;
  for (const list of timedLists) for (const ev of list) {
    from = Math.min(from, Math.floor(ev.s / 60) * 60);
    to = Math.max(to, Math.ceil(ev.e / 60) * 60);
  }
  return { from: Math.max(0, from), to: Math.min(24 * 60, to) };
};

/** Fraction across the strip, clamped. */
export const frac = (min, win) =>
  Math.min(1, Math.max(0, (min - win.from) / (win.to - win.from)));
