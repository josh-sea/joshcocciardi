/* The match. Pure functions over a plain JSON state, run by one browser
 * (the host, or the only browser when you play on one keyboard) and
 * streamed to the others as compact snapshots.
 *
 * state = {
 *   level, seed, cfg, phase: 'play'|'clear'|'lost'|'won', phaseT, lives,
 *   players: { [pid]: marine }, foes: [...], shots: [...], pickups: [...],
 *   exitOpen, t, nextId, rs (random state), ev (this step's events)
 * }
 *
 * A pid is `${uid}_${n}`: one browser can drive several marines (two on a
 * keyboard, more with gamepads).
 */

import {
  TILE, PLAYER_R, PLAYER_SPEED, PLAYER_HP, RESPAWN_S, TEAM_LIVES, WEAPONS, WEAPON_BY_ID, ENEMIES, PICKUPS,
  LEVELS, MAX_BODIES, cleanConfig,
} from './config.js';
import { buildLevel, flood, blocked, slide, lineClear, rayEnd } from './map.js';

export const FOE_TYPES = Object.keys(ENEMIES);
export const SHOT_KINDS = ['bolt', 'pellet', 'flame', 'rocket', 'acid'];
export const PICKUP_KINDS = Object.keys(PICKUPS);

// ---- maps are rebuilt from (level, seed), never sent ----
const mapCache = new Map();
export function mapOf(s) {
  const k = `${s.level}:${s.seed}`;
  if (!mapCache.has(k)) { if (mapCache.size > 8) mapCache.clear(); mapCache.set(k, buildLevel(s.level, s.seed)); }
  return mapCache.get(k);
}

