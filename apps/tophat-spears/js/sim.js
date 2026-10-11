/* The match simulation. Pure data and functions: no DOM, no Three.js, no
 * network. One browser in the room (the host) runs it; everyone else gets
 * the compact snapshots it produces and draws those.
 *
 * Spears move their own body on their own machine, so the controls never
 * wait on the network. The host takes each Spear's reported pose, eases the
 * body toward it, and owns everything else: AI, swarm, waves, damage, the
 * leash, hops, deaths and redeploys.
 */

import { MTYPES, MTYPE_LIST, mtype, STIM, SHOT, BUGT, BTYPE_LIST, WAVES, MAXMAR, SQUADS, RELAY_MAX, MAX_SLOPE, SPRINT, cleanConfig } from './config.js';
import { H, RELAY, SPAWNS, BUNKERS, BKIND, clampM, collide, losClear, route, levelAt } from './map.js';

let rnd = Math.random;
export function setRandom(fn) { rnd = fn || Math.random; }

// Small slack on host-side timing checks, so a press that was on time on the
// Spear's screen isn't refused because the message took a moment to arrive.
const NET_SLACK = 0.25;

// ---------- pure rules (tested directly) ----------

/* Waves don't wait for the last one to be cleared. Each one arrives over
 * `waveLength(n)` seconds, thickening toward the end, and the next starts a
 * few seconds after the last of it is out. Fall behind and they stack up.
 */
export function waveComposition(n) {
  return {
    lings: 12 + n * 9,
    brutes: n >= 2 ? n + (n === WAVES ? 6 : 0) : 0,
    spitters: n >= 2 ? n * 2 : 0,
    burrowers: n >= 3 ? n - 2 : 0,
  };
}
// Later waves are tougher, not just bigger.
export const waveHp = n => 1 + 0.07 * (n - 1);
export const waveLength = n => 28 + n * 3;
export const WAVE_GAP = 6;

// Who each squad starts with, and the order reinforcements arrive in.
export const START_SQUADS = {
  Alpha: ['marine', 'marine', 'marine', 'torch'],
  Bravo: ['marine', 'marine', 'torch', 'shade'],
  Charlie: ['marine', 'marine', 'shade', 'strider'],
};
const REINFORCE = ['marine', 'marine', 'torch', 'marine', 'shade', 'marine', 'strider'];
const MAX_STRIDERS = 2;
const REINFORCE_EVERY = 18;

// Seconds a weapon takes for one full burst, with or without stim.
export function weaponCycle(w, stimmed) {
  return ((w.n - 1) * w.gap + w.pause) / (stimmed ? STIM.rate : 1);
}

// A Spear who dies before their hop cooldown is up waits out the rest of it.
export function deathWait(C, now, hopReadyAt) {
  const left = hopReadyAt - now;
  return left > C.respawn
    ? { wait: left, reason: 'You went down before your hop cooldown finished, so you wait it out.' }
    : { wait: C.respawn, reason: 'Standard redeploy delay.' };
}

export function leashDist(u, L) {
  if (L.kind === 'point') return Math.hypot(u.x - L.x, u.z - L.z);
  const vx = L.bx - L.ax, vz = L.bz - L.az, l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((u.x - L.ax) * vx + (u.z - L.az) * vz) / l2));
  return Math.hypot(u.x - (L.ax + vx * t), u.z - (L.az + vz * t));
}

export function leashStatus(u, L, C, now) {
  if (!u || !L) return { s: 'none' };
  const d = leashDist(u, L), inside = d <= C.leashR;
  return { s: inside ? 'ok' : now > L.deadline ? 'bad' : 'go', d, left: L.deadline - now };
}

export function zoneOf(u) {
  const o = u.order;
  if (o.type === 'enter') { const k = BUNKERS[o.b]; return { kind: 'point', x: k.x, z: k.z }; }
  if (o.type === 'patrol') return { kind: 'patrol', ax: o.ax, az: o.az, bx: o.bx, bz: o.bz };
  return { kind: 'point', x: o.x ?? u.x, z: o.z ?? u.z };
}

/* Bodies a dead or new Spear can drop into, most needed first. `units` is a
 * list of { id, team, x, z, hp, dead, owner, order }.
 */
