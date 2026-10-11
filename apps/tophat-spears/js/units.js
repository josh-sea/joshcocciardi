/* Animated unit models. Loads the CC0 models in models/ (see CREDITS.md),
 * dresses them per unit type, and plays the right animation for what each
 * unit is doing. If the models fail to load, render.js keeps using its
 * built-in low-poly shapes, so the game never depends on this.
 *
 * Every model was exported at 1 unit tall, standing on 0, centred. Each type
 * is scaled to its real height here.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Phones skip unit shadows: dozens of animated shadow casters are their biggest cost.
const SHADOWS = !matchMedia('(pointer: coarse)').matches;
const FILES = ['trooper', 'strider', 'crawler', 'stalker', 'rifle', 'sniper', 'shotgun'];
const A = {};
export let ready = false;

export function loadModels(base = 'models/') {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return Promise.all(FILES.map(f => loader.loadAsync(base + f + '.glb').then(g => { A[f] = g; })))
    .then(() => { prepare(); ready = true; return true; })
    .catch(e => { console.warn('[units] models unavailable, using simple shapes:', e && e.message); return false; });
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.2 }, o));
const glow = c => std(c, { emissive: c, emissiveIntensity: 2.2, roughness: 0.4 });

/* How each soldier looks. Gritty: drab paint, dark undersuits, worn plates. */
const SOLDIER = {
  marine: { h: 1.8, armor: 0x4f5a41, plate: 0x3a4232, under: 0x1b1e1f, visor: 0xffa733, gun: 'rifle', gunLen: 0.85, bulk: 1 },
  torch: { h: 1.85, armor: 0x6e3b24, plate: 0x4a2a1c, under: 0x1d1917, visor: 0xff7a2a, gun: 'shotgun', gunLen: 0.9, bulk: 1.12, tanks: true },
  shade: { h: 1.82, armor: 0x2a3038, plate: 0x1f242b, under: 0x101215, visor: 0x7fe0ff, gun: 'sniper', gunLen: 1.35, bulk: 0.94, hood: true },
};
const BUG = {
  ling: { model: 'crawler', h: 0.95, tint: 0x8a5a86, glow: 0xff3fd0 },
  brute: { model: 'stalker', h: 2.5, tint: 0x8a3b32, glow: 0xff5a2a },
  spitter: { model: 'stalker', h: 1.45, tint: 0x6f8a3c, glow: 0xb6ff3a },
  burrower: { model: 'crawler', h: 1.55, tint: 0x5a3a5e, glow: 0xff3fd0 },
};
const STRIDER_H = 3.7;
let GUN_ROLL = 0;
export function setGunRoll(r) { GUN_ROLL = r; } // for tuning from the console

// Shared materials and bits, built once the models are in.
const M = {};

function prepare() {
  M.gunmetal = std(0x2a2d31, { metalness: 0.6, roughness: 0.45 });
  M.tank = std(0x5d5a52, { metalness: 0.5, roughness: 0.5 });
  M.gold = std(0xffcc4d, { emissive: 0xb07a00, emissiveIntensity: 0.8 });
  M.stim = glow(0xff3a2a);
  for (const [t, L] of Object.entries(SOLDIER)) {
    L.mArmor = std(L.armor, { roughness: 0.8, metalness: 0.25 });
    L.mPlate = std(L.plate, { roughness: 0.6, metalness: 0.45 });
    L.mUnder = std(L.under, { roughness: 0.9, metalness: 0.05 });
    L.mVisor = glow(L.visor);
  }
  for (const L of Object.values(BUG)) {
    L.mats = new Map();
    A[L.model].scene.traverse(o => {
      if (!o.isMesh || L.mats.has(o.material)) return;
      const m = o.material.clone();
      m.color = new THREE.Color(L.tint);
      m.emissive = new THREE.Color(L.glow); m.emissiveIntensity = 0.12;
      L.mats.set(o.material, m);
    });
  }
  // Which way each model faces (+1 = +z): toes, front feet and guns point forward.
  const facing = (model, front, back) => {
    const s = A[model].scene; s.updateMatrixWorld(true);
    const p = n => s.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    return p(front).z - p(back).z >= 0 ? 1 : -1;
  };
  FACE.trooper = facing('trooper', 'DEF-toeL', 'DEF-footL');
  FACE.strider = facing('strider', 'FootL', 'FootBackL');
  FACE.crawler = facing('crawler', 'GunL', 'Body');
  FACE.stalker = facing('stalker', 'GunL', 'Body');
}
// Our units face -z, so a model facing +z is turned around.
const FACE = {};
const turn = model => (FACE[model] > 0 ? Math.PI : 0);

