/* Whistle Rig: pitch tracking.
 *
 * A whistle is close to a pure sine somewhere between about 500 Hz and
 * 4 kHz, which makes it one of the easiest things to pitch-track. We run
 * YIN on short overlapping windows, then clean the curve up: drop
 * octave slips, fill tiny dropouts, throw away blips.
 *
 * Everything here is plain math on Float32Arrays so node can test it.
 */

export const ANALYSIS_SR = 24000;   // audio is resampled to this before analysis
export const HOP = 240;             // 10 ms between frames at 24 kHz
export const WIN = 480;             // 20 ms window
export const HOP_SEC = HOP / ANALYSIS_SR;
export const MIN_HZ = 300;
export const MAX_HZ = 4500;

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function noteName(m) {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

let scratchRaw = new Float32Array(0);

/* YIN on x[start .. start + win + tauMax). Returns {hz, clarity}; hz is 0
 * when nothing periodic was found. `d` is scratch space (length > tauMax). */
export function yin(x, start, win, sr, d, opts = {}) {
  const minHz = opts.minHz || MIN_HZ, maxHz = opts.maxHz || MAX_HZ;
  const threshold = opts.threshold || 0.2;
  const tauMin = Math.max(2, Math.floor(sr / maxHz));
  const tauMax = Math.min(Math.ceil(sr / minHz), x.length - start - win - 1);
  if (tauMax <= tauMin + 2) return { hz: 0, clarity: 0 };

  const raw = scratchRaw.length > tauMax + 1 ? scratchRaw : (scratchRaw = new Float32Array(tauMax + 2));
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const diff = x[start + j] - x[start + j + tau];
      sum += diff * diff;
    }
    running += sum;
    raw[tau] = sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;   // cumulative mean normalized
  }

  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 < tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // No dip under the threshold: take the global minimum, flagged by its clarity.
    let best = tauMin;
    for (let t = tauMin + 1; t < tauMax; t++) if (d[t] < d[best]) best = t;
    tau = best;
  }

  // Parabolic interpolation around the dip of the raw difference, for sub-sample accuracy.
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = raw[tau - 1], b = raw[tau], c = raw[tau + 1];
    const den = a - 2 * b + c;
    if (den > 0) better = tau + (a - c) / (2 * den);
  }
  const clarity = Math.max(0, 1 - d[tau]);
  return { hz: sr / better, clarity };
}

/* Raw per-frame analysis of mono audio at ANALYSIS_SR. Async-friendly: pass
 * onProgress and it yields to the event loop every chunk. */