// Seeded randomness kept inside the state, so a saved match resumes the same.
function rand(s) {
  s.rs = (s.rs + 0x6D2B79F5) >>> 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const px = t => t * TILE + TILE / 2;
const id = s => ++s.nextId;
const ev = (s, ...e) => s.ev.push(e);

export function newMatch({ seed = 1, cfg = {}, players = [] } = {}) {
  const c = cleanConfig(cfg);
  const s = { v: 1, t: 0, seed: seed >>> 0, cfg: c, level: c.startLevel, phase: 'play', phaseT: 0, lives: TEAM_LIVES,
    players: {}, foes: [], shots: [], pickups: [], exitOpen: false, nextId: 0, rs: (seed * 2654435761) >>> 0, ev: [], kills: 0 };
  startLevel(s, c.startLevel);
  players.forEach(p => addPlayer(s, p.pid, p.name));
  return s;
}

function freshMarine(pid, name, c) {
  return { pid, name, c, x: 0, y: 0, a: -Math.PI / 2, hp: PLAYER_HP, alive: true, respawnT: 0, w: 0,
    ammo: WEAPONS.map((w, i) => (i === 0 ? -1 : 0)), cd: 0, inv: 0, score: 0, kills: 0 };
}

export function startLevel(s, level) {
  s.level = level; s.phase = 'play'; s.phaseT = 0; s.exitOpen = false; s.lives = TEAM_LIVES;
  s.foes = []; s.shots = []; s.pickups = []; s.levelT = 0;
  const m = mapOf(s), L = LEVELS[level];
  const hpMul = L.hpMul;
  for (const f of m.foes) s.foes.push(makeFoe(s, f.type, px(f.x), px(f.y), hpMul));
  for (const n of m.nests) s.foes.push(makeFoe(s, 'nest', px(n.x), px(n.y), hpMul));
  for (const k of m.pickups) s.pickups.push({ id: id(s), kind: k.kind, x: px(k.x), y: px(k.y) });
  // Extra swarm per the host's slider: duplicate some sleepers nearby.
  const extra = Math.round(m.foes.length * (s.cfg.swarm - 1));
  for (let i = 0; i < extra; i++) {
    const f = m.foes[i % m.foes.length];
    s.foes.push(makeFoe(s, f.type === 'matriarch' ? 'crawler' : f.type, px(f.x) + (rand(s) - 0.5) * 20, px(f.y) + (rand(s) - 0.5) * 20, hpMul));
  }
  if (extra < 0) s.foes = s.foes.filter((f, i) => f.type === 'nest' || f.type === 'matriarch' || rand(s) < s.cfg.swarm);
  let k = 0;
  for (const p of Object.values(s.players)) placeAtSpawn(s, p, k++);
  ev(s, 'level', level);
}

function makeFoe(s, type, x, y, hpMul = 1) {
  const E = ENEMIES[type];
  const hp = Math.round(E.hp * hpMul);
  return { id: id(s), type, x, y, hp, max: hp, cd: rand(s) * E.hitCd, awake: type === 'matriarch', a: rand(s) * Math.PI * 2, brood: 0, t2: 3 };
}

function placeAtSpawn(s, p, k) {
  const m = mapOf(s);
  const offs = [[-0.6, 0], [0.6, 0], [0, 0.7], [0, -0.7]][k % 4];
  p.x = px(m.spawn.x) + offs[0] * TILE; p.y = px(m.spawn.y) + offs[1] * TILE;
  if (blocked(m, p.x, p.y, PLAYER_R)) { p.x = px(m.spawn.x); p.y = px(m.spawn.y); }
  p.a = -Math.PI / 2; p.hp = PLAYER_HP; p.alive = true; p.respawnT = 0; p.inv = 1.5;
}

export function addPlayer(s, pid, name) {
  if (s.players[pid]) { s.players[pid].name = name || s.players[pid].name; return s.players[pid]; }
  if (Object.keys(s.players).length >= MAX_BODIES) return null;
  const used = new Set(Object.values(s.players).map(p => p.c));
  let c = 0; while (used.has(c)) c++;
  // Someone coming back (their phone switched apps, they stepped out to the
  // lobby) gets their own marine back: guns, ammo, score.
  const back = s.bench && s.bench[pid];
  if (back) {
    delete s.bench[pid];
    const p = { ...back, name: String(name || back.name).slice(0, 18), c: used.has(back.c) ? c : back.c };
    s.players[pid] = p;
    const mate = Object.values(s.players).find(q => q !== p && q.alive);
    if (!p.alive && p.respawnT <= 0 && s.lives > 0) { s.lives--; p.respawnT = RESPAWN_S; }
    if (p.alive) { if (mate) dropNear(s, p, mate); else placeAtSpawn(s, p, 0); p.inv = 1.5; }
    ev(s, 'join', pid);
    return p;
  }
  const p = freshMarine(pid, String(name || 'Marine').slice(0, 18), c);
  s.players[pid] = p;
  placeAtSpawn(s, p, Object.keys(s.players).length - 1);
  // Join mid-level next to a living teammate rather than back at the start.
  const mate = Object.values(s.players).find(q => q !== p && q.alive);
  if (mate && (s.levelT || 0) > 3) dropNear(s, p, mate);
  ev(s, 'join', pid);
  return p;
}

// Put a marine beside a teammate, on open floor.
function dropNear(s, p, mate) {
  const m = mapOf(s);
  for (const [dx, dy] of [[24, 0], [-24, 0], [0, 24], [0, -24], [18, 18], [-18, -18], [0, 0]]) {
    if (!blocked(m, mate.x + dx, mate.y + dy, PLAYER_R)) { p.x = mate.x + dx; p.y = mate.y + dy; return; }
  }
}

export function removePlayer(s, pid) {
  if (!s.players[pid]) return;
  s.bench = s.bench || {};
  s.bench[pid] = s.players[pid];
  delete s.players[pid];
}

/* One step. `inputs[pid]` = { mx, my, a, fire, w, px, py }:
 *   mx, my  movement, each -1..1
 *   a       aim angle (radians)
 *   fire    trigger held
 *   w       weapon index wanted
 *   px, py  where that browser says its marine is (remote players move on
 *           their own screen; the host only checks it's plausible)
 */
export function step(s, inputs = {}, dt) {
  s.ev = [];
  s.t += dt;
  if (s.phase === 'clear') {
    s.phaseT -= dt;
    if (s.phaseT <= 0) startLevel(s, s.level + 1);
    return s;
  }
  if (s.phase === 'won' || s.phase === 'lost') return s;
  s.levelT = (s.levelT || 0) + dt;
  const m = mapOf(s);

  for (const p of Object.values(s.players)) stepPlayer(s, m, p, inputs[p.pid] || {}, dt);
  stepFoes(s, m, dt);
  stepShots(s, m, dt);
  pickups(s);
  checkGoal(s, m);
  return s;
}

function stepPlayer(s, m, p, inp, dt) {
  if (!p.alive) {
    if (p.respawnT > 0) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const mate = Object.values(s.players).find(q => q.alive);
        const k = Object.keys(s.players).indexOf(p.pid);
        placeAtSpawn(s, p, k);
        if (mate) dropNear(s, p, mate);
        ev(s, 'respawn', p.pid);
      }
    }
    return;
  }
  p.inv = Math.max(0, p.inv - dt);
  if (Number.isFinite(inp.a)) p.a = inp.a;
  if (Number.isFinite(inp.px) && Number.isFinite(inp.py)) {
    // A remote marine goes where its own screen says, but the host glides
    // it there rather than jumping: positions arrive over the internet in
    // uneven bunches, and snapping to each one makes teammates stutter.
    const dx = inp.px - p.x, dy = inp.py - p.y, d = Math.hypot(dx, dy);
    if (d > REMOTE_SNAP) {
      // A respawn on their screen, or a long hitch: jump, if it's legal.
      if (!blocked(m, inp.px, inp.py, PLAYER_R - 1)) { p.x = inp.px; p.y = inp.py; }
    } else if (d > 0.5) {
      const len = Math.min(d, PLAYER_SPEED * 1.3 * dt + d * 0.12);
      const q = slide(m, p.x, p.y, dx / d * len, dy / d * len, PLAYER_R);
      p.x = q.x; p.y = q.y;
    }
  } else {
    const v = moveVec(inp.mx, inp.my);
    const q = slide(m, p.x, p.y, v.x * PLAYER_SPEED * dt, v.y * PLAYER_SPEED * dt, PLAYER_R);
    p.x = q.x; p.y = q.y;
  }
  if (Number.isInteger(inp.w) && inp.w !== p.w && inp.w >= 0 && inp.w < WEAPONS.length && p.ammo[inp.w] !== 0) {
    p.w = inp.w; p.cd = Math.max(p.cd, 0.15); ev(s, 'swap', p.pid, p.w);
  }
  p.cd -= dt;
  if (inp.fire && p.cd <= 0) fire(s, m, p);
}