export function rankBodies(units) {
  const bugs = units.filter(u => u.team === 's' && !u.dead);
  return units.filter(m => m.team === 'm' && !m.dead && !m.owner).map(m => {
    let near = 0; for (const b of bugs) if (Math.hypot(b.x - m.x, b.z - m.z) < 24) near++;
    const moving = m.order && m.order.type !== 'hold';
    return { m, near, tag: near ? 'combat' : moving ? 'moving' : 'hold', score: near * 3 + (moving ? 1 : 0) + m.hp / 100 };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}

/* One frame of a Spear's own movement, run on the Spear's machine.
 * `pose` is { x, y, z, vy, yaw }; `inp` is { f, s, sprint, jump }.
 * Ground steeper than MAX_SLOPE can't be walked up: the move is retried
 * along each axis alone so you slide along a slope instead of sticking.
 */
export function moveSpear(pose, inp, dt, type = 'marine', stimmed = false) {
  const T = mtype(type);
  const sp = T.speed * (inp.sprint ? SPRINT : 1) * (stimmed ? STIM.speed : 1);
  const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw);
  let mx = -sy * inp.f + cy * inp.s, mz = -cy * inp.f - sy * inp.s;
  const len = Math.hypot(mx, mz);
  if (len) { mx /= len; mz /= len; }
  const g0 = H(pose.x, pose.z), grounded0 = pose.y <= g0 + 0.001;
  const tryMove = (dx, dz) => {
    if (!dx && !dz) return false;
    const c = { x: pose.x + dx, z: pose.z + dz, r: T.r };
    collide(c);
    const run = Math.hypot(c.x - pose.x, c.z - pose.z);
    if (run < 1e-6) return false;
    const rise = H(c.x, c.z) - g0;
    if (grounded0 && rise / run > MAX_SLOPE) return false;
    // In the air you can land on something, not climb a cliff face.
    if (!grounded0 && H(c.x, c.z) > pose.y + MAX_SLOPE * run + 0.05) return false;
    pose.x = c.x; pose.z = c.z; return true;
  };
  const dx = mx * sp * dt, dz = mz * sp * dt;
  if (!tryMove(dx, dz)) { if (!tryMove(dx, 0)) tryMove(0, dz); }
  const g = H(pose.x, pose.z);
  pose.vy -= 22 * dt; pose.y += pose.vy * dt;
  const grounded = pose.y <= g + 0.001;
  if (grounded) { pose.y = g; pose.vy = 0; }
  if (inp.jump && grounded) pose.vy = 7.5;
  return { moving: len > 0, grounded };
}

// ---------- match state ----------

export function newMatch(config) {
  const s = {
    C: cleanConfig(config), now: 0, waveN: 0, waveActive: false, nextWaveAt: 15, queue: [], reinforceAt: 14,
    bk: BUNKERS.map(k => ({ hp: BKIND[k.kind].hp, downAt: 0 })),
    lost: 0, relayHp: RELAY_MAX, phase: 'play', win: null, uid: 0, sqN: { Alpha: 0, Bravo: 0, Charlie: 0 }, reinforceN: 0,
    marines: [], bugs: [], spears: {}, shots: [], events: [],
  };
  SQUADS.forEach((sq, si) => START_SQUADS[sq].forEach((type, i) => spawnMarine(s, -10 + si * 10 + (i % 2) * 2.4 - 1.2, 45 + Math.floor(i / 2) * 2.4, sq, type)));
  event(s, 'First wave in 15s. Man the bunkers.');
  return s;
}

function spawnMarine(s, x, z, squad, type = 'marine') {
  const T = mtype(type);
  const m = {
    id: ++s.uid, team: 'm', type, x, z, y: H(x, z), face: Math.PI, hp: T.hp, maxHp: T.hp, r: T.r, fireCd: rnd() * 0.4, burst: 0,
    squad, name: squad + '-' + (++s.sqN[squad]), order: { type: 'hold', x, z }, dead: false, deathT: 0, owner: '', pose: null, stimUntil: 0,
    inB: -1, slot: 0,
  };
  s.marines.push(m); return m;
}
function spawnBug(s, type, x, z) {
  const t = BUGT[type], hp = Math.round(t.hp * waveHp(Math.max(1, s.waveN)));
  const b = { id: ++s.uid, team: 's', type, x, z, y: H(x, z), hp, maxHp: hp, r: t.r, speed: t.speed * (0.9 + rnd() * 0.2),
    atkCd: 0, face: 0, dead: false, deathT: 0, wob: rnd() * 10, burrowed: false, bT: 0, uT: 0, lost: 0 };
  s.bugs.push(b); return b;
}

// `to`: '' for everyone, 'tophat', or a Spear's player id.
function event(s, m, c = '', to = '') { s.events.push({ m, c, to }); }

const marineById = (s, id) => s.marines.find(m => m.id === id);
const driven = (s, m) => !!(m.owner && s.spears[m.owner] && s.spears[m.owner].driven);

function damage(s, t, amt, src) {
  if (t.dead) return;
  t.hp -= amt;
  if (t.hp <= 0) kill(s, t, src);
}
function kill(s, t, src) {
  t.dead = true; t.hp = 0;
  if (t.team === 'm') t.inB = -1;
  if (t.team === 's') { if (src && s.spears[src]) s.spears[src].kills++; return; }
  s.lost++;
  if (t.owner) { const pid = t.owner; t.owner = ''; t.pose = null; onSpearDeath(s, pid); }
}

// ---------- spears ----------

export function addSpear(s, pid, name) {
  if (!s.spears[pid]) {
    s.spears[pid] = { name: name || 'Spear', unitId: 0, state: 'none', hopReadyAt: 0, deadUntil: 0, reason: '', leash: null,
      outsideSince: null, kills: 0, deaths: 0, hops: 0, driven: true, lastShot: -9 };
  } else if (name) s.spears[pid].name = name;
  return s.spears[pid];
}

// A Spear who leaves the seat (or swaps to Tophat) hands the body back to AI.
export function removeSpear(s, pid) {
  const sp = s.spears[pid]; if (!sp) return;
  const m = marineById(s, sp.unitId);
  if (m && !m.dead) release(m);
  delete s.spears[pid];
}

// Undriven bodies (owner offline, or solo practice in Tophat view) run on AI
// but stay reserved for their Spear.
export function setDriven(s, pid, v) { if (s.spears[pid]) s.spears[pid].driven = !!v; }

function buff(s, m) { const k = 1 + s.C.heroHp; m.maxHp = mtype(m.type).hp * k; m.hp = Math.min(m.maxHp, m.hp * k); }
function release(m) { const base = mtype(m.type).hp, f = m.hp / m.maxHp; m.maxHp = base; m.hp = f * base; m.owner = ''; m.pose = null; m.y = H(m.x, m.z); }

function setLeash(s, sp, m) { sp.leash = Object.assign(zoneOf(m), { deadline: s.now + s.C.leashT }); sp.outsideSince = null; }

function possess(s, pid, m, isHop) {
  const sp = s.spears[pid];
  const old = marineById(s, sp.unitId);
  if (old && !old.dead) release(old);
  buff(s, m); m.owner = pid; m.pose = null; m.y = H(m.x, m.z);
  sp.unitId = m.id; sp.state = 'active'; sp.hopReadyAt = s.now + s.C.hopCd; if (isHop) sp.hops++;
  setLeash(s, sp, m);
}

function onSpearDeath(s, pid) {
  const sp = s.spears[pid]; if (!sp) return;
  const { wait, reason } = deathWait(s.C, s.now, sp.hopReadyAt);
  Object.assign(sp, { state: 'dead', deadUntil: s.now + wait, reason, unitId: 0, leash: null, outsideSince: null });
  sp.deaths++;
  event(s, sp.name + ' went down', '#ff5a4f', 'tophat');
}

export function hop(s, pid, targetId) {
  const sp = s.spears[pid];
  if (!sp || sp.state !== 'active') return { ok: false, why: 'Not in a body' };
  if (s.now < sp.hopReadyAt - NET_SLACK) return { ok: false, why: 'Hop cooling down: ' + Math.ceil(sp.hopReadyAt - s.now) + 's' };
  const u = marineById(s, sp.unitId), t = marineById(s, targetId);
  if (!u || !t || t.dead) return { ok: false, why: 'That marine is gone' };
  if (t.owner) return { ok: false, why: 'Another Spear has that body' };
  if (Math.hypot(t.x - u.x, t.z - u.z) > s.C.hopRange + 2) return { ok: false, why: 'Out of hop range' };
  if (!losClear(u.x, u.y + mtype(u.type).eye, u.z, t.x, t.y + 1.2, t.z, -1, s.bk)) return { ok: false, why: 'No line of sight' };
  possess(s, pid, t, true);
  return { ok: true, name: t.name };
}

export function redeploy(s, pid, targetId) {
  const sp = s.spears[pid];
  if (!sp || sp.state === 'active') return { ok: false, why: 'Already in a body' };
  if (s.now < sp.deadUntil - NET_SLACK) return { ok: false, why: 'Redeploy in ' + Math.ceil(sp.deadUntil - s.now) + 's' };
  const t = marineById(s, targetId);
  if (!t || t.dead) return { ok: false, why: 'That marine is gone' };
  if (t.owner) return { ok: false, why: 'Another Spear has that body' };
  possess(s, pid, t, false);
  return { ok: true, name: t.name };
}

const fin = v => typeof v === 'number' && Number.isFinite(v);
const m0 = (s, sp) => marineById(s, sp.unitId) || { inB: -1 };

// The Spear's reported position for its own body. Stale poses (sent for the
// previous body) are ignored.
export function spearPose(s, pid, p) {
  const sp = s.spears[pid];
  if (!sp || sp.state !== 'active' || !p || p.u !== sp.unitId) return;
  // Sent before the Spear's screen caught up with going in or out of a building.
  if (typeof p.g === 'number' && p.g !== m0(s, sp).inB) return;
  if (![p.x, p.y, p.z, p.yaw].every(fin)) return;
  const m = marineById(s, sp.unitId); if (!m || m.dead) return;
  if (m.inB >= 0) { m.pose = { x: m.x, z: m.z, y: m.y, face: p.yaw }; return; }
  m.pose = { x: clampM(p.x), z: clampM(p.z), y: Math.max(H(p.x, p.z), Math.min(H(p.x, p.z) + 4, p.y)), face: p.yaw };
}

// A Spear fired. The shooter's machine did the raycast against what it saw;
// the host checks the fire rate for that weapon, the range, and that each
// bug is still alive. A flamethrower names every bug in its cone.
export function spearShot(s, pid, shot) {
  const sp = s.spears[pid];
  if (!sp || sp.state !== 'active' || !shot) return false;
  const u = marineById(s, sp.unitId); if (!u || u.dead) return false;
  const T = mtype(u.type), w = T.w;
  // Rounds refill at exactly the weapon's rate (a little faster, for network
  // jitter), up to one burst plus one in hand.
  const rate = w.n / weaponCycle(w, stimmed(s, u)) * 1.15;
  sp.ammo = Math.min(w.n + 1, (sp.ammo ?? w.n) + Math.max(0, s.now - sp.lastShot) * rate);
  sp.lastShot = s.now;
  if (sp.ammo < 1) return false;
  sp.ammo -= 1;
  u.lastFire = s.now;
  const a = Array.isArray(shot.a) && shot.a.length === 3 && shot.a.every(fin) ? shot.a : [u.x, u.y + T.eye - 0.1, u.z];
  const b = Array.isArray(shot.b) && shot.b.length === 3 && shot.b.every(fin) ? shot.b : a;
  s.shots.push([...a, ...b, pid, SHOT[w.kind]]);
  const ids = w.kind === 'flame' ? (Array.isArray(shot.bugs) ? shot.bugs.slice(0, 12) : []) : shot.bug ? [shot.bug] : [];
  const dmg = w.dmg * (1 + s.C.heroDmg);
  let hit = false;
  for (const id of ids) {
    const bug = s.bugs.find(x => x.id === id);
    if (bug && !bug.dead && Math.hypot(bug.x - u.x, bug.z - u.z) <= w.reach + bug.r + 2) { damage(s, bug, dmg, pid); hit = true; }
  }
  return hit;
}

// Stim the given soldiers (Marines and Torches with health to spare). The
// Tophat can stim any of them, Spears included, without asking; a Spear who
// gets stimmed that way is told.
export function stim(s, ids, by = 'tophat') {
  let n = 0;
  for (const m of s.marines) {
    if (m.dead || !ids.includes(m.id) || !mtype(m.type).stim || m.hp <= STIM.hp + 1) continue;
    m.hp -= STIM.hp; m.stimUntil = s.now + STIM.dur; n++;
    if (m.owner && m.owner !== by) event(s, `Tophat stimmed you: ${STIM.dur}s of speed, -${STIM.hp} HP`, '#ff5a4f', m.owner);
  }
  return n;
}
export function spearStim(s, pid) {
  const sp = s.spears[pid];
  return sp && sp.state === 'active' ? stim(s, [sp.unitId], pid) : 0;
}
const stimmed = (s, m) => m.stimUntil > s.now;

// ---------- tophat orders ----------

export function order(s, kind, ids, p) {
  if (!Array.isArray(ids) || !p || !fin(p.x) || !fin(p.z)) return;
  const sel = s.marines.filter(m => !m.dead && ids.includes(m.id));
  if (!sel.length) return;
  // A move onto a standing building means: go in.
  const bi = kind === 'move' ? bunkerAt(s, p.x, p.z) : -1;
  if (kind === 'hold') {
    sel.forEach(m => m.order = { type: 'hold', x: m.x, z: m.z });
  } else if (bi >= 0) {
    for (const m of sel) { if (m.inB !== bi) leaveBunker(s, m); m.order = { type: 'enter', b: bi }; }
  } else {
    sel.forEach(m => leaveBunker(s, m));
    const n = sel.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    sel.forEach((m, i) => {
      const tx = clampM(p.x + ((i % cols) - (cols - 1) / 2) * 1.9), tz = clampM(p.z + (Math.floor(i / cols) - (rows - 1) / 2) * 1.9);
      m.order = kind === 'patrol' ? { type: 'patrol', ax: m.x, az: m.z, bx: tx, bz: tz, leg: 1 } : { type: 'move', x: tx, z: tz };
    });
  }
  for (const m of sel) {
    if (!m.owner) continue;
    const sp = s.spears[m.owner]; if (!sp) continue;
    setLeash(s, sp, m);
    event(s, kind === 'hold' ? 'Tophat: hold here' : bi >= 0 ? `Tophat orders: get into the ${BKIND[BUNKERS[bi].kind].label.toLowerCase()}` : `Tophat orders: ${s.C.leashT}s to reach the zone`, '#ff9f3a', m.owner);
  }
}

// ---------- buildings ----------

// The standing building at (x, z), or -1.
function bunkerAt(s, x, z) {
  for (const k of BUNKERS) if (s.bk[k.i].hp > 0 && Math.hypot(x - k.x, z - k.z) < k.r + 1.5) return k.i;
  return -1;
}
const bunkerFloor = k => k.base + BKIND[k.kind].floor;
function placeInBunker(m) {
  const k = BUNKERS[m.inB], [ox, oz] = BKIND[k.kind].slots[m.slot] || [0, 0];
  m.x = k.x + ox; m.z = k.z + oz; m.y = bunkerFloor(k);
}
function enterBunker(s, m, bi) {
  const k = BUNKERS[bi], K = BKIND[k.kind];
  const busy = new Set(s.marines.filter(x => !x.dead && x !== m && x.inB === bi).map(x => x.slot));
  const slot = K.slots.findIndex((_, i) => !busy.has(i));
  const why = s.bk[bi].hp <= 0 ? 'is wrecked' : m.type === 'strider' ? 'has no room for a Strider' : slot < 0 ? 'is full' : '';
  if (why) {
    m.order = { type: 'hold', x: m.x, z: m.z };
    const to = m.owner || 'tophat';
    if ((s.fullMsgAt || 0) < s.now - 3 || m.owner) { s.fullMsgAt = s.now; event(s, `The ${K.label.toLowerCase()} ${why}`, '#ff9f3a', to); }
    return false;
  }
  m.inB = bi; m.slot = slot; m.order = { type: 'enter', b: bi }; m.pose = null;
  placeInBunker(m);
  return true;
}
function leaveBunker(s, m, spread = 0.6) {
  if (m.inB < 0) return;
  const k = BUNKERS[m.inB];
  m.inB = -1; m.pose = null;
  m.x = k.dx + (rnd() - 0.5) * spread * 4; m.z = k.dz + (rnd() - 0.5) * spread * 2; m.y = H(m.x, m.z);
  if (m.order.type === 'enter') m.order = { type: 'hold', x: m.x, z: m.z };
}
function damageBunker(s, bi, amt) {
  const st = s.bk[bi]; if (st.hp <= 0) return;
  st.hp -= amt * BKIND[BUNKERS[bi].kind].armor; st.hitAt = s.now;
  if (st.hp > 0) return;
  st.hp = 0; st.downAt = s.now;
  const k = BUNKERS[bi];
  for (const m of s.marines) if (!m.dead && m.inB === bi) { leaveBunker(s, m, 1); damage(s, m, 15, null); }
  event(s, `The ${BKIND[k.kind].label.toLowerCase()} is down!`, '#ff5a4f');
}
// Buildings patch themselves up when nothing is chewing on them, and a
// wrecked one is rebuilt after a while once the area is quiet.
function bunkerTick(s, dt) {
  for (const k of BUNKERS) {
    const st = s.bk[k.i], K = BKIND[k.kind];
    const quiet = !s.bugs.some(b => !b.dead && Math.hypot(b.x - k.x, b.z - k.z) < 18);
    if (st.hp <= 0) {
      if (quiet && s.now - st.downAt > 60) { st.hp = K.hp * 0.5; event(s, `The ${K.label.toLowerCase()} has been rebuilt`, '#7bd88f'); }
    } else if (quiet && st.hp < K.hp && s.now - (st.hitAt || -9) > 4) st.hp = Math.min(K.hp, st.hp + K.hp * 0.01 * dt);
  }
  // Soldiers dug in patch themselves up.
  for (const m of s.marines) if (!m.dead && m.inB >= 0) m.hp = Math.min(m.maxHp, m.hp + BKIND[BUNKERS[m.inB].kind].heal * dt);
}

// A Spear asks to get into the building they're standing at, or out of the
// one they're in.
export function spearGarrison(s, pid) {
  const sp = s.spears[pid];
  if (!sp || sp.state !== 'active') return { ok: false, why: 'Not in a body' };
  const m = marineById(s, sp.unitId); if (!m || m.dead) return { ok: false, why: 'Not in a body' };
  if (m.inB >= 0) { const K = BKIND[BUNKERS[m.inB].kind]; leaveBunker(s, m); return { ok: true, why: `Left the ${K.label.toLowerCase()}`, out: true }; }
  let best = -1, bd = Infinity;
  for (const k of BUNKERS) {
    const d = Math.min(Math.hypot(m.x - k.dx, m.z - k.dz), Math.hypot(m.x - k.x, m.z - k.z) - k.r);
    if (d < 3.5 && Math.abs(m.y - H(k.dx, k.dz)) < 2.5 && d < bd) { bd = d; best = k.i; }
  }
  if (best < 0) return { ok: false, why: 'Walk up to a bunker, outpost or tower door' };
  return enterBunker(s, m, best) ? { ok: true, why: `In the ${BKIND[BUNKERS[best].kind].label.toLowerCase()}` } : { ok: false, why: '' };
}

// ---------- waves ----------

function startWave(s) {
  s.waveN++; s.waveActive = true;
  const c = waveComposition(s.waveN), L = waveLength(s.waveN), q = [];
  // sqrt bunches arrivals toward the end of the wave: it builds.
  const at = (lo = 0) => s.now + lo + (L - lo) * Math.sqrt(rnd());
  for (const k in c) c[k] = Math.round(c[k] * s.C.swarm);
  for (let i = 0; i < c.lings; i++) q.push({ type: 'ling', at: at() });
  for (let i = 0; i < c.brutes; i++) q.push({ type: 'brute', at: at(4) });
  for (let i = 0; i < c.spitters; i++) q.push({ type: 'spitter', at: at(3) });
  for (let i = 0; i < c.burrowers; i++) q.push({ type: 'burrower', at: at(6) });
  s.queue = q.sort((a, b) => a.at - b.at);
  event(s, s.waveN === WAVES ? `Final wave! ${q.length} incoming` : `Wave ${s.waveN} of ${WAVES}: ${q.length} incoming`, '#d0479b');
}
function waves(s) {
  if (!s.waveActive && s.waveN < WAVES && s.now >= s.nextWaveAt) startWave(s);
  while (s.queue.length && s.queue[0].at <= s.now) {
    const q = s.queue.shift(), [sx, sz] = SPAWNS[Math.floor(rnd() * SPAWNS.length)];
    spawnBug(s, q.type, sx + (rnd() - 0.5) * 10, sz + (rnd() - 0.5) * 8);
  }
  // The next wave doesn't wait for this one to be cleared.
  if (s.waveActive && !s.queue.length) {
    s.waveActive = false;
    if (s.waveN < WAVES) s.nextWaveAt = s.now + WAVE_GAP;
  }
  if (s.waveN >= WAVES && !s.waveActive && !s.bugs.some(b => !b.dead)) endMatch(s, true);
  if (s.now >= s.reinforceAt) {
    s.reinforceAt = s.now + REINFORCE_EVERY;
    const alive = s.marines.filter(m => !m.dead);
    if (alive.length < MAXMAR) {
      const counts = SQUADS.map(q => alive.filter(m => m.squad === q).length);
      const q = SQUADS[counts.indexOf(Math.min(...counts))];
      let type = REINFORCE[s.reinforceN++ % REINFORCE.length];
      if (type === 'strider' && alive.filter(m => m.type === 'strider').length >= MAX_STRIDERS) type = 'marine';
      const m = spawnMarine(s, RELAY.x + (rnd() - 0.5) * 6, RELAY.z - 6, q, type);
      event(s, `Reinforcement: ${m.name} (${mtype(type).label})`, '#8fb3d6');
    }
  }
}
function endMatch(s, win) { if (s.phase === 'over') return; s.phase = 'over'; s.win = win; }

// ---------- unit AI ----------

const angTo = (dx, dz) => Math.atan2(dx, dz) + Math.PI;
function lerpAng(a, b, t) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, t); }
export { lerpAng };

