/* Weapon and impact effects: particles, tracers, beams and flash lights.
 *
 * Two particle pools share one simple shader: an additive one for anything
 * that glows (fire, sparks, flashes, acid) and a normal one for anything
 * that hangs in the air (smoke, dust, ichor). Tracers are stretched boxes in
 * one InstancedMesh that fly from muzzle to target and set off an impact
 * when they land. A handful of point lights are reused for muzzle flashes
 * and fire so the scene lights up without adding lights on the fly.
 *
 * Everything is pooled and capped, so a big fight costs the same few draw
 * calls as a quiet one.
 */
import * as THREE from 'three';

const LIGHT = matchMedia('(pointer: coarse)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- colour ramps: t (0..1 of life) -> [r, g, b, a] ----------
const lerp = (a, b, t) => a + (b - a) * t;
// Writes the colour at t into out[o..o+3] (no allocation; this runs per particle per frame).
function ramp(stops, t, out, o) {
  let i = 1;
  while (i < stops.length - 1 && t > stops[i][0]) i++;
  const a = stops[i - 1], b = stops[i], k = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  out[o] = lerp(a[1], b[1], k); out[o + 1] = lerp(a[2], b[2], k); out[o + 2] = lerp(a[3], b[3], k); out[o + 3] = lerp(a[4], b[4], k);
}
const RAMPS = {
  // Flamethrower: white-hot core, orange body, dull red edge.
  fire: [[0, 1.5, 1.1, 0.55, 0.0], [0.08, 1.4, 0.8, 0.28, 0.75], [0.35, 1.15, 0.38, 0.07, 0.6], [0.7, 0.55, 0.12, 0.03, 0.35], [1, 0.15, 0.04, 0.02, 0]],
  spark: [[0, 2.4, 1.7, 0.8, 1], [0.6, 1.8, 0.8, 0.2, 0.8], [1, 0.8, 0.2, 0.05, 0]],
  flash: [[0, 3, 2.3, 1.2, 1], [1, 1.5, 0.6, 0.15, 0]],
  acid: [[0, 1.4, 3.2, 0.6, 1], [1, 0.4, 1.4, 0.1, 0]],
  ember: [[0, 3, 1.2, 0.2, 1], [1, 1.2, 0.2, 0.05, 0]],
  smoke: [[0, 0.32, 0.3, 0.28, 0], [0.15, 0.3, 0.28, 0.26, 0.45], [1, 0.22, 0.21, 0.2, 0]],
  // The solid body of a flame: reads as fire even on bright sand, where glow alone washes out.
  flameBody: [[0, 1.0, 0.85, 0.4, 0.0], [0.08, 1.0, 0.6, 0.12, 0.9], [0.45, 0.9, 0.28, 0.04, 0.75], [0.75, 0.35, 0.1, 0.03, 0.45], [1, 0.1, 0.08, 0.07, 0]],
  soot: [[0, 0.12, 0.1, 0.09, 0], [0.2, 0.12, 0.1, 0.09, 0.6], [1, 0.1, 0.1, 0.1, 0]],
  dust: [[0, 0.62, 0.47, 0.32, 0.55], [1, 0.55, 0.42, 0.3, 0]],
  ichor: [[0, 0.42, 0.08, 0.36, 1], [1, 0.2, 0.03, 0.18, 0]],
  gore: [[0, 0.5, 0.9, 0.15, 1], [1, 0.2, 0.4, 0.05, 0]],
};
const RAMP_IDS = Object.keys(RAMPS);
const RAMP_LIST = RAMP_IDS.map(k => RAMPS[k]);

const vert = `
attribute float size; attribute vec4 rgba; varying vec4 vC;
uniform float scale; uniform float maxPx;
void main() {
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * scale / max(0.1, -mv.z), maxPx);
  gl_Position = projectionMatrix * mv;
}`;
const frag = `
varying vec4 vC;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vC.a * smoothstep(1.0, 0.15, d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC.rgb, a);
}`;

class Pool {
  constructor(scene, cap, additive) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.ramp = new Uint8Array(cap);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('rgba', this.col); geo.setAttribute('size', this.size);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 }, maxPx: { value: 260 } }, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, ramp, grav = 0, drag = 0) {
    let i = this.n;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap); else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.ramp[i] = RAMP_IDS.indexOf(ramp); this.grav[i] = grav; this.drag[i] = drag;
  }
  tick(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i], pa = this.pos.array;
      ramp(RAMP_LIST[this.ramp[i]], t, this.col.array, i * 4);
      pa[i * 3] = this.p[i * 3]; pa[i * 3 + 1] = this.p[i * 3 + 1]; pa[i * 3 + 2] = this.p[i * 3 + 2];
      this.size.array[i] = lerp(this.s0[i], this.s1[i], t);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.pos.needsUpdate = this.col.needsUpdate = this.size.needsUpdate = true;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const a of [this.p, this.v]) { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (const a of [this.age, this.life, this.s0, this.s1, this.grav, this.drag, this.ramp]) a[i] = a[j];
  }
}