export const REMOTE_SNAP = 160;

export function moveVec(mx = 0, my = 0) {
  const x = Math.max(-1, Math.min(1, Number(mx) || 0)), y = Math.max(-1, Math.min(1, Number(my) || 0));
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

// Move a marine the way the host would, for the browser that drives it.
export function movePredict(m, p, mx, my, dt) {
  const v = moveVec(mx, my);
  return slide(m, p.x, p.y, v.x * PLAYER_SPEED * dt, v.y * PLAYER_SPEED * dt, PLAYER_R);
}

function fire(s, m, p) {
  const W = WEAPONS[p.w];
  if (p.ammo[p.w] === 0) { p.w = 0; return; }
  p.cd = 1 / W.rate;
  if (p.ammo[p.w] > 0) p.ammo[p.w]--;
  const mx = p.x + Math.cos(p.a) * 16, my = p.y + Math.sin(p.a) * 16;
  ev(s, 'fire', p.pid, p.w);
  if (W.kind === 'rail') { rail(s, m, p, W); }
  else {
    const n = W.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = p.a + (rand(s) - 0.5) * 2 * W.spread;
      const sp = W.speed * (W.kind === 'pellet' || W.kind === 'flame' ? 0.8 + rand(s) * 0.4 : 1);
      s.shots.push({ id: id(s), k: W.kind, x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: W.dmg, o: p.pid, life: W.life, hit: [] });
    }
  }
  if (p.ammo[p.w] === 0) { p.w = bestWeapon(p); ev(s, 'empty', p.pid); }
}

