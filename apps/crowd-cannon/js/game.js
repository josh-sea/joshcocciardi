/* Crowd Cannon: the 3D scene and the simulation.
 *
 * Every crowd is one InstancedMesh, so a thousand runners cost one draw call.
 * Positions live in typed arrays and the instance matrices are written by
 * hand each frame (a Y rotation, a uniform scale and a translation).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './logic.js';
import { sfx } from './audio.js';

const COL = {
  blue: 0x2d7dff,
  gold: 0xffbe2e,
  red: 0xe5332a,
  brute: 0x8e1b2a,
  add: '#2f8dff',
  mul: '#b03cff',
  bonus: '#ffa31a',
  ogre: 0x74c043,
  white: 0xf1f5ff,
  bomb: 0x3b404d,
};

const THEMES = [
  { sky: 0xbfe3ff, fog: 0xe8d8b8, ground: 0xdcbc8a, track: 0x6c7079, rail: 0x8a5a34 }, // desert
  { sky: 0xa9dcff, fog: 0xcfe8c0, ground: 0x7cc46a, track: 0x6d7380, rail: 0x7b4f2e }, // meadow
  { sky: 0xcfe2f5, fog: 0xe6eef6, ground: 0xeef3f8, track: 0x737a88, rail: 0x5c6b80 }, // snow
];

const CELL = 1;
const GRID_COLS = 12;

/* ---- Geometry --------------------------------------------------------- */

function painted(geo, shade) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3).fill(shade);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// A chunky little runner that faces -z. Vertex colours are shades: the
// instance colour tints them, so one model serves both armies.
// style: 'plain', 'horns' (champion, brute), 'ogre', 'fluffy' (bruiser), 'bomb'.
function runnerGeometry(style = 'plain') {
  const parts = [];
  const add = (g, shade) => parts.push(painted(g, shade));
  if (style === 'bomb') {
    const ball = new THREE.SphereGeometry(0.33, 12, 8);
    ball.translate(0, 0.42, 0);
    add(ball, 1);
    const cap = new THREE.CylinderGeometry(0.1, 0.12, 0.1, 8);
    cap.translate(0, 0.78, 0);
    add(cap, 2.2);
    const fuse = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 5);
    fuse.rotateZ(0.4);
    fuse.translate(0.04, 0.9, 0);
    add(fuse, 4);
    const spark = new THREE.SphereGeometry(0.07, 6, 4);
    spark.translate(0.08, 1.0, 0);
    add(spark, 30);
  } else {
    const body = new THREE.CapsuleGeometry(0.27, 0.26, 3, 10);
    body.translate(0, 0.42, 0);
    add(body, 1);
    if (style === 'fluffy') {
      // Tufts of fur all over: little spheres around the body.
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const tuft = new THREE.IcosahedronGeometry(0.13, 0);
        tuft.translate(Math.cos(a) * 0.25, 0.3 + (k % 3) * 0.18, Math.sin(a) * 0.25);
        add(tuft, 0.92);
      }
      const top = new THREE.IcosahedronGeometry(0.2, 0);
      top.translate(0, 0.72, 0.02);
      add(top, 1);
    } else {
      const helmet = new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
      helmet.scale(1, 0.8, 1);
      helmet.translate(0, 0.6, 0);
      add(helmet, 0.55);
      const brim = new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12);
      brim.translate(0, 0.6, 0);
      add(brim, 0.4);
    }
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.065, 6, 4);
    eye.translate(s * 0.1, 0.5, style === 'bomb' ? -0.3 : -0.24);
    add(eye, style === 'bomb' ? 25 : 5);
    const foot = new THREE.BoxGeometry(0.13, 0.1, 0.2);
    foot.translate(s * 0.12, 0.05, -0.03);
    add(foot, 0.3);
  }
  if (style === 'horns' || style === 'ogre') {
    for (const s of [-1, 1]) {
      const horn = new THREE.ConeGeometry(0.08, 0.3, 6);
      horn.rotateZ(-s * 0.6);
      horn.translate(s * 0.25, 0.8, 0);
      add(horn, 3);
    }
    const belt = new THREE.CylinderGeometry(0.29, 0.29, 0.08, 12);
    belt.translate(0, 0.33, 0);
    add(belt, 0.25);
  }
  if (style === 'ogre') {
    // A big belly, fists and tusks.
    const belly = new THREE.SphereGeometry(0.24, 10, 8);
    belly.translate(0, 0.38, -0.12);
    add(belly, 1.15);
    for (const s of [-1, 1]) {
      const fist = new THREE.SphereGeometry(0.13, 8, 6);
      fist.translate(s * 0.36, 0.3, -0.08);
      add(fist, 0.7);
      const tusk = new THREE.ConeGeometry(0.035, 0.14, 5);
      tusk.translate(s * 0.08, 0.44, -0.27);
      add(tusk, 6);
    }
  }
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  nonIndexed.forEach((g) => g.deleteAttribute('uv'));
  return mergeGeometries(nonIndexed);
}

/* ---- A crowd of one kind of runner ------------------------------------ */

