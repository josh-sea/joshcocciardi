/**
 * Sweat Boy: the game rules, with no canvas, timers or input.
 *
 * The screen is 160x144. The court is the half nearest the hoop: midcourt
 * on the left edge, the hoop on the right. Players leave through midcourt
 * after a scrum and come back through it as one front, so the puddles
 * nearest midcourt are the ones they reach first.
 *
 * A game is eight trips. Win it and the next venue unlocks; each venue
 * brings more sweat, less time and a better away team.
 */

export const W = 160;
export const H = 144;
export const COURT = { x0: 8, x1: 152, y0: 16, y1: 130 };
export const HOOP = { x: 146, y: 73 };
export const TRIPS = 8;

export const SWIPE = 0.34;           // one back-and-forth with the mop
export const WALK = 44, HUSTLE = 70; // pixels per second
export const GAS = 1.5;              // seconds of hustle in a full tank
export const BENCH = { x: 80, y: COURT.y1 - 1 };
export const LEAVE_TIME = 1.4;       // the players clearing out, mop already allowed
export const WAVE_START = COURT.x0 - 10;
export const WAVE_END = HOOP.x - 4;

export const LEVELS = [
  { name: "REC CENTER" },
  { name: "HIGH SCHOOL" },
  { name: "COLLEGE GYM" },
  { name: "PRO ARENA" },
  { name: "THE FINALS" },
];

/** Small seeded generator so a trip can be replayed in tests. */
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

const clampLevel = (l) => Math.max(0, Math.min(LEVELS.length - 1, l | 0));

/**
 * What a trip throws at you. The first trip at the Rec Center is a few
 * single drops; trips and venues both build from there.
 */
/** How much harder each venue plays. Hand-tuned against the bot mopper below. */
export const DIFFICULTY = [0, 1.2, 2, 2.6, 3.1];

export function tripSpec(trip, level = 0) {
  const t = Math.max(0, Math.min(TRIPS - 1, trip));
  const l = DIFFICULTY[clampLevel(level)];
  return {
    count: Math.min(12, 3 + Math.floor(t * 0.75 + l)),
    maxUnits: Math.min(4, 1 + Math.floor((t + l * 1.5) / 2)),
    baseTime: Math.round((4.4 - 0.55 * l) * 100) / 100,
    perUnit: 0.62 - 0.02 * t - 0.045 * l,
    waveSpeed: 28 + 3 * t + 4 * l,
  };
}

/** Half-width of a puddle on screen. Bigger puddles hold more sweat. */
export const puddleRadius = (units) => [0, 4, 5, 7, 8][Math.max(0, Math.min(4, units))];

/** Puddles are drawn as flat ellipses, a little wider than tall. */
export const puddleShape = (units) => {
  const r = puddleRadius(units);
  return { rx: r + 1, ry: Math.max(2, Math.round(r * 0.6)) };
};

/**
 * Lay out a trip's sweat. The big puddles land where the scrum was, around
 * the key; the single drops trail back toward midcourt where the players
 * ran off.
 */
export function spawnPuddles(trip, rng, level = 0) {
  const spec = tripSpec(trip, level);
  const big = spec.maxUnits > 1 ? Math.max(1, Math.floor(spec.count * 0.4)) : 0;
  const puddles = [];
  for (let k = 0; k < spec.count; k++) {
    const units = k < big ? 2 + Math.floor(rng() * (spec.maxUnits - 1)) : 1;
    const r = puddleRadius(units);
    const [xa, xb] = k < big ? [104, 136] : [20, 134];
    for (let tries = 0; tries < 300; tries++) {
      const x = Math.round(xa + rng() * (xb - xa));
      const y = Math.round(COURT.y0 + 12 + r + rng() * (COURT.y1 - COURT.y0 - 24 - 2 * r));
      const clear = puddles.every((p) => Math.hypot(p.x - x, p.y - y) >= puddleRadius(p.max) + r + 5);
      if (clear) {
        puddles.push({ x, y, units, max: units, locked: false });
        break;
      }
    }
  }
  return puddles;
}