const bestWeapon = p => { for (let i = WEAPONS.length - 1; i > 0; i--) if (p.ammo[i] > 0) return i; return 0; };

function rail(s, m, p, W) {
  const len = rayEnd(m, p.x, p.y, p.a, W.range);
  const cx = Math.cos(p.a), cy = Math.sin(p.a);
  for (const f of s.foes.slice()) {
    const t = (f.x - p.x) * cx + (f.y - p.y) * cy;
    if (t < 0 || t > len) continue;
    const d = Math.abs((f.x - p.x) * cy - (f.y - p.y) * cx);
    if (d < ENEMIES[f.type].r + 4) hurtFoe(s, f, W.dmg, p.pid);
  }
  if (s.cfg.friendlyFire) for (const q of Object.values(s.players)) {
    if (q === p || !q.alive) continue;
    const t = (q.x - p.x) * cx + (q.y - p.y) * cy;
    if (t > 0 && t < len && Math.abs((q.x - p.x) * cy - (q.y - p.y) * cx) < PLAYER_R + 3) hurtPlayer(s, q, W.dmg * 0.5);
  }
  ev(s, 'rail', Math.round(p.x), Math.round(p.y), Math.round(p.x + cx * len), Math.round(p.y + cy * len));
}

function hurtFoe(s, f, dmg, by) {
  if (f.hp <= 0) return;
  f.hp -= dmg; f.awake = true;
  ev(s, 'hit', Math.round(f.x), Math.round(f.y), FOE_TYPES.indexOf(f.type));
  if (f.hp > 0) return;
  s.foes.splice(s.foes.indexOf(f), 1);
  s.kills++;
  const p = s.players[by];
  if (p) { p.kills++; p.score += ENEMIES[f.type].score; }
  ev(s, 'die', Math.round(f.x), Math.round(f.y), FOE_TYPES.indexOf(f.type));
  if (f.type === 'nest') ev(s, 'nest', nestsLeft(s));
  // Wake anything that heard it.
  for (const o of s.foes) if (!o.awake && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < 200 * 200) o.awake = true;
}

function hurtPlayer(s, p, dmg) {
  if (!p.alive || p.inv > 0) return;
  p.hp -= dmg;
  ev(s, 'ouch', p.pid);
  if (p.hp > 0) return;
  p.hp = 0; p.alive = false;
  ev(s, 'down', p.pid);
  if (s.lives > 0) { s.lives--; p.respawnT = RESPAWN_S; }
  else p.respawnT = 0;
  const everyone = Object.values(s.players);
  if (everyone.length && everyone.every(q => !q.alive && q.respawnT <= 0)) { s.phase = 'lost'; ev(s, 'lost'); }
}

export const nestsLeft = s => s.foes.filter(f => f.type === 'nest').length;
const bossLeft = s => s.foes.some(f => f.type === 'matriarch');

// ---- the swarm ----
const fields = new WeakMap(); // state -> { at, dist }
function field(s, m) {
  const f = fields.get(s);
  if (f && s.t - f.at < 0.4) return f.dist;
  const src = Object.values(s.players).filter(p => p.alive).map(p => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }));
  const dist = flood(m, src);
  fields.set(s, { at: s.t, dist });
  return dist;
}

function nearestPlayer(s, x, y) {
  let best = null, bd = Infinity;
  for (const p of Object.values(s.players)) {
    if (!p.alive) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: Math.sqrt(bd) } : null;
}

