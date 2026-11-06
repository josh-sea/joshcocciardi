/* Every number the game runs on. Shared by the host's simulation, every
 * client's renderer and the Node tests, so nothing here touches the DOM.
 */

export const TILE = 32;          // px per map tile
export const TICK = 1 / 30;      // simulation step, seconds
export const SNAP_HZ = 10;       // host snapshots per second (online)
export const MAX_BODIES = 4;     // marines in a match, across every keyboard
export const PLAYER_R = 11;
export const PLAYER_SPEED = 170; // px/s
export const PLAYER_HP = 100;
export const RESPAWN_S = 5;
export const TEAM_LIVES = 6;     // shared per level

// Marine colours, by body index.
export const COLORS = ['#4fd1ff', '#ffb648', '#8dff6a', '#ff6ad5'];

/* Weapons. `rate` is shots a second, `ammo` what a pickup gives (the Pulse
 * never runs dry). Kinds: 'bolt' a fast projectile, 'pellet' a spread,
 * 'flame' a short-lived piercing puff, 'rail' an instant piercing line,
 * 'rocket' a projectile that bursts.
 */
export const WEAPONS = [
  { id: 'pulse',   name: 'Pulse Carbine', kind: 'bolt',   rate: 7,   dmg: 11, speed: 640, life: 0.9,  spread: 0.04, ammo: Infinity },
  { id: 'scatter', name: 'Scattergun',    kind: 'pellet', rate: 1.5, dmg: 9,  speed: 560, life: 0.45, spread: 0.32, pellets: 8, ammo: 36 },
  { id: 'flamer',  name: 'Torch',         kind: 'flame',  rate: 18,  dmg: 4,  speed: 330, life: 0.42, spread: 0.22, ammo: 260 },
  { id: 'rail',    name: 'Lance',         kind: 'rail',   rate: 0.9, dmg: 90, range: 900, ammo: 16 },
  { id: 'rocket',  name: 'Boomtube',      kind: 'rocket', rate: 1.1, dmg: 70, speed: 420, life: 2.2, splash: 78, ammo: 10 },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w, i) => [w.id, { ...w, index: i }]));

/* The swarm. `aggro` is how close (with a clear line) a sleeping one notices
 * you. Spitters stop at `keep` and lob acid. Nests don't move; they birth
 * crawlers while a marine is within `wake`.
 */
export const ENEMIES = {
  crawler: { r: 10, hp: 22,  speed: 150, dmg: 9,  hitCd: 0.6, score: 10,  aggro: 380 },
  brute:   { r: 17, hp: 150, speed: 72,  dmg: 22, hitCd: 0.9, score: 40,  aggro: 340 },
  spitter: { r: 12, hp: 42,  speed: 92,  dmg: 10, hitCd: 1.7, score: 25,  aggro: 420, keep: 230, acid: 300 },
  nest:    { r: 22, hp: 320, speed: 0,   dmg: 0,  hitCd: 3.2, score: 150, aggro: 0, wake: 560, brood: 7 },
  matriarch: { r: 38, hp: 3200, speed: 82, dmg: 30, hitCd: 1.1, score: 2000, aggro: 2000 },
};

export const PICKUPS = {
  scatter: { weapon: 'scatter' },
  flamer:  { weapon: 'flamer' },
  rail:    { weapon: 'rail' },
  rocket:  { weapon: 'rocket' },
  med:     { heal: 45 },
  ammo:    { refill: 0.5 }, // half a pickup's worth of every weapon you carry
};

/* The campaign. Sizes are in tiles. Each level is generated from a seed, so
 * every browser builds the same map from two numbers.
 */
export const LEVELS = [
  { name: 'Cargo Deck',    w: 46, h: 34, rooms: 9,  nests: 2, crowd: 3, hpMul: 1.0,  theme: 0, weapons: ['scatter'] },
  { name: 'Hydroponics',   w: 52, h: 38, rooms: 11, nests: 3, crowd: 4, hpMul: 1.1,  theme: 1, weapons: ['scatter', 'flamer'] },
  { name: 'Coolant Works', w: 56, h: 40, rooms: 12, nests: 4, crowd: 5, hpMul: 1.2,  theme: 2, weapons: ['flamer', 'rail'] },
  { name: 'Reactor Ring',  w: 60, h: 44, rooms: 14, nests: 5, crowd: 6, hpMul: 1.35, theme: 3, weapons: ['rail', 'rocket', 'scatter'] },
  { name: 'The Hive',      w: 64, h: 46, rooms: 15, nests: 6, crowd: 7, hpMul: 1.5,  theme: 4, weapons: ['rocket', 'flamer', 'rail'] },
  { name: 'Brood Chamber', w: 40, h: 40, boss: true, hpMul: 1.0, theme: 5, weapons: ['rocket', 'rail', 'scatter', 'flamer'] },
];

export const THEMES = [
  { floor: '#1b2129', grid: '#232b35', wall: '#3b4654', wallTop: '#566373', accent: '#4fd1ff' },
  { floor: '#16231a', grid: '#1e2e22', wall: '#2f4a35', wallTop: '#4d7354', accent: '#8dff6a' },
  { floor: '#141f28', grid: '#1b2a36', wall: '#2c4458', wallTop: '#47708f', accent: '#6ad1ff' },
  { floor: '#261a14', grid: '#33231b', wall: '#5a3a26', wallTop: '#8a5a37', accent: '#ffb648' },
  { floor: '#22141f', grid: '#2e1a29', wall: '#4b2442', wallTop: '#743868', accent: '#ff6ad5' },
  { floor: '#1d1014', grid: '#2a161c', wall: '#4d1f2a', wallTop: '#7a2e3f', accent: '#ff4d6a' },
];

export const DEFAULTS = { friendlyFire: false, startLevel: 0, swarm: 1 };

export function cleanConfig(c = {}) {
  const lvl = Math.floor(Number(c.startLevel));
  const swarm = Number(c.swarm);
  return {
    friendlyFire: c.friendlyFire === true,
    startLevel: Number.isFinite(lvl) ? Math.max(0, Math.min(LEVELS.length - 1, lvl)) : 0,
    swarm: Number.isFinite(swarm) ? Math.max(0.5, Math.min(2, Math.round(swarm * 4) / 4)) : 1,
  };
}
