/**
 * Dark Hat: Sorcerer's Escape. A game by Campbell, cartridge #3 for the Camboy.
 *
 * Overhead rooms inside the Great Malvado's top hat, side-view ladder
 * shafts between its layers. See rules.mjs for the story and the rules.
 */

import {
  W, H, TILE, COLS, ROWS, TOP, SPEED, SOUL_MAX, NAME_LEN, ALPHABET, STORY, LAYERS, BOSSES, ENEMIES, RABBIT, rabbitLanding,
  ATTACKS, DEFENSES, TIERS, attackStats, defenseStats, upgradeNames, nextPick, describePick, applyPick,
  cleanName, say, layoutLayer, neighbor, roomTiles, solidAt, moveBox,
  drainSoul, gainSoul, newRun, validRun, beatBoss, descend, dist, faceFrom, makeRng, roomEnemies,
} from "./rules.mjs";
import { createSound } from "./sound.mjs";

export const meta = {
  id: "dark-hat",
  title: "DARK HAT",
  blurb: "Escape the sorcerer's hat. A game by Campbell.",
};

const RW = COLS * TILE, RH = ROWS * TILE; // the room in pixels: 160 x 128

/* ---------- sprites ---------- */

const KID_DOWN = [
  "..3333..",
  ".333333.",
  ".300003.",
  ".303303.",
  "..3003..",
  ".300003.",
  "30000003",
  ".311113.",
  ".31..13.",
  ".33..33.",
];
const KID_UP = [
  "..3333..",
  ".333333.",
  ".333333.",
  ".333333.",
  "..3333..",
  ".300003.",
  "30000003",
  ".311113.",
  ".31..13.",
  ".33..33.",
];
const KID_SIDE = [
  "..3333..",
  ".33333..",
  ".30003..",
  ".30033..",
  "..3003..",
  ".300003.",
  ".300003.",
  ".311113.",
  "..31.13.",
  "..33.33.",
];
const stepLegs = (rows) => [...rows.slice(0, 8), ".31.13..".slice(0, rows[0].length), "33...33."];

const GLOVE = ["..333..", ".30003.", "3000003", "3000003", "3000033", ".30003.", ".33333."];
const BUNNY = [".3...3.", ".30.03.", ".30003.", "3000003", "3030303", "3000003", ".33333."];
const SOLDIER = ["..333..", ".30003.", ".30303.", "3333333", "3000003", "3030303", "3000003", "3333333", ".3...3.", ".33.33."];
const WISP = ["..111..", ".11111.", "1131311", "1111111", "1111111", "1.1.1.1"];
const SPIRIT = ["..000..", ".00000.", "0030300", "0000000", "0000000", ".0.0.0."];
const RABBIT_ROWS = [
  ".33....33...",
  ".303..303...",
  ".303..303...",
  ".3003.3003..",
  "..30003003..",
  ".300000003..",
  "30030003003.",
  "300000000003",
  "300033300003",
  "300000000003",
  ".3000000003.",
  "..33333333..",
];

const ICONS = {
  cards: [".33333.", ".30003.", ".30303.", ".30003.", ".30303.", ".30003.", ".33333."],
  vanish: ["..3.3..", ".3.3.3.", "3.333.3", ".33333.", "3.333.3", ".3.3.3.", "..3.3.."],
  tornado: [".3333..", "3....3.", "...33.3", "..3..3.", ".3..3..", ".3.3...", "..33333"],
  wand: ["....3.3", ".....3.", "....3.3", "...3...", "..3....", ".3.....", "3......"],
  hat: ["..333..", "..333..", "..333..", "..333..", ".33333.", "3333333", "......."],
  whip: ["3......", ".3...3.", "..3.3.3", "...3..3", "......3", ".....3.", "....3.."],
  decoy: [".3...3.", ".30.03.", ".30003.", "3000003", "3030303", "3000003", ".33333."],
  storm: ["...3...", ".3.3.3.", "..333..", "3333333", "..333..", ".3.3.3.", "...3..."],
};
const ATTACK_ICON = { cards: "cards", wand: "wand", hat: "hat", scarf: "whip" };
const DEFENSE_ICON = { shield: "tornado", blink: "vanish", decoy: "decoy", storm: "storm" };

/* ---------- the cartridge ---------- */

