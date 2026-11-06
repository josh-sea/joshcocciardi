/* Drawing. Reads a decoded snapshot (sim.js `decode`), so the host and
 * every client draw the same way. Particles, scorch marks and screen shake
 * are local only: they come from the snapshot's events.
 */

import { TILE, THEMES, LEVELS, COLORS, ENEMIES, WEAPONS, PLAYER_R } from './config.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');
  let mapKey = '', mapImg = null, decal = null, map = null, theme = THEMES[0];
  const parts = [];
  const flashes = [];
  let shake = 0, W = 0, H = 0, dpr = 1;
  const cam = { x: 0, y: 0, z: 1 };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    dark.width = Math.round(W / 2); dark.height = Math.round(H / 2);
  }

  function setMap(m, level, seed) {
    const key = `${level}:${seed}`;
    if (key === mapKey) return;
    mapKey = key; map = m; theme = THEMES[LEVELS[level].theme];
    parts.length = 0; flashes.length = 0;
    mapImg = document.createElement('canvas');
    mapImg.width = m.w * TILE; mapImg.height = m.h * TILE;
    decal = document.createElement('canvas');
    decal.width = mapImg.width; decal.height = mapImg.height;
    const g = mapImg.getContext('2d');
    g.fillStyle = '#05070a'; g.fillRect(0, 0, mapImg.width, mapImg.height);
    const at = (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 1 : m.tiles[y * m.w + x]);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const X = x * TILE, Y = y * TILE;
      if (at(x, y) === 0) {
        g.fillStyle = theme.floor; g.fillRect(X, Y, TILE, TILE);
        g.strokeStyle = theme.grid; g.lineWidth = 1; g.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1);
        if (((x * 7 + y * 13) % 11) === 0) { g.fillStyle = theme.grid; g.fillRect(X + 10, Y + 10, 12, 12); }
      } else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => at(x + dx, y + dy) === 0)) {
        g.fillStyle = theme.wall; g.fillRect(X, Y, TILE, TILE);
        g.fillStyle = theme.wallTop; g.fillRect(X, Y, TILE, TILE - 8);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X, Y + TILE - 8, TILE, 2);
        if (at(x, y + 1) === 0) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X, Y + TILE, TILE, 6); }
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 9);
      }
    }
    // Exit pad.
    const e = m.exit;
    g.strokeStyle = theme.accent; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.strokeRect(e.x * TILE + 3, e.y * TILE + 3, e.w * TILE - 6, e.h * TILE - 6); g.setLineDash([]);
    for (let i = 0; i < e.w * TILE; i += 12) { g.fillStyle = 'rgba(255,200,0,.12)'; g.fillRect(e.x * TILE + i, e.y * TILE, 6, 4); g.fillRect(e.x * TILE + i, (e.y + e.h) * TILE - 4, 6, 4); }
  }

  // ---- particles ----
  const add = (n, o) => { for (let i = 0; i < n && parts.length < 900; i++) parts.push(o(i)); };
  const R = (a, b) => a + Math.random() * (b - a);
  function splat(x, y, color, n = 6, size = 10) {
    if (!decal) return;
    const g = decal.getContext('2d');
    g.fillStyle = color; g.globalAlpha = 0.55;
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x + R(-size, size), y + R(-size, size), R(2, size / 2), 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }
  const GORE = { crawler: '#5c2a6e', brute: '#6e3a1f', spitter: '#5fae2a', nest: '#7a2350', matriarch: '#8a1f3a' };
  const FTYPES = Object.keys(ENEMIES);

  function events(list, players) {
    const byPid = new Map(players.map(p => [p.pid, p]));
    for (const e of list) {
      const [k, a, b, c, d] = e;
      if (k === 'fire') {
        const p = byPid.get(a); if (!p) continue;
        const W = WEAPONS[b];
        const mx = p.x + Math.cos(p.a) * 18, my = p.y + Math.sin(p.a) * 18;
        if (W.kind !== 'flame') flashes.push({ x: mx, y: my, r: W.kind === 'rocket' ? 90 : 60, life: 0.06, max: 0.06, c: '255,220,150' });
        if (W.kind === 'pellet' || W.kind === 'rocket') shake = Math.max(shake, W.kind === 'rocket' ? 5 : 3);
        if (W.kind === 'bolt' || W.kind === 'pellet') add(1, () => ({ x: p.x, y: p.y, vx: Math.cos(p.a + 1.6) * 60, vy: Math.sin(p.a + 1.6) * 60, life: 0.5, max: 0.5, c: '#d9b35a', s: 2 }));
      } else if (k === 'rail') {
        parts.push({ beam: [a, b, c, d], life: 0.25, max: 0.25 });
        flashes.push({ x: a, y: b, r: 80, life: 0.1, max: 0.1, c: '150,220,255' });
        shake = Math.max(shake, 4);
      } else if (k === 'hit') {
        add(4, () => ({ x: a, y: b, vx: R(-120, 120), vy: R(-120, 120), life: R(0.2, 0.4), max: 0.4, c: GORE[FTYPES[c]] || '#7a2', s: R(2, 4) }));
      } else if (k === 'die') {
        const t = FTYPES[c], big = t === 'brute' || t === 'nest' || t === 'matriarch';
        add(big ? 26 : 12, () => ({ x: a, y: b, vx: R(-200, 200), vy: R(-200, 200), life: R(0.3, 0.7), max: 0.7, c: GORE[t], s: R(2, big ? 7 : 5) }));
        splat(a, b, GORE[t], big ? 14 : 6, big ? 26 : 12);
        if (big) shake = Math.max(shake, 7);
      } else if (k === 'boom') {
        add(30, () => { const an = R(0, 6.3), sp = R(40, 320); return { x: a, y: b, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: R(0.3, 0.8), max: 0.8, c: Math.random() < 0.5 ? '#ffb648' : '#ff6a2a', s: R(3, 8), drag: 3 }; });
        add(8, () => ({ x: a + R(-20, 20), y: b + R(-20, 20), vx: R(-20, 20), vy: R(-40, -10), life: R(0.8, 1.4), max: 1.4, c: '#444', s: R(10, 18), smoke: 1 }));
        flashes.push({ x: a, y: b, r: 220, life: 0.25, max: 0.25, c: '255,170,80' });
        splat(a, b, 'rgba(0,0,0,.8)', 10, 30);
        shake = Math.max(shake, 10);
      } else if (k === 'spark') {
        add(3, () => ({ x: a, y: b, vx: R(-90, 90), vy: R(-90, 90), life: 0.18, max: 0.18, c: c === 4 ? '#9f3' : '#fe8', s: 2 }));
      } else if (k === 'splat' || k === 'spit') {
        add(5, () => ({ x: a, y: b, vx: R(-60, 60), vy: R(-60, 60), life: 0.35, max: 0.35, c: '#9f3', s: 3 }));
      } else if (k === 'bite') {
        add(5, () => ({ x: a, y: b, vx: R(-80, 80), vy: R(-80, 80), life: 0.3, max: 0.3, c: '#e33', s: 3 }));
        splat(a, b, '#6a1010', 2, 8);
      } else if (k === 'ouch') {
        const p = byPid.get(a); if (p && p.local) shake = Math.max(shake, 4);
      } else if (k === 'down') {
        const p = byPid.get(a);
        if (p) { splat(p.x, p.y, '#6a1010', 10, 16); add(14, () => ({ x: p.x, y: p.y, vx: R(-150, 150), vy: R(-150, 150), life: 0.6, max: 0.6, c: COLORS[p.c], s: 3 })); }
      } else if (k === 'brood') {
        add(6, () => ({ x: a, y: b, vx: R(-70, 70), vy: R(-70, 70), life: 0.4, max: 0.4, c: '#7a2350', s: 3 }));
      } else if (k === 'roar') {
        shake = Math.max(shake, 9);
      }
    }
  }

  // ---- frame ----
  function frame(view, local, dt) {
    if (!map) return;
    // Camera: frame every local marine still standing (or everyone, if none).
    const L = view.players.filter(p => local.has(p.pid) && p.alive);
    const follow = L.length ? L : view.players.filter(p => p.alive);
    const base = Math.max(0.9, Math.min(W / (24 * TILE), H / (15 * TILE)));
    if (follow.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of follow) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
      const fit = Math.min(W / (x1 - x0 + 360), H / (y1 - y0 + 300));
      const tz = Math.max(0.45, Math.min(base, fit));
      const k = Math.min(1, dt * 6);
      if (!cam.init) { cam.x = tx; cam.y = ty; cam.z = tz; cam.init = true; }
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * Math.min(1, dt * 2);
    }
    shake = Math.max(0, shake - dt * 30);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(mapImg, 0, 0); ctx.drawImage(decal, 0, 0);
    const t = performance.now() / 1000;

    // Exit pad glow.
    const e = map.exit;
    const ex = (e.x + e.w / 2) * TILE, ey = (e.y + e.h / 2) * TILE;
    ctx.save();
    ctx.globalAlpha = view.exitOpen ? 0.35 + 0.25 * Math.sin(t * 5) : 0.25;
    ctx.fillStyle = view.exitOpen ? '#3dff8a' : '#ff3d5a';
    ctx.fillRect(e.x * TILE + 6, e.y * TILE + 6, e.w * TILE - 12, e.h * TILE - 12);
    ctx.globalAlpha = 1; ctx.fillStyle = '#05070a'; ctx.font = 'bold 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(view.exitOpen ? 'EXIT' : 'LOCKED', ex, ey + 5);
    ctx.restore();

    for (const k of view.pickups) drawPickup(k, t);
    for (const f of view.foes) if (f.type === 'nest') drawFoe(f, t);
    for (const f of view.foes) if (f.type !== 'nest') drawFoe(f, t);
    for (const p of view.players) drawMarine(p, t, local.has(p.pid));
    for (const s of view.shots) drawShot(s, t);

    // Particles.
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      const al = q.life / q.max;
      if (q.beam) {
        ctx.strokeStyle = `rgba(150,220,255,${al})`; ctx.lineWidth = 6 * al + 1;
        ctx.beginPath(); ctx.moveTo(q.beam[0], q.beam[1]); ctx.lineTo(q.beam[2], q.beam[3]); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(q.beam[0], q.beam[1]); ctx.lineTo(q.beam[2], q.beam[3]); ctx.stroke();
        continue;
      }
      const drag = q.drag || 2;
      q.vx *= 1 - Math.min(1, drag * dt); q.vy *= 1 - Math.min(1, drag * dt);
      q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.globalAlpha = q.smoke ? al * 0.4 : al; ctx.fillStyle = q.c;
      if (q.smoke) { ctx.beginPath(); ctx.arc(q.x, q.y, q.s * (2 - al), 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    lighting(view, t, dt);
    pointers(view, local);
  }

  function lighting(view, t, dt) {
    // Darkness with holes cut where marines (and their torches) are.
    const s = 0.5 * cam.z, ox = W / 4 - cam.x * s, oy = H / 4 - cam.y * s;
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = 'rgba(2,3,6,0.82)'; dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1) => {
      const X = ox + x * s, Y = oy + y * s, RR = r * s;
      const g = dctx.createRadialGradient(X, Y, 0, X, Y, RR);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.6, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.beginPath(); dctx.arc(X, Y, RR, 0, Math.PI * 2); dctx.fill();
    };
    for (const p of view.players) {
      if (!p.alive) continue;
      hole(p.x, p.y, 150);
      // Torch cone.
      const X = ox + p.x * s, Y = oy + p.y * s, len = 420 * s, half = 0.5;
      const g = dctx.createRadialGradient(X, Y, 0, X, Y, len);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(X, Y); dctx.arc(X, Y, len, p.a - half, p.a + half); dctx.closePath(); dctx.fill();
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      hole(f.x, f.y, f.r, f.life / f.max);
    }
    const e = map.exit;
    hole((e.x + e.w / 2) * TILE, (e.y + e.h / 2) * TILE, view.exitOpen ? 140 : 90, 0.8);
    for (const f of view.foes) if (f.type === 'nest') hole(f.x, f.y, 70, 0.5);
    for (const sh of view.shots) if (sh.k === 'flame' || sh.k === 'rocket') hole(sh.x, sh.y, 60, 0.4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(dark, 0, 0, W, H);
    // Additive glow from flashes.
    ctx.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      const X = W / 2 + (f.x - cam.x) * cam.z, Y = H / 2 + (f.y - cam.y) * cam.z, RR = f.r * cam.z * 0.7;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, RR);
      g.addColorStop(0, `rgba(${f.c},${0.35 * f.life / f.max})`); g.addColorStop(1, `rgba(${f.c},0)`);
      ctx.fillStyle = g; ctx.fillRect(X - RR, Y - RR, RR * 2, RR * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Arrow at the screen edge toward the exit once it opens, and toward
  // teammates who are off screen.
  function pointers(view, local) {
    const targets = [];
    if (view.exitOpen) { const e = map.exit; targets.push({ x: (e.x + e.w / 2) * TILE, y: (e.y + e.h / 2) * TILE, c: '#3dff8a', label: 'EXIT' }); }
    for (const p of view.players) if (p.alive && !local.has(p.pid)) targets.push({ x: p.x, y: p.y, c: COLORS[p.c], label: p.name });
    for (const g of targets) {
      const X = W / 2 + (g.x - cam.x) * cam.z, Y = H / 2 + (g.y - cam.y) * cam.z;
      if (X > 20 && Y > 70 && X < W - 20 && Y < H - 90) continue;
      const a = Math.atan2(Y - H / 2, X - W / 2);
      const mx = W / 2 - 40, my = H / 2 - 90;
      const k = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
      const px = W / 2 + Math.cos(a) * k, py = H / 2 + Math.sin(a) * k;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.fillStyle = g.c; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = g.c; ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(g.label, px - Math.cos(a) * 24, py - Math.sin(a) * 24 + 4);
    }
  }

  // ---- sprites, drawn as shapes ----
  function drawMarine(p, t, mine) {
    if (!p.alive) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = COLORS[p.c];
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (p.respawnT > 0) { ctx.fillStyle = '#fff'; ctx.font = '600 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(p.respawnT), p.x, p.y + 4); }
      return;
    }
    const c = COLORS[p.c];
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(2, 5, PLAYER_R + 2, PLAYER_R - 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(p.a);
    // Gun.
    const W = WEAPONS[p.w] || WEAPONS[0];
    const glen = { bolt: 18, pellet: 16, flame: 17, rail: 24, rocket: 20 }[W.kind];
    ctx.fillStyle = '#20252c'; ctx.fillRect(4, -3.5, glen, 7);
    ctx.fillStyle = c; ctx.fillRect(4 + glen - 4, -3.5, 4, 7);
    // Shoulders and body.
    ctx.fillStyle = '#2a323c'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(1, -3, 6, 6);
    ctx.fillStyle = '#e9f6ff'; ctx.fillRect(4, -2, 3, 4);
    ctx.restore();
    // Name and health.
    ctx.font = `600 ${mine ? 11 : 10}px "Chakra Petch", sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = c; ctx.fillText(p.name, p.x, p.y - 22);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - 13, p.y - 18, 26, 3);
    ctx.fillStyle = p.hp > 40 ? '#3dff8a' : '#ff3d5a'; ctx.fillRect(p.x - 13, p.y - 18, 26 * p.hp / 100, 3);
  }

  function drawFoe(f, t) {
    const E = ENEMIES[f.type], r = E.r;
    ctx.save(); ctx.translate(f.x, f.y);
    const wob = Math.sin(t * 14 + f.id) * (f.awake ? 1 : 0.2);
    if (f.type === 'nest') {
      const pulse = 1 + Math.sin(t * 3 + f.id) * 0.06;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#3a1430'; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a2350';
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e0508c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      bar(f, r + 10);
      return;
    }
    ctx.rotate(f.a);
    const body = { crawler: '#3e1f4d', brute: '#4d2a17', spitter: '#2f4d1a', matriarch: '#4d1426' }[f.type];
    const shell = { crawler: '#6b3a80', brute: '#8a5230', spitter: '#5fae2a', matriarch: '#a3284d' }[f.type];
    // Legs.
    ctx.strokeStyle = body; ctx.lineWidth = f.type === 'matriarch' ? 5 : f.type === 'brute' ? 4 : 2;
    const legs = f.type === 'matriarch' ? 5 : 3;
    for (let i = 0; i < legs; i++) for (const side of [-1, 1]) {
      const lx = (i - (legs - 1) / 2) * r * 0.6, sw = Math.sin(t * 16 + i * 2 + (side > 0 ? 1.5 : 0)) * (f.awake ? r * 0.25 : 0);
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx + sw, side * r * 1.25); ctx.stroke();
    }
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-r * 0.3, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shell; ctx.beginPath(); ctx.ellipse(-r * 0.35 + wob, 0, r * 0.85, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    if (f.type === 'spitter') { ctx.fillStyle = '#b6ff5a'; ctx.beginPath(); ctx.arc(-r * 0.5, 0, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
    // Head and mandibles.
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(r * 0.7, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = Math.max(1.5, r / 8);
    ctx.beginPath(); ctx.moveTo(r * 0.9, -r * 0.25); ctx.lineTo(r * 1.3, -r * 0.05 - wob * 0.1); ctx.moveTo(r * 0.9, r * 0.25); ctx.lineTo(r * 1.3, r * 0.05 + wob * 0.1); ctx.stroke();
    ctx.fillStyle = f.awake ? '#ff3d5a' : '#663'; ctx.fillRect(r * 0.8, -r * 0.2, 2, 2); ctx.fillRect(r * 0.8, r * 0.2 - 2, 2, 2);
    ctx.restore();
    if (f.type !== 'crawler' && f.hp < 100) bar(f, r + 8);
  }

  function bar(f, off) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(f.x - 16, f.y - off, 32, 3);
    ctx.fillStyle = '#ff6a2a'; ctx.fillRect(f.x - 16, f.y - off, 32 * f.hp / 100, 3);
  }

  function drawShot(s, t) {
    const a = Math.atan2(s.vy, s.vx);
    if (s.k === 'bolt') {
      ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(a) * 14, s.y - Math.sin(a) * 14); ctx.stroke();
    } else if (s.k === 'pellet') {
      ctx.fillStyle = '#ffe28a'; ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    } else if (s.k === 'flame') {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 14);
      g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(0.5, 'rgba(255,140,40,.6)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI * 2); ctx.fill();
    } else if (s.k === 'rocket') {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
      ctx.fillStyle = '#ddd'; ctx.fillRect(-6, -2.5, 12, 5); ctx.fillStyle = '#ffb648'; ctx.fillRect(-10, -2, 4, 4);
      ctx.restore();
      if (Math.random() < 0.6) parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.6, max: 0.6, c: '#555', s: 6, smoke: 1 });
    } else if (s.k === 'acid') {
      ctx.fillStyle = '#9f3'; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,255,60,.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }

  const PICK = { scatter: ['S', '#ffe28a'], flamer: ['T', '#ff8a2a'], rail: ['L', '#7fe8ff'], rocket: ['B', '#ff6ad5'], med: ['+', '#3dff8a'], ammo: ['A', '#d9b35a'] };
  function drawPickup(k, t) {
    const [glyph, c] = PICK[k.kind] || ['?', '#fff'];
    const y = k.y + Math.sin(t * 3 + k.id) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(k.x - 9, k.y + 7, 18, 4);
    ctx.fillStyle = '#12161b'; ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.fillRect(k.x - 10, y - 10, 20, 20); ctx.strokeRect(k.x - 10, y - 10, 20, 20);
    ctx.fillStyle = c; ctx.font = 'bold 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(glyph, k.x, y + 5);
  }

  // Screen to world, for mouse aim.
  const toWorld = (sx, sy) => ({ x: cam.x + (sx - W / 2) / cam.z, y: cam.y + (sy - H / 2) / cam.z });

  resize();
  window.addEventListener('resize', resize);
  return { frame, setMap, events, toWorld, resetCam: () => { cam.init = false; } };
}