// Extra reach for a soldier at (mx, my, mz) shooting at a bug at height
// `by`: buildings add their bonus, and high ground adds up to 6 m.
function reachBonus(m, by) {
  const b = m.inB >= 0 ? BKIND[BUNKERS[m.inB].kind].range : 0;
  return b + Math.max(0, Math.min(6, (m.y - by - 1.5) * 0.6));
}

function updateMarine(s, m, dt) {
  if (m.dead) return;
  const T = mtype(m.type), w = T.w, stim = stimmed(s, m);
  if (m.inB >= 0) {
    if (s.bk[m.inB].hp <= 0) leaveBunker(s, m);
    else {
      placeInBunker(m);
      if (driven(s, m)) { if (m.pose) m.face = m.pose.face; return; }
    }
  }
  if (m.inB < 0 && driven(s, m)) {
    if (m.pose) {
      const dx = m.pose.x - m.x, dz = m.pose.z - m.z, d = Math.hypot(dx, dz);
      if (d > 6) { m.x = m.pose.x; m.z = m.pose.z; }
      else if (d > 0) { const k = Math.min(1, 14 * dt / d); m.x += dx * k; m.z += dz * k; }
      m.y = m.pose.y; m.face = m.pose.face;
    }
    return;
  }
  let best = null, bd = Infinity;
  for (const b of s.bugs) {
    if (b.dead) continue;
    const d = Math.hypot(b.x - m.x, b.z - m.z) - b.r;
    if (d < T.range + reachBonus(m, b.y) && d < bd) { bd = d; best = b; }
  }
  let tx = null, tz = null; const o = m.order;
  if (m.inB >= 0) { /* stays put */ }
  else if (o.type === 'enter') {
    const k = BUNKERS[o.b];
    if (s.bk[o.b].hp <= 0) m.order = { type: 'hold', x: m.x, z: m.z };
    else if (Math.hypot(k.dx - m.x, k.dz - m.z) < 1.6 || Math.hypot(k.x - m.x, k.z - m.z) < k.r + m.r + 0.4) enterBunker(s, m, o.b);
    else { tx = k.dx; tz = k.dz; }
  }
  else if (o.type === 'move') { if (Math.hypot(o.x - m.x, o.z - m.z) < 0.7) m.order = { type: 'hold', x: o.x, z: o.z }; else { tx = o.x; tz = o.z; } }
  else if (o.type === 'patrol') {
    const px = o.leg ? o.bx : o.ax, pz = o.leg ? o.bz : o.az;
    if (Math.hypot(px - m.x, pz - m.z) < 0.8) o.leg = 1 - o.leg;
    if (!(best && bd < T.range * 0.85)) { tx = px; tz = pz; }
  } else if (Math.hypot(o.x - m.x, o.z - m.z) > 1.6) { tx = o.x; tz = o.z; }
  if (tx !== null) {
    const [wx, wz] = route(m.x, m.z, tx, tz);
    const dx = wx - m.x, dz = wz - m.z, d = Math.hypot(dx, dz) || 1, sp = T.speed * (best ? 0.8 : 1) * (stim ? STIM.speed : 1);
    const st = Math.min(d, sp * dt);
    m.x += dx / d * st; m.z += dz / d * st;
    if (!best) m.face = lerpAng(m.face, angTo(dx, dz), dt * 10);
  }
  m.fireCd -= dt;
  if (!best) { m.burst = 0; return; }
  m.face = lerpAng(m.face, angTo(best.x - m.x, best.z - m.z), dt * 14);
  if (m.fireCd > 0) return;
  // AI soldiers only shoot what they can see. A blocked shot retries soon.
  if (w.kind !== 'flame' && !losClear(m.x, m.y + T.eye - 0.2, m.z, best.x, best.y + 0.6, best.z, -1, s.bk)) { m.fireCd = 0.15; m.burst = 0; return; }
  if (m.burst <= 0) m.burst = w.n;
  m.burst--;
  const rate = stim ? STIM.rate : 1;
  m.fireCd = (m.burst > 0 ? w.gap : w.pause * (0.9 + rnd() * 0.2)) / rate;
  m.lastFire = s.now;
  aiFire(s, m, T, best);
}

