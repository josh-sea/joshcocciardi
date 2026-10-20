/**
 * Sweat Boy: everything you hear, made in Web Audio with no files.
 *
 * The music is a four-channel handheld setup: a 25% pulse lead, a 12.5%
 * pulse arpeggio, a triangle bass and a noise drum kit. Songs are written
 * as one chord and one lead bar per measure; the bass and arpeggio are
 * built from the chords so every channel always lines up.
 *
 * The crowd is shaped noise: a murmur under the whole game, cheers with
 * claps and "woo"s for buckets, and an "ooh" or "aww" for slips and bricks.
 */

const STEPS = 16; // sixteenth notes per bar

const SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

/** "A4" -> MIDI note number. */
export function midi(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return SEMI[m[1]] + (+m[2] + 1) * 12;
}
export const freq = (n) => 440 * 2 ** ((n - 69) / 12);

export const CHORDS = {
  C: ["C", "E", "G"], Dm: ["D", "F", "A"], Em: ["E", "G", "B"], E: ["E", "G#", "B"],
  F: ["F", "A", "C"], G: ["G", "B", "D"], Am: ["A", "C", "E"],
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

export const SONGS = {
  title: {
    bpm: 104,
    loop: true,
    chords: ["C", "G", "Am", "F", "C", "G", "F", "G"],
    lead: [
      "G4 . C5 . E5 . G5 . . . E5 . G5 . C6 .",
      "B5 . . . G5 . D5 . . . B4 . D5 . G5 .",
      "A5 . . . E5 . C5 . . . E5 . A5 . G5 .",
      "F5 . . . A5 . . . G5 . F5 . E5 . D5 .",
      "E5 . G5 . C6 . . . B5 . C6 . E6 . . .",
      "D6 . . . B5 . G5 . . . A5 . B5 . . .",
      "C6 . . . A5 . F5 . . . A5 . C6 . A5 .",
      "B5 . . . . . G5 . A5 . B5 . D6 . - -",
    ],
    drums: ["k...h...s...h...", "k...h...s...h...", "k...h...s...h...", "k...h...s...h.h."],
    bass: "bounce",
    arp: true,
  },
  game: {
    bpm: 132,
    loop: true,
    chords: ["Am", "F", "C", "G", "Am", "F", "C", "E"],
    lead: [
      "A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .",
      "C5 . A4 . . . F4 . A4 . C5 . F5 . E5 .",
      "E5 . G5 . C6 . . . B5 . G5 . E5 . G5 .",
      "D5 . . . B4 . D5 . G5 . . . F5 E5 D5 B4",
      "A4 . C5 . E5 . A5 . C6 . B5 . A5 . E5 .",
      "F5 . . . E5 . F5 . A5 . . . G5 . F5 .",
      "E5 . C5 . G4 . C5 . E5 . G5 . C6 . . .",
      "B5 . . . G#5 . . . E5 . F#5 . G#5 . B5 .",
    ],
    drums: ["k.h.s.hhk.k.s.h.", "k.h.s.hhk.k.s.h.", "k.h.s.hhk.k.s.h.", "k.h.s.hhk.k.ssss"],
    bass: "bounce",
    arp: true,
  },
  win: {
    bpm: 150,
    loop: false,
    chords: ["C", "G", "C"],
    lead: [
      "C5 . E5 . G5 . C6 . . . G5 . C6 . . .",
      "D6 . . . B5 . . . G5 . A5 . B5 . . .",
      "C6 . . . . . . . . . . . - - - -",
    ],
    drums: ["k...s...k.k.s...", "k...s...k.k.s.ss", "k..............."],
    bass: "bounce",
    arp: true,
  },
  lose: {
    bpm: 84,
    loop: false,
    chords: ["Am", "E", "Am"],
    lead: [
      "E5 . . . D5 . . . C5 . . . B4 . . .",
      "B4 . . . A4 . . . G#4 . . . . . . .",
      "A4 . . . . . . . . . . . - - - -",
    ],
    drums: null,
    bass: "hold",
    arp: false,
  },
};

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

/* ---------- the audio graph ---------- */

export function createSound(hw) {
  let ac = null;
  let master, musicBus, sfxBus, noiseBuf, leadWave, arpWave;
  let mode = 0; // 0 everything, 1 music off, 2 silent
  try { mode = +(hw.load("sweatboy.sound", 0)) % 3; } catch { /* keep default */ }

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

  const sfx = {
    squeak: () => { beep(1100, 0.05, { to: 1500, vol: 0.03 }); beep(1500, 0.05, { to: 1000, vol: 0.03, at: 0.14 }); },
    dry: () => { beep(1320, 0.08, { type: "triangle", vol: 0.12 }); beep(1760, 0.12, { type: "triangle", vol: 0.12, at: 0.07 }); },
    plop: () => beep(380, 0.12, { type: "sine", to: 110, vol: 0.18 }),
    slip: () => beep(700, 0.25, { to: 150, vol: 0.08 }),
    whistle: () => { for (let i = 0; i < 4; i++) beep(2300 + (i % 2) * 160, 0.06, { type: "sine", vol: 0.06, at: i * 0.06 }); },
    swish: () => { beep(900, 0.25, { type: "triangle", to: 400, vol: 0.12 }); beep(523, 0.1, { at: 0.3 }); beep(659, 0.1, { at: 0.4 }); beep(784, 0.18, { at: 0.5 }); },
    clank: () => { beep(190, 0.18, { vol: 0.1 }); beep(140, 0.2, { vol: 0.08, at: 0.12 }); },
    buzzer: () => beep(98, 0.7, { type: "sawtooth", vol: 0.08 }),
    tick: () => beep(1800, 0.03, { vol: 0.03 }),
    blip: () => beep(880, 0.05, { vol: 0.05 }),
    power: () => [1047, 1319, 1568, 2093].forEach((f, i) => beep(f, 0.09, { vol: 0.06, at: i * 0.06 })),
    powerDown: () => [1568, 1175, 880, 659].forEach((f, i) => beep(f, 0.09, { vol: 0.05, at: i * 0.07 })),
  };

  /* ---- noise and the crowd ---- */

  function noise(t) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    return s;
  }

  /** A shaped puff of filtered noise. */
  function burst({ at = 0, dur, peak, attack, f0, f1 = null, q = 1, type = "bandpass", bus = sfxBus }) {
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
    src.connect(f).connect(g).connect(bus);
    src.stop(t + dur + 0.05);
  }

  /** One voice in the crowd: a buzzy vowel that glides, softened by a lowpass. */
  function voice({ at, dur, f0, rise, fall, vol, cutoff }) {
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

  let lastGroan = 0;
  const crowd = {
    /** Cheers, claps and "woo"s. level is roughly 0.1 (polite) to 0.6 (buzzer beater). */
    cheer(level = 0.3, dur = 2) {
      if (!ac || mode === 2) return;
      burst({ dur, peak: level * 0.45, attack: 0.15, f0: 900, q: 0.6 });
      burst({ dur: dur * 0.8, peak: level * 0.22, attack: 0.1, f0: 2600, q: 1 });
      const claps = Math.round(dur * level * 70);
      for (let i = 0; i < claps; i++) {
        burst({ at: Math.random() * dur * 0.85, dur: 0.035, peak: level * (0.15 + Math.random() * 0.25), attack: 0.003, f0: 1400 + Math.random() * 1200, q: 1.4 });
      }
      const woos = Math.round(2 + level * 8);
      for (let i = 0; i < woos; i++) {
        voice({ at: Math.random() * dur * 0.4, dur: 0.6 + Math.random() * 0.5, f0: 320 + Math.random() * 260, rise: 1.35, fall: 0.85, vol: level * 0.035, cutoff: 1800 });
      }
    },
    /** The "ooooh" when someone slips, or the "aww" on a brick. */
    groan(level = 0.25, dur = 1.1) {
      if (!ac || mode === 2) return;
      const now = ac.currentTime;
      if (now - lastGroan < 0.5) return;
      lastGroan = now;
      burst({ dur, peak: level * 0.35, attack: 0.18, f0: 750, f1: 280, q: 2.2 });
      for (let i = 0; i < 5; i++) {
        voice({ at: Math.random() * 0.12, dur: dur * (0.8 + Math.random() * 0.3), f0: 170 + Math.random() * 110, rise: 1.08, fall: 0.72, vol: level * 0.05, cutoff: 750 });
      }
    },
    murmurOn: null,
    /** The hum of a full arena, under everything while a game is on. */
    murmur(on) {
      if (!ac) return;
      const t = ac.currentTime;
      if (on && !crowd.murmurOn) {
        const src = noise(t);
        const f = ac.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 480;
        f.Q.value = 0.8;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03, t + 1.2);
        const lfo = ac.createOscillator();
        const lfoG = ac.createGain();
        lfo.frequency.value = 0.21;
        lfoG.gain.value = 0.01;
        lfo.connect(lfoG).connect(g.gain);
        lfo.start(t);
        src.connect(f).connect(g).connect(sfxBus);
        crowd.murmurOn = { src, g, lfo };
      } else if (!on && crowd.murmurOn) {
        const { src, g, lfo } = crowd.murmurOn;
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.25);
        src.stop(t + 1.2);
        lfo.stop(t + 1.2);
        crowd.murmurOn = null;
      }
    },
  };

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
    song = SONGS[name];
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
    sfx, crowd, play, stop, pause,
    /** Pulling the cartridge: silence everything this cartridge made. */
    dispose() {
      stop();
      crowd.murmur(false);
      if (master) master.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      setTimeout(() => master && master.disconnect(), 200);
    },
    setTempo(x) { tempo = x; },
    get mode() { return mode; },
    cycleMode() {
      mode = (mode + 1) % 3;
      hw.save("sweatboy.sound", mode);
      applyMode();
      return mode;
    },
  };
}