export function boot(hw) {
  const { lcd, input, haptic } = hw;
  const { px, rect, ellipse, line, text, textW, ctext, banner, sprite, arc } = lcd;
  const { held, pressed, stick } = input;
  const snd = createSound(hw);
  const { sfx } = snd;
  snd.play("title");

  let name = cleanName(hw.load("darkhat.name", ""));
  let hasName = !!hw.load("darkhat.name", "");
  let saved = hw.load("darkhat.run", null);
  if (!validRun(saved)) saved = null;
  let wins = hw.load("darkhat.wins", 0);

  let R = null;          // the run
  let layout = null;     // the current layer's rooms
  const S = {
    phase: "title", t: 0, sel: 0, menu: null, paused: false, confirm: null,
    room: null, tiles: null, sealed: false, enemies: [], shots: [], foes: [], pickups: [], fx: [],
    boss: null, spirit: null, ladder: null, fountain: null, decoy: null,
    toast: null, dialog: null, choice: null, shake: 0, beatT: 0, shaft: null, ending: null,
    entry: null, name: null,
  };
  const P = { x: 80, y: 64, face: { x: 0, y: 1 }, cd: { a: 0, b: 0 }, cdMax: { a: 1, b: 1 }, inv: 0, step: 0, moving: false, shield: null, wands: [], wandSt: null, blinks: 0, blinkGap: 0, whipT: 0, frozen: false };

  function toast(lines, dur = 1.4) { S.toast = { lines: [].concat(lines), t: dur }; }
  function setPhase(p) { S.phase = p; S.t = 0; }
  function save() { if (R) hw.save("darkhat.run", R); }

  function menuInput(n) {
    if (pressed.has("up")) { S.sel = (S.sel + n - 1) % n; sfx.blip(); haptic(6); }
    if (pressed.has("down")) { S.sel = (S.sel + 1) % n; sfx.blip(); haptic(6); }
    if (pressed.has("a") || pressed.has("start")) { haptic(12); return S.sel; }
    return -1;
  }

  /* ---------- text boxes ---------- */

  /** Show pages of text, typed out; A moves on. then() runs after the last page. */
  function talk(pages, then, full = false) {
    const lines = [].concat(pages).map((p) => say(p, name, full ? 36 : 37));
    S.dialog = { pages: lines, page: 0, shown: 0, then, full };
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

  function drawDialog() {
    const d = S.dialog;
    const lines = d.pages[d.page];
    let left = Math.floor(d.shown);
    if (d.full) {
      rect(0, 0, W, H, 3);
      drawHatArt(80, 44, 1);
      lines.forEach((l, i) => {
        const shown = l.slice(0, Math.max(0, left));
        left -= l.length + 1;
        ctext(shown, 84 + i * 8, 0);
      });
    } else {
      const y = H - 8 - lines.length * 7;
      rect(2, y - 4, W - 4, lines.length * 7 + 8, 0);
      rect(3, y - 3, W - 6, lines.length * 7 + 6, 3);
      lines.forEach((l, i) => {
        text(l.slice(0, Math.max(0, left)), 6, y + i * 7, 0);
        left -= l.length + 1;
      });
    }
    if (d.shown >= d.pages[d.page].join(" ").length && Math.floor(S.t * 3) % 2) px(W - 8, H - 6, 0), rect(W - 9, H - 7, 3, 2, 0);
  }

  /* ---------- runs and rooms ---------- */

  function startRun() {
    S.endT = null; S.bossIn = null; P.shield = null; P.wands = []; P.blinks = 0; P.cd = { a: 0, b: 0 };
    R = newRun(name);
    save();
    saved = R;
    talk(STORY.intro, () => enterLayer(true), true);
    setPhase("story");
    snd.play("title");
  }

  function continueRun() {
    S.endT = null; S.bossIn = null; P.shield = null; P.wands = []; P.blinks = 0; P.cd = { a: 0, b: 0 };
    R = JSON.parse(JSON.stringify(saved));
    name = R.name;
    layout = layoutLayer(R.layer);
    P.x = RW / 2; P.y = RH / 2;
    enterRoom(R.room, null);
    snd.play("layer");
    toast(LAYERS[R.layer].name, 1.6);
    setPhase("room");
  }

  function enterLayer(first) {
    layout = layoutLayer(R.layer);
    R.room = layout.start;
    P.x = RW / 2; P.y = RH / 2 + 16;
    enterRoom(R.room, null);
    snd.setTempo(1);
    snd.play("layer");
    toast(first ? ["THE VELVET BRIM", "FIND THE WAY DOWN!"] : LAYERS[R.layer].name, 1.8);
    setPhase("room");
    save();
  }

  const key = (layerIx, roomId) => `${layerIx}:${roomId}`;

  function enterRoom(id, from) {
    R.room = id;
    S.room = layout.rooms[id];
    const room = S.room;
    S.enemies = []; S.shots = []; S.foes = []; S.pickups = []; S.fx = [];
    S.boss = null; S.spirit = null; S.ladder = null; S.fountain = null; S.decoys = [];
    P.wands = []; P.whipT = 0; P.frozen = false; // the card shield comes along
    S.sealed = false;
    // Arriving through a door: stand just inside the matching door.
    if (from === "left") { P.x = RW - 12; P.y = 64; }
    if (from === "right") { P.x = 12; P.y = 64; }
    if (from === "up") { P.x = 80; P.y = RH - 12; }
    if (from === "down") { P.x = 80; P.y = 14; }
    P.inv = Math.max(P.inv, 0.6);
    const done = R.cleared.includes(key(R.layer, id));
    S.bossIn = null;
    if (room.kind === "boss" && !R.beaten[R.layer]) S.sealed = true;
    S.tiles = roomTiles(room, S.sealed);
    if (room.kind === "enemy" && !done) spawnRoom();
    if (room.kind === "spirit" && !R.freed.includes(key(R.layer, id))) S.spirit = { x: 80, y: 60, t: 0 };
    if (room.kind === "fountain") S.fountain = { x: 80, y: 64, used: R.fountains.includes(key(R.layer, id)) };
    if (room.kind === "boss") {
      if (R.beaten[R.layer]) { if (R.layer < LAYERS.length - 1) S.ladder = { x: 80, y: 64 }; }
      else { S.bossIn = 1.0; sfx.door(); toast(STORY.bossDoor, 1.0); }
    }
    save();
  }

  function spawnRoom() {
    const kinds = roomEnemies(R, R.layer, S.room.id);
    const rng = makeRng((R.seed ^ (S.room.id * 7919 + R.layer)) >>> 0);
    for (const kind of kinds) {
      for (let tries = 0; tries < 60; tries++) {
        const x = 16 + rng() * (RW - 32), y = 16 + rng() * (RH - 32);
        if (!solidAt(S.tiles, x - 3, y - 3) && !solidAt(S.tiles, x + 3, y + 3) && dist(x, y, P.x, P.y) > 44) { addEnemy(kind, x, y); break; }
      }
    }
  }

  function addEnemy(kind, x, y) {
    const e = { kind, x, y, hp: ENEMIES[kind].hp, vx: 0, vy: 0, t: Math.random() * 2, cd: 1 + Math.random() * 1.5, flash: 0, state: "move", stun: 0, hitBy: new Map() };
    S.enemies.push(e);
    return e;
  }

  function roomCleared() {
    const k = key(R.layer, S.room.id);
    if (!R.cleared.includes(k)) { R.cleared.push(k); sfx.door(); save(); }
  }

  /* ---------- hurting and helping ---------- */

  function hurtPlayer(n, fromX, fromY) {
    if (P.inv > 0 || S.phase !== "room") return;
    R.hp = Math.max(0, R.hp - n);
    P.inv = 1.0;
    const d = Math.max(1, dist(P.x, P.y, fromX, fromY));
    const push = moveBox(S.tiles, { x: P.x - 3, y: P.y - 3, w: 6, h: 6 }, ((P.x - fromX) / d) * 8, ((P.y - fromY) / d) * 8);
    P.x = push.x + 3; P.y = push.y + 3;
    sfx.hurt();
    haptic(30);
    S.shake = 0.2;
    if (R.hp <= 0) caught();
  }

  function caught() {
    hw.save("darkhat.run", null);
    saved = null;
    snd.play("caught");
    setPhase("caught");
  }

  function hurtEnemy(e, dmg, fx, fy) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.15;
    const d = Math.max(1, dist(e.x, e.y, fx, fy));
    e.x += ((e.x - fx) / d) * 3; e.y += ((e.y - fy) / d) * 3;
    if (e.hp <= 0) {
      e.dead = true;
      sfx.pop();
      puff(e.x, e.y, 6);
      if (Math.random() < 0.6) S.pickups.push({ kind: "sparkle", x: e.x, y: e.y, t: 0 });
      else if (Math.random() < 0.12) S.pickups.push({ kind: "heart", x: e.x, y: e.y, t: 0 });
    } else sfx.hit();
  }

  /** Trick damage lands on enemies within r of (x, y); each enemy at most once per `gap` seconds from this source. */
  function zap(x, y, r, dmg, src, gap = 0.35) {
    let any = false;
    for (const e of S.enemies) {
      if (e.dead || dist(x, y, e.x, e.y) > r + 4) continue;
      const last = e.hitBy.get(src) ?? -9;
      if (S.t - last < gap) continue;
      e.hitBy.set(src, S.t);
      hurtEnemy(e, dmg, x, y);
      any = true;
    }
    const b = S.boss;
    if (b && b.hp > 0 && bossHittable() && dist(x, y, b.x, b.y) < r + b.r) {
      const last = b.hitBy.get(src) ?? -9;
      if (S.t - last >= gap) { b.hitBy.set(src, S.t); hurtBoss(dmg, x, y); any = true; }
    }
    return any;
  }

  function puff(x, y, n = 5) {
    for (let i = 0; i < n; i++) S.fx.push({ kind: "dot", x, y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, t: 0.4 });
  }
  function word(x, y, w) { S.fx.push({ kind: "word", x, y, vy: -14, t: 0.9, w }); }

  /* ---------- tricks: attack on A, defense on B ---------- */

  function setCd(slot, sec) { P.cd[slot] = sec; P.cdMax[slot] = Math.max(0.01, sec); }

  function cardShot(x, y, a, speed, dmg, pierce, life = 1.1, extra = {}) {
    S.shots.push({ kind: "card", x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, dmg, pierce, src: {}, ...extra });
  }

  /** Move in the facing direction up to `far` pixels, stopping at walls. Calls step() at each point. */
  function dash(far, step) {
    const f = P.face;
    for (let i = 0; i < far; i += 2) {
      const nx = P.x + f.x * 2, ny = P.y + f.y * 2;
      if (solidAt(S.tiles, nx - 3, ny - 3) || solidAt(S.tiles, nx + 2, ny - 3) || solidAt(S.tiles, nx - 3, ny + 2) || solidAt(S.tiles, nx + 2, ny + 2)) break;
      if (nx < 4 || ny < 4 || nx > RW - 4 || ny > RH - 4) break;
      P.x = nx; P.y = ny;
      step?.();
    }
  }

  function useAttack() {
    if (P.cd.a > 0) return;
    const st = attackStats(R);
    const f = P.face;
    const fa = Math.atan2(f.y, f.x);
    setCd("a", st.cd);
    switch (R.attack.id) {
      case "cards": {
        for (let i = 0; i < st.count; i++) {
          const off = st.count === 1 ? 0 : (i - (st.count - 1) / 2) * st.spread;
          cardShot(P.x, P.y - 2, fa + off, st.speed, st.dmg, st.pierce);
        }
        if (st.burst) for (let i = 0; i < 8; i++) cardShot(P.x, P.y - 2, (i / 8) * Math.PI * 2, 120, st.dmg, false, 0.45);
        sfx.card();
        break;
      }
      case "wand": {
        P.wandSt = st;
        P.wands = [];
        for (let i = 0; i < st.wands; i++) {
          const a = fa + (st.wands > 1 ? (i - (st.wands - 1) / 2) * 0.6 : 0);
          P.wands.push({ x: P.x, y: P.y - 4, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, life: st.steer ? 2.2 : 2.6, hits: st.hits, back: false, src: {} });
        }
        sfx.whistle();
        break;
      }
      case "hat":
        for (let i = 0; i < st.hats; i++) {
          const a = fa + (st.hats > 1 ? (i - (st.hats - 1) / 2) * 0.7 : 0);
          S.shots.push({ kind: "hat", x: P.x, y: P.y - 2, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, out: st.out, life: 3, dmg: st.dmg, r: st.size, grow: st.grow, magnet: st.magnet, src: {} });
        }
        sfx.hat();
        break;
      case "scarf": {
        P.whipT = 0.18; P.whipSpin = st.spin; P.whipReach = st.reach;
        const src = {};
        let hit = null;
        const lash = (dx, dy) => {
          for (let d = 6; d <= st.reach; d += 4) {
            const x = P.x + dx * d, y = P.y - 2 + dy * d;
            for (const e of S.enemies) if (!e.dead && dist(x, y, e.x, e.y) < 7) hit = hit || e;
            zap(x, y, 4, st.dmg, src, 0.3);
          }
        };
        if (st.spin) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lash(Math.cos(a), Math.sin(a)); }
        else lash(f.x, f.y);
        const tx = P.x + f.x * st.reach, ty = P.y - 2 + f.y * st.reach;
        if (st.grab) {
          if (hit && !hit.dead) { hit.x = P.x + f.x * 10; hit.y = P.y + f.y * 10; hit.stun = 1.0; word(hit.x, hit.y - 8, "GOTCHA!"); }
          // The scarf pulls pickups in as well.
          for (const p of S.pickups) if (dist(p.x, p.y, tx, ty) < 16) { p.x = P.x; p.y = P.y; }
        }
        for (let i = 0; i < st.doves; i++) S.shots.push({ kind: "dove", x: tx, y: ty, vx: f.x * 60 + (i - (st.doves - 1) / 2) * 30, vy: f.y * 60 + (i - (st.doves - 1) / 2) * 30, life: 1.3, dmg: 1, src: {} });
        if (st.doves) sfx.doves();
        if (st.tip) S.shots.push({ kind: "bolt", x: tx, y: ty, vx: f.x * 160, vy: f.y * 160, life: 0.8, dmg: st.dmg, pierce: false, src: {} });
        sfx.whip();
        break;
      }
    }
  }

  function useDefense() {
    if (!R.defense || P.cd.b > 0) return;
    const st = defenseStats(R);
    switch (R.defense.id) {
      case "shield":
        // The cards stay up until each one is used; the wait starts after the last.
        if (P.shield) return;
        P.shield = { cards: Array(st.cards).fill(st.tough), a: 0, srcs: Array.from({ length: st.cards }, () => ({})) };
        sfx.tornado();
        break;
      case "blink": {
        if (P.blinkGap > 0) return;
        const ox = P.x, oy = P.y;
        puff(ox, oy, 8);
        const src = {};
        dash(st.far, () => { if (st.trail) zap(P.x, P.y, 6, 2, src, 9); });
        puff(P.x, P.y, 8);
        if (st.smoke) for (const e of S.enemies) if (dist(e.x, e.y, ox, oy) < 26 || dist(e.x, e.y, P.x, P.y) < 26) { e.stun = 1.4; puff(e.x, e.y, 2); }
        P.inv = Math.max(P.inv, st.safe);
        P.blinkGap = 0.18;
        P.blinks = Math.max(0, (P.blinks ?? st.charges) - 1);
        if (P.blinks <= 0) setCd("b", st.cd);
        sfx.blink();
        haptic(10);
        break;
      }
      case "decoy": {
        const ox = P.x, oy = P.y;
        puff(ox, oy, 6);
        dash(st.hop);
        puff(P.x, P.y, 6);
        P.inv = Math.max(P.inv, 0.3);
        for (let i = 0; i < st.bunnies; i++) S.decoys.push({ x: ox + (st.bunnies > 1 ? (i - 0.5) * 16 : 0), y: oy, t: st.time, boom: st.boom, sparkle: st.sparkle });
        setCd("b", st.cd);
        sfx.decoy();
        break;
      }
      case "storm":
        for (let i = 0; i < st.cards; i++) cardShot(P.x, P.y - 2, (i / st.cards) * Math.PI * 2, 120, st.dmg, true, st.life, { spin: st.spin, drink: st.drink });
        if (st.push) for (const e of S.enemies) {
          const d = dist(e.x, e.y, P.x, P.y);
          if (d < 34 && d > 0.5) { const m = moveBox(S.tiles, { x: e.x - 3, y: e.y - 3, w: 6, h: 6 }, ((e.x - P.x) / d) * st.push, ((e.y - P.y) / d) * st.push); e.x = m.x + 3; e.y = m.y + 3; e.stun = Math.max(e.stun, 0.3); }
        }
        setCd("b", st.cd);
        sfx.storm();
        haptic(12);
        break;
    }
  }

  function nearestEnemy(x, y, except) {
    let best = null, bd = 1e9;
    for (const e of S.enemies) {
      if (e.dead || e === except) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (S.boss && S.boss.hp > 0 && bossHittable()) {
      const d = dist(x, y, S.boss.x, S.boss.y);
      if (d < bd) best = S.boss;
    }
    return best;
  }

  function updateTricks(dt) {
    P.cd.a = Math.max(0, P.cd.a - dt);
    P.cd.b = Math.max(0, P.cd.b - dt);
    P.whipT = Math.max(0, P.whipT - dt);
    P.blinkGap = Math.max(0, (P.blinkGap || 0) - dt);
    const dst = defenseStats(R);
    if (R.defense?.id === "blink" && P.cd.b <= 0 && (P.blinks ?? 0) < dst.charges) P.blinks = dst.charges;

    if (P.shield && dst) {
      const sh = P.shield;
      sh.a += dt * 7;
      const n = sh.cards.length;
      sh.cards.forEach((left, i) => {
        if (left <= 0) return;
        const a = sh.a + (i * Math.PI * 2) / n;
        const x = P.x + Math.cos(a) * dst.radius, y = P.y - 2 + Math.sin(a) * dst.radius;
        // Each card wears out on what it blocks or hits.
        let used = false;
        for (const e of S.enemies) if (!used && e.kind === "spark" && !e.dead && dist(x, y, e.x, e.y) < 6) {
          e.dead = true; used = true; puff(e.x, e.y, 3); R.soul = gainSoul(R.soul, "block");
        }
        for (const f of S.foes) if (!used && !f.dead && dist(x, y, f.x, f.y) < 6) {
          f.dead = true; used = true; R.soul = gainSoul(R.soul, "block");
          if (dst.reflect) cardShot(x, y, a, 150, dst.dmg + 1, false, 0.9);
        }
        if (!used && zap(x, y, 4, dst.dmg, sh.srcs[i], 0.4)) used = true;
        if (used) { sh.cards[i]--; sfx.block(); puff(x, y, 3); haptic(6); }
      });
      if (!sh.cards.some((c) => c > 0)) { P.shield = null; setCd("b", dst.cd); }
    }

    // Rabbit decoys wait, then go (sometimes with a bang).
    for (const d of S.decoys) {
      d.t -= dt;
      if (d.t > 0) continue;
      d.dead = true;
      puff(d.x, d.y, 6);
      if (d.boom) { zap(d.x, d.y, 20, 3, {}, 9); sfx.pop(); S.shake = Math.max(S.shake, 0.2); for (let k = 0; k < 8; k++) S.fx.push({ kind: "dot", x: d.x, y: d.y, vx: Math.cos(k) * 60, vy: Math.sin(k) * 60, t: 0.3 }); }
      if (d.sparkle) S.pickups.push({ kind: "sparkle", x: d.x, y: d.y, t: 0 });
    }
    S.decoys = S.decoys.filter((d) => !d.dead);

    const st = P.wandSt;
    P.frozen = !!(st && st.steer && held.a && P.wands.some((w) => !w.back));
    for (const w of P.wands) {
      w.life -= dt;
      if (w.back || w.life <= 0 || w.hits <= 0 || (st.steer && !held.a)) {
        w.back = true;
        const d = dist(w.x, w.y, P.x, P.y - 4);
        if (d < 6) w.done = true;
        else { w.vx = ((P.x - w.x) / d) * 170; w.vy = ((P.y - 4 - w.y) / d) * 170; }
      } else if (st.steer) {
        if (Math.abs(stick.x) + Math.abs(stick.y) > 0.3) {
          // Steer toward where the stick points, with a little swing.
          w.vx += (stick.x * st.speed - w.vx) * Math.min(1, dt * 8);
          w.vy += (stick.y * st.speed - w.vy) * Math.min(1, dt * 8);
        }
      } else {
        const t = nearestEnemy(w.x, w.y);
        if (t) {
          const d = Math.max(1, dist(w.x, w.y, t.x, t.y));
          w.vx += (((t.x - w.x) / d) * st.speed - w.vx) * Math.min(1, dt * 5);
          w.vy += (((t.y - w.y) / d) * st.speed - w.vy) * Math.min(1, dt * 5);
        }
      }
      w.x += w.vx * dt; w.y += w.vy * dt;
      w.x = Math.max(2, Math.min(RW - 2, w.x)); w.y = Math.max(2, Math.min(RH - 2, w.y));
      if (!w.back && zap(w.x, w.y, st.size, st.dmg, w.src, 0.35)) {
        w.hits--;
        sfx.wand();
        if (st.stars) for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; S.shots.push({ kind: "star", x: w.x, y: w.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.35, dmg: 1, pierce: false, src: {} }); }
      }
    }
    P.wands = P.wands.filter((w) => !w.done);
  }

  /* ---------- the hero ---------- */

  function updatePlayer(dt) {
    P.inv = Math.max(0, P.inv - dt);
    P.face = faceFrom(stick.x, stick.y, P.face);
    P.moving = false;
    if (!P.frozen && (stick.x || stick.y)) {
      const b = moveBox(S.tiles, { x: P.x - 3, y: P.y - 3, w: 6, h: 6 }, stick.x * SPEED * dt, stick.y * SPEED * dt);
      P.x = b.x + 3; P.y = b.y + 3;
      P.moving = true;
      P.step += dt * 8;
    }
    // Malvado's hat pulls you toward it.
    const b = S.boss;
    if (b && b.vortex) {
      const d = Math.max(1, dist(P.x, P.y, 80, 64));
      const pull = 24 * dt;
      const m = moveBox(S.tiles, { x: P.x - 3, y: P.y - 3, w: 6, h: 6 }, ((80 - P.x) / d) * pull, ((64 - P.y) / d) * pull);
      P.x = m.x + 3; P.y = m.y + 3;
      if (d < 10) { hurtPlayer(1, 80, 64); }
    }

    // Talking to spirits takes A while you're next to one.
    const nearSpirit = S.spirit && dist(P.x, P.y, S.spirit.x, S.spirit.y) < 16;
    if (nearSpirit && pressed.has("a")) { meetSpirit(); return; }
    if (pressed.has("a") || (held.a && (R.attack.id === "cards" || R.attack.id === "scarf"))) useAttack();
    if (pressed.has("b")) useDefense();

    // Pickups.
    for (const p of S.pickups) {
      p.t += dt;
      if (p.dead || dist(p.x, p.y, P.x, P.y) > 8) continue;
      p.dead = true;
      if (p.kind === "sparkle") { R.soul = gainSoul(R.soul, "sparkle"); sfx.sparkle(); }
      else { R.hp = Math.min(R.maxHp, R.hp + 2); sfx.heart(); haptic(10); }
    }
    S.pickups = S.pickups.filter((p) => !p.dead);

    // The fountain fills your soul once.
    const ft = S.fountain;
    if (ft && !ft.used && dist(P.x, P.y, ft.x, ft.y) < 14) {
      ft.used = true;
      R.fountains.push(key(R.layer, S.room.id));
      R.soul = SOUL_MAX;
      sfx.fountain();
      haptic(15);
      talk(STORY.fountain);
      save();
    }

    // Down the ladder.
    if (S.ladder && dist(P.x, P.y, S.ladder.x, S.ladder.y) < 7) startShaft();

    // Through a door into the next room.
    if (!S.sealed) {
      let dir = null;
      if (P.x < 2) dir = "left";
      else if (P.x > RW - 2) dir = "right";
      else if (P.y < 2) dir = "up";
      else if (P.y > RH - 2) dir = "down";
      if (dir) {
        const next = neighbor(layout, S.room.id, dir);
        if (next != null) enterRoom(next, dir);
        else { P.x = Math.max(4, Math.min(RW - 4, P.x)); P.y = Math.max(4, Math.min(RH - 4, P.y)); }
      }
    }
  }

  /* ---------- spirits and upgrades ---------- */

  /** Open the choice screen for whatever a spirit or boss offers now. after() runs once it's settled. */
  function openPick(source, after) {
    const pick = nextPick(R, source);
    S.choice = { pick, opts: describePick(R, pick), sel: 0, source, after };
  }

  function meetSpirit() {
    const pick = nextPick(R, "spirit");
    const line = { attack: STORY.spiritAttack, defense: STORY.spiritDefense, upgrade: STORY.spiritUpgrade, bonus: STORY.spiritBonus }[pick.type];
    sfx.spirit();
    talk([STORY.spiritIntro, line], () => openPick("spirit", null));
  }

  function updateChoice() {
    const c = S.choice;
    const n = c.opts.length;
    if (pressed.has("up")) { c.sel = (c.sel + n - 1) % n; sfx.blip(); haptic(6); }
    if (pressed.has("down")) { c.sel = (c.sel + 1) % n; sfx.blip(); haptic(6); }
    if (!(pressed.has("a") || pressed.has("start"))) return;
    const { pick } = c;
    const id = pick.options[c.sel];
    const took = applyPick(R, pick, c.sel);
    if (!took) return;
    sfx.choose();
    haptic(25);
    S.choice = null;
    if (c.source === "spirit" && S.spirit) {
      R.freed.push(key(R.layer, S.room.id));
      R.soul = gainSoul(R.soul, "spirit");
      puff(S.spirit.x, S.spirit.y, 12);
      S.spirit = null;
    }
    save();
    let msg;
    if (pick.type === "attack") msg = took === "extra" ? `${name} KEPT THE CARD TOSS! THAT EARNS A FREE UPGRADE...` : `${name} LEARNED THE ${ATTACKS[id].name}! IT'S ON THE A BUTTON.`;
    else if (pick.type === "defense") msg = `${name} LEARNED THE ${DEFENSES[id].name}! IT'S ON THE B BUTTON.`;
    else if (pick.type === "bonus") msg = id === "heart" ? `${name}'S HEART GREW BIGGER!` : `${name}'S SOUL WILL LAST LONGER NOW.`;
    else {
      const cat = pick.tree === "attack" ? ATTACKS : DEFENSES;
      msg = `${name}'S ${cat[R[pick.tree].id].name} GOT ${c.opts[c.sel].name}!`;
    }
    if (took === "extra") talk([msg], () => openPick("boss", c.after));
    else talk([msg], c.after);
  }

  function drawChoice() {
    const c = S.choice;
    const { pick, opts } = c;
    rect(0, 0, W, H, 3);
    const title = {
      attack: "PICK YOUR ATTACK (A)",
      defense: "PICK YOUR DEFENSE (B)",
      bonus: "YOU'RE MAXED OUT! A BONUS",
    }[pick.type] || `UPGRADE YOUR ${(pick.tree === "attack" ? ATTACKS : DEFENSES)[R[pick.tree].id].name}`;
    const sub = pick.type === "upgrade" ? `TIER ${R[pick.tree].ups.length + 1} OF ${TIERS}: CHOOSE ONE` : "IT'S YOURS FOR THE WHOLE RUN";
    if (opts.length > 2) {
      ctext(title, 6, 0);
      ctext(sub, 15, 1);
      opts.forEach((o, i) => {
        const y = 25 + i * 27;
        const on = i === c.sel;
        rect(3, y, W - 6, 25, on ? 0 : 2);
        rect(4, y + 1, W - 8, 23, 3);
        ctext((on ? "> " : "") + o.name + (on ? " <" : ""), y + 3, on ? 0 : 1);
        say(o.desc, name, 37).slice(0, 2).forEach((l, k) => ctext(l, y + 10 + k * 7, on ? 1 : 2));
      });
    } else {
      sprite(SPIRIT, 80, 20, false, null, 2);
      ctext(title, 25, 0);
      ctext(sub, 34, 1);
      opts.forEach((o, i) => {
        const y = 44 + i * 45;
        const on = i === c.sel;
        rect(4, y, W - 8, 42, on ? 0 : 2);
        rect(5, y + 1, W - 10, 40, 3);
        ctext((on ? "> " : "") + o.name + (on ? " <" : ""), y + 4, on ? 0 : 1);
        say(o.desc, name, 36).slice(0, 3).forEach((l, k) => ctext(l, y + 14 + k * 7, on ? 1 : 2));
      });
    }
    ctext("A: CHOOSE  (NO GOING BACK!)", 138, 1);
  }

  /* ---------- enemies ---------- */

  /** Who an enemy is after: the nearest rabbit decoy, if there is one, otherwise you. */
  function target(e) {
    let best = P, bd = Infinity;
    for (const d of S.decoys) { const k = dist(e.x, e.y, d.x, d.y); if (k < bd) { bd = k; best = d; } }
    return best;
  }

  function updateEnemies(dt) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      const tg = target(e);
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.stun > 0) { e.stun -= dt; continue; }
      const dx = tg.x - e.x, dy = tg.y - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const sp = ENEMIES[e.kind].speed;
      e.cd -= dt;
      const walk = (vx, vy) => {
        const m = moveBox(S.tiles, { x: e.x - 3, y: e.y - 3, w: 6, h: 6 }, vx * dt, vy * dt);
        e.x = m.x + 3; e.y = m.y + 3;
      };
      if (e.kind === "spark") {
        // Dark magic drifts at you, wobbling, right through the furniture.
        e.x += ((dx / d) * sp + Math.sin(e.t * 6) * 14) * dt;
        e.y += ((dy / d) * sp + Math.cos(e.t * 5) * 14) * dt;
        e.x = Math.max(4, Math.min(RW - 4, e.x)); e.y = Math.max(4, Math.min(RH - 4, e.y));
      } else if (e.kind === "glove") {
        if (e.state === "dash") {
          walk(e.vx, e.vy);
          if ((e.dashT -= dt) <= 0) { e.state = "move"; e.cd = 1.6; }
        } else if (e.state === "wind") {
          if ((e.windT -= dt) <= 0) { e.state = "dash"; e.dashT = 0.3; e.vx = (dx / d) * 130; e.vy = (dy / d) * 130; }
        } else {
          if (d > 26) walk((dx / d) * sp, (dy / d) * sp);
          if (e.cd <= 0 && d < 50) { e.state = "wind"; e.windT = 0.5; }
        }
      } else if (e.kind === "bunny") {
        if (e.cd <= 0) { e.cd = 0.9 + Math.random() * 0.4; e.hop = 0.28; e.vx = (dx / d) * 80; e.vy = (dy / d) * 80; }
        if (e.hop > 0) { e.hop -= dt; walk(e.vx, e.vy); }
      } else if (e.kind === "soldier") {
        if (d > 40) walk((dx / d) * sp, (dy / d) * sp);
        if (e.cd <= 0) { e.cd = 2.2; S.foes.push({ kind: "ecard", x: e.x, y: e.y, vx: (dx / d) * 70, vy: (dy / d) * 70, life: 2.2 }); sfx.card(); }
      } else if (e.kind === "wisp") {
        e.x += Math.sin(e.t * 0.8) * 8 * dt; e.y += Math.cos(e.t * 0.6) * 6 * dt;
        if (e.cd <= 0) {
          e.cd = 3.2;
          for (let i = 0; i < 2; i++) addEnemy("spark", e.x + (i ? 6 : -6), e.y);
          sfx.spark();
        }
      }
      // Touching anyone hurts (except a dizzy one).
      if (dist(e.x, e.y, P.x, P.y - 2) < 7) {
        hurtPlayer(ENEMIES[e.kind].touch, e.x, e.y);
        if (e.kind === "spark") { e.dead = true; puff(e.x, e.y, 3); }
      }
      for (const d of S.decoys) if (dist(e.x, e.y, d.x, d.y) < 6) { d.t = Math.min(d.t, 0.3); if (e.kind === "spark") e.dead = true; }
    }
    S.enemies = S.enemies.filter((e) => !e.dead);
    if (S.room.kind === "enemy" && !S.enemies.length && !R.cleared.includes(key(R.layer, S.room.id))) roomCleared();
  }

  function updateShots(dt) {
    for (const s of S.shots) {
      s.life -= dt;
      if (s.kind === "hat") {
        s.out -= dt;
        if (s.out <= 0) {
          const d = Math.max(1, dist(s.x, s.y, P.x, P.y - 2));
          s.vx = ((P.x - s.x) / d) * 175; s.vy = ((P.y - 2 - s.y) / d) * 175;
          if (d < 6) s.life = 0;
          if (!s.returning) { s.returning = true; s.src = {}; }
        }
        if (zap(s.x, s.y, s.r, s.dmg, s.src, 0.5) && s.grow) { s.r = Math.min(12, s.r + 1.5); s.dmg = Math.min(5, s.dmg + 1); }
        if (s.magnet) for (const p of S.pickups) if (dist(p.x, p.y, s.x, s.y) < 12) { p.x = s.x; p.y = s.y; }
      } else if (s.kind === "dove") {
        const t = nearestEnemy(s.x, s.y);
        if (t) {
          const d = Math.max(1, dist(s.x, s.y, t.x, t.y));
          s.vx += (((t.x - s.x) / d) * 110 - s.vx) * Math.min(1, dt * 4);
          s.vy += (((t.y - s.y) / d) * 110 - s.vy) * Math.min(1, dt * 4);
        }
        if (zap(s.x, s.y, 3, s.dmg, s.src, 9)) s.life = 0;
      } else {
        if (s.spin) { const a = Math.atan2(s.vy, s.vx) + dt * 3, sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; }
        if (s.drink) for (const e of S.enemies) if (e.kind === "spark" && !e.dead && dist(s.x, s.y, e.x, e.y) < 6) R.soul = gainSoul(R.soul, "block");
        if (zap(s.x, s.y, 3, s.dmg, s.src, 9) && !s.pierce) s.life = 0;
        if (solidAt(S.tiles, s.x, s.y) && (s.kind === "card" || s.kind === "bolt")) { s.life = 0; puff(s.x, s.y, 2); }
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < -4 || s.y < -4 || s.x > RW + 4 || s.y > RH + 4) s.life = 0;
    }
    S.shots = S.shots.filter((s) => s.life > 0);

    for (const f of S.foes) {
      f.life -= dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.kind === "ecard" && solidAt(S.tiles, f.x, f.y)) f.life = 0;
      if (dist(f.x, f.y, P.x, P.y - 2) < 5) { f.life = 0; hurtPlayer(1, f.x, f.y); }
      for (const d of S.decoys) if (dist(f.x, f.y, d.x, d.y) < 5) f.life = 0;
      if (f.x < -6 || f.y < -6 || f.x > RW + 6 || f.y > RH + 6) f.life = 0;
    }
    S.foes = S.foes.filter((f) => f.life > 0 && !f.dead);
  }

  /* ---------- bosses ---------- */

  function startBoss() {
    const kind = LAYERS[R.layer].boss;
    S.boss = { kind, name: BOSSES[kind].name, hp: BOSSES[kind].hp, max: BOSSES[kind].hp, x: 80, y: 40, r: 10, t: 0, state: "idle", stT: 0, flash: 0, hitBy: new Map(), lands: 0, phase: 1 };
    if (kind === "king") { S.boss.r = 8; S.boss.state = "show"; S.boss.stT = 3; }
    if (kind === "malvado") { S.boss.r = 8; S.boss.y = 30; snd.play("malvado"); sfx.laugh(); }
    else { snd.play("boss"); sfx.roar(); }
    toast([S.boss.name], 1.6);
    haptic(30);
  }

  function bossHittable() {
    const b = S.boss;
    if (!b) return false;
    if (b.kind === "rabbit") return b.state !== "air";
    if (b.kind === "king") return b.state === "show";
    if (b.kind === "malvado") return b.state !== "gone";
    return true;
  }

  function hurtBoss(dmg, fx, fy) {
    const b = S.boss;
    b.hp -= dmg;
    b.flash = 0.2;
    sfx.hit();
    haptic(8);
    if (b.hp <= 0) {
      b.hp = 0;
      sfx.bossDown();
      haptic(50);
      S.shake = 0.6;
      for (let i = 0; i < 4; i++) puff(b.x + (i - 1.5) * 6, b.y, 8);
      S.enemies.forEach((e) => { e.dead = true; puff(e.x, e.y, 3); });
      S.foes = [];
      b.vortex = false;
      const last = beatBoss(R);
      S.sealed = false;
      S.tiles = roomTiles(S.room, false);
      save();
      if (last) { S.endT = 2.2; }
      else {
        S.ladder = { x: 80, y: 64 };
        snd.play("layer");
        talk([`${name} BEAT ${b.name}! ${name}'S HEART GREW STRONGER.`, STORY.bossGift], () => openPick("boss", () => talk([STORY.ladder])));
      }
      S.boss = null;
    }
  }

  function bolt(x, y, speed = 75, spread = 0) {
    const a = Math.atan2(P.y - 2 - y, P.x - x) + spread;
    S.foes.push({ kind: "bolt", x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.4 });
  }

  function updateBoss(dt) {
    const b = S.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.stT -= dt;
    if (b.kind === "rabbit") {
      const fast = b.hp < b.max / 2;
      if (b.state === "idle" && b.stT <= 0) { b.state = "crouch"; b.stT = 0.45; }
      else if (b.state === "crouch" && b.stT <= 0) {
        b.state = "air"; b.stT = fast ? RABBIT.airFast : RABBIT.air; b.air = b.stT;
        b.from = { x: b.x, y: b.y };
        const land = rabbitLanding(b.from, P);
        b.to = { x: Math.max(20, Math.min(RW - 20, land.x)), y: Math.max(24, Math.min(RH - 16, land.y)) };
      } else if (b.state === "air") {
        const k = 1 - Math.max(0, b.stT) / b.air;
        b.x = b.from.x + (b.to.x - b.from.x) * k; b.y = b.from.y + (b.to.y - b.from.y) * k;
        b.lift = Math.sin(k * Math.PI) * 30;
        if (b.stT <= 0) {
          b.state = "idle"; b.stT = fast ? 0.5 : 0.8; b.lift = 0;
          b.ring = { x: b.x, y: b.y, r: 4, t: 0 };
          sfx.thump(); S.shake = 0.3; haptic(20);
          if (++b.lands % 3 === 0) { addEnemy("bunny", b.x - 14, b.y); addEnemy("bunny", b.x + 14, b.y); }
        }
      }
      if (b.ring) {
        b.ring.t += dt; b.ring.r = 4 + b.ring.t * RABBIT.ringSpeed;
        const d = dist(P.x, P.y, b.ring.x, b.ring.y);
        if (Math.abs(d - b.ring.r) < 4 && !b.ring.hit) { b.ring.hit = true; hurtPlayer(1, b.ring.x, b.ring.y); }
        if (b.ring.r > RABBIT.ring) b.ring = null;
      }
      if (b.state !== "air" && dist(b.x, b.y, P.x, P.y) < 12) hurtPlayer(1, b.x, b.y);
    } else if (b.kind === "king") {
      const many = b.hp < b.max / 2;
      const spots = [[40, 36], [120, 36], [40, 96], [120, 96], [80, 64]];
      if (b.state === "show") {
        b.fanT = (b.fanT ?? 0.6) - dt;
        if (b.fanT <= 0) { b.fanT = many ? 0.9 : 1.3; for (let i = -2; i <= 2; i++) bolt(b.x, b.y, 70, i * 0.22); S.foes.slice(-5).forEach((f) => (f.kind = "ecard")); sfx.card(); }
        if (b.stT <= 0) {
          b.state = "shuffle"; b.stT = 2; sfx.shuffle();
          b.cards = Array.from({ length: many ? 4 : 3 }, (_, i) => ({ x: b.x, y: b.y, real: i === 0, a: i * 2 }));
        }
      } else if (b.state === "shuffle") {
        b.cards.forEach((c, i) => { c.a += dt * 3; c.x = 80 + Math.cos(c.a + i * 1.7) * 50; c.y = 64 + Math.sin(c.a * 1.3 + i) * 34; });
        if (b.stT <= 0) {
          b.state = "deal"; b.stT = 3.5;
          const order = spots.slice().sort(() => Math.random() - 0.5);
          b.cards.forEach((c, i) => { c.x = order[i][0]; c.y = order[i][1]; });
          sfx.shuffle();
        }
      } else if (b.state === "deal") {
        // Hit the right card to find him; a joker bursts into sparks.
        for (const c of b.cards) {
          if (c.gone) continue;
          const hit = S.shots.some((s) => dist(s.x, s.y, c.x, c.y) < 8) || P.wands.some((w) => dist(w.x, w.y, c.x, c.y) < 8) || (P.whipT > 0.12 && dist(P.x + P.face.x * 18, P.y + P.face.y * 18, c.x, c.y) < 10);
          if (!hit) continue;
          if (c.real) { b.x = c.x; b.y = c.y; b.state = "show"; b.stT = 3.5; word(c.x, c.y - 14, "FOUND HIM!"); sfx.pop(); break; }
          c.gone = true; word(c.x, c.y - 12, "JOKER!"); sfx.pop(); puff(c.x, c.y, 6);
          for (let i = 0; i < 3; i++) addEnemy("spark", c.x + (i - 1) * 6, c.y);
        }
        if (b.state === "deal" && b.stT <= 0) { const c = b.cards.find((k) => k.real); b.x = c.x; b.y = c.y; b.state = "show"; b.stT = 3; }
      }
      if (b.state === "show" && dist(b.x, b.y, P.x, P.y) < 12) hurtPlayer(1, b.x, b.y);
    } else if (b.kind === "malvado") {
      const ph = b.hp > b.max * 0.66 ? 1 : b.hp > b.max * 0.33 ? 2 : 3;
      if (ph !== b.phase) {
        b.phase = ph;
        sfx.laugh();
        S.shake = 0.4;
        toast(ph === 2 ? ["THE HAT PULLS YOU IN!", "KEEP MOVING!"] : ["THE GRAND FINALE!"], 1.6);
        if (ph >= 2) b.vortex = true;
      }
      if (b.state === "gone") {
        if (b.stT <= 0) {
          b.state = "here"; b.stT = ph === 3 ? 2.2 : 3;
          const spots = ph >= 2 ? [[30, 22], [130, 22], [24, 104], [136, 104]] : [[40, 30], [120, 30], [40, 98], [120, 98], [80, 30]];
          [b.x, b.y] = spots[Math.floor(Math.random() * spots.length)];
          puff(b.x, b.y, 8);
          b.shots = ph === 3 ? 4 : 3; b.shotT = 0.5;
          if (ph !== 2 && Math.random() < 0.6) { addEnemy("spark", b.x - 8, b.y + 6); addEnemy("spark", b.x + 8, b.y + 6); }
        }
      } else {
        b.shotT -= dt;
        if (b.shots > 0 && b.shotT <= 0) { b.shots--; b.shotT = ph === 3 ? 0.18 : 0.26; bolt(b.x, b.y, ph === 3 ? 95 : 80); sfx.bolt(); }
        if (b.stT <= 0) { b.state = "gone"; b.stT = 0.6; puff(b.x, b.y, 8); sfx.blink(); }
      }
      // Sparks circle the hat while it pulls.
      if (b.vortex && Math.floor(b.t * 2) !== Math.floor((b.t - dt) * 2) && S.enemies.filter((e) => e.kind === "spark").length < (ph === 3 ? 6 : 4)) {
        const a = Math.random() * Math.PI * 2;
        addEnemy("spark", 80 + Math.cos(a) * 30, 64 + Math.sin(a) * 24);
      }
    }
  }

  /* ---------- the ladder shafts ---------- */

  function startShaft() {
    S.ladder = null;
    sfx.ladder();
    S.shaft = { lane: 1, x: 80, prog: 0, sparks: [], spawn: 0.6, inv: 0 };
    setPhase("shaft");
  }

  const LANES = [50, 80, 110];

  function updateShaft(dt) {
    const sh = S.shaft;
    R.soul = drainSoul(R.soul, dt, R.deep);
    sh.inv = Math.max(0, sh.inv - dt);
    if (pressed.has("left") && sh.lane > 0) { sh.lane--; sfx.ladder(); }
    if (pressed.has("right") && sh.lane < 2) { sh.lane++; sfx.ladder(); }
    sh.x += (LANES[sh.lane] - sh.x) * Math.min(1, dt * 14);
    const speed = held.down ? 1.6 : 1;
    sh.prog += dt * 0.1 * speed;
    if ((sh.spawn -= dt) <= 0) {
      sh.spawn = 0.55 + Math.random() * 0.4;
      const fromLeft = Math.random() < 0.5;
      sh.sparks.push({ x: fromLeft ? -4 : W + 4, y: 40 + Math.random() * 90, vx: (fromLeft ? 1 : -1) * (45 + Math.random() * 30) });
    }
    for (const s of sh.sparks) {
      s.x += s.vx * dt;
      if (sh.inv <= 0 && Math.abs(s.x - sh.x) < 5 && Math.abs(s.y - 92) < 7) {
        s.dead = true; sh.inv = 1; R.hp = Math.max(0, R.hp - 1); sfx.hurt(); haptic(30);
        if (R.hp <= 0) { caught(); return; }
      }
    }
    sh.sparks = sh.sparks.filter((s) => !s.dead && s.x > -10 && s.x < W + 10);
    if (R.soul <= 0) { caught(); return; }
    if (sh.prog >= 1) {
      descend(R);
      R.hp = Math.max(R.hp, 1);
      S.shaft = null;
      enterLayer(false);
    }
  }

  function drawShaft() {
    const sh = S.shaft;
    rect(0, TOP, W, H - TOP, 3);
    const scroll = Math.floor(sh.prog * 600);
    // The hat's lining slides up past you.
    for (let y = TOP - (scroll % 12); y < H; y += 12) { rect(0, y, 18, 6, 2); rect(W - 18, y + 6, 18, 6, 2); }
    for (const lx of LANES) {
      rect(lx - 6, TOP, 1, H - TOP, 1);
      rect(lx + 5, TOP, 1, H - TOP, 1);
      for (let y = TOP - (scroll % 8); y < H; y += 8) rect(lx - 6, y, 12, 1, 1);
    }
    for (const s of sh.sparks) drawSpark(s.x, s.y);
    if (!(sh.inv > 0 && Math.floor(sh.inv * 12) % 2)) sprite(Math.floor(S.t * 6) % 2 ? KID_UP : stepLegs(KID_UP), Math.round(sh.x), 98);
    drawHud();
    rect(4, H - 9, W - 8, 6, 2);
    rect(5, H - 8, Math.round((W - 10) * Math.min(1, sh.prog)), 4, 0);
    ctext("< > DODGE   DOWN: FASTER", TOP + 4, 1);
  }

  /* ---------- the frame ---------- */

  function titleItems() {
    const items = [];
    if (saved) items.push("CONTINUE");
    items.push("NEW RUN", "CHANGE NAME");
    return items;
  }

  function startNameEntry(after) {
    const cur = (hasName ? name : "").padEnd(NAME_LEN, " ").slice(0, NAME_LEN).split("");
    S.name = { letters: cur.map((c) => Math.max(0, ALPHABET.indexOf(c))), pos: 0, after };
    if (!hasName) S.name.letters = [2, 0, 12, 26].slice(0, NAME_LEN); // C A M _
    setPhase("name");
  }

  function updateName() {
    const n = S.name;
    const L = ALPHABET.length;
    if (pressed.has("up")) { n.letters[n.pos] = (n.letters[n.pos] + 1) % L; sfx.blip(); haptic(5); }
    if (pressed.has("down")) { n.letters[n.pos] = (n.letters[n.pos] + L - 1) % L; sfx.blip(); haptic(5); }
    if (pressed.has("right") && n.pos < NAME_LEN - 1) { n.pos++; sfx.blip(); }
    if (pressed.has("left") && n.pos > 0) { n.pos--; sfx.blip(); }
    if (pressed.has("b")) { if (n.pos > 0) n.pos--; else { setPhase("title"); S.sel = 0; } }
    if (pressed.has("a") && n.pos < NAME_LEN - 1) { n.pos++; sfx.blip(); return; }
    if (pressed.has("start") || (pressed.has("a") && n.pos === NAME_LEN - 1)) {
      const typed = n.letters.map((i) => ALPHABET[i]).join("");
      name = cleanName(typed);
      hasName = true;
      hw.save("darkhat.name", name);
      sfx.choose();
      n.after();
    }
  }

  function update(dt) {
    S.t += dt;
    if (S.toast && (S.toast.t -= dt) <= 0) S.toast = null;
    S.shake = Math.max(0, S.shake - dt);
    S.fx = S.fx.filter((f) => { f.t -= dt; if (f.vx) f.x += f.vx * dt; if (f.vy) f.y += f.vy * dt; return f.t > 0; });

    if (S.phase === "title") {
      if (S.confirm) {
        const pick = menuInput(2);
        if (pick === 0 || pressed.has("b")) { S.confirm = null; S.sel = 0; }
        else if (pick === 1) { S.confirm = null; startRun(); }
        return;
      }
      const items = titleItems();
      const pick = items[menuInput(items.length)];
      if (pick === "CONTINUE") continueRun();
      else if (pick === "NEW RUN") {
        if (!hasName) startNameEntry(startRun);
        else if (saved) { S.confirm = true; S.sel = 0; }
        else startRun();
      } else if (pick === "CHANGE NAME") startNameEntry(() => { setPhase("title"); S.sel = 0; });
      return;
    }
    if (S.phase === "name") { updateName(); return; }
    if (S.dialog) { updateDialog(dt); return; }
    if (S.phase === "story") return;
    if (S.phase === "caught") {
      if (S.t > 1.5 && (pressed.has("a") || pressed.has("start"))) { R = null; snd.play("title"); setPhase("title"); S.sel = 0; }
      return;
    }
    if (S.phase === "escape") {
      if (S.ending === "done" && S.t > 1 && (pressed.has("a") || pressed.has("start"))) { R = null; snd.play("title"); setPhase("title"); S.sel = 0; }
      return;
    }
    if (pressed.has("select")) toast(["SOUND ON", "MUSIC OFF", "SOUND OFF"][snd.cycleMode()], 0.8);
    if (S.choice) { updateChoice(); return; }
    if (S.paused) { updatePause(); return; }
    if (pressed.has("start")) { S.paused = true; S.sel = 0; S.song = snd.pause(); sfx.blip(); return; }

    if (S.phase === "shaft") { updateShaft(dt); return; }

    // In a room.
    R.soul = drainSoul(R.soul, dt, R.deep);
    if (R.soul < 20 && (S.beatT -= dt) <= 0) { S.beatT = 1.4; sfx.heartbeat(); haptic(8); }
    if (R.soul <= 0) { caught(); return; }
    if (S.bossIn != null && (S.bossIn -= dt) <= 0) { S.bossIn = null; startBoss(); }
    if (S.endT != null && (S.endT -= dt) <= 0) { S.endT = null; startEnding(); return; }
    if (S.spirit) S.spirit.t += dt;
    updatePlayer(dt);
    if (S.phase !== "room" || S.dialog) return;
    updateTricks(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateBoss(dt);
  }

  /* ---------- the trick book (pause): your build ---------- */

  const PAUSE_ITEMS = ["RESUME", "SAVE AND QUIT"];

  function updatePause() {
    const n = PAUSE_ITEMS.length;
    if (pressed.has("up")) { S.sel = (S.sel + n - 1) % n; sfx.blip(); }
    if (pressed.has("down")) { S.sel = (S.sel + 1) % n; sfx.blip(); }
    const go = pressed.has("a");
    if (pressed.has("b") || pressed.has("start") || (go && S.sel === 0)) {
      S.paused = false; if (S.song?.name) snd.play(S.song.name, S.song.at); return;
    }
    if (go && S.sel === 1) { save(); S.paused = false; snd.play("title"); setPhase("title"); S.sel = 0; saved = R; R = null; }
  }

  function drawPause() {
    rect(0, 0, W, H, 3);
    ctext("TRICK BOOK", 5, 0, 1);
    ctext(`${name}  -  ${LAYERS[R.layer].name}`, 13, 1);
    const block = (y, btn, entry, cat, icon) => {
      rect(4, y, W - 8, 1, 2);
      if (!entry) { text(`${btn}: NONE YET`, 8, y + 4, 2); text("A SPIRIT CAN TEACH YOU ONE.", 8, y + 12, 2); return; }
      sprite(ICONS[icon], 11, y + 11, false, { 3: 0 });
      text(`${btn}: ${cat[entry.id].name}`, 20, y + 4, 0);
      const ups = upgradeNames(entry, cat);
      for (let t = 0; t < TIERS; t++) text(`${t < ups.length ? "*" : "-"} ${ups[t] || "UPGRADE " + (t + 1) + " TO COME"}`, 12, y + 13 + t * 7, t < ups.length ? 1 : 2);
    };
    block(22, "A", R.attack, ATTACKS, ATTACK_ICON[R.attack.id]);
    block(58, "B", R.defense, DEFENSES, R.defense && DEFENSE_ICON[R.defense.id]);
    // Hearts from bonuses: whatever is above the three you start with and one per boss beaten.
    const extra = Math.max(0, (R.maxHp - 6 - R.beaten.filter(Boolean).length * 2) / 2);
    const bonus = [extra && `BIG HEART X${extra}`, R.deep && `DEEP SOUL X${R.deep}`].filter(Boolean).join("  ");
    if (bonus) text(`BONUS: ${bonus}`, 8, 94, 1);
    PAUSE_ITEMS.forEach((it, i) => {
      const on = S.sel === i;
      if (on) rect(30, 106 + i * 10, 100, 9, 0);
      ctext(it, 108 + i * 10, on ? 3 : 1);
    });
    ctext("B: BACK TO THE HAT", 136, 2);
  }

  /* ---------- the ending ---------- */

  function startEnding() {
    hw.save("darkhat.run", null);
    saved = null;
    wins++;
    hw.save("darkhat.wins", wins);
    snd.play("escape");
    S.ending = "story";
    setPhase("escape");
    talk(STORY.escape, () => { S.ending = "done"; S.t = 0; }, true);
  }

  function drawEnding() {
    rect(0, 0, W, H, 0);
    drawHatArt(80, 70, 2);
    // The spirits lift the hero out.
    const lift = Math.min(40, S.t * 12);
    sprite(KID_DOWN, 80, Math.round(60 - lift));
    for (let i = 0; i < 6; i++) {
      const a = S.t * 2 + i;
      sprite(SPIRIT, Math.round(80 + Math.cos(a) * 24), Math.round(62 - lift + Math.sin(a) * 10));
    }
    banner(["YOU ESCAPED!"], 92, 1);
    ctext(`${name}'S BUILD:`, 110, 3);
    const line = (entry, cat) => [cat[entry.id].name, ...upgradeNames(entry, cat)].join(", ");
    say(line(R.attack, ATTACKS), name, 38).slice(0, 1).forEach((l) => ctext(l, 118, 2));
    ctext(R.defense ? say(line(R.defense, DEFENSES), name, 38)[0] : "NO DEFENSE. BRAVE!", 125, 2);
    if (Math.floor(S.t * 2) % 2) ctext("PRESS A", 136, 3);
  }

  /* ---------- drawing ---------- */

  const ox = () => (S.shake > 0 ? Math.round((Math.random() - 0.5) * S.shake * 6) : 0);

  function drawRoom() {
    const L = R.layer;
    const dx = ox();
    // Floor.
    rect(0, TOP, W, RH, L === 2 ? 1 : 2);
    for (let y = 0; y < RH; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < RW; x += 8) {
      if (L === 0) px(x + dx, TOP + y, 3);
      else if (L === 1 && y % 16 === 0) rect(dx, TOP + y, RW, 1, 3);
      else if (L === 2 && y % 8 === 0) rect(dx, TOP + y, RW, 1, 2);
    }
    if (L === 1) for (let x = 0; x < RW; x += 16) rect(x + dx, TOP, 1, RH, 3);
    // Walls and blocks.
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (S.tiles[ty][tx] !== 1) continue;
      const x = tx * TILE + dx, y = TOP + ty * TILE;
      rect(x, y, TILE, TILE, 3);
      if (L === 0 || L === 2) { rect(x + 2, y, 1, TILE, 2); rect(x + 6, y, 1, TILE, 2); }
      else { px(x + 3, y + 3, 1); px(x + 4, y + 4, 1); }
      if (ty < ROWS - 1 && S.tiles[ty + 1][tx] === 0) rect(x, y + TILE - 1, TILE, 1, 1);
    }
    // Sealed doors get bars.
    if (S.sealed) {
      const r = S.room;
      if (r.doors.up) bars(9 * TILE, TOP, 16, 8);
      if (r.doors.down) bars(9 * TILE, TOP + RH - 8, 16, 8);
      if (r.doors.left) bars(0, TOP + 7 * TILE, 8, 16);
      if (r.doors.right) bars(RW - 8, TOP + 7 * TILE, 8, 16);
    }
    // A way up to where you came from, in the first room of a layer.
    if (S.room.kind === "start") { rect(76, TOP + 12, 8, 12, 3); for (let y = 0; y < 12; y += 3) rect(76, TOP + 12 + y, 8, 1, 1); }
  }

  function bars(x, y, w, h) {
    rect(x, y, w, h, 3);
    for (let k = 1; k < (w > h ? w : h); k += 4) { if (w > h) rect(x + k, y, 1, h, 1); else rect(x, y + k, w, 1, 1); }
  }

  function drawSpark(x, y) {
    const f = Math.floor(S.t * 12) % 2;
    x = Math.round(x); y = Math.round(y);
    // A pale glow around a black core, so dark magic shows up on a dark floor.
    rect(x - 2, y - 1, 5, 3, 1); rect(x - 1, y - 2, 3, 5, 1);
    rect(x - 1, y - 1, 3, 3, 3);
    if (f) { px(x - 2, y, 0); px(x + 2, y, 0); px(x, y - 2, 0); px(x, y + 2, 0); }
    else { px(x - 2, y - 2, 0); px(x + 2, y + 2, 0); px(x + 2, y - 2, 0); px(x - 2, y + 2, 0); }
  }

  function drawHatArt(x, y, s) {
    // A tall top hat with dark sparks swirling out of it, outlined so it shows on the dark.
    ellipse(x, y - 1 * s, 16 * s + 1, 3 * s + 1, 1, null);
    rect(x - 10 * s - 1, y - 24 * s - 1, 20 * s + 2, 22 * s + 1, 1);
    rect(x - 10 * s, y - 24 * s, 20 * s, 22 * s, 3);
    rect(x - 10 * s, y - 8 * s, 20 * s, 3 * s, 2);
    ellipse(x, y - 1 * s, 16 * s, 3 * s, 3, null);
    ellipse(x, y - 24 * s, 10 * s, 2 * s, 2, 1);
    for (let k = 0; k < 3; k++) rect(x - 7 * s + k * 5 * s, y - 20 * s + k * 3 * s, s, 6 * s, 2); // velvet folds
    for (let i = 0; i < 5; i++) {
      const a = S.t * 2 + i * 1.3;
      drawSpark(x + Math.cos(a) * 16 * s, y - 30 * s + Math.sin(a * 1.4) * 6 * s);
    }
  }

  function drawKid() {
    if (P.inv > 0 && Math.floor(P.inv * 14) % 2) return;
    const f = P.face;
    let rows = Math.abs(f.x) > Math.abs(f.y) + 0.1 ? KID_SIDE : f.y < 0 ? KID_UP : KID_DOWN;
    if (P.moving && Math.floor(P.step) % 2) rows = stepLegs(rows);
    sprite(rows, Math.round(P.x), Math.round(TOP + P.y + 5), f.x < -0.1);
    // The scarf whip lashing out.
    if (P.whipT > 0) {
      const reach = 26 * (1 - P.whipT / 0.18) + 6;
      for (let d = 4; d < reach; d += 2) {
        const wob = Math.sin(d * 0.5 + S.t * 30) * 2;
        px(Math.round(P.x + f.x * d - f.y * wob), Math.round(TOP + P.y - 2 + f.y * d + f.x * wob), 0);
      }
    }
  }

  function drawCard(x, y, k = 0) {
    x = Math.round(x); y = Math.round(TOP + y);
    rect(x - 2, y - 3, 4, 6, 3);
    rect(x - 1, y - 2, 2, 4, k);
  }

  function drawWorld() {
    drawRoom();
    if (S.fountain) {
      const ft = S.fountain;
      ellipse(ft.x, TOP + ft.y, 12, 6, 3, 1);
      ellipse(ft.x, TOP + ft.y, 9, 4, ft.used ? 2 : 0, null);
      if (!ft.used) for (let i = 0; i < 3; i++) px(ft.x - 6 + ((S.t * 20 + i * 5) % 12), TOP + ft.y - 3 - ((S.t * 9 + i * 3) % 8), 0);
    }
    if (S.ladder) {
      const l = S.ladder;
      rect(l.x - 7, TOP + l.y - 7, 14, 14, 3);
      for (let y = -6; y < 7; y += 3) rect(l.x - 5, TOP + l.y + y, 10, 1, 1);
      rect(l.x - 5, TOP + l.y - 7, 1, 14, 1); rect(l.x + 4, TOP + l.y - 7, 1, 14, 1);
      if (Math.floor(S.t * 2) % 2) ctext("DOWN!", TOP + l.y - 16, 0, 1, l.x);
    }
    for (const p of S.pickups) {
      const bob = Math.round(Math.sin(p.t * 6) * 1.5);
      if (p.kind === "sparkle") { px(p.x, TOP + p.y - 2 + bob, 0); px(p.x - 1, TOP + p.y - 1 + bob, 0); px(p.x + 1, TOP + p.y - 1 + bob, 0); px(p.x, TOP + p.y + bob, 0); }
      else { rect(p.x - 2, TOP + p.y - 2 + bob, 2, 2, 0); rect(p.x + 1, TOP + p.y - 2 + bob, 2, 2, 0); rect(p.x - 2, TOP + p.y + bob, 5, 1, 0); px(p.x, TOP + p.y + 1 + bob, 0); }
    }
    if (S.spirit) {
      const s = S.spirit;
      const bob = Math.round(Math.sin(s.t * 3) * 2);
      sprite(SPIRIT, s.x, TOP + s.y + bob);
      if (Math.floor(s.t * 4) % 2) px(s.x + 5, TOP + s.y - 7 + bob, 0);
      if (dist(P.x, P.y, s.x, s.y) < 16) { rect(s.x - 15, TOP + s.y - 17, 30, 7, 3); ctext("A: TALK", TOP + s.y - 16, 0, 1, s.x); }
    }
    for (const d of S.decoys) if (!(d.t < 0.6 && Math.floor(d.t * 10) % 2)) sprite(BUNNY, Math.round(d.x), Math.round(TOP + d.y + 3));
    drawBoss();
    for (const e of S.enemies) drawEnemy(e);
    drawKid();
    if (P.shield) {
      const r = defenseStats(R)?.radius ?? 14, n = P.shield.cards.length;
      P.shield.cards.forEach((left, i) => { if (left <= 0) return; const a = P.shield.a + (i * Math.PI * 2) / n; drawCard(P.x + Math.cos(a) * r, P.y - 2 + Math.sin(a) * r, left > 1 ? 1 : 0); });
    }
    for (const w of P.wands) {
      const a = Math.atan2(w.vy, w.vx);
      const big = P.wandSt && P.wandSt.size > 4 ? 3 : 0;
      line(Math.round(w.x - Math.cos(a) * (5 + big)), Math.round(TOP + w.y - Math.sin(a) * (5 + big)), Math.round(w.x), Math.round(TOP + w.y), 3);
      px(Math.round(w.x), Math.round(TOP + w.y), 0);
      if (big) { px(Math.round(w.x) + 1, Math.round(TOP + w.y), 0); px(Math.round(w.x), Math.round(TOP + w.y) + 1, 0); }
      if (Math.floor(S.t * 20) % 2) px(Math.round(w.x - Math.cos(a) * 7), Math.round(TOP + w.y - Math.sin(a) * 7), 0);
    }
    for (const s of S.shots) {
      if (s.kind === "card") drawCard(s.x, s.y);
      else if (s.kind === "hat") {
        const r = Math.round(s.r);
        rect(Math.round(s.x) - r + 1, Math.round(TOP + s.y) - r, (r - 1) * 2, r + 1, 3);
        rect(Math.round(s.x) - r - 1, Math.round(TOP + s.y) + 1, r * 2 + 2, 2, 3);
        rect(Math.round(s.x) - r + 1, Math.round(TOP + s.y) - 1, (r - 1) * 2, 1, 1);
      } else if (s.kind === "bolt" || s.kind === "star") {
        const x = Math.round(s.x), y = Math.round(TOP + s.y);
        px(x, y, 0); px(x - 1, y, 1); px(x + 1, y, 1); px(x, y - 1, 1); px(x, y + 1, 1);
        if (s.kind === "bolt") rect(x - 1, y - 1, 3, 3, 0);
      } else if (s.kind === "dove") {
        const x = Math.round(s.x), y = Math.round(TOP + s.y), flap = Math.floor(S.t * 16) % 2;
        rect(x - 1, y, 3, 2, 0); px(x - 2, y - flap, 0); px(x + 2, y - flap, 0);
      }
    }
    for (const f of S.foes) {
      if (f.kind === "ecard") drawCard(f.x, f.y, 2);
      else { const x = Math.round(f.x), y = Math.round(TOP + f.y); rect(x - 1, y - 1, 3, 3, 0); px(x, y, 3); }
    }
    for (const f of S.fx) {
      if (f.kind === "dot") px(Math.round(f.x), Math.round(TOP + f.y), f.t > 0.2 ? 0 : 1);
      else if (f.kind === "word") { rect(Math.round(f.x) - Math.ceil(textW(f.w) / 2) - 1, Math.round(TOP + f.y) - 1, textW(f.w) + 2, 7, 3); ctext(f.w, Math.round(TOP + f.y), 0, 1, Math.round(f.x)); }
    }
    drawHud();
  }

  function drawEnemy(e) {
    if (e.flash > 0 && Math.floor(e.flash * 40) % 2) return;
    const x = Math.round(e.x), y = Math.round(TOP + e.y);
    if (e.kind === "spark") { drawSpark(e.x, TOP + e.y); return; }
    const rows = { glove: GLOVE, bunny: BUNNY, soldier: SOLDIER, wisp: WISP }[e.kind];
    const lift = e.kind === "bunny" && e.hop > 0 ? -2 : 0;
    sprite(rows, x, y + Math.ceil(rows.length / 2) + lift, e.x > P.x);
    if (e.kind === "glove" && e.state === "wind" && Math.floor(S.t * 10) % 2) ctext("!", y - 10, 0, 1, x);
    if (e.stun > 0) px(x + Math.round(Math.cos(S.t * 9) * 4), y - 7, 0);
  }

  function drawBoss() {
    const b = S.boss;
    if (!b) return;
    if (b.flash > 0 && Math.floor(b.flash * 30) % 2) return;
    if (b.kind === "rabbit") {
      if (b.ring) ellipse(Math.round(b.ring.x), Math.round(TOP + b.ring.y), Math.round(b.ring.r), Math.round(b.ring.r * 0.6), null, 0);
      const lift = Math.round(b.lift || 0);
      if (b.state === "air") ellipse(Math.round(b.to.x), Math.round(TOP + b.to.y + 6), 8, 3, 3, null);
      const squash = b.state === "crouch" ? 2 : 0;
      sprite(RABBIT_ROWS, Math.round(b.x), Math.round(TOP + b.y + 12 - lift + squash), P.x < b.x, null, 2);
    } else if (b.kind === "king") {
      if (b.state === "show") {
        const x = Math.round(b.x), y = Math.round(TOP + b.y);
        rect(x - 8, y - 12, 16, 24, 3);
        rect(x - 7, y - 11, 14, 22, 0);
        for (let k = 0; k < 3; k++) rect(x - 5 + k * 4, y - 16 + (k === 1 ? -2 : 0), 2, 4, 3); // crown
        rect(x - 6, y - 13, 12, 2, 3);
        px(x - 3, y - 6, 3); px(x + 2, y - 6, 3);
        rect(x - 3, y - 2, 6, 1, 3);
        rect(x - 5, y + 4, 10, 1, 2); rect(x - 5, y + 7, 10, 1, 2);
      } else {
        for (const c of b.cards) {
          if (c.gone) continue;
          const x = Math.round(c.x), y = Math.round(TOP + c.y);
          rect(x - 6, y - 8, 12, 16, 3);
          rect(x - 5, y - 7, 10, 14, 2);
          for (let k = -5; k < 6; k += 3) line(x - 5, y + k, x + 4, y + k + 3, 1);
        }
      }
    } else if (b.kind === "malvado") {
      if (b.vortex) {
        // The giant hat in the middle of the stage, swirling.
        const a = S.t * 4;
        ellipse(80, TOP + 64, 14, 7, 3, 2);
        for (let k = 0; k < 6; k++) px(Math.round(80 + Math.cos(a + k) * (10 + k)), Math.round(TOP + 64 + Math.sin(a + k) * (5 + k / 2)), 0);
      }
      if (b.state === "gone") return;
      const x = Math.round(b.x), y = Math.round(TOP + b.y);
      rect(x - 4, y - 20, 8, 8, 3);              // top hat
      rect(x - 6, y - 12, 12, 2, 3);
      rect(x - 4, y - 14, 8, 1, 1);              // hat band
      rect(x - 3, y - 10, 6, 6, 0);              // face
      px(x - 2, y - 8, 3); px(x + 1, y - 8, 3);
      rect(x - 2, y - 6, 4, 1, 3);               // mustache
      for (let k = 0; k < 10; k++) rect(x - 2 - Math.floor(k / 1.5), y - 4 + k, 4 + Math.floor(k / 1.5) * 2, 1, 3); // cape
      rect(x - 1, y - 3, 2, 8, 1);               // shirt front
      line(x + 5, y - 2, x + 9, y - 8, 3);       // wand
      px(x + 9, y - 9, 0);
    }
  }

  function drawHud() {
    rect(0, 0, W, TOP, 3);
    // Hearts, in halves.
    for (let i = 0; i < R.maxHp / 2; i++) {
      const x = 3 + i * 8, y = 4;
      const fill = R.hp - i * 2;
      const c = fill >= 2 ? 0 : fill === 1 ? 1 : 2;
      rect(x, y, 2, 2, c); rect(x + 3, y, 2, 2, c); rect(x, y + 2, 5, 2, c); rect(x + 1, y + 4, 3, 1, c); px(x + 2, y + 5, c);
    }
    // The soul: when it runs out, you're the next trick.
    const sx = 3 + (R.maxHp / 2) * 8 + 4;
    text("SOUL", sx, 5, 1);
    const bw = W - 40 - sx - 18;
    rect(sx + 17, 4, bw, 7, 2);
    const low = R.soul < 20;
    if (!(low && Math.floor(S.t * 3) % 2)) rect(sx + 18, 5, Math.round((bw - 2) * (R.soul / SOUL_MAX)), 5, 0);
    // What's on A and B, with a cooldown sweep.
    [["a", W - 36], ["b", W - 18]].forEach(([slot, x]) => {
      rect(x, 2, 15, 12, 2);
      text(slot.toUpperCase(), x + 1, 3, 1);
      const k = slot === "a" ? ATTACK_ICON[R.attack.id] : R.defense && DEFENSE_ICON[R.defense.id];
      if (k) {
        sprite(ICONS[k], x + 10, 12, false, { 3: P.cd[slot] > 0 ? 1 : 0 });
        if (P.cd[slot] > 0) rect(x, 13, Math.round(15 * (1 - P.cd[slot] / P.cdMax[slot])), 1, 0);
        // Shield cards still circling, and blinks left.
        if (slot === "b" && P.shield) P.shield.cards.forEach((left, i) => left > 0 && rect(x + 1 + i * 2, 13, 1, 1, 0));
        if (slot === "b" && R.defense.id === "blink" && P.blinks > 1) { rect(x + 1, 13, 2, 1, 0); rect(x + 4, 13, 2, 1, 0); }
      }
    });
    if (S.boss) {
      const b = S.boss;
      rect(16, TOP + 2, W - 32, 5, 3);
      rect(17, TOP + 3, Math.round((W - 34) * (b.hp / b.max)), 3, 0);
    }
  }

  function drawTitle() {
    rect(0, 0, W, H, 3);
    drawHatArt(80, 62, 1);
    banner(["DARK HAT"], 66, 2);
    ctext("SORCERER'S ESCAPE", 90, 1);
    if (S.confirm) {
      banner(["START OVER?", "YOUR RUN WILL BE LOST."], 22);
      ["NO, KEEP IT", "YES, NEW RUN"].forEach((it, i) => {
        const on = i === S.sel;
        if (on) rect(30, 100 + i * 10, 100, 9, 0);
        ctext(it, 102 + i * 10, on ? 3 : 1);
      });
      return;
    }
    const items = titleItems();
    items.forEach((it, i) => {
      const on = i === S.sel;
      const label = it === "CHANGE NAME" ? `NAME: ${hasName ? name : "----"}` : it;
      if (on) rect(30, 98 + i * 10, 100, 9, 0);
      ctext(label, 100 + i * 10, on ? 3 : 1);
    });
    ctext(wins ? `A GAME BY CAMPBELL  -  ESCAPES ${wins}` : "A GAME BY CAMPBELL", 137, 2);
  }

  function drawName() {
    rect(0, 0, W, H, 3);
    ctext("WHAT'S YOUR NAME?", 20, 0);
    ctext("UP/DOWN: LETTER  < >: MOVE", 32, 2);
    const n = S.name;
    for (let i = 0; i < NAME_LEN; i++) {
      const x = 36 + i * 24;
      const on = i === n.pos;
      rect(x, 52, 18, 24, on ? 0 : 2);
      rect(x + 1, 53, 16, 22, 3);
      const ch = ALPHABET[n.letters[i]];
      text(ch === " " ? "-" : ch, x + 4, 58, on ? 0 : 1, 3);
      if (on && Math.floor(S.t * 3) % 2) { ctext("^", 46, 0, 1, x + 9); ctext("v", 80, 0, 1, x + 9); }
    }
    ctext("THE HAT WILL KNOW YOU BY IT...", 96, 1);
    ctext("START OR A ON THE LAST: DONE", 120, 2);
    ctext("B: BACK", 130, 2);
  }

  function drawCaught() {
    rect(0, 0, W, H, 1);
    rect(8, 8, W - 16, H - 16, 3);
    rect(10, 10, W - 20, H - 20, 0);
    for (let i = 0; i < 14; i++) { px(12 + i * 10, 12, Math.floor(S.t * 4 + i) % 2 ? 3 : 2); px(12 + i * 10, H - 13, Math.floor(S.t * 4 + i) % 2 ? 2 : 3); }
    ctext("TONIGHT ONLY!", 18, 3);
    ctext("THE AMAZING", 30, 2);
    ctext(name, 40, 3, 3);
    // The hero, stuck in a hat on the poster.
    rect(68, 74, 24, 18, 3);
    ellipse(80, 92, 18, 3, 3, null);
    sprite(KID_DOWN, 80, 76);
    say(STORY.caught, name, 34).slice(1).forEach((l, i) => ctext(l, 100 + i * 8, 3));
    if (S.t > 1.5 && Math.floor(S.t * 2) % 2) ctext("PRESS A", 124, 2);
  }

  function draw() {
    if (S.phase === "title") return drawTitle();
    if (S.phase === "name") return drawName();
    if (S.phase === "caught") return drawCaught();
    if (S.phase === "story" || (S.phase === "escape" && S.dialog)) return drawDialog();
    if (S.phase === "escape") return drawEnding();
    if (S.choice) return drawChoice();
    if (S.paused) return drawPause();
    if (S.phase === "shaft") drawShaft();
    else drawWorld();
    if (S.toast) banner(S.toast.lines, 50);
    if (S.dialog) drawDialog();
  }

  return {
    update,
    draw,
    suspend() { if ((S.phase === "room" || S.phase === "shaft") && !S.paused && !S.dialog && !S.choice) { S.paused = true; S.sel = 0; S.song = snd.pause(); } save(); },
    dispose() { save(); snd.dispose(); },
  };
}

/** The label on the cartridge. */
export function cover(lcd) {
  const { rect, ellipse, banner, ctext, px } = lcd;
  rect(0, 0, W, H, 3);
  rect(60, 20, 40, 44, 3);
  rect(60, 20, 40, 44, 2);
  rect(62, 22, 36, 40, 3);
  rect(60, 52, 40, 6, 1);
  ellipse(80, 66, 32, 6, 2, 1);
  for (let i = 0; i < 9; i++) {
    const x = 50 + ((i * 37) % 60), y = 8 + ((i * 23) % 30);
    rect(x - 1, y - 1, 3, 3, 1); px(x - 2, y, 0); px(x + 2, y, 0); px(x, y - 2, 0); px(x, y + 2, 0);
  }
  banner(["DARK HAT"], 80, 2);
  ctext("SORCERER'S ESCAPE", 106, 0);
  ctext("A GAME BY CAMPBELL", 126, 1);
}
