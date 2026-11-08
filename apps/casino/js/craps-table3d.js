/* The 3D craps table: felt, rails, the back wall, dice that really roll,
 * chips that move, and the puck.
 *
 * Loaded only when a craps table opens (three.js and cannon-es come from
 * the CDN through the page's import map). It draws; craps-view.js decides.
 *
 *   const t = await mountTable(el, { onTap, onFlick })
 *   t.update({ bets, others, point, lines, rolls, dice, throw })
 *   t.throwDice(throw, values) → Promise once the dice stop
 *
 * Coordinates: x across the table (-5 to 5), z toward the shooter
 * (back wall at -14.2, rail at +2), y up. The layout sits at the shooter's
 * end, the props in the middle, and the dice fly down to the back wall.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { simulate, cleanThrow, DIE, TABLE } from './dice-physics.js';
import { houseEdge, edgeClass } from './craps-odds.js';
import { parseKey } from './craps.js';

const W = TABLE.halfW * 2, NEAR = TABLE.near, BACK = TABLE.back, LEN = NEAR - BACK;
const NUMS = [4, 5, 6, 8, 9, 10];
const EDGE_COLOR = { free: '#55d38a', good: '#a6e3b8', ok: '#f2d37a', poor: '#f5a25d', bad: '#ff7a7a' };

/* ── the layout: every tappable area, in table coordinates ─────────────── */

const rect = (key, x0, z0, x1, z1, label, sub = '') => ({ key, x0, z0, x1, z1, label, sub });

export function layout() {
  const R = [];
  NUMS.forEach((n, i) => {
    const x0 = -4.8 + i * 1.6;
    R.push(rect(`num${n}`, x0, -8.4, x0 + 1.6, -6.3, n === 6 ? 'SIX' : n === 9 ? 'NINE' : String(n)));
  });
  R.push(rect('dc', -4.8, -6.2, -2.2, -4.6, 'DON\'T COME', 'BAR 12'));
  R.push(rect('come', -2.2, -6.2, 4.8, -4.6, 'COME'));
  R.push(rect('field', -4.8, -4.5, 4.8, -2.9, 'FIELD', '2 · 3 · 4 · 9 · 10 · 11 · 12'));
  R.push(rect('dp', -4.8, -2.8, 4.8, -2.0, 'DON\'T PASS BAR', 'BAR 12'));
  R.push(rect('pass', -4.8, -1.9, 4.8, -0.6, 'PASS LINE'));
  R.push(rect('dpOdds', -4.8, -0.5, -0.05, 0.35, 'LAY ODDS', 'behind don\'t pass'));
  R.push(rect('passOdds', 0.05, -0.5, 4.8, 0.35, 'ODDS', 'behind the pass line'));
  // The middle of the table.
  R.push(rect('seven', -2.3, -12.6, 2.3, -12.0, 'SEVEN', '4 to 1'));
  R.push(rect('hard6', -2.3, -11.95, 0, -11.0, 'HARD 6', '9 to 1'));
  R.push(rect('hard10', 0, -11.95, 2.3, -11.0, 'HARD 10', '7 to 1'));
  R.push(rect('hard8', -2.3, -10.95, 0, -10.0, 'HARD 8', '9 to 1'));
  R.push(rect('hard4', 0, -10.95, 2.3, -10.0, 'HARD 4', '7 to 1'));
  R.push(rect('aces', -2.3, -9.95, -0.77, -9.35, 'ACES', '30 to 1'));
  R.push(rect('aceDeuce', -0.77, -9.95, 0.77, -9.35, 'ACE-DEUCE', '15 to 1'));
  R.push(rect('twelve', 0.77, -9.95, 2.3, -9.35, 'TWELVE', '30 to 1'));
  R.push(rect('yo', -2.3, -9.3, 0, -8.75, 'YO 11', '15 to 1'));
  R.push(rect('anyCraps', 0, -9.3, 2.3, -8.75, 'ANY CRAPS', '7 to 1'));
  return R;
}

const REGIONS = layout();
const byKey = Object.fromEntries(REGIONS.map((r) => [r.key, r]));

export function regionAt(x, z) {
  return REGIONS.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || null;
}