// One AI shot (or one flame puff) from soldier `m` at bug `t`.
function aiFire(s, m, T, t) {
  const w = T.w, dmg = w.dmg * (m.owner ? 1 + s.C.heroDmg : 1), ay = m.y + T.eye - 0.4;
  if (w.kind === 'flame') {
    const fx = Math.sin(m.face + Math.PI), fz = Math.cos(m.face + Math.PI);
    for (const b of s.bugs) {
      if (b.dead) continue;
      const dx = b.x - m.x, dz = b.z - m.z, d = Math.hypot(dx, dz);
      if (d - b.r > w.reach || Math.abs(b.y - m.y) > 3.5) continue;
      if (d > 1 && (dx * fx + dz * fz) / d < Math.cos(w.cone)) continue;
      damage(s, b, dmg, null);
    }
    s.shots.push([m.x, ay, m.z, m.x + fx * w.reach, ay - 0.3, m.z + fz * w.reach, '', SHOT.flame]);
    return;
  }
  let acc = w.acc;
  if (t.burrowed && !T.detect) acc *= 0.5;
  const hit = rnd() < acc, miss = hit ? 0 : 3;
  s.shots.push([m.x, ay, m.z, t.x + (rnd() - 0.5) * miss, t.y + 0.6, t.z + (rnd() - 0.5) * miss, '', SHOT[w.kind]]);
  if (hit) damage(s, t, dmg, null);
}

