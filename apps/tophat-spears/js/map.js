/* The battlefield: height function, bluffs, buildings, rocks and spires,
 * and the geometry queries the simulation needs. No DOM and no Three.js, so
 * the host, every client and the Node tests build the exact same map and
 * nothing about it ever has to be sent over the network.
 *
 * Layout (north is -z, where the swarm comes from; the relay is south):
 *
 *   - A ridge across the middle with two passes, and an outpost on its crest.
 *   - Two bluffs against the side walls, sheer on every face. Each has one
 *     ramp, cut into its inner face and climbing north from the base side,
 *     so getting up there is a long walk round for both sides.
 *   - A watchtower on each bluff, and two bunkers in front of the relay.
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
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/* Bluffs: a flat top `top` metres up, a cliff about a metre wide all round,
 * and a ramp: the strip x0..x1 along the inner face, from the top at zTop
 * down to the ground at zBot.
 */
export const BLUFFS = [
  { name: 'West bluff', x0: -80, x1: -40, z0: -14, z1: 38, top: 9.5, ramp: { x0: -46, x1: -40, zTop: 12, zBot: 38 } },
  { name: 'East bluff', x0: 40, x1: 80, z0: -40, z1: 10, top: 8.5, ramp: { x0: 40, x1: 46, zTop: -14, zBot: 10 } },
];
const CLIFF = 1;

function noise(x, z) {
  return 1.1 * Math.sin(x * 0.07) * Math.cos(z * 0.06) + 0.7 * Math.sin(x * 0.13 + z * 0.09) + 0.45 * Math.sin(z * 0.21 - x * 0.05);
}
// Open ground: rolling noise, the ridge with its passes, the map-edge wall.
function ground(x, z) {
  let y = noise(x, z);
  const pass = 1 - 0.9 * Math.exp(-((x + 18) ** 2) / 70) - 0.9 * Math.exp(-((x - 20) ** 2) / 70);
  y += 7.5 * Math.exp(-(z * z) / 72) * pass * smooth(42, 32, Math.abs(x));
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d > 70) y += Math.min(30, (d - 70) * (d - 70) * 0.16);
  return y;
}
for (const b of BLUFFS) {
  const R = b.ramp, mx = (R.x0 + R.x1) / 2;
  R.foot = ground(mx, R.zBot + 1);
  // Where units aim for: just off the bottom, and just past the top.
  R.B = { x: mx, z: R.zBot + 2.5 };
  R.T = { x: mx, z: R.zTop - 2.5 };
}
const sdRect = (x, z, b) => {
  const dx = Math.max(b.x0 - x, x - b.x1), dz = Math.max(b.z0 - z, z - b.z1);
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
};
function rampY(R, b, z) { const t = Math.max(0, Math.min(1, (z - R.zTop) / (R.zBot - R.zTop))); return b.top + (R.foot - b.top) * t; }
function bluffY(b, x, z, g) {
  const d = sdRect(x, z, b);
  if (d >= CLIFF) return g;
  let top = b.top + noise(x * 1.7, z * 1.7) * 0.12;
  const R = b.ramp;
  if (z > R.zTop) {
    // Inside the strip: the ramp. Just beside it, on the bluff side: a wall
    // back up to the top.
    const ox = Math.max(R.x0 - x, x - R.x1, 0), ry = rampY(R, b, z);
    top = ox <= 0 ? ry : ry + (top - ry) * smooth(0, 0.9, ox);
  }
  const f = d <= 0 ? 1 : 1 - smooth(0, CLIFF, d);
  return Math.max(g, g + (top - g) * f);
}

/* Buildings Soldiers can garrison. The Tophat sends units in (or a Spear
 * walks up and enters); everyone inside shoots out with a range bonus and
 * the building takes the hits instead of them.
 *   bunker  - sandbag-and-concrete pit, 4 inside, behind chest-high walls
 *   outpost - two-storey blockhouse, 6 on the roof deck
 *   tower   - watchtower, 2 on a platform 6 m up
 * `floor` is the deck height above the ground, `h` the top of the walls
 * (for line of sight), `door` the side units go in from. `armor` scales the
 * damage the building takes; `heal` is HP/s for the soldiers inside.
 */
