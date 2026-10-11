/* Three.js scene: terrain, props, unit meshes, tracers and the leash
 * pillars. It only draws what it's given; the match lives in sim.js.
 * Three.js r128 is loaded as a global from cdnjs (see index.html).
 */
/* global THREE */

import { H, RELAY, SPAWNS, PROPS, seeded } from './map.js';

export const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#view'), antialias: true });
// Phones get a lighter load: fewer pixels and a smaller shadow map.
const LIGHT = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, LIGHT ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const SKY = 0x24303f;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 120, 320);
scene.add(new THREE.HemisphereLight(0xb9c8e0, 0x5a3a2a, 0.75));
const sun = new THREE.DirectionalLight(0xffe0bd, 1.05);
sun.position.set(-50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(LIGHT ? 1024 : 2048, LIGHT ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 220 });
sun.shadow.bias = -0.0008;
scene.add(sun);

export const rtsCam = new THREE.PerspectiveCamera(45, 1, 1, 700);
export const fpsCam = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
fpsCam.rotation.order = 'YXZ';
scene.add(fpsCam);

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.75 }, o));
const MAT = {
  armor: std(0x56789a, { metalness: 0.2, roughness: 0.55 }), armorDk: std(0x33475b),
  visor: std(0xffb347, { emissive: 0xff8a1f, emissiveIntensity: 0.9 }),
  gun: std(0x23272c, { roughness: 0.5 }), gold: std(0xffcc4d, { emissive: 0xb07a00, emissiveIntensity: 0.6 }),
  bug: std(0x6b2f5a), bugDk: std(0x3a1a35), brute: std(0x7d3350),
  eye: std(0xe7f05a, { emissive: 0xd9e84a, emissiveIntensity: 1.2 }),
  rock: std(0x7b5844, { roughness: 0.95 }), rock2: std(0x8c6a52, { roughness: 0.95 }),
  crystal: std(0x9be7ff, { emissive: 0x2a9cc4, emissiveIntensity: 0.5, roughness: 0.3 }),
  steel: std(0x8b939c, { metalness: 0.4, roughness: 0.45 }), core: std(0x7fe0ff, { emissive: 0x3ac8ff, emissiveIntensity: 1.2 }),
};

// ---------- terrain ----------
const SIZE = 200, SEG = 100;
let tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
tg.rotateX(-Math.PI / 2);
{ const p = tg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i))); }
tg = tg.toNonIndexed();
{
  const rng = seeded(4242);
  const p = tg.attributes.position, cols = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    THREE.Triangle.getNormal(a, b, c, n);
    const y = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3, slope = 1 - Math.abs(n.y);
    let hex = y > 14 ? 0x8f6450 : slope > 0.35 ? 0x7a4d3a : y > 5 ? 0xb57a4c : y > 2 ? 0xc48955 : 0xcf9a62;
    if (Math.hypot(cx - RELAY.x, cz - RELAY.z) < 11) hex = 0x6c737c;
    for (const [sx, sz] of SPAWNS) if (Math.hypot(cx - sx, cz - sz) < 13 + rng() * 3) hex = 0x4a2443;
    col.setHex(hex).offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = col.r; cols[(i + k) * 3 + 1] = col.g; cols[(i + k) * 3 + 2] = col.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
}
export const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
terrain.receiveShadow = true;
scene.add(terrain);

export const rockGroup = new THREE.Group(); scene.add(rockGroup);
for (const r of PROPS.rocks) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r.r, 0), r.alt ? MAT.rock : MAT.rock2);
  m.scale.set(1, r.sy, 1); m.rotation.set(r.rx, r.ry, r.rz);
  m.position.set(r.x, H(r.x, r.z) + r.r * 0.15, r.z); m.castShadow = m.receiveShadow = true;
  rockGroup.add(m);
}
for (const sp of PROPS.spires) {
  const g = new THREE.Group();
  for (const c of sp.crystals) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(c.rad, c.h, 5), MAT.crystal);
    s.position.set(c.ox, c.h / 2 - 0.3, c.oz); s.rotation.set(c.rx, 0, c.rz); s.castShadow = true; g.add(s);
  }
  g.position.set(sp.x, H(sp.x, sp.z), sp.z); rockGroup.add(g);
}

