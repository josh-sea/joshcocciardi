/* Gatekeeper - sandboxed game engine
 *
 * Runs inside a manifest-declared sandbox page: null origin, no chrome.*,
 * no extension storage, no access to the parent document. It receives game
 * code (an object-literal string the model wrote) over postMessage, builds
 * it with new Function, and runs a fixed platformer harness around it. The
 * harness owns physics, collision, camera, and lives, so a generation only
 * has to describe a level and flip abilities. An optional onUpdate hook is
 * the escape hatch for anything novel, and every hook call is wrapped so a
 * bad frame reports out instead of taking things down.
 */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

let cfg = null;
let knobs = {};
let state = null;
let raf = 0;
let tickCount = 0;
const input = { left: false, right: false, up: false, jump: false, shoot: false, dash: false };

function post(msg) { parent.postMessage(msg, "*"); }

/* ---------- build + validate ---------- */

function repair(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")        // block comments
    .replace(/([^:])\/\/[^\n\r]*/g, "$1")     // line comments (keep http://)
    .replace(/,\s*,/g, ",")                    // double commas
    .replace(/\[\s*,/g, "[")                   // leading comma in an array
    .replace(/\{\s*,/g, "{")                   // leading comma in an object
    .replace(/,\s*(\]|\})/g, "$1");            // trailing comma before ] or }
}

function buildConfig(code) {
  const cleaned = repair(code).replace(/^\s*return\s+/, "").replace(/;\s*$/, "");
  try {
    return new Function('"use strict"; return (' + cleaned + ");")();
  } catch (e1) {
    return new Function('"use strict";' + repair(code))(); // statements form
  }
}

function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function arr(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }

function validate(raw) {
  const c = raw || {};
  const player = c.player || {};
  const out = {
    meta: { name: String((c.meta && c.meta.name) || "My Game").slice(0, 40) },
    world: { length: Math.min(20000, num(c.world && c.world.length, 3200)), groundY: num(c.world && c.world.groundY, H - 40) },
    player: {
      doubleJump: !!player.doubleJump,
      fly: !!player.fly,
      dash: !!player.dash,
      weapon: !!player.weapon,
      stompKill: player.stompKill !== false
    },
    theme: {
      sky: (c.theme && c.theme.sky) || "#0E1A24",
      ground: (c.theme && c.theme.ground) || "#2C7A4B",
      player: (c.theme && c.theme.player) || "#F2B441"
    },
    platforms: arr(c.platforms, 120).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0), w: num(p.w, 60), h: num(p.h, 16) })),
    enemies: arr(c.enemies, 80).map((e) => ({
      x: num(e.x, 0), y: num(e.y, 0), type: e.type === "flyer" || e.type === "shooter" ? e.type : "walker",
      speed: num(e.speed, 1.2), dir: e.dir === 1 ? 1 : -1
    })),
    coins: arr(c.coins, 200).map((k) => ({ x: num(k.x, 0), y: num(k.y, 0) })),
    powerups: arr(c.powerups, 40).map((u) => ({
      x: num(u.x, 0), y: num(u.y, 0),
      kind: ["grow", "fly", "fire", "speed", "heart"].includes(u.kind) ? u.kind : "grow"
    })),
    goal: { x: num(c.goal && c.goal.x, num(c.world && c.world.length, 3200) - 60) },
    knobs: arr(c.knobs, 12).map((k) => ({
      id: String(k.id || "").slice(0, 24),
      label: String(k.label || k.id || "Setting").slice(0, 24),
      min: num(k.min, 0), max: num(k.max, 10), step: num(k.step, 1), value: num(k.value, 1)
    })).filter((k) => k.id),
    hooks: {}
  };
  if (c.hooks && typeof c.hooks.onUpdate === "function") out.hooks.onUpdate = c.hooks.onUpdate;
  if (c.hooks && typeof c.hooks.onStart === "function") out.hooks.onStart = c.hooks.onStart;

  // guarantee the core knobs exist so the sliders are always meaningful
  const ensure = (id, label, min, max, step, value) => {
    if (!out.knobs.find((k) => k.id === id)) out.knobs.push({ id, label, min, max, step, value });
  };
  ensure("gravity", "Gravity", 0.2, 1.2, 0.05, 0.5);
  ensure("jump", "Jump height", 6, 20, 1, 11);
  ensure("speed", "Run speed", 1.5, 8, 0.5, 4);
  ensure("hearts", "Hearts", 1, 9, 1, 3);
  return out;
}

