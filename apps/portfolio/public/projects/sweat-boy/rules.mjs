/**
 * Sweat Boy: the game rules, with no canvas, timers or input.
 *
 * The screen is a Game Boy's 160x144. The court is the half nearest the
 * hoop: midcourt on the left edge, the hoop on the right. Players leave
 * through midcourt after a scrum and come back through it as one front, so
 * the puddles nearest midcourt are the ones they reach first.
 */

export const W = 160;
export const H = 144;
export const COURT = { x0: 8, x1: 152, y0: 16, y1: 130 };
export const HOOP = { x: 146, y: 73 };
export const TRIPS = 8;

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

/** What a trip throws at you. Trip 0 is a few single drops; it builds from there. */
export function tripSpec(trip) {
  const t = Math.max(0, Math.min(TRIPS - 1, trip));
  return {
    count: 3 + t,
    maxUnits: Math.min(4, 1 + Math.floor(t / 2)),
    baseTime: 4,
    perUnit: 0.62 - 0.03 * t,
    waveSpeed: 28 + 3 * t,
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
export function spawnPuddles(trip, rng) {
  const spec = tripSpec(trip);
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
export function mopTime(trip, puddles) {
  const spec = tripSpec(trip);
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

/** One back-and-forth swipe takes one unit off the puddle. Returns true when it is dry. */
export function swipe(puddle) {
  if (!puddle || puddle.locked || puddle.units <= 0) return false;
  puddle.units -= 1;
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

/** The other team scores at the far end while you mop. Out of your hands. */
export function awayPoints(rng) {
  const r = rng();
  if (r < 0.14) return 3;
  if (r < 0.58) return 2;
  return 0;
}

export const quarterOf = (trip) => Math.min(4, Math.floor(trip / 2) + 1);