export const relayMesh = new THREE.Group();
let relayCore;
{
  const g = relayMesh, y0 = H(RELAY.x, RELAY.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.4, 8), MAT.steel); base.position.y = 0.7;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.9), MAT.armorDk); mast.position.y = 4;
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 0.25), MAT.steel); arm1.position.y = 5.6;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), MAT.core); core.position.y = 8;
  [base, mast, arm1, core].forEach(m => { m.castShadow = true; g.add(m); });
  g.position.set(RELAY.x, y0, RELAY.z); relayCore = core;
  scene.add(g);
}

// ---------- leash pillars ----------
const leashMat = new THREE.MeshBasicMaterial({ color: 0xff9f3a, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
const leashRingMat = new THREE.MeshBasicMaterial({ color: 0xff9f3a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
const pillars = [0, 1].map(() => {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 40, 1, true), leashMat); cyl.position.y = 18;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), leashRingMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  g.add(cyl, ring); g.visible = false; scene.add(g); return g;
});
export function drawLeash(L, R, status) {
  pillars.forEach(p => p.visible = false);
  if (!L) return;
  const pts = L.kind === 'point' ? [[L.x, L.z]] : [[L.ax, L.az], [L.bx, L.bz]];
  pts.forEach(([x, z], i) => { const p = pillars[i]; p.visible = true; p.position.set(x, H(x, z), z); p.scale.set(R, 1, R); });
  const col = status === 'bad' ? 0xff5a4f : status === 'ok' ? 0x7bd88f : 0xff9f3a;
  leashMat.color.setHex(col); leashRingMat.color.setHex(col);
}

// ---------- units ----------
const G = {
  body: new THREE.BoxGeometry(0.75, 0.8, 0.5), leg: new THREE.BoxGeometry(0.28, 0.7, 0.32), head: new THREE.BoxGeometry(0.5, 0.42, 0.48),
  visor: new THREE.BoxGeometry(0.42, 0.14, 0.06), pad: new THREE.BoxGeometry(0.32, 0.25, 0.56), gun: new THREE.BoxGeometry(0.12, 0.14, 0.95),
  band: new THREE.BoxGeometry(0.8, 0.12, 0.54), ring: new THREE.RingGeometry(0.75, 0.9, 28),
  tank: new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8), nozzle: new THREE.CylinderGeometry(0.07, 0.11, 0.7, 6).rotateX(Math.PI / 2),
  longGun: new THREE.BoxGeometry(0.08, 0.1, 1.55), scope: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6).rotateX(Math.PI / 2),
  sLeg: new THREE.BoxGeometry(0.32, 1.5, 0.4), sFoot: new THREE.BoxGeometry(0.5, 0.15, 0.8), sHip: new THREE.BoxGeometry(1.2, 0.3, 0.6),
  sBody: new THREE.BoxGeometry(1.3, 0.9, 1.1), sVisor: new THREE.BoxGeometry(0.7, 0.22, 0.06), sCannon: new THREE.BoxGeometry(0.18, 0.18, 1.3),
  sPod: new THREE.BoxGeometry(0.36, 0.36, 0.5), sBand: new THREE.BoxGeometry(1.36, 0.12, 1.16),
  lBody: new THREE.ConeGeometry(0.45, 1.3, 5).rotateX(-Math.PI / 2), lHead: new THREE.IcosahedronGeometry(0.32, 0),
  eye: new THREE.BoxGeometry(0.08, 0.08, 0.08), scythe: new THREE.ConeGeometry(0.08, 0.9, 4),
  bBody: new THREE.DodecahedronGeometry(1.1, 0), horn: new THREE.ConeGeometry(0.22, 1, 5),
  tail: new THREE.ConeGeometry(0.32, 1.4, 5).rotateX(Math.PI / 2), torso: new THREE.CylinderGeometry(0.26, 0.36, 1.2, 6),
  frill: new THREE.BoxGeometry(0.05, 0.7, 0.5), spine: new THREE.ConeGeometry(0.06, 0.45, 4),
  shell: new THREE.DodecahedronGeometry(0.9, 0), spike: new THREE.ConeGeometry(0.12, 1.4, 4), legSpike: new THREE.ConeGeometry(0.07, 0.9, 4),
};
MAT.torch = std(0x9a4f35, { metalness: 0.2, roughness: 0.55 });
MAT.shade = std(0x2b3340, { metalness: 0.3, roughness: 0.5 });
MAT.teal = std(0x7fe0ff, { emissive: 0x2ab8e8, emissiveIntensity: 1 });
MAT.stim = std(0xff5a4f, { emissive: 0xff2a1f, emissiveIntensity: 1.3 });
MAT.flameTip = std(0xff9f3a, { emissive: 0xff6a00, emissiveIntensity: 1 });
MAT.spit = std(0x5a3d6e); MAT.acid = std(0x9cf04a, { emissive: 0x6cc020, emissiveIntensity: 0.9 });
MAT.burrow = std(0x4f2a45);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7bd88f, side: THREE.DoubleSide });
const heroRingMat = new THREE.MeshBasicMaterial({ color: 0xffcc4d, side: THREE.DoubleSide });
const add = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
const RADIUS = { marine: 0.45, torch: 0.5, shade: 0.42, strider: 0.95 };