function knobVal(id, d) { return id in knobs ? knobs[id] : d; }

/* ---------- game state ---------- */

function reset() {
  const spawn = { x: 40, y: cfg.world.groundY - 80 };
  const P = cfg.player;
  state = {
    p: {
      x: spawn.x, y: spawn.y, w: 20, h: 26, vx: 0, vy: 0, ground: false, face: 1, jumps: 0,
      hp: knobVal("hearts", 3), inv: 0,
      fly: P.fly, weapon: P.weapon, doubleJump: P.doubleJump, dash: P.dash,
      big: false, boost: 0
    },
    enemies: cfg.enemies.map((e) => ({ ...e, alive: true, cd: 0, homeY: e.y })),
    coins: cfg.coins.map((c) => ({ ...c, got: false })),
    powerups: cfg.powerups.map((u) => ({ ...u, got: false })),
    bullets: [],
    score: 0,
    camX: 0,
    status: "play",
    dashCd: 0, shootCd: 0, jumpHeld: false
  };
  if (cfg.hooks.onStart) safeHook(cfg.hooks.onStart);
  post({ type: "EVENT", event: "start", score: 0, hp: state.p.hp });
}

function resizePlayer() {
  const p = state.p;
  const nw = p.big ? 28 : 20, nh = p.big ? 36 : 26;
  p.y -= (nh - p.h);
  p.w = nw; p.h = nh;
}

function api() {
  return {
    player: state.p,
    enemies: state.enemies,
    coins: state.coins,
    input,
    W, H,
    knob: (id, d) => knobVal(id, d),
    spawnBullet: (x, y, vx, vy, fromPlayer) => {
      if (state.bullets.length < 60) state.bullets.push({ x, y, vx, vy, player: !!fromPlayer });
    },
    time: tickCount
  };
}

let hookErrored = false;
function safeHook(fn) {
  if (hookErrored) return;
  try { fn(api()); }
  catch (e) {
    hookErrored = true;
    post({ type: "ERROR", message: "The custom code hit a snag: " + (e.message || e) });
  }
}

/* ---------- physics ---------- */

function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function solids() {
  const g = { x: -200, y: cfg.world.groundY, w: cfg.world.length + 400, h: 400 };
  return [g, ...cfg.platforms];
}

function movePlayer() {
  const p = state.p;
  const grav = knobVal("gravity", 0.5);
  if (p.boost > 0) p.boost--;
  const speed = knobVal("speed", 4) * (p.boost > 0 ? 1.6 : 1);
  const jumpV = knobVal("jump", 11);

  // horizontal
  let ax = 0;
  if (input.left) ax -= 1;
  if (input.right) ax += 1;
  if (ax !== 0) { p.vx = ax * speed; p.face = ax; }
  else p.vx *= 0.7;

  // dash
  if (p.dash && input.dash && state.dashCd <= 0) { p.vx = p.face * speed * 2.6; state.dashCd = 40; }
  if (state.dashCd > 0) state.dashCd--;

  // fly overrides gravity while up is held
  const flying = p.fly && input.up;
  if (flying) p.vy = -speed * 1.1;
  else p.vy = Math.min(p.vy + grav, 12);

  // jump (edge triggered)
  if (input.jump && !state.jumpHeld) {
    if (p.ground) { p.vy = -jumpV; p.jumps = 1; }
    else if (p.doubleJump && p.jumps < 2) { p.vy = -jumpV; p.jumps = 2; }
  }
  state.jumpHeld = input.jump;

  // integrate + collide
  p.x += p.vx;
  collide(p, "x");
  p.y += p.vy;
  p.ground = false;
  collide(p, "y");

  if (p.x < 0) p.x = 0;
  if (p.x + p.w > cfg.world.length) p.x = cfg.world.length - p.w;
  if (p.y > H + 200) damage(4); // fell off the world

  if (p.inv > 0) p.inv--;

  // shoot
  if (p.weapon && input.shoot && state.shootCd <= 0) {
    state.bullets.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vx: p.face * 7, vy: 0, player: true });
    state.shootCd = 16;
  }
  if (state.shootCd > 0) state.shootCd--;
}