function stepFoes(s, m, dt) {
  const anyAlive = Object.values(s.players).some(p => p.alive);
  const dist = anyAlive ? field(s, m) : null;
  for (const f of s.foes.slice()) {
    const E = ENEMIES[f.type];
    f.cd -= dt;
    const near = nearestPlayer(s, f.x, f.y);
    if (f.type === 'nest') {
      if (near && near.d < E.wake && f.cd <= 0) {
        f.cd = E.hitCd;
        const brood = s.foes.filter(o => o.from === f.id).length;
        if (brood < E.brood) {
          const a = rand(s) * Math.PI * 2;
          const c = makeFoe(s, 'crawler', f.x + Math.cos(a) * 26, f.y + Math.sin(a) * 26, LEVELS[s.level].hpMul);
          if (!blocked(m, c.x, c.y, 9)) { c.awake = true; c.from = f.id; s.foes.push(c); ev(s, 'brood', Math.round(f.x), Math.round(f.y)); }
        }
      }
      continue;
    }
    if (!near) continue;
    if (!f.awake) {
      if (near.d < E.aggro && lineClear(m, f.x, f.y, near.p.x, near.p.y)) f.awake = true;
      else continue;
    }
    const tgt = near.p, see = near.d < 520 && lineClear(m, f.x, f.y, tgt.x, tgt.y);
    let dx = 0, dy = 0;
    if (see) { dx = (tgt.x - f.x) / near.d; dy = (tgt.y - f.y) / near.d; }
    else if (dist) {
      // Downhill on the walking-distance field toward the nearest marine.
      const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE);
      let best = dist[ty * m.w + tx], bx = tx, by = ty;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const d = dist[ny * m.w + nx];
        if (d >= 0 && (best < 0 || d < best)) { best = d; bx = nx; by = ny; }
      }
      const gx = bx * TILE + TILE / 2 - f.x, gy = by * TILE + TILE / 2 - f.y, gl = Math.hypot(gx, gy) || 1;
      dx = gx / gl; dy = gy / gl;
    }
    let speed = E.speed;
    if (f.type === 'spitter' && see && near.d < E.keep) {
      // Hold range and strafe a little.
      const side = (f.id % 2 ? 1 : -1);
      const ndx = -dy * side * 0.6 - dx * (near.d < E.keep * 0.7 ? 0.8 : 0), ndy = dx * side * 0.6 - dy * (near.d < E.keep * 0.7 ? 0.8 : 0);
      dx = ndx; dy = ndy; speed *= 0.7;
      if (f.cd <= 0) { f.cd = E.hitCd; spit(s, f, tgt, E.acid); }
    }
    if (f.type === 'matriarch') matriarch(s, m, f, tgt, near.d, dt);
    if (dx || dy) f.a = Math.atan2(dy, dx);
    const q = slide(m, f.x, f.y, dx * speed * dt, dy * speed * dt, E.r * 0.8);
    f.x = q.x; f.y = q.y;
    // Bite.
    if (E.dmg && f.type !== 'spitter' && near.d < E.r + PLAYER_R + 4 && f.cd <= 0) {
      f.cd = E.hitCd; hurtPlayer(s, tgt, E.dmg); ev(s, 'bite', Math.round(tgt.x), Math.round(tgt.y));
    }
  }
  // Keep the swarm from stacking into one blob.
  const fs = s.foes;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i]; if (!a.awake || a.type === 'nest') continue;
    const ra = ENEMIES[a.type].r;
    for (let j = i + 1; j < fs.length; j++) {
      const b = fs[j]; if (b.type === 'nest') continue;
      const rb = ENEMIES[b.type].r, dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = (ra + rb) * 0.9;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, ny = dy / d;
      const qa = slide(m, a.x, a.y, -nx * push, -ny * push, ra * 0.8); a.x = qa.x; a.y = qa.y;
      const qb = slide(m, b.x, b.y, nx * push, ny * push, rb * 0.8); b.x = qb.x; b.y = qb.y;
    }
  }
}