/* What a bug goes for: the closest soldier within `within`, preferring ones
 * on its own level (a soldier up on a bluff is a long walk round). A soldier
 * inside a building means the building. Returns null for the relay.
 */
function pickTarget(s, b, within) {
  const lv = levelAt(b.x, b.z);
  let t = null, td = Infinity;
  for (const m of s.marines) {
    if (m.dead) continue;
    const k = m.inB >= 0 ? BUNKERS[m.inB] : null, x = k ? k.x : m.x, z = k ? k.z : m.z;
    const d = Math.hypot(x - b.x, z - b.z); if (d > within) continue;
    const score = d + ((k ? levelAt(k.dx, k.dz) : levelAt(m.x, m.z)) !== lv ? 30 : 0);
    if (score < td) { td = score; t = m; }
  }
  if (!t) return null;
  if (t.inB < 0) return { m: t, x: t.x, z: t.z, y: t.y, r: t.r, bi: -1 };
  const k = BUNKERS[t.inB];
  return { m: null, x: k.x, z: k.z, y: k.base, r: k.r, bi: k.i, h: BKIND[k.kind].h };
}
function hitTarget(s, t, amt) {
  if (!t) s.relayHp -= amt;
  else if (t.bi >= 0) damageBunker(s, t.bi, amt);
  else damage(s, t.m, amt, null);
}
// Walk a bug toward (tx, tz), round the cliffs, with a little weave.
function walkBug(s, b, tx, tz, dt, weave) {
  const [wx, wz] = route(b.x, b.z, tx, tz);
  const dx = wx - b.x, dz = wz - b.z, d = Math.hypot(dx, dz) || 1;
  const w = Math.sin(s.now * 1.3 + b.wob) * weave * Math.min(1, d / 15), ca = Math.cos(w), sa = Math.sin(w);
  const ux = dx / d, uz = dz / d, vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
  b.x += vx * b.speed * dt; b.z += vz * b.speed * dt; b.face = lerpAng(b.face, angTo(vx, vz), dt * 8);
}