export const BKIND = {
  bunker: { label: 'Bunker', r: 2.7, hp: 1200, armor: 0.5, heal: 1.5, floor: 0.1, h: 1.15, slots: [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.8], [0.9, 0.8]], range: 3 },
  outpost: { label: 'Outpost', r: 3.6, hp: 2000, armor: 0.5, heal: 1.5, floor: 3.2, h: 4.15, slots: [[-2, -1.6], [0, -1.9], [2, -1.6], [-2, 1.4], [0, 1.7], [2, 1.4]], range: 4 },
  tower: { label: 'Watchtower', r: 1.8, hp: 800, armor: 0.6, heal: 1.5, floor: 6, h: 6.95, slots: [[-0.6, -0.2], [0.6, -0.2]], range: 6 },
};
export const BUNKERS = [
  { kind: 'bunker', x: -13, z: 34, door: [0, 1] },
  { kind: 'bunker', x: 13, z: 34, door: [0, 1] },
  { kind: 'outpost', x: 0, z: -1, door: [0, 1] },
  { kind: 'tower', x: -44, z: -10, door: [-1, 0] },
  { kind: 'tower', x: 44, z: -36, door: [1, 0] },
];

function rawH(x, z) {
  let y = ground(x, z);
  for (const b of BLUFFS) y = bluffY(b, x, z, y);
  return y;
}
BUNKERS.forEach((k, i) => {
  const K = BKIND[k.kind];
  // Bunkers sit on a low mound so they don't end up in a dip.
  let base = rawH(k.x, k.z);
  if (k.kind === 'bunker') for (let a = 0; a < 6.28; a += 0.5) base = Math.max(base, rawH(k.x + Math.sin(a) * 9, k.z + Math.cos(a) * 9) + 0.3);
  Object.assign(k, { i, r: K.r, base });
  k.dx = k.x + k.door[0] * (K.r + 1.3); k.dz = k.z + k.door[1] * (K.r + 1.3);
});

export function H(x, z) {
  let y = rawH(x, z);
  const bd = Math.hypot(x - RELAY.x, z - 58);
  if (bd < 18) { const k = (bd / 18) ** 2; y = y * k + 0.4 * (1 - k); }
  // Level pads under the bunkers. (The outpost is dug into the ridge and the
  // towers stand on flat bluff tops, so they don't need one.)
  for (const k of BUNKERS) {
    if (k.kind !== 'bunker') continue;
    const d = Math.hypot(x - k.x, z - k.z), R = k.r + 2.5;
    if (d < R + 5) { const t = smooth(R, R + 5, d); y = k.base * (1 - t) + y * t; }
  }
  return y;
}

// ---------- levels and routes ----------

/* Which level a point is on: 0 for the open ground, or 1 + the bluff's
 * index for its top and the upper half of its ramp. `ramp` is the bluff
 * index when the point is anywhere on that bluff's ramp.
 */
export function where(x, z) {
  for (let i = 0; i < BLUFFS.length; i++) {
    const b = BLUFFS[i], R = b.ramp;
    if (x >= R.x0 - 0.3 && x <= R.x1 + 0.3 && z > R.zTop - 0.5 && z <= R.zBot + 1) {
      const t = (z - R.zTop) / (R.zBot - R.zTop);
      return { lv: t < 0.5 ? i + 1 : 0, ramp: i, t };
    }
    if (sdRect(x, z, b) < 0.5) return { lv: i + 1, ramp: -1, t: 0 };
  }
  return { lv: 0, ramp: -1, t: 0 };
}
export const levelAt = (x, z) => where(x, z).lv;

