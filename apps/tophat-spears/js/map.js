/* The battlefield: height function, rocks and spires, and the geometry
 * queries the simulation needs. No DOM and no Three.js, so the host, every
 * client and the Node tests build the exact same map from the same seed and
 * nothing about it ever has to be sent over the network.
 */

export const MAPR = 74;
export const RELAY = { x: 0, z: 60 };
export const SPAWNS = [[-50, -66], [0, -70], [46, -64]];

export function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const clampM = v => Math.max(-MAPR, Math.min(MAPR, v));

export function H(x, z) {
  let y = 1.1 * Math.sin(x * 0.07) * Math.cos(z * 0.06) + 0.7 * Math.sin(x * 0.13 + z * 0.09) + 0.45 * Math.sin(z * 0.21 - x * 0.05);
  const pass = 1 - 0.9 * Math.exp(-((x + 28) ** 2) / 98) - 0.9 * Math.exp(-((x - 34) ** 2) / 72);
  y += 7.5 * Math.exp(-(z * z) / 72) * pass;
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d > 70) y += Math.min(30, (d - 70) * (d - 70) * 0.16);
  const bd = Math.hypot(x - RELAY.x, z - 58);
  if (bd < 18) { const k = (bd / 18) ** 2; y = y * k + 0.4 * (1 - k); }
  return y;
}

/* Rocks and crystal spires. Every random number a mesh needs is drawn here,
 * in a fixed order, so the renderer only reads these descriptors.
 * `obstacles` is the flat list of circle colliders (rocks, spires, relay);
 * `h` is roughly how tall each one stands, for line of sight.
 */
function buildProps() {
  const rng = seeded(90210);
  const rocks = [], spires = [], obstacles = [];
  for (let tries = 0; rocks.length < 42 && tries < 600; tries++) {
    const x = rng() * 148 - 74, z = rng() * 148 - 74, r = 1.1 + rng() * 2.6;
    if (Math.hypot(x - RELAY.x, z - 56) < 22) continue;
    if (SPAWNS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 11)) continue;
    if (rocks.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 3)) continue;
    const rock = { x, z, r, alt: rng() < 0.5, sy: 0.65 + rng() * 0.6, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3 };
    rocks.push(rock);
    obstacles.push({ x, z, r: r * 0.95, h: r * (0.15 + rock.sy) });
  }
  for (let i = 0; i < 9; i++) {
    const x = rng() * 140 - 70, z = (rng() - 0.5) * 30 + (i % 2 ? -30 : 20);
    const crystals = [];
    for (let k = 0; k < 3; k++) {
      crystals.push({ h: 3 + rng() * 4, rad: 0.45 + rng() * 0.3, ox: (rng() - 0.5) * 1.2, oz: (rng() - 0.5) * 1.2, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5 });
    }
    if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 3) || Math.hypot(x, z - 56) < 22) continue;
    spires.push({ x, z, crystals });
    obstacles.push({ x, z, r: 1.3, h: Math.max(...crystals.map(c => c.h)) - 0.3 });
  }
  obstacles.push({ x: RELAY.x, z: RELAY.z, r: 3.6, h: 9 });
  return { rocks, spires, obstacles };
}
export const PROPS = buildProps();

export function collide(u) {
  for (const o of PROPS.obstacles) {
    const dx = u.x - o.x, dz = u.z - o.z, d = Math.hypot(dx, dz), min = o.r + u.r;
    if (d < min && d > 0.0001) { u.x = o.x + dx / d * min; u.z = o.z + dz / d * min; }
  }
  u.x = clampM(u.x); u.z = clampM(u.z);
}

/* Can an eye at (ax, ay, az) see a point at (bx, by, bz)? Samples the
 * segment every half metre against the ground and against each obstacle as
 * a cylinder. The Spear's client already raycasts against the real meshes;
 * this is the host's cheaper re-check so a hop can't be faked.
 */
export function losClear(ax, ay, az, bx, by, bz) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.5));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < H(x, z) - 0.05) return false;
    for (const o of PROPS.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r * 0.85 && y < H(o.x, o.z) + o.h) return false;
    }
  }
  return true;
}
