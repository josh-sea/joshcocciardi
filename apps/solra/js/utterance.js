/* Utterances: the notation from spec §7, plus the deterministic validator
 * described in §8.3.
 *
 * An utterance is { register, urgency, coda, words: [gloss, ...] }.
 * Its written form is  [register mark][urgency mark]word word word[coda mark]
 * e.g.  _!!so-do-fa-re ti-re-ti-fa.
 */

import {
  BY_GLOSS, BY_ADDRESS, CODA_BY_MARK, CODA_BY_VALUE,
  URGENCY_BY_VALUE, REGISTERS, RELATION_WORDS, DIGIT_WORDS,
  parseRoman, romanize, isValidWord,
} from './lexicon.js';

export const MAX_WORDS = 8;
export const MAX_REDUPLICATION = 3;

export function makeUtterance(words, opts = {}) {
  return {
    words: words.slice(),
    register: opts.register || 0,
    urgency: opts.urgency || 0,
    coda: opts.coda || 'fall',
  };
}

/* ── Written form ──────────────────────────────────────────────────────── */

export function toRoman(u) {
  const reg = REGISTERS.find((r) => r.value === u.register);
  const urg = URGENCY_BY_VALUE.get(u.urgency);
  const coda = CODA_BY_VALUE.get(u.coda);
  const body = u.words.map((g) => (BY_GLOSS.get(g) ? BY_GLOSS.get(g).roman : '????')).join(' ');
  return `${reg ? reg.mark : ''}${urg ? urg.mark : ''}${body}${coda ? coda.mark : ''}`;
}

export function toGloss(u) {
  const reg = REGISTERS.find((r) => r.value === u.register);
  const urg = URGENCY_BY_VALUE.get(u.urgency);
  const coda = CODA_BY_VALUE.get(u.coda);
  return `${reg ? reg.mark : ''}${urg ? urg.mark : ''}${u.words.join(' ')}${coda ? coda.mark : ''}`;
}

/* Accepts either romanization (`do-do-do-do`) or glosses (`YES`), with the
 * same prosody marks either way. Returns null on anything unparseable. */
export function fromText(text) {
  let s = String(text).trim();
  if (!s) return null;

  let register = 0;
  if (s[0] === '^') { register = 1; s = s.slice(1); }
  else if (s[0] === '_') { register = -1; s = s.slice(1); }

  let urgency = 0;
  if (s.startsWith('!!')) { urgency = 2; s = s.slice(2); }
  else if (s.startsWith('!')) { urgency = 1; s = s.slice(1); }

  let coda = 'fall';
  const last = s.slice(-1);
  if (CODA_BY_MARK.has(last)) { coda = CODA_BY_MARK.get(last).value; s = s.slice(0, -1); }

  const tokens = s.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const words = [];
  for (const tok of tokens) {
    const up = tok.toUpperCase();
    if (BY_GLOSS.has(up)) { words.push(up); continue; }
    const slots = parseRoman(tok);
    if (slots) {
      const w = BY_ADDRESS.get(slots.join(''));
      if (w) { words.push(w.gloss); continue; }
      return null;
    }
    if (/^[0-7]{4}$/.test(tok)) {
      const w = BY_ADDRESS.get(tok);
      if (w) { words.push(w.gloss); continue; }
    }
    return null;
  }
  return { words, register, urgency, coda };
}

/* ── Validator (spec §8.3) ─────────────────────────────────────────────── */

/* Returns { ok, errors, warnings }. Each entry names the word it attaches to
 * so the composer can highlight it.
 *
 * Errors are the rules the spec states without exception. Warnings are rules
 * the spec states but its own worked examples break — §5.4 says INDEX
 * relations precede their object, yet §7 offers `YOU GO OUT?` with nothing
 * after OUT. Rejecting the spec's own corpus would be wrong, and quietly
 * dropping the rule would hide a real ambiguity, so it flags instead.
 */
