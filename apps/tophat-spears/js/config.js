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

export const BASE = { mHp: 100, mDmg: 10, mFire: 0.38, mRange: 24, mAcc: 0.5, mSpeed: 5.2 };
export const SPRINT = 1.45;
export const BUGT = {
  ling: { hp: 30, speed: 6.6, dmg: 7, atk: 0.7, r: 0.55 },
  brute: { hp: 180, speed: 3.6, dmg: 22, atk: 1.1, r: 1.15 },
};
export const WAVES = 6;
export const MAXMAR = 16;
export const SQUADS = ['Alpha', 'Bravo', 'Charlie'];
export const MAX_SPEARS = 4;
export const RELAY_MAX = 1500;
export const SHOT_RANGE = 90;
// The steepest ground a Spear can walk up, as rise over run (about 42
// degrees). The ridge stays climbable; the wall at the map edge doesn't.
export const MAX_SLOPE = 0.9;