/* Attach `mesh` to bone `name` of a cloned rig, sized and placed in the
 * model's own metres (x right, y up, z forward), as posed at bind time.
 */
function attach(root, name, mesh, off, height, fsign = 1) {
  const bone = root.getObjectByName(name);
  if (!bone) return null;
  root.updateMatrixWorld(true);
  const bw = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3();
  bone.matrixWorld.decompose(bw, bq, bs);
  const rq = new THREE.Quaternion(); root.getWorldQuaternion(rq);
  // Desired world placement: offset in model space from the bone.
  const ws = 1 / height; // model is 1 unit tall before the outer scale
  const target = bw.clone().add(new THREE.Vector3(-off[0] * fsign, off[1], off[2] * fsign).multiplyScalar(ws).applyQuaternion(rq));
  const inv = bone.matrixWorld.clone().invert();
  mesh.position.copy(target.applyMatrix4(inv));
  mesh.quaternion.copy(bq.clone().invert().multiply(rq));
  if (fsign < 0) mesh.rotateY(Math.PI);
  mesh.scale.setScalar(ws / bs.x);
  mesh.castShadow = SHADOWS;
  bone.add(mesh);
  return mesh;
}
/* A held weapon: laid along the forearm-to-hand line at bind pose, so it
 * points wherever the animation points the arm. `roll` turns it about its
 * barrel so the grip sits under the hand.
 */
function attachInHand(root, hand, forearm, mesh, along, height, roll = 0) {
  const h = root.getObjectByName(hand), f = root.getObjectByName(forearm);
  if (!h || !f) return null;
  root.updateMatrixWorld(true);
  const hp = h.getWorldPosition(new THREE.Vector3()), fp = f.getWorldPosition(new THREE.Vector3());
  const dir = hp.clone().sub(fp).normalize();
  const hq = h.getWorldQuaternion(new THREE.Quaternion()), hs = h.getWorldScale(new THREE.Vector3());
  const ws = 1 / height;
  const target = hp.clone().addScaledVector(dir, along * ws);
  mesh.position.copy(target.applyMatrix4(h.matrixWorld.clone().invert()));
  const dl = dir.clone().applyQuaternion(hq.clone().invert());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dl);
  mesh.rotateZ(roll);
  mesh.scale.setScalar(ws / hs.x);
  h.add(mesh);
  return mesh;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const sph = (r, m, sx = 1, sy = 1, sz = 1) => { const x = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); x.scale.set(sx, sy, sz); return x; };
const cyl = (r, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), m);

// A gun model laid along +z (forward), `len` metres long.
function gunMesh(kind, len) {
  const src = A[kind].scene.clone(true);
  const g = new THREE.Group();
  const bb = new THREE.Box3().setFromObject(src), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  src.position.sub(c);
  const holder = new THREE.Group(); holder.add(src);
  // The models lie along x: the rifle and shotgun with the muzzle at +x,
  // the sniper with it at -x.
  holder.rotation.y = kind === 'sniper' ? Math.PI / 2 : -Math.PI / 2;
  holder.scale.setScalar(len / size.x);
  g.add(holder);
  if (kind === 'shotgun') {
    // Flamer: a fuel line and a glowing pilot light at the nozzle.
    const tip = sph(0.035, glow(0xff8a2a)); tip.position.set(0, 0.02, len / 2 + 0.02); g.add(tip);
    const line = cyl(0.025, 0.4, M.tank); line.rotation.x = Math.PI / 2; line.position.set(0.05, -0.06, -0.1); g.add(line);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = SHADOWS; });
  return g;
}