function updateBug(s, b, dt) {
  if (b.dead) return;
  if (b.type === 'burrower') return updateBurrower(s, b, dt);
  const T = BUGT[b.type], t = pickTarget(s, b, 34);
  const tx = t ? t.x : RELAY.x, tz = t ? t.z : RELAY.z;
  const reach = T.range ? T.range + (t ? 0 : 3.6) : t ? b.r + t.r + 0.45 : b.r + 3.9;
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
  // Melee has to actually get there: no biting someone on the cliff above.
  const ty = t ? t.y : H(RELAY.x, RELAY.z);
  const sameLevel = T.range || Math.abs(ty - b.y) < 2.2 || (t && t.bi >= 0);
  b.atkCd -= dt;
  if (d > reach || !sameLevel) { walkBug(s, b, tx, tz, dt, 0.45); return; }
  b.face = lerpAng(b.face, angTo(dx, dz), dt * 10);
  if (b.atkCd > 0) return;
  b.atkCd = T.atk * (0.9 + rnd() * 0.2);
  b.lastAtk = s.now;
  if (!T.range) { hitTarget(s, t, T.dmg); return; }
  // Spitter: an acid spine. Needs a clear line to the target.
  const aimY = !t ? H(RELAY.x, RELAY.z) + 3 : t.bi >= 0 ? t.y + t.h * 0.7 : t.y + 1;
  if (t && !losClear(b.x, b.y + 1.3, b.z, tx, aimY, tz, t.bi, s.bk)) { b.atkCd = 0.3; walkBug(s, b, tx, tz, dt * 3, 0.2); return; }
  const hit = rnd() < (T.acc || 1), miss = hit ? 0 : 2.5;
  s.shots.push([b.x, b.y + 1.3, b.z, tx + (rnd() - 0.5) * miss, aimY, tz + (rnd() - 0.5) * miss, '', SHOT.spine]);
  if (hit) hitTarget(s, t, T.dmg);
}

/* Burrower: walks in, digs in once something is in range, then sends a line
 * of spikes through the ground every couple of seconds, hitting every
 * soldier standing along it. Digs back out if nothing is in reach for a bit.
 */
