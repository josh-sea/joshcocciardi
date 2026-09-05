/* Question generators.
 *
 * The order here follows §10 of the spec: class prefixes first, prosody
 * second, then vocabulary drilled inside a family, because words in a family
 * differ by exactly one slot and are therefore the confusable set worth
 * practising.
 *
 * Every generator returns the same shape, so the drill view does not care
 * which kind it is looking at:
 *
 *   { itemId, kind, title, subtitle, render(), hint?, choices, answer,
 *     layout, reveal }
 */

import {
  WORDS, FAMILIES, CLASSES, SYLLABLES, NOTE_NAMES, FREQ,
  REGISTERS, URGENCIES, CODAS, BY_GLOSS,
} from './lexicon.js';
import { renderUtterance, renderTone, renderPreamble, SAMPLE_RATE } from './synth.js';
import { describe } from './utterance.js';
import * as progress from './progress.js';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function sampleWithout(arr, n, exclude) {
  const pool = arr.filter((x) => !exclude.includes(x));
  return shuffle(pool).slice(0, n);
}

/* A free pitch multiplier so learners cannot anchor on absolute pitch (§10).
 * Never applied where the answer depends on absolute pitch — see the register
 * drill below. */
function transpose() {
  return progress.settings().randomizePitch ? 0.72 + Math.random() * 0.62 : 1;
}

function concatRendered(parts) {
  const total = parts.reduce((a, p) => a + p.samples.length, 0);
  const samples = new Float32Array(total);
  const marks = [];
  let at = 0;
  for (const p of parts) {
    for (const m of (p.marks || [])) marks.push({ ...m, start: m.start + at, end: m.end + at });
    samples.set(p.samples, at);
    at += p.samples.length;
  }
  return { samples, sampleRate: SAMPLE_RATE, duration: total / SAMPLE_RATE, marks };
}

function silence(ms) {
  return { samples: new Float32Array(Math.round((SAMPLE_RATE * ms) / 1000)), sampleRate: SAMPLE_RATE, marks: [] };
}

const SHORT_SENTENCES = [
  'DROID READY', 'I SEE DOG', 'WATER COLD', 'SKY DARK', 'POWER FULL',
  'YOU GO HOME', 'MACHINE WORK', 'CHILD HAPPY', 'PATH LONG', 'FOOD GOOD',
];

/* ── 1. Tones (§1.1) ──────────────────────────────────────────────────── */

/* The preamble is the pitch reference the language itself provides, so the
 * drill hands the learner exactly what a decoder gets: do–so, then the tone to
 * name. That keeps it honest under pitch randomisation. */
function toneQuestion(tone) {
  const t = transpose();
  return {
    itemId: `tone:${tone}`,
    kind: 'tone',
    title: 'Name the tone',
    subtitle: 'The two-note chirp is your reference: do, then so. Which tone follows it?',
    render: () => concatRendered([
      renderPreamble({ transpose: t }),
      silence(220),
      { samples: renderTone(FREQ[tone] * t, 400), sampleRate: SAMPLE_RATE, marks: [] },
    ]),
    choices: SYLLABLES.map((syl, i) => ({ key: String(i), label: syl, sub: `T${i}`, tone: i })),
    answer: String(tone),
    layout: 'grid8',
    reveal: {
      title: `T${tone} · ${SYLLABLES[tone]}`,
      note: `${NOTE_NAMES[tone]} at ${FREQ[tone].toFixed(2)} Hz in the neutral register. Adjacent tones sit at least three semitones apart.`,
    },
  };
}

/* ── 2. Class prefixes (§2.2) ─────────────────────────────────────────── */

function classQuestion(cls) {
  const word = pick(WORDS.filter((w) => w.cls === cls));
  const t = transpose();
  return {
    itemId: `class:${cls}`,
    kind: 'class',
    title: 'Which class is this word?',
    subtitle: 'The first tone of every word names its class. You only need the first slot.',
    render: () => renderUtterance(
      { words: [word.gloss], register: 0, urgency: 0, coda: null },
      { preamble: true, coda: false, transpose: t },
    ),
    choices: CLASSES.map((c) => ({ key: String(c.id), label: c.name, sub: SYLLABLES[c.id] })),
    answer: String(cls),
    layout: 'grid8',
    reveal: {
      title: `${CLASSES[cls].name} — ${word.gloss}`,
      roman: word.roman,
      note: `${word.address} · ${CLASSES[cls].gloss}`,
    },
  };
}

/* ── 3. Prosody (§3) ──────────────────────────────────────────────────── */