// ---------- soldiers ----------
function makeSoldier(type) {
  const L = SOLDIER[type] || SOLDIER.marine;
  const root = SkeletonUtils.clone(A.trooper.scene);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = /Joint/i.test(o.material.name) ? L.mUnder : L.mArmor;
    o.castShadow = SHADOWS; o.frustumCulled = false;
  });
  const H = L.h, F = FACE.trooper;
  // Armor kit, in metres on a soldier this tall.
  attach(root, 'DEF-head', sph(0.128, L.mPlate, 1, 0.92, 1.1), [0, 0.045, -0.005], H, F);
  const visor = attach(root, 'DEF-head', box(0.17, 0.045, 0.05, L.mVisor), [0, 0.03, 0.105], H, F);
  attach(root, 'DEF-spine003', box(0.34 * L.bulk, 0.28, 0.24 * L.bulk, L.mPlate), [0, 0.0, 0.02], H, F);
  attach(root, 'DEF-spine002', box(0.3 * L.bulk, 0.34, 0.14, L.mUnder), [0, 0.04, -0.17], H, F);
  if (!L.hood) {
    attach(root, 'DEF-upper_armL', box(0.17 * L.bulk, 0.1, 0.19, L.mPlate), [0.02, 0.06, 0], H, F);
    attach(root, 'DEF-upper_armR', box(0.17 * L.bulk, 0.1, 0.19, L.mPlate), [-0.02, 0.06, 0], H, F);
  }
  if (L.tanks) {
    for (const x of [-0.08, 0.08]) { const t = cyl(0.075, 0.48, M.tank); attach(root, 'DEF-spine002', t, [x, 0.06, -0.27], H, F); }
  }
  const band = attach(root, 'DEF-upper_armL', box(0.15, 0.06, 0.15, M.gold), [0.02, -0.06, 0], H, F);
  band.visible = false;
  // Gun in the right hand, pointing forward along the arm's aim.
  const gun = gunMesh(L.gun, L.gunLen);
  attachInHand(root, 'DEF-handR', 'DEF-forearmR', gun, 0.12, H, GUN_ROLL);

  const g = new THREE.Group();
  root.rotation.y = turn('trooper');
  root.scale.setScalar(H);
  g.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const acts = {};
  for (const c of A.trooper.animations) acts[c.name] = mixer.clipAction(c);
  acts.Death.setLoop(THREE.LoopOnce, 1); acts.Death.clampWhenFinished = true;
  return { g, root, mixer, acts, visor, visorMat: L.mVisor, band, kind: 'soldier', height: H, radius: 0.45 * L.bulk };
}

// ---------- strider ----------
function makeStrider() {
  const root = SkeletonUtils.clone(A.strider.scene);
  root.traverse(o => { if (o.isMesh) { o.castShadow = SHADOWS; o.frustumCulled = false; } });
  const H = STRIDER_H, F = FACE.strider;
  // Twin cannons and a sensor bar on the pod.
  for (const x of [-0.62, 0.62]) {
    const c = new THREE.Group();
    const barrel = cyl(0.09, 1.1, M.gunmetal); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.45; c.add(barrel);
    const housing = box(0.26, 0.26, 0.5, M.gunmetal); c.add(housing);
    attach(root, 'Torso', c, [x, 0.25, 0.25], H, F);
  }
  const visor = attach(root, 'Head', box(0.5, 0.1, 0.06, glow(0xffa733)), [0, 0.1, 0.42], H, F);
  const band = attach(root, 'Torso', box(1.0, 0.08, 1.0, M.gold), [0, 0.6, 0], H, F);
  if (band) band.visible = false;
  const g = new THREE.Group();
  root.rotation.y = turn('strider');
  root.scale.setScalar(H);
  g.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const acts = {};
  for (const c of A.strider.animations) acts[c.name] = mixer.clipAction(c);
  acts.Death.setLoop(THREE.LoopOnce, 1); acts.Death.clampWhenFinished = true;
  return { g, root, mixer, acts, visor, visorMat: visor ? visor.material : null, band, kind: 'strider', height: H, radius: 0.95 };
}

