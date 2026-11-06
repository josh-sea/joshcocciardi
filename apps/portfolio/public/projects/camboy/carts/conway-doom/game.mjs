/**
 * Conway's DOOM, cartridge #4 for the Camboy.
 *
 * Seen from above: cross a field whose walls follow Conway's Game of
 * Life. Shoot cells (A), plant seed cells (B), and reach the exit before
 * the field closes in. See rules.mjs for the engine and the levels.
 */

import {
  W, H, CELL, TOP, VIEW_COLS, VIEW_ROWS, TICK, SPEED, HEARTS, FLOOR, STONE, EXIT,
  step, PATTERNS, orient, stamp, LEVELS, buildLevel, moveBox, boxCells, faceFrom, validSave, makeRng, gunWithEater,
  SCAR_TICKS, scarred,
} from "./rules.mjs";
import { createSound } from "./sound.mjs";

export const meta = {
  id: "conway-doom",
  title: "CONWAY'S DOOM",
  blurb: "The walls are alive. Shoot, seed, survive.",
};

const FH = H - TOP;                 // the field's height on screen, 128
const BOX = 3;                      // the hero's body, in pixels
const AMMO_START = 12, AMMO_MAX = 30, SEEDS_START = 3, SEEDS_MAX = 9;
const GUIDE = ["block", "beehive", "loaf", "boat", "blinker", "toad", "beacon", "pulsar", "glider", "lwss", "gun", "eater"];

/** Wrap text to lines of at most n characters. */
function wrap(text, n = 37) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= n) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

