/* Crowd Cannon: the pure rules. No DOM, no three.js, so node can test them.
 *
 * World layout: the track runs along z. The cannon sits at z = 0 and fires
 * toward negative z. The enemy fort is at z = -level.length. x runs across
 * the track, from -HALF_W to +HALF_W.
 */

export const HALF_W = 5;          // half the track width
export const FORT_LINE = 1.2;     // an enemy past this z has reached your fort
export const MAX_GATES = 32;      // gate hits are tracked in a 32-bit mask

/* Small seeded random so a level always plays the same. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* How many new units a gate makes when one unit runs through it. */
export function gateClones(gate) {
  if (gate.kind === 'mul') return Math.max(0, gate.value - 1);
  return Math.max(0, gate.value);
}

export function gateLabel(gate) {
  return gate.kind === 'mul' ? `×${gate.value}` : `+${gate.value}`;
}

/* x position of a gate's centre at time t (seconds). Moving gates sweep
 * side to side but never leave the track. */
export function gateX(gate, t) {
  if (!gate.sweep) return gate.x;
  const room = HALF_W - gate.w / 2 - 0.2;
  const amp = Math.min(gate.sweep, room);
  return clamp(gate.x + Math.sin(t * gate.speed + gate.phase) * amp, -room, room);
}

/* Does a unit that moved from z0 to z1 at x cross this gate? */
export function crossesGate(gate, t, x, z0, z1) {
  if (!(z0 > gate.z && z1 <= gate.z)) return false;
  const gx = gateX(gate, t);
  return Math.abs(x - gx) <= gate.w / 2;
}

/* Spinner hazard: a bar of length `len` turning around (x, z). */
export function spinnerAngle(h, t) {
  return h.phase + t * h.speed;
}

export function hitsSpinner(h, t, x, z, r = 0.3) {
  const a = spinnerAngle(h, t);
  const dx = Math.cos(a), dz = Math.sin(a);
  const px = x - h.x, pz = z - h.z;
  const along = clamp(px * dx + pz * dz, -h.len / 2, h.len / 2);
  const ex = px - along * dx, ez = pz - along * dz;
  return ex * ex + ez * ez <= (h.thick / 2 + r) ** 2;
}

/* Build level n (1-based). Everything about a level comes from here.
 * Every fifth level is a boss level: a tougher fort and more ogres. */