class Crowd {
  constructor(scene, geo, mat, cap, scale, color) {
    this.cap = cap;
    this.n = 0;
    this.scale = scale;
    this.x = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.fly = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.phase = new Float32Array(cap);
    this.hp = new Int16Array(cap);
    this.mask = new Uint32Array(cap);
    this.baseY = new Float32Array(cap);
    this.maxHp = new Int16Array(cap);
    this.shrink = false;   // draw hurt units smaller (ogres)
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const base = new THREE.Color(color), c = new THREE.Color();
    for (let i = 0; i < cap; i++) {
      c.copy(base).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.06);
      this.mesh.setColorAt(i, c);
    }
    scene.add(this.mesh);
  }
  add(x, z, hp, mask = 0, fly = 0, vx = 0) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.vx[i] = vx; this.fly[i] = fly;
    this.age[i] = 0; this.phase[i] = Math.random() * 6.28;
    this.hp[i] = hp; this.maxHp[i] = hp; this.mask[i] = mask; this.baseY[i] = 0;
    return i;
  }
  remove(i) {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.z[i] = this.z[j]; this.vx[i] = this.vx[j];
    this.fly[i] = this.fly[j]; this.age[i] = this.age[j]; this.phase[i] = this.phase[j];
    this.hp[i] = this.hp[j]; this.maxHp[i] = this.maxHp[j]; this.mask[i] = this.mask[j]; this.baseY[i] = this.baseY[j];
  }
  clear() { this.n = 0; this.mesh.count = 0; }
  draw(t, facing, extraScale = 1) {
    const a = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.n; i++) {
      const ph = this.phase[i];
      const grow = Math.min(1, 0.35 + this.age[i] * 5);
      let s = this.scale * grow * extraScale;
      if (this.shrink) s *= 0.7 + 0.3 * Math.max(0, this.hp[i]) / Math.max(1, this.maxHp[i]);
      const swing = Math.sin(t * 15 + ph);
      const ang = facing + swing * 0.18 + this.vx[i] * 0.1;
      const c = Math.cos(ang) * s, sn = Math.sin(ang) * s;
      let y = this.baseY[i] + Math.abs(swing) * 0.1 * this.scale;
      const f = this.fly[i];
      if (f > 0) { const p = f / 0.32; y += 4 * 1.3 * p * (1 - p); }
      const o = i * 16;
      a[o] = c; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
      a[o + 12] = this.x[i]; a[o + 13] = y; a[o + 14] = this.z[i]; a[o + 15] = 1;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* Spatial hash over the track, rebuilt every frame. */
class Grid {
  constructor(cap) { this.next = new Int32Array(cap); this.head = new Int32Array(1); }
  setup(zMin, zMax) {
    this.z0 = zMin;
    this.rows = Math.ceil((zMax - zMin) / CELL) + 1;
    this.head = new Int32Array(GRID_COLS * this.rows);
  }
  cx(x) { return Math.max(0, Math.min(GRID_COLS - 1, Math.floor((x + 6) / CELL))); }
  cz(z) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.z0) / CELL))); }
  build(c) {
    this.head.fill(-1);
    for (let i = 0; i < c.n; i++) {
      if (c.hp[i] <= 0) continue;
      const k = this.cz(c.z[i]) * GRID_COLS + this.cx(c.x[i]);
      this.next[i] = this.head[k];
      this.head[k] = i;
    }
  }
}

/* Little cubes that fly out when runners pop. */
class Particles {
  constructor(scene, color, cap) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3);
    this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.13, 0.13),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 }),
      cap,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  burst(x, y, z, count, speed = 3) {
    for (let k = 0; k < count && this.n < this.cap; k++) {
      const i = this.n++;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      const a = Math.random() * 6.28;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.v[i * 3] = Math.cos(a) * s;
      this.v[i * 3 + 1] = 2 + Math.random() * speed;
      this.v[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = 0.45 + Math.random() * 0.3;
    }
  }
  update(dt) {
    const a = this.mesh.instanceMatrix.array;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        this.life[i] = this.life[j];
        for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; }
        continue;
      }
      this.v[i * 3 + 1] -= 14 * dt;
      for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
      if (this.p[i * 3 + 1] < 0.06) { this.p[i * 3 + 1] = 0.06; this.v[i * 3 + 1] *= -0.3; }
    }
    for (let i = 0; i < this.n; i++) {
      const s = Math.min(1, this.life[i] * 3);
      const o = i * 16;
      a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
      a[o + 12] = this.p[i * 3]; a[o + 13] = this.p[i * 3 + 1]; a[o + 14] = this.p[i * 3 + 2]; a[o + 15] = 1;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

/* ---- Props ------------------------------------------------------------ */

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });
}

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

function makeCannon() {
  const g = new THREE.Group();
  const blue = std(0x2d6fe0), dark = std(0x1b2a4a), metal = std(0x9fb3c8, { metalness: 0.6, roughness: 0.3 });
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, 0.45, 20), blue));
  base.position.y = 0.25;
  g.add(base);
  const pivot = new THREE.Group();
  pivot.position.y = 0.75;
  g.add(pivot);
  const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 18), metal));
  barrel.rotation.x = Math.PI / 2 - 0.35;
  barrel.position.z = -0.45;
  pivot.add(barrel);
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 8, 18), blue));
  rim.position.set(0, 0.25, -1.15);
  rim.rotation.x = -0.35;
  pivot.add(rim);
  const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), blue));
  pivot.add(dome);
  for (const s of [-1, 1]) {
    const wheel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 18), dark));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 0.95, 0.42, 0.1);
    g.add(wheel);
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.07, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.userData = { pivot, ring };
  return g;
}

function gateTexture(gate) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const col = gate.bonus ? COL.bonus : gate.kind === 'mul' ? COL.mul : COL.add;
  x.fillStyle = col;
  x.globalAlpha = 0.55;
  x.fillRect(0, 0, 256, 128);
  x.globalAlpha = 0.25;
  x.fillStyle = '#ffffff';
  for (let i = -128; i < 256; i += 28) {
    x.beginPath();
    x.moveTo(i, 128); x.lineTo(i + 14, 128); x.lineTo(i + 142, 0); x.lineTo(i + 128, 0);
    x.fill();
  }
  x.globalAlpha = 1;
  x.font = '900 84px system-ui, -apple-system, Segoe UI, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = 'rgba(20,10,40,0.85)';
  const label = L.gateLabel(gate);
  x.strokeText(label, 128, 68);
  x.fillStyle = '#ffffff';
  x.fillText(label, 128, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeGate(gate) {
  const g = new THREE.Group();
  const col = gate.bonus ? COL.bonus : gate.kind === 'mul' ? COL.mul : COL.add;
  const frame = std(col, { emissive: col, emissiveIntensity: 0.25 });
  const h = 1.55;
  for (const s of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), frame));
    post.position.set(s * gate.w / 2, h / 2, 0);
    g.add(post);
  }
  const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(gate.w + 0.16, 0.16, 0.16), frame));
  top.position.y = h;
  g.add(top);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(gate.w, h - 0.15),
    new THREE.MeshBasicMaterial({ map: gateTexture(gate), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  panel.position.y = (h - 0.15) / 2 + 0.05;
  g.add(panel);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(gate.w, 1.2),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.02, 0.2);
  g.add(glow);
  g.position.set(gate.x, 0, gate.z);
  g.userData = { pulse: 0, frame };
  return g;
}