export function validate(u) {
  const errors = [];
  const warnings = [];
  const push = (code, message, index) => errors.push({ code, message, index });
  const warn = (code, message, index) => warnings.push({ code, message, index });

  if (!u || !Array.isArray(u.words)) {
    return { ok: false, errors: [{ code: 'shape', message: 'Not an utterance.', index: -1 }], warnings: [] };
  }

  if (u.words.length === 0) push('empty', 'An utterance needs at least one word.', -1);
  if (u.words.length > MAX_WORDS) {
    push('length', `Eight words is the hard cap; this has ${u.words.length}. If you need more, you are writing English.`, MAX_WORDS);
  }

  u.words.forEach((g, i) => {
    if (!BY_GLOSS.has(g)) push('lexicon', `${g} is not in the v0.1 lexicon.`, i);
  });

  if (!REGISTERS.some((r) => r.value === u.register)) push('register', 'Register must be +1, 0 or -1.', -1);
  if (!URGENCY_BY_VALUE.has(u.urgency)) push('urgency', 'Urgency must be U0, U1 or U2.', -1);
  if (!CODA_BY_VALUE.has(u.coda)) push('coda', 'Coda must be rise, fall, level or trill.', -1);

  // §5.3 — ASK marks a content question and heads the utterance.
  u.words.forEach((g, i) => {
    if (g === 'ASK' && i !== 0) push('ask', 'ASK marks a content question and belongs at the head.', i);
  });

  // §5.2 — NOT precedes what it negates, so it can never be final.
  u.words.forEach((g, i) => {
    if (g === 'NOT' && i === u.words.length - 1) push('not', 'NOT precedes what it negates, so it cannot end an utterance.', i);
  });

  // §5.4 — INDEX relations are prepositional and precede their object. A
  // warning, not an error: see the note above validate().
  u.words.forEach((g, i) => {
    if (RELATION_WORDS.has(g) && i === u.words.length - 1) {
      warn('relation', `${g} is prepositional, so §5.4 expects an object after it. The spec's own "YOU GO OUT?" reads it adverbially instead.`, i);
    }
  });

  // §5.6 — NUM introduces base-8 digits.
  u.words.forEach((g, i) => {
    if (g !== 'NUM') return;
    const next = u.words[i + 1];
    if (!next || !DIGIT_WORDS.includes(next)) {
      push('num', 'NUM must be followed by digits, most significant first.', i);
    }
  });

  // §3.4 — three repetitions is the maximum.
  let run = 1;
  for (let i = 1; i < u.words.length; i += 1) {
    run = u.words[i] === u.words[i - 1] ? run + 1 : 1;
    if (run > MAX_REDUPLICATION) {
      push('reduplication', 'Three repetitions is the extreme of the scale; there is no fourth.', i);
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ── Reading an utterance back in English ─────────────────────────────── */

/* Not a translator — a crib. It reports what the prosody is doing and lays the
 * glosses out topic-first, which is all the learner needs while drilling. */
export function describe(u) {
  const reg = REGISTERS.find((r) => r.value === u.register);
  const urg = URGENCY_BY_VALUE.get(u.urgency);
  const coda = CODA_BY_VALUE.get(u.coda);
  const bits = [];
  if (reg && reg.value !== 0) bits.push(reg.meaning);
  if (urg && urg.value !== 0) bits.push(urg.meaning);
  if (coda) bits.push(coda.meaning);
  return bits.join(' · ');
}

export function slotsOf(u) {
  return u.words.map((g) => {
    const w = BY_GLOSS.get(g);
    return w ? w.slots : [0, 0, 0, 0];
  });
}

/* Decoded slot runs come back from the mic as raw numbers; this turns them
 * into glosses, marking parity failures as AGAIN the way §8.2 prescribes. */
export function glossesFromSlots(slotRuns) {
  return slotRuns.map((slots) => {
    if (!isValidWord(slots)) return { gloss: null, roman: romanize(slots), error: 'parity' };
    const w = BY_ADDRESS.get(slots.join(''));
    if (!w) return { gloss: null, roman: romanize(slots), error: 'unassigned' };
    return { gloss: w.gloss, roman: w.roman, error: null };
  });
}

export const EXAMPLES = [
  { text: '_SKY WATER HOT.',        english: 'Hot and raining, and the droid does not think much of it.' },
  { text: 'SKY WATER MAYBE~',       english: 'It might rain. The trill hedges the whole claim.' },
  { text: '_!!DANGER FRONT.',       english: 'Danger ahead. Alarm tempo and low register read as an emergency.' },
  { text: 'YOU GO OUT?',            english: 'Are you going outside?' },
  { text: '^YES.',                  english: 'An enthusiastic yes.' },
  { text: '_!POWER LESS LESS.',     english: 'The battery is getting low, said with some urgency.' },
  { text: '^I SEE DOG.',            english: 'I see the dog, and I am pleased about it.' },
  { text: 'ASK YOU NAME?',          english: 'What is your name?' },
  { text: 'AGAIN?',                 english: 'Say again. What a decoder emits on a parity failure.' },
  { text: '!FOLLOW YOU NOW,',       english: 'Following you now, and there is more coming.' },
  { text: 'ACK.',                   english: 'Received, understood.' },
  { text: 'STANDBY,',               english: 'Hold on, I am not finished.' },
  { text: '^HELLO FRIEND.',         english: 'A warm hello.' },
  { text: 'I NOT KNOW.',            english: 'I do not know.' },
  { text: 'WATER COLD.',            english: 'Cold water. Modifiers follow what they modify.' },
  { text: 'ASK YOU WANT FOOD?',     english: 'Do you want food?' },
  { text: '_MACHINE BROKEN.',       english: 'The machine is broken, and that is bad news.' },
  { text: 'NUM ONE ZERO.',          english: 'The number eight, in base 8.' },
  { text: '!GO LEFT NOW.',          english: 'Go left, now.' },
  { text: '^THANK YOU.',            english: 'Thank you.' },
  { text: 'I HEAR SOUND NEAR HOME~', english: 'I think I hear something near the house.' },
  { text: 'DROID READY.',           english: 'The droid is ready.' },
  { text: '_I SORRY.',              english: 'I am sorry.' },
  { text: 'ASK THIS PATH TO HOME?', english: 'Is this the way home?' },
  { text: '^CHILD HAPPY.',          english: 'The kid is happy.' },
  { text: 'POWER FULL.',            english: 'Fully charged.' },
  { text: '_!VEHICLE COME FAST.',   english: 'A vehicle is coming in fast.' },
  { text: 'WE GO HOME,',            english: 'We are heading home, and there is more to say.' },
];
