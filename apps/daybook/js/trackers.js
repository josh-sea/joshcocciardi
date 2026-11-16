/* Trackers: the small things that live on a day besides events.
 *
 * Each tracker has a kind that decides its little UI and what counts as
 * "done" for the badge on the week view:
 *
 *   check   did it or did not (workout, vitamins, no phone at dinner)
 *   count   tap up to a goal (glasses of water, pages read)
 *   number  log a value (weight, miles, hours slept)
 *   mood    one of five faces
 *   note    a line or two of text (a journal, what the kids said)
 */

export const KINDS = {
  check: { name: 'Habit', hint: 'Did it or didn\'t' },
  count: { name: 'Counter', hint: 'Tap up to a daily goal' },
  number: { name: 'Log a number', hint: 'Weight, miles, hours of sleep' },
  mood: { name: 'Mood', hint: 'One of five faces' },
  note: { name: 'Note', hint: 'A line or two for the day' },
};

export const MOODS = ['😣', '😕', '😐', '🙂', '😄'];

export const valueOf = (entries, trackerId, day) => entries?.[trackerId]?.[day];

const empty = (v) => v == null || v === '' || v === false || v === 0;

/** 'done' | 'partial' | null: what the badge for this tracker on this day shows. */
export const status = (tracker, value) => {
  if (tracker.kind === 'number' && value === 0) return 'done'; // logged a zero
  if (empty(value)) return null;
  switch (tracker.kind) {
    case 'check': return value ? 'done' : null;
    case 'count': return value >= (tracker.goal || 1) ? 'done' : 'partial';
    case 'number':
    case 'mood':
    case 'note': return 'done';
    default: return null;
  }
};

/** The glyph a badge shows: the face for mood, the tracker's icon for the rest. */
export const badgeGlyph = (tracker, value) =>
  tracker.kind === 'mood' && value ? MOODS[value - 1] : tracker.icon;

/** The badges for one day, in tracker order. */
export const badges = (trackers, entries, day) =>
  trackers
    .filter((t) => !t.archived)
    .map((t) => {
      const v = valueOf(entries, t.id, day);
      const s = status(t, v);
      return s && { id: t.id, glyph: badgeGlyph(t, v), status: s, title: summary(t, v) };
    })
    .filter(Boolean);

export const summary = (t, v) => {
  if (empty(v)) return `${t.name}: nothing yet`;
  switch (t.kind) {
    case 'check': return `${t.name}: done`;
    case 'count': return `${t.name}: ${v} of ${t.goal || 1}${t.unit ? ' ' + t.unit : ''}`;
    case 'number': return `${t.name}: ${v}${t.unit ? ' ' + t.unit : ''}`;
    case 'mood': return `${t.name}: ${MOODS[v - 1]}`;
    case 'note': return `${t.name}: ${String(v).slice(0, 60)}`;
    default: return t.name;
  }
};

/**
 * Days in a row the tracker was done, ending on `day`. If `day` itself is
 * not done yet the streak still counts back from yesterday, so a streak
 * does not read 0 every morning before you have had the chance.
 */
export const streak = (tracker, entries, day, addDays) => {
  const done = (d) => status(tracker, valueOf(entries, tracker.id, d)) === 'done';
  let d = done(day) ? day : addDays(day, -1);
  let n = 0;
  while (done(d) && n < 3660) { n++; d = addDays(d, -1); }
  return n;
};

/** How many of the given days were done. */
export const tally = (tracker, entries, days) =>
  days.filter((d) => status(tracker, valueOf(entries, tracker.id, d)) === 'done').length;

/** The next value when the tracker's chip is tapped once. */
export const tap = (tracker, value) => {
  switch (tracker.kind) {
    case 'check': return value ? null : true;
    case 'count': return (value || 0) + 1;
    default: return value;
  }
};

export const STARTERS = [
  { name: 'Workout', icon: '💪', kind: 'check' },
  { name: 'Water', icon: '💧', kind: 'count', goal: 8, unit: 'glasses' },
  { name: 'Read', icon: '📚', kind: 'check' },
  { name: 'Mood', icon: '🙂', kind: 'mood' },
  { name: 'Weight', icon: '⚖️', kind: 'number', unit: 'lb' },
  { name: 'Journal', icon: '📝', kind: 'note' },
  { name: 'Sleep', icon: '😴', kind: 'number', unit: 'h' },
  { name: 'Steps', icon: '👟', kind: 'number', unit: 'steps' },
  { name: 'Vitamins', icon: '💊', kind: 'check' },
  { name: 'No alcohol', icon: '🚱', kind: 'check' },
];
