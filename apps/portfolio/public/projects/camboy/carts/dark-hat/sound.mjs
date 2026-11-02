/**
 * Dark Hat: its songs and its spells, played on the Camboy's sound chip
 * (js/chip.mjs). Minor keys and a little creep for the inside of a hat.
 */

import { createChip } from "../../js/chip.mjs";

export const SONGS = {
  title: {
    bpm: 92,
    loop: true,
    chords: ["Am", "F", "Dm", "E", "Am", "F", "Dm", "E"],
    lead: [
      "E5 . . . A4 . C5 . B4 . . . A4 . . .",
      "F5 . . . E5 . C5 . A4 . . . . . . .",
      "D5 . . . F5 . A5 . G5 . F5 . E5 . D5 .",
      "E5 . . . G#4 . B4 . E5 . . . - - - -",
      "A5 . . . G5 . E5 . C5 . . . E5 . A5 .",
      "C6 . . . A5 . F5 . C5 . . . F5 . A5 .",
      "D6 . . . C6 . A5 . F5 . A5 . D5 . F5 .",
      "E5 . . . D5 . C5 . B4 . . . G#4 . . .",
    ],
    drums: ["k.......s.......", "k.......s.......", "k.......s.......", "k.......s...s.s."],
    bass: "hold",
    arp: true,
  },
  layer: {
    bpm: 116,
    loop: true,
    chords: ["Am", "Am", "F", "G", "Am", "Dm", "E", "E"],
    lead: [
      "A4 . A4 . C5 . A4 . E5 . D5 . C5 . B4 .",
      "A4 . A4 . C5 . A4 . F5 . E5 . D5 . C5 .",
      "F4 . . . A4 . C5 . F5 . . . E5 . C5 .",
      "G4 . . . B4 . D5 . G5 . . . F5 . D5 .",
      "E5 . . . A5 . . . G5 . E5 . C5 . . .",
      "D5 . . . F5 . A5 . D6 . . . C6 . A5 .",
      "B4 . . . E5 . G#5 . B5 . . . A5 . G#5 .",
      "E5 . . . . . . . - - E5 . G#4 . B4 .",
    ],
    drums: ["k...h.h.s...h.h.", "k...h.h.s...h.h.", "k...h.h.s...h.h.", "k...h.h.s.h.s.ss"],
    bass: "bounce",
    arp: true,
  },
  boss: {
    bpm: 150,
    loop: true,
    chords: ["Dm", "Dm", "Bb", "A", "Dm", "Gm", "A", "A"],
    lead: [
      "D5 . F5 . D5 . A5 . D5 . F5 . E5 . D5 .",
      "D5 . F5 . D5 . A5 . G5 . F5 . E5 . C#5 .",
      "A#4 . D5 . F5 . A#5 . . . A5 . F5 . D5 .",
      "A4 . C#5 . E5 . A5 . . . G5 . E5 . C#5 .",
      "D6 . . . A5 . F5 . D5 . F5 . A5 . D6 .",
      "D6 . . . A#5 . G5 . D5 . G5 . A#5 . D6 .",
      "C#6 . . . A5 . E5 . C#5 . E5 . A5 . C#6 .",
      "E6 . . . D6 . C#6 . A5 . . . - - - -",
    ],
    drums: ["k.hks.hkk.hks.hs", "k.hks.hkk.hks.hs", "k.hks.hkk.hks.hs", "k.hks.hkk.hssss"],
    bass: "bounce",
    arp: true,
  },
  malvado: {
    bpm: 164,
    loop: true,
    chords: ["Am", "F", "G", "E", "Am", "F", "E", "E"],
    lead: [
      "A5 . E5 . A5 . E5 . C6 . B5 . A5 . E5 .",
      "F5 . C5 . F5 . A5 . C6 . A5 . F5 . C5 .",
      "G5 . D5 . G5 . B5 . D6 . B5 . G5 . D5 .",
      "E5 . G#5 . B5 . E6 . . . D6 . B5 . G#5 .",
      "A5 . C6 . E6 . C6 . A5 . E5 . C5 . E5 .",
      "F5 . A5 . C6 . A5 . F5 . C5 . A4 . C5 .",
      "E5 . . . G#5 . . . B5 . . . E6 . . .",
      "E6 . D6 . C6 . B5 . A5 . G#5 . F5 . E5 .",
    ],
    drums: ["kkh.s.hkk.hks.ss", "kkh.s.hkk.hks.ss", "kkh.s.hkk.hks.ss", "kkh.s.hkkshssss"],
    bass: "bounce",
    arp: true,
  },
  escape: {
    bpm: 132,
    loop: false,
    chords: ["C", "G", "Am", "F", "C"],
    lead: [
      "C5 . E5 . G5 . C6 . . . G5 . E5 . G5 .",
      "D6 . . . B5 . G5 . D5 . G5 . B5 . D6 .",
      "E6 . . . C6 . A5 . E5 . A5 . C6 . E6 .",
      "D6 . . . C6 . A5 . F5 . A5 . C6 . A5 .",
      "C6 . . . . . . . . . . . - - - -",
    ],
    drums: ["k...s...k.k.s...", "k...s...k.k.s...", "k...s...k.k.s...", "k...s...k.k.s.ss", "k..............."],
    bass: "bounce",
    arp: true,
  },
  caught: {
    bpm: 80,
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

export function createSound(hw) {
  const chip = createChip(hw, SONGS, { modeKey: "darkhat.sound" });
  const { beep, burst, voice } = chip;
  const whoosh = (f0, f1, dur, peak) => burst({ dur, peak, attack: 0.01, f0, f1, q: 1.4 });

  const sfx = {
    card: () => { whoosh(2600, 1200, 0.07, 0.08); beep(1900, 0.03, { vol: 0.03 }); },
    hit: () => { burst({ dur: 0.08, peak: 0.2, attack: 0.003, f0: 900, type: "lowpass" }); beep(220, 0.06, { vol: 0.07, to: 120 }); },
    pop: () => { beep(700, 0.08, { type: "triangle", to: 1600, vol: 0.09 }); burst({ dur: 0.12, peak: 0.1, attack: 0.005, f0: 3000, q: 1 }); },
    hurt: () => beep(480, 0.25, { to: 140, vol: 0.09 }),
    spark: () => burst({ dur: 0.2, peak: 0.05, attack: 0.02, f0: 5000, f1: 2500, type: "highpass" }),
    blink: () => { beep(400, 0.18, { type: "triangle", to: 2100, vol: 0.08 }); [1568, 2093].forEach((f, i) => beep(f, 0.06, { type: "triangle", vol: 0.05, at: 0.12 + i * 0.05 })); },
    decoy: () => { beep(900, 0.06, { vol: 0.05 }); beep(600, 0.1, { vol: 0.05, at: 0.06 }); },
    tornado: () => burst({ dur: 0.6, peak: 0.12, attack: 0.08, f0: 600, f1: 2400, q: 2 }),
    storm: () => { whoosh(800, 3000, 0.3, 0.16); beep(1200, 0.12, { vol: 0.04, to: 2400 }); },
    block: () => beep(2400, 0.05, { type: "triangle", vol: 0.06 }),
    // Two rising-and-falling notes, the way a certain space pirate calls his arrow.
    whistle: () => {
      beep(900, 0.18, { type: "sine", to: 1500, vol: 0.1 });
      beep(1500, 0.22, { type: "sine", to: 1000, vol: 0.1, at: 0.19 });
    },
    wand: () => beep(1800, 0.05, { type: "triangle", vol: 0.04 }),
    hat: () => { for (let i = 0; i < 4; i++) beep(300 + i * 40, 0.05, { type: "triangle", vol: 0.05, at: i * 0.05 }); },
    whip: () => { burst({ dur: 0.05, peak: 0.3, attack: 0.002, f0: 4000, type: "highpass" }); beep(1300, 0.07, { to: 300, vol: 0.05 }); },
    doves: () => [2000, 2400, 2200].forEach((f, i) => beep(f, 0.05, { type: "triangle", to: f * 1.3, vol: 0.05, at: i * 0.06 })),
    door: () => { beep(140, 0.25, { vol: 0.12 }); burst({ dur: 0.3, peak: 0.2, attack: 0.005, f0: 400, type: "lowpass" }); },
    spirit: () => [659, 880, 1047, 1319, 1760].forEach((f, i) => beep(f, 0.25, { type: "triangle", vol: 0.05, at: i * 0.09 })),
    choose: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.1, { vol: 0.06, at: i * 0.08 })),
    sparkle: () => { beep(1760, 0.05, { type: "triangle", vol: 0.06 }); beep(2349, 0.07, { type: "triangle", vol: 0.06, at: 0.04 }); },
    heart: () => [784, 988, 1175].forEach((f, i) => beep(f, 0.08, { type: "triangle", vol: 0.08, at: i * 0.06 })),
    fountain: () => { for (let i = 0; i < 8; i++) beep(1200 + i * 150, 0.1, { type: "sine", vol: 0.04, at: i * 0.05 }); },
    heartbeat: () => { beep(70, 0.1, { type: "sine", vol: 0.25 }); beep(60, 0.12, { type: "sine", vol: 0.2, at: 0.16 }); },
    thump: () => { burst({ dur: 0.35, peak: 0.35, attack: 0.005, f0: 300, type: "lowpass" }); beep(90, 0.3, { type: "sine", to: 40, vol: 0.35 }); },
    shuffle: () => { for (let i = 0; i < 8; i++) burst({ at: i * 0.05, dur: 0.03, peak: 0.12, attack: 0.002, f0: 3000, q: 2 }); },
    roar: () => {
      voice({ at: 0, dur: 0.9, f0: 95, rise: 1.4, fall: 0.6, vol: 0.12, cutoff: 700 });
      burst({ dur: 0.8, peak: 0.1, attack: 0.1, f0: 500, f1: 150, q: 1 });
    },
    // Malvado's laugh: three falling "ha"s.
    laugh: () => {
      for (let i = 0; i < 3; i++) voice({ at: i * 0.2, dur: 0.17, f0: 260 - i * 25, rise: 1.15, fall: 0.8, vol: 0.12, cutoff: 1500 });
    },
    bolt: () => beep(1400, 0.15, { type: "sawtooth", to: 400, vol: 0.05 }),
    bossDown: () => {
      burst({ dur: 1.2, peak: 0.35, attack: 0.02, f0: 600, f1: 100, type: "lowpass" });
      [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.15, { vol: 0.07, at: 0.4 + i * 0.1 }));
    },
    ladder: () => { beep(1000, 0.04, { vol: 0.05 }); beep(800, 0.04, { vol: 0.05, at: 0.12 }); },
    blip: () => beep(880, 0.05, { vol: 0.05 }),
    type: () => beep(1300, 0.015, { vol: 0.02 }),
  };

  return {
    sfx,
    play: chip.play, stop: chip.stop, pause: chip.pause, setTempo: chip.setTempo,
    get mode() { return chip.mode; },
    cycleMode: chip.cycleMode,
    dispose: chip.dispose,
  };
}
