/**
 * Sweat Boy: its songs, its blips and its crowd, played on the Camboy's
 * sound chip (js/chip.mjs).
 *
 * The crowd is shaped noise: a murmur under the whole game, cheers with
 * claps and "woo"s for buckets, and an "ooh" or "aww" for slips and bricks.
 */

import { createChip } from "../../js/chip.mjs";

export { STEPS, CHORDS, midi, freq, voicing, parseLead, compile } from "../../js/chip.mjs";

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

/* ---------- the cartridge's voice ---------- */

export function createSound(hw) {
  const chip = createChip(hw, SONGS, { modeKey: "sweatboy.sound" });
  const { beep } = chip;

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

  let lastGroan = 0;
  const crowd = {
    /** Cheers, claps and "woo"s. level is roughly 0.1 (polite) to 0.6 (buzzer beater). */
    cheer(level = 0.3, dur = 2) {
      if (!chip.ac || chip.mode === 2) return;
      chip.burst({ dur, peak: level * 0.45, attack: 0.15, f0: 900, q: 0.6 });
      chip.burst({ dur: dur * 0.8, peak: level * 0.22, attack: 0.1, f0: 2600, q: 1 });
      const claps = Math.round(dur * level * 70);
      for (let i = 0; i < claps; i++) {
        chip.burst({ at: Math.random() * dur * 0.85, dur: 0.035, peak: level * (0.15 + Math.random() * 0.25), attack: 0.003, f0: 1400 + Math.random() * 1200, q: 1.4 });
      }
      const woos = Math.round(2 + level * 8);
      for (let i = 0; i < woos; i++) {
        chip.voice({ at: Math.random() * dur * 0.4, dur: 0.6 + Math.random() * 0.5, f0: 320 + Math.random() * 260, rise: 1.35, fall: 0.85, vol: level * 0.035, cutoff: 1800 });
      }
    },
    /** The "ooooh" when someone slips, or the "aww" on a brick. */
    groan(level = 0.25, dur = 1.1) {
      if (!chip.ac || chip.mode === 2) return;
      const now = chip.ac.currentTime;
      if (now - lastGroan < 0.5) return;
      lastGroan = now;
      chip.burst({ dur, peak: level * 0.35, attack: 0.18, f0: 750, f1: 280, q: 2.2 });
      for (let i = 0; i < 5; i++) {
        chip.voice({ at: Math.random() * 0.12, dur: dur * (0.8 + Math.random() * 0.3), f0: 170 + Math.random() * 110, rise: 1.08, fall: 0.72, vol: level * 0.05, cutoff: 750 });
      }
    },
    murmurOn: null,
    /** The hum of a full arena, under everything while a game is on. */
    murmur(on) {
      const ac = chip.ac;
      if (!ac) return;
      const t = ac.currentTime;
      if (on && !crowd.murmurOn) {
        const src = chip.noise(t);
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
        src.connect(f).connect(g).connect(chip.sfxBus);
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

  return {
    sfx, crowd,
    play: chip.play, stop: chip.stop, pause: chip.pause, setTempo: chip.setTempo,
    get mode() { return chip.mode; },
    cycleMode: chip.cycleMode,
    /** Pulling the cartridge: silence everything this cartridge made. */
    dispose() {
      crowd.murmur(false);
      chip.dispose();
    },
  };
}
