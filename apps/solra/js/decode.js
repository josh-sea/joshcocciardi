/* Solra decoding, spec §8.2.
 *
 * Eight Goertzel filters per analysis window, argmax bin, rejected as noise
 * unless the winner clears the mean of the other seven by a margin. Register
 * and tempo are both recovered by search: the language enumerates exactly
 * three of each, so trying all nine and scoring on parity is cheap and needs
 * no heuristics.
 *
 * Works on any Float32Array, so it decodes a microphone recording and the
 * synthesiser's own output through the same path.
 */

import { FREQ, REGISTER_STEP, URGENCIES, CODAS, isValidWord, BY_ADDRESS, romanize } from './lexicon.js';
import { TIMING, frameTiming } from './synth.js';

/* Goertzel magnitude for one frequency over one window. */
export function goertzel(samples, start, len, freq, sr) {
  const k = Math.round((len * freq) / sr);
  const w = (2 * Math.PI * k) / len;
  const coeff = 2 * Math.cos(w);
  let s0 = 0; let s1 = 0; let s2 = 0;
  const end = Math.min(start + len, samples.length);
  for (let i = start; i < end; i += 1) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag) / (len / 2);
}

function registerFreqs(register) {
  const ratio = Math.pow(REGISTER_STEP, register);
  return FREQ.map((f) => f * ratio);
}

/* Strongest tone in a window, with the margin test from §8.2. */
function readSlot(samples, start, len, freqs, sr, margin) {
  const mags = freqs.map((f) => goertzel(samples, start, len, f, sr));
  let best = 0;
  for (let i = 1; i < 8; i += 1) if (mags[i] > mags[best]) best = i;
  let others = 0;
  for (let i = 0; i < 8; i += 1) if (i !== best) others += mags[i];
  others /= 7;
  const ratio = others > 1e-9 ? mags[best] / others : (mags[best] > 1e-6 ? 999 : 0);
  return { tone: best, ratio, magnitude: mags[best], ok: ratio >= margin };
}

