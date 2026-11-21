/* Whistle Rig: instruments.
 *
 * Each instrument is rendered sample by sample from a performance (see
 * perform() in pitch.js): a pitch curve, a loudness curve and note
 * boundaries. Guitars and bass are plucked-string models whose string
 * length follows the pitch curve, so a slide in the whistle becomes a
 * string bend. The rest are filtered oscillators shaped by loudness.
 *
 * Plain math, no Web Audio, so it renders the same in node and the browser.
 */

import { midiToHz } from './pitch.js';

export const INSTRUMENTS = {
  overdrive: { label: 'Overdrive guitar', octave: -1, gm: 29 },
  clean: { label: 'Clean guitar', octave: -1, gm: 27 },
  bass: { label: 'Bass', octave: -3, gm: 33 },
  lead: { label: 'Synth lead', octave: -1, gm: 80 },
  violin: { label: 'Violin', octave: -1, gm: 40 },
  brass: { label: 'Trumpet', octave: -1, gm: 56 },
  flute: { label: 'Flute', octave: 0, gm: 73 },
};

const TAU = Math.PI * 2;

class Biquad {
  constructor() { this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; this.z1 = this.z2 = 0; }
  set(type, f, q, sr, gainDb = 0) {
    f = Math.min(f, sr * 0.45);
    const w = TAU * f / sr, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b1 = 1 - cos; b0 = b2 = b1 / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else if (type === 'hp') { b1 = -(1 + cos); b0 = b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else if (type === 'bp') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
    else { // peak
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

const filt = (type, f, q, sr, g) => new Biquad().set(type, f, q, sr, g);

class Follower {
  constructor(sr, attack, release) { this.v = 0; this.a = 1 - Math.exp(-1 / (attack * sr)); this.r = 1 - Math.exp(-1 / (release * sr)); }
  run(x) { this.v += (x - this.v) * (x > this.v ? this.a : this.r); return this.v; }
}

// Band-limited sawtooth (polyBLEP).
class Saw {
  constructor(phase = 0) { this.p = phase; }
  run(dt) {
    this.p += dt; if (this.p >= 1) this.p -= 1;
    let v = 2 * this.p - 1, t = this.p;
    if (t < dt) { t /= dt; v -= t + t - t * t - 1; }
    else if (t > 1 - dt) { t = (t - 1) / dt; v -= t * t + t + t + 1; }
    return v;
  }
}

class Rand {
  constructor(seed = 12345) { this.s = seed; }
  next() { this.s = (this.s * 16807) % 2147483647; return this.s / 1073741823.5 - 1; }
}

/* Plucked string with a moving fret: a delay line whose length is read
 * fractionally, so the pitch can glide. */
class Str {
  constructor(sr, { damp = 0.6, sustain = 0.998, seed = 99 } = {}) {
    this.sr = sr; this.buf = new Float32Array(8192); this.w = 0;
    this.damp = damp; this.sustain = sustain; this.g = sustain;
    this.lp = 0; this.dcx = 0; this.dcy = 0;
    this.excite = 0; this.exciteAmt = 0; this.exLp = 0; this.bright = 0.5;
    this.rand = new Rand(seed);
    this.lastF = 0; this.comp = 0;
  }
  pluck(freq, vel, bright = 0.5) {
    this.excite = Math.round(this.sr / freq);
    this.exciteAmt = vel; this.bright = bright; this.g = this.sustain;
    // Fretting a new note mostly stops the old vibration.
    for (let i = 0; i < this.buf.length; i++) this.buf[i] *= 0.25;
  }
  mute(amount) { this.g = amount; }
  // The loop's own filters shift the pitch a little; work out by how much.
  loopDelay(freq) {
    const w = TAU * freq / this.sr, c = Math.cos(w), s = Math.sin(w), b = 1 - this.damp;
    const lpPhase = -Math.atan2(b * s, 1 - b * c);
    const dcPhase = Math.atan2(s, 1 - c) - Math.atan2(0.995 * s, 1 - 0.995 * c);
    return -(lpPhase + dcPhase) / w;
  }
  run(freq) {
    if (Math.abs(freq - this.lastF) > freq * 0.0003) { this.lastF = freq; this.comp = this.loopDelay(freq); }
    const delay = Math.min(8000, Math.max(2, this.sr / freq - this.comp));
    let r = this.w - delay; if (r < 0) r += 8192;
    const i0 = r | 0, fr = r - i0;
    const y = this.buf[i0] * (1 - fr) + this.buf[(i0 + 1) & 8191] * fr;
    this.lp = this.damp * y + (1 - this.damp) * this.lp;
    // DC blocker keeps the loop centred.
    const dc = this.lp - this.dcx + 0.995 * this.dcy; this.dcx = this.lp; this.dcy = dc;
    let v = dc * this.g;
    if (this.excite > 0) {
      this.exLp += (this.rand.next() - this.exLp) * this.bright;
      v += this.exLp * this.exciteAmt;
      this.excite--;
    }
    this.buf[this.w] = v; this.w = (this.w + 1) & 8191;
    return v;
  }
}

/* Voice factories. Each returns {onset(freq, vel), release(), run(freq, amp, gate, t) -> sample}. */
const VOICES = {
  overdrive(sr) {
    const str = new Str(sr, { damp: 0.72, sustain: 0.9996 });
    const saw = new Saw(0.3), saw2 = new Saw(0.7);
    const pre = filt('hp', 140, 0.7, sr);
    const mid = filt('peak', 800, 0.8, sr, 5);
    const cab = [filt('peak', 110, 1, sr, 3), filt('lp', 4300, 0.9, sr), filt('peak', 2400, 1.2, sr, 3), filt('lp', 6500, 0.7, sr), filt('hp', 75, 0.7, sr)];
    const follow = new Follower(sr, 0.005, 0.06), out = new Follower(sr, 0.002, 0.07);
    let since = 1e9;
    return {
      onset(f, vel) { str.pluck(f, 0.9 * vel + 0.2, 0.65); since = 0; },
      release() { str.mute(0.985); },
      run(f, amp, gate) {
        since++;
        const a = follow.run(gate ? amp : 0);
        const hold = Math.min(1, since / (0.35 * sr));
        const dt = f / sr;
        let x = str.run(f) * 1.6 + (saw.run(dt) + saw2.run(dt * 1.003)) * 0.12 * a * hold;
        x = mid.run(pre.run(x)) * 12;
        x = Math.tanh(x + 0.15) - 0.1489;   // asymmetric clip, like a tube
        for (const c of cab) x = c.run(x);
        return x * 0.32 * out.run(gate ? 0.45 + 0.55 * Math.min(1, a) : 0);
      },
    };
  },

  clean(sr) {
    const str = new Str(sr, { damp: 0.62, sustain: 0.9985 });
    const body = [filt('peak', 190, 1, sr, 4), filt('peak', 2600, 1, sr, 2), filt('lp', 7500, 0.7, sr), filt('hp', 70, 0.7, sr)];
    const out = new Follower(sr, 0.001, 0.09);
    return {
      onset(f, vel) { str.pluck(f, 0.7 * vel + 0.15, 0.55); },
      release() { str.mute(0.99); },
      run(f, amp, gate) {
        let x = str.run(f) * 1.8;
        for (const c of body) x = c.run(x);
        return Math.tanh(x * 1.2) * 0.6 * out.run(gate ? 1 : 0);
      },
    };
  },

  bass(sr) {
    const str = new Str(sr, { damp: 0.42, sustain: 0.9992 });
    let ph = 0;
    const lp = filt('lp', 1800, 0.7, sr), hp = filt('hp', 35, 0.7, sr);
    const out = new Follower(sr, 0.002, 0.08), follow = new Follower(sr, 0.01, 0.1);
    return {
      onset(f, vel) { str.pluck(f, 0.8 * vel + 0.2, 0.35); },
      release() { str.mute(0.985); },
      run(f, amp, gate) {
        ph += f / sr; if (ph > 1) ph -= 1;
        const a = follow.run(gate ? amp : 0);
        const x = str.run(f) * 2 + Math.sin(TAU * ph) * 0.25 * a;
        return Math.tanh(hp.run(lp.run(x)) * 1.3) * 0.7 * out.run(gate ? 1 : 0);
      },
    };
  },

  lead(sr) {
    const s1 = new Saw(0.1), s2 = new Saw(0.6), sub = new Saw(0.4);
    const lp = new Biquad(), lp2 = new Biquad();
    const env = new Follower(sr, 0.006, 0.09);
    let n = 0;
    return {
      onset() {}, release() {},
      run(f, amp, gate) {
        const a = env.run(gate ? amp : 0);
        if ((n++ & 15) === 0) { const fc = 500 + 6000 * Math.pow(Math.min(1, a), 1.2); lp.set('lp', fc, 2.2, sr); lp2.set('lp', fc * 1.5, 0.7, sr); }
        const dt = f / sr;
        const x = s1.run(dt) + s2.run(dt * 1.004) * 0.8 + (sub.run(dt * 0.5) > 0 ? 0.25 : -0.25);
        return Math.tanh(lp2.run(lp.run(x)) * 0.8) * 0.55 * a;
      },
    };
  },

  violin(sr) {
    const saw = new Saw(0.2), rand = new Rand(5);
    const chain = [filt('hp', 190, 0.7, sr), filt('peak', 290, 1.3, sr, 6), filt('peak', 1000, 1, sr, -4), filt('peak', 2900, 1.6, sr, 7), filt('lp', 6000, 0.7, sr)];
    const env = new Follower(sr, 0.07, 0.16);
    return {
      onset() {}, release() {},
      run(f, amp, gate) {
        const a = env.run(gate ? amp : 0);
        let x = saw.run(f / sr) + rand.next() * 0.08;
        for (const c of chain) x = c.run(x);
        return x * 0.35 * a;
      },
    };
  },

  brass(sr) {
    const saw = new Saw(0.5), lp = new Biquad(), hp = filt('hp', 150, 0.7, sr), pk = filt('peak', 1300, 1, sr, 4);
    const env = new Follower(sr, 0.025, 0.08);
    let n = 0, since = 1e9;
    return {
      onset() { since = 0; }, release() {},
      run(f, amp, gate) {
        since++;
        const a = env.run(gate ? amp : 0);
        const blat = since < 0.06 * sr ? 1 - since / (0.06 * sr) : 0;   // the bright "blat" of a new note
        if ((n++ & 15) === 0) lp.set('lp', 250 + 4200 * Math.pow(Math.min(1, a), 1.6) + 2500 * blat, 0.9, sr);
        const x = pk.run(hp.run(lp.run(saw.run(f / sr))));
        return Math.tanh(x * 1.6) * 0.5 * a;
      },
    };
  },

  flute(sr) {
    let ph = 0;
    const rand = new Rand(3), bp = new Biquad(), env = new Follower(sr, 0.045, 0.1);
    let n = 0;
    return {
      onset() {}, release() {},
      run(f, amp, gate) {
        const a = env.run(gate ? amp : 0);
        ph += f / sr; if (ph > 1) ph -= 1;
        if ((n++ & 31) === 0) bp.set('bp', f * 2, 3, sr);
        const tone = Math.sin(TAU * ph) + 0.12 * Math.sin(2 * TAU * ph) + 0.04 * Math.sin(3 * TAU * ph);
        return (tone * 0.5 + bp.run(rand.next()) * 0.35) * a;
      },
    };
  },
};

/* Render a performance with one instrument. Returns mono Float32Array at sr. */
export function render(perf, name = 'overdrive', { sr = 44100, tail = 1.2 } = {}) {
  const voice = (VOICES[name] || VOICES.overdrive)(sr);
  const spf = perf.hop * sr;   // samples per frame
  const len = Math.ceil(perf.frames * spf + tail * sr);
  const outBuf = new Float32Array(len);
  let lastNote = -1, gate = false, freq = 220, peak = 0;

  for (let i = 0; i < len; i++) {
    const fp = i / spf, f0 = Math.floor(fp), fr = fp - f0;
    const inside = f0 < perf.frames;
    const note = inside ? perf.noteOf[f0] : -1;
    if (note >= 0) {
      let p = perf.pitch[f0];
      if (f0 + 1 < perf.frames && perf.noteOf[f0 + 1] === note) p += (perf.pitch[f0 + 1] - p) * fr;
      freq = midiToHz(p);
      if (note !== lastNote) voice.onset(freq, perf.notes[note].velocity);
      gate = true;
    } else if (gate) {
      voice.release(); gate = false;
    }
    lastNote = note;
    let amp = 0;
    if (inside) {
      amp = perf.amp[f0];
      if (f0 + 1 < perf.frames) amp += (perf.amp[f0 + 1] - amp) * fr;
    }
    const s = voice.run(freq, amp, gate);
    outBuf[i] = s;
    const m = Math.abs(s); if (m > peak) peak = m;
  }
  // Normalise so every instrument sits at the same level.
  if (peak > 0) { const k = 0.85 / peak; for (let i = 0; i < len; i++) outBuf[i] *= k; }
  return outBuf;
}