/* Where the chips for a bet sit. */
export function anchor(key) {
  const { base, n } = parseKey(key);
  const box = n && byKey[`num${n}`];
  if (box) {
    const cx = (box.x0 + box.x1) / 2;
    if (base === 'place') return [cx, -6.75];
    if (base === 'come') return [cx - 0.42, -7.35];
    if (base === 'comeOdds') return [cx - 0.3, -7.2];
    if (base === 'dc') return [cx + 0.42, -7.35];
    if (base === 'dcOdds') return [cx + 0.54, -7.2];
  }
  const r = byKey[key] || byKey[base];
  if (!r) return [0, -3];
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (key === 'pass') return [1.2, cz];
  if (key === 'dp') return [-1.2, cz];
  if (key === 'passOdds') return [1.2, cz];
  if (key === 'dpOdds') return [-1.2, cz];
  if (key === 'come') return [1.3, cz];
  if (key === 'field') return [1.6, cz];
  return [cx, cz];
}

/* ── textures ───────────────────────────────────────────────────────────── */

function feltTexture(rules) {
  const CW = 1024, CH = Math.round(CW * LEN / W);
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  const px = (x) => (x + W / 2) / W * CW;
  const pz = (z) => (z - BACK) / LEN * CH;
  const grd = g.createRadialGradient(CW / 2, CH * 0.55, 50, CW / 2, CH * 0.55, CH * 0.75);
  grd.addColorStop(0, '#13774c'); grd.addColorStop(1, '#0a4a30');
  g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
  // a faint weave
  g.globalAlpha = 0.05;
  for (let y = 0; y < CH; y += 3) { g.fillStyle = y % 6 ? '#000' : '#fff'; g.fillRect(0, y, CW, 1); }
  g.globalAlpha = 1;
  const line = 'rgba(255, 248, 225, 0.9)';
  const gold = '#f2d37a';
  for (const r of REGIONS) {
    const x = px(r.x0), y = pz(r.z0), w = px(r.x1) - x, h = pz(r.z1) - y;
    g.strokeStyle = line; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 10); g.stroke();
    const isNum = /^num/.test(r.key);
    const big = ['pass', 'dp', 'field', 'come', 'dc'].includes(r.key) || isNum;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (isNum) {
      g.fillStyle = gold;
      g.font = '800 54px "Playfair Display", Georgia, serif';
      g.fillText(r.label, x + w / 2, y + h * 0.36);
      g.fillStyle = 'rgba(255,248,225,0.75)';
      g.font = '600 18px Inter, sans-serif';
      const n = Number(r.key.slice(3));
      g.fillText(`place ${n === 6 || n === 8 ? '7:6' : n === 5 || n === 9 ? '7:5' : '9:5'}`, x + w / 2, y + h * 0.78);
      edgePill(g, houseEdge(`place${n}`, rules), x + w / 2, y + h * 0.92, 17);
    } else {
      g.fillStyle = r.key === 'seven' ? '#ff6b6b' : big ? gold : 'rgba(255,248,225,0.95)';
      g.font = big ? '800 46px "Playfair Display", Georgia, serif' : '700 24px Inter, sans-serif';
      if (r.key === 'pass') g.font = '800 64px "Playfair Display", Georgia, serif';
      g.fillText(r.label, x + w / 2, y + h * (r.sub ? 0.42 : 0.5));
      if (r.sub) {
        g.fillStyle = 'rgba(255,248,225,0.7)';
        g.font = `600 ${big ? 22 : 17}px Inter, sans-serif`;
        g.fillText(r.sub, x + w / 2, y + h * 0.78);
      }
      const ek = r.key === 'dpOdds' || r.key === 'passOdds' ? 'passOdds' : r.key;
      edgePill(g, houseEdge(ek, rules), x + w - 44, y + 22, 17);
    }
  }
  // The middle's border and caption.
  g.strokeStyle = gold; g.lineWidth = 5;
  g.strokeRect(px(-2.35), pz(-12.65), px(2.35) - px(-2.35), pz(-8.7) - pz(-12.65));
  g.fillStyle = 'rgba(255,248,225,0.55)'; g.font = '700 20px Inter, sans-serif';
  g.fillText('PROPOSITION BETS · ONE ROLL (HARDWAYS UNTIL 7 OR EASY)', CW / 2, pz(-12.85));
  // Field detail.
  const f = byKey.field;
  g.fillStyle = 'rgba(255,248,225,0.7)'; g.font = '600 18px Inter, sans-serif';
  g.fillText(`2 pays double · 12 pays ${rules.field12 === 2 ? 'double' : 'triple'}`, px(-2.4), pz(f.z1) - 16);
  // The casino's name where the dice land.
  g.fillStyle = 'rgba(255,248,225,0.08)'; g.font = '800 110px "Playfair Display", Georgia, serif';
  g.fillText('CASINO', CW / 2, pz(-6) - 520);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function edgePill(g, edge, x, y, size) {
  const cls = edgeClass(edge);
  const text = edge < 0.01 ? '0%' : `${edge.toFixed(edge < 10 ? 2 : 1)}%`;
  g.font = `800 ${size}px Inter, sans-serif`;
  const w = g.measureText(text).width + 14;
  g.fillStyle = EDGE_COLOR[cls];
  g.beginPath(); g.roundRect(x - w / 2, y - size * 0.7, w, size * 1.4, size * 0.7); g.fill();
  g.fillStyle = '#10221a';
  g.fillText(text, x, y + 1);
}