/* A barricade: a heavy block with hazard stripes and its hit points on the
 * front, redrawn whenever the number changes. */
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#ffcc00';
  x.fillRect(0, 0, 128, 16);
  x.fillStyle = '#1b1b1b';
  for (let i = -16; i < 128; i += 16) {
    x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 8, 16); x.lineTo(i + 24, 0); x.lineTo(i + 16, 0); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 3;
  return t;
}

function makeBarrier(b) {
  const g = new THREE.Group();
  const H = 1.25, D = 0.8;
  const block = shadowed(new THREE.Mesh(new THREE.BoxGeometry(b.w, H, D), std(0x3d424e, { roughness: 0.7 })));
  block.position.y = H / 2;
  g.add(block);
  const stripes = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 });
  for (const y of [0.12, H - 0.12]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.2, D + 0.04), stripes);
    band.position.y = y;
    g.add(band);
  }
  for (const s of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, H + 0.4, 10), std(0x8a8f99, { metalness: 0.5, roughness: 0.4 })));
    post.position.set(s * b.w / 2, (H + 0.4) / 2, 0);
    g.add(post);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.8, b.w * 0.8 * 96 / 256), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  label.position.set(0, H / 2, D / 2 + 0.01);
  g.add(label);
  g.position.set(b.x, 0, b.z);
  g.userData = { canvas, tex, shown: -1, hit: 0, block };
  drawBarrierLabel(g, b.hp);
  return g;
}

function drawBarrierLabel(g, hp) {
  const u = g.userData;
  const v = Math.max(0, Math.ceil(hp));
  if (v === u.shown) return;
  u.shown = v;
  const x = u.canvas.getContext('2d');
  x.clearRect(0, 0, 256, 96);
  x.font = '900 72px system-ui, -apple-system, Segoe UI, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = '#111';
  x.strokeText(String(v), 128, 52);
  x.fillStyle = '#fff';
  x.fillText(String(v), 128, 52);
  u.tex.needsUpdate = true;
}

function makeSpinner(h) {
  const g = new THREE.Group();
  const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 14), std(0x3b3f4a)));
  hub.position.y = 0.45;
  g.add(hub);
  const arm = new THREE.Group();
  arm.position.y = 0.5;
  g.add(arm);
  const bar = shadowed(new THREE.Mesh(new THREE.BoxGeometry(h.len, 0.3, h.thick), std(0xff8a1f)));
  arm.add(bar);
  for (const s of [-1, 1]) {
    const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), std(0xffffff)));
    cap.position.x = s * h.len / 2;
    arm.add(cap);
  }
  g.position.set(h.x, 0, h.z);
  g.userData = { arm };
  return g;
}

function makeFort(z) {
  const g = new THREE.Group();
  const wall = std(0xc8423a), dark = std(0x5a1a1a), trim = std(0xffd0a0), roof = std(0x7a1d26);
  const W = L.HALF_W + 0.6, gap = 1.7, H = 2.6;
  for (const s of [-1, 1]) {
    const w = W - gap;
    const block = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, H, 1.6), wall));
    block.position.set(s * (gap + w / 2), H / 2, 0);
    g.add(block);
    for (let k = 0; k < 3; k++) {
      const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 1.6), wall));
      m.position.set(s * (gap + 0.4 + k * (w - 0.8) / 2), H + 0.22, 0);
      g.add(m);
    }
    const tower = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, H + 1.6, 16), wall));
    tower.position.set(s * (W + 0.3), (H + 1.6) / 2, 0.1);
    g.add(tower);
    const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.6, 16), roof));
    cone.position.set(s * (W + 0.3), H + 1.6 + 0.8, 0.1);
    g.add(cone);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2), dark);
    pole.position.set(s * (W + 0.3), H + 3.4 + 0.4, 0.1);
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide }));
    flag.position.set(s * (W + 0.3) + 0.4, H + 3.4 + 0.75, 0.1);
    g.add(flag);
  }
  const lintel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.4, 0.8, 1.7), wall));
  lintel.position.y = H - 0.4;
  g.add(lintel);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(gap * 2, H - 0.8), new THREE.MeshBasicMaterial({ color: 0x1a0606 }));
  doorway.position.set(0, (H - 0.8) / 2, -0.5);
  g.add(doorway);
  const band = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.15, 1.7), trim));
  band.position.y = H - 0.9;
  g.add(band);
  g.position.z = z;
  return g;
}

function makeHomeWall() {
  const g = new THREE.Group();
  const m = std(0x2d6fe0), t = std(0xbfd7ff);
  const wall = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L.HALF_W * 2 + 1.2, 0.5, 0.6), m));
  wall.position.set(0, 0.25, 2.1);
  g.add(wall);
  for (let x = -L.HALF_W; x <= L.HALF_W; x += 1.25) {
    const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), t));
    b.position.set(x, 0.67, 2.1);
    g.add(b);
  }
  return g;
}

/* ---- The game --------------------------------------------------------- */

