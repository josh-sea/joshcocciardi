/* Two dice thrown down the craps table, with real rigid-body physics.
 *
 * The engine (craps.js) decides what the dice show, so every phone agrees
 * and nobody can nudge a result. This module makes the throw look real:
 *
 *   1. simulate the throw (cannon-es) from the shooter's flick: where it
 *      left the hand, how hard, which way, how much spin. Same throw, same
 *      seed, same path on every phone.
 *   2. record every frame until both dice stop.
 *   3. look at which face of each die ended up on top, and number the
 *      faces so that face shows the engine's value. Opposite faces still
 *      add to 7, as on a real die.
 *
 * CANNON is passed in rather than imported, so the browser can load it from
 * the CDN and node can load it from node_modules for the tests.
 *
 * Units: the table is 10 wide. The shooter stands at +z, the back wall
 * (with its rubber pyramids) is at z = BACK.
 */

export const DIE = 0.42;
export const TABLE = { halfW: 5.0, near: 2.0, back: -14.2 };
const G = -55;

/* Box face order, as three.js and our labels use it: +x, -x, +y, -y, +z, -z. */
export const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OPPOSITE = [1, 0, 3, 2, 5, 4];

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A throw, cleaned up: a (aim, -1 left to 1 right), p (power 0.5 to 1.25),
 * s (seed for spin and wobble). Anything missing is made up.
 */
export function cleanThrow(t = {}, rand = Math.random) {
  const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
  return {
    a: Math.round(num(t.a, -1, 1, rand() * 1.2 - 0.6) * 1000) / 1000,
    p: Math.round(num(t.p, 0.5, 1.25, 0.8 + rand() * 0.3) * 1000) / 1000,
    s: Math.floor(num(t.s, 1, 2 ** 31 - 1, 1 + rand() * 2 ** 30)),
  };
}

/* Which box face points up, for a quaternion {x, y, z, w}. */
export function upFace(q) {
  let best = 0, bestDot = -2;
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = FACE_NORMALS[i];
    // y component of the face normal rotated by q
    const ry = 2 * (q.x * q.y + q.w * q.z) * x + (1 - 2 * (q.x * q.x + q.z * q.z)) * y + 2 * (q.y * q.z - q.w * q.x) * z;
    if (ry > bestDot) { bestDot = ry; best = i; }
  }
  return { face: best, flat: bestDot };
}

/* Numbers for the six faces so `face` shows `value` and opposite faces add
 * to 7. The other two pairs go on the remaining axes in a fixed order.
 */
export function faceLabels(face, value) {
  const labels = new Array(6).fill(0);
  labels[face] = value;
  labels[OPPOSITE[face]] = 7 - value;
  const pairs = [1, 2, 3].filter((v) => v !== value && v !== 7 - value).map((v) => [v, 7 - v]);
  const others = [0, 2, 4].filter((f) => f !== face && f !== OPPOSITE[face]);
  others.forEach((f, i) => { labels[f] = pairs[i][0]; labels[OPPOSITE[f]] = pairs[i][1]; });
  return labels;
}

/* Run the throw. Returns { frames, hits, labels, faces, ok }:
 *   frames: per 1/60 s, [x, y, z, qx, qy, qz, qw] for each die
 *   hits:   frame numbers where a die struck something hard (for the clicks)
 */
export function simulate(CANNON, throwIn, values = [1, 1], { maxSeconds = 5 } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const t = { ...throwIn, s: (throwIn.s + attempt * 7919) >>> 0 };
    const out = run(CANNON, t, values, maxSeconds);
    if (out.ok) return out;
    if (attempt === 5) return out;
  }
  return null;
}

function run(CANNON, t, values, maxSeconds) {
  const rand = seeded(t.s);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, G, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 14;

  const felt = new CANNON.Material('felt');
  const rail = new CANNON.Material('rail');
  const dieMat = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(felt, dieMat, { friction: 0.32, restitution: 0.28 }));
  world.addContactMaterial(new CANNON.ContactMaterial(rail, dieMat, { friction: 0.12, restitution: 0.62 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.45 }));

  const ground = new CANNON.Body({ mass: 0, material: felt, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const wall = (x, z, rotY) => {
    const b = new CANNON.Body({ mass: 0, material: rail, shape: new CANNON.Plane() });
    b.position.set(x, 0, z);
    b.quaternion.setFromEuler(0, rotY, 0);
    world.addBody(b);
  };
  wall(0, TABLE.back, 0); // back wall faces the shooter (+z)
  wall(0, TABLE.near, Math.PI);
  wall(-TABLE.halfW, 0, Math.PI / 2);
  wall(TABLE.halfW, 0, -Math.PI / 2);

  const half = DIE / 2;
  const dice = [0, 1].map((i) => {
    const b = new CANNON.Body({ mass: 1, material: dieMat, shape: new CANNON.Box(new CANNON.Vec3(half, half, half)) });
    b.allowSleep = true;
    b.sleepSpeedLimit = 0.25;
    b.sleepTimeLimit = 0.25;
    b.linearDamping = 0.08;
    b.angularDamping = 0.12;
    const side = i === 0 ? -1 : 1;
    b.position.set(t.a * 1.4 + side * 0.32, 1.3 + rand() * 0.3, 0.9 + rand() * 0.2);
    b.quaternion.setFromEuler(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    const speed = 17 + 12 * t.p + rand() * 2;
    b.velocity.set(t.a * 4 + (rand() - 0.5) * 1.5 - (t.a * 1.4) * 0.8, 3 + rand() * 2, -speed);
    b.angularVelocity.set((rand() - 0.5) * 40, (rand() - 0.5) * 30, (rand() - 0.5) * 40);
    world.addBody(b);
    return b;
  });

  const hits = [];
  let lastHit = -10;
  dice.forEach((d) => d.addEventListener('collide', (e) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 2.5 && frameNo - lastHit > 3) { hits.push({ f: frameNo, v: Math.min(1, v / 18) }); lastHit = frameNo; }
  }));

  const frames = [];
  let frameNo = 0;
  const step = 1 / 120;
  const total = maxSeconds * 60;
  for (frameNo = 0; frameNo < total; frameNo++) {
    world.step(step);
    world.step(step);
    frames.push(dice.flatMap((d) => [d.position.x, d.position.y, d.position.z, d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w]).map((v) => Math.round(v * 10000) / 10000));
    if (frameNo > 30 && dice.every((d) => d.sleepState === CANNON.Body.SLEEPING)) break;
  }
  const faces = dice.map((d) => upFace(d.quaternion));
  const onTable = dice.every((d) => Math.abs(d.position.x) < TABLE.halfW && d.position.z < TABLE.near && d.position.z > TABLE.back && d.position.y < DIE);
  const farEnough = dice.every((d) => d.position.z < -6);
  const ok = faces.every((f) => f.flat > 0.97) && onTable && farEnough;
  return {
    frames, hits, ok,
    faces: faces.map((f) => f.face),
    labels: faces.map((f, i) => faceLabels(f.face, values[i])),
  };
}