export function makeLevel(n) {
  n = Math.max(1, Math.floor(n));
  const r = rng(n * 7919 + 101);
  const tier = Math.min(n, 16);
  const boss = n % 5 === 0;
  const length = 48 + Math.min(n, 14) * 1.6;

  const fortHp = Math.round(300 * Math.pow(1.21, n - 1) * (boss ? 1.5 : 1));
  const level = {
    n,
    boss,
    length,
    fortHp,                                   // enemy fort
    homeHp: 20,                               // your wall, before upgrades
    enemy: {
      rate: 4.5 + tier * 0.9,                 // enemies a second, steady
      burstEvery: Math.max(3.5, 7.5 - tier * 0.3),
      burst: 18 + Math.floor(tier * 3.5),       // a packed rush out of the gate
      bruteEvery: n >= 2 ? Math.max(3, 12 - tier * 0.7) : 0,
      bruteHp: 14 + n * 5,
      ogreEvery: n >= 3 ? Math.max(8, (boss ? 14 : 24) - tier) : 0,
      ogreHp: Math.round((40 + n * 14) * (boss ? 1.6 : 1)),
      speed: 3.5 + tier * 0.08,
      delay: 2.2,                             // a moment before they start
    },
    gates: [],
    spinners: [],
    barriers: [],
    reward: Math.round((80 + n * 40) * (boss ? 2 : 1)),
    theme: n % 3,
  };

  // Gate rows, spaced up the track. The first row is always generous.
  const first = -9;
  const last = -length + 12;
  const rows = clamp(2 + Math.floor(n / 4), 2, 5);
  const step = (first - last) / Math.max(1, rows - 1);
  for (let i = 0; i < rows; i++) {
    const z = Math.round((first - i * step) * 10) / 10;
    const two = i > 0 && r() < 0.45;
    if (two) {
      // A choice: left or right, usually one add and one multiply.
      const w = 3.4;
      const a = makeGate(r, n, z, -2.3, w, i);
      const b = makeGate(r, n, z, 2.3, w, i);
      if (a.kind === b.kind) b.kind = a.kind === 'mul' ? 'add' : 'mul', b.value = gateValue(r, n, b.kind);
      level.gates.push(a, b);
    } else {
      const w = i === 0 ? 4.6 : 3.6 + r() * 0.8;
      const x = i === 0 ? 0 : (r() * 2 - 1) * (HALF_W - w / 2 - 0.4);
      const g = makeGate(r, n, z, x, w, i);
      if (i === 0) { g.kind = 'mul'; g.value = 2; g.sweep = 0; }
      if (n >= 2 && i > 0 && r() < 0.35 + n * 0.03) {
        g.sweep = 1.5 + r() * 2.5;
        g.speed = 0.6 + r() * 0.6;
        g.phase = r() * Math.PI * 2;
      }
      level.gates.push(g);
    }
  }

  // Between gate rows: a barricade with a big bonus gate behind it (from
  // level 2), or a spinner (from level 4). They alternate, barricade first.
  const slots = rows - 1;
  let spinnersLeft = n >= 4 ? clamp(Math.floor((n - 2) / 2), 1, 3) : 0;
  for (let k = 0; k < slots; k++) {
    const z = first - step * (k + 0.5);
    const wantBarrier = n >= 2 && (k % 2 === 0 || spinnersLeft === 0);
    if (wantBarrier) {
      const side = r() < 0.5 ? -1 : 1;
      const w = 4.2;
      const x = side * (HALF_W - w / 2 - 0.1);
      level.barriers.push({ x, z: Math.round((z + 1.3) * 10) / 10, w, hp: barrierHp(n) });
      const mul = r() < 0.5;
      level.gates.push({
        kind: mul ? 'mul' : 'add',
        value: mul ? pick(r, n < 6 ? [3, 4] : [4, 5]) : pick(r, n < 6 ? [8, 10] : [12, 15, 20]),
        x, z: Math.round((z - 1.3) * 10) / 10, w: 3.6,
        sweep: 0, speed: 0, phase: 0, row: -1, bonus: true,
      });
    } else if (spinnersLeft > 0) {
      spinnersLeft--;
      level.spinners.push({
        x: (r() * 2 - 1) * 2,
        z,
        len: 4 + r() * 1.5,
        thick: 0.35,
        speed: (r() < 0.5 ? -1 : 1) * (1.4 + r() * 0.8 + n * 0.05),
        phase: r() * Math.PI,
      });
    }
  }

  level.gates = level.gates.slice(0, MAX_GATES);
  return level;
}

/* Hit points of a barricade on level n. */
export function barrierHp(n) {
  return Math.round(40 * Math.pow(1.24, n - 1));
}

/* What a unit does to a barricade it runs into (it does not survive). */
export function barrierDamage(kind, hp, stats) {
  if (kind === 'bomber') return stats.bomberHit;
  if (kind === 'runner') return 1;
  return Math.max(1, hp);          // bruisers and champions spend all they have
}

/* What a unit does to the enemy fort when it gets there. */
export function fortDamage(kind, stats) {
  return { runner: 1, bruiser: 3, bomber: 6, champ: stats.champHit }[kind] || 1;
}

/* What an enemy does to your wall when it gets there. */
export const WALL_DAMAGE = { grunt: 1, brute: 3, ogre: 8 };

function gateValue(r, n, kind) {
  if (kind === 'mul') return n < 6 ? pick(r, [2, 2, 3]) : pick(r, [2, 3, 3, 4]);
  return pick(r, n < 4 ? [2, 3, 4] : [3, 4, 5, 6]);
}

function makeGate(r, n, z, x, w, row) {
  const kind = r() < 0.55 ? 'mul' : 'add';
  return { kind, value: gateValue(r, n, kind), x, z, w, sweep: 0, speed: 0, phase: 0, row };
}

/* ---- Upgrades and saved progress -------------------------------------- */