function updateBurrower(s, b, dt) {
  const T = BUGT.burrower, t = pickTarget(s, b, 34);
  const tx = t ? t.x : RELAY.x, tz = t ? t.z : RELAY.z;
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
  const gap = t ? d - (t.bi >= 0 ? t.r : 0) : d - 3.6;
  const reachable = !t || Math.abs(t.y - b.y) < 2.5;
  if (!b.burrowed) {
    if (b.bT > 0) { b.bT -= dt; if (b.bT <= 0) { b.burrowed = true; b.atkCd = 0.5; b.lost = 0; } return; }
    if (gap <= T.range - 1 && reachable) { b.bT = 0.8; return; }
    walkBug(s, b, tx, tz, dt, 0.3);
    return;
  }
  if (b.uT > 0) { b.uT -= dt; if (b.uT <= 0) b.burrowed = false; return; }
  if (gap > T.range + 0.5 || !reachable) { b.lost += dt; if (b.lost > 2) b.uT = 0.6; return; }
  b.lost = 0;
  b.face = lerpAng(b.face, angTo(dx, dz), dt * 8);
  b.atkCd -= dt;
  if (b.atkCd > 0) return;
  b.atkCd = T.atk;
  b.lastAtk = s.now;
  const ux = dx / d, uz = dz / d, ex = b.x + ux * T.range, ez = b.z + uz * T.range;
  for (const m of s.marines) {
    if (m.dead || m.inB >= 0 || Math.abs(m.y - b.y) > 2.5) continue;
    const along = (m.x - b.x) * ux + (m.z - b.z) * uz;
    if (along < 0 || along > T.range) continue;
    const off = Math.abs((m.x - b.x) * uz - (m.z - b.z) * ux);
    if (off <= T.width + m.r * 0.5) damage(s, m, T.dmg, null);
  }
  for (const k of BUNKERS) {
    if (s.bk[k.i].hp <= 0) continue;
    const along = (k.x - b.x) * ux + (k.z - b.z) * uz, off = Math.abs((k.x - b.x) * uz - (k.z - b.z) * ux);
    if (along > -k.r && along < T.range + k.r && off < k.r + T.width && Math.abs(k.base - b.y) < 2.5) damageBunker(s, k.i, T.dmg);
  }
  if (!t) s.relayHp -= T.dmg;
  s.shots.push([b.x, H(b.x, b.z), b.z, ex, H(ex, ez), ez, '', SHOT.lurk]);
}

// Bodies that separation and collisions must not shove: a Spear's body and a
// dug-in Burrower.
const fixed = (s, u) => (u.team === 'm' ? u.inB >= 0 || driven(s, u) : u.burrowed || u.bT > 0);
function separate(s, list, strength) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z, min = a.r + b.r + 0.15;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz) || 0.01; if (d >= min) continue;
      const push = (min - d) * 0.5 * strength, ux = dx / d, uz = dz / d;
      const pa = fixed(s, a) ? 0 : 1, pb = fixed(s, b) ? 0 : 1;
      a.x -= ux * push * pa; a.z -= uz * push * pa; b.x += ux * push * pb; b.z += uz * push * pb;
    }
  }
}
function pushBugsFromMarines(s) {
  for (const m of s.marines) { if (m.dead || m.inB >= 0) continue;
    for (const b of s.bugs) { if (b.dead || fixed(s, b)) continue;
      const dx = b.x - m.x, dz = b.z - m.z, min = m.r + b.r; if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz) || 0.01; if (d < min) { b.x = m.x + dx / d * min; b.z = m.z + dz / d * min; } } }
}

function leashTick(s, dt) {
  for (const sp of Object.values(s.spears)) {
    if (sp.state !== 'active' || !sp.leash) continue;
    const u = marineById(s, sp.unitId); if (!u) continue;
    const st = leashStatus(u, sp.leash, s.C, s.now);
    if (st.s === 'bad') {
      if (sp.outsideSince === null) sp.outsideSince = s.now;
      // Drain only while a person is actually driving the body.
      if (s.now - sp.outsideSince > 1.5 && sp.driven) damage(s, u, s.C.leashDrain * dt, null);
    } else sp.outsideSince = null;
  }
}

/* Nothing the AI moves may climb a cliff, whether it walked there or was
 * shoved: undo the part of the move that would. Dropping off is fine.
 */
function noClimb(u, px, pz) {
  const g0 = H(px, pz);
  const ok = (x, z) => { const run = Math.hypot(x - px, z - pz); return H(x, z) - g0 <= Math.max(0.35, run * 1.2); };
  if (ok(u.x, u.z)) return;
  if (ok(u.x, pz)) u.z = pz; else if (ok(px, u.z)) u.x = px; else { u.x = px; u.z = pz; }
}

export function step(s, dt) {
  if (s.phase !== 'play') return;
  s.now += dt;
  waves(s);
  const prev = new Map();
  for (const u of s.marines) if (!u.dead) prev.set(u, [u.x, u.z]);
  for (const u of s.bugs) if (!u.dead) prev.set(u, [u.x, u.z]);
  for (const m of s.marines) updateMarine(s, m, dt);
  for (const b of s.bugs) updateBug(s, b, dt);
  separate(s, s.marines, 1); separate(s, s.bugs, 0.8); pushBugsFromMarines(s);
  for (const u of s.marines) {
    if (u.dead || u.inB >= 0 || driven(s, u)) continue;
    collide(u); const p = prev.get(u); if (p) noClimb(u, p[0], p[1]); u.y = H(u.x, u.z);
  }
  for (const u of s.bugs) { if (u.dead) continue; collide(u); const p = prev.get(u); if (p) noClimb(u, p[0], p[1]); u.y = H(u.x, u.z); }
  bunkerTick(s, dt);
  leashTick(s, dt);
  if (s.relayHp <= 0) { s.relayHp = 0; endMatch(s, false); }
  for (const m of s.marines) if (m.dead) m.deathT += dt;
  for (const b of s.bugs) if (b.dead) b.deathT += dt;
  s.marines = s.marines.filter(m => !(m.dead && m.deathT > 2.6));
  s.bugs = s.bugs.filter(b => !(b.dead && b.deathT > 1.1));
}

// ---------- wire format ----------

const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
function orderArr(o) {
  if (o.type === 'enter') return ['e', o.b];
  if (o.type === 'patrol') return ['p', r1(o.ax), r1(o.az), r1(o.bx), r1(o.bz)];
  return [o.type === 'move' ? 'm' : 'h', r1(o.x), r1(o.z)];
}
function orderObj(a) {
  if (!a) return { type: 'hold' };
  if (a[0] === 'e') return { type: 'enter', b: a[1] };
  if (a[0] === 'p') return { type: 'patrol', ax: a[1], az: a[2], bx: a[3], bz: a[4] };
  return { type: a[0] === 'm' ? 'move' : 'hold', x: a[1], z: a[2] };
}

