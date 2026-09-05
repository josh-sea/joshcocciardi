/* Progress, spacing and settings. All of it lives in localStorage; there is no
 * account and nothing leaves the device.
 *
 * Scheduling is a five-box Leitner system. It is not SM-2 and does not pretend
 * to be: the lexicon is closed at 192 words, so the job is to keep a small
 * deck warm rather than to model a lifetime of forgetting.
 */

import { WORDS, FAMILIES, BY_GLOSS } from './lexicon.js';
import { EXAMPLES, fromText } from './utterance.js';

const KEY = 'solra.progress.v1';

/* Box → how long before it comes back. Box 0 is "just got it wrong". */
export const BOX_INTERVALS_MIN = [10, 60 * 20, 60 * 24 * 2, 60 * 24 * 5, 60 * 24 * 12, 60 * 24 * 30];
export const MAX_BOX = BOX_INTERVALS_MIN.length - 1;

export const FOUNDATION_ITEMS = [
  ...Array.from({ length: 8 }, (_, i) => `tone:${i}`),
  ...Array.from({ length: 8 }, (_, i) => `class:${i}`),
  'prosody:register', 'prosody:urgency', 'prosody:coda',
];

const DEFAULTS = {
  v: 1,
  deck: {},
  unlocked: ['0.0', '0.1'],
  lessons: {},
  history: {},
  streak: { days: 0, last: null },
  settings: {
    randomizePitch: true,
    showRomanization: true,
    autoplay: true,
    urgency: 0,
    volume: 0.9,
  },
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

let state = null;

export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS);
    state.settings = { ...DEFAULTS.settings, ...(state.settings || {}) };
  } catch (e) {
    state = clone(DEFAULTS);
  }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
}

export function reset() {
  state = clone(DEFAULTS);
  save();
  return state;
}

export function settings() { return load().settings; }

export function setSetting(key, value) {
  load().settings[key] = value;
  save();
}

/* ── The deck ─────────────────────────────────────────────────────────── */

export function isUnlocked(familyKey) {
  return load().unlocked.includes(familyKey);
}

export function unlock(familyKey) {
  const s = load();
  if (!s.unlocked.includes(familyKey)) {
    s.unlocked.push(familyKey);
    save();
  }
}

export function lock(familyKey) {
  const s = load();
  s.unlocked = s.unlocked.filter((k) => k !== familyKey);
  for (const w of FAMILIES.find((f) => f.key === familyKey).words) delete s.deck[`word:${w.gloss}`];
  save();
}

export function unlockedWords() {
  const s = load();
  return WORDS.filter((w) => s.unlocked.includes(`${w.cls}.${w.fam}`));
}

/* A sentence question needs three distractors, so the corpus stays out of the
 * deck until at least four sentences are fully readable. */
export const MIN_SENTENCES = 4;

/* Sentences become available once every word in them is unlocked. Nothing to
 * configure: the corpus opens up as the deck grows. */
export function availableSentences() {
  const s = load();
  const has = (g) => {
    const w = BY_GLOSS.get(g);
    return w && s.unlocked.includes(`${w.cls}.${w.fam}`);
  };
  const ready = EXAMPLES.map((ex, i) => ({ ...ex, index: i, utterance: fromText(ex.text) }))
    .filter((ex) => ex.utterance && ex.english && ex.utterance.words.every(has));
  return ready.length >= MIN_SENTENCES ? ready : [];
}

/* Every item that could be scheduled right now. */
export function activeItems() {
  const items = FOUNDATION_ITEMS.slice();
  for (const w of unlockedWords()) items.push(`word:${w.gloss}`);
  for (const ex of availableSentences()) items.push(`sentence:${ex.index}`);
  return items;
}

export function entry(itemId) {
  const s = load();
  if (!s.deck[itemId]) s.deck[itemId] = { box: 0, due: 0, seen: 0, right: 0, wrong: 0, last: 0 };
  return s.deck[itemId];
}

export function peek(itemId) {
  return load().deck[itemId] || null;
}

/* Due items first, oldest first; then anything never seen. */
export function dueItems(now = Date.now()) {
  const s = load();
  const active = activeItems();
  const due = [];
  const fresh = [];
  for (const id of active) {
    const e = s.deck[id];
    if (!e || !e.seen) fresh.push(id);
    else if (e.due <= now) due.push(id);
  }
  due.sort((a, b) => s.deck[a].due - s.deck[b].due);
  return { due, fresh };
}

export function counts(now = Date.now()) {
  const { due, fresh } = dueItems(now);
  const s = load();
  const active = activeItems();
  let learned = 0;
  for (const id of active) {
    const e = s.deck[id];
    if (e && e.box >= 2) learned += 1;
  }
  return { due: due.length, fresh: fresh.length, active: active.length, learned };
}

/* Record an answer and reschedule. Wrong answers drop two boxes rather than
 * resetting to zero, so one slip does not erase a word you mostly know. */
export function record(itemId, correct, now = Date.now()) {
  const s = load();
  const e = entry(itemId);
  e.seen += 1;
  e.last = now;
  if (correct) {
    e.right += 1;
    e.box = Math.min(MAX_BOX, e.box + 1);
  } else {
    e.wrong += 1;
    e.box = Math.max(0, e.box - 2);
  }
  const jitter = 0.85 + Math.random() * 0.3;
  e.due = now + BOX_INTERVALS_MIN[e.box] * 60 * 1000 * jitter;

  const day = today();
  if (!s.history[day]) s.history[day] = { answered: 0, correct: 0 };
  s.history[day].answered += 1;
  if (correct) s.history[day].correct += 1;

  touchStreak(day);
  save();
  return e;
}

function touchStreak(day) {
  const s = load();
  if (s.streak.last === day) return;
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  s.streak.days = s.streak.last === yesterday ? s.streak.days + 1 : 1;
  s.streak.last = day;
}

export function streak() {
  const s = load();
  const day = today();
  if (s.streak.last !== day) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (s.streak.last !== y) return 0;
  }
  return s.streak.days;
}

export function todayStats() {
  return load().history[today()] || { answered: 0, correct: 0 };
}

export function historyDays(n = 30) {
  const s = load();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ day: key, ...(s.history[key] || { answered: 0, correct: 0 }) });
  }
  return out;
}

/* Strength of one family, 0..1, for the progress rings on the Learn tab. */
export function familyStrength(familyKey) {
  const fam = FAMILIES.find((f) => f.key === familyKey);
  if (!fam) return 0;
  const s = load();
  let total = 0;
  for (const w of fam.words) {
    const e = s.deck[`word:${w.gloss}`];
    if (e) total += e.box / MAX_BOX;
  }
  return total / fam.words.length;
}

export function classStrength(cls) {
  const keys = FAMILIES.filter((f) => f.cls === cls).map((f) => f.key);
  if (!keys.length) return 0;
  return keys.reduce((a, k) => a + familyStrength(k), 0) / keys.length;
}

export function foundationStrength() {
  const s = load();
  let total = 0;
  for (const id of FOUNDATION_ITEMS) {
    const e = s.deck[id];
    if (e) total += e.box / MAX_BOX;
  }
  return total / FOUNDATION_ITEMS.length;
}

export function markLesson(id) {
  load().lessons[id] = true;
  save();
}

export function lessonDone(id) { return !!load().lessons[id]; }