// group: 'cannon' upgrades the gun and your wall, 'squad' the special units.
// unlock: level 0 means the unit is not in your squad yet.
export const UPGRADES = {
  rate:    { group: 'cannon', name: 'Fire rate',    blurb: 'More shots a second',            base: 40,  max: 12 },
  double:  { group: 'cannon', name: 'Double shot',  blurb: 'Chance a shot fires two',        base: 60,  max: 10 },
  charge:  { group: 'cannon', name: 'Charge speed', blurb: 'Champion comes sooner',          base: 50,  max: 10 },
  wall:    { group: 'cannon', name: 'Thick wall',   blurb: 'Your wall takes more hits',      base: 45,  max: 10 },
  start:   { group: 'cannon', name: 'Head start',   blurb: 'Runners ready when you begin',   base: 70,  max: 8 },
  champ:   { group: 'squad',  name: 'Champion',     blurb: 'Tougher, hits the fort harder',  base: 60,  max: 10 },
  bruiser: { group: 'squad',  name: 'Bruisers',     blurb: 'Big white runners that take hits', base: 150, max: 8, unlock: true },
  bomber:  { group: 'squad',  name: 'Bombers',      blurb: 'Blow up a whole pack of red',    base: 220, max: 8, unlock: true },
};

export function upgradeCost(key, level) {
  return Math.round(UPGRADES[key].base * Math.pow(1.55, level));
}

export function stats(up = {}) {
  const g = (k) => up[k] || 0;
  const bru = g('bruiser'), bom = g('bomber');
  return {
    shotsPerSec: 5 + g('rate') * 0.75,
    doubleChance: g('double') * 0.07,
    chargeShots: Math.max(12, 36 - g('charge') * 2.4),   // shots to fill the meter
    homeBonus: g('wall') * 5,
    startSquad: g('start') * 6,
    champHp: 25 + g('champ') * 10,
    champHit: 12 + g('champ') * 5,                        // fort damage on arrival
    bruiserEvery: bru ? Math.max(3, 9 - bru) : 0,         // every Nth shot
    bruiserHp: 4 + Math.floor(bru / 2),
    bomberEvery: bom ? Math.max(5, 14 - bom) : 0,
    bomberRadius: 1.8 + bom * 0.12,
    bomberDmg: 4 + bom,
    bomberHit: 8 + bom * 2,                               // barricade damage
  };
}

/* Which unit the cannon fires on shot number `shot` (1-based). */
export function shotKind(shot, st) {
  if (st.bomberEvery && shot % st.bomberEvery === 0) return 'bomber';
  if (st.bruiserEvery && shot % st.bruiserEvery === 0) return 'bruiser';
  return 'runner';
}

export function newSave() {
  return { level: 1, coins: 0, up: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])), best: 1, sound: true };
}

export function cleanSave(s) {
  const d = newSave();
  if (!s || typeof s !== 'object') return d;
  const int = (v, lo, hi, def) => (Number.isFinite(v) ? clamp(Math.floor(v), lo, hi) : def);
  const up = s.up && typeof s.up === 'object' ? s.up : {};
  return {
    level: int(s.level, 1, 9999, 1),
    coins: int(s.coins, 0, 1e9, 0),
    best: int(s.best, 1, 9999, 1),
    sound: s.sound !== false,
    up: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, int(up[k], 0, UPGRADES[k].max, 0)])),
  };
}

export function buy(save, key) {
  const lvl = save.up[key] || 0;
  if (lvl >= UPGRADES[key].max) return { ok: false, why: 'max' };
  const cost = upgradeCost(key, lvl);
  if (save.coins < cost) return { ok: false, why: 'coins' };
  return { ok: true, save: { ...save, coins: save.coins - cost, up: { ...save.up, [key]: lvl + 1 } } };
}

/* Coins for a win: the level's reward plus a bonus for an unhurt wall. */
export function winCoins(level, homeLeft, homeMax = level.homeHp) {
  return level.reward + Math.round((Math.min(homeLeft, homeMax) / homeMax) * level.reward * 0.5);
}

/* Coins for a loss: a share of the reward for the damage you did. */
export function loseCoins(level, fortLeft) {
  const done = 1 - Math.max(0, Math.min(level.fortHp, fortLeft)) / level.fortHp;
  return Math.round(level.reward * 0.35 * done);
}