const PIPS = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]] };

function dieMaterials() {
  const mats = {};
  for (let v = 1; v <= 6; v++) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    // Translucent red casino dice, white pips.
    const grd = g.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, '#e2283f'); grd.addColorStop(1, '#a5101f');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
    g.fillStyle = '#fbfaf5';
    for (const [u, w] of PIPS[v]) { g.beginPath(); g.arc(u * 128, w * 128, 11, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mats[v] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 });
  }
  return mats;
}

const CHIP_COLORS = { 1: 0xececec, 5: 0xc8102e, 25: 0x138a47, 100: 0x1b1b1b, 500: 0x6a2fb5, 1000: 0xd39b12 };
const DENOMS = [1000, 500, 100, 25, 5, 1];

/* The chips that make up an amount, biggest first, at most `max`. */
export function chipsFor(amount, max = 10) {
  let left = Math.floor(amount + 1e-6);
  const out = [];
  for (const d of DENOMS) while (left >= d && out.length < max) { out.push(d); left -= d; }
  if (!out.length && amount > 0) out.push(1);
  return out.reverse();
}

/* ── the scene ──────────────────────────────────────────────────────────── */

export async function mountTable(el, { onTap, onFlick, onHit } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.className = 'table3d';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x061f16);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x0b2a1d, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-4, 16, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 10, bottom: -10, near: 1, far: 40 });
  sun.target.position.set(0, 0, -6);
  scene.add(sun, sun.target);

  // Felt.
  let rules = { field12: 3 };
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(rules), roughness: 0.95 });
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(W, LEN), feltMat);
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, 0, (NEAR + BACK) / 2);
  felt.receiveShadow = true;
  scene.add(felt);

  // Rails and the back wall.
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.55 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x1d1410, roughness: 0.8 });
  const railH = 0.7, railT = 0.5;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  add(new THREE.BoxGeometry(railT, railH, LEN + railT * 2), wood, -W / 2 - railT / 2, railH / 2, (NEAR + BACK) / 2);
  add(new THREE.BoxGeometry(railT, railH, LEN + railT * 2), wood, W / 2 + railT / 2, railH / 2, (NEAR + BACK) / 2);
  add(new THREE.BoxGeometry(W + railT * 2, railH, railT), wood, 0, railH / 2, NEAR + railT / 2);
  add(new THREE.BoxGeometry(W, 0.12, 0.25), pad, 0, railH + 0.06, NEAR + 0.12); // the arm pad
  // Back wall with its rubber pyramids.
  const pc = document.createElement('canvas'); pc.width = 512; pc.height = 64;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#1b1b1b'; pg.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 32; i++) { pg.fillStyle = i % 2 ? '#2b2b2b' : '#3a3a3a'; pg.beginPath(); pg.moveTo(i * 16, 64); pg.lineTo(i * 16 + 8, 8); pg.lineTo(i * 16 + 16, 64); pg.fill(); }
  const ptex = new THREE.CanvasTexture(pc); ptex.wrapS = THREE.RepeatWrapping; ptex.repeat.set(2, 1);
  add(new THREE.BoxGeometry(W + railT * 2, 1.0, railT), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9 }), 0, 0.5, BACK - railT / 2);

  // Dice.
  const dmats = dieMaterials();
  const dieGeo = new THREE.BoxGeometry(DIE, DIE, DIE);
  const dice = [0, 1].map((i) => {
    const m = new THREE.Mesh(dieGeo, [1, 6, 2, 5, 3, 4].map((v) => dmats[v]));
    m.castShadow = true;
    m.position.set(i ? 0.35 : -0.35, DIE / 2, 1.0);
    m.rotation.y = i ? 0.3 : -0.2;
    scene.add(m);
    return m;
  });

  // The puck.
  const puckTex = (on) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = on ? '#fff' : '#151515'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = on ? '#111' : '#eee'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = on ? '#111' : '#eee'; g.font = '800 40px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(on ? 'ON' : 'OFF', 64, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const puckOn = new THREE.MeshStandardMaterial({ map: puckTex(true), roughness: 0.4 });
  const puckOff = new THREE.MeshStandardMaterial({ map: puckTex(false), roughness: 0.4 });
  const puckSide = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 32), [puckSide, puckOff, puckSide]);
  puck.castShadow = true;
  puck.position.set(-4.25, 0.05, -5.85);
  scene.add(puck);

  // Chips.
  const chipGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.055, 28);
  const chipMats = {};
  for (const [d, color] of Object.entries(CHIP_COLORS)) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; g.setLineDash([7, 7]);
    g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.fillStyle = d === '1' || d === '1000' ? '#222' : '#fff';
    g.font = '800 18px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(Number(d) >= 1000 ? '1K' : d, 32, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    chipMats[d] = [side, new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), side];
  }
  function stackMesh(amount, { ghost = false } = {}) {
    const g = new THREE.Group();
    chipsFor(amount, ghost ? 6 : 12).forEach((d, i) => {
      const m = new THREE.Mesh(chipGeo, chipMats[d]);
      m.position.y = 0.03 + i * 0.058;
      m.rotation.y = i * 0.7;
      m.castShadow = true;
      g.add(m);
    });
    if (ghost) g.scale.setScalar(0.75);
    return g;
  }
  function labelSprite(text) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(4, 6, 120, 36, 18); g.fill();
    g.fillStyle = '#fff7d6'; g.font = '800 24px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 25);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(0.9, 0.34, 1);
    s.renderOrder = 10;
    return s;
  }

  const RAIL = new THREE.Vector3(0, 0.2, 2.4);
  const DEALER = new THREE.Vector3(0, 0.2, -13.4);
  const stacks = new Map();   // key → { amount, group }
  const others = new Map();
  const flights = [];

  const at = (key, dx = 0, dz = 0) => { const [x, z] = anchor(key); return new THREE.Vector3(x + dx, 0, z + dz); };

  function setStack(key, amount) {
    const old = stacks.get(key);
    if (old) { scene.remove(old.group); stacks.delete(key); }
    if (!(amount > 0)) return;
    const group = stackMesh(amount);
    const lbl = labelSprite(`$${Math.round(amount * 100) / 100}`);
    lbl.position.set(0, chipsFor(amount, 12).length * 0.058 + 0.35, 0);
    group.add(lbl);
    group.position.copy(at(key));
    scene.add(group);
    stacks.set(key, { amount, group });
  }
  function setOthers(key, amount) {
    const old = others.get(key);
    if (old) { scene.remove(old.group); others.delete(key); }
    if (!(amount > 0)) return;
    const group = stackMesh(amount, { ghost: true });
    group.position.copy(at(key, 0.38, 0.22));
    scene.add(group);
    others.set(key, { amount, group });
  }

  /* A stack of chips sliding (with a little hop) from one spot to another. */
  function fly(amount, from, to, { delay = 0, dur = 650, then = null } = {}) {
    const group = stackMesh(amount);
    group.position.copy(from);
    group.visible = delay <= 0;
    scene.add(group);
    flights.push({ group, from: from.clone(), to: to.clone(), t0: performance.now() + delay, dur, then });
    wake();
  }

  // Dice playback.
  let playing = null;

  function throwDice(t, values) {
    const th = cleanThrow(t);
    const sim = simulate(CANNON, th, values);
    sim.labels.forEach((labels, i) => { dice[i].material = labels.map((v) => dmats[v]); });
    return new Promise((resolve) => {
      // Fit the playback into 2.4 s whatever the sim took.
      const stride = Math.max(1, sim.frames.length / 144);
      playing = { sim, t0: performance.now(), stride, resolve, hit: 0 };
      wake();
    });
  }

  function showDiceAt(values) {
    // A page that opened mid-game: dice resting where they'd be.
    dice.forEach((d, i) => {
      const labels = [values[i], 7 - values[i], ...[1, 2, 3].filter((v) => v !== values[i] && v !== 7 - values[i]).flatMap((v) => [v, 7 - v])];
      // +y face is index 2 in the material order
      const m = [labels[2], labels[3], labels[0], labels[1], labels[4], labels[5]];
      d.material = m.map((v) => dmats[v]);
      d.position.set(i ? 0.6 : -0.6, DIE / 2, -11);
      d.rotation.set(0, i ? 0.4 : -0.3, 0);
    });
    wake();
  }

  /* The stickman pulls the dice back to the shooter. */
  function returnDice() {
    dice.forEach((d, i) => {
      flights.push({ die: d, from: d.position.clone(), to: new THREE.Vector3(i ? 0.35 : -0.35, DIE / 2, 1.0), t0: performance.now() + 900, dur: 900 });
    });
    wake();
  }

  /* ── sizing and the render loop ── */

  function resize() {
    const w = el.clientWidth || 360, h = el.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Frame the whole table, rail to back wall, from just behind the
    // shooter. Pull back only as far as the screen's width needs.
    camera.fov = 50;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const needW = W + 1.6;
    const dist = Math.max(17.5, (needW / 2) / Math.tan(hfov / 2) * 0.7);
    const tilt = 0.98; // radians below horizontal
    const target = new THREE.Vector3(0, 0, -6.4);
    camera.position.set(0, Math.sin(tilt) * dist, target.z + Math.cos(tilt) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    wake();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let raf = 0;
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    let busy = false;
    if (playing) {
      busy = true;
      const { sim, t0, stride } = playing;
      const idx = Math.max(0, Math.min(sim.frames.length - 1, Math.floor(((now - t0) / 1000) * 60 * stride)));
      const f = sim.frames[idx];
      dice.forEach((d, i) => {
        const o = i * 7;
        d.position.set(f[o], f[o + 1], f[o + 2]);
        d.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
      });
      while (playing.hit < sim.hits.length && sim.hits[playing.hit].f <= idx) { onHit && onHit(sim.hits[playing.hit].v); playing.hit++; }
      if (idx >= sim.frames.length - 1) { const done = playing.resolve; playing = null; done(); }
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const fl = flights[i];
      const k = (now - fl.t0) / fl.dur;
      if (k < 0) { busy = true; continue; }
      const e = k >= 1 ? 1 : 1 - (1 - k) ** 3;
      const obj = fl.die || fl.group;
      obj.visible = true;
      obj.position.lerpVectors(fl.from, fl.to, e);
      if (!fl.die) obj.position.y = fl.from.y + Math.sin(Math.min(1, k) * Math.PI) * 0.5;
      if (fl.die) obj.position.y = DIE / 2;
      if (k >= 1) {
        flights.splice(i, 1);
        if (fl.group) scene.remove(fl.group);
        fl.then && fl.then();
      } else busy = true;
    }
    if (puckAnim) {
      const k = Math.min(1, (now - puckAnim.t0) / 500);
      puck.position.lerpVectors(puckAnim.from, puckAnim.to, 1 - (1 - k) ** 3);
      puck.position.y = 0.05 + Math.sin(k * Math.PI) * 0.6;
      if (k >= 1) puckAnim = null; else busy = true;
    }
    renderer.render(scene, camera);
    if (busy) wake();
  }

  /* ── state from the table ── */

  let lastRolls = -1, lastPoint = -1, puckAnim = null;
  function movePuck(point) {
    const to = point ? at(`num${point}`).setZ(-8.0).setY(0.05) : new THREE.Vector3(-4.25, 0.05, -5.85);
    puck.material = [puckSide, point ? puckOn : puckOff, puckSide];
    if (lastPoint === -1) puck.position.copy(to);
    else puckAnim = { from: puck.position.clone(), to, t0: performance.now() };
    lastPoint = point;
    wake();
  }

  function update(s) {
    if (s.rules && (s.rules.field12 !== rules.field12)) {
      rules = { ...s.rules };
      feltMat.map.dispose();
      feltMat.map = feltTexture(rules);
      feltMat.needsUpdate = true;
    }
    const newRoll = s.rolls !== lastRolls && lastRolls !== -1 && s.lines;
    const before = new Map([...stacks].map(([k, v]) => [k, v.amount]));
    const after = s.bets || {};
    if (newRoll) {
      // Settle with motion: losers to the dealer, winnings out to the rail.
      const lines = s.lines || [];
      let d = 0;
      for (const l of lines) {
        const from = at(l.key);
        if (l.out === 'lose') { setStack(l.key, after[l.key] || 0); fly(l.amt, from, DEALER, { delay: d, dur: 700 }); d += 80; }
        else if (l.out === 'win') {
          const side = from.clone().add(new THREE.Vector3(0.48, 0, 0.1));
          fly(l.profit, DEALER, side, { delay: d, dur: 700, then: () => fly(l.profit + (l.back || 0), side, RAIL, { delay: 900, dur: 650 }) });
          if (l.back) setStack(l.key, after[l.key] || 0);
          d += 120;
        } else if (l.out === 'move') {
          const to = `${l.key}${l.to}`;
          setStack(l.key, 0);
          fly(l.amt, from, at(to), { delay: d, dur: 700, then: () => setStack(to, (s.bets || {})[to] || 0) });
        } else if (l.out === 'back') { setStack(l.key, after[l.key] || 0); fly(l.amt, from, RAIL, { delay: d, dur: 650 }); }
      }
      for (const [k, amt] of Object.entries(after)) {
        if (!lines.some((l) => l.key === k || (l.out === 'move' && `${l.key}${l.to}` === k))) setStack(k, amt);
      }
      for (const k of before.keys()) if (!(k in after) && !lines.some((l) => l.key === k)) setStack(k, 0);
      returnDice();
    } else {
      // Bets placed or taken down between rolls.
      const keys = new Set([...before.keys(), ...Object.keys(after)]);
      for (const k of keys) {
        const was = before.get(k) || 0, now = after[k] || 0;
        if (Math.abs(was - now) < 0.001) continue;
        if (now > was) {
          const diff = now - was;
          setStack(k, was);
          fly(diff, RAIL, at(k), { dur: 520, then: () => setStack(k, (stackTarget.get(k) ?? now)) });
        } else {
          setStack(k, now);
          fly(was - now, at(k), RAIL, { dur: 520 });
        }
        stackTarget.set(k, now);
      }
    }
    for (const [k, v] of Object.entries(after)) stackTarget.set(k, v);
    // Everyone else's chips, quietly.
    const ok = new Set([...others.keys(), ...Object.keys(s.others || {})]);
    for (const k of ok) {
      const v = (s.others || {})[k] || 0;
      if ((others.get(k) || {}).amount !== v) setOthers(k, v);
    }
    if (s.point !== lastPoint) movePuck(s.point);
    lastRolls = s.rolls;
    wake();
  }
  const stackTarget = new Map();

  /* ── input: tap to bet, flick to throw ── */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function toTable(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(felt)[0];
    return hit ? hit.point : null;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = Math.max(30, performance.now() - down.t);
    const r = renderer.domElement.getBoundingClientRect();
    const fromBottom = (down.y - r.top) / r.height > 0.55;
    if (-dy > 45 && fromBottom) {
      const speed = -dy / dt; // px per ms
      onFlick && onFlick({ a: Math.max(-1, Math.min(1, (dx / r.width) * 2.2)), p: Math.max(0.5, Math.min(1.25, 0.45 + speed * 0.45)), s: Math.floor(Math.random() * 2 ** 30) + 1 });
    } else if (Math.hypot(dx, dy) < 12) {
      const p = toTable(e.clientX, e.clientY);
      if (p) {
        const reg = regionAt(p.x, p.z);
        if (reg) onTap && onTap(reg.key, e.clientX - r.left, e.clientY - r.top);
      }
    }
    down = null;
  });

  resize();
  movePuck(0);
  return {
    update, throwDice, showDiceAt,
    dispose() { ro.disconnect(); cancelAnimationFrame(raf); renderer.dispose(); el.innerHTML = ''; },
    busy: () => !!playing,
  };
}