function collide(e, axis) {
  for (const s of solids()) {
    if (!aabb(e, s)) continue;
    if (axis === "x") {
      if (e.vx > 0) e.x = s.x - e.w;
      else if (e.vx < 0) e.x = s.x + s.w;
      e.vx = 0;
    } else {
      if (e.vy > 0) { e.y = s.y - e.h; e.ground = true; e.jumps = 0; }
      else if (e.vy < 0) e.y = s.y + s.h;
      e.vy = 0;
    }
  }
}

function damage(n) {
  const p = state.p;
  if (p.inv > 0) return;
  if (p.big && n <= 1) { // grown players take a hit by shrinking
    p.big = false; resizePlayer(); p.inv = 60;
    post({ type: "EVENT", event: "hurt", hp: p.hp, score: state.score });
    return;
  }
  p.hp -= n;
  p.inv = 60;
  post({ type: "EVENT", event: "hurt", hp: Math.max(0, p.hp), score: state.score });
  if (p.hp <= 0) { state.status = "lose"; post({ type: "EVENT", event: "lose", score: state.score }); }
}

function applyPowerup(kind) {
  const p = state.p;
  if (kind === "grow") { if (!p.big) { p.big = true; resizePlayer(); } }
  else if (kind === "fly") p.fly = true;
  else if (kind === "fire") p.weapon = true;
  else if (kind === "speed") p.boost = 600;
  else if (kind === "heart") p.hp = Math.min(9, p.hp + 1);
  post({ type: "EVENT", event: "power", kind, score: state.score, hp: p.hp });
}

function updatePowerups() {
  const p = state.p;
  for (const u of state.powerups) {
    if (u.got) continue;
    if (Math.abs(p.x + p.w / 2 - u.x) < 18 && Math.abs(p.y + p.h / 2 - u.y) < 20) {
      u.got = true;
      applyPowerup(u.kind);
    }
  }
}

function updateEnemies() {
  const p = state.p;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const eb = { x: e.x, y: e.y, w: 22, h: 22 };

    if (e.type === "walker") {
      e.x += e.speed * e.dir;
      // turn at platform edges / walls
      const ahead = { x: e.x + (e.dir > 0 ? 24 : -4), y: e.y + 24, w: 2, h: 4 };
      let grounded = false;
      for (const s of solids()) if (aabb(ahead, s)) grounded = true;
      if (!grounded) e.dir *= -1;
      if (e.x < 0 || e.x > cfg.world.length) e.dir *= -1;
      // settle onto ground
      e.y = Math.min(e.y + 3, floorUnder(e.x, e.y) - 22);
    } else if (e.type === "flyer") {
      e.x += e.speed * e.dir;
      e.y = e.homeY + Math.sin(tickCount / 22 + e.x) * 22;
      if (e.x < 0 || e.x > cfg.world.length) e.dir *= -1;
    } else if (e.type === "shooter") {
      e.cd = (e.cd || 0) - 1;
      if (e.cd <= 0 && Math.abs(e.x - p.x) < 260) {
        state.bullets.push({ x: e.x, y: e.y + 10, vx: (p.x < e.x ? -1 : 1) * 3.4, vy: 0, player: false });
        e.cd = 90;
      }
    }

    if (aabb(p, eb)) {
      const stomp = cfg.player.stompKill && p.vy > 0 && p.y + p.h - eb.y < 16;
      if (stomp) { e.alive = false; p.vy = -knobVal("jump", 11) * 0.6; state.score += 1; post({ type: "EVENT", event: "score", score: state.score, hp: p.hp }); }
      else damage(1);
    }
  }
}

function floorUnder(x, y) {
  let best = cfg.world.groundY;
  for (const s of solids()) if (x > s.x && x < s.x + s.w && s.y >= y - 4) best = Math.min(best, s.y);
  return best;
}