/* What the host broadcasts ~10 times a second. Arrays, not objects, to keep
 * it small; no nulls inside arrays, because the Realtime Database turns an
 * array with holes into an object.
 */
export function snapshot(s) {
  const sp = {};
  for (const [pid, v] of Object.entries(s.spears)) {
    sp[pid] = { n: v.name, u: v.unitId, s: v.state, hr: r2(v.hopReadyAt), du: r2(v.deadUntil), r: v.reason, k: v.kills, d: v.deaths, h: v.hops, dr: v.driven ? 1 : 0 };
    if (v.leash) sp[pid].l = { ...v.leash };
  }
  return {
    n: r2(s.now), w: s.waveN, a: s.waveActive ? 1 : 0, nw: r1(s.nextWaveAt), q: s.queue.length, rh: Math.round(s.relayHp), ph: s.phase,
    win: s.win === null ? -1 : s.win ? 1 : 0, lost: s.lost, C: s.C,
    m: s.marines.map(m => [m.id, SQUADS.indexOf(m.squad), m.name, r2(m.x), r2(m.y), r2(m.z), r2(m.face), r1(m.hp), r1(m.maxHp), m.dead ? 1 : 0, orderArr(m.order), m.owner || '',
      Math.max(0, MTYPE_LIST.indexOf(m.type)), m.stimUntil > s.now ? r1(m.stimUntil - s.now) : 0, s.now - (m.lastFire ?? -9) < 0.6 ? 1 : 0, m.inB + 1]),
    b: s.bugs.map(b => [b.id, Math.max(0, BTYPE_LIST.indexOf(b.type)), r2(b.x), r2(b.y), r2(b.z), r2(b.face), r1(b.hp), b.maxHp, b.dead ? 1 : 0, b.burrowed || b.bT > 0 ? 1 : 0, s.now - (b.lastAtk ?? -9) < 0.5 ? 1 : 0]),
    k: s.bk.map(b => Math.round(b.hp)),
    sp,
  };
}

const arr = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];

export function decode(snap) {
  const units = new Map();
  for (const a of arr(snap.m)) {
    units.set(a[0], { id: a[0], team: 'm', squad: SQUADS[a[1]], name: a[2], x: a[3], y: a[4], z: a[5], face: a[6], hp: a[7], maxHp: a[8], dead: !!a[9], order: orderObj(arr(a[10])), owner: a[11] || '',
      type: MTYPE_LIST[a[12]] || 'marine', stim: a[13] || 0, act: !!a[14], inB: (a[15] || 0) - 1 });
  }
  for (const a of arr(snap.b)) {
    units.set(a[0], { id: a[0], team: 's', type: BTYPE_LIST[a[1]] || 'ling', x: a[2], y: a[3], z: a[4], face: a[5], hp: a[6], maxHp: a[7], dead: !!a[8], burrowed: !!a[9], act: !!a[10] });
  }
  const spears = {};
  for (const [pid, v] of Object.entries(snap.sp || {})) {
    spears[pid] = { name: v.n, unitId: v.u || 0, state: v.s, hopReadyAt: v.hr || 0, deadUntil: v.du || 0, reason: v.r || '', leash: v.l || null, kills: v.k || 0, deaths: v.d || 0, hops: v.h || 0, driven: !!v.dr };
  }
  return {
    now: snap.n || 0, waveN: snap.w || 0, waveActive: !!snap.a, nextWaveAt: snap.nw || 0, queueN: snap.q || 0, relayHp: snap.rh ?? RELAY_MAX,
    phase: snap.ph || 'play', win: snap.win === 1 ? true : snap.win === 0 ? false : null, lost: snap.lost || 0, C: cleanConfig(snap.C), units, spears,
    bunkers: BUNKERS.map((k, i) => { const hp = arr(snap.k)[i]; return typeof hp === 'number' ? hp : BKIND[k.kind].hp; }),
  };
}

/* Blend two decoded views for smooth motion between snapshots. Positions
 * and facing come from the pair; everything else (hp, orders, who owns what)
 * from the newer one.
 */
export function interpolate(a, b, t) {
  if (!a) return b;
  t = Math.max(0, Math.min(1.25, t));
  const units = new Map();
  for (const [id, ub] of b.units) {
    const ua = a.units.get(id);
    if (!ua || ub.dead) { units.set(id, ub); continue; }
    units.set(id, { ...ub, x: ua.x + (ub.x - ua.x) * t, y: ua.y + (ub.y - ua.y) * t, z: ua.z + (ub.z - ua.z) * t, face: lerpAng(ua.face, ub.face, t) });
  }
  return { ...b, now: a.now + (b.now - a.now) * t, units };
}

// The whole match, for handing the simulation to a new host.
export function serialize(s) { return JSON.parse(JSON.stringify(s)); }
export function restore(data) {
  const s = JSON.parse(JSON.stringify(data));
  s.C = cleanConfig(s.C);
  s.marines = arr(s.marines); s.bugs = arr(s.bugs); s.queue = arr(s.queue); s.shots = []; s.events = [];
  s.spears = s.spears || {};
  for (const m of s.marines) { m.order = m.order || { type: 'hold', x: m.x, z: m.z }; m.owner = m.owner || ''; m.pose = null; m.type = m.type || 'marine'; m.stimUntil = m.stimUntil || 0; m.burst = m.burst || 0; m.inB = m.inB ?? -1; m.slot = m.slot || 0; }
  const bk = arr(s.bk);
  s.bk = BUNKERS.map((k, i) => ({ hp: BKIND[k.kind].hp, downAt: 0, ...(bk[i] || {}) }));
  for (const b of s.bugs) { b.burrowed = !!b.burrowed; b.bT = b.bT || 0; b.uT = b.uT || 0; b.lost = b.lost || 0; }
  s.reinforceN = s.reinforceN || 0;
  for (const sp of Object.values(s.spears)) { if (sp.outsideSince === undefined) sp.outsideSince = null; if (!sp.leash) sp.leash = null; }
  if (s.win === undefined) s.win = null;
  return s;
}