// A soldier of any type. `visor` swaps to red while stimmed.
function soldierMesh(type) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  let visor, visorMat = MAT.visor, band;
  if (type === 'strider') {
    for (const sx of [-0.45, 0.45]) { add(g, G.sLeg, MAT.armorDk, sx, 0.75, 0); add(g, G.sFoot, MAT.armorDk, sx, 0.08, -0.1); }
    add(g, G.sHip, MAT.steel, 0, 1.6, 0); add(g, G.sBody, MAT.armor, 0, 2.25, 0);
    visor = add(g, G.sVisor, MAT.visor, 0, 2.45, -0.56);
    for (const sx of [-0.85, 0.85]) { add(g, G.sCannon, MAT.gun, sx, 2.15, -0.4); add(g, G.sPod, MAT.armorDk, sx, 2.65, 0.05); }
    band = add(g, G.sBand, MAT.gold, 0, 2.72, 0);
  } else {
    const armor = type === 'torch' ? MAT.torch : type === 'shade' ? MAT.shade : MAT.armor;
    if (type === 'shade') visorMat = MAT.teal;
    add(g, G.leg, MAT.armorDk, -0.18, 0.35, 0); add(g, G.leg, MAT.armorDk, 0.18, 0.35, 0);
    add(g, G.body, armor, 0, 1.1, 0); add(g, G.head, MAT.armorDk, 0, 1.72, 0);
    visor = add(g, G.visor, visorMat, 0, 1.74, -0.25);
    if (type !== 'shade') { add(g, G.pad, armor, -0.5, 1.38, 0); add(g, G.pad, armor, 0.5, 1.38, 0); }
    if (type === 'torch') {
      add(g, G.tank, MAT.steel, -0.16, 1.15, 0.36); add(g, G.tank, MAT.steel, 0.16, 1.15, 0.36);
      add(g, G.nozzle, MAT.gun, 0.34, 1.1, -0.45); add(g, G.nozzle, MAT.gun, -0.34, 1.1, -0.45);
      add(g, G.eye, MAT.flameTip, 0.34, 1.1, -0.82).scale.setScalar(1.6); add(g, G.eye, MAT.flameTip, -0.34, 1.1, -0.82).scale.setScalar(1.6);
      g.scale.set(1.1, 1.05, 1.1);
    } else if (type === 'shade') {
      add(g, G.longGun, MAT.gun, 0.3, 1.25, -0.55); add(g, G.scope, MAT.teal, 0.3, 1.36, -0.45);
      g.scale.set(0.92, 1.04, 0.92);
    } else add(g, G.gun, MAT.gun, 0.32, 1.15, -0.45);
    band = add(g, G.band, MAT.gold, 0, 1.33, 0);
  }
  band.visible = false;
  const ring = new THREE.Mesh(G.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.visible = false; g.add(ring);
  const k = (RADIUS[type] || 0.45) / 0.45 / (g.scale.x || 1); ring.scale.set(k, k, 1);
  return { g, band, ring, visor, visorMat };
}