// ---------- swarm ----------
function makeBug(type) {
  const L = BUG[type] || BUG.ling;
  const src = A[L.model];
  const root = SkeletonUtils.clone(src.scene);
  root.traverse(o => { if (o.isMesh) { o.material = L.mats.get(o.material) || o.material; o.castShadow = SHADOWS; o.frustumCulled = false; } });
  const inner = new THREE.Group(); inner.add(root);
  root.rotation.y = turn(L.model);
  root.scale.setScalar(L.h);
  const g = new THREE.Group(); g.add(inner);
  const mixer = new THREE.AnimationMixer(root);
  const acts = {};
  for (const c of src.animations) acts[c.name] = mixer.clipAction(c);
  acts.Death.setLoop(THREE.LoopOnce, 1); acts.Death.clampWhenFinished = true;
  return { g, root, inner, mixer, acts, kind: L.model, height: L.h };
}

/* A model entry for unit `u`, or null if the models aren't ready.
 * Adds an invisible hitbox for raycasts (cheap, and it doesn't move with
 * every animated finger).
 */
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
export function makeModel(u) {
  if (!ready) return null;
  const e = u.team === 'm' ? (u.type === 'strider' ? makeStrider() : makeSoldier(u.type)) : makeBug(u.type);
  const w = u.team === 'm' ? (u.type === 'strider' ? 1.8 : 0.7) : ({ ling: 1.0, brute: 2.4, spitter: 1.4, burrower: 1.7 })[u.type] || 1;
  const hb = box(w, e.height, w, hitMat); hb.position.y = e.height / 2;
  e.g.add(hb); e.hitbox = hb;
  e.anim = null;
  play(e, 'Idle', 0);
  e.mixer.update(Math.random() * 2);
  return e;
}

export function play(e, name, fade = 0.2, speed = 1) {
  const a = e.acts[name] || e.acts.Idle;
  if (e.anim === a) { a.timeScale = speed; return; }
  a.reset(); a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1);
  if (e.anim && fade > 0) a.crossFadeFrom(e.anim, fade, false); else if (e.anim) e.anim.stop();
  a.play();
  e.anim = a;
}

/* Pick the animation for what the unit is doing this frame.
 * `spd` is ground speed in m/s from the last frame's movement.
 */
export function animate(e, u, spd, dt) {
  if (u.dead) play(e, 'Death', 0.1);
  else if (e.kind === 'soldier') {
    if (spd > 3.8) play(e, 'Run', 0.2, spd / 4.6);
    else if (spd > 0.4) play(e, u.act ? 'Walk' : 'Walk', 0.2, Math.max(0.6, spd / 1.6));
    else play(e, u.act ? 'Shoot' : 'Idle', 0.15);
  } else if (e.kind === 'strider') {
    if (spd > 0.4) play(e, 'Walk', 0.25, Math.max(0.5, spd / 3));
    else play(e, u.act ? 'Shoot' : 'Idle', 0.2);
  } else {
    if (u.burrowed) play(e, e.acts.Burrow ? 'Burrow' : 'Idle', 0.3);
    else if (spd > 0.4) play(e, spd > 4.2 ? 'Run' : 'Walk', 0.15, Math.max(0.6, spd / (u.type === 'brute' ? 2.2 : 5)));
    else if (u.act) play(e, u.type === 'spitter' ? 'Spit' : u.type === 'brute' && e.acts.Charge ? 'Charge' : 'Attack', 0.1);
    else play(e, 'Idle', 0.25);
  }
  e.mixer.update(dt);
}

// First-person weapon models, keyed by weapon kind.
export function viewModel(kind) {
  if (!ready) return null;
  if (kind === 'rifle') return gunMesh('rifle', 0.85);
  if (kind === 'snipe') return gunMesh('sniper', 1.25);
  if (kind === 'flame') {
    const g = gunMesh('shotgun', 0.85);
    const t = cyl(0.06, 0.3, M.tank); t.position.set(0.02, -0.12, -0.05); g.add(t);
    return g;
  }
  return null;
}