function spit(s, f, tgt, speed) {
  const a = Math.atan2(tgt.y - f.y, tgt.x - f.x) + (rand(s) - 0.5) * 0.12;
  s.shots.push({ id: id(s), k: 'acid', x: f.x, y: f.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: ENEMIES[f.type].dmg, o: 'foe', life: 1.6, hit: [] });
  ev(s, 'spit', Math.round(f.x), Math.round(f.y));
}

// The last level's boss: rings of acid, a brood, and a charge when hurt.
function matriarch(s, m, f, tgt, d, dt) {
  f.t2 -= dt;
  if (f.t2 <= 0) {
    const enraged = f.hp < f.max * 0.4;
    const roll = rand(s);
    if (roll < 0.45) {
      const n = enraged ? 18 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(s) * 0.2;
        s.shots.push({ id: id(s), k: 'acid', x: f.x, y: f.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, dmg: 12, o: 'foe', life: 2.4, hit: [] });
      }
      ev(s, 'roar', Math.round(f.x), Math.round(f.y));
    } else if (roll < 0.75) {
      for (let i = 0; i < (enraged ? 5 : 3); i++) {
        const a = rand(s) * Math.PI * 2;
        const c = makeFoe(s, 'crawler', f.x + Math.cos(a) * 50, f.y + Math.sin(a) * 50);
        if (!blocked(m, c.x, c.y, 9)) { c.awake = true; s.foes.push(c); }
      }
      ev(s, 'brood', Math.round(f.x), Math.round(f.y));
    } else {
      for (let i = -2; i <= 2; i++) spit(s, f, { x: tgt.x + i * 40, y: tgt.y + i * 40 }, 360);
    }
    f.t2 = enraged ? 1.8 : 2.8;
  }
}

function stepShots(s, m, dt) {
  const ff = s.cfg.friendlyFire;
  const keep = [];
  for (const sh of s.shots) {
    sh.life -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(sh.vx, sh.vy) * dt / 10));
    let dead = sh.life <= 0;
    for (let i = 0; i < steps && !dead; i++) {
      sh.x += sh.vx * dt / steps; sh.y += sh.vy * dt / steps;
      if (blocked(m, sh.x, sh.y, 2)) {
        dead = true;
        if (sh.k === 'rocket') boom(s, sh);
        else ev(s, 'spark', Math.round(sh.x), Math.round(sh.y), SHOT_KINDS.indexOf(sh.k));
        break;
      }
      if (sh.o === 'foe') {
        for (const p of Object.values(s.players)) {
          if (p.alive && (p.x - sh.x) ** 2 + (p.y - sh.y) ** 2 < (PLAYER_R + 4) ** 2) { hurtPlayer(s, p, sh.dmg); dead = true; ev(s, 'splat', Math.round(sh.x), Math.round(sh.y)); break; }
        }
        continue;
      }
      for (const f of s.foes) {
        const r = ENEMIES[f.type].r + 3;
        if (sh.hit.includes(f.id) || (f.x - sh.x) ** 2 + (f.y - sh.y) ** 2 >= r * r) continue;
        if (sh.k === 'rocket') { boom(s, sh); dead = true; break; }
        sh.hit.push(f.id);
        hurtFoe(s, f, sh.dmg, sh.o);
        if (sh.k !== 'flame') { dead = true; break; }
      }
      if (dead || !ff) continue;
      for (const p of Object.values(s.players)) {
        if (p.pid === sh.o || !p.alive || sh.hit.includes(p.pid)) continue;
        if ((p.x - sh.x) ** 2 + (p.y - sh.y) ** 2 < (PLAYER_R + 2) ** 2) {
          sh.hit.push(p.pid); hurtPlayer(s, p, sh.dmg * 0.5);
          if (sh.k === 'rocket') boom(s, sh);
          if (sh.k !== 'flame') { dead = true; break; }
        }
      }
    }
    if (!dead) keep.push(sh);
  }
  s.shots = keep;
}