// Swarm. Parts sit in `inner` so a Burrower can sink into the ground.
function bugMesh(type) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  if (type === 'ling') {
    add(inner, G.lBody, MAT.bug, 0, 0.55, 0); add(inner, G.lHead, MAT.bugDk, 0, 0.6, -0.6);
    add(inner, G.eye, MAT.eye, -0.12, 0.68, -0.85); add(inner, G.eye, MAT.eye, 0.12, 0.68, -0.85);
    const s1 = add(inner, G.scythe, MAT.bugDk, -0.35, 0.95, -0.3); s1.rotation.set(-0.6, 0, 0.5);
    const s2 = add(inner, G.scythe, MAT.bugDk, 0.35, 0.95, -0.3); s2.rotation.set(-0.6, 0, -0.5);
  } else if (type === 'brute') {
    const b = add(inner, G.bBody, MAT.brute, 0, 1.2, 0); b.scale.set(1, 0.8, 1.3);
    add(inner, G.lHead, MAT.bugDk, 0, 1.15, -1.45).scale.set(1.8, 1.6, 1.8);
    add(inner, G.eye, MAT.eye, -0.25, 1.3, -1.95); add(inner, G.eye, MAT.eye, 0.25, 1.3, -1.95);
    const h1 = add(inner, G.horn, MAT.bugDk, -0.5, 1.9, -0.5); h1.rotation.set(-0.5, 0, 0.4);
    const h2 = add(inner, G.horn, MAT.bugDk, 0.5, 1.9, -0.5); h2.rotation.set(-0.5, 0, -0.4);
  } else if (type === 'spitter') {
    add(inner, G.tail, MAT.spit, 0, 0.35, 0.6);
    const t = add(inner, G.torso, MAT.spit, 0, 1.0, -0.05); t.rotation.x = -0.25;
    add(inner, G.lHead, MAT.bugDk, 0, 1.75, -0.35).scale.set(1.1, 0.9, 1.4);
    for (const sx of [-1, 1]) { const f = add(inner, G.frill, MAT.bugDk, sx * 0.32, 1.85, -0.3); f.rotation.set(0, 0, sx * 0.5); }
    add(inner, G.eye, MAT.acid, -0.12, 1.8, -0.75); add(inner, G.eye, MAT.acid, 0.12, 1.8, -0.75);
    for (let k = 0; k < 4; k++) { const sp = add(inner, G.spine, MAT.acid, 0, 1.55 - k * 0.25, 0.22 + k * 0.08); sp.rotation.x = 0.9; }
  } else {
    const b = add(inner, G.shell, MAT.burrow, 0, 0.75, 0); b.scale.set(1.2, 0.6, 1.4);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, sp = add(inner, G.spike, MAT.bugDk, Math.sin(a) * 0.45, 1.3, Math.cos(a) * 0.5);
      sp.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55);
      const lg = add(inner, G.legSpike, MAT.bugDk, Math.sin(a) * 0.9, 0.35, Math.cos(a) * 0.9);
      lg.rotation.set(Math.PI + Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
    }
    add(inner, G.eye, MAT.eye, -0.18, 0.95, -1.15); add(inner, G.eye, MAT.eye, 0.18, 0.95, -1.15);
  }
  return { g, inner };
}

/* Meshes keyed by unit id. `sync` creates, moves and retires them to match
 * the view it's given. Death animations run on a local clock from the moment
 * this browser first saw the unit dead.
 */