export async function analyze(x, { onProgress, sr = ANALYSIS_SR } = {}) {
  const tauMax = Math.ceil(sr / MIN_HZ);
  const frames = Math.max(0, Math.floor((x.length - WIN - tauMax - 1) / HOP));
  const hz = new Float32Array(frames), clarity = new Float32Array(frames), rms = new Float32Array(frames);
  const d = new Float32Array(tauMax + 2);
  const CHUNK = 400;
  for (let f = 0; f < frames; f++) {
    const s = f * HOP;
    let e = 0;
    for (let j = 0; j < WIN; j++) e += x[s + j] * x[s + j];
    rms[f] = Math.sqrt(e / WIN);
    if (rms[f] > 1e-4) {
      const r = yin(x, s, WIN, sr, d);
      hz[f] = r.hz; clarity[f] = r.clarity;
    }
    if (onProgress && f % CHUNK === CHUNK - 1) {
      onProgress(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(1);
  return { hz, clarity, rms, hop: HOP / sr };
}

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function median(arr) {
  if (!arr.length) return NaN;
  const s = Array.from(arr).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Turn raw frames into a clean pitch track: midi (NaN when silent) and a
 * 0..1 loudness envelope. */
export function track(raw, opts = {}) {
  const n = raw.hz.length;
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) db[i] = 20 * Math.log10(raw.rms[i] + 1e-9);

  // Gate: well above the room's noise floor, and not too far under the loudest whistling.
  const floor = percentile(db, 0.1);
  const peak = percentile(db, 0.98);
  const gate = Math.max(floor + 10, peak - 38, -62) + (opts.gateOffset || 0);
  const minClarity = opts.minClarity || 0.72;

  const midi = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const hz = raw.hz[i];
    if (hz >= MIN_HZ && hz <= MAX_HZ && raw.clarity[i] >= minClarity && db[i] >= gate) midi[i] = hzToMidi(hz);
  }

  // Octave slips: a frame an octave away from its neighbours gets pulled back.
  for (let i = 0; i < n; i++) {
    if (isNaN(midi[i])) continue;
    const near = [];
    for (let k = i - 6; k <= i + 6; k++) if (k !== i && k >= 0 && k < n && !isNaN(midi[k])) near.push(midi[k]);
    if (near.length < 4) continue;
    const m = median(near);
    const diff = midi[i] - m;
    if (Math.abs(diff - 12) < 1.5) midi[i] -= 12;
    else if (Math.abs(diff + 12) < 1.5) midi[i] += 12;
    else if (Math.abs(diff) > 4) midi[i] = NaN;   // wild outlier
  }

  // Median filter within voiced stretches (5 frames).
  const sm = Float32Array.from(midi);
  for (let i = 0; i < n; i++) {
    if (isNaN(midi[i])) continue;
    const w = [];
    for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < n && !isNaN(midi[k])) w.push(midi[k]);
    sm[i] = median(w);
  }

  // Bridge short dropouts (up to 40 ms) when the pitch on both sides agrees.
  const maxGap = opts.maxGap ?? 4;
  for (let i = 1; i < n; i++) {
    if (!isNaN(sm[i]) || isNaN(sm[i - 1])) continue;
    let j = i;
    while (j < n && isNaN(sm[j])) j++;
    if (j < n && j - i <= maxGap && Math.abs(sm[j] - sm[i - 1]) < 2.5) {
      for (let k = i; k < j; k++) sm[k] = sm[i - 1] + (sm[j] - sm[i - 1]) * (k - i + 1) / (j - i + 1);
    }
    i = j;
  }

  // Drop blips shorter than 50 ms.
  const minRun = opts.minRun ?? 5;
  for (let i = 0; i < n; i++) {
    if (isNaN(sm[i])) continue;
    let j = i;
    while (j < n && !isNaN(sm[j])) j++;
    if (j - i < minRun) for (let k = i; k < j; k++) sm[k] = NaN;
    i = j;
  }

  // Loudness envelope, 0..1 against the loud end of the whistling.
  const voicedRms = [];
  for (let i = 0; i < n; i++) if (!isNaN(sm[i])) voicedRms.push(raw.rms[i]);
  const ref = percentile(voicedRms, 0.95) || 1;
  const amp = new Float32Array(n);
  let a = 0;
  for (let i = 0; i < n; i++) {
    const target = isNaN(sm[i]) ? 0 : Math.min(1.2, raw.rms[i] / ref);
    a += (target - a) * (target > a ? 0.6 : 0.35);
    amp[i] = a;
  }

  return { midi: sm, amp, hop: raw.hop, frames: n };
}

/* Split the track into notes. A quick jump in pitch, or a dip-and-rise in
 * loudness (tonguing), starts a new note. A slow slide stays one note and
 * is played as a bend. sensitivity is 0..1: higher finds more notes. */
export function segment(tr, sensitivity = 0.5) {
  const { midi, amp, frames: n } = tr;
  const jump = 1.4 - 0.9 * sensitivity;     // semitones within 30 ms that count as a new note
  const minLen = Math.round(9 - 4 * sensitivity);   // frames between onsets
  const dip = 0.45 + 0.25 * sensitivity;   // loudness ratio that counts as re-tonguing
  const notes = [];

  for (let i = 0; i < n; i++) {
    if (isNaN(midi[i])) continue;
    let end = i;
    while (end < n && !isNaN(midi[end])) end++;
    // Voiced run i..end. Find onsets inside it.
    const onsets = [i];
    let last = i;
    for (let k = i + 3; k < end - 2; k++) {
      if (k - last < minLen) continue;
      const before = midi[k - 3], at = midi[k];
      const steady = Math.abs(midi[Math.min(end - 1, k + 3)] - at) < 0.6;
      let start = -1;
      if (Math.abs(at - before) >= jump && steady) {
        // Put the onset at the steepest step.
        let best = k - 2, bestStep = 0;
        for (let q = k - 2; q <= k; q++) {
          const step = Math.abs(midi[q] - midi[q - 1]);
          if (step > bestStep) { bestStep = step; best = q; }
        }
        start = best;
      } else {
        let peak = 0;
        for (let q = Math.max(i, k - 10); q < k; q++) peak = Math.max(peak, amp[q]);
        const after = amp[Math.min(end - 1, k + 4)];
        if (peak > 0.15 && amp[k] < peak * dip && after > amp[k] * 1.5) {
          // The quietest frame of the dip is the onset.
          let q = k;
          while (q + 1 < end && amp[q + 1] < amp[q]) q++;
          start = q;
        }
      }
      if (start > last + 2) { onsets.push(start); last = start; k = start + 1; }
    }
    for (let o = 0; o < onsets.length; o++) {
      const s = onsets[o], e = o + 1 < onsets.length ? onsets[o + 1] : end;
      pushNote(notes, midi, amp, s, e);
    }
    i = end;
  }
  return splitWideBends(notes, midi, amp);
}

function pushNote(notes, midi, amp, s, e) {
  const vals = [];
  let loud = 0;
  let lo = Infinity, hi = -Infinity;
  for (let k = s; k < e; k++) {
    vals.push(midi[k]); loud = Math.max(loud, amp[k]);
    lo = Math.min(lo, midi[k]); hi = Math.max(hi, midi[k]);
  }
  // A note that slides more than a semitone is a bend: like a guitarist, it is
  // "fretted" where it starts, and the slide happens on top of that.
  const center = hi - lo > 1.2 ? median(vals.slice(1, 7)) : median(vals);
  notes.push({ start: s, end: e, center, velocity: Math.min(1, 0.35 + 0.65 * loud) });
}

// A slide wider than an octave plays badly as one bent note; split it in the middle.
function splitWideBends(notes, midi, amp) {
  const out = [];
  for (const nt of notes) {
    let lo = Infinity, hi = -Infinity;
    for (let k = nt.start; k < nt.end; k++) { lo = Math.min(lo, midi[k]); hi = Math.max(hi, midi[k]); }
    if (hi - lo <= 11 || nt.end - nt.start < 6) { out.push(nt); continue; }
    const mid = (nt.start + nt.end) >> 1;
    pushNote(out, midi, amp, nt.start, mid);
    pushNote(out, midi, amp, mid, nt.end);
  }
  return out;
}

/* Scales, as semitone sets from the tonic. */
export const SCALES = {
  chromatic: { label: 'Chromatic (any note)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  majpent: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minpent: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
};

export function snap(m, tonic = 0, scale = 'chromatic') {
  const steps = (SCALES[scale] || SCALES.chromatic).steps;
  let best = Math.round(m), bestDist = Infinity;
  for (let c = Math.floor(m) - 2; c <= Math.ceil(m) + 2; c++) {
    const pc = (((c - tonic) % 12) + 12) % 12;
    if (!steps.includes(pc)) continue;
    const dist = Math.abs(c - m);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

/* Krumhansl-Schmuckler key finding over the notes, weighted by length and loudness. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a, b) {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let num = 0, da = 0, dbb = 0;
  for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; }
  return da && dbb ? num / Math.sqrt(da * dbb) : 0;
}

export function detectKey(notes) {
  const hist = new Array(12).fill(0);
  for (const nt of notes) hist[((Math.round(nt.center) % 12) + 12) % 12] += (nt.end - nt.start) * nt.velocity;
  if (hist.every((v) => v === 0)) return null;
  let best = null;
  for (let t = 0; t < 12; t++) {
    for (const [mode, prof] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]]) {
      const rotated = prof.map((_, i) => prof[(i - t + 12) % 12]);
      const score = corr(hist, rotated);
      if (!best || score > best.score) best = { tonic: t, mode, score };
    }
  }
  return best;
}

/* The performance the instruments play: per-frame output pitch, loudness,
 * and which note each frame belongs to.
 *   transpose   semitones added to everything (octave shifts live here)
 *   correction  0..1, how far each note's centre is pulled onto the scale
 *   bends       0..1, how much of the slides and vibrato inside a note is kept
 */
export function perform(tr, notes, s = {}) {
  const n = tr.frames;
  const transpose = s.transpose || 0, correction = s.correction ?? 0.8, bends = s.bends ?? 1;
  const pitch = new Float32Array(n).fill(NaN);
  const noteOf = new Int32Array(n).fill(-1);
  const out = [];
  notes.forEach((nt, idx) => {
    const target = snap(nt.center, s.tonic || 0, s.scale || 'chromatic');
    const base = nt.center + (target - nt.center) * correction;
    for (let k = nt.start; k < nt.end; k++) {
      // Light 3-frame smoothing on the wiggle so the synth doesn't buzz.
      const a = tr.midi[Math.max(nt.start, k - 1)], b = tr.midi[k], c = tr.midi[Math.min(nt.end - 1, k + 1)];
      const dev = (a + 2 * b + c) / 4 - nt.center;
      pitch[k] = base + dev * bends + transpose;
      noteOf[k] = idx;
    }
    out.push({ start: nt.start, end: nt.end, pitch: base + transpose, velocity: nt.velocity });
  });
  return { pitch, amp: tr.amp, noteOf, notes: out, hop: tr.hop, frames: n };
}

/* Make a believable practice whistle: notes with a scoop in, vibrato on
 * long ones, one slow bend and a couple of tongued repeats. */
export function demoWhistle(sr = ANALYSIS_SR) {
  // [midi, seconds, kind]
  const phrase = [
    [79, 0.35], [81, 0.35], [83, 0.7, 'vib'], [0, 0.15],
    [83, 0.18], [83, 0.18], [81, 0.3], [79, 0.3], [76, 0.9, 'bendup'],
    [0, 0.25], [74, 0.3], [76, 0.3], [79, 0.3], [81, 0.3], [79, 1.1, 'vib'], [0, 0.4],
  ];
  const total = phrase.reduce((s, p) => s + p[1], 0) + 0.3;
  const x = new Float32Array(Math.ceil(total * sr));
  let t = Math.floor(0.15 * sr), phase = 0, prev = 79;
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (const [m, dur, kind] of phrase) {
    const len = Math.floor(dur * sr);
    for (let i = 0; i < len; i++, t++) {
      const u = i / len;
      if (!m) { x[t] = noise() * 0.002; continue; }
      let p = m;
      if (i < 0.03 * sr) p = prev + (m - prev) * Math.min(1, i / (0.03 * sr));   // quick slide from the last note
      if (kind === 'vib' && u > 0.3) p += 0.35 * Math.sin(2 * Math.PI * 5.5 * i / sr) * Math.min(1, (u - 0.3) * 3);
      if (kind === 'bendup' && u > 0.25) p += 2 * Math.min(1, (u - 0.25) / 0.35);
      phase += 2 * Math.PI * midiToHz(p) / sr;
      const env = Math.min(1, i / (0.02 * sr)) * Math.min(1, (len - i) / (0.03 * sr));
      x[t] = 0.3 * env * Math.sin(phase) + noise() * 0.004;
    }
    if (m) prev = m;
  }
  return x;
}

/* The octave shift that puts the middle of the melody nearest an
 * instrument's home note. The middle is the duration-weighted median of the
 * notes, so one stray squeak doesn't move it. */
export function melodyMiddle(notes) {
  if (!notes.length) return NaN;
  const sorted = notes.map((n) => [n.center, n.end - n.start]).sort((a, b) => a[0] - b[0]);
  const half = sorted.reduce((s, [, w]) => s + w, 0) / 2;
  let acc = 0;
  for (const [m, w] of sorted) { acc += w; if (acc >= half) return m; }
  return sorted[sorted.length - 1][0];
}

export function fitOctave(notes, home) {
  const mid = melodyMiddle(notes);
  if (isNaN(mid)) return 0;
  return Math.max(-4, Math.min(2, Math.round((home - mid) / 12)));
}

export function melodyRange(notes) {
  if (!notes.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const n of notes) { lo = Math.min(lo, n.center); hi = Math.max(hi, n.center); }
  return [lo, hi];
}