function boom(s, sh) {
  const R = WEAPON_BY_ID.rocket.splash;
  ev(s, 'boom', Math.round(sh.x), Math.round(sh.y));
  for (const f of s.foes.slice()) {
    const d = Math.hypot(f.x - sh.x, f.y - sh.y) - ENEMIES[f.type].r;
    if (d < R) hurtFoe(s, f, sh.dmg * (1 - Math.max(0, d) / R * 0.6), sh.o);
  }
  for (const p of Object.values(s.players)) {
    const d = Math.hypot(p.x - sh.x, p.y - sh.y);
    if (d < R * 0.8 && (s.cfg.friendlyFire || p.pid === sh.o)) hurtPlayer(s, p, sh.dmg * 0.35 * (1 - d / R));
  }
}

function pickups(s) {
  for (const k of s.pickups.slice()) {
    for (const p of Object.values(s.players)) {
      if (!p.alive || (p.x - k.x) ** 2 + (p.y - k.y) ** 2 > 22 * 22) continue;
      const P = PICKUPS[k.kind];
      if (P.heal) { if (p.hp >= PLAYER_HP) continue; p.hp = Math.min(PLAYER_HP, p.hp + P.heal); }
      else if (P.weapon) {
        const W = WEAPON_BY_ID[P.weapon];
        p.ammo[W.index] = Math.max(0, p.ammo[W.index]) + W.ammo;
        p.w = W.index;
      } else if (P.refill) {
        let any = false;
        WEAPONS.forEach((W, i) => { if (i > 0 && p.ammo[i] >= 0) { p.ammo[i] += Math.ceil(W.ammo * P.refill); any = true; } });
        if (!any) continue;
      }
      s.pickups.splice(s.pickups.indexOf(k), 1);
      ev(s, 'pick', p.pid, PICKUP_KINDS.indexOf(k.kind));
      break;
    }
  }
}

export function onExit(s, p) {
  const e = mapOf(s).exit;
  return p.x >= e.x * TILE && p.x <= (e.x + e.w) * TILE && p.y >= e.y * TILE && p.y <= (e.y + e.h) * TILE;
}

function checkGoal(s, m) {
  if (!s.exitOpen && nestsLeft(s) === 0 && !bossLeft(s)) { s.exitOpen = true; ev(s, 'open'); }
  if (!s.exitOpen) return;
  const alive = Object.values(s.players).filter(p => p.alive);
  if (!alive.length || !alive.every(p => onExit(s, p))) return;
  if (s.level >= LEVELS.length - 1) { s.phase = 'won'; ev(s, 'won'); return; }
  s.phase = 'clear'; s.phaseT = 4; ev(s, 'clear', s.level);
}

// Host commands that aren't per-frame input.
export function retryLevel(s) {
  for (const p of Object.values(s.players)) { p.ammo = WEAPONS.map((w, i) => (i === 0 ? -1 : 0)); p.w = 0; }
  startLevel(s, s.level);
}

