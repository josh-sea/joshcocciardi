/* Solra synthesis, spec §1.2 and §8.1.
 *
 * Renders to a plain Float32Array with no Web Audio dependency, so the same
 * code path runs in the browser, in a test harness, and in a decoder
 * round-trip. audio.js is only responsible for getting these samples to a
 * speaker.
 */

import {
  FREQ, REGISTER_STEP, URGENCY_BY_VALUE, BY_GLOSS,
} from './lexicon.js';

export const SAMPLE_RATE = 44100;

export const TIMING = {
  preambleToneMs: 100,   // T0 then T4, 200 ms total
  codaMs: 120,
  edgeMs: 5,             // raised-cosine attack and decay
};

export const AMPLITUDE = 0.32;

function msToSamples(ms, sr) { return Math.round((sr * ms) / 1000); }

/* Raised-cosine edges, applied in place. */
function applyEnvelope(buf, sr, edgeMs = TIMING.edgeMs) {
  const edge = Math.min(msToSamples(edgeMs, sr), Math.floor(buf.length / 2));
  for (let i = 0; i < edge; i += 1) {
    const g = 0.5 * (1 - Math.cos((Math.PI * i) / edge));
    buf[i] *= g;
    buf[buf.length - 1 - i] *= g;
  }
  return buf;
}

/* A steady tone. */
export function renderTone(freq, ms, sr = SAMPLE_RATE, amp = AMPLITUDE) {
  const n = msToSamples(ms, sr);
  const out = new Float32Array(n);
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin(w * i);
  return applyEnvelope(out, sr);
}

/* A glide. Frequency moves exponentially from `from` to `to` across the
 * segment; phase accumulates per sample so there is no discontinuity. */
export function renderGlide(from, to, ms, sr = SAMPLE_RATE, amp = AMPLITUDE) {
  const n = msToSamples(ms, sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = n > 1 ? i / (n - 1) : 0;
    const f = from * Math.pow(to / from, t);
    out[i] = amp * Math.sin(phase);
    phase += (2 * Math.PI * f) / sr;
  }
  return applyEnvelope(out, sr);
}

export function registerRatio(register) {
  return Math.pow(REGISTER_STEP, register || 0);
}

/* `transpose` is a free multiplier on top of the register shift. Drills use it
 * to randomise the base frequency so learners cannot anchor on absolute pitch
 * (spec §10). It is never part of the language. */
function slotFreq(slot, register, transpose) {
  return FREQ[slot] * registerRatio(register) * (transpose || 1);
}

