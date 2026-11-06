/* Level maps. Each one is generated from (level, seed) so every browser in
 * a match builds exactly the same station without the host sending it.
 *
 * A map is a grid of tiles (0 floor, 1 wall) plus what stands on it: where
 * the marines start, the exit pad, nests, sleeping swarm and pickups. All
 * positions are tile coordinates; the sim turns them into pixels.
 */

import { LEVELS, TILE } from './config.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const center = r => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

export function buildLevel(level, seed) {
  const L = LEVELS[level];
  return L.boss ? bossMap(L, seed) : stationMap(L, seed);
}

function stationMap(L, seed) {
  const rand = rng(seed * 7919 + L.w);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const { w, h } = L;
  const tiles = new Array(w * h).fill(1);
  const carve = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) tiles[y * w + x] = 0; };

  // Rooms: random boxes that don't touch.
  const rooms = [];
  for (let tries = 0; rooms.length < L.rooms && tries < 600; tries++) {
    const r = { w: ri(6, 11), h: ri(5, 9) };
    r.x = ri(2, w - r.w - 3); r.y = ri(2, h - r.h - 3);
    if (rooms.some(o => r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue;
    rooms.push(r);
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);

  // Corridors, two tiles wide: a spanning tree of nearest rooms, plus a few
  // loops so the swarm can come at you from more than one side.
  const corridor = (a, b) => {
    const A = center(a), B = center(b);
    const horizFirst = rand() < 0.5;
    const hLine = (y, x0, x1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { carve(x, y); carve(x, y + 1); } };
    const vLine = (x, y0, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { carve(x, y); carve(x + 1, y); } };
    if (horizFirst) { hLine(A.y, A.x, B.x); vLine(B.x, A.y, B.y); }
    else { vLine(A.x, A.y, B.y); hLine(B.y, A.x, B.x); }
  };
  const linked = [0], rest = rooms.map((_, i) => i).slice(1);
  const d2 = (a, b) => { const A = center(rooms[a]), B = center(rooms[b]); return (A.x - B.x) ** 2 + (A.y - B.y) ** 2; };
  while (rest.length) {
    let best = null;
    for (const a of linked) for (const b of rest) { const d = d2(a, b); if (!best || d < best.d) best = { a, b, d }; }
    corridor(rooms[best.a], rooms[best.b]);
    linked.push(best.b); rest.splice(rest.indexOf(best.b), 1);
  }
  for (let i = 0; i < Math.ceil(rooms.length / 4); i++) {
    const a = ri(0, rooms.length - 1), b = ri(0, rooms.length - 1);
    if (a !== b) corridor(rooms[a], rooms[b]);
  }

  // Order rooms by walking distance from the first: the start is room 0,
  // the exit the farthest, and the nests fill in from the far end.
  const map = { w, h, tiles };
  const S = center(rooms[0]);
  const dist = flood(map, [S]);
  const order = rooms.map((r, i) => ({ i, d: dist[center(r).y * w + center(r).x] })).sort((a, b) => a.d - b.d).map(o => o.i);
  const exitRoom = rooms[order[order.length - 1]];
  const E = center(exitRoom);
  map.spawn = S;
  map.exit = { x: E.x - 1, y: E.y - 1, w: 3, h: 3 };

  const used = new Set();
  const spot = (r, pad = 1) => {
    for (let k = 0; k < 30; k++) {
      const x = ri(r.x + pad, r.x + r.w - 1 - pad), y = ri(r.y + pad, r.y + r.h - 1 - pad);
      const key = y * w + x;
      if (used.has(key)) continue;
      if (r === exitRoom && Math.abs(x - E.x) <= 2 && Math.abs(y - E.y) <= 2) continue;
      used.add(key); return { x, y };
    }
    return null;
  };

  map.nests = [];
  const far = order.slice(1).reverse();
  // Far rooms first; a small deck doubles up rather than going short.
  for (let k = 0; map.nests.length < L.nests && k < far.length * 3; k++) {
    const r = rooms[far[k % far.length]];
    const p = spot(r, 2) || spot(r, 1); if (p) map.nests.push(p);
  }

  map.foes = [];
  for (let k = 1; k < order.length; k++) {
    const r = rooms[order[k]];
    const depth = k / order.length;
    const n = Math.round(L.crowd * (0.5 + depth));
    for (let j = 0; j < n; j++) {
      const p = spot(r); if (!p) continue;
      const roll = rand();
      const type = roll < 0.12 + depth * 0.12 ? 'brute' : roll < 0.38 + depth * 0.1 ? 'spitter' : 'crawler';
      map.foes.push({ type, ...p });
    }
  }

  // Weapons appear on the way, medkits and ammo everywhere but the start.
  map.pickups = [];
  L.weapons.forEach((kind, j) => {
    const r = rooms[order[Math.min(order.length - 2, 1 + Math.floor((j + 0.5) * (order.length - 2) / L.weapons.length))]];
    const p = r && spot(r); if (p) map.pickups.push({ kind, ...p });
  });
  for (let k = 1; k < order.length; k++) {
    if (rand() < 0.45) { const p = spot(rooms[order[k]]); if (p) map.pickups.push({ kind: 'med', ...p }); }
    if (rand() < 0.4) { const p = spot(rooms[order[k]]); if (p) map.pickups.push({ kind: 'ammo', ...p }); }
  }
  map.rooms = rooms;
  return map;
}

function bossMap(L, seed) {
  const rand = rng(seed * 104729 + 3);
  const { w, h } = L;
  const tiles = new Array(w * h).fill(1);
  const open = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * w + x] = 0; };
  open(4, 3, w - 5, h - 12);               // the chamber
  open(Math.floor(w / 2) - 2, h - 12, Math.floor(w / 2) + 1, h - 6); // the way in
  open(Math.floor(w / 2) - 5, h - 7, Math.floor(w / 2) + 4, h - 3);  // the landing
  // Pillars to hide behind.
  const pillars = [[10, 9], [w - 12, 9], [10, h - 18], [w - 12, h - 18], [Math.floor(w / 2) - 1, 12]];
  for (const [px, py] of pillars) for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) tiles[y * w + x] = 1;
  const cx = Math.floor(w / 2);
  const map = { w, h, tiles, spawn: { x: cx, y: h - 5 }, exit: { x: cx - 1, y: 5, w: 3, h: 3 }, nests: [], pickups: [], rooms: [] };
  map.foes = [{ type: 'matriarch', x: cx, y: 8 }];
  for (const kind of L.weapons) map.pickups.push({ kind, x: cx - 4 + Math.floor(rand() * 9), y: h - 4 });
  map.pickups.push({ kind: 'med', x: 6, y: h - 14 }, { kind: 'med', x: w - 7, y: h - 14 }, { kind: 'ammo', x: 6, y: 5 }, { kind: 'ammo', x: w - 7, y: 5 });
  map.nests.push({ x: 6, y: 5 }, { x: w - 7, y: 5 });
  return map;
}