const meshes = new Map();
export function meshFor(id) { const e = meshes.get(id); return e ? e.g : null; }
export function sync(view, opts, dt) {
  const seen = new Set();
  for (const u of view.units.values()) {
    seen.add(u.id);
    let e = meshes.get(u.id);
    if (e && e.type !== u.type) { scene.remove(e.g); meshes.delete(u.id); e = null; }
    if (!e) {
      e = u.team === 'm' ? soldierMesh(u.type) : bugMesh(u.type);
      e.g.userData.unitId = u.id; e.team = u.team; e.type = u.type; e.deathT = 0; e.hitT = 0; e.lastHp = u.hp; e.wob = (u.id * 1.37) % 10; e.sink = 0;
      e.baseScale = e.g.scale.clone();
      scene.add(e.g); meshes.set(u.id, e);
    }
    if (u.dead) e.deathT += dt;
    if (u.hp < e.lastHp) e.hitT = 0.1;
    e.lastHp = u.hp; e.hitT -= dt;
    if (u.team === 'm') {
      e.g.position.set(u.x, u.y, u.z); e.g.rotation.y = u.face;
      e.band.visible = !!u.owner && !u.dead;
      e.ring.visible = !u.dead && opts.tophat && (opts.selected.has(u.id) || !!u.owner);
      e.ring.material = u.owner ? heroRingMat : ringMat;
      e.visor.material = u.stim > 0 && !u.dead ? MAT.stim : e.visorMat;
      e.g.visible = u.id !== opts.hideId;
      if (u.dead) { e.g.rotation.x = -Math.min(1, e.deathT / 0.35) * Math.PI / 2; e.g.position.y = u.y - Math.max(0, e.deathT - 0.8) * 1.5; }
      else e.g.rotation.x = 0;
    } else {
      e.g.position.set(u.x, u.y + (u.dead || u.burrowed ? 0 : Math.abs(Math.sin(view.now * 12 + e.wob)) * 0.08), u.z); e.g.rotation.y = u.face;
      e.sink += ((u.burrowed ? 1 : 0) - e.sink) * Math.min(1, dt * 3);
      e.inner.position.y = -0.95 * e.sink;
      if (u.dead) { const k = Math.max(0.01, 1 - e.deathT / 0.45); e.g.scale.set(1.2 - k * 0.2, k, 1.2 - k * 0.2); }
      else e.g.scale.setScalar(e.hitT > 0 ? 1.15 : 1);
    }
  }
  for (const [id, e] of meshes) if (!seen.has(id)) { scene.remove(e.g); meshes.delete(id); }
  relayCore.rotation.y += dt * 1.5; relayCore.position.y = 8 + Math.sin(view.now * 2) * 0.2;
}
export function clearUnits() { for (const e of meshes.values()) scene.remove(e.g); meshes.clear(); }
export function unitIdOf(o) { while (o && o.userData.unitId === undefined) o = o.parent; return o ? o.userData.unitId : null; }
export function unitMeshes(filter) { const out = []; for (const [id, e] of meshes) if (filter(id, e)) out.push(e.g); return out; }

// ---------- shots ----------
// Kinds match SHOT in config.js: 0 rifle, 2 flame, 3 snipe, 4 spine, 5 spike line, 6 cannon.
const lineMat = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
const LINE = { 0: lineMat(0xffd38a), p0: lineMat(0xfff1c2), 3: lineMat(0x9ff0ff), 4: lineMat(0xa8f060), 6: lineMat(0xffb347) };
const LIFE = { 0: 0.06, 3: 0.2, 4: 0.1, 6: 0.08 };
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
const flameGeo = new THREE.ConeGeometry(1, 1, 10, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
const spikeMat = std(0x3a1a35);
const spikeGeo = new THREE.ConeGeometry(0.22, 1.3, 4).translate(0, 0.65, 0);
let tracers = [];
const _d = new THREE.Vector3();
export function tracer(a, b, kind = 0, player = false) {
  if (kind === 2) {
    // Flame: a translucent cone from the nozzle, flaring out.
    const m = new THREE.Mesh(flameGeo, flameMat), len = a.distanceTo(b);
    m.position.copy(a); m.lookAt(b); m.scale.set(len * 0.32, len * 0.32, len);
    scene.add(m); tracers.push({ o: m, life: 0.14, grow: true }); return;
  }
  if (kind === 5) {
    // Spike line: spikes burst out of the ground along the line, then sink.
    const g = new THREE.Group(); _d.subVectors(b, a);
    for (let i = 1; i <= 8; i++) {
      const sp = new THREE.Mesh(spikeGeo, spikeMat), t = i / 8;
      sp.position.set(a.x + _d.x * t, H(a.x + _d.x * t, a.z + _d.z * t) - 0.2, a.z + _d.z * t);
      sp.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4); g.add(sp);
    }
    scene.add(g); tracers.push({ o: g, life: 0.45, spikes: true }); return;
  }
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(geo, kind === 0 && player ? LINE.p0 : LINE[kind] || LINE[0]);
  scene.add(l); tracers.push({ o: l, life: LIFE[kind] || 0.07, line: true });
}
export function tickTracers(dt) {
  for (const t of tracers) {
    t.life -= dt;
    if (t.grow) t.o.scale.multiplyScalar(1 + dt * 2);
    if (t.spikes) t.o.position.y = t.life < 0.2 ? -(0.2 - t.life) * 6 : 0;
  }
  tracers = tracers.filter(t => {
    if (t.life > 0) return true;
    scene.remove(t.o); if (t.line) t.o.geometry.dispose();
    return false;
  });
}

