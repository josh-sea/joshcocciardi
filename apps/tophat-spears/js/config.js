/* Tunables and fixed numbers for Tophat & Spears.
 *
 * `DEFAULTS` is what a new lobby starts with. The host can change these in
 * the lobby; once a match starts the host's copy is the one the simulation
 * uses, and everyone else reads it from the room so their HUD agrees.
 */

export const DEFAULTS = Object.freeze({
  heroHp: 0.20,     // Spear bonus max HP
  heroDmg: 0.15,    // Spear bonus damage
  hopCd: 20,        // s, cooldown after any hop or redeploy
  respawn: 8,       // s, minimum redeploy wait after death
  leashT: 15,       // s, time to reach an ordered zone
  leashR: 10,       // m, zone radius
  leashDrain: 8,    // HP/s while out of position after the deadline
  hopRange: 45,     // m
  swarm: 1,         // multiplier on every wave's size
});

export const TUNE = [
  ['heroHp', 'Spear bonus HP', 0, 0.6, 0.05, v => '+' + Math.round(v * 100) + '%'],
  ['heroDmg', 'Spear bonus damage', 0, 0.6, 0.05, v => '+' + Math.round(v * 100) + '%'],
  ['hopCd', 'Hop cooldown', 5, 45, 1, v => v + 's'],
  ['respawn', 'Minimum redeploy wait', 0, 30, 1, v => v + 's'],
  ['leashT', 'Leash: time to arrive', 5, 40, 1, v => v + 's'],
  ['leashR', 'Leash: zone radius', 4, 25, 1, v => v + 'm'],
  ['leashDrain', 'Leash: HP lost per second', 0, 30, 1, v => String(v)],
  ['hopRange', 'Hop range', 15, 90, 5, v => v + 'm'],
  ['swarm', 'Swarm size', 0.5, 1.5, 0.05, v => Math.round(v * 100) + '%'],
];

// Anything a client sends is clamped to the slider range before use.
export function cleanConfig(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, , mn, mx] of TUNE) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) out[k] = Math.max(mn, Math.min(mx, v));
  }
  return out;
}

/* Soldier types. `w` is the weapon: `n` shots per burst, `gap` seconds
 * between shots in a burst, `pause` after the burst. A Marine's rifle goes
 * brrt-brrt-brrt in fours, forever; the Shade takes one heavy shot and waits.
 * `range` is how far the AI engages; `reach` is how far a Spear's shot flies.
 * `eye` is the first-person camera height.
 */
export const MTYPES = {
  marine: { label: 'Marine', hp: 100, speed: 5.2, r: 0.45, range: 24, eye: 1.62, stim: true,
    w: { kind: 'rifle', n: 4, gap: 0.08, pause: 0.45, dmg: 4, acc: 0.55, reach: 90 } },
  torch: { label: 'Torch', hp: 130, speed: 5.0, r: 0.5, range: 6.5, eye: 1.62, stim: true,
    w: { kind: 'flame', n: 1, gap: 0, pause: 0.4, dmg: 9, acc: 1, reach: 7.5, cone: 0.45 } },
  shade: { label: 'Shade', hp: 70, speed: 5.4, r: 0.42, range: 40, eye: 1.62, stim: false, detect: true,
    w: { kind: 'snipe', n: 1, gap: 0, pause: 1.6, dmg: 45, acc: 0.85, reach: 140 } },
  strider: { label: 'Strider', hp: 320, speed: 4.0, r: 0.95, range: 28, eye: 2.8, stim: false,
    w: { kind: 'cannon', n: 2, gap: 0.12, pause: 0.4, dmg: 9, acc: 0.6, reach: 90 } },
};
export const MTYPE_LIST = ['marine', 'torch', 'shade', 'strider'];
export const mtype = t => MTYPES[t] || MTYPES.marine;

// Stim: trade a little health for a burst of speed. Marines and Torches only.
export const STIM = { hp: 10, dur: 8, rate: 1.5, speed: 1.4 };

// Shot kinds on the wire, for the tracer each one draws.
export const SHOT = { rifle: 0, flame: 2, snipe: 3, spine: 4, lurk: 5, cannon: 6 };

export const SPRINT = 1.45;
export const BUGT = {
  ling: { label: 'Ling', hp: 35, speed: 7.2, dmg: 8, atk: 0.7, r: 0.55 },
  brute: { label: 'Brute', hp: 220, speed: 3.8, dmg: 26, atk: 1.1, r: 1.15 },
  // Ranged: stops at `range` and spits acid spines.
  spitter: { label: 'Spitter', hp: 90, speed: 4.6, dmg: 10, atk: 0.9, r: 0.6, range: 14, acc: 0.7 },
  // Digs in at `range`, then sends a line of spikes through everything in front of it.
  burrower: { label: 'Burrower', hp: 200, speed: 4.0, dmg: 22, atk: 1.8, r: 0.9, range: 15, width: 1.1 },
};
export const BTYPE_LIST = ['ling', 'brute', 'spitter', 'burrower'];
export const WAVES = 10;
export const MAXMAR = 16;
export const SQUADS = ['Alpha', 'Bravo', 'Charlie'];
export const MAX_SPEARS = 4;
export const RELAY_MAX = 1500;
// The steepest ground a Spear can walk up, as rise over run (about 42
// degrees). The ridge stays climbable; the wall at the map edge doesn't.
export const MAX_SLOPE = 0.9;
