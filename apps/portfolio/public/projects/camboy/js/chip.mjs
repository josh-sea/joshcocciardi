/**
 * Camboy: the sound chip. Every cartridge's music and blips come through
 * here, made in Web Audio with no files.
 *
 * Four channels like a handheld: a 25% pulse lead, a 12.5% pulse arpeggio,
 * a triangle bass and a noise drum kit. A song is one chord and one lead
 * bar per measure; the bass and arpeggio are built from the chords, so
 * every channel always lines up.
 */

export const STEPS = 16; // sixteenth notes per bar

const SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

/** "A4" -> MIDI note number. */
export function midi(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return SEMI[m[1]] + (+m[2] + 1) * 12;
}
export const freq = (n) => 440 * 2 ** ((n - 69) / 12);

export const CHORDS = {
  C: ["C", "E", "G"], Dm: ["D", "F", "A"], D: ["D", "F#", "A"], Em: ["E", "G", "B"], E: ["E", "G#", "B"],
  F: ["F", "A", "C"], G: ["G", "B", "D"], Gm: ["G", "A#", "D"], Am: ["A", "C", "E"], A: ["A", "C#", "E"],
  Bb: ["A#", "D", "F"], Bm: ["B", "D", "F#"],
};

/** Chord tones stacked upward from the root, starting at octave oct. */
export function voicing(chord, oct) {
  const out = [];
  for (const t of CHORDS[chord]) {
    let n = midi(t + oct);
    while (out.length && n <= out[out.length - 1]) n += 12;
    out.push(n);
  }
  return out;
}

/**
 * One bar of lead: 16 space-separated tokens. A note starts a note, "."
 * holds whatever is sounding, "-" is silence.
 */
export function parseLead(bars) {
  const tokens = bars.join(" ").trim().split(/\s+/);
  const events = [];
  tokens.forEach((tok, step) => {
    if (tok === "." || tok === "-") return;
    let len = 1;
    while (tokens[step + len] === ".") len++;
    events.push({ step, note: midi(tok), len });
  });
  return { events, steps: tokens.length };
}

/** Root bounce with a fifth on the way back, the classic handheld bass. */
function bassBar(chord, style) {
  const [r, , f] = voicing(chord, 2).map((n) => (n < midi("E2") ? n + 12 : n));
  if (style === "hold") return [{ step: 0, note: r, len: 16 }];
  const pat = [r, 0, r + 12, 0, r, 0, r + 12, 0, r, 0, r + 12, 0, f, 0, r + 12, 0];
  return pat.map((note, step) => (note ? { step, note, len: 1 } : null)).filter(Boolean);
}

function arpBar(chord) {
  const v = voicing(chord, 4);
  const up = [v[0], v[1], v[2], v[0] + 12, v[2], v[1]];
  return Array.from({ length: STEPS }, (_, step) => ({ step, note: up[step % up.length], len: 1 }));
}

/** Flatten a song into per-channel event lists. */
export function compile(song) {
  const bars = song.chords.length;
  const lead = parseLead(song.lead);
  const bass = [];
  const arp = [];
  const drums = [];
  song.chords.forEach((c, b) => {
    for (const e of bassBar(c, song.bass)) bass.push({ ...e, step: e.step + b * STEPS });
    if (song.arp) for (const e of arpBar(c)) arp.push({ ...e, step: e.step + b * STEPS });
    if (song.drums) {
      const pat = song.drums[b % song.drums.length];
      [...pat].forEach((ch, i) => { if (ch !== ".") drums.push({ step: b * STEPS + i, kind: ch }); });
    }
  });
  return { steps: bars * STEPS, leadSteps: lead.steps, lead: lead.events, bass, arp, drums };
}

/* ---------- the chip ---------- */

/**
 * One cartridge's voice. songs is its song book; modeKey is where its
 * sound on / music off / silent setting is saved.
 */