function updateBullets() {
  const p = state.p;
  for (const b of state.bullets) { b.x += b.vx; b.y += b.vy; }
  state.bullets = state.bullets.filter((b) => {
    if (b.x < state.camX - 40 || b.x > state.camX + W + 40) return false;
    if (b.player) {
      for (const e of state.enemies) {
        if (e.alive && Math.abs(e.x - b.x) < 14 && Math.abs(e.y - b.y) < 16) {
          e.alive = false; state.score += 1;
          post({ type: "EVENT", event: "score", score: state.score, hp: p.hp });
          return false;
        }
      }
    } else if (Math.abs(p.x + p.w / 2 - b.x) < 12 && Math.abs(p.y + p.h / 2 - b.y) < 14) {
      damage(1); return false;
    }
    return true;
  });
}

function updateCoins() {
  const p = state.p;
  for (const c of state.coins) {
    if (c.got) continue;
    if (Math.abs(p.x + p.w / 2 - c.x) < 16 && Math.abs(p.y + p.h / 2 - c.y) < 18) {
      c.got = true; state.score += 1;
      post({ type: "EVENT", event: "score", score: state.score, hp: p.hp });
    }
  }
}

/* ---------- render ---------- */

function draw() {
  ctx.fillStyle = cfg.theme.sky; ctx.fillRect(0, 0, W, H);
  // parallax hills
  ctx.fillStyle = "rgba(255,255,255,.04)";
  for (let i = 0; i < 6; i++) {
    const hx = (i * 220 - state.camX * 0.4) % (W + 220) - 110;
    ctx.beginPath(); ctx.arc(hx, H - 30, 90, Math.PI, 0); ctx.fill();
  }
  ctx.save();
  ctx.translate(-state.camX, 0);

  // ground + platforms
  ctx.fillStyle = cfg.theme.ground;
  ctx.fillRect(-200, cfg.world.groundY, cfg.world.length + 400, 400);
  for (const s of cfg.platforms) { ctx.fillRect(s.x, s.y, s.w, s.h); }

  // goal flag
  ctx.fillStyle = "#E5484D";
  ctx.fillRect(cfg.goal.x, cfg.world.groundY - 60, 4, 60);
  ctx.beginPath(); ctx.moveTo(cfg.goal.x + 4, cfg.world.groundY - 60); ctx.lineTo(cfg.goal.x + 28, cfg.world.groundY - 50); ctx.lineTo(cfg.goal.x + 4, cfg.world.groundY - 40); ctx.fill();

  // coins
  ctx.fillStyle = "#F2C94C";
  for (const c of state.coins) if (!c.got) { ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, 7); ctx.fill(); }

  // power-ups
  const PU = { grow: ["#35D07F", "B"], fly: ["#5AA9FF", "F"], fire: ["#FF6B4A", "★"], speed: ["#F2B441", "S"], heart: ["#E5484D", "♥"] };
  for (const u of state.powerups) {
    if (u.got) continue;
    const [col, ch] = PU[u.kind] || PU.grow;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(u.x, u.y + Math.sin(tickCount / 12 + u.x) * 3, 10, 0, 7); ctx.fill();
    ctx.fillStyle = "#0B0F13"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(ch, u.x, u.y + 4 + Math.sin(tickCount / 12 + u.x) * 3);
  }

  // enemies
  for (const e of state.enemies) if (e.alive) {
    ctx.fillStyle = e.type === "shooter" ? "#C86BFF" : e.type === "flyer" ? "#5AA9FF" : "#E5484D";
    ctx.fillRect(e.x, e.y, 22, 22);
    ctx.fillStyle = "#0B0F13"; ctx.fillRect(e.x + 5, e.y + 7, 4, 4); ctx.fillRect(e.x + 13, e.y + 7, 4, 4);
  }

  // bullets
  for (const b of state.bullets) { ctx.fillStyle = b.player ? "#7CFFB8" : "#FF8A8D"; ctx.fillRect(b.x - 3, b.y - 2, 6, 4); }

  // player (blink while invincible)
  const p = state.p;
  if (!(p.inv > 0 && Math.floor(tickCount / 4) % 2)) {
    ctx.fillStyle = cfg.theme.player;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#0B0F13";
    ctx.fillRect(p.x + (p.face > 0 ? 11 : 4), p.y + 7, 4, 4);
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = "#E5484D";
  for (let i = 0; i < p.hp; i++) { ctx.fillRect(10 + i * 16, 10, 11, 11); }
  ctx.fillStyle = "#E7EEF5"; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "right";
  ctx.fillText("★ " + state.score, W - 10, 20);
  ctx.textAlign = "left"; ctx.fillStyle = "rgba(231,238,245,.6)";
  ctx.fillText(cfg.meta.name, 10, H - 10);

  if (state.status !== "play") {
    ctx.fillStyle = "rgba(11,15,19,.82)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = state.status === "win" ? "#35D07F" : "#E5484D";
    ctx.font = "bold 30px system-ui";
    ctx.fillText(state.status === "win" ? "You win!" : "Ouch!", W / 2, H / 2 - 8);
    ctx.fillStyle = "#B7C6D4"; ctx.font = "14px system-ui";
    ctx.fillText("Press space or tap to play again", W / 2, H / 2 + 22);
  }
}

