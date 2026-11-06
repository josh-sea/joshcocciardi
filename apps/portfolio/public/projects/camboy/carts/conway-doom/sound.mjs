/**
 * Conway's DOOM: songs and sounds, played on the Camboy's sound chip
 * (js/chip.mjs). A cold, ticking minor key for a field that's alive.
 */

import { createChip } from "../../js/chip.mjs";

export const SONGS = {
  title: {
    bpm: 104,
    loop: true,
    chords: ["Em", "C", "D", "B", "Em", "C", "Am", "B"],
    lead: [
      "E5 . . . G5 . B5 . E5 . . . D5 . B4 .",
      "C5 . . . E5 . G5 . C6 . . . B5 . G5 .",
      "D5 . . . F#5 . A5 . D6 . . . C6 . A5 .",
      "B4 . . . D#5 . F#5 . B5 . . . - - - -",
      "E5 . G5 . B5 . E6 . . . D6 . B5 . G5 .",
      "C6 . . . B5 . G5 . E5 . G5 . C6 . . .",
      "A5 . . . C6 . E6 . D6 . C6 . A5 . . .",
      "B5 . . . A5 . F#5 . D#5 . . . B4 . . .",
    ],
    drums: ["k.......s.......", "k.......s.......", "k.......s.......", "k.......s...s.s."],
    bass: "hold",
    arp: true,
  },
  field: {
    bpm: 126,
    loop: true,
    chords: ["Em", "Em", "C", "D", "Em", "Am", "B", "B"],
    lead: [
      "E5 . B4 . E5 . G5 . F#5 . E5 . D5 . B4 .",
      "E5 . B4 . E5 . G5 . A5 . G5 . F#5 . D5 .",
      "C5 . . . E5 . G5 . C6 . . . B5 . G5 .",
      "D5 . . . F#5 . A5 . D6 . . . C6 . A5 .",
      "B5 . G5 . E5 . G5 . B5 . . . A5 . G5 .",
      "A5 . . . C6 . . . E6 . . . C6 . A5 .",
      "B5 . . . F#5 . D#5 . F#5 . B5 . A5 . F#5 .",
      "D#5 . . . F#5 . . . B5 . . . - - - -",
    ],
    drums: ["k...h.h.s...h.h.", "k...h.h.s...h.h.", "k...h.h.s...h.h.", "k...h.h.s.h.s.ss"],
    bass: "bounce",
    arp: true,
  },
  clear: {
    bpm: 140,
    loop: false,
    chords: ["G", "D", "Em", "C", "G"],
    lead: [
      "G5 . B5 . D6 . . . B5 . D6 . G5 . . .",
      "F#5 . A5 . D6 . . . A5 . D6 . F#5 . . .",
      "E5 . G5 . B5 . . . G5 . B5 . E6 . . .",
      "C6 . . . B5 . . . A5 . . . G5 . . .",
      "G5 . . . . . . . . . . . - - - -",
    ],
    drums: ["k...s...k.k.s...", "k...s...k.k.s...", "k...s...k.k.s...", "k...s...k.k.s.ss", "k..............."],
    bass: "bounce",
    arp: true,
  },
  over: {
    bpm: 76,
    loop: false,
    chords: ["Em", "B", "Em"],
    lead: [
      "B5 . . . A5 . . . G5 . . . F#5 . . .",
      "F#5 . . . E5 . . . D#5 . . . . . . .",
      "E5 . . . . . . . . . . . - - - -",
    ],
    drums: null,
    bass: "hold",
    arp: false,
  },
};

export function createSound(hw) {
  const chip = createChip(hw, SONGS, { modeKey: "conway.sound" });
  const { beep, burst } = chip;
  const sfx = {
    shot: () => { beep(1500, 0.06, { to: 600, vol: 0.06 }); burst({ dur: 0.04, peak: 0.08, attack: 0.002, f0: 3000, type: "highpass" }); },
    pop: () => { beep(500, 0.08, { type: "triangle", to: 1400, vol: 0.08 }); burst({ dur: 0.08, peak: 0.1, attack: 0.003, f0: 2200, q: 1 }); },
    thud: () => burst({ dur: 0.06, peak: 0.1, attack: 0.002, f0: 600, type: "lowpass" }),
    seed: () => { beep(660, 0.05, { type: "triangle", vol: 0.06 }); beep(990, 0.07, { type: "triangle", vol: 0.06, at: 0.05 }); },
    hurt: () => beep(420, 0.25, { to: 120, vol: 0.09 }),
    pickup: () => [880, 1175, 1568].forEach((f, i) => beep(f, 0.06, { type: "triangle", vol: 0.06, at: i * 0.05 })),
    tick: () => beep(2600, 0.012, { vol: 0.012 }),
    empty: () => beep(200, 0.05, { vol: 0.05 }),
    exit: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, { vol: 0.07, at: i * 0.08 })),
    blip: () => beep(880, 0.05, { vol: 0.05 }),
    type: () => beep(1300, 0.015, { vol: 0.02 }),
  };
  return {
    sfx,
    play: chip.play, stop: chip.stop, pause: chip.pause,
    get mode() { return chip.mode; },
    cycleMode: chip.cycleMode,
    dispose: chip.dispose,
  };
}
