/**
 * Boulder Smash for the Camboy: the rules, with no canvas, timers or input.
 *
 * A side-scrolling smash-em-up. Boulder walks a city street left to right,
 * punches buildings down, bonks Dr. Fizzle's gang, frees trapped people,
 * and fights the city's boss in an arena at the end of the street. The
 * gate to the arena opens once enough of the city is smashed.
 *
 * Controls: left/right walk, UP jumps, A smashes, B grabs and throws.
 *   A on the ground .............. punch
 *   A while jumping up ........... LEAP: an uppercut that launches you higher
 *   DOWN + A in the air .......... SLAM: dive and shake the ground
 *   LEAP, then DOWN + A .......... SUPER SLAM: a much bigger quake
 */

export const W = 160;
export const H = 144;
export const GROUND = 120;          // feet rest here; the street runs below it
export const ARENA = 160;           // the boss arena is one screen wide

export const WALK = 54;             // pixels per second
export const CARRY_WALK = 40;
export const GRAVITY = 560;
export const JUMP_V = -215;         // about 41 px high
export const LEAP_V = -250;         // the uppercut launch
export const LEAP_WINDOW = 60;      // you can leap until you're nearly at the top
export const SLAM_V = 360;
export const PUNCH_TIME = 0.2;
export const PUNCH_COOLDOWN = 0.26;
export const PUNCH_REACH = 15;
export const GRAB_REACH = 14;
export const THROW_VX = 190;
export const THROW_VY = -150;
export const MAX_HP = 100;
export const HURT_TIME = 1.0;       // blinking and safe after a hit

export const SLAM_RADIUS = 28;
export const SUPER_RADIUS = 56;
export const GATE_SHARE = 0.6;      // smash this much of the city to open the arena

/* ---------- the cities ---------- */

export const CITIES = [
  {
    name: "PEBBLE STREET",
    tip: ["SMASH 60% OF THE CITY", "TO OPEN THE GATE!"],
    length: 640, seed: 11,
    enemies: { goon: 2 },
    rescues: [],
    boss: "grumble",
  },
  {
    name: "RUBBLE RIDGE",
    tip: ["PEOPLE ARE TRAPPED!", "PUNCH THE ROCKS APART."],
    length: 720, seed: 23,
    enemies: { goon: 2, zapper: 1 },
    rescues: ["rocks", "rocks"],
    boss: "rocko",
  },
  {
    name: "IRON YARD",
    tip: ["PUNCHES BOUNCE OFF STEEL.", "THROW THINGS AT IT! (B)"],
    length: 760, seed: 37,
    enemies: { goon: 2, zapper: 1, brute: 1 },
    rescues: ["steel", "rocks", "steel"],
    boss: "bruno",
  },
  {
    name: "CRYSTAL DOWNTOWN",
    tip: ["DR. FIZZLE'S ROBOTS FLY.", "LEAP UP TO REACH THEM!"],
    length: 800, seed: 53,
    enemies: { goon: 2, zapper: 1, brute: 1, robot: 2 },
    rescues: ["rocks", "steel", "steel"],
    boss: "fizzle",
  },
];

export const BOSSES = {
  grumble: { name: "GRUMBLE THE GIANT", hp: 10 },
  rocko: { name: "ROCKO THE ROLLER", hp: 9 },
  bruno: { name: "BRUNO THE BULLDOZER", hp: 10 },
  fizzle: { name: "DR. FIZZLE", hp: 12 },
};

/** Small seeded generator so a city is laid out the same every time. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Building hit points by height: taller takes more punches. */
export const buildingHp = (h) => (h < 44 ? 3 : h < 64 ? 5 : 7);

/**
 * Lay out a city's street: buildings with gaps between them, parked cars
 * in some gaps, and the trapped people spread along the way. The first
 * stretch is left clear so Boulder has room to walk in.
 */