export function createChip(hw, songs, { modeKey }) {
  let ac = null;
  let master, musicBus, sfxBus, noiseBuf, leadWave, arpWave;
  let mode = 0; // 0 everything, 1 music off, 2 silent
  try { mode = +(hw.load(modeKey, 0)) % 3; } catch { /* keep default */ }
  const onReady = [];

  function pulse(duty) {
    const n = 32;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
      im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
    }
    return ac.createPeriodicWave(re, im);
  }

  function applyMode() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(mode === 2 ? 0 : 1, t, 0.03);
    musicBus.gain.setTargetAtTime(mode === 0 ? 0.5 : 0, t, 0.03);
  }

  /**
   * The Camboy owns the audio context, the volume wheel and the limiter. It
   * hands them over once the first tap allows sound.
   */
  function attach(context, out) {
    ac = context;
    master = ac.createGain();
    master.connect(out);
    musicBus = ac.createGain();
    musicBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    leadWave = pulse(0.25);
    arpWave = pulse(0.125);
    applyMode();
    onReady.forEach((fn) => fn());
    if (pending) play(pending.name, pending.at);
  }

  /* ---- one-off tones ---- */

  function beep(f, dur, { type = "square", vol = 0.07, to = null, at = 0 } = {}) {
    if (!ac || mode === 2) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const v = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    v.gain.setValueAtTime(vol, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ---- noise ---- */

  function noise(t) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    return s;
  }

  /** A shaped puff of filtered noise: crashes, crowds, dust. */
  function burst({ at = 0, dur, peak, attack, f0, f1 = null, q = 1, type = "bandpass" }) {
    if (!ac || mode === 2) return;
    const t = ac.currentTime + at;
    const src = noise(t);
    const f = ac.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.stop(t + dur + 0.05);
  }

  /** A buzzy vowel that glides, softened by a lowpass: a voice in a crowd, a roar. */
  function voice({ at, dur, f0, rise, fall, vol, cutoff }) {
    if (!ac || mode === 2) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * rise, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * fall, t + dur);
    const wob = ac.createOscillator();
    const wobG = ac.createGain();
    wob.frequency.value = 5 + Math.random() * 2;
    wobG.gain.value = f0 * 0.02;
    wob.connect(wobG).connect(o.frequency);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(sfxBus);
    o.start(t); wob.start(t);
    o.stop(t + dur + 0.05); wob.stop(t + dur + 0.05);
  }

  /* ---- the music player ---- */

  let song = null;
  let songName = null;
  let pending = null;
  let step = 0;
  let nextAt = 0;
  let timer = null;
  let tempo = 1;
  const index = new Map();

  function byStep(list) {
    const m = new Map();
    for (const e of list) (m.get(e.step) || m.set(e.step, []).get(e.step)).push(e);
    return m;
  }

  function tone(wave, note, at, len, vol) {
    const o = ac.createOscillator();
    if (typeof wave === "string") o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.value = freq(note);
    const g = ac.createGain();
    const end = at + Math.max(0.04, len - 0.012);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(vol * 0.7, at + Math.min(0.12, len * 0.5));
    g.gain.setValueAtTime(vol * 0.7, end - 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
    o.connect(g).connect(musicBus);
    o.start(at);
    o.stop(end + 0.05);
  }

  function drum(kind, at) {
    if (kind === "k") {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.setValueAtTime(150, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      g.gain.setValueAtTime(0.55, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g).connect(musicBus);
      o.start(at);
      o.stop(at + 0.2);
    } else {
      const snare = kind === "s";
      const src = noise(at);
      const f = ac.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = snare ? 1500 : 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(snare ? 0.22 : 0.07, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (snare ? 0.13 : 0.04));
      src.connect(f).connect(g).connect(musicBus);
      src.stop(at + 0.16);
    }
  }

  function schedule() {
    const sixteenth = 60 / (song.bpm * tempo) / 4;
    while (nextAt < ac.currentTime + 0.12) {
      const s = index.get(songName);
      for (const e of s.lead.get(step) || []) tone(leadWave, e.note, nextAt, e.len * sixteenth, 0.075);
      for (const e of s.arp.get(step) || []) tone(arpWave, e.note, nextAt, sixteenth * 0.9, 0.022);
      for (const e of s.bass.get(step) || []) tone("triangle", e.note, nextAt, e.len * sixteenth * 0.95, 0.16);
      for (const e of s.drums.get(step) || []) drum(e.kind, nextAt);
      nextAt += sixteenth;
      step++;
      if (step >= s.steps) {
        if (!song.loop) { stop(); return; }
        step = 0;
      }
    }
  }

  /** Start a song from the top, or keep it going if it is already playing. */
  function play(name, at = 0) {
    if (!ac) { pending = { name, at }; return; }
    pending = null;
    if (songName === name && timer) return;
    stop();
    song = songs[name];
    songName = name;
    if (!index.has(name)) {
      const c = compile(song);
      index.set(name, { steps: c.steps, lead: byStep(c.lead), bass: byStep(c.bass), arp: byStep(c.arp), drums: byStep(c.drums) });
    }
    step = at;
    tempo = 1;
    nextAt = ac.currentTime + 0.05;
    timer = setInterval(schedule, 25);
    schedule();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    pending = null;
  }

  /** Pause keeps the place in the song so it picks back up mid-phrase. */
  function pause() {
    const where = { name: songName, at: step };
    stop();
    songName = null;
    return where;
  }

  hw.onAudio(attach);

  return {
    beep, burst, voice, noise, play, stop, pause,
    get ac() { return ac; },
    get sfxBus() { return sfxBus; },
    /** Run fn once sound is allowed (right away if it already is). */
    ready(fn) { if (ac) fn(); else onReady.push(fn); },
    setTempo(x) { tempo = x; },
    get mode() { return mode; },
    cycleMode() {
      mode = (mode + 1) % 3;
      hw.save(modeKey, mode);
      applyMode();
      return mode;
    },
    /** Pulling the cartridge: silence everything this cartridge made. */
    dispose() {
      stop();
      if (master) master.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      setTimeout(() => master && master.disconnect(), 200);
    },
  };
}