function concat(chunks, total) {
  const out = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* Coda, spec §3.3.
 *
 * The spec fixes the shapes but not what they glide from. This implementation
 * anchors every coda to the frequency of the final content slot, which is
 * deterministic from the utterance alone and needs no extra reference. */
function renderCoda(kind, anchorFreq, sr) {
  const ms = TIMING.codaMs;
  switch (kind) {
    case 'rise':  return renderGlide(anchorFreq, anchorFreq * 2, ms, sr);
    case 'fall':  return renderGlide(anchorFreq, anchorFreq / 2, ms, sr);
    case 'level': return renderTone(anchorFreq, ms, sr);
    case 'trill': {
      // Three cycles alternating a step: six 20 ms segments.
      const segMs = ms / 6;
      const hi = anchorFreq * REGISTER_STEP;
      const segs = [];
      let total = 0;
      for (let i = 0; i < 6; i += 1) {
        const n = msToSamples(segMs, sr);
        const f = i % 2 === 0 ? anchorFreq : hi;
        const seg = new Float32Array(n);
        const w = (2 * Math.PI * f) / sr;
        for (let j = 0; j < n; j += 1) seg[j] = AMPLITUDE * Math.sin(w * j);
        applyEnvelope(seg, sr, 2);
        segs.push(seg);
        total += n;
      }
      return concat(segs, total);
    }
    default: return renderTone(anchorFreq, ms, sr);
  }
}

/* ── The whole frame, spec §4 ──────────────────────────────────────────── */

/* Options:
 *   sampleRate  default 44100
 *   transpose   free pitch multiplier for ear training, default 1
 *   preamble    include the two-note chirp, default true
 *   coda        set false to omit the coda
 *   blanks      Set of "wordIndex:slotIndex" rendered as silence, for cloze drills
 *
 * Returns { samples, sampleRate, duration, marks }, where marks carry the
 * sample offsets of every element so the UI can follow along.
 */
export function renderUtterance(utterance, opts = {}) {
  const sr = opts.sampleRate || SAMPLE_RATE;
  const transpose = opts.transpose || 1;
  const register = utterance.register || 0;
  const urg = URGENCY_BY_VALUE.get(utterance.urgency || 0) || URGENCY_BY_VALUE.get(0);
  const blanks = opts.blanks instanceof Set ? opts.blanks : null;

  const chunks = [];
  const marks = [];
  let total = 0;

  const push = (buf, mark) => {
    if (mark) marks.push({ ...mark, start: total, end: total + buf.length });
    chunks.push(buf);
    total += buf.length;
  };
  const silence = (ms, mark) => {
    const n = msToSamples(ms, sr);
    if (n > 0) push(new Float32Array(n), mark);
  };

  if (opts.preamble !== false) {
    push(renderTone(slotFreq(0, register, transpose), TIMING.preambleToneMs, sr),
      { type: 'preamble', slot: 0 });
    push(renderTone(slotFreq(4, register, transpose), TIMING.preambleToneMs, sr),
      { type: 'preamble', slot: 4 });
    // No gap here: the spec's 720 ms floor for a one-word utterance is exactly
    // preamble (200) + word (400) + coda (120), so the chirp runs straight
    // into the first slot. The 5 ms edges keep the boundary audible.
  }

  const words = utterance.words.map((g) => BY_GLOSS.get(g)).filter(Boolean);

  let lastSlotFreq = slotFreq(0, register, transpose);

  words.forEach((w, wi) => {
    w.slots.forEach((slot, si) => {
      const f = slotFreq(slot, register, transpose);
      lastSlotFreq = f;
      const muted = blanks && blanks.has(`${wi}:${si}`);
      const buf = muted
        ? new Float32Array(msToSamples(urg.slotMs, sr))
        : renderTone(f, urg.slotMs, sr);
      push(buf, { type: 'slot', word: wi, slot: si, tone: slot, muted: !!muted });
      // The gap after the fourth slot is part of the 400 ms word.
      silence(urg.gapMs, { type: 'gap', word: wi, slot: si });
    });
    if (wi < words.length - 1) silence(urg.wordGapMs, { type: 'wordgap', word: wi });
  });

  if (opts.coda !== false && utterance.coda && words.length) {
    push(renderCoda(utterance.coda, lastSlotFreq, sr), { type: 'coda', coda: utterance.coda });
  }

  const samples = concat(chunks, total);
  return { samples, sampleRate: sr, duration: total / sr, marks };
}

/* A single word, no preamble and no coda. The drill unit for minimal pairs. */
export function renderWord(gloss, opts = {}) {
  return renderUtterance(
    { words: [gloss], register: opts.register || 0, urgency: opts.urgency || 0, coda: null },
    { ...opts, preamble: opts.preamble === true, coda: false },
  );
}

/* Just the two-note chirp, for teaching people to recognise it. */
export function renderPreamble(opts = {}) {
  const sr = opts.sampleRate || SAMPLE_RATE;
  const register = opts.register || 0;
  const transpose = opts.transpose || 1;
  const a = renderTone(slotFreq(0, register, transpose), TIMING.preambleToneMs, sr);
  const b = renderTone(slotFreq(4, register, transpose), TIMING.preambleToneMs, sr);
  return {
    samples: concat([a, b], a.length + b.length),
    sampleRate: sr,
    duration: (a.length + b.length) / sr,
    marks: [],
  };
}

/* Expected timing without rendering. The decoder uses this to work out how
 * many words a recording holds. */
export function frameTiming(urgencyValue) {
  const u = URGENCY_BY_VALUE.get(urgencyValue) || URGENCY_BY_VALUE.get(0);
  const wordMs = 4 * (u.slotMs + u.gapMs);
  return {
    slotMs: u.slotMs,
    gapMs: u.gapMs,
    wordGapMs: u.wordGapMs,
    wordMs,
    preambleMs: TIMING.preambleToneMs * 2,
    codaMs: TIMING.codaMs,
    bodyMs: (n) => n * wordMs + Math.max(0, n - 1) * u.wordGapMs,
    wordCount: (bodyMs) => (bodyMs + u.wordGapMs) / (wordMs + u.wordGapMs),
    utteranceMs: (n) => TIMING.preambleToneMs * 2
      + n * wordMs + Math.max(0, n - 1) * u.wordGapMs + TIMING.codaMs,
  };
}
