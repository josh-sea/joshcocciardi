/* Daybook state: plain data and pure updates.
 *
 * The UI calls `apply(state, action)` and gets a new state back; the
 * caller persists it. Nothing here touches the DOM or storage, so the
 * tests can run every action in node.
 */

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e64980', '#5f3dc4', '#868e96'];

export const fresh = () => ({
  version: 1,
  settings: { from: 7 * 60, to: 22 * 60, firstDay: 0, showGaps: true },
  calendars: [
    { id: 'me', name: 'Josh', color: '#1c7ed6', visible: true },
    { id: 'ash', name: 'Ash', color: '#e64980', visible: true },
    { id: 'family', name: 'Family', color: '#2f9e44', visible: true },
  ],
  events: [],
  todos: [],
  trackers: [],
  entries: {},
});

/** Fill in anything a stored state from an older version is missing. */
export const migrate = (raw) => {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    calendars: Array.isArray(raw.calendars) && raw.calendars.length ? raw.calendars : base.calendars,
    events: Array.isArray(raw.events) ? raw.events : [],
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    trackers: Array.isArray(raw.trackers) ? raw.trackers : [],
    entries: raw.entries && typeof raw.entries === 'object' ? raw.entries : {},
  };
};

const upsert = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = { ...list[i], ...item };
  return next;
};

export const apply = (s, a) => {
  switch (a.type) {
    case 'event/save':
      return { ...s, events: upsert(s.events, { id: uid(), ...a.event }) };
    case 'event/delete':
      return { ...s, events: s.events.filter((e) => e.id !== a.id) };
    case 'event/skip': // delete one occurrence of a repeating event
      return {
        ...s,
        events: s.events.map((e) => (e.id === a.id ? { ...e, skip: [...(e.skip || []), a.day] } : e)),
      };

    case 'todo/add': {
      const title = (a.title || '').trim();
      if (!title) return s;
      return { ...s, todos: [...s.todos, { id: uid(), title, done: false, due: a.due || null, created: a.created, order: s.todos.length }] };
    }
    case 'todo/toggle':
      return {
        ...s,
        todos: s.todos.map((t) => (t.id === a.id ? { ...t, done: !t.done, doneOn: t.done ? null : a.day } : t)),
      };
    case 'todo/edit':
      return { ...s, todos: s.todos.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) };
    case 'todo/delete':
      return { ...s, todos: s.todos.filter((t) => t.id !== a.id) };
    case 'todo/clearDone':
      return { ...s, todos: s.todos.filter((t) => !t.done) };

    case 'tracker/save':
      return { ...s, trackers: upsert(s.trackers, { id: uid(), ...a.tracker }) };
    case 'tracker/delete': {
      const entries = { ...s.entries };
      delete entries[a.id];
      return { ...s, trackers: s.trackers.filter((t) => t.id !== a.id), entries };
    }
    case 'tracker/move': {
      const i = s.trackers.findIndex((t) => t.id === a.id), j = i + a.by;
      if (i < 0 || j < 0 || j >= s.trackers.length) return s;
      const trackers = s.trackers.slice();
      [trackers[i], trackers[j]] = [trackers[j], trackers[i]];
      return { ...s, trackers };
    }
    case 'entry/set': {
      const forTracker = { ...(s.entries[a.tracker] || {}) };
      const v = a.value;
      if (v == null || v === '' || v === false || (typeof v === 'number' && Number.isNaN(v))) delete forTracker[a.day];
      else forTracker[a.day] = v;
      return { ...s, entries: { ...s.entries, [a.tracker]: forTracker } };
    }

    case 'calendar/save':
      return { ...s, calendars: upsert(s.calendars, { id: uid(), visible: true, ...a.calendar }) };
    case 'calendar/toggle':
      return { ...s, calendars: s.calendars.map((c) => (c.id === a.id ? { ...c, visible: !c.visible } : c)) };
    case 'calendar/delete':
      if (s.calendars.length <= 1) return s;
      return {
        ...s,
        calendars: s.calendars.filter((c) => c.id !== a.id),
        events: s.events.filter((e) => e.cal !== a.id),
      };

    case 'settings/set':
      return { ...s, settings: { ...s.settings, ...a.patch } };

    case 'import/events': {
      // Replace everything previously imported from this source in the
      // imported date range, then add the new copies. Re-importing the same
      // week twice leaves one copy of each event.
      const { source, events, calendars = [], from, to } = a;
      const kept = s.events.filter((e) => !(e.source === source && (!from || (e.date >= from && e.date <= to))));
      let cals = s.calendars;
      for (const c of calendars) if (!cals.some((x) => x.id === c.id)) cals = [...cals, { visible: true, ...c }];
      return { ...s, calendars: cals, events: [...kept, ...events] };
    }

    case 'replace':
      return migrate(a.state);
    default:
      return s;
  }
};