export function layoutCity(index) {
  const city = CITIES[index];
  const rng = makeRng(city.seed);
  const buildings = [];
  const cars = [];
  const rescues = [];
  const slots = [];
  let x = 70;
  while (x < city.length - 40) {
    const w = 22 + Math.round(rng() * 18);
    const h = 30 + Math.round(rng() * (36 + index * 4));
    buildings.push({ x, w, h, hp: buildingHp(h), maxHp: buildingHp(h) });
    const gap = 26 + Math.round(rng() * 22);
    slots.push(x + w + Math.round(gap / 2));
    x += w + gap;
  }
  // Trapped people take evenly spread gaps; parked cars take some of the rest.
  const taken = new Set();
  city.rescues.forEach((kind, i) => {
    const k = Math.min(slots.length - 1, Math.round(((i + 1) * slots.length) / (city.rescues.length + 1)));
    taken.add(k);
    rescues.push({ kind, x: slots[k], hp: kind === "steel" ? 2 : 3, freed: false });
  });
  slots.forEach((sx, k) => { if (!taken.has(k) && rng() < 0.45) cars.push({ x: sx }); });
  return { buildings, cars, rescues, length: city.length };
}

export const smashedShare = (buildings) => buildings.filter((b) => b.hp <= 0).length / Math.max(1, buildings.length);
export const gateOpen = (buildings) => smashedShare(buildings) >= GATE_SHARE - 1e-9;

/* ---------- what the buttons do ---------- */

/**
 * Decide what a button press means right now.
 *   me:    { onGround, vy, leaped, holding, punchCd }
 *   input: { up, a, b } pressed this frame, plus down held
 * Returns "jump", "punch", "leap", "slam", "super", "grab", "throw" or null.
 */
export function chooseAction(me, input) {
  if (input.b) return me.holding ? "throw" : "grab";
  if (input.a) {
    if (me.holding) return "throw";
    if (me.onGround) return me.punchCd > 0 ? null : "punch";
    if (input.down) return me.leaped ? "super" : "slam";
    if (!me.leaped && me.vy < LEAP_WINDOW) return "leap";
    return me.punchCd > 0 ? null : "punch";
  }
  if (input.up && me.onGround) return "jump";
  return null;
}

/* ---------- who gets hurt by what ---------- */

/**
 * Damage from an attack. attack is "punch", "leap", "slam", "super",
 * "throw" or "batted" (one of Rocko's boulders punched back at him).
 *
 * Buildings and rock piles take everything. Steel only gives way to things
 * thrown at it. Grumble shrugs off punches; Rocko only feels his own
 * boulders, throws and quakes; Bruno is armored until he crashes into
 * something and gets dizzy; Dr. Fizzle flies, so only leaps and throws
 * reach him.
 */
export function damageTo(target, attack, { dizzy = false } = {}) {
  const base = { punch: 1, leap: 2, slam: 2, super: 4, throw: 3, batted: 3 }[attack] ?? 0;
  switch (target) {
    case "building": return base;
    case "rocks": return base;
    case "steel": return attack === "throw" ? 1 : 0;
    case "goon": case "zapper": case "robot": return base ? 1 : 0;
    case "brute": return base;
    case "grumble": return { throw: 3, super: 2, slam: 1 }[attack] ?? 0;
    case "rocko": return { batted: 3, throw: 2, super: 2, slam: 1 }[attack] ?? 0;
    case "bruno": return dizzy ? base : attack === "throw" ? 1 : 0;
    case "fizzle": return { leap: 2, throw: 2 }[attack] ?? 0;
    default: return 0;
  }
}

/** Quake reach: a slam shakes the ground nearby, a super slam half the screen. */
export const quakeRadius = (attack) => (attack === "super" ? SUPER_RADIUS : attack === "slam" ? SLAM_RADIUS : 0);

/** Robots fly; quakes on the ground can't touch them. */
export const flies = (kind) => kind === "robot" || kind === "fizzle";

/** Axis-aligned boxes: { x, y, w, h } with y at the top. */
export const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Win a city, unlock the next. */
export function unlockAfter(index, won, unlocked) {
  if (!won) return unlocked;
  return Math.max(unlocked, Math.min(CITIES.length, index + 2));
}

/**
 * Where a thrown thing lands on flat ground, from a throw at height h above
 * the street. Used to aim and to test that throws reach.
 */
export function throwRange(h = 22, vx = THROW_VX, vy = THROW_VY) {
  // h = vy t + g t^2 / 2  (positive down), solve for t > 0
  const t = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;
  return vx * t;
}

/** The highest point of a throw above the hands. */
export const throwPeak = (vy = THROW_VY) => (vy * vy) / (2 * GRAVITY);

/** How high a jump goes, and how much higher a leap from the jump's start takes you. */
export const jumpHeight = (v = JUMP_V) => (v * v) / (2 * GRAVITY);