// Does the segment cross bluff `b` (grown by `m`)? Liang-Barsky.
function crosses(ax, az, bx, bz, b, m) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - (b.x0 - m)], [dx, (b.x1 + m) - ax], [-dz, az - (b.z0 - m)], [dz, (b.z1 + m) - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
// Round the bluffs on open ground: the shortest way through the bluffs'
// outer corners (a tiny visibility graph), first stop only.
const CORNERS = [];
for (const b of BLUFFS) for (const cx of [b.x0 - 3.5, b.x1 + 3.5]) for (const cz of [b.z0 - 3.5, b.z1 + 3.5]) {
  if (Math.abs(cx) < 70 && Math.abs(cz) < 70) CORNERS.push([cx, cz]);
}
// Keep 2 m off the cliffs (they're a metre wide at the foot), or less when
// either end is closer than that.
const clear = (ax, az, bx, bz) => !BLUFFS.some(b => crosses(ax, az, bx, bz, b, Math.max(0, Math.min(2, sdRect(ax, az, b) - 0.1, sdRect(bx, bz, b) - 0.1))));
const CVIS = CORNERS.map(a => CORNERS.map(b => clear(a[0], a[1], b[0], b[1])));
function around(x, z, gx, gz) {
  if (clear(x, z, gx, gz)) return [gx, gz];
  const n = CORNERS.length, dist = Array(n).fill(Infinity), first = Array(n).fill(-1), done = Array(n).fill(false);
  for (let i = 0; i < n; i++) if (clear(x, z, CORNERS[i][0], CORNERS[i][1])) { dist[i] = Math.hypot(CORNERS[i][0] - x, CORNERS[i][1] - z); first[i] = i; }
  let best = Infinity, via = -1;
  for (;;) {
    let k = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (k < 0 || dist[i] < dist[k])) k = i;
    if (k < 0) break;
    done[k] = true;
    const [cx, cz] = CORNERS[k];
    if (clear(cx, cz, gx, gz)) { const t = dist[k] + Math.hypot(gx - cx, gz - cz); if (t < best) { best = t; via = first[k]; } }
    for (let i = 0; i < n; i++) {
      if (done[i] || !CVIS[k][i]) continue;
      const t = dist[k] + Math.hypot(CORNERS[i][0] - cx, CORNERS[i][1] - cz);
      if (t < dist[i]) { dist[i] = t; first[i] = first[k]; }
    }
  }
  return via >= 0 ? CORNERS[via].slice() : [gx, gz];
}

/* The next point to walk toward on the way from (x, z) to (gx, gz). Units
 * can't climb cliffs, so getting onto or off a bluff means its ramp.
 */
export function route(x, z, gx, gz) {
  const a = where(x, z), g = where(gx, gz);
  if (a.ramp >= 0) {
    const R = BLUFFS[a.ramp].ramp, up = g.lv === a.ramp + 1 && !(g.ramp === a.ramp && g.t > a.t);
    if (g.ramp === a.ramp) return [gx, gz];
    const p = up ? R.T : R.B;
    if (Math.hypot(p.x - x, p.z - z) > 1.2) return [p.x, p.z];
    return up ? [gx, gz] : around(x, z, gx, gz);
  }
  if (a.lv > 0) {
    const b = BLUFFS[a.lv - 1], R = b.ramp;
    if (g.lv === a.lv && g.ramp < 0) {
      // The ramp is a notch in the bluff top: step round its head.
      if (!crosses(x, z, gx, gz, { x0: R.x0, x1: R.x1, z0: R.zTop, z1: R.zBot }, 0.4)) return [gx, gz];
      return [R.x0 === b.x0 ? R.x1 + 1.5 : R.x0 - 1.5, R.zTop - 1.5];
    }
    return Math.hypot(R.T.x - x, R.T.z - z) < 2.5 ? [R.B.x, R.B.z] : [R.T.x, R.T.z];
  }
  if (g.lv > 0 || g.ramp >= 0) {
    const R = BLUFFS[g.ramp >= 0 ? g.ramp : g.lv - 1].ramp;
    if (Math.hypot(R.B.x - x, R.B.z - z) < 2) return [R.T.x, R.T.z];
    return around(x, z, R.B.x, R.B.z);
  }
  return around(x, z, gx, gz);
}