/* ---------- loop ---------- */

function frame() {
  raf = requestAnimationFrame(frame);
  tickCount++;
  if (state.status === "play") {
    movePlayer();
    updateEnemies();
    updateBullets();
    updateCoins();
    updatePowerups();
    if (cfg.hooks.onUpdate) safeHook(cfg.hooks.onUpdate);
    state.camX = Math.max(0, Math.min(state.p.x - W * 0.35, cfg.world.length - W));
    if (state.p.x + state.p.w > cfg.goal.x && state.status === "play") {
      state.status = "win"; post({ type: "EVENT", event: "win", score: state.score });
    }
  }
  draw();
  if (tickCount % 30 === 0) post({ type: "TICK" }); // watchdog heartbeat
}

function start() {
  cancelAnimationFrame(raf);
  hookErrored = false;
  reset();
  frame();
}

/* ---------- input ---------- */

const KEYMAP = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", Space: "jump", KeyX: "shoot", KeyJ: "shoot", ShiftLeft: "dash", KeyK: "dash"
};
function setKey(code, val) {
  const k = KEYMAP[code];
  if (!k) return;
  input[k] = val;
  if (k === "jump") input.jump = val;
}
window.addEventListener("keydown", (e) => {
  if (KEYMAP[e.code]) e.preventDefault();
  if (e.code === "Space" && state && state.status !== "play") return start();
  setKey(e.code, true);
});
window.addEventListener("keyup", (e) => setKey(e.code, false));

// touch / click: tap left half = move toward center, right half = jump; on end screen restart
canvas.addEventListener("pointerdown", (e) => {
  if (state && state.status !== "play") return start();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  if (x < 0.33) input.left = true;
  else if (x > 0.66) input.right = true;
  else { input.jump = true; }
});
window.addEventListener("pointerup", () => { input.left = input.right = input.jump = false; });

/* ---------- bridge ---------- */

window.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "LOAD") {
    try {
      const built = buildConfig(m.code);
      cfg = validate(built);
      knobs = {};
      cfg.knobs.forEach((k) => (knobs[k.id] = k.value));
      if (m.knobValues) Object.assign(knobs, m.knobValues);
      post({ type: "KNOBS", knobs: cfg.knobs, values: knobs, name: cfg.meta.name });
      post({ type: "READY" });
      start();
    } catch (err) {
      post({ type: "ERROR", message: "Could not build that game: " + (err.message || err) });
    }
  } else if (m.type === "SET_KNOB") {
    knobs[m.id] = m.value;
    if (m.id === "hearts" && state && state.status === "play") {
      state.p.hp = Math.min(state.p.hp, m.value); // lowering hearts caps current
    }
  } else if (m.type === "RESTART") {
    if (cfg) start();
  } else if (m.type === "PAUSE") {
    cancelAnimationFrame(raf);
  } else if (m.type === "RESUME") {
    if (cfg) { cancelAnimationFrame(raf); frame(); }
  }
});

post({ type: "BOOT" });