export const wetUnits = (puddles) => puddles.reduce((n, p) => n + (p.locked ? 0 : p.units), 0);

/** Seconds on the clock before the players come back through midcourt. */
export function mopTime(trip, puddles, level = 0) {
  const spec = tripSpec(trip, level);
  return Math.round((spec.baseTime + wetUnits(puddles) * spec.perUnit) * 10) / 10;
}

/**
 * Which puddle the mop head is over, or -1. The head counts as touching a
 * puddle when it lands inside the ellipse grown by a few pixels, so the
 * player does not have to stand dead center.
 */
export function puddleUnder(puddles, x, y, slack = 3) {
  let best = -1;
  let bestD = Infinity;
  puddles.forEach((p, i) => {
    if (p.locked || p.units <= 0) return;
    const { rx, ry } = puddleShape(p.units);
    const d = ((x - p.x) / (rx + slack)) ** 2 + ((y - p.y) / (ry + slack)) ** 2;
    if (d <= 1 && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/**
 * One back-and-forth swipe takes units off the puddle (one, or two with
 * the Jumbo Mop). Returns true when it is dry.
 */
export function swipe(puddle, units = 1) {
  if (!puddle || puddle.locked || puddle.units <= 0) return false;
  puddle.units = Math.max(0, puddle.units - units);
  return puddle.units === 0;
}

/**
 * Move the returning players' front to waveX. Any puddle the front has
 * reached that still holds sweat is a slip and stays on the floor. Returns
 * the puddles newly slipped on.
 */
export function sweep(puddles, waveX) {
  const hit = [];
  for (const p of puddles) {
    if (p.locked || p.units <= 0) continue;
    if (waveX >= p.x - puddleShape(p.units).rx) {
      p.locked = true;
      hit.push(p);
    }
  }
  return hit;
}

export const slippedUnits = (puddles) => puddles.reduce((n, p) => n + (p.locked ? p.units : 0), 0);

/** A spotless floor gets a three. Every slipped unit costs the shooter. */
export function shotFor(slipped) {
  if (slipped <= 0) return { points: 3, chance: 0.9 };
  return { points: 2, chance: Math.max(0.1, 0.82 - 0.16 * slipped) };
}

/** The other team scores at the far end while you mop, and better teams score more. */
export function awayPoints(rng, level = 0) {
  const l = clampLevel(level);
  const p3 = 0.12 + 0.035 * l;
  const p2 = 0.42 + 0.05 * l;
  const r = rng();
  if (r < p3) return 3;
  if (r < p3 + p2) return 2;
  return 0;
}

/** Average away points per trip at a venue, for the title screen and tests. */
export const awayAverage = (level) => {
  const l = clampLevel(level);
  return 3 * (0.12 + 0.035 * l) + 2 * (0.42 + 0.05 * l);
};

export const quarterOf = (trip) => Math.min(4, Math.floor(trip / 2) + 1);

/** Win the game, unlock the next venue. Returns the new unlocked count. */
export function unlockAfter(level, won, unlocked) {
  if (!won) return unlocked;
  return Math.max(unlocked, Math.min(LEVELS.length, level + 2));
}

/* ---------- power-ups ---------- */

/**
 * They come and go like a mushroom does: each one helps for a while and
 * then it's gone, so the game never gets permanently easier.
 *
 * jumbo:   a giant mop head, two units per swipe and a wider reach. This trip only.
 * kicks:   fast sneakers and a hustle tank that never empties. Until someone slips.
 * timeout: the coach calls one. Three more seconds on the clock, right now.
 */
export const POWERUPS = {
  jumbo: { label: "JUMBO MOP", units: 2, slack: 6, lasts: "trip" },
  kicks: { label: "FAST KICKS", speed: 1.45, lasts: "slip" },
  timeout: { label: "TIMEOUT! +3", seconds: 3, lasts: "instant" },
};

/**
 * Maybe drop a power-up on the floor for this trip. Rarer on the first
 * trips, and never on the very first one so the basics come first.
 */
export function rollPowerup(trip, rng, puddles) {
  if (trip === 0) return null;
  if (rng() > 0.4) return null;
  const r = rng();
  const kind = r < 0.4 ? "jumbo" : r < 0.75 ? "kicks" : "timeout";
  for (let tries = 0; tries < 100; tries++) {
    const x = Math.round(30 + rng() * 90);
    const y = Math.round(COURT.y0 + 20 + rng() * (COURT.y1 - COURT.y0 - 36));
    if (puddles.every((p) => Math.hypot(p.x - x, p.y - y) > puddleRadius(p.max) + 10)) return { kind, x, y };
  }
  return null;
}

/** Close enough to pick it up. */
export const touches = (item, x, y) => Math.abs(item.x - x) <= 6 && Math.abs(item.y - (y - 4)) <= 7;

/* ---------- a bot mopper, for tuning ---------- */

/**
 * Play one trip with a simple mopper: always work the puddle the players
 * will reach soonest, walk at skill x top speed, swipe at skill x top rate.
 * skill 1 is a perfect run; a person reacting on a phone is nearer 0.8.
 * Returns the slipped units. Movement and timing match the real game.
 */
export function botTrip(puddles, trip, level, skill = 1) {
  const spec = tripSpec(trip, level);
  const clock = mopTime(trip, puddles, level);
  const ps = puddles.map((p) => ({ ...p }));
  const reachOf = (p) => puddleShape(p.max).rx + 3;
  // When the front reaches each puddle, counted from the start of LEAVE.
  const deadline = (p) => LEAVE_TIME + clock + Math.max(0, (p.x - puddleShape(p.units).rx - WAVE_START) / spec.waveSpeed);
  let t = 0;
  let x = BENCH.x, y = BENCH.y;
  let gas = GAS;
  for (;;) {
    const wet = ps.filter((p) => p.units > 0 && !p.locked);
    if (!wet.length) break;
    // Anything the front already reached is a slip now.
    for (const p of wet) if (t >= deadline(p)) p.locked = true;
    const live = wet.filter((p) => !p.locked);
    if (!live.length) break;
    live.sort((a, b) => deadline(a) - deadline(b));
    // Earliest deadline that can still be saved; otherwise give up on it.
    const doable = live.find((p) => {
      const d = Math.max(0, Math.hypot(p.x - x, p.y - y) - reachOf(p));
      return t + d / (WALK * skill) + p.units * SWIPE / skill <= deadline(p);
    }) || live[0];
    const dist = Math.max(0, Math.hypot(doable.x - x, doable.y - y) - reachOf(doable));
    const hustle = Math.min(gas, dist / HUSTLE);
    gas -= hustle;
    const walk = (dist - hustle * HUSTLE) / WALK;
    t += (hustle + walk) / skill;
    gas = Math.min(GAS, gas + walk * 0.5);
    x = doable.x; y = doable.y;
    while (doable.units > 0 && t + SWIPE / skill <= deadline(doable)) {
      t += SWIPE / skill;
      doable.units--;
    }
    if (doable.units > 0) doable.locked = true;
  }
  return slippedUnits(ps);
}

/** A whole game with the bot. Returns { home, away, won }. */
export function botGame(level, skill, rng) {
  let home = 0, away = 0;
  for (let trip = 0; trip < TRIPS; trip++) {
    const slipped = botTrip(spawnPuddles(trip, rng, level), trip, level, skill);
    const { points, chance } = shotFor(slipped);
    if (rng() < chance) home += points;
    away += awayPoints(rng, level);
  }
  return { home, away, won: home > away };
}