// ---------- tracers and beams ----------
const MAX_TRACERS = 256;
class Tracers {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_TRACERS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.list = [];
  }
  add(t) { if (this.list.length >= MAX_TRACERS) this.list.shift(); this.list.push(t); }
  tick(dt, onLand) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    const z = new THREE.Vector3(0, 0, 1), mid = new THREE.Vector3();
    let n = 0;
    this.list = this.list.filter(t => {
      t.age += dt;
      let head, tail, fade = 1;
      if (t.beam) {
        if (t.age > t.life) return false;
        head = t.dist; tail = 0; fade = 1 - t.age / t.life;
      } else {
        // The tail trails the head by `len` and keeps moving after the head
        // lands, so the streak shrinks into the impact point and is gone.
        const run = t.speed * t.age;
        head = Math.min(t.dist, run); tail = Math.max(0, run - t.len);
        if (head >= t.dist && !t.landed) { t.landed = true; onLand(t); }
        if (tail >= t.dist) return false;
      }
      mid.copy(t.a).addScaledVector(t.dir, (head + tail) / 2);
      q.setFromUnitVectors(z, t.dir);
      s.set(t.w * fade, t.w * fade, Math.max(0.01, head - tail));
      m.compose(mid, q, s);
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, c.copy(t.color).multiplyScalar(fade));
      n++;
      return true;
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- the effects themselves ----------
export function createFx(scene, groundAt, nearestBug) {
  const glowy = new Pool(scene, LIGHT ? 1400 : 3200, true);
  const murk = new Pool(scene, LIGHT ? 700 : 1600, false);
  const tracers = new Tracers(scene);
  const lights = [];
  for (let i = 0; i < (LIGHT ? 2 : 5); i++) {
    const l = new THREE.PointLight(0xffaa55, 0, 14, 2); scene.add(l); lights.push({ l, t: 0, dur: 1, peak: 0 });
  }
  let li = 0;
  const flashLight = (p, color, peak, dur) => {
    const L = lights[li++ % lights.length];
    L.l.position.copy(p); L.l.color.setHex(color); L.peak = peak; L.dur = dur; L.t = 0;
  };
  const q = LIGHT ? 0.55 : 1; // fewer particles on phones
  const count = n => Math.max(1, Math.round(n * q));
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();

  // Random direction inside a cone of half-angle `spread` around `dir`.
  function cone(dir, spread) {
    side.set(dir.z, 0, -dir.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    up.crossVectors(dir, side).normalize();
    const a = Math.random() * Math.PI * 2, r = Math.tan(spread) * Math.sqrt(Math.random());
    return tmp.copy(dir).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  }

  function muzzle(p, dir, big) {
    for (let i = 0; i < count(big ? 6 : 3); i++) {
      const d = cone(dir, 0.35), sp = rnd(2, 6);
      glowy.add(p.x, p.y, p.z, d.x * sp, d.y * sp, d.z * sp, rnd(0.04, 0.08), big ? 0.9 : 0.5, 0.1, 'flash');
    }
    flashLight(p, 0xffb060, big ? 18 : 7, 0.06);
  }

  function sparks(p, n, speed = 7) {
    for (let i = 0; i < count(n); i++) {
      const sp = rnd(speed * 0.4, speed);
      glowy.add(p.x, p.y, p.z, rnd(-1, 1) * sp, rnd(0.2, 1.2) * sp, rnd(-1, 1) * sp, rnd(0.15, 0.35), 0.12, 0.04, 'spark', 14, 1.5);
    }
  }
  function puff(p, ramp, n, size, life, rise = 0.8) {
    for (let i = 0; i < count(n); i++) {
      murk.add(p.x + rnd(-0.2, 0.2), p.y + rnd(0, 0.2), p.z + rnd(-0.2, 0.2), rnd(-0.8, 0.8), rnd(0.2, 1) * rise, rnd(-0.8, 0.8), rnd(life * 0.6, life), size * 0.5, size, ramp, -0.2, 1.2);
    }
  }
  function splat(p, ramp, n, speed = 4) {
    for (let i = 0; i < count(n); i++) {
      const sp = rnd(speed * 0.4, speed);
      murk.add(p.x, p.y, p.z, rnd(-1, 1) * sp, rnd(0.3, 1.2) * sp, rnd(-1, 1) * sp, rnd(0.3, 0.6), 0.22, 0.1, ramp, 12, 0.5);
    }
  }

  // Where a shot ended: sparks and dust on the ground, ichor on a bug.
  function impact(p, kind) {
    const bug = nearestBug(p, 1.4);
    if (kind === 4) { // acid spine
      for (let i = 0; i < count(7); i++) glowy.add(p.x, p.y, p.z, rnd(-2, 2), rnd(0.5, 3), rnd(-2, 2), rnd(0.25, 0.5), 0.35, 0.1, 'acid', 9, 1);
      puff(p, 'smoke', 2, 0.6, 0.6);
      return;
    }
    if (bug) splat(p, bug.type === 'spitter' ? 'gore' : 'ichor', kind === 3 || kind === 6 ? 8 : 3);
    else puff(v3(p.x, groundAt(p.x, p.z) + 0.1, p.z), 'dust', kind === 6 ? 4 : 1, kind === 6 ? 1.4 : 0.6, 0.7);
    if (kind === 6) {
      // Cannon round: a small explosion.
      for (let i = 0; i < count(10); i++) glowy.add(p.x, p.y, p.z, rnd(-3, 3), rnd(0.5, 4), rnd(-3, 3), rnd(0.15, 0.35), 0.9, 1.6, 'fire', -1, 3);
      puff(p, 'soot', 4, 1.6, 1.2, 1.4);
      sparks(p, 8, 9);
      flashLight(p, 0xff8a3a, 14, 0.15);
    } else sparks(p, kind === 3 ? 7 : 2, kind === 3 ? 9 : 6);
  }

  // A flamethrower puff: a cone of fire that rolls out and turns to smoke.
  function flame(a, b) {
    const dir = v3(b.x - a.x, b.y - a.y, b.z - a.z), len = dir.length() || 1; dir.divideScalar(len);
    const speed = len / 0.42;
    for (let i = 0; i < count(30); i++) {
      const d = cone(dir, 0.2), sp = speed * rnd(0.75, 1.15), t = rnd(0, 0.06) + 0.015; // start just past the nozzle
      const body = i % 2 === 0;
      (body ? murk : glowy).add(a.x + d.x * sp * t, a.y + d.y * sp * t, a.z + d.z * sp * t, d.x * sp, d.y * sp + rnd(0, 1.5), d.z * sp,
        rnd(0.38, 0.55), body ? rnd(0.14, 0.25) : rnd(0.1, 0.18), body ? rnd(1.0, 1.8) : rnd(0.7, 1.3), body ? 'flameBody' : 'fire', -2.5, 2.2);
    }
    for (let i = 0; i < count(4); i++) {
      const d = cone(dir, 0.25), sp = speed * rnd(0.5, 0.8);
      glowy.add(a.x, a.y, a.z, d.x * sp, d.y * sp + 2, d.z * sp, rnd(0.5, 0.8), 0.08, 0.05, 'ember', 3, 0.5);
    }
    const end = a.clone().addScaledVector(dir, len * 0.9);
    for (let i = 0; i < count(3); i++) murk.add(end.x, end.y, end.z, rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1), rnd(0.9, 1.4), 0.8, 2.6, 'soot', -0.6, 0.8);
    flashLight(a.clone().addScaledVector(dir, len * 0.4), 0xff7a2a, 16, 0.2);
  }

  const COL = {
    0: new THREE.Color(1.0, 0.55, 0.15).multiplyScalar(1.3), p0: new THREE.Color(1.0, 0.75, 0.35).multiplyScalar(1.6),
    3: new THREE.Color(0.45, 0.9, 1.0).multiplyScalar(2.2), 4: new THREE.Color(0.5, 1.0, 0.15).multiplyScalar(1.6),
    6: new THREE.Color(1.0, 0.5, 0.15).multiplyScalar(1.8),
  };
  const tracer = (a, b, kind, player, o) => {
    const dir = v3(b.x - a.x, b.y - a.y, b.z - a.z), dist = dir.length(); if (dist < 0.01) return;
    dir.divideScalar(dist);
    tracers.add(Object.assign({ a: a.clone(), b: b.clone(), dir, dist, age: 0, kind, color: COL[kind === 0 && player ? 'p0' : kind] || COL[0] }, o));
  };

  return {
    // A shot of `kind` (see SHOT in config.js) from a to b.
    shot(a, b, kind = 0, player = false, spikes) {
      const dir = v3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      if (kind === 2) return flame(a, b);
      if (kind === 5) { // spike line: spikes come from render.js, dust along the line
        const n = 8;
        for (let i = 1; i <= n; i++) { const t = i / n; puff(v3(a.x + (b.x - a.x) * t, groundAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), a.z + (b.z - a.z) * t), 'dust', 2, 1.2, 0.8, 1.2); }
        return;
      }
      if (kind === 3) { // sniper: an instant beam with a smoke trail
        muzzle(a, dir, true);
        tracer(a, b, 3, player, { beam: true, life: 0.22, w: 0.03 });
        const len = a.distanceTo(b);
        for (let s = 1; s < len; s += 1.6) { const p = a.clone().addScaledVector(dir, s); murk.add(p.x, p.y, p.z, 0, 0.25, 0, rnd(0.6, 1), 0.15, 0.5, 'smoke', -0.1, 0.5); }
        impact(b, 3);
        return;
      }
      if (kind === 4) { tracer(a, b, 4, false, { speed: 38, len: 0.7, w: 0.12 }); return; }
      if (kind === 6) { muzzle(a, dir, true); tracer(a, b, 6, player, { speed: 160, len: 2.2, w: 0.08 }); return; }
      muzzle(a, dir, false);
      tracer(a, b, 0, player, { speed: 230, len: 1.6, w: player ? 0.03 : 0.025 });
    },
    // A unit just died.
    death(p, team, big) {
      if (team === 's') { splat(p, 'ichor', big ? 16 : 8, big ? 6 : 4); puff(p, 'soot', big ? 4 : 2, big ? 1.8 : 1, 1); }
      else { sparks(p, 6); puff(p, 'dust', 3, 1.2, 1); }
    },
    tick(dt, cam, viewportH) {
      const s = (viewportH || 800) / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
      glowy.mat.uniforms.scale.value = s; murk.mat.uniforms.scale.value = s;
      tracers.tick(dt, t => impact(t.b, t.kind));
      glowy.tick(dt); murk.tick(dt);
      for (const L of lights) { L.t += dt; L.l.intensity = L.t < L.dur ? L.peak * (1 - L.t / L.dur) : 0; }
    },
  };
}