function registerQuestion() {
  const reg = pick(REGISTERS);
  const words = pick(SHORT_SENTENCES).split(' ');
  const u = { words, register: reg.value, urgency: 0, coda: 'fall' };
  // Register is a transposition of the whole utterance against a known
  // reference pitch, so randomising the base would make it unanswerable. The
  // compare button below is the learner's reference instead.
  return {
    itemId: 'prosody:register',
    kind: 'register',
    title: 'Which register?',
    subtitle: 'The whole utterance, chirp included, is shifted up or down one step.',
    render: () => renderUtterance(u, { transpose: 1 }),
    hint: {
      label: 'Compare with neutral',
      render: () => renderUtterance({ ...u, register: 0 }, { transpose: 1 }),
    },
    choices: REGISTERS.map((r) => ({ key: String(r.value), label: r.name, sub: r.meaning })),
    answer: String(reg.value),
    layout: 'list',
    reveal: {
      title: `${reg.name} register`,
      roman: `${reg.mark}${words.join(' ')}.`,
      note: reg.meaning,
    },
  };
}

function urgencyQuestion() {
  const urg = pick(URGENCIES);
  const words = pick(SHORT_SENTENCES).split(' ');
  const t = transpose();
  return {
    itemId: 'prosody:urgency',
    kind: 'urgency',
    title: 'Which urgency?',
    subtitle: 'Tempo only. The tones and their order do not change.',
    render: () => renderUtterance({ words, register: 0, urgency: urg.value, coda: 'fall' }, { transpose: t }),
    choices: URGENCIES.map((u) => ({ key: String(u.value), label: u.name, sub: `${u.slotMs} ms slots — ${u.meaning}` })),
    answer: String(urg.value),
    layout: 'list',
    reveal: {
      title: urg.name,
      roman: `${urg.mark}${words.join(' ')}.`,
      note: `${urg.slotMs} ms slots, ${urg.gapMs} ms gaps. ${urg.meaning}.`,
    },
  };
}

function codaQuestion() {
  const coda = pick(CODAS);
  const words = pick(SHORT_SENTENCES).split(' ');
  const t = transpose();
  return {
    itemId: 'prosody:coda',
    kind: 'coda',
    title: 'Which coda?',
    subtitle: 'The 120 ms glide after the last word. Listen past the end.',
    render: () => renderUtterance({ words, register: 0, urgency: 0, coda: coda.value }, { transpose: t }),
    choices: CODAS.map((c) => ({ key: c.value, label: c.name, sub: c.meaning })),
    answer: coda.value,
    layout: 'grid4',
    reveal: {
      title: `${coda.name} — ${coda.meaning}`,
      roman: `${words.join(' ')}${coda.mark}`,
      note: 'A coda is a separate element, never a bend on a content slot, so it can never be mistaken for a phoneme.',
    },
  };
}

/* ── 4. Vocabulary ────────────────────────────────────────────────────── */

/* The §10 drill: everything in a family differs by one slot, so the family is
 * the maximally confusable set and therefore the right unit to practise. */
function minimalPairQuestion(word) {
  const fam = FAMILIES.find((f) => f.cls === word.cls && f.fam === word.fam);
  const t = transpose();
  return {
    itemId: `word:${word.gloss}`,
    kind: 'minimalpair',
    title: `Which word, inside ${fam.className} · ${fam.name}?`,
    subtitle: 'Every option here differs by a single slot. Only the third tone separates them.',
    render: () => renderUtterance(
      { words: [word.gloss], register: 0, urgency: 0, coda: null },
      { preamble: true, coda: false, transpose: t },
    ),
    choices: fam.words.map((w) => ({ key: w.gloss, label: w.gloss, sub: w.roman.split('-')[2] })),
    answer: word.gloss,
    layout: 'grid4',
    reveal: { title: word.gloss, roman: word.roman, note: `${word.address} · ${fam.className} · ${fam.name}${word.hint ? ` · ${word.hint}` : ''}` },
  };
}

function listenQuestion(word, pool) {
  const others = sampleWithout(pool.map((w) => w.gloss), 5, [word.gloss]);
  const t = transpose();
  return {
    itemId: `word:${word.gloss}`,
    kind: 'listen',
    title: 'What did the droid say?',
    subtitle: null,
    render: () => renderUtterance(
      { words: [word.gloss], register: 0, urgency: 0, coda: null },
      { preamble: true, coda: false, transpose: t },
    ),
    choices: shuffle([word.gloss, ...others]).map((g) => ({ key: g, label: g, sub: BY_GLOSS.get(g).className })),
    answer: word.gloss,
    layout: 'grid4',
    reveal: { title: word.gloss, roman: word.roman, note: `${word.address} · ${word.className} · ${word.familyName}${word.hint ? ` · ${word.hint}` : ''}` },
  };
}