// ---------- props ----------

/* Rocks and crystal spires. Every random number a mesh needs is drawn here,
 * in a fixed order, so the renderer only reads these descriptors.
 * `obstacles` is the flat list of circle colliders (rocks, spires, relay,
 * buildings); `h` is how tall each one stands, for line of sight.
 */
function clearSpot(x, z, r) {
  if (Math.hypot(x - RELAY.x, z - 56) < 22) return false;
  if (SPAWNS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 11)) return false;
  for (const b of BLUFFS) {
    const R = b.ramp;
    if (sdRect(x, z, b) > -r - 2 && sdRect(x, z, b) < r + 3) return false; // keep cliff edges clean
    if (x > R.x0 - r - 4 && x < R.x1 + r + 4 && z > R.zTop - 4 && z < R.zBot + r + 6) return false;
  }
  return !BUNKERS.some(k => Math.hypot(x - k.x, z - k.z) < k.r + r + 5 || Math.hypot(x - k.dx, z - k.dz) < r + 3);
}
function buildProps() {
  const rng = seeded(90210);
  const rocks = [], spires = [], obstacles = [];
  for (let tries = 0; rocks.length < 42 && tries < 900; tries++) {
    const x = rng() * 148 - 74, z = rng() * 148 - 74, r = 1.1 + rng() * 2.6;
    if (!clearSpot(x, z, r)) continue;
    if (rocks.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 3)) continue;
    const rock = { x, z, r, alt: rng() < 0.5, sy: 0.65 + rng() * 0.6, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3 };
    rocks.push(rock);
    obstacles.push({ x, z, r: r * 0.95, h: r * (0.15 + rock.sy) });
  }
  for (let i = 0; i < 9; i++) {
    const x = rng() * 80 - 40, z = (rng() - 0.5) * 30 + (i % 2 ? -30 : 20);
    const crystals = [];
    for (let k = 0; k < 3; k++) {
      crystals.push({ h: 3 + rng() * 4, rad: 0.45 + rng() * 0.3, ox: (rng() - 0.5) * 1.2, oz: (rng() - 0.5) * 1.2, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5 });
    }
    if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 3) || !clearSpot(x, z, 1.3)) continue;
    spires.push({ x, z, crystals });
    obstacles.push({ x, z, r: 1.3, h: Math.max(...crystals.map(c => c.h)) - 0.3 });
  }
  obstacles.push({ x: RELAY.x, z: RELAY.z, r: 3.6, h: 9 });
  for (const k of BUNKERS) obstacles.push({ x: k.x, z: k.z, r: k.r, h: BKIND[k.kind].h, bunker: k.i });
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
 * `skip` is a building index to ignore (the one being shot at). `bk` is the
 * match's building states: a wrecked one is only a low pile of rubble. An
 * obstacle either end is standing inside (a soldier in a bunker) doesn't
 * count: the walls are built to shoot over.
 */
export function losClear(ax, ay, az, bx, by, bz, skip = -1, bk = null) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.5));
  const inside = o => Math.hypot(ax - o.x, az - o.z) < o.r || Math.hypot(bx - o.x, bz - o.z) < o.r;
  const obs = PROPS.obstacles.filter(o => !(o.bunker === skip && skip >= 0) && !inside(o));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < H(x, z) - 0.05) return false;
    for (const o of obs) {
      const h = o.bunker >= 0 && bk && bk[o.bunker].hp <= 0 ? 0.4 : o.h;
      if (Math.hypot(x - o.x, z - o.z) < o.r * 0.85 && y < H(o.x, o.z) + h) return false;
    }
  }
  return true;
}