export function boot(hw) {
  const { lcd, input, haptic } = hw;
  const { px, rect, text, textW, ctext, banner } = lcd;
  const { held, pressed, stick } = input;
  const snd = createSound(hw);
  const { sfx } = snd;
  snd.play("title");

  let save = hw.load("conway.save", null);
  if (!validSave(save)) save = { level: 0, seed: (Date.now() % 100000) | 0 };
  let best = hw.load("conway.best", 0);

  const S = {
    phase: "title", t: 0, sel: 0, dialog: null, paused: false, toast: null, shake: 0,
    L: null, cells: null, next: null, born: null, died: null, dirty: true, tickT: 0, gen: 0, levelT: 0,
    shots: [], fx: [], items: [], guide: null,
  };
  const P = { x: 0, y: 0, face: { x: 1, y: 0 }, hp: HEARTS, ammo: AMMO_START, seeds: SEEDS_START, inv: 0, cd: 0, moving: false, step: 0 };

  const setPhase = (p) => { S.phase = p; S.t = 0; };
  const toast = (lines, t = 1.4) => { S.toast = { lines: [].concat(lines), t }; };
  function talk(pages, then) { S.dialog = { pages: pages.map((p) => wrap(p)), page: 0, shown: 0, then }; }

  /* ---------- levels ---------- */

  function startLevel(i) {
    S.level = i;
    S.L = buildLevel(i, save.seed);
    S.cells = S.L.cells.slice();
    S.scars = new Uint8Array(S.L.w * S.L.h);
    S.items = S.L.items.map((it) => ({ ...it }));
    S.shots = []; S.fx = [];
    S.dirty = true; S.tickT = 0; S.gen = 0; S.levelT = 0;
    P.x = S.L.start.x * CELL + 0.5; P.y = S.L.start.y * CELL + 0.5;
    P.face = { x: 1, y: 0 }; P.inv = 1.5; P.cd = 0;
    P.ammo = Math.max(P.ammo, AMMO_START); P.seeds = Math.max(P.seeds, SEEDS_START);
    if (i > save.level || i === 0) { save.level = i; hw.save("conway.save", save); }
    if (i + 1 > best) { best = i + 1; hw.save("conway.best", best); }
    snd.play("field");
    setPhase("play");
    toast([`LEVEL ${i + 1}`, S.L.title], 1.8);
    if (S.L.tips.length) talk(S.L.tips);
  }

  function newGame(from = 0) {
    P.hp = HEARTS; P.ammo = AMMO_START; P.seeds = SEEDS_START;
    if (from === 0) { save = { level: 0, seed: (Date.now() % 100000) | 0 }; hw.save("conway.save", save); }
    startLevel(from);
  }

  /* ---------- the field ---------- */

  const idx = (x, y) => y * S.L.w + x;
  const onField = (x, y) => x >= 0 && y >= 0 && x < S.L.w && y < S.L.h;

  /** What the next generation will look like, for the preview and the tick. */
  function preview() {
    if (!S.dirty) return;
    S.born = []; S.died = [];
    S.next = step(S.cells, scarred(S.L.tiles, S.scars), S.L.w, S.L.h, S.born, S.died);
    S.bornSet = new Set(S.born); S.diedSet = new Set(S.died);
    S.dirty = false;
  }

  function tick() {
    preview();
    S.cells = S.next;
    S.gen++;
    S.dirty = true;
    for (let i = 0; i < S.scars.length; i++) if (S.scars[i]) S.scars[i]--;
    sfx.tick();
    // A cell born on top of you hurts, and is squashed.
    const mine = boxCells(S.L, P.x, P.y, BOX);
    const hit = S.born.filter((i) => mine.includes(i));
    if (hit.length) {
      for (const i of hit) { S.cells[i] = 0; puff((i % S.L.w) * CELL + 2, ((i / S.L.w) | 0) * CELL + 2, 4); }
      hurt();
    }
  }

  function hurt() {
    if (P.inv > 0) return;
    P.hp--;
    P.inv = 1.3;
    S.shake = 0.25;
    sfx.hurt();
    haptic(30);
    if (P.hp <= 0) { snd.play("over"); setPhase("over"); }
  }

  function puff(x, y, n = 5) {
    for (let i = 0; i < n; i++) S.fx.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, t: 0.35 });
  }

  /* ---------- the hero ---------- */

  function shoot() {
    if (P.cd > 0) return;
    if (P.ammo <= 0) { sfx.empty(); P.cd = 0.25; toast(["OUT OF AMMO"], 0.7); return; }
    P.ammo--;
    P.cd = 0.16;
    const cx = P.x + BOX / 2, cy = P.y + BOX / 2;
    S.shots.push({ x: cx + P.face.x * 2, y: cy + P.face.y * 2, vx: P.face.x * 120, vy: P.face.y * 120, life: 1 });
    sfx.shot();
  }

  /** Plant a seed cell in the square in front of you. */
  function plant() {
    if (P.seeds <= 0) { sfx.empty(); toast(["NO SEEDS LEFT"], 0.7); return; }
    const cx = Math.floor((P.x + BOX / 2) / CELL) + P.face.x * 2, cy = Math.floor((P.y + BOX / 2) / CELL) + P.face.y * 2;
    if (!onField(cx, cy)) return;
    const i = idx(cx, cy);
    if (S.L.tiles[i] !== FLOOR || S.cells[i] || boxCells(S.L, P.x, P.y, BOX).includes(i)) { sfx.empty(); return; }
    S.cells[i] = 1;
    S.dirty = true;
    P.seeds--;
    sfx.seed();
    haptic(8);
  }

  function updatePlay(dt) {
    S.levelT += dt;
    P.inv = Math.max(0, P.inv - dt);
    P.cd = Math.max(0, P.cd - dt);
    P.face = faceFrom(stick.x, stick.y, P.face);
    P.moving = !!(stick.x || stick.y);
    if (P.moving) {
      const b = moveBox(S.L, S.cells, { x: P.x, y: P.y, s: BOX }, stick.x * SPEED * dt, stick.y * SPEED * dt);
      P.x = b.x; P.y = b.y;
      P.step += dt * 8;
    }
    if (pressed.has("a") || (held.a && P.cd <= 0 && P.ammo > 0)) shoot();
    if (pressed.has("b")) plant();

    // Shots: the first live cell they reach dies.
    for (const s of S.shots) {
      const n = 3;
      for (let k = 0; k < n && s.life > 0; k++) {
        s.x += (s.vx * dt) / n; s.y += (s.vy * dt) / n;
        const cx = Math.floor(s.x / CELL), cy = Math.floor(s.y / CELL);
        if (!onField(cx, cy)) { s.life = 0; break; }
        const i = idx(cx, cy);
        if (S.cells[i]) { S.cells[i] = 0; S.scars[i] = SCAR_TICKS; S.dirty = true; s.life = 0; puff(cx * CELL + 2, cy * CELL + 2, 5); sfx.pop(); haptic(6); }
        else if (S.L.tiles[i] === STONE) { s.life = 0; puff(s.x, s.y, 2); sfx.thud(); }
      }
      s.life -= dt;
    }
    S.shots = S.shots.filter((s) => s.life > 0);

    // Pickups.
    const mine = boxCells(S.L, P.x, P.y, BOX);
    for (const it of S.items) {
      if (it.got || !mine.includes(idx(it.x, it.y))) continue;
      it.got = true;
      if (it.kind === "ammo") { P.ammo = Math.min(AMMO_MAX, P.ammo + 8); toast(["+8 AMMO"], 0.8); }
      else if (it.kind === "seed") { P.seeds = Math.min(SEEDS_MAX, P.seeds + 3); toast(["+3 SEEDS"], 0.8); }
      else { P.hp = Math.min(HEARTS + 2, P.hp + 1); toast(["+1 HEART"], 0.8); }
      sfx.pickup();
      haptic(10);
    }

    // The exit.
    if (mine.some((i) => S.L.tiles[i] === EXIT)) {
      sfx.exit();
      snd.play("clear");
      P.hp = Math.min(HEARTS + 2, P.hp + 1);
      save.level = Math.max(save.level, S.level + 1);
      hw.save("conway.save", save);
      setPhase("clear");
      return;
    }

    // The clock.
    S.tickT += dt;
    if (S.tickT >= TICK) { S.tickT -= TICK; tick(); }
  }

  /* ---------- the field guide ---------- */

  function openGuide(from) {
    S.guide = { page: S.guide?.page ?? 0, from, back: S.phase };
    resetGuideSim();
    setPhase("guide");
  }

  /** The guide's little window: the pattern, living. */
  function resetGuideSim() {
    const key = GUIDE[S.guide.page];
    const rows = PATTERNS[key].rows;
    const big = key === "gun";
    const w = big ? 48 : 26, h = big ? 30 : 18;
    const cells = new Uint8Array(w * h);
    const flying = key === "glider" || key === "lwss";
    const x = flying ? 2 : Math.floor((w - rows[0].length) / 2), y = flying ? Math.floor(h / 2) - 2 : Math.floor((h - rows.length) / 2);
    // The gun gets its eater, so its gliders are swallowed instead of piling up at the edge.
    stamp(cells, w, big ? gunWithEater(4) : key === "lwss" ? orient(rows, 4) : rows, big ? 2 : x, big ? 1 : y);
    S.guide.sim = { w, h, cells, tiles: new Uint8Array(w * h), t: 0, gens: 0, size: big ? 2 : 3 };
  }

  function updateGuide(dt) {
    const g = S.guide;
    if (pressed.has("left") || pressed.has("right")) {
      g.page = (g.page + (pressed.has("left") ? GUIDE.length - 1 : 1)) % GUIDE.length;
      resetGuideSim();
      sfx.blip();
    }
    if (pressed.has("b") || pressed.has("start") || pressed.has("a")) {
      if (g.from === "title") { setPhase("title"); S.sel = 0; }
      else { S.phase = g.back; S.paused = true; S.sel = 1; }
      return;
    }
    const sim = g.sim;
    sim.t += dt;
    if (sim.t >= 0.25) {
      sim.t = 0;
      sim.cells = step(sim.cells, sim.tiles, sim.w, sim.h);
      if (++sim.gens > 90 && GUIDE[g.page] !== "gun") resetGuideSim();
    }
  }

  function drawGuide() {
    const g = S.guide, key = GUIDE[g.page], p = PATTERNS[key], sim = g.sim;
    rect(0, 0, W, H, 3);
    rect(0, 0, W, 11, 2);
    text("FIELD GUIDE", 3, 3, 0);
    const pg = `${g.page + 1}/${GUIDE.length}`;
    text(pg, W - 3 - textW(pg), 3, 1);
    ctext(p.name, 15, 0);
    ctext(p.kind, 23, 1);
    const bw = sim.w * sim.size, bh = sim.h * sim.size, bx = Math.round((W - bw) / 2), by = 31;
    rect(bx - 2, by - 2, bw + 4, bh + 4, 1);
    rect(bx - 1, by - 1, bw + 2, bh + 2, 0);
    for (let i = 0; i < sim.w * sim.h; i++) if (sim.cells[i]) rect(bx + (i % sim.w) * sim.size, by + ((i / sim.w) | 0) * sim.size, sim.size - (sim.size > 2 ? 1 : 0), sim.size - (sim.size > 2 ? 1 : 0), 3);
    const dy = Math.max(94, by + bh + 6);
    wrap(p.desc, 38).slice(0, 4).forEach((l, i) => ctext(l, dy + i * 8, 0));
    ctext("< > TURN THE PAGE   B: BACK", 134, 1);
  }

  /* ---------- the frame ---------- */

  const TITLE_ITEMS = () => (save.level > 0 ? [`CONTINUE (LEVEL ${save.level + 1})`, "NEW GAME", "FIELD GUIDE"] : ["NEW GAME", "FIELD GUIDE"]);

  function menu(n) {
    if (pressed.has("up")) { S.sel = (S.sel + n - 1) % n; sfx.blip(); haptic(5); }
    if (pressed.has("down")) { S.sel = (S.sel + 1) % n; sfx.blip(); haptic(5); }
    return pressed.has("a") || pressed.has("start") ? S.sel : -1;
  }

  function updateDialog(dt) {
    const d = S.dialog;
    const total = d.pages[d.page].join(" ").length;
    if (d.shown < total) {
      const before = Math.floor(d.shown);
      d.shown += dt * 55;
      if (Math.floor(d.shown) !== before && Math.floor(d.shown) % 3 === 0) sfx.type();
    }
    if (pressed.has("a") || pressed.has("b") || pressed.has("start")) {
      if (d.shown < total) d.shown = total;
      else if (d.page < d.pages.length - 1) { d.page++; d.shown = 0; sfx.blip(); }
      else { S.dialog = null; d.then?.(); }
    }
  }

  const PAUSE = ["RESUME", "FIELD GUIDE", "RESTART LEVEL", "QUIT"];

  function update(dt) {
    S.t += dt;
    S.shake = Math.max(0, S.shake - dt);
    if (S.toast && (S.toast.t -= dt) <= 0) S.toast = null;
    S.fx = S.fx.filter((f) => { f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; return f.t > 0; });
    if (pressed.has("select")) toast([["SOUND ON", "MUSIC OFF", "SOUND OFF"][snd.cycleMode()]], 0.8);

    if (S.phase === "title") {
      const items = TITLE_ITEMS();
      const pick = items[menu(items.length)];
      if (pick?.startsWith("CONTINUE")) newGame(save.level);
      else if (pick === "NEW GAME") newGame(0);
      else if (pick === "FIELD GUIDE") openGuide("title");
      return;
    }
    if (S.phase === "guide") { updateGuide(dt); return; }
    if (S.dialog) { updateDialog(dt); return; }
    if (S.phase === "clear") {
      if (S.t > 1.2 && (pressed.has("a") || pressed.has("start"))) startLevel(S.level + 1);
      return;
    }
    if (S.phase === "over") {
      if (S.t > 1.5 && (pressed.has("a") || pressed.has("start"))) { snd.play("title"); setPhase("title"); S.sel = 0; }
      return;
    }
    if (S.paused) {
      const pick = menu(PAUSE.length);
      if (pressed.has("b") || pick === 0) { S.paused = false; if (S.song?.name) snd.play(S.song.name, S.song.at); }
      else if (pick === 1) openGuide("pause");
      else if (pick === 2) { S.paused = false; P.ammo = Math.max(P.ammo, AMMO_START); startLevel(S.level); }
      else if (pick === 3) { S.paused = false; snd.play("title"); setPhase("title"); S.sel = 0; }
      return;
    }
    if (pressed.has("start")) { S.paused = true; S.sel = 0; S.song = snd.pause(); sfx.blip(); return; }
    if (S.phase === "play") updatePlay(dt);
  }

  /* ---------- drawing ---------- */

  function camera() {
    const lw = S.L.w * CELL, lh = S.L.h * CELL;
    const cx = lw <= W ? (lw - W) / 2 : Math.max(0, Math.min(lw - W, P.x + BOX / 2 - W / 2));
    const cy = lh <= FH ? (lh - FH) / 2 : Math.max(0, Math.min(lh - FH, P.y + BOX / 2 - FH / 2));
    const sh = S.shake > 0 ? Math.round((Math.random() - 0.5) * S.shake * 8) : 0;
    return { x: Math.round(cx) + sh, y: Math.round(cy) };
  }

  function drawField() {
    const L = S.L, cam = camera();
    rect(0, TOP, W, FH, 0);
    // The last part of every tick shows what's coming: births dotted in, deaths fading.
    const soon = S.tickT > TICK * 0.55;
    if (soon) preview();
    const x0 = Math.max(0, Math.floor(cam.x / CELL)), y0 = Math.max(0, Math.floor(cam.y / CELL));
    const x1 = Math.min(L.w - 1, Math.floor((cam.x + W) / CELL)), y1 = Math.min(L.h - 1, Math.floor((cam.y + FH) / CELL));
    const blinkOn = Math.floor(S.t * 4) % 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * L.w + x, sx = x * CELL - cam.x, sy = TOP + y * CELL - cam.y;
      const t = L.tiles[i];
      if (t === STONE) { rect(sx, sy, CELL, CELL, 2); if ((x + y) % 2) px(sx + 1, sy + 1, 1); continue; }
      if (t === EXIT) { rect(sx, sy, CELL, CELL, ((x + y) % 2) ^ blinkOn ? 3 : 1); continue; }
      if (!(x % 4) && !(y % 4)) px(sx, sy, 1);
      if (S.cells[i]) {
        const dying = soon && S.diedSet.has(i);
        rect(sx, sy, 3, 3, dying ? 2 : 3);
        if (dying && blinkOn) px(sx + 1, sy + 1, 0);
      } else if (soon && S.bornSet.has(i)) {
        px(sx, sy, 2); px(sx + 2, sy, 2); px(sx, sy + 2, 2); px(sx + 2, sy + 2, 2);
      } else if (S.scars[i]) {
        // A scar where a shot landed: an x, until it heals.
        px(sx, sy, 2); px(sx + 2, sy, 2); px(sx + 1, sy + 1, 2); px(sx, sy + 2, 2); px(sx + 2, sy + 2, 2);
      }
    }
    // Pickups.
    for (const it of S.items) {
      if (it.got) continue;
      const sx = it.x * CELL - cam.x, sy = TOP + it.y * CELL - cam.y + (Math.floor(S.t * 3) % 2 ? -1 : 0);
      if (it.kind === "ammo") { rect(sx - 1, sy, 5, 4, 3); rect(sx, sy + 1, 3, 1, 1); }
      else if (it.kind === "seed") { rect(sx, sy, 2, 2, 3); rect(sx + 2, sy + 2, 2, 2, 3); px(sx + 2, sy, 3); }
      else { rect(sx - 1, sy, 2, 2, 3); rect(sx + 2, sy, 2, 2, 3); rect(sx - 1, sy + 1, 5, 2, 3); px(sx + 1, sy + 3, 3); }
    }
    for (const s of S.shots) rect(Math.round(s.x - cam.x) - 1, Math.round(TOP + s.y - cam.y) - 1, 2, 2, 3);
    for (const f of S.fx) px(Math.round(f.x - cam.x), Math.round(TOP + f.y - cam.y), f.t > 0.15 ? 3 : 2);
    // You: a little marine, five by five, with a nub where you're aiming.
    if (!(P.inv > 0 && !S.dialog && Math.floor(P.inv * 14) % 2)) {
      const cx = Math.round(P.x + BOX / 2 - cam.x), cy = Math.round(TOP + P.y + BOX / 2 - cam.y);
      rect(cx - 2, cy - 2, 5, 5, 3);
      rect(cx - 1, cy - 1, 3, 3, 1);
      px(cx, cy, 0);
      rect(cx + P.face.x * 3, cy + P.face.y * 3, 1, 1, 3);
      if (P.moving && Math.floor(P.step) % 2) px(cx - P.face.y * 2 - P.face.x * 2, cy - P.face.x * 2 - P.face.y * 2, 0);
    }
    if (TOP > 0) rect(0, 0, W, TOP, 3);
  }

  function drawHud() {
    rect(0, 0, W, TOP, 3);
    for (let i = 0; i < Math.max(HEARTS, P.hp); i++) {
      const x = 3 + i * 8, c = i < P.hp ? 0 : 2;
      rect(x, 4, 2, 2, c); rect(x + 3, 4, 2, 2, c); rect(x, 6, 5, 2, c); rect(x + 1, 8, 3, 1, c); px(x + 2, 9, c);
    }
    const hx = 3 + Math.max(HEARTS, P.hp) * 8 + 3;
    rect(hx, 5, 4, 3, 1); text(String(P.ammo), hx + 6, 4, P.ammo ? 0 : 2);
    rect(hx + 22, 4, 2, 2, 1); rect(hx + 24, 6, 2, 2, 1); text(String(P.seeds), hx + 28, 4, P.seeds ? 0 : 2);
    const lv = `L${S.level + 1}`;
    text(lv, W - 50, 4, 1);
    const gen = `G${S.gen}`;
    text(gen, W - 3 - textW(gen), 4, 0);
    // The clock: a bar that fills each tick.
    rect(0, TOP - 2, Math.round(W * (S.tickT / TICK)), 1, 2);
  }

  function drawDialog() {
    const d = S.dialog, lines = d.pages[d.page];
    let left = Math.floor(d.shown);
    const y = H - 8 - lines.length * 7;
    rect(2, y - 4, W - 4, lines.length * 7 + 8, 0);
    rect(3, y - 3, W - 6, lines.length * 7 + 6, 3);
    lines.forEach((l, i) => { text(l.slice(0, Math.max(0, left)), 6, y + i * 7, 0); left -= l.length + 1; });
    if (d.shown >= lines.join(" ").length && Math.floor(S.t * 3) % 2) rect(W - 9, H - 7, 3, 2, 0);
  }

  /** The title: a field of cells boiling behind the name. */
  let titleSim = null;
  function drawTitle() {
    if (!titleSim || titleSim.gens > 200) {
      const w = 40, h = 36, rng = makeRng(Date.now() | 0);
      const cells = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) cells[i] = rng() < 0.28 ? 1 : 0;
      stamp(cells, w, PATTERNS.glider.rows, 2, 2);
      titleSim = { w, h, cells, tiles: new Uint8Array(w * h), t: 0, gens: 0 };
    }
    titleSim.t += 1 / 60;
    if (titleSim.t > 0.2) { titleSim.t = 0; titleSim.gens++; titleSim.cells = step(titleSim.cells, titleSim.tiles, titleSim.w, titleSim.h); }
    rect(0, 0, W, H, 0);
    for (let i = 0; i < titleSim.w * titleSim.h; i++) if (titleSim.cells[i]) rect((i % titleSim.w) * 4, ((i / titleSim.w) | 0) * 4, 3, 3, 1);
    banner(["CONWAY'S"], 20, 1);
    banner(["DOOM"], 36, 3);
    const items = TITLE_ITEMS();
    items.forEach((it, i) => {
      const on = i === S.sel, y = 84 + i * 11;
      rect(22, y - 2, 116, 10, on ? 3 : 0);
      if (!on) rect(23, y - 1, 114, 8, 2);
      ctext(it, y, on ? 0 : 3);
    });
    rect(0, 128, W, 16, 3);
    ctext(best ? `FURTHEST: LEVEL ${best}` : "THE WALLS ARE ALIVE", 132, 1);
  }

  function drawPause() {
    rect(0, 0, W, H, 3);
    ctext("PAUSED", 14, 0, 2);
    ctext(`LEVEL ${S.level + 1}: ${S.L.title}`, 34, 1);
    ctext(`GENERATION ${S.gen}`, 43, 2);
    PAUSE.forEach((it, i) => {
      const on = S.sel === i;
      if (on) rect(30, 60 + i * 12, 100, 10, 0);
      ctext(it, 62 + i * 12, on ? 3 : 1);
    });
    ctext("A: SHOOT  B: SEED  START: PAUSE", 126, 2);
  }

  function drawClear() {
    drawField();
    drawHud();
    const secs = Math.round(S.levelT);
    banner([`LEVEL ${S.level + 1} CLEAR!`, `${secs} SECOND${secs === 1 ? "" : "S"}, ${S.gen} GENERATION${S.gen === 1 ? "" : "S"}`], 46);
    if (S.t > 1.2 && Math.floor(S.t * 2) % 2) ctext("PRESS A", 100, 3);
  }

  function drawOver() {
    rect(0, 0, W, H, 3);
    // The field won: a block, a blinker and a glider where you were.
    for (const [rows, x, y] of [[PATTERNS.block.rows, 40, 40], [Math.floor(S.t * 3) % 2 ? ["OOO"] : ["O", "O", "O"], 76, 40], [PATTERNS.glider.rows, 110 + Math.floor(S.t) % 6, 38 + Math.floor(S.t) % 6]]) {
      rows.forEach((r, dy) => [...r].forEach((c, dx) => { if (c === "O") rect(x + dx * 5, y + dy * 5, 4, 4, 0); }));
    }
    ctext("CONSUMED BY LIFE", 70, 0, 1);
    ctext(`YOU REACHED LEVEL ${S.level + 1}`, 84, 1);
    ctext("CONTINUE FROM THE TITLE", 96, 2);
    if (S.t > 1.5 && Math.floor(S.t * 2) % 2) ctext("PRESS A", 120, 0);
  }

  function draw() {
    if (S.phase === "title") return drawTitle();
    if (S.phase === "guide") return drawGuide();
    if (S.phase === "over") return drawOver();
    if (S.phase === "clear") return drawClear();
    if (S.paused) return drawPause();
    drawField();
    drawHud();
    if (S.toast) banner(S.toast.lines, 50);
    if (S.dialog) drawDialog();
  }

  return {
    update,
    draw,
    suspend() { if (S.phase === "play" && !S.paused && !S.dialog) { S.paused = true; S.sel = 0; S.song = snd.pause(); } },
    dispose() { snd.dispose(); },
  };
}

/** The label on the cartridge: a glider gun, mid-shot. */
export function cover(lcd) {
  const { rect, banner, ctext } = lcd;
  rect(0, 0, W, H, 0);
  const rows = PATTERNS.gun.rows;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "O") rect(8 + x * 4, 10 + y * 4, 3, 3, 3); }));
  for (const [gx, gy] of [[100, 54], [116, 70], [132, 86]]) PATTERNS.glider.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "O") rect(gx + x * 4, gy + y * 4, 3, 3, 2); }));
  banner(["CONWAY'S"], 70, 1);
  banner(["DOOM"], 86, 2);
  ctext("THE WALLS ARE ALIVE", 128, 1);
}