// ---- the wire ----
// Compact snapshot for the network (and the renderer, which reads the same thing).
const r1 = n => Math.round(n * 10) / 10;
export function snapshot(s, events = s.ev) {
  return {
    t: Math.round(s.t * 1000) / 1000, lv: s.level, sd: s.seed, ph: s.phase, pt: r1(s.phaseT), li: s.lives, xo: s.exitOpen ? 1 : 0, kl: s.kills,
    p: Object.fromEntries(Object.values(s.players).map(p => [p.pid,
      [Math.round(p.x), Math.round(p.y), Math.round(p.a * 100) / 100, Math.max(0, Math.round(p.hp)), p.alive ? 1 : 0, p.w, p.ammo[p.w], p.score, p.kills, r1(Math.max(0, p.respawnT)), p.c, p.name, p.ammo.map(a => (a === 0 ? 0 : 1)).join('')]])),
    f: s.foes.map(f => [f.id, FOE_TYPES.indexOf(f.type), Math.round(f.x), Math.round(f.y), Math.round(Math.max(0, f.hp) / f.max * 100), Math.round(f.a * 100) / 100, f.awake ? 1 : 0]),
    s: s.shots.map(h => [h.id, SHOT_KINDS.indexOf(h.k), Math.round(h.x), Math.round(h.y), Math.round(h.vx), Math.round(h.vy)]),
    k: s.pickups.map(k => [k.id, PICKUP_KINDS.indexOf(k.kind), Math.round(k.x), Math.round(k.y)]),
    e: events,
  };
}

// The other side of `snapshot`. Firebase drops empty arrays and objects, so
// everything is defaulted.
export function decode(n) {
  const players = Object.entries(n.p || {}).map(([pid, a]) => ({
    pid, x: a[0], y: a[1], a: a[2], hp: a[3], alive: !!a[4], w: a[5], ammo: a[6], score: a[7], kills: a[8], respawnT: a[9], c: a[10], name: a[11],
    owned: String(a[12] || '1').split('').map(Number),
  }));
  return {
    t: n.t || 0, level: n.lv || 0, seed: n.sd || 0, phase: n.ph || 'play', phaseT: n.pt || 0, lives: n.li || 0, exitOpen: !!n.xo, kills: n.kl || 0,
    players,
    foes: (n.f || []).map(a => ({ id: a[0], type: FOE_TYPES[a[1]], x: a[2], y: a[3], hp: a[4], a: a[5], awake: !!a[6] })),
    shots: (n.s || []).map(a => ({ id: a[0], k: SHOT_KINDS[a[1]], x: a[2], y: a[3], vx: a[4], vy: a[5] })),
    pickups: (n.k || []).map(a => ({ id: a[0], kind: PICKUP_KINDS[a[1]], x: a[2], y: a[3] })),
    events: (n.e || []).map(e => (Array.isArray(e) ? e : Object.values(e))),
  };
}

// Blend two decoded snapshots for smooth movement between them.
export function interpolate(a, b, t) {
  if (!a) return b;
  const lerp = (x, y) => x + (y - x) * t;
  const la = (x, y) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * t; };
  const prev = new Map(a.foes.map(f => [f.id, f]));
  const pp = new Map(a.players.map(p => [p.pid, p]));
  return {
    ...b,
    foes: b.foes.map(f => { const o = prev.get(f.id); return o ? { ...f, x: lerp(o.x, f.x), y: lerp(o.y, f.y), a: la(o.a, f.a) } : f; }),
    players: b.players.map(p => { const o = pp.get(p.pid); return o && o.alive && p.alive ? { ...p, x: lerp(o.x, p.x), y: lerp(o.y, p.y), a: la(o.a, p.a) } : p; }),
  };
}

// Whole state for a host hand-over. JSON-safe; `restore` undoes Firebase's
// habit of dropping empty arrays.
export function serialize(s) { const { ev: _e, ...rest } = s; return JSON.parse(JSON.stringify(rest)); }
export function restore(d) {
  const s = { ...d, ev: [] };
  s.players = s.players || {};
  s.bench = s.bench || {};
  for (const p of [...Object.values(s.players), ...Object.values(s.bench)]) {
    const ammo = WEAPONS.map((w, i) => (i === 0 ? -1 : 0));
    if (p.ammo) Object.entries(p.ammo).forEach(([i, v]) => { ammo[i] = v; });
    p.ammo = ammo;
  }
  s.foes = s.foes || []; s.pickups = s.pickups || [];
  s.shots = (s.shots || []).map(h => ({ ...h, hit: h.hit || [] }));
  s.cfg = cleanConfig(s.cfg);
  return s;
}