// Your squad. r is the body radius used for contact.
const KINDS = {
  runner:  { speed: 7.4, r: 0.25 },
  bruiser: { speed: 6.0, r: 0.42 },
  bomber:  { speed: 6.8, r: 0.3 },
  champ:   { speed: 4.2, r: 0.6 },
};
// Their army. Ogres are slow; brutes a little slow.
const FOES = {
  grunt: { r: 0.25, pace: 1 },
  brute: { r: 0.55, pace: 0.78 },
  ogre:  { r: 1.45, pace: 0.55 },
};

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0xd8b98a, 1.1);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const geo = {
      plain: runnerGeometry('plain'),
      horns: runnerGeometry('horns'),
      ogre: runnerGeometry('ogre'),
      fluffy: runnerGeometry('fluffy'),
      bomb: runnerGeometry('bomb'),
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
    const crowd = (g, cap, scale, color, kind) => Object.assign(new Crowd(scene, g, mat, cap, scale, color), { kind, grid: new Grid(cap) });

    this.runners = crowd(geo.plain, 1500, 1, COL.blue, 'runner');
    this.bruisers = crowd(geo.fluffy, 220, 1.55, COL.white, 'bruiser');
    this.bombers = crowd(geo.bomb, 150, 1.05, COL.bomb, 'bomber');
    this.champs = crowd(geo.horns, 24, 2.3, COL.gold, 'champ');
    this.grunts = crowd(geo.plain, 1600, 1, COL.red, 'grunt');
    this.brutes = crowd(geo.horns, 90, 2.15, COL.brute, 'brute');
    this.ogres = crowd(geo.ogre, 16, 4.4, COL.ogre, 'ogre');
    this.ogres.shrink = true;
    this.squads = [this.runners, this.bruisers, this.bombers, this.champs];
    this.foes = [this.grunts, this.brutes, this.ogres];

    this.decor = new Crowd(scene, geo.plain, mat, 420, 0.9, COL.red);
    this.decor.mesh.castShadow = false;
    this.blueFx = new Particles(scene, COL.blue, 1500);
    this.redFx = new Particles(scene, COL.red, 1500);
    this.goldFx = new Particles(scene, 0xffd23a, 800);
    this.whiteFx = new Particles(scene, 0xe8eeff, 600);
    this.fireFx = new Particles(scene, 0xff7a1a, 900);
    this.rubbleFx = new Particles(scene, 0x50555f, 500);
    this.fx = [this.blueFx, this.redFx, this.goldFx, this.whiteFx, this.fireFx, this.rubbleFx];

    this.cannon = makeCannon();
    scene.add(this.cannon);
    scene.add(makeHomeWall());

    this.world = null;
    this.state = 'menu';
    this.t = 0;
    this.input = { holding: false, keyFire: false, left: false, right: false, lastX: 0 };
    this.cannonX = 0;
    this.shake = 0;
    this.hudTick = 0;

    this.bindInput();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  /* Build the track, gates and forts for a level. */
  load(level, stats) {
    if (this.world) {
      this.scene.remove(this.world);
      this.world.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
    this.level = level;
    this.stats = stats;
    const th = THEMES[level.theme];
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.fog, 70, 170);
    this.hemi.groundColor.set(th.ground);

    const w = this.world = new THREE.Group();
    const len = level.length;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), std(th.ground, { roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -len / 2);
    ground.receiveShadow = true;
    w.add(ground);

    const trackLen = len + 8;
    const track = new THREE.Mesh(new THREE.BoxGeometry(L.HALF_W * 2 + 0.6, 0.1, trackLen), std(th.track, { roughness: 0.85 }));
    track.position.set(0, -0.04, -trackLen / 2 + 4);
    track.receiveShadow = true;
    w.add(track);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    for (const x of [-1.75, 1.75]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, trackLen - 6), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, -trackLen / 2 + 2);
      w.add(line);
    }

    // Fences: instanced posts plus two long rails per side.
    const postGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
    const railMat = std(th.rail);
    const count = Math.ceil(trackLen / 1.2) * 2;
    const posts = new THREE.InstancedMesh(postGeo, railMat, count);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const s of [-1, 1]) {
      for (let z = 3; z > -len - 1 && k < count; z -= 1.2) {
        m.makeTranslation(s * (L.HALF_W + 0.35), 0.35, z);
        posts.setMatrixAt(k++, m);
      }
      for (const y of [0.3, 0.6]) {
        const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, len + 4), railMat));
        rail.position.set(s * (L.HALF_W + 0.35), y, -len / 2 + 1);
        w.add(rail);
      }
    }
    posts.count = k;
    posts.castShadow = true;
    w.add(posts);

    // Tiered stands behind the fort, where the reserve army waits.
    const standMat = std(level.boss ? 0x7a2a3a : 0xa0443c, { roughness: 0.8 });
    for (let k = 0; k < 7; k++) {
      const step = shadowed(new THREE.Mesh(new THREE.BoxGeometry(26, 1 + k * 0.55, 1.8), standMat));
      step.position.set(0, (1 + k * 0.55) / 2, -len - 2.6 - k * 1.8);
      w.add(step);
    }

    this.fort = makeFort(-len);
    if (level.boss) this.fort.scale.set(1.12, 1.25, 1);
    this.fortScaleY = this.fort.scale.y;
    w.add(this.fort);

    this.gateObjs = level.gates.map((g) => { const o = makeGate(g); w.add(o); return o; });
    this.spinObjs = level.spinners.map((h) => { const o = makeSpinner(h); w.add(o); return o; });
    this.barObjs = level.barriers.map((b) => { const o = makeBarrier(b); w.add(o); return o; });

    // Side scenery so the arena is not bare.
    const rockMat = std(level.theme === 2 ? 0xffffff : 0xb08a5c, { roughness: 1 });
    const treeMat = std(level.theme === 2 ? 0x4f7a6a : 0x4fa043, { roughness: 0.9 });
    const r = L.rng(level.n * 31 + 7);
    for (let i = 0; i < 40; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (L.HALF_W + 2 + r() * 14);
      const z = 4 - r() * (len + 20);
      const tree = r() < 0.5;
      const o = shadowed(tree
        ? new THREE.Mesh(new THREE.ConeGeometry(0.6 + r() * 0.6, 1.8 + r() * 1.6, 7), treeMat)
        : new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + r() * 0.8), rockMat));
      o.position.set(x, tree ? 1 : 0.2, z);
      o.rotation.y = r() * 6;
      w.add(o);
    }

    this.scene.add(w);

    const sun = this.sun;
    sun.position.set(10, 26, -len * 0.35 + 12);
    sun.target.position.set(0, 0, -len * 0.45);
    const sc = sun.shadow.camera;
    const span = len * 0.62 + 10;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 1; sc.far = 90;
    sc.updateProjectionMatrix();

    const zMin = -len - 4;
    for (const c of [...this.squads, ...this.foes]) c.grid.setup(zMin, 6);

    // Reserve army: rows of red runners on the stands.
    this.decor.clear();
    for (let row = 0; row < 14; row++) {
      for (let col = 0; col < 30; col++) {
        const i = this.decor.add(-11.6 + col * 0.8 + (row % 2) * 0.4, -len - 2.2 - row * 0.9, 1);
        this.decor.age[i] = 1;
        this.decor.baseY[i] = 1 + Math.floor(row / 2) * 0.55;
      }
    }
    this.decorFull = this.decor.n;

    this.reset();
    this.resize();
  }

  reset() {
    for (const c of [...this.squads, ...this.foes]) c.clear();
    for (const p of this.fx) p.clear();
    const lv = this.level, e = lv.enemy;
    this.fortHp = lv.fortHp;
    this.homeMax = lv.homeHp + this.stats.homeBonus;
    this.homeHp = this.homeMax;
    this.charge = 0;
    this.ready = false;
    this.fireAcc = 0;
    this.spawnAcc = 0;
    this.burstT = e.burstEvery;
    this.bruteT = e.bruteEvery || Infinity;
    this.ogreT = e.ogreEvery ? (lv.boss ? e.delay + 3 : e.ogreEvery * 0.7) : Infinity;
    this.playT = 0;
    this.endT = 0;
    this.cannonX = 0;
    this.fort.scale.y = this.fortScaleY;
    this.fort.position.y = 0;
    this.fort.rotation.z = 0;
    this.fired = 0;
    this.shots = 0;
    this.gateHits = 0;
    this.ended = false;
    this.input.holding = false;
    this.input.keyFire = false;
    this.barriers = lv.barriers.map((b) => ({ ...b }));
    this.barObjs.forEach((o, i) => { o.visible = true; o.scale.set(1, 1, 1); drawBarrierLabel(o, this.barriers[i].hp); });
  }

  start() {
    this.reset();
    this.state = 'play';
    // Head start: a squad already on the track.
    for (let k = 0; k < this.stats.startSquad; k++) {
      this.runners.add((Math.random() - 0.5) * 4, -1.6 - Math.random() * 2.5, 1, 0, 0, 0);
    }
  }
  pause(v) { if (this.state === 'play' || this.state === 'paused') this.state = v ? 'paused' : 'play'; }
  toMenu() { this.reset(); this.state = 'menu'; }

  /* ---- Input ---- */
  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      if (this.state !== 'play') return;
      this.input.holding = true;
      this.input.lastX = e.clientX;
      c.setPointerCapture?.(e.pointerId);
      this.ui.onFirstInput?.();
    };
    const move = (e) => {
      if (!this.input.holding) return;
      const dx = e.clientX - this.input.lastX;
      this.input.lastX = e.clientX;
      const perPx = (L.HALF_W * 2 * 1.25) / Math.max(320, c.clientWidth);
      this.cannonX = clampX(this.cannonX + dx * perPx);
    };
    const up = () => { this.input.holding = false; };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    const key = (v) => (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.input.left = v;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.input.right = v;
      else if (k === ' ') { this.input.keyFire = v; if (v) this.ui.onFirstInput?.(); }
      else return;
      if (this.state === 'play') e.preventDefault();
    };
    window.addEventListener('keydown', key(true));
    window.addEventListener('keyup', key(false));
    window.addEventListener('blur', () => { this.input.holding = this.input.keyFire = this.input.left = this.input.right = false; });
  }

  resize() {
    const c = this.canvas;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    // Keep the whole track width in view near the cannon on a tall phone.
    const need = 13, dist = 31;
    const hfov = 2 * Math.atan(need / 2 / dist);
    const vfovForWidth = 2 * Math.atan(Math.tan(hfov / 2) / cam.aspect) * 180 / Math.PI;
    cam.fov = Math.min(66, Math.max(52, vfovForWidth));
    // Nudge the picture up so the cannon clears the bottom HUD.
    cam.setViewOffset(w, h, 0, h * 0.075, w, h);
    cam.updateProjectionMatrix();
  }

  /* ---- Simulation ---- */
  shoot() {
    const st = this.stats;
    const x = this.cannonX + (Math.random() - 0.5) * 0.3;
    this.fired++;
    this.cannon.userData.pivot.position.z = 0.25;
    if (this.ready) {
      this.ready = false;
      this.charge = 0;
      this.champs.add(x, -1.4, st.champHp, 0, 0.32);
      sfx.champ();
      this.shake = Math.max(this.shake, 0.25);
      return;
    }
    const kind = L.shotKind(++this.shots, st);
    if (kind === 'bruiser') { this.bruisers.add(x, -1.3, st.bruiserHp, 0, 0.32); sfx.thud(); }
    else if (kind === 'bomber') { this.bombers.add(x, -1.3, 1, 0, 0.32); sfx.fuse(); }
    else {
      this.runners.add(x, -1.2, 1, 0, 0.32, (Math.random() - 0.5) * 0.6);
      if (Math.random() < st.doubleChance) this.runners.add(x + 0.3, -1.2, 1, 0, 0.36, 0.8);
      sfx.shot();
    }
    this.charge++;
    if (this.charge >= st.chargeShots) { this.ready = true; sfx.ready(); }
  }

  spawnFoe(kind, x, z, vx) {
    const e = this.level.enemy;
    if (kind === 'ogre') { this.ogres.add(x, z, e.ogreHp, 0, 0, vx); sfx.roar(); this.shake = Math.max(this.shake, 0.3); }
    else if (kind === 'brute') this.brutes.add(x, z, e.bruteHp, 0, 0, vx);
    else this.grunts.add(x, z, 1, 0, 0, vx);
  }

  /* A packed block of grunts pouring out of the fort gate. */
  rush(count) {
    const z0 = -this.level.length + 1.2;
    for (let k = 0; k < count; k++) {
      const col = k % 7, row = Math.floor(k / 7);
      this.spawnFoe('grunt', (col - 3) * 0.48 + (Math.random() - 0.5) * 0.2, z0 - row * 0.5, (col - 3) * 0.5 + (Math.random() - 0.5));
    }
  }

  /* Calls fn(j) for every live unit of crowd c within r of (x, z), until fn
   * returns true. Uses the crowd's grid, built this frame. */
  near(c, x, z, r, fn) {
    const g = c.grid, head = g.head, next = g.next, r2 = r * r;
    const rc = Math.ceil(r / CELL), cx = g.cx(x), cz = g.cz(z);
    for (let dz = -rc; dz <= rc; dz++) {
      const rz = cz + dz;
      if (rz < 0 || rz >= g.rows) continue;
      for (let dx = -rc; dx <= rc; dx++) {
        const rx = cx + dx;
        if (rx < 0 || rx >= GRID_COLS) continue;
        for (let j = head[rz * GRID_COLS + rx]; j >= 0; j = next[j]) {
          if (c.hp[j] <= 0 || c.fly[j] > 0) continue;
          const ddx = x - c.x[j], ddz = z - c.z[j];
          if (ddx * ddx + ddz * ddz > r2) continue;
          if (fn(j)) return true;
        }
      }
    }
    return false;
  }

  explode(x, z) {
    const st = this.stats;
    for (const F of this.foes) {
      this.near(F, x, z, st.bomberRadius + FOES[F.kind].r, (j) => { F.hp[j] -= st.bomberDmg; });
    }
    this.fireFx.burst(x, 0.5, z, 26, 6);
    this.goldFx.burst(x, 0.5, z, 10, 4);
    sfx.boom();
    this.shake = Math.max(this.shake, 0.3);
  }

  hitBarrier(i, dmg, x) {
    const b = this.barriers[i], o = this.barObjs[i];
    b.hp -= dmg;
    o.userData.hit = 1;
    this.rubbleFx.burst(x, 0.9, b.z + 0.45, 1, 2.5);
    if (b.hp <= 0) {
      b.hp = 0;
      o.visible = false;
      this.rubbleFx.burst(b.x, 0.7, b.z, 60, 6);
      this.goldFx.burst(b.x, 0.7, b.z, 20, 5);
      sfx.crumble();
      this.shake = Math.max(this.shake, 0.35);
    } else sfx.crack();
    drawBarrierLabel(o, b.hp);
  }

  moveSquad(c, dt) {
    const lv = this.level, t = this.t, fortZ = -lv.length, st = this.stats;
    const kind = c.kind, speed = KINDS[kind].speed;
    const gates = lv.gates, spins = lv.spinners, bars = this.barriers;
    const wall = L.HALF_W - 0.3;
    // Gates copy runners as runners; specials come out with plain runners.
    const cloneInto = this.runners;
    const play = this.state === 'play';
    outer: for (let i = c.n - 1; i >= 0; i--) {
      c.age[i] += dt;
      if (c.fly[i] > 0) c.fly[i] = Math.max(0, c.fly[i] - dt);
      const z0 = c.z[i];
      const z1 = z0 - speed * dt;
      c.z[i] = z1;
      c.vx[i] *= Math.exp(-dt * 3);
      let x = c.x[i] + c.vx[i] * dt;
      if (z1 < fortZ + 7) {
        const target = Math.max(-1.3, Math.min(1.3, x));
        x += (target - x) * Math.min(1, dt * 3.5);
      }
      c.x[i] = x = Math.max(-wall, Math.min(wall, x));
      if (c.fly[i] > 0) continue;

      // Barricades: the unit spends itself on the block.
      for (let b = 0; b < bars.length; b++) {
        const bar = bars[b];
        if (bar.hp <= 0) continue;
        const front = bar.z + 0.45;
        if (z0 > front && z1 <= front && Math.abs(x - bar.x) <= bar.w / 2 + 0.1) {
          const dmg = L.barrierDamage(kind, c.hp[i], st);
          if (kind === 'bomber') { this.fireFx.burst(x, 0.6, front, 16, 5); sfx.boom(); }
          this.hitBarrier(b, dmg, x);
          c.remove(i);
          continue outer;
        }
      }

      // Gates: each unit can use each gate once; clones inherit that.
      for (let g = 0; g < gates.length; g++) {
        const bit = 1 << g;
        if (c.mask[i] & bit) continue;
        const gate = gates[g];
        if (!L.crossesGate(gate, t, x, z0, z1)) continue;
        c.mask[i] |= bit;
        this.gateHits++;
        const gx = L.gateX(gate, t);
        const make = L.gateClones(gate);
        const mask = kind === 'runner' ? c.mask[i] : 0;
        for (let k = 0; k < make; k++) {
          const nx = gx + (Math.random() - 0.5) * gate.w * 0.85;
          const j = cloneInto.add(nx, gate.z - 0.1 - Math.random() * 0.7, 1, mask | bit, 0, (nx - gx) * 0.6);
          if (j < 0) break;
        }
        this.gateObjs[g].userData.pulse = 1;
        sfx.gate(gate.kind === 'mul');
      }

      if (kind === 'runner' || kind === 'bomber') {
        for (let s = 0; s < spins.length; s++) {
          if (L.hitsSpinner(spins[s], t, x, z1, KINDS[kind].r)) {
            (kind === 'bomber' ? this.fireFx : this.blueFx).burst(x, 0.4, z1, 3, 4);
            c.remove(i);
            sfx.pop();
            continue outer;
          }
        }
      }

      if (z1 <= fortZ + 0.9) {
        if (play) { this.fortHp -= L.fortDamage(kind, st); sfx.hit(); }
        const fx = kind === 'champ' ? this.goldFx : kind === 'bruiser' ? this.whiteFx : kind === 'bomber' ? this.fireFx : this.blueFx;
        fx.burst(x, 1, fortZ + 0.9, kind === 'runner' ? 2 : 12, 3);
        if (kind === 'champ' || kind === 'bomber') this.shake = Math.max(this.shake, 0.3);
        c.remove(i);
      }
    }
  }

  moveFoes(c, dt) {
    const wall = L.HALF_W - 0.3, r = FOES[c.kind].r;
    const speed = this.level.enemy.speed * FOES[c.kind].pace;
    const bars = this.barriers;
    for (let i = c.n - 1; i >= 0; i--) {
      c.age[i] += dt;
      const z = c.z[i] += speed * dt;
      c.vx[i] *= Math.exp(-dt * 1.4);
      let x = c.x[i] + c.vx[i] * dt + Math.sin(this.t * 2 + c.phase[i]) * 0.3 * dt;
      // Walk around standing barricades, toward the middle of the track.
      for (let b = 0; b < bars.length; b++) {
        const bar = bars[b];
        if (bar.hp <= 0 || Math.abs(z - bar.z) > 0.4 + r) continue;
        const edge = bar.w / 2 + r;
        if (Math.abs(x - bar.x) < edge) x = bar.x - Math.sign(bar.x) * edge;
      }
      const lim = wall - (c.kind === 'ogre' ? 0.8 : 0);
      c.x[i] = Math.max(-lim, Math.min(lim, x));
      if (z >= L.FORT_LINE) {
        if (this.state === 'play') {
          this.homeHp -= L.WALL_DAMAGE[c.kind];
          this.shake = Math.max(this.shake, c.kind === 'grunt' ? 0.15 : 0.45);
          sfx.hurt();
        }
        this.redFx.burst(c.x[i], 0.5, z, c.kind === 'grunt' ? 4 : 20, 3);
        c.remove(i);
      }
    }
  }

  /* Push units of one crowd apart so they read as a mob, not a stack. */
  separate(c, minD) {
    const g = c.grid, head = g.head, next = g.next, md2 = minD * minD;
    for (let i = 0; i < c.n; i++) {
      if (c.hp[i] <= 0 || c.fly[i] > 0) continue;
      const x = c.x[i], z = c.z[i];
      const cx = g.cx(x), cz = g.cz(z);
      let px = 0, pz = 0, seen = 0;
      for (let dz = -1; dz <= 1 && seen < 10; dz++) {
        const rz = cz + dz;
        if (rz < 0 || rz >= g.rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const rx = cx + dx;
          if (rx < 0 || rx >= GRID_COLS) continue;
          for (let j = head[rz * GRID_COLS + rx]; j >= 0 && seen < 10; j = next[j]) {
            if (j === i) continue;
            const ddx = x - c.x[j], ddz = z - c.z[j];
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < md2 && d2 > 1e-6) {
              const d = Math.sqrt(d2), f = (minD - d) / d * 0.5;
              px += ddx * f; pz += ddz * f; seen++;
            }
          }
        }
      }
      c.x[i] += px * 0.5;
      c.z[i] += pz * 0.25;
    }
  }

  /* Blue meets red: hit points trade one for one. */
  fight() {
    const front = [this.runners, this.bruisers];
    for (const c of [...this.squads, ...this.foes]) c.grid.build(c);
    for (const F of this.foes) {
      const rF = FOES[F.kind].r;
      for (let i = 0; i < F.n; i++) {
        if (F.hp[i] <= 0) continue;
        for (const P of front) {
          this.near(P, F.x[i], F.z[i], rF + KINDS[P.kind].r, (j) => {
            const trade = Math.min(F.hp[i], P.hp[j]);
            F.hp[i] -= trade; P.hp[j] -= trade;
            return F.hp[i] <= 0;
          });
          if (F.hp[i] <= 0) break;
        }
      }
    }
    // Champions plough through and trade blows with the big ones.
    const C = this.champs;
    for (let i = 0; i < C.n; i++) {
      if (C.hp[i] <= 0 || C.fly[i] > 0) continue;
      for (const F of this.foes) {
        this.near(F, C.x[i], C.z[i], KINDS.champ.r + FOES[F.kind].r, (j) => {
          const trade = Math.min(F.hp[j], C.hp[i]);
          F.hp[j] -= trade; C.hp[i] -= trade;
          return C.hp[i] <= 0;
        });
        if (C.hp[i] <= 0) break;
      }
    }
    // Bombers go off at the first touch of red.
    const B = this.bombers;
    for (let i = 0; i < B.n; i++) {
      if (B.hp[i] <= 0 || B.fly[i] > 0) continue;
      const touch = this.foes.some((F) => this.near(F, B.x[i], B.z[i], KINDS.bomber.r + FOES[F.kind].r + 0.15, () => true));
      if (touch) { B.hp[i] = 0; this.explode(B.x[i], B.z[i]); }
    }
  }

  sweep(c, fx, n, cap = 60) {
    let popped = 0;
    for (let i = c.n - 1; i >= 0; i--) {
      if (c.hp[i] > 0) continue;
      if (fx && popped < cap) fx.burst(c.x[i], 0.45 * c.scale, c.z[i], n, 3);
      popped++;
      c.remove(i);
    }
    return popped;
  }

  update(dt) {
    const lv = this.level, e = lv.enemy;
    const play = this.state === 'play';
    if (play) this.playT += dt;

    // Cannon
    if (play) {
      const kx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      if (kx) this.cannonX = clampX(this.cannonX + kx * 9 * dt);
      if (this.input.holding || this.input.keyFire) {
        this.fireAcc += dt * this.stats.shotsPerSec;
        while (this.fireAcc >= 1) { this.fireAcc -= 1; this.shoot(); }
      } else {
        this.fireAcc = Math.min(this.fireAcc, 0.9);
      }
    }
    const cn = this.cannon;
    cn.position.x += (this.cannonX - cn.position.x) * Math.min(1, dt * 18);
    const pv = cn.userData.pivot;
    pv.position.z += (0 - pv.position.z) * Math.min(1, dt * 14);
    const ring = cn.userData.ring;
    ring.material.opacity = this.ready ? 0.6 + Math.sin(this.t * 10) * 0.35 : 0;
    ring.scale.setScalar(this.ready ? 1 + Math.sin(this.t * 10) * 0.05 : 1);

    // Their army
    if (play && this.playT > e.delay) {
      const z0 = -lv.length + 1.2;
      const rage = 1 + (1 - Math.max(0, this.fortHp) / lv.fortHp) * 0.8;
      this.spawnAcc += e.rate * rage * dt;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.spawnFoe('grunt', (Math.random() - 0.5) * 2.6, z0, (Math.random() - 0.5) * 5); }
      if ((this.burstT -= dt) <= 0) { this.burstT = e.burstEvery; this.rush(e.burst); }
      if ((this.bruteT -= dt) <= 0) { this.bruteT = e.bruteEvery; this.spawnFoe('brute', (Math.random() - 0.5) * 2, z0, (Math.random() - 0.5) * 2); }
      if ((this.ogreT -= dt) <= 0) { this.ogreT = e.ogreEvery; this.spawnFoe('ogre', 0, z0 - 0.5, (Math.random() - 0.5) * 1.5); }
    }

    for (const c of this.squads) this.moveSquad(c, dt);
    for (const c of this.foes) this.moveFoes(c, dt);

    this.fight();
    if (this.sweep(this.runners, this.blueFx, 2)) sfx.pop();
    if (this.sweep(this.bruisers, this.whiteFx, 6)) sfx.pop();
    this.sweep(this.bombers, null, 0);
    if (this.sweep(this.champs, this.goldFx, 18)) { sfx.hit(); this.shake = Math.max(this.shake, 0.2); }
    this.sweep(this.grunts, this.redFx, 2);
    if (this.sweep(this.brutes, this.redFx, 16)) sfx.hit();
    if (this.sweep(this.ogres, this.redFx, 50)) { sfx.crumble(); this.shake = Math.max(this.shake, 0.5); }

    this.runners.grid.build(this.runners);
    this.separate(this.runners, 0.42);
    this.bruisers.grid.build(this.bruisers);
    this.separate(this.bruisers, 0.75);
    this.grunts.grid.build(this.grunts);
    this.separate(this.grunts, 0.42);

    // Gates, spinners, barricades
    const t = this.t;
    lv.gates.forEach((g, i) => {
      const o = this.gateObjs[i];
      o.position.x = L.gateX(g, t);
      const u = o.userData;
      u.pulse = Math.max(0, u.pulse - dt * 4);
      o.scale.set(1 + u.pulse * 0.06, 1 + u.pulse * 0.12, 1);
      u.frame.emissiveIntensity = 0.25 + u.pulse * 0.9;
    });
    lv.spinners.forEach((h, i) => { this.spinObjs[i].userData.arm.rotation.y = -L.spinnerAngle(h, t); });
    this.barObjs.forEach((o) => {
      const u = o.userData;
      u.hit = Math.max(0, u.hit - dt * 6);
      o.position.y = u.hit * 0.05;
      o.scale.set(1 + u.hit * 0.03, 1, 1);
    });

    // Win and lose
    if (play && this.fortHp <= 0) {
      this.fortHp = 0;
      this.state = 'won';
      this.endT = 0;
      sfx.win();
      this.shake = 0.6;
      for (let k = 0; k < 8; k++) this.redFx.burst((Math.random() - 0.5) * 10, 2, -lv.length, 20, 6);
      for (const c of this.foes) for (let i = 0; i < c.n; i++) c.hp[i] = 0;
    } else if (play && this.homeHp <= 0) {
      this.homeHp = 0;
      this.state = 'lost';
      this.endT = 0;
      sfx.lose();
      this.shake = 0.5;
      for (const c of this.squads) for (let i = 0; i < c.n; i++) c.hp[i] = 0;
    }
    if (this.state === 'won' || this.state === 'lost') {
      this.endT += dt;
      if (this.state === 'won') {
        const k = Math.min(1, this.endT / 0.8);
        this.fort.scale.y = this.fortScaleY * (1 - k * 0.8);
        this.fort.position.y = -k * 0.3;
        this.fort.rotation.z = Math.sin(this.endT * 30) * 0.02 * (1 - k);
      }
      if (this.endT > 1.4 && !this.ended) {
        this.ended = true;
        this.ui.onEnd?.(this.state === 'won', {
          homeHp: Math.max(0, this.homeHp), homeMax: this.homeMax, fortHp: Math.max(0, this.fortHp), fired: this.fired,
        });
      }
    }

    // Reserve army thins as the fort weakens.
    const frac = Math.max(0, this.fortHp) / lv.fortHp;
    this.decor.n = Math.ceil(this.decorFull * (this.state === 'menu' ? 1 : frac));
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.level) return;
    dt = Math.min(dt, 1 / 30);
    const paused = this.state === 'paused';
    if (!paused) {
      this.t += dt;
      if (this.state !== 'menu') this.update(dt);
      else this.idle(dt);
    }

    for (const c of this.squads) c.draw(this.t, 0);
    for (const c of this.foes) c.draw(this.t * (c.kind === 'ogre' ? 0.45 : c.kind === 'brute' ? 0.7 : 1), Math.PI);
    this.decor.draw(this.t * 0.5, Math.PI);
    for (const p of this.fx) p.update(paused ? 0 : dt);

    this.placeCamera(dt);
    this.renderer.render(this.scene, this.camera);

    if (++this.hudTick % 3 === 0) this.pushHud();
  }

  idle() {
    const lv = this.level, t = this.t;
    lv.gates.forEach((g, i) => { this.gateObjs[i].position.x = L.gateX(g, t); });
    lv.spinners.forEach((h, i) => { this.spinObjs[i].userData.arm.rotation.y = -L.spinnerAngle(h, t); });
    this.cannon.position.x = Math.sin(t * 0.8) * 1.5;
  }

  placeCamera(dt) {
    const cam = this.camera, len = this.level.length;
    const menu = this.state === 'menu';
    const sway = menu ? Math.sin(this.t * 0.25) * 1.2 : this.cannon.position.x * 0.12;
    cam.position.set(sway, 27, 19);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    cam.lookAt(sway * 0.5, 0, -len * 0.4);
  }

  pushHud() {
    const lv = this.level;
    // Where the fort's health bar goes on screen.
    const v = new THREE.Vector3(0, 4.2, -lv.length).project(this.camera);
    const c = this.canvas;
    this.ui.onHud?.({
      fortHp: Math.max(0, Math.ceil(this.fortHp)),
      fortMax: lv.fortHp,
      homeHp: Math.max(0, this.homeHp),
      homeMax: this.homeMax,
      charge: this.ready ? 1 : this.charge / this.stats.chargeShots,
      ready: this.ready,
      units: this.runners.n + this.bruisers.n + this.bombers.n + this.champs.n,
      enemies: this.grunts.n + this.brutes.n + this.ogres.n,
      ogres: this.ogres.n,
      barX: (v.x * 0.5 + 0.5) * c.clientWidth,
      barY: (-v.y * 0.5 + 0.5) * c.clientHeight,
    });
  }
}

function clampX(x) { return Math.max(-(L.HALF_W - 0.7), Math.min(L.HALF_W - 0.7, x)); }

export function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
