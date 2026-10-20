/**
 * Boulder Smash: its songs and its crunches, played on the Camboy's sound
 * chip (js/chip.mjs).
 */

import { createChip } from "../../js/chip.mjs";

export const SONGS = {
  title: {
    bpm: 120,
    loop: true,
    chords: ["D", "Bm", "G", "A", "D", "Bm", "G", "A"],
    lead: [
      "D5 . . . A4 . D5 . F#5 . . . E5 . D5 .",
      "F#5 . . . D5 . B4 . D5 . F#5 . B5 . A5 .",
      "G5 . . . B4 . D5 . G5 . . . F#5 . E5 .",
      "E5 . . . C#5 . E5 . A5 . . . G5 . F#5 E5",
      "D5 . F#5 . A5 . D6 . . . C#6 . B5 . A5 .",
      "B5 . . . F#5 . D5 . F#5 . B5 . D6 . . .",
      "D6 . . . B5 . G5 . B5 . D6 . B5 . . .",
      "E6 . . . C#6 . A5 . . . - - A5 . . .",
    ],
    drums: ["k...h.k.s...h...", "k...h.k.s...h...", "k...h.k.s...h...", "k...h.k.s.s.s.ss"],
    bass: "bounce",
    arp: true,
  },
  city: {
    bpm: 140,
    loop: true,
    chords: ["Dm", "Bb", "C", "Dm", "Dm", "Bb", "C", "A"],
    lead: [
      "D5 . . F5 . . A5 . G5 . F5 . E5 . D5 .",
      "D5 . . . A#4 . . . F5 . . . D5 . A#4 .",
      "C5 . . E5 . . G5 . A5 . G5 . E5 . C5 .",
      "D5 . . . . . A4 . D5 . F5 . A5 . . .",
      "A5 . . . G5 . F5 . E5 . F5 . G5 . A5 .",
      "A#5 . . . A5 . G5 . F5 . . . D5 . F5 .",
      "G5 . . . E5 . C5 . E5 . G5 . C6 . . .",
      "C#6 . . . A5 . E5 . C#5 . E5 . A5 . . .",
    ],
    drums: ["k.h.s.h.k.k.s.hh", "k.h.s.h.k.k.s.hh", "k.h.s.h.k.k.s.hh", "k.h.s.h.k.k.ssss"],
    bass: "bounce",
    arp: true,
  },
  boss: {
    bpm: 156,
    loop: true,
    chords: ["Am", "Am", "F", "E", "Am", "Dm", "E", "E"],
    lead: [
      "A4 . C5 . A4 . E5 . A4 . F5 . E5 . C5 .",
      "A4 . C5 . A4 . E5 . D5 . C5 . B4 . C5 .",
      "F4 . A4 . F4 . C5 . F4 . D5 . C5 . A4 .",
      "E5 . . . G#4 . B4 . E5 . . . D5 . B4 .",
      "A5 . . . E5 . A5 . C6 . . . B5 . A5 .",
      "D6 . . . A5 . F5 . D5 . F5 . A5 . D6 .",
      "B5 . . . G#5 . E5 . B4 . E5 . G#5 . B5 .",
      "E6 . . . D6 . C6 . B5 . A5 . G#5 . - -",
    ],
    drums: ["k.hks.hkk.hks.hs", "k.hks.hkk.hks.hs", "k.hks.hkk.hks.hs", "k.hks.hkk.hssss"],
    bass: "bounce",
    arp: true,
  },
  win: {
    bpm: 150,
    loop: false,
    chords: ["D", "A", "D"],
    lead: [
      "D5 . F#5 . A5 . D6 . . . A5 . D6 . . .",
      "E6 . . . C#6 . . . A5 . B5 . C#6 . . .",
      "D6 . . . . . . . . . . . - - - -",
    ],
    drums: ["k...s...k.k.s...", "k...s...k.k.s.ss", "k..............."],
    bass: "bounce",
    arp: true,
  },
  lose: {
    bpm: 84,
    loop: false,
    chords: ["Dm", "A", "Dm"],
    lead: [
      "A4 . . . G#4 . . . G4 . . . F#4 . . .",
      "F4 . . . E4 . . . C#5 . . . . . . .",
      "D5 . . . . . . . . . . . - - - -",
    ],
    drums: null,
    bass: "hold",
    arp: false,
  },
};