/* Production, not recognition: the audio is withheld until after the answer. */
function recallQuestion(word) {
  const sameClass = WORDS.filter((w) => w.cls === word.cls && w.gloss !== word.gloss);
  const distractors = shuffle(sameClass.length >= 3 ? sameClass : WORDS.filter((w) => w.gloss !== word.gloss))
    .slice(0, 3);
  const t = transpose();
  return {
    itemId: `word:${word.gloss}`,
    kind: 'recall',
    title: `How do you say ${word.gloss}?`,
    subtitle: 'No audio until you commit. Read the tones.',
    render: null,
    revealAudio: () => renderUtterance(
      { words: [word.gloss], register: 0, urgency: 0, coda: null },
      { preamble: true, coda: false, transpose: t },
    ),
    choices: shuffle([word, ...distractors]).map((w) => ({ key: w.gloss, label: w.roman, sub: w.address })),
    answer: word.gloss,
    layout: 'list',
    reveal: { title: word.gloss, roman: word.roman, note: `${word.address} · ${word.className} · ${word.familyName}` },
  };
}

/* The check slot is not decoration: given three of four tones you can derive
 * the fourth. This drill is where that stops being theory. */
function clozeQuestion(word) {
  const missing = Math.floor(Math.random() * 4);
  const t = transpose();
  const blanks = new Set([`0:${missing}`]);
  const labels = ['CLASS', 'FAMILY', 'MEMBER', 'CHECK'];
  const shown = word.slots.map((s, i) => (i === missing ? '??' : SYLLABLES[s]));
  return {
    itemId: `word:${word.gloss}`,
    kind: 'cloze',
    title: `One slot is missing. Which tone belongs in ${labels[missing]}?`,
    subtitle: `You heard ${shown.join('-')}. CHECK is (8 − ((CLASS + FAMILY + MEMBER) mod 8)) mod 8, so the parity gives it away.`,
    render: () => renderUtterance(
      { words: [word.gloss], register: 0, urgency: 0, coda: null },
      { preamble: true, coda: false, transpose: t, blanks },
    ),
    choices: SYLLABLES.map((syl, i) => ({ key: String(i), label: syl, sub: `T${i}`, tone: i })),
    answer: String(word.slots[missing]),
    layout: 'grid8',
    reveal: {
      title: `${word.gloss} — ${word.roman}`,
      roman: word.roman,
      note: `${word.slots[0]} + ${word.slots[1]} + ${word.slots[2]} = ${word.slots[0] + word.slots[1] + word.slots[2]}, so CHECK is ${word.slots[3]}. Any single wrong slot breaks that sum, which is why a mis-heard word is never a different valid word.`,
    },
  };
}

/* ── 5. Sentences ─────────────────────────────────────────────────────── */

function sentenceQuestion(sentence, pool) {
  const others = shuffle(pool.filter((s) => s.index !== sentence.index)).slice(0, 3);
  const t = transpose();
  return {
    itemId: `sentence:${sentence.index}`,
    kind: 'sentence',
    title: 'What does this mean?',
    subtitle: 'Prosody is carrying half of it.',
    render: () => renderUtterance(sentence.utterance, { transpose: t }),
    choices: shuffle([sentence, ...others]).map((s) => ({ key: String(s.index), label: s.english })),
    answer: String(sentence.index),
    layout: 'list',
    reveal: {
      title: sentence.utterance.words.join(' '),
      roman: sentence.text,
      note: describe(sentence.utterance),
    },
  };
}

/* ── Selection ────────────────────────────────────────────────────────── */

/* Which drill a word gets depends on how well it is known: recognition inside
 * its family first, then open recognition, then production and parity. */
function wordQuestion(word, pool) {
  const e = progress.peek(`word:${word.gloss}`);
  const box = e ? e.box : 0;
  const roll = Math.random();
  if (box <= 1) return roll < 0.65 ? minimalPairQuestion(word) : listenQuestion(word, pool);
  if (box <= 3) {
    if (roll < 0.35) return listenQuestion(word, pool);
    if (roll < 0.7) return minimalPairQuestion(word);
    return recallQuestion(word);
  }
  if (roll < 0.35) return recallQuestion(word);
  if (roll < 0.7) return clozeQuestion(word);
  return listenQuestion(word, pool);
}