// ---------- first-person weapons ----------
// One model per weapon kind; setViewWeapon shows the one for the body you're in.
export const viewGun = new THREE.Group();
const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const VIEW = {
  rifle: { g: new THREE.Group(), muzzle: [0, 0.03, -0.64] },
  flame: { g: new THREE.Group(), muzzle: [0, 0.0, -0.7] },
  snipe: { g: new THREE.Group(), muzzle: [0, 0.03, -1.05] },
  cannon: { g: new THREE.Group(), muzzle: [0, 0.0, -0.9] },
};
VIEW.rifle.g.add(box(0.11, 0.14, 0.75, MAT.gun, 0, 0, -0.2), box(0.07, 0.18, 0.12, MAT.gun, 0, -0.13, -0.15),
  box(0.05, 0.05, 0.16, MAT.visor, 0, 0.1, -0.15), box(0.16, 0.16, 0.4, MAT.armor, 0.02, -0.12, 0.15));
{
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 8).rotateX(Math.PI / 2), MAT.gun); n.position.set(0, 0, -0.3);
  const tip = box(0.07, 0.07, 0.07, MAT.flameTip, 0, 0, -0.66);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), MAT.steel); tank.position.set(0.02, -0.14, -0.05);
  VIEW.flame.g.add(n, tip, tank, box(0.18, 0.18, 0.4, MAT.torch, 0.02, -0.12, 0.15));
}
VIEW.snipe.g.add(box(0.07, 0.1, 1.2, MAT.gun, 0, 0, -0.42), box(0.06, 0.06, 0.28, MAT.teal, 0, 0.1, -0.25),
  box(0.14, 0.14, 0.4, MAT.shade, 0.02, -0.12, 0.15));
VIEW.cannon.g.add(box(0.18, 0.18, 1.0, MAT.gun, 0, 0, -0.35), box(0.3, 0.26, 0.4, MAT.armor, 0.02, -0.08, 0.15),
  box(0.12, 0.12, 0.12, MAT.visor, 0, 0.14, -0.1));
for (const v of Object.values(VIEW)) { v.g.visible = false; viewGun.add(v.g); }
VIEW.rifle.g.visible = true;
export const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c2 }));
flash.position.set(0, 0.03, -0.64); flash.visible = false; viewGun.add(flash);
viewGun.position.set(0.26, -0.25, -0.45); fpsCam.add(viewGun);
export function setViewWeapon(kind) {
  const v = VIEW[kind] || VIEW.rifle;
  for (const x of Object.values(VIEW)) x.g.visible = x === v;
  flash.position.set(...v.muzzle);
  flash.scale.setScalar(kind === 'cannon' ? 2 : kind === 'flame' ? 0.01 : 1);
}

export function setFog(fps) { scene.fog.near = fps ? 45 : 120; scene.fog.far = fps ? 170 : 320; }
export function resize(W, Hh) {
  renderer.setSize(W, Hh, false);
  rtsCam.aspect = fpsCam.aspect = W / Hh; rtsCam.updateProjectionMatrix(); fpsCam.updateProjectionMatrix();
}