function rms(samples, start, len) {
  const end = Math.min(start + len, samples.length);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = Math.max(0, start); i < end; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/* RMS envelope in fixed hops, used to find where the utterance sits. */
function envelope(samples, sr, hopMs = 5) {
  const hop = Math.max(1, Math.round((sr * hopMs) / 1000));
  const out = new Float32Array(Math.ceil(samples.length / hop));
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    const start = i * hop;
    const end = Math.min(start + hop, samples.length);
    for (let j = start; j < end; j += 1) sum += samples[j] * samples[j];
    out[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return { env: out, hop };
}

/* First and last hop above a fraction of the loudest hop. */
export function findSpan(samples, sr, floorRatio = 0.12) {
  const { env, hop } = envelope(samples, sr);
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  if (peak < 1e-4) return null;
  const thresh = peak * floorRatio;
  let a = 0; while (a < env.length && env[a] < thresh) a += 1;
  let b = env.length - 1; while (b > a && env[b] < thresh) b -= 1;
  if (b <= a) return null;
  return { start: a * hop, end: Math.min(samples.length, (b + 1) * hop), peak };
}

/* Zero-crossing frequency estimate. Cheap and accurate enough on the clean
 * sine of a coda glide. */
function estimateFreq(samples, start, len, sr) {
  const end = Math.min(start + len, samples.length);
  const n = end - start;
  if (n < 8) return 0;
  let mean = 0;
  for (let i = start; i < end; i += 1) mean += samples[i];
  mean /= n;
  let crossings = 0;
  let prev = samples[start] - mean;
  for (let i = start + 1; i < end; i += 1) {
    const v = samples[i] - mean;
    if ((prev < 0 && v >= 0) || (prev > 0 && v <= 0)) crossings += 1;
    prev = v;
  }
  return (crossings * sr) / (2 * n);
}

/* Coda, spec §3.3. Rise and fall are an octave apart end to end, so the ratio
 * separates them from the flat pair with room to spare; level and trill are
 * told apart by how much the pitch wanders. */
export function classifyCoda(samples, start, len, sr) {
  if (len < Math.round((sr * 40) / 1000)) return { coda: null, confidence: 0 };
  const probe = Math.max(8, Math.round(len * 0.2));
  const fStart = estimateFreq(samples, start + Math.round(len * 0.05), probe, sr);
  const fEnd = estimateFreq(samples, start + len - probe - Math.round(len * 0.05), probe, sr);
  if (fStart < 20) return { coda: null, confidence: 0 };
  const ratio = fEnd / fStart;
  if (ratio > 1.45) return { coda: 'rise', confidence: Math.min(1, (ratio - 1.45) / 0.5 + 0.5) };
  if (ratio < 0.69) return { coda: 'fall', confidence: Math.min(1, (0.69 - ratio) / 0.2 + 0.5) };

  // Six segments: a trill alternates between two steps, a level hold does not.
  const seg = Math.floor(len / 6);
  const freqs = [];
  for (let i = 0; i < 6; i += 1) freqs.push(estimateFreq(samples, start + i * seg, seg, sr));
  const mean = freqs.reduce((a, b) => a + b, 0) / 6;
  if (mean < 20) return { coda: null, confidence: 0 };
  let spread = 0;
  for (const f of freqs) spread += Math.abs(f - mean);
  spread /= 6 * mean;
  // One pentatonic step is ~19% apart, so the mean absolute deviation of an
  // alternating pattern lands near 9%; a held tone stays under 3%.
  if (spread > 0.05) return { coda: 'trill', confidence: Math.min(1, spread / 0.09) };
  return { coda: 'level', confidence: Math.min(1, 1 - spread / 0.05) };
}

/* One decode attempt under a fixed register and urgency hypothesis. */
function attempt(samples, sr, span, register, urgency, margin) {
  const t = frameTiming(urgency);
  const ms = (v) => Math.round((sr * v) / 1000);
  const freqs = registerFreqs(register);

  const preambleLen = ms(TIMING.preambleToneMs);
  const bodyStart = span.start + ms(t.preambleMs);
  const codaLen = ms(t.codaMs);
  const bodyEnd = span.end - codaLen;
  const bodyMs = ((bodyEnd - bodyStart) * 1000) / sr;
  if (bodyMs < t.wordMs * 0.6) return null;

  const rawCount = t.wordCount(bodyMs);
  const count = Math.max(1, Math.min(8, Math.round(rawCount)));
  // Symbol timing: at the right tempo the recording holds a whole number of
  // words. A hypothesis that needs a fractional word is the wrong tempo, and
  // that is a far more reliable signal than the tone bins, so it gates the
  // search rather than merely scoring against it.
  const drift = Math.abs(rawCount - count);
  const fit = 1 - Math.min(1, drift * 2);

  // The preamble is T0 then T4 at the utterance's own register (§3.1).
  const p0 = readSlot(samples, span.start, preambleLen, freqs, sr, margin);
  const p1 = readSlot(samples, span.start + preambleLen, preambleLen, freqs, sr, margin);
  const preambleOk = p0.tone === 0 && p1.tone === 4;

  const slotLen = ms(t.slotMs);
  const analysisLen = Math.max(16, Math.round(slotLen * 0.7));
  const analysisOffset = Math.round((slotLen - analysisLen) / 2);

  const words = [];
  let confidence = 0;
  let slotCount = 0;
  for (let wi = 0; wi < count; wi += 1) {
    const wordStart = bodyStart + ms(wi * (t.wordMs + t.wordGapMs));
    const slots = [];
    const ratios = [];
    for (let si = 0; si < 4; si += 1) {
      const at = wordStart + ms(si * (t.slotMs + t.gapMs)) + analysisOffset;
      const r = readSlot(samples, at, analysisLen, freqs, sr, margin);
      slots.push(r.tone);
      ratios.push(r.ratio);
      confidence += Math.min(1, r.ratio / (margin * 2));
      slotCount += 1;
    }
    const valid = isValidWord(slots);
    const w = valid ? BY_ADDRESS.get(slots.join('')) : null;
    words.push({
      slots,
      roman: romanize(slots),
      address: slots.join(''),
      valid,
      gloss: w ? w.gloss : null,
      unassigned: valid && !w,
      minRatio: Math.min(...ratios),
    });
  }

  // Gaps are silent at the right tempo. Where a hypothesis says there should
  // be a gap and the recording has a tone, the tempo is wrong.
  let gapFit = 0.5;
  if (t.gapMs > 0) {
    const gapLen = ms(t.gapMs);
    let gapEnergy = 0; let toneEnergy = 0; let n = 0;
    for (let wi = 0; wi < count; wi += 1) {
      const wordStart = bodyStart + ms(wi * (t.wordMs + t.wordGapMs));
      for (let si = 0; si < 4; si += 1) {
        const slotAt = wordStart + ms(si * (t.slotMs + t.gapMs));
        toneEnergy += rms(samples, slotAt + analysisOffset, analysisLen);
        gapEnergy += rms(samples, slotAt + slotLen, gapLen);
        n += 1;
      }
    }
    if (n && toneEnergy > 1e-9) gapFit = Math.max(0, 1 - (gapEnergy / toneEnergy));
  }

  const codaRes = classifyCoda(samples, bodyEnd, codaLen, sr);
  const parity = words.filter((w) => w.valid).length / words.length;
  confidence = slotCount ? confidence / slotCount : 0;

  const score = parity * 3 + confidence + fit * 3 + gapFit * 1.5
    + (preambleOk ? 1.5 : 0) + codaRes.confidence * 0.5;

  return {
    register, urgency, words,
    coda: codaRes.coda,
    codaConfidence: codaRes.confidence,
    preambleOk, parity, confidence, fit, gapFit, drift, score,
    wordCount: count,
  };
}

/* Decode a whole recording. Returns the best-scoring hypothesis, or null when
 * nothing above the noise floor was found. */
export function decode(samples, sr, opts = {}) {
  const margin = opts.margin || 3;
  const span = opts.span || findSpan(samples, sr, opts.floorRatio);
  if (!span) return null;

  const registers = opts.register != null ? [opts.register] : [0, 1, -1];
  const urgencies = opts.urgency != null ? [opts.urgency] : URGENCIES.map((u) => u.value);

  const MAX_DRIFT = 0.2;
  const tried = [];
  for (const r of registers) {
    for (const u of urgencies) {
      const res = attempt(samples, sr, span, r, u, margin);
      if (res) tried.push(res);
    }
  }
  if (!tried.length) return null;

  // Prefer hypotheses whose tempo divides the recording cleanly. If a noisy
  // span measurement leaves none of them clean, fall back to scoring the lot
  // rather than reporting silence.
  let pool = tried.filter((r) => r.drift <= MAX_DRIFT);
  if (!pool.length) pool = tried;

  let best = pool[0];
  for (const res of pool) if (res.score > best.score) best = res;

  return {
    ...best,
    span,
    /* §8.2: a parity failure is reported, never guessed past. */
    text: best.words.map((w) => (w.valid && w.gloss ? w.gloss : 'AGAIN')).join(' '),
    clean: best.words.every((w) => w.valid && w.gloss),
  };
}

export const CODA_LABELS = new Map(CODAS.map((c) => [c.value, c.name]));