// Breadth-first walking distance (in tiles, 8-way, no corner cutting) from
// any of `sources`. Used for room order, the tests, and the swarm's pathing.
export function flood(map, sources) {
  const { w, h, tiles } = map;
  const dist = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const s of sources) {
    const i = s.y * w + s.x;
    if (tiles[i] === 0 && dist[i] < 0) { dist[i] = 0; q[tail++] = i; }
  }
  while (head < tail) {
    const i = q[head++], x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (tiles[j] !== 0 || dist[j] >= 0) continue;
      if (dx && dy && (tiles[y * w + nx] !== 0 || tiles[ny * w + x] !== 0)) continue;
      dist[j] = dist[i] + 1; q[tail++] = j;
    }
  }
  return dist;
}

export function solidAt(map, px, py) {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
  return map.tiles[y * map.w + x] !== 0;
}

// Does a circle of radius r at (x, y) overlap a wall?
export function blocked(map, x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h || map.tiles[ty * map.w + tx] !== 0) {
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Move a circle, sliding along walls. Returns the new position.
export function slide(map, x, y, dx, dy, r) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.8)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!blocked(map, x + sx, y, r)) x += sx;
    if (!blocked(map, x, y + sy, r)) y += sy;
  }
  return { x, y };
}

// Clear straight line between two points (sampled every half tile).
export function lineClear(map, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / (TILE / 2));
  for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}

// Where a ray from (x, y) along angle a first hits a wall, up to `max`.
export function rayEnd(map, x, y, a, max) {
  const cx = Math.cos(a), cy = Math.sin(a), step = 4;
  for (let d = 0; d < max; d += step) if (solidAt(map, x + cx * d, y + cy * d)) return d;
  return max;
}