export function questionFor(itemId) {
  const pool = progress.unlockedWords();
  const [kind, arg] = itemId.split(':');
  switch (kind) {
    case 'tone': return toneQuestion(Number(arg));
    case 'class': return classQuestion(Number(arg));
    case 'prosody':
      if (arg === 'register') return registerQuestion();
      if (arg === 'urgency') return urgencyQuestion();
      return codaQuestion();
    case 'word': {
      const w = BY_GLOSS.get(arg);
      if (!w) return null;
      return wordQuestion(w, pool.length >= 6 ? pool : WORDS);
    }
    case 'sentence': {
      const sentences = progress.availableSentences();
      const s = sentences.find((x) => x.index === Number(arg));
      if (!s || sentences.length < 4) return null;
      return sentenceQuestion(s, sentences);
    }
    default: return null;
  }
}

/* A session is planned up front rather than picked one at a time. Taking the
 * next unseen item on every call would march straight down the item list and
 * ask eight tone questions in a row; shuffling a small pool of overdue items
 * with a handful of introductions interleaves them the way the material
 * actually wants to be learned.
 */
/* Introductions are taken round-robin across kinds. Straight down the list
 * they would all be tones, since that is how the item list is ordered, and a
 * first session of nothing but ear training teaches the wrong thing first:
 * §10 puts the class prefixes and prosody ahead of everything. */
const KIND_ORDER = ['class', 'prosody', 'tone', 'word', 'sentence'];

function spreadByKind(items, cap) {
  const groups = new Map(KIND_ORDER.map((k) => [k, []]));
  for (const id of items) {
    const kind = id.split(':')[0];
    if (groups.has(kind)) groups.get(kind).push(id);
  }
  const out = [];
  let drained = false;
  while (out.length < cap && !drained) {
    drained = true;
    for (const k of KIND_ORDER) {
      const g = groups.get(k);
      if (!g.length) continue;
      drained = false;
      out.push(g.shift());
      if (out.length >= cap) break;
    }
  }
  return out;
}

export function sessionPlan(size = 15, newCap = 6) {
  const { due, fresh } = progress.dueItems();
  const pool = [...due.slice(0, size), ...spreadByKind(fresh, newCap)];
  if (!pool.length) {
    const active = progress.activeItems().slice().sort((a, b) => {
      const ea = progress.peek(a);
      const eb = progress.peek(b);
      return (ea ? ea.due : 0) - (eb ? eb.due : 0);
    });
    pool.push(...active.slice(0, Math.min(size, 10)));
  }
  if (!pool.length) return [];

  const queue = [];
  let bag = shuffle(pool);
  while (queue.length < size) {
    if (!bag.length) bag = shuffle(pool);
    const next = bag.shift();
    // Never ask the same item twice running while an alternative exists.
    if (queue.length && queue[queue.length - 1] === next && bag.length) { bag.push(next); continue; }
    queue.push(next);
  }
  return queue;
}

/* Pull the next thing to practise: overdue items first, then something new,
 * then whatever is closest to falling out of memory. */
export function nextQuestion(exclude = null) {
  const { due, fresh } = progress.dueItems();
  const order = [];
  if (due.length) order.push(...due);
  if (fresh.length) order.push(fresh[0]);
  if (!order.length) {
    const active = progress.activeItems();
    const sorted = active.slice().sort((a, b) => {
      const ea = progress.peek(a);
      const eb = progress.peek(b);
      return (ea ? ea.due : 0) - (eb ? eb.due : 0);
    });
    order.push(...sorted.slice(0, 12));
  }
  const candidates = exclude && order.length > 1 ? order.filter((id) => id !== exclude) : order;
  for (const id of candidates.length ? candidates : order) {
    const q = questionFor(id);
    if (q) return q;
  }
  return null;
}

/* A focused run through one family, ignoring the schedule. Answers still feed
 * the same Leitner boxes, so a targeted session is not a detour. */
export function focusPlan(familyKey, size = 15) {
  const fam = FAMILIES.find((f) => f.key === familyKey);
  if (!fam) return [];
  const pool = fam.words.map((w) => `word:${w.gloss}`);
  const queue = [];
  let bag = shuffle(pool);
  while (queue.length < size) {
    if (!bag.length) bag = shuffle(pool);
    const next = bag.shift();
    if (queue.length && queue[queue.length - 1] === next && bag.length) { bag.push(next); continue; }
    queue.push(next);
  }
  return queue;
}