export function createSound(hw) {
  const chip = createChip(hw, SONGS, { modeKey: "boulder.sound" });
  const { beep, burst, voice } = chip;
  const thud = (f0, dur, peak) => burst({ dur, peak, attack: 0.004, f0, type: "lowpass", q: 0.7 });

  const sfx = {
    punch: () => { thud(400, 0.09, 0.3); beep(140, 0.06, { vol: 0.08, to: 70 }); },
    whiff: () => burst({ dur: 0.08, peak: 0.06, attack: 0.01, f0: 1800, f1: 900, q: 1.2 }),
    hit: () => { thud(700, 0.12, 0.35); beep(95, 0.1, { vol: 0.12, to: 55 }); },
    crumble: () => {
      burst({ dur: 0.9, peak: 0.4, attack: 0.02, f0: 500, f1: 90, type: "lowpass" });
      for (let i = 0; i < 5; i++) burst({ at: 0.1 + i * 0.12, dur: 0.12, peak: 0.18, attack: 0.005, f0: 300 + Math.random() * 500, q: 1 });
    },
    jump: () => beep(260, 0.13, { to: 620, vol: 0.06 }),
    leap: () => { beep(360, 0.2, { to: 1300, vol: 0.07 }); burst({ dur: 0.25, peak: 0.12, attack: 0.02, f0: 600, f1: 2400, q: 1.5 }); },
    dive: () => beep(900, 0.2, { to: 200, vol: 0.06 }),
    slam: () => { beep(130, 0.35, { type: "sine", to: 38, vol: 0.45 }); thud(320, 0.5, 0.45); },
    super: () => {
      beep(110, 0.6, { type: "sine", to: 30, vol: 0.55 });
      thud(260, 1.2, 0.55);
      burst({ at: 0.15, dur: 1.4, peak: 0.25, attack: 0.1, f0: 160, type: "lowpass" });
      [523, 659, 784].forEach((f, i) => beep(f, 0.12, { vol: 0.05, at: 0.25 + i * 0.07 }));
    },
    grab: () => { beep(500, 0.05, { vol: 0.05 }); beep(800, 0.06, { vol: 0.05, at: 0.05 }); },
    nothing: () => beep(200, 0.06, { vol: 0.04 }),
    throw: () => burst({ dur: 0.28, peak: 0.16, attack: 0.03, f0: 500, f1: 2200, q: 1.4 }),
    bonk: () => { beep(500, 0.12, { type: "triangle", to: 1500, vol: 0.12 }); beep(1500, 0.18, { type: "triangle", to: 500, vol: 0.08, at: 0.12 }); },
    hurt: () => beep(420, 0.22, { to: 140, vol: 0.09 }),
    zap: () => beep(1900, 0.13, { type: "sawtooth", to: 500, vol: 0.05 }),
    clang: () => { beep(1400, 0.22, { vol: 0.07 }); beep(2093, 0.18, { vol: 0.05 }); burst({ dur: 0.15, peak: 0.1, attack: 0.003, f0: 5000, type: "highpass" }); },
    shrug: () => { beep(300, 0.08, { vol: 0.05 }); beep(240, 0.1, { vol: 0.05, at: 0.08 }); },
    rescue: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.1, { vol: 0.07, at: i * 0.07 })),
    crystal: () => { beep(1568, 0.08, { type: "triangle", vol: 0.12 }); beep(2093, 0.14, { type: "triangle", vol: 0.12, at: 0.07 }); },
    gate: () => { [392, 523, 659, 784].forEach((f, i) => beep(f, 0.1, { vol: 0.06, at: i * 0.08 })); },
    roar: () => {
      voice({ at: 0, dur: 1.1, f0: 85, rise: 1.4, fall: 0.6, vol: 0.14, cutoff: 650 });
      voice({ at: 0.05, dur: 1.0, f0: 120, rise: 1.3, fall: 0.6, vol: 0.08, cutoff: 900 });
      burst({ dur: 1.0, peak: 0.12, attack: 0.15, f0: 400, f1: 150, q: 1 });
    },
    roll: () => beep(90, 0.25, { type: "triangle", to: 60, vol: 0.12 }),
    rev: () => { beep(55, 0.8, { type: "sawtooth", to: 130, vol: 0.07 }); },
    crash: () => { thud(500, 0.6, 0.5); beep(1200, 0.25, { vol: 0.06 }); beep(80, 0.5, { type: "sine", to: 35, vol: 0.4 }); },
    dizzy: () => [1200, 900, 1200, 900].forEach((f, i) => beep(f, 0.07, { type: "triangle", vol: 0.05, at: i * 0.08 })),
    bomb: () => beep(1400, 0.4, { type: "sine", to: 300, vol: 0.05 }),
    boom: () => { thud(400, 0.5, 0.45); beep(70, 0.4, { type: "sine", to: 30, vol: 0.35 }); },
    blip: () => beep(880, 0.05, { vol: 0.05 }),
    bossDown: () => {
      for (let i = 0; i < 4; i++) { thud(450, 0.4, 0.4); }
      [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, { vol: 0.07, at: 0.4 + i * 0.1 }));
    },
  };

  return {
    sfx,
    play: chip.play, stop: chip.stop, pause: chip.pause, setTempo: chip.setTempo,
    get mode() { return chip.mode; },
    cycleMode: chip.cycleMode,
    dispose: chip.dispose,
  };
}
