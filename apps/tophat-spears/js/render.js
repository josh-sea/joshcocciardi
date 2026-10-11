/* Three.js scene: terrain, props, unit meshes, tracers and the leash
 * pillars. It only draws what it's given; the match lives in sim.js.
 * Three.js r128 is loaded as a global from cdnjs (see index.html).
 */
/* global THREE */

import { H, RELAY, SPAWNS, PROPS, seeded } from './map.js';

export const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#view'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
sun.shadow.mapSize.set(2048, 2048);
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
  lBody: new THREE.ConeGeometry(0.45, 1.3, 5).rotateX(-Math.PI / 2), lHead: new THREE.IcosahedronGeometry(0.32, 0),
  eye: new THREE.BoxGeometry(0.08, 0.08, 0.08), scythe: new THREE.ConeGeometry(0.08, 0.9, 4),
  bBody: new THREE.DodecahedronGeometry(1.1, 0), horn: new THREE.ConeGeometry(0.22, 1, 5),
};
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7bd88f, side: THREE.DoubleSide });
const heroRingMat = new THREE.MeshBasicMaterial({ color: 0xffcc4d, side: THREE.DoubleSide });
const add = (g, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

function marineMesh() {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  add(g, G.leg, MAT.armorDk, -0.18, 0.35, 0); add(g, G.leg, MAT.armorDk, 0.18, 0.35, 0);
  add(g, G.body, MAT.armor, 0, 1.1, 0); add(g, G.head, MAT.armorDk, 0, 1.72, 0); add(g, G.visor, MAT.visor, 0, 1.74, -0.25);
  add(g, G.pad, MAT.armor, -0.5, 1.38, 0); add(g, G.pad, MAT.armor, 0.5, 1.38, 0); add(g, G.gun, MAT.gun, 0.32, 1.15, -0.45);
  const band = add(g, G.band, MAT.gold, 0, 1.33, 0); band.visible = false;
  const ring = new THREE.Mesh(G.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.visible = false; g.add(ring);
  return { g, band, ring };
}
function bugMesh(type) {
  const g = new THREE.Group();
  if (type === 'ling') {
    add(g, G.lBody, MAT.bug, 0, 0.55, 0); add(g, G.lHead, MAT.bugDk, 0, 0.6, -0.6);
    add(g, G.eye, MAT.eye, -0.12, 0.68, -0.85); add(g, G.eye, MAT.eye, 0.12, 0.68, -0.85);
    const s1 = add(g, G.scythe, MAT.bugDk, -0.35, 0.95, -0.3); s1.rotation.set(-0.6, 0, 0.5);
    const s2 = add(g, G.scythe, MAT.bugDk, 0.35, 0.95, -0.3); s2.rotation.set(-0.6, 0, -0.5);
  } else {
    const b = add(g, G.bBody, MAT.brute, 0, 1.2, 0); b.scale.set(1, 0.8, 1.3);
    add(g, G.lHead, MAT.bugDk, 0, 1.15, -1.45).scale.set(1.8, 1.6, 1.8);
    add(g, G.eye, MAT.eye, -0.25, 1.3, -1.95); add(g, G.eye, MAT.eye, 0.25, 1.3, -1.95);
    const h1 = add(g, G.horn, MAT.bugDk, -0.5, 1.9, -0.5); h1.rotation.set(-0.5, 0, 0.4);
    const h2 = add(g, G.horn, MAT.bugDk, 0.5, 1.9, -0.5); h2.rotation.set(-0.5, 0, -0.4);
  }
  return g;
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
    if (!e) {
      if (u.team === 'm') { const mm = marineMesh(); e = { g: mm.g, band: mm.band, ring: mm.ring }; }
      else e = { g: bugMesh(u.type) };
      e.g.userData.unitId = u.id; e.team = u.team; e.deathT = 0; e.hitT = 0; e.lastHp = u.hp; e.wob = (u.id * 1.37) % 10;
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
      e.g.visible = u.id !== opts.hideId;
      if (u.dead) { e.g.rotation.x = -Math.min(1, e.deathT / 0.35) * Math.PI / 2; e.g.position.y = u.y - Math.max(0, e.deathT - 0.8) * 1.5; }
      else e.g.rotation.x = 0;
    } else {
      e.g.position.set(u.x, u.y + (u.dead ? 0 : Math.abs(Math.sin(view.now * 12 + e.wob)) * 0.08), u.z); e.g.rotation.y = u.face;
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

// ---------- tracers ----------
const tracerMat = { m: new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.85 }), p: new THREE.LineBasicMaterial({ color: 0xfff1c2 }) };
let tracers = [];
export function tracer(a, b, player) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, player ? tracerMat.p : tracerMat.m);
  scene.add(l); tracers.push({ l, life: 0.07 });
}
export function tickTracers(dt) {
  for (const t of tracers) t.life -= dt;
  tracers = tracers.filter(t => { if (t.life > 0) return true; scene.remove(t.l); t.l.geometry.dispose(); return false; });
}

// ---------- first-person gun ----------
export const viewGun = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.75), MAT.gun); body.position.z = -0.2;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.12), MAT.gun); mag.position.set(0, -0.13, -0.15);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), MAT.visor); sight.position.set(0, 0.1, -0.15);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.4), MAT.armor); arm.position.set(0.02, -0.12, 0.15);
  viewGun.add(body, mag, sight, arm);
}
export const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c2 }));
flash.position.set(0, 0.03, -0.64); flash.visible = false; viewGun.add(flash);
viewGun.position.set(0.26, -0.25, -0.45); fpsCam.add(viewGun);

export function setFog(fps) { scene.fog.near = fps ? 45 : 120; scene.fog.far = fps ? 170 : 320; }
export function resize(W, Hh) {
  renderer.setSize(W, Hh, false);
  rtsCam.aspect = fpsCam.aspect = W / Hh; rtsCam.updateProjectionMatrix(); fpsCam.updateProjectionMatrix();
}
