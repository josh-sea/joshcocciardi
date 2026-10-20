/**
 * Boulder Smash, cartridge #2 for the Camboy.
 *
 * Boulder the stone giant stomps down four city streets: punch buildings
 * until they crumble, bonk Dr. Fizzle's gang into the sky, free trapped
 * people, and take down the boss waiting past the gate at the end.
 */

import {
  W, H, GROUND, ARENA, WALK, CARRY_WALK, GRAVITY, JUMP_V, LEAP_V, SLAM_V, PUNCH_TIME, PUNCH_COOLDOWN,
  PUNCH_REACH, GRAB_REACH, THROW_VX, THROW_VY, MAX_HP, HURT_TIME, CITIES, BOSSES, GATE_SHARE,
  layoutCity, smashedShare, gateOpen, chooseAction, damageTo, quakeRadius, flies, overlap, unlockAfter,
} from "./rules.mjs";
import { createSound } from "./sound.mjs";

export const meta = {
  id: "boulder",
  title: "BOULDER SMASH",
  blurb: "Smash the city, bonk the gang, beat the boss.",
};

/* ---------- sprites ---------- */

// Boulder without arms; the arms are drawn per pose so they can punch, lift and slam.
const BODY = [
  "....3333....",
  "...311113...",
  "...311103...",
  "...311113...",
  "..33311333..",
  ".3111111113.",
  "311111111113",
  "311111111113",
  "311111111113",
  "311111111113",
  ".3111111113.",
  ".3222222223.",
  ".3222222223.",
  "..22222222..",
  "..3113.3113.",
  "..3113.3113.",
  ".33113.31133",
  ".3333...3333",
];
// Boulder is the dark green one, so he stands out from the light buildings and sky.
const BOULDER = { 1: 2, 2: 1 };
const STEP_LEGS = ["..3113.3113.", ".3113...3113", "33113...3113", "3333....3333"];
const TUCK_LEGS = ["..31133113..", "..33333333..", "............", "............"];

const GOON = [
  "..3333..",
  ".333333.",
  "..1001..",
  "..1001..",
  "...11...",
  ".222222.",
  "22222222",
  "2.2222.2",
  "1.2222.1",
  "..2..2..",
  "..2..2..",
  ".33..33.",
];
const ZAPPER = [
  "..3333..",
  ".333333.",
  "..0330..",
  "..1001..",
  "...11...",
  ".333333.",
  "33333333",
  "3.3333.3",
  "1.3333.1",
  "..3..3..",
  "..3..3..",
  ".33..33.",
];
const BRUTE = [
  "...3333...",
  "..322223..",
  "..310013..",
  "..311113..",
  ".33333333.",
  "3333333333",
  "3322222233",
  "3322222233",
  "1132222311",
  "1132222311",
  "..322223..",
  "..33..33..",
  "..33..33..",
  ".333..333.",
];
const ROBOT = [
  "...333...",
  "..30003..",
  ".3333333.",
  "332222233",
  "3.32223.3",
  "...3.3...",
];
const PERSON = [
  "1.3.1",
  ".303.",
  "..3..",
  ".222.",
  ".2.2.",
  ".3.3.",
];

/* ---------- the cartridge ---------- */

export function boot(hw) {
  const { lcd, input, haptic } = hw;
  const { px, rect, ellipse, line, text, textW, ctext, banner, sprite } = lcd;
  const { held, pressed, stick } = input;
  const snd = createSound(hw);
  const { sfx } = snd;
  snd.play("title");

  let unlocked = Math.max(1, Math.min(CITIES.length, hw.load("boulder.unlocked", 1)));
  let cityIx = Math.min(unlocked - 1, hw.load("boulder.city", 0));
  let best = hw.load("boulder.best", 0);

  const S = {
    phase: "title", t: 0, sel: 0, paused: false, menu: null, result: null,
    world: null, b: null, enemies: [], props: [], shots: [], fx: [],
    cam: 0, shake: 0, toast: null, score: 0, boss: null, spawnT: 0, gateWas: false, gateAnim: 0,
  };

  const PAUSE_ITEMS = ["RESUME", "RESTART CITY", "QUIT TO TITLE"];

  function toast(lines, dur = 1.2, s = 1) { S.toast = { lines: [].concat(lines), t: dur, s }; }
  function setPhase(p) { S.phase = p; S.t = 0; }
  const city = () => CITIES[cityIx];
  const len = () => S.world.length;

  function quitToTitle() {
    S.paused = false;
    snd.setTempo(1);
    snd.play("title");
    setPhase("title");
  }

  function setPaused(p) {
    if (p === S.paused) return;
    S.paused = p;
    if (p) { S.song = snd.pause(); S.sel = 0; }
    else if (S.song?.name) snd.play(S.song.name, S.song.at);
  }

  function menuInput(n) {
    if (pressed.has("up")) { S.sel = (S.sel + n - 1) % n; sfx.blip(); haptic(6); }
    if (pressed.has("down")) { S.sel = (S.sel + 1) % n; sfx.blip(); haptic(6); }
    if (pressed.has("a") || pressed.has("start")) { haptic(12); return S.sel; }
    return -1;
  }

  /* ---------- starting a city ---------- */

  function startCity() {
    S.world = layoutCity(cityIx);
    S.b = {
      x: 16, y: GROUND, vx: 0, vy: 0, face: 1, onGround: true, leaped: false, holding: null,
      punchT: 0, punchCd: 0, upT: 0, slam: null, hp: MAX_HP, hurt: 0, step: 0,
    };
    S.enemies = [];
    S.props = S.world.cars.map((c) => ({ kind: "car", x: c.x, y: GROUND, w: 14, h: 7 }));
    S.shots = [];
    S.fx = [];
    S.cam = 0;
    S.score = 0;
    S.boss = null;
    S.spawnT = 2;
    S.gateWas = false;
    S.gateAnim = 0;
    S.paused = false;
    S.toast = null;
    hw.save("boulder.city", cityIx);
    snd.setTempo(1);
    snd.play("city");
    setPhase("intro");
  }

  /* ---------- helpers ---------- */

  const boxOf = (o) => ({ x: o.x - o.w / 2, y: o.y - o.h, w: o.w, h: o.h });
  const boulderBox = () => ({ x: S.b.x - 6, y: S.b.y - 18, w: 12, h: 18 });
  const ENEMY_SIZE = { goon: [8, 12], zapper: [8, 12], brute: [10, 14], robot: [9, 6] };

  function addFx(f) { S.fx.push(f); }
  function word(x, y, w) { addFx({ kind: "word", x, y, vy: -18, t: 0.8, word: w }); }
  function dust(x, y, n = 6, spread = 30) {
    for (let i = 0; i < n; i++) addFx({ kind: "dust", x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * spread, vy: -10 - Math.random() * 30, t: 0.5 + Math.random() * 0.3 });
  }
  function ring(x, r) { addFx({ kind: "ring", x, r, t: 0.35, max: 0.35 }); }
  function addScore(n) { S.score += n; }

  function hurtBoulder(n, from) {
    const b = S.b;
    if (b.hurt > 0 || S.phase !== "play" && S.phase !== "boss") return;
    b.hp = Math.max(0, b.hp - n);
    b.hurt = HURT_TIME;
    b.vx = (from != null ? Math.sign(b.x - from) || -b.face : -b.face) * 60;
    if (b.onGround) { b.vy = -110; b.onGround = false; }
    sfx.hurt();
    haptic(35);
    S.shake = Math.max(S.shake, 0.2);
    if (b.holding) dropHeld();
    if (b.hp <= 0) gameOver();
  }

  function dropHeld() {
    const h = S.b.holding;
    if (!h) return;
    S.b.holding = null;
    if (h.kind === "enemy") S.enemies.push({ ...h.enemy, x: S.b.x, y: GROUND, state: "stun", stunLeft: 1, vx: 0 });
    else S.props.push({ kind: h.kind, x: S.b.x + S.b.face * 8, y: GROUND, w: h.w, h: h.h });
  }

  /* ---------- hitting things ---------- */

  function hitBuilding(bd, attack) {
    if (bd.hp <= 0) return false;
    const dmg = damageTo("building", attack);
    if (!dmg) return false;
    bd.hp -= dmg;
    bd.wobble = 0.3;
    if (bd.hp <= 0) {
      bd.hp = 0;
      bd.fall = 0;
      sfx.crumble();
      haptic(25);
      S.shake = Math.max(S.shake, 0.35);
      addScore(100);
      dust(bd.x + bd.w / 2, GROUND, 12, 60);
      // Rubble to throw, and sometimes a crystal that patches Boulder up.
      const n = 2 + (bd.maxHp > 4 ? 1 : 0);
      for (let i = 0; i < n; i++) S.props.push({ kind: "rubble", x: bd.x + 4 + Math.random() * (bd.w - 8), y: GROUND, w: 6, h: 5 });
      if (Math.random() < (cityIx === 3 ? 0.6 : 0.35)) S.props.push({ kind: "crystal", x: bd.x + bd.w / 2, y: GROUND, w: 5, h: 6, t: 0 });
      word(bd.x + bd.w / 2, GROUND - 30, "SMASH!");
    } else {
      sfx.hit();
      haptic(8);
      dust(bd.x + bd.w / 2, GROUND - bd.h / 2, 3, 20);
    }
    return true;
  }

  function hitRescue(r, attack) {
    if (r.freed) return false;
    const dmg = damageTo(r.kind, attack);
    if (!dmg) {
      sfx.clang();
      if (!r.hinted) { r.hinted = true; toast(["STEEL! THROW", "SOMETHING AT IT (B)"], 1.6); }
      return true;
    }
    r.hp -= dmg;
    if (r.kind === "steel") sfx.clang(); else sfx.hit();
    dust(r.x, GROUND - 6, 4, 25);
    if (r.hp <= 0) {
      r.freed = true;
      r.runT = 0;
      sfx.rescue();
      haptic(20);
      addScore(250);
      S.b.hp = Math.min(MAX_HP, S.b.hp + 15);
      toast("SAVED! +250", 1.0);
    }
    return true;
  }

  function bonk(e, dir) {
    e.state = "bonked";
    e.vx = dir * (70 + Math.random() * 40);
    e.vy = -200;
    e.t = 0;
    sfx.bonk();
    haptic(10);
    addScore(50);
    word(e.x, e.y - 16, "BONK!");
  }

  function hitEnemy(e, attack, dir) {
    if (e.state === "bonked") return false;
    const dmg = damageTo(e.kind, attack);
    if (!dmg) return false;
    e.hp -= dmg;
    if (e.hp <= 0) bonk(e, dir);
    else { e.state = "stun"; e.stunLeft = 0.6; e.vx = dir * 50; sfx.hit(); }
    return true;
  }

  function hitBoss(attack) {
    const bo = S.boss;
    if (!bo || bo.hp <= 0) return false;
    const dmg = damageTo(bo.kind, attack, { dizzy: bo.state === "dizzy" });
    if (!dmg) {
      sfx.shrug();
      if (!bo.hinted || S.t - bo.hinted > 4) {
        bo.hinted = S.t;
        const tip = { grumble: ["HE SHRUGS OFF PUNCHES.", "THROW STUFF! SLAM!"], rocko: ["PUNCH HIS BOULDERS BACK!"],
          bruno: ["MAKE HIM CRASH FIRST!"], fizzle: ["LEAP UP OR THROW HIGH!", "UP + B"] }[bo.kind];
        toast(tip, 1.6);
      }
      return false;
    }
    bo.hp -= dmg;
    bo.flash = 0.25;
    sfx.hit();
    haptic(15);
    S.shake = Math.max(S.shake, 0.2);
    if (bo.hp <= 0) bossDown();
    return true;
  }

  const bossBox = () => {
    const bo = S.boss;
    if (!bo) return null;
    if (bo.kind === "fizzle") return { x: bo.x - 13, y: bo.y - 12, w: 26, h: 16 };
    return { x: bo.x - bo.w / 2, y: GROUND - bo.h, w: bo.w, h: bo.h };
  };

  /**
   * Everything in an attack box takes the hit. once, if given, remembers
   * what this attack already hit so a lasting one (the leap) lands once per
   * target. Returns true if anything was hit.
   */
  function strike(box, attack, dir, once = null) {
    let any = false;
    const fresh = (o) => !once || (!once.has(o) && once.add(o));
    for (const e of S.enemies) {
      const [w, h] = ENEMY_SIZE[e.kind];
      if (overlap(box, { x: e.x - w / 2, y: e.y - h, w, h }) && fresh(e) && hitEnemy(e, attack, dir)) any = true;
    }
    for (const bd of S.world.buildings) {
      if (bd.hp > 0 && overlap(box, { x: bd.x, y: GROUND - bd.h, w: bd.w, h: bd.h }) && fresh(bd) && hitBuilding(bd, attack)) { any = true; break; }
    }
    for (const r of S.world.rescues) {
      if (!r.freed && overlap(box, { x: r.x - 8, y: GROUND - 16, w: 16, h: 16 }) && fresh(r) && hitRescue(r, attack)) any = true;
    }
    const bb = bossBox();
    if (bb && overlap(box, bb) && fresh(S.boss)) { hitBoss(attack); any = true; }
    // Punching Rocko's boulders sends them right back at him.
    if (attack === "punch") {
      for (const s of S.shots) {
        if (s.kind === "roll" && !s.batted && overlap(box, { x: s.x - 6, y: s.y - 6, w: 12, h: 12 })) {
          s.batted = true;
          s.vx = 150 * dir;
          sfx.punch();
          word(s.x, s.y - 12, "BATTED!");
          any = true;
        }
      }
    }
    return any;
  }

  /** A slam lands: everything on the ground nearby takes it. */
  function quake(attack) {
    const b = S.b;
    const r = quakeRadius(attack);
    const box = { x: b.x - r, y: GROUND - 60, w: r * 2, h: 64 };
    ring(b.x, r);
    if (attack === "super") { sfx.super(); haptic(50); S.shake = 0.7; toast("SUPER SLAM!", 0.9, 2); }
    else { sfx.slam(); haptic(30); S.shake = 0.35; }
    dust(b.x, GROUND, attack === "super" ? 20 : 10, attack === "super" ? 120 : 60);
    for (const e of S.enemies) {
      if (flies(e.kind) || e.state === "bonked") continue;
      if (Math.abs(e.x - b.x) <= r) hitEnemy(e, attack, Math.sign(e.x - b.x) || 1);
      else if (Math.abs(e.x - b.x) <= r * 1.6) { e.state = "stun"; e.stunLeft = 0.8; e.vx = 0; }
    }
    for (const bd of S.world.buildings) if (bd.hp > 0 && bd.x < b.x + r && bd.x + bd.w > b.x - r) hitBuilding(bd, attack);
    for (const rs of S.world.rescues) if (!rs.freed && Math.abs(rs.x - b.x) <= r + 6) hitRescue(rs, attack);
    if (S.boss && !flies(S.boss.kind)) { const bb = bossBox(); if (overlap(box, bb)) hitBoss(attack); }
    for (const s of S.shots) if (s.kind === "roll" && Math.abs(s.x - b.x) <= r) { s.dead = true; dust(s.x, GROUND, 6); }
  }

  /* ---------- Boulder ---------- */

  function act(action) {
    const b = S.b;
    switch (action) {
      case "jump":
        b.vy = JUMP_V; b.onGround = false; b.leaped = false;
        sfx.jump();
        break;
      case "punch": {
        b.punchT = PUNCH_TIME; b.punchCd = PUNCH_COOLDOWN;
        const box = b.face > 0 ? { x: b.x + 2, y: b.y - 18, w: PUNCH_REACH + 4, h: 14 } : { x: b.x - 6 - PUNCH_REACH, y: b.y - 18, w: PUNCH_REACH + 4, h: 14 };
        if (strike(box, "punch", b.face)) sfx.punch(); else sfx.whiff();
        break;
      }
      case "leap":
        b.vy = LEAP_V; b.leaped = true; b.upT = 0.28; b.upHit = new Set();
        sfx.leap();
        haptic(12);
        break;
      case "slam":
      case "super":
        b.slam = action; b.vy = SLAM_V * (action === "super" ? 1.2 : 1); b.vx *= 0.3;
        sfx.dive();
        break;
      case "grab": grab(); break;
      case "throw": throwHeld(); break;
    }
  }

  function grab() {
    const b = S.b;
    const reachX = b.x + b.face * 8;
    let pick = null, pickD = GRAB_REACH + 1;
    for (const p of S.props) {
      if (p.kind === "crystal") continue;
      const d = Math.abs(p.x - reachX);
      if (d < pickD) { pick = { list: S.props, item: p }; pickD = d; }
    }
    for (const e of S.enemies) {
      if (e.state === "bonked" || (e.kind === "brute" && e.state !== "stun") || (e.kind === "robot" && e.y < GROUND - 30)) continue;
      const d = Math.abs(e.x - reachX);
      if (d < pickD) { pick = { list: S.enemies, item: e, enemy: true }; pickD = d; }
    }
    for (const s of S.shots) {
      if (s.kind !== "roll" && s.kind !== "rock") continue;
      const d = Math.abs(s.x - reachX);
      if (d < pickD && s.y > GROUND - 20) { pick = { list: S.shots, item: s, shot: true }; pickD = d; }
    }
    if (!pick) { sfx.nothing(); return; }
    pick.list.splice(pick.list.indexOf(pick.item), 1);
    if (pick.enemy) b.holding = { kind: "enemy", enemy: pick.item, w: 8, h: 12 };
    else if (pick.shot) b.holding = { kind: "rubble", w: 8, h: 7 };
    else b.holding = { kind: pick.item.kind, w: pick.item.w, h: pick.item.h };
    sfx.grab();
    haptic(10);
  }

  function throwHeld() {
    const b = S.b;
    const h = b.holding;
    if (!h) return;
    b.holding = null;
    const high = held.up;
    S.shots.push({
      kind: "thrown", item: h, x: b.x + b.face * 4, y: b.y - 24,
      vx: b.face * (high ? 70 : THROW_VX), vy: high ? -320 : THROW_VY, w: h.w, h: h.h, spin: 0,
    });
    b.punchT = PUNCH_TIME;
    sfx.throw();
    haptic(10);
  }

  function updateBoulder(dt) {
    const b = S.b;
    b.punchT = Math.max(0, b.punchT - dt);
    b.punchCd = Math.max(0, b.punchCd - dt);
    b.hurt = Math.max(0, b.hurt - dt);
    if (b.upT > 0) {
      b.upT -= dt;
      // The uppercut hits whatever is right above Boulder on the way up.
      strike({ x: b.x - 8, y: b.y - 34, w: 16, h: 20 }, "leap", b.face, b.upHit);
    }

    const action = chooseAction(b, { up: pressed.has("up"), a: pressed.has("a"), b: pressed.has("b"), down: held.down });
    if (action) act(action);

    // Walking follows the stick's sideways push.
    const dir = Math.abs(stick.x) > 0.3 ? Math.sign(stick.x) : 0;
    const speed = b.holding ? CARRY_WALK : WALK;
    if (b.slam) b.vx *= 0.9;
    else if (b.hurt > HURT_TIME - 0.25) b.vx *= 0.92; // knocked back
    else b.vx = dir * speed * (b.punchT > 0 && b.onGround ? 0.4 : 1);
    if (dir && !b.slam) b.face = dir;
    if (dir && b.onGround) b.step += dt * 8;

    b.x += b.vx * dt;
    if (!b.onGround) {
      b.vy += GRAVITY * dt;
      b.y += b.vy * dt;
      if (b.y >= GROUND) {
        b.y = GROUND;
        b.vy = 0;
        b.onGround = true;
        b.leaped = false;
        if (b.slam) { quake(b.slam); b.slam = null; }
      }
    }

    // Walls: the gate until it opens, the arena once the boss is in.
    const minX = S.boss ? len() + 8 : Math.max(6, S.cam + 4);
    const maxX = S.boss ? len() + ARENA - 8 : gateOpen(S.world.buildings) ? len() + ARENA - 8 : len() - 8;
    b.x = Math.max(minX, Math.min(maxX, b.x));

    // Crystals heal on touch.
    for (let i = S.props.length - 1; i >= 0; i--) {
      const p = S.props[i];
      if (p.kind === "crystal" && Math.abs(p.x - b.x) < 9 && b.y > GROUND - 14) {
        S.props.splice(i, 1);
        b.hp = Math.min(MAX_HP, b.hp + 20);
        sfx.crystal();
        haptic(10);
        word(p.x, GROUND - 22, "+20");
      }
    }
  }

  /* ---------- the gang ---------- */

  function spawnEnemy(kind, x) {
    const [, h] = ENEMY_SIZE[kind];
    S.enemies.push({
      kind, x, y: kind === "robot" ? 56 + Math.random() * 24 : GROUND, vx: 0, vy: 0,
      hp: kind === "brute" ? 3 : 1, face: -1, state: "walk", t: 0, cd: 1.5 + Math.random() * 1.5, h, stunLeft: 0,
    });
  }

  function keepGangComing(dt) {
    S.spawnT -= dt;
    if (S.spawnT > 0) return;
    S.spawnT = 2.6;
    const want = city().enemies;
    for (const kind of Object.keys(want)) {
      const have = S.enemies.filter((e) => e.kind === kind && e.state !== "bonked").length;
      if (have < want[kind]) {
        const fromRight = Math.random() < 0.7;
        let x = fromRight ? S.cam + W + 10 : S.cam - 10;
        x = Math.max(10, Math.min(len() - 10, x));
        if (Math.abs(x - S.b.x) > 50) { spawnEnemy(kind, x); break; }
      }
    }
  }

  function updateEnemies(dt) {
    const b = S.b;
    for (const e of S.enemies) {
      e.t += dt;
      if (e.state === "bonked") {
        e.vy += GRAVITY * 0.6 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        continue;
      }
      if (e.state === "stun") {
        e.x += e.vx * dt; e.vx *= 0.9;
        if ((e.stunLeft -= dt) <= 0) e.state = "walk";
        continue;
      }
      const dx = b.x - e.x;
      e.face = Math.sign(dx) || e.face;
      e.cd -= dt;
      if (e.kind === "goon") {
        if (Math.abs(dx) > 11) e.x += Math.sign(dx) * 26 * dt;
        else if (e.cd <= 0) { e.state = "windup"; e.cd = 1.4; e.wind = 0.4; }
        if (e.state === "windup" && (e.wind -= dt) <= 0) {
          e.state = "walk";
          if (Math.abs(b.x - e.x) < 14 && b.y > GROUND - 20) hurtBoulder(6, e.x);
        }
      } else if (e.kind === "zapper") {
        const want = 60;
        if (Math.abs(dx) > want + 10) e.x += Math.sign(dx) * 22 * dt;
        else if (Math.abs(dx) < want - 10) e.x -= Math.sign(dx) * 18 * dt;
        if (e.cd <= 0 && Math.abs(dx) < 110) {
          e.cd = 2.4;
          S.shots.push({ kind: "zap", x: e.x + e.face * 5, y: GROUND - 8, vx: e.face * 110, vy: 0, w: 6, h: 3 });
          sfx.zap();
        }
      } else if (e.kind === "brute") {
        if (e.state === "charge") {
          e.x += e.chargeDir * 110 * dt;
          if ((e.chargeT -= dt) <= 0) { e.state = "walk"; e.cd = 3.5; }
          // Charging into a building cracks it and leaves the brute seeing stars.
          for (const bd of S.world.buildings) {
            if (bd.hp > 0 && e.x > bd.x && e.x < bd.x + bd.w && e.chargeT < 0.85) {
              hitBuilding(bd, "slam");
              e.state = "stun"; e.stunLeft = 2; e.vx = -e.chargeDir * 30;
              word(e.x, e.y - 18, "DIZZY!");
              break;
            }
          }
          if (overlap(boulderBox(), { x: e.x - 5, y: e.y - 14, w: 10, h: 14 })) hurtBoulder(12, e.x);
        } else {
          if (Math.abs(dx) > 14) e.x += Math.sign(dx) * 16 * dt;
          if (e.cd <= 0 && Math.abs(dx) < 90) { e.state = "charge"; e.chargeDir = Math.sign(dx); e.chargeT = 1.0; word(e.x, e.y - 18, "!"); }
        }
      } else if (e.kind === "robot") {
        e.x += Math.sign(dx) * Math.min(Math.abs(dx), 30) * dt;
        e.y = (e.baseY ?? (e.baseY = e.y)) + Math.sin(e.t * 3) * 4;
        if (e.cd <= 0 && Math.abs(dx) < 30) {
          e.cd = 2.8;
          S.shots.push({ kind: "bomb", x: e.x, y: e.y + 4, vx: 0, vy: 0, w: 4, h: 4 });
          sfx.bomb();
        }
      }
      // Bumping into most of the gang stings a little.
      if (e.kind !== "robot" && e.kind !== "brute" && overlap(boulderBox(), { x: e.x - 3, y: e.y - 10, w: 6, h: 10 }) && e.state === "walk" && Math.random() < dt * 2) {
        hurtBoulder(4, e.x);
      }
    }
    S.enemies = S.enemies.filter((e) => !(e.state === "bonked" && (e.y < -30 || e.y > H + 20)) && e.x > -60 && e.x < len() + ARENA + 60);
  }

  /* ---------- things in the air ---------- */

  function updateShots(dt) {
    const b = S.b;
    for (const s of S.shots) {
      if (s.dead) continue;
      if (s.kind === "thrown") {
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.spin += dt * 12;
        const box = { x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h };
        let hit = false;
        for (const e of S.enemies) {
          const [w, h] = ENEMY_SIZE[e.kind];
          if (e.state !== "bonked" && overlap(box, { x: e.x - w / 2, y: e.y - h, w, h })) { hitEnemy(e, "throw", Math.sign(s.vx) || 1); hit = true; }
        }
        if (!hit) for (const bd of S.world.buildings) {
          if (bd.hp > 0 && overlap(box, { x: bd.x, y: GROUND - bd.h, w: bd.w, h: bd.h })) { hitBuilding(bd, "throw"); hit = true; break; }
        }
        if (!hit) for (const r of S.world.rescues) {
          if (!r.freed && overlap(box, { x: r.x - 8, y: GROUND - 16, w: 16, h: 16 })) { hitRescue(r, "throw"); hit = true; }
        }
        const bb = bossBox();
        if (!hit && bb && overlap(box, bb)) { hitBoss("throw"); hit = true; }
        if (hit || s.y >= GROUND - 2) {
          s.dead = true;
          dust(s.x, Math.min(s.y, GROUND), 5, 30);
          if (hit) {
            sfx.hit();
            if (s.item.kind === "enemy") bonk({ ...s.item.enemy, x: s.x, y: s.y }, Math.sign(s.vx) || 1);
          } else if (s.item.kind === "enemy") {
            S.enemies.push({ ...s.item.enemy, x: s.x, y: GROUND, state: "stun", stunLeft: 1, vx: 0 });
          } else {
            S.props.push({ kind: s.item.kind === "car" ? "car" : "rubble", x: s.x, y: GROUND, w: s.item.kind === "car" ? 14 : 6, h: s.item.kind === "car" ? 7 : 5 });
            sfx.punch();
          }
        }
      } else if (s.kind === "zap") {
        s.x += s.vx * dt;
        if (overlap(boulderBox(), { x: s.x - 3, y: s.y - 2, w: 6, h: 3 })) { s.dead = true; hurtBoulder(8, s.x); }
        if (Math.abs(s.x - b.x) > 200) s.dead = true;
      } else if (s.kind === "bomb") {
        s.vy += GRAVITY * 0.5 * dt;
        s.y += s.vy * dt;
        if (s.y >= GROUND - 2) {
          s.dead = true;
          sfx.boom();
          ring(s.x, 14);
          dust(s.x, GROUND, 6, 40);
          if (Math.abs(s.x - b.x) < 16 && b.y > GROUND - 24) hurtBoulder(10, s.x);
        } else if (overlap(boulderBox(), { x: s.x - 2, y: s.y - 2, w: 4, h: 4 })) { s.dead = true; sfx.boom(); hurtBoulder(10, s.x); }
      } else if (s.kind === "rock") {
        // Grumble's boulders: they land and stay, ready to be thrown back.
        s.vy += GRAVITY * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (overlap(boulderBox(), { x: s.x - 5, y: s.y - 5, w: 10, h: 10 })) { s.dead = true; hurtBoulder(12, s.x); dust(s.x, s.y, 5); }
        else if (s.y >= GROUND - 4) {
          s.dead = true;
          sfx.punch();
          S.shake = Math.max(S.shake, 0.15);
          S.props.push({ kind: "rubble", x: s.x, y: GROUND, w: 6, h: 5 });
          dust(s.x, GROUND, 5, 30);
        }
      } else if (s.kind === "roll") {
        // Rocko's boulders roll along the street. Jump them or punch them back.
        s.x += s.vx * dt;
        s.spin = (s.spin || 0) + s.vx * dt * 0.2;
        if (!s.batted && overlap(boulderBox(), { x: s.x - 5, y: s.y - 6, w: 10, h: 10 })) { s.dead = true; hurtBoulder(12, s.x); dust(s.x, GROUND, 6); }
        if (s.batted && S.boss && overlap(bossBox(), { x: s.x - 6, y: s.y - 6, w: 12, h: 12 })) { s.dead = true; hitBoss("batted"); dust(s.x, GROUND, 8, 50); }
        if (s.x < len() + 4 || s.x > len() + ARENA - 4) { s.dead = true; dust(s.x, GROUND, 6); }
      }
    }
    S.shots = S.shots.filter((s) => !s.dead);
  }

  /* ---------- bosses ---------- */

  function startBoss() {
    const kind = city().boss;
    const sizes = { grumble: [24, 36], rocko: [26, 24], bruno: [34, 20], fizzle: [26, 14] };
    const [w, h] = sizes[kind];
    S.boss = {
      kind, name: BOSSES[kind].name, hp: BOSSES[kind].hp, max: BOSSES[kind].hp,
      x: len() + ARENA - 30, y: kind === "fizzle" ? 46 : GROUND, w, h, face: -1, t: 0, cd: 2, state: "idle", flash: 0,
    };
    S.enemies = S.enemies.filter((e) => e.x > len() - 4);
    snd.play("boss");
    sfx.roar();
    haptic(30);
    toast([S.boss.name], 1.8);
    setPhase("boss");
  }

  function updateBoss(dt) {
    const bo = S.boss;
    if (!bo) return;
    const b = S.b;
    bo.t += dt;
    bo.flash = Math.max(0, bo.flash - dt);
    if (bo.hp <= 0) return;
    const dx = b.x - bo.x;
    const left = len() + 14, right = len() + ARENA - 14;
    bo.cd -= dt;
    const touching = bo.kind !== "fizzle" && overlap(boulderBox(), bossBox());

    if (bo.kind === "grumble") {
      bo.face = Math.sign(dx) || bo.face;
      if (bo.state === "windup") {
        if ((bo.wind -= dt) <= 0) {
          bo.state = "idle";
          // Lob a boulder to land where Boulder is standing.
          const tFlight = 1.1;
          const sx = bo.x + bo.face * 8, sy = GROUND - 40;
          S.shots.push({ kind: "rock", x: sx, y: sy, vx: (b.x - sx) / tFlight, vy: (GROUND - 4 - sy - 0.5 * GRAVITY * tFlight * tFlight) / tFlight });
          sfx.throw();
        }
      } else {
        if (Math.abs(dx) > 34) bo.x += Math.sign(dx) * 16 * dt;
        if (bo.cd <= 0) { bo.state = "windup"; bo.wind = 0.6; bo.cd = 3.2 - (1 - bo.hp / bo.max) * 1.2; sfx.roar(); }
      }
      if (touching) hurtBoulder(12, bo.x);
    } else if (bo.kind === "rocko") {
      bo.x = right - 8 + Math.sin(bo.t * 1.3) * 6;
      bo.face = -1;
      if (bo.cd <= 0) {
        bo.cd = 2.4 - (1 - bo.hp / bo.max) * 1.0;
        S.shots.push({ kind: "roll", x: bo.x - 16, y: GROUND - 1, vx: -(80 + (1 - bo.hp / bo.max) * 30), spin: 0 });
        sfx.roll();
      }
      if (touching) hurtBoulder(12, bo.x);
    } else if (bo.kind === "bruno") {
      if (bo.state === "idle") {
        bo.face = Math.sign(dx) || bo.face;
        if (bo.cd <= 0) { bo.state = "rev"; bo.revT = 0.8; sfx.rev(); if (!bo.warned) { bo.warned = true; toast("JUMP OVER HIM!", 1.2); } }
      } else if (bo.state === "rev") {
        if ((bo.revT -= dt) <= 0) { bo.state = "charge"; bo.dir = bo.face; }
      } else if (bo.state === "charge") {
        bo.x += bo.dir * 150 * dt;
        if (touching && b.y > GROUND - 22) hurtBoulder(15, bo.x);
        // Into the steel block at the end of the arena: crash, and see stars.
        if (bo.x <= left + 12 || bo.x >= right - 12) {
          bo.x = Math.max(left + 12, Math.min(right - 12, bo.x));
          bo.state = "dizzy"; bo.dizzyT = 3; bo.face = -bo.dir;
          sfx.crash(); sfx.dizzy(); haptic(30);
          S.shake = 0.5;
          word(bo.x, GROUND - 30, "CRASH!");
          toast("BONK HIM NOW!", 1.0);
        }
      } else if (bo.state === "dizzy") {
        if ((bo.dizzyT -= dt) <= 0) { bo.state = "idle"; bo.cd = 1.4; }
      }
    } else if (bo.kind === "fizzle") {
      // Fly back and forth, drop bombs, and sometimes swoop low with backup.
      const mid = len() + ARENA / 2;
      bo.x = mid + Math.sin(bo.t * 0.7) * 54;
      const swoop = (bo.t % 10) > 7.5;
      const targetY = swoop ? 76 : 44 + Math.sin(bo.t * 2) * 6;
      bo.y += (targetY - bo.y) * Math.min(1, dt * 3);
      if (bo.cd <= 0) {
        bo.cd = swoop ? 0.9 : 2.0 - (1 - bo.hp / bo.max) * 0.6;
        S.shots.push({ kind: "bomb", x: bo.x, y: bo.y + 4, vx: 0, vy: 0 });
        sfx.bomb();
      }
      if (swoop && !bo.summoned) {
        bo.summoned = true;
        spawnEnemy("robot", len() + 20);
        spawnEnemy("robot", len() + ARENA - 20);
        toast("ROBOTS!", 0.9);
      }
      if (!swoop) bo.summoned = false;
    }
  }

  function bossDown() {
    sfx.bossDown();
    haptic(50);
    S.shake = 0.8;
    addScore(1000);
    for (let i = 0; i < 4; i++) dust(S.boss.x + (i - 1.5) * 8, S.boss.kind === "fizzle" ? S.boss.y : GROUND - 10, 8, 80);
    word(S.boss.x, (S.boss.kind === "fizzle" ? S.boss.y : GROUND - S.boss.h) - 6, "DEFEATED!");
    S.enemies.forEach((e) => { if (e.state !== "bonked") bonk(e, Math.sign(e.x - S.b.x) || 1); });
    S.shots = S.shots.filter((s) => s.kind === "thrown");
    setPhase("cleared");
  }

  function finishCity(won) {
    const before = unlocked;
    unlocked = unlockAfter(cityIx, won, unlocked);
    hw.save("boulder.unlocked", unlocked);
    if (S.score > best) { best = S.score; hw.save("boulder.best", best); }
    const played = cityIx;
    const champs = won && played === CITIES.length - 1;
    S.result = { won, played, champs, newCity: unlocked > before ? CITIES[unlocked - 1].name : null };
    S.menu = won && !champs ? ["NEXT CITY", `REPLAY CITY ${played + 1}`, "TITLE"] : ["PLAY AGAIN", "TITLE"];
    S.sel = 0;
    snd.play(won ? "win" : "lose");
    setPhase("final");
  }

  function gameOver() {
    sfx.hurt();
    setPhase("down");
  }

  /* ---------- the frame ---------- */

  function titleInput() {
    if (pressed.has("left") && cityIx > 0) { cityIx--; sfx.blip(); }
    if (pressed.has("right") && cityIx < CITIES.length - 1) { cityIx++; sfx.blip(); }
    if (pressed.has("start") || (S.t > 0.6 && pressed.has("a"))) {
      if (cityIx < unlocked) startCity();
      else { sfx.clang(); haptic(30); }
    }
  }

  function update(dt) {
    S.t += dt;
    if (S.phase === "title") { titleInput(); return; }
    if (S.phase === "final") {
      if (S.t < 0.8) return;
      const pick = S.menu[menuInput(S.menu.length)];
      if (pick === "TITLE" || (pressed.has("b") && S.t > 0.8)) quitToTitle();
      else if (pick === "NEXT CITY") { cityIx = Math.min(CITIES.length - 1, cityIx + 1); startCity(); }
      else if (pick) { cityIx = S.result.played; startCity(); }
      return;
    }
    if (pressed.has("select")) toast(["SOUND ON", "MUSIC OFF", "SOUND OFF"][snd.cycleMode()], 0.8);
    if (S.paused) {
      if (pressed.has("b")) { setPaused(false); return; }
      const pick = menuInput(PAUSE_ITEMS.length);
      if (pick === 0) setPaused(false);
      else if (pick === 1) startCity();
      else if (pick === 2) quitToTitle();
      return;
    }
    if (pressed.has("start") && S.phase !== "down") { setPaused(true); sfx.blip(); return; }

    if (S.toast && (S.toast.t -= dt) <= 0) S.toast = null;
    S.shake = Math.max(0, S.shake - dt);
    S.fx = S.fx.filter((f) => {
      f.t -= dt;
      if (f.vx != null) f.x += f.vx * dt;
      if (f.vy != null) { f.y += f.vy * dt; if (f.kind === "dust") f.vy += 60 * dt; }
      return f.t > 0;
    });
    for (const bd of S.world.buildings) {
      if (bd.wobble > 0) bd.wobble -= dt;
      if (bd.fall != null && bd.fall < 1) bd.fall = Math.min(1, bd.fall + dt * 1.6);
    }
    for (const r of S.world.rescues) if (r.freed && r.runT != null) r.runT += dt;
    for (const p of S.props) if (p.kind === "crystal") p.t += dt;

    if (S.phase === "intro") {
      S.b.x = Math.min(30, S.b.x + 30 * dt);
      S.b.step += dt * 8;
      if (S.t > 2.4) setPhase("play");
      return;
    }
    if (S.phase === "down") {
      S.b.hurt = 0;
      if (S.t > 2.2) finishCity(false);
      return;
    }
    if (S.phase === "cleared") {
      updateBoulder(dt);
      updateEnemies(dt);
      updateShots(dt);
      if (S.t > 2.6) finishCity(true);
      return;
    }

    updateBoulder(dt);
    if (S.phase === "down") return;
    updateEnemies(dt);
    updateShots(dt);

    if (S.phase === "play") {
      keepGangComing(dt);
      const open = gateOpen(S.world.buildings);
      if (open && !S.gateWas) { S.gateWas = true; sfx.gate(); toast(["GATE OPEN!", "GO RIGHT! >"], 1.6); }
      if (open) S.gateAnim = Math.min(1, S.gateAnim + dt * 1.5);
      if (!open && S.b.x >= len() - 10 && !S.gateHint) { S.gateHint = 2.5; toast([`SMASH ${Math.round(GATE_SHARE * 100)}% FIRST!`], 1.4); }
      if (S.gateHint) S.gateHint = Math.max(0, S.gateHint - dt) || null;
      if (open && S.b.x > len() + 30) startBoss();
      // The camera follows Boulder, and stops at the gate while it's shut.
      const maxCam = open ? len() + ARENA - W : len() - W + 24;
      S.cam += (Math.max(0, Math.min(maxCam, S.b.x - 64)) - S.cam) * Math.min(1, dt * 6);
    } else if (S.phase === "boss") {
      S.cam += (len() - S.cam) * Math.min(1, dt * 4);
      updateBoss(dt);
    }
  }

  /* ---------- drawing ---------- */

  const sx = (x) => Math.round(x - S.cam + (S.shake > 0 ? (Math.random() - 0.5) * S.shake * 6 : 0));

  /** A checkerboard of the light shade: background, not something to punch. */
  function dots(x, y, w, h) {
    for (let yy = Math.max(12, y); yy < y + h; yy++) for (let xx = x + ((xx0(yy)) & 1); xx < x + w; xx += 2) px(xx, yy, 1);
  }
  const xx0 = (yy) => yy + Math.floor(S.cam * 0.35);

  function drawSky() {
    rect(0, 12, W, GROUND - 12, 0);
    // A skyline far behind, scrolling slower than the street, dotted so it stays in the background.
    const par = S.cam * 0.35;
    for (let i = -1; i < 9; i++) {
      const base = Math.floor(par / 24) + i;
      const x = Math.round(base * 24 - par);
      const h = 18 + ((base * 37) % 5) * 7;
      if (cityIx === 1) {
        for (let k = 0; k < 24; k++) dots(x + k, GROUND - Math.max(0, h - Math.abs(k - 12) * 2), 1, Math.max(0, h - Math.abs(k - 12) * 2));
      } else {
        dots(x + 2, GROUND - h, 18, h);
        if (cityIx === 2 && base % 2 === 0) dots(x + 14, GROUND - 10 - h, 3, 10); // chimneys
        if (cityIx === 3) dots(x + 10, GROUND - 10 - h, 2, 10); // spires
      }
    }
    // Street, curb and lane marks.
    rect(0, GROUND, W, 12, 2);
    rect(0, GROUND, W, 1, 3);
    for (let x = -((S.cam * 1) % 20); x < W; x += 20) rect(Math.round(x), GROUND + 6, 8, 1, 1);
  }

  function drawBuilding(bd) {
    const fall = bd.fall ?? 0;
    if (fall >= 1) {
      // A rubble heap where it stood.
      const x = sx(bd.x);
      for (let k = 0; k < bd.w; k += 3) rect(x + k, GROUND - 2 - ((k * 7) % 4), 3, 3 + ((k * 7) % 4), 2);
      return;
    }
    const h = Math.round(bd.h * (1 - fall));
    const wob = bd.wobble > 0 ? Math.round(Math.sin(bd.wobble * 60) * 1.5) : 0;
    const x = sx(bd.x) + wob, y = GROUND - h;
    rect(x, y, bd.w, h, 3);
    rect(x + 1, y + 1, bd.w - 2, h - 1, 1);
    rect(x - 1, y, bd.w + 2, 2, 3); // roof ledge
    for (let wy = y + 5; wy < GROUND - 6; wy += 7) {
      for (let wx = x + 4; wx < x + bd.w - 5; wx += 6) rect(wx, wy, 3, 4, (wx + wy) % 3 ? 0 : 2);
    }
    rect(x + Math.floor(bd.w / 2) - 2, GROUND - 6, 5, 6, 3); // door
    // Cracks show how close it is to coming down.
    const dmg = 1 - bd.hp / bd.maxHp;
    if (dmg > 0.2) line(x + 3, y + 4, x + bd.w / 2, y + h / 2, 3);
    if (dmg > 0.5) line(x + bd.w - 3, y + h / 3, x + bd.w / 2 - 2, GROUND - 8, 3);
    if (dmg > 0.75) line(x + 2, y + h * 0.6, x + bd.w / 3, GROUND - 3, 3);
  }

  function drawGate() {
    const x = sx(len());
    if (x < -10 || x > W + 10) return;
    const lift = Math.round(S.gateAnim * 60);
    rect(x - 2, 30, 4, GROUND - 30, 3);
    for (let y = 34 - lift; y < GROUND - lift; y += 6) rect(x - 6, y, 12, 2, 3);
    if (!S.gateWas) {
      rect(x - 14, 40, 28, 9, 3);
      ctext(`${Math.round(GATE_SHARE * 100)}%`, 42, 0, 1, x);
    }
  }

  function drawRescue(r) {
    const x = sx(r.x);
    if (r.freed) {
      // Running home.
      if (r.runT < 3) sprite(PERSON, x - Math.round(r.runT * 40), GROUND, true);
      return;
    }
    sprite(PERSON, x, GROUND - 1, false);
    if (Math.floor(S.t * 4) % 2) px(x - 2, GROUND - 8, 0);
    if (r.kind === "rocks") {
      for (let k = -1; k <= 1; k++) ellipse(x + k * 6, GROUND - 3, 4, 3, 2, 3);
      ellipse(x - 3, GROUND - 8, 4, 3, 2, 3);
      ellipse(x + 4, GROUND - 9, 3, 3, 2, 3);
    } else {
      rect(x - 8, GROUND - 16, 16, 1, 3);
      for (let k = -8; k <= 8; k += 4) rect(x + k, GROUND - 16, 1, 16, 3);
      if (r.hp < 2) line(x - 6, GROUND - 14, x + 2, GROUND - 4, 2);
    }
  }

  function drawProp(p) {
    const x = sx(p.x);
    if (p.kind === "car") {
      rect(x - 7, p.y - 6, 14, 4, 2);
      rect(x - 4, p.y - 9, 8, 3, 2);
      rect(x - 3, p.y - 8, 6, 2, 0);
      rect(x - 7, p.y - 6, 14, 1, 3);
      ellipse(x - 4, p.y - 1, 2, 1, 3, null);
      ellipse(x + 4, p.y - 1, 2, 1, 3, null);
    } else if (p.kind === "rubble") {
      ellipse(x, p.y - 2, 3, 2, 2, 3);
    } else if (p.kind === "crystal") {
      const bob = Math.round(Math.sin(p.t * 5) * 1.5);
      const y = p.y - 5 + bob;
      line(x, y - 4, x + 3, y, 3); line(x + 3, y, x, y + 4, 3); line(x, y + 4, x - 3, y, 3); line(x - 3, y, x, y - 4, 3);
      px(x, y, 0); px(x - 1, y - 1, 0);
    }
  }

  function drawHeldItem(h, x, y) {
    if (h.kind === "car") { rect(x - 7, y - 5, 14, 4, 2); rect(x - 4, y - 8, 8, 3, 2); rect(x - 7, y - 5, 14, 1, 3); }
    else if (h.kind === "enemy") sprite(GOON, x, y, false);
    else ellipse(x, y - 3, 4, 3, 2, 3);
  }

  function thick(x0, y0, x1, y1, w, c) {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * (i / n)), y = Math.round(y0 + (y1 - y0) * (i / n));
      rect(x - (w >> 1), y - (w >> 1), w, w, c);
    }
  }

  /** An arm from the shoulder to the hand, ending in a big stone fist. */
  function arm(x0, y0, x1, y1, s = 1, dark = false) {
    thick(x0, y0, x1, y1, 3 * s, 3);
    thick(x0, y0, x1, y1, s, dark ? 2 : 1);
    rect(x1 - 2 * s, y1 - 2 * s, 5 * s, 5 * s, 3);
    rect(x1 - s, y1 - s, 3 * s, 3 * s, dark ? 2 : 1);
  }

  function drawBoulder() {
    const b = S.b;
    if (b.hurt > 0 && Math.floor(b.hurt * 12) % 2) return;
    const x = sx(b.x), y = Math.round(b.y), f = b.face;
    let legs = null;
    if (!b.onGround) legs = TUCK_LEGS;
    else if (Math.floor(b.step) % 2 && Math.abs(b.vx) > 1) legs = STEP_LEGS;
    const body = legs ? [...BODY.slice(0, 14), ...legs] : BODY;
    const swing = Math.abs(b.vx) > 1 && b.onGround ? Math.round(Math.sin(b.step * Math.PI) * 2) : 0;
    // Where the hands go, by pose. (fx, fy) is the front hand, (bx, by) the back one.
    let fx = 7 + swing, fy = -6, bx = -7 - swing, by = -6;
    if (b.holding) { fx = 4; fy = -21; bx = -4; by = -21; }
    else if (b.slam) { fx = 4; fy = -1; bx = -4; by = -1; }
    else if (b.upT > 0) { fx = 4; fy = -27; bx = -7; by = -9; }
    else if (b.punchT > 0) { fx = 14; fy = -12; bx = -6; by = -8; }
    else if (!b.onGround) { fx = 9; fy = -16; bx = -9; by = -16; }
    arm(x - 5 * f, y - 13, x + bx * f, y + by, 1, true);
    sprite(body, x, y, f < 0, BOULDER);
    arm(x + 5 * f, y - 13, x + fx * f, y + fy, 1, true);
    if (b.holding) drawHeldItem(b.holding, x, y - 22);
    if (b.slam && !b.onGround) for (let k = 1; k <= 3; k++) line(x - 6 + k * 3, y - 24 - k * 4, x - 6 + k * 3, y - 20 - k * 4, 2);
  }

  function drawEnemy(e) {
    const x = sx(e.x), y = Math.round(e.y);
    if (x < -20 || x > W + 20) return;
    const rows = { goon: GOON, zapper: ZAPPER, brute: BRUTE, robot: ROBOT }[e.kind];
    if (e.state === "bonked") { sprite(rows, x, y, Math.floor(e.t * 10) % 2 === 0); return; }
    const flip = e.face < 0;
    let yy = y;
    if (e.state === "windup") yy -= 1;
    sprite(rows, x, yy, flip);
    if (e.kind === "zapper") rect(x + (flip ? -7 : 4), y - 8, 4, 2, 3); // the zap gun
    if (e.state === "stun") for (let k = 0; k < 2; k++) px(x - 2 + Math.round(Math.cos(S.t * 8 + k * 3) * 4), y - (ENEMY_SIZE[e.kind][1]) - 2, 3);
    if (e.state === "windup" && Math.floor(S.t * 10) % 2) ctext("!", y - 18, 3, 1, x);
  }

  function drawShot(s) {
    const x = sx(s.x), y = Math.round(s.y);
    if (s.kind === "thrown") drawHeldItem(s.item, x, y + 4);
    else if (s.kind === "zap") { rect(x - 3, y - 1, 6, 2, 3); px(x + (Math.floor(S.t * 20) % 3) - 1, y - 2, 3); }
    else if (s.kind === "bomb") { ellipse(x, y, 2, 2, 3, null); px(x, y - 3, Math.floor(S.t * 10) % 2 ? 3 : 2); }
    else if (s.kind === "rock") ellipse(x, y, 5, 5, 2, 3);
    else if (s.kind === "roll") {
      ellipse(x, y - 5, 6, 6, s.batted ? 1 : 2, 3);
      const a = s.spin || 0;
      line(x, y - 5, x + Math.round(Math.cos(a) * 5), y - 5 + Math.round(Math.sin(a) * 5), 3);
    }
  }

  function drawBoss() {
    const bo = S.boss;
    if (!bo) return;
    if (bo.hp <= 0 && Math.floor(S.t * 10) % 2) return;
    if (bo.flash > 0 && Math.floor(bo.flash * 30) % 2) return;
    const x = sx(bo.x);
    if (bo.kind === "grumble") {
      const f = bo.face;
      const up = bo.state === "windup";
      arm(x - 10 * f, GROUND - 26, x + (up ? -6 : -14) * f, GROUND + (up ? -44 : -10), 2);
      sprite(BODY, x, GROUND, f < 0, { 2: 3 }, 2);
      arm(x + 10 * f, GROUND - 26, x + (up ? 6 : 14) * f, GROUND + (up ? -44 : -10), 2);
      if (up) ellipse(x, GROUND - 48, 6, 6, 2, 3);
    } else if (bo.kind === "rocko") {
      ellipse(x, GROUND - 12, 13, 12, 2, 3);
      ellipse(x - 6, GROUND - 16, 3, 2, 1, null);
      ellipse(x + 3, GROUND - 20, 2, 2, 1, null);
      rect(x - 8, GROUND - 14, 3, 3, 0); px(x - 7, GROUND - 13, 3);
      rect(x - 3, GROUND - 14, 3, 3, 0); px(x - 2, GROUND - 13, 3);
      rect(x - 7, GROUND - 8, 6, 1, 3);
      rect(x - 10, GROUND - 2, 6, 2, 3); rect(x + 4, GROUND - 2, 6, 2, 3);
    } else if (bo.kind === "bruno") {
      const shake = bo.state === "rev" ? Math.round(Math.sin(S.t * 60)) : 0;
      const xx = x + shake, f = bo.face;
      rect(xx - 15, GROUND - 6, 30, 6, 3);
      for (let k = -12; k <= 12; k += 6) px(xx + k + (Math.floor(S.t * 20) % 3), GROUND - 3, 1);
      rect(xx - 12, GROUND - 14, 22, 8, 1);
      rect(xx - 12, GROUND - 14, 22, 1, 3);
      rect(xx - 6 * f - 4, GROUND - 20, 9, 7, 1);
      rect(xx - 6 * f - 3, GROUND - 19, 7, 3, 0);
      px(xx - 6 * f - 2, GROUND - 18, 3); px(xx - 6 * f + 2, GROUND - 18, 3);
      rect(xx + f * 13 - (f > 0 ? 0 : 3), GROUND - 18, 4, 16, 2); // the blade
      rect(xx + f * 13 - (f > 0 ? 0 : 3), GROUND - 18, 4, 1, 3);
      if (bo.state === "dizzy") for (let k = 0; k < 3; k++) {
        const a = S.t * 6 + k * 2.1;
        px(xx + Math.round(Math.cos(a) * 9), GROUND - 25 + Math.round(Math.sin(a) * 2), 3);
      }
    } else if (bo.kind === "fizzle") {
      const y = Math.round(bo.y);
      ellipse(x, y - 6, 5, 5, 0, 3);
      rect(x - 2, y - 8, 1, 1, 3); rect(x + 1, y - 8, 1, 1, 3); // glasses
      rect(x - 3, y - 9, 6, 1, 3);
      ellipse(x, y, 13, 3, 2, 3);
      for (let k = -9; k <= 9; k += 6) px(x + k, y + 1, Math.floor(S.t * 6 + k) % 2 ? 0 : 1);
    }
    // Steel blocks at both ends of Bruno's arena.
    if (bo.kind === "bruno") {
      for (const ex of [len() + 4, len() + ARENA - 14]) {
        const bx = sx(ex);
        rect(bx, GROUND - 16, 10, 16, 3);
        rect(bx + 1, GROUND - 15, 8, 14, 2);
        line(bx + 1, GROUND - 15, bx + 8, GROUND - 2, 3);
      }
    }
  }

  function drawFx() {
    for (const f of S.fx) {
      const x = sx(f.x);
      if (f.kind === "dust") px(x, Math.round(f.y), f.t > 0.3 ? 2 : 1);
      else if (f.kind === "ring") {
        const k = 1 - f.t / f.max;
        ellipse(x, GROUND, Math.max(1, Math.round(f.r * k)), Math.max(1, Math.round(3 * k)), null, 3);
      } else if (f.kind === "word") {
        rect(x - Math.ceil(textW(f.word) / 2) - 1, Math.round(f.y) - 1, textW(f.word) + 2, 7, 3);
        ctext(f.word, Math.round(f.y), 0, 1, x);
      }
    }
  }

  function bar(x, y, w, v, max) {
    rect(x, y, w, 5, 2);
    rect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(v, max)) / max), 3, v / max < 0.3 ? 1 : 0);
  }

  function drawHud() {
    rect(0, 0, W, 12, 3);
    text("HP", 3, 4, 1);
    bar(12, 3, 40, S.b.hp, MAX_HP);
    if (S.boss) {
      const n = S.boss.name.split(" ")[0] === "DR." ? "FIZZLE" : S.boss.name.split(" ")[0];
      text(n, 60, 4, 0);
      bar(60 + textW(n) + 3, 3, W - 63 - textW(n) - 3, S.boss.hp, S.boss.max);
    } else {
      const s = String(S.score).padStart(5, "0");
      text(s, 60, 4, 0);
      const pct = Math.round(smashedShare(S.world.buildings) * 100);
      const c = `CITY ${pct}%`;
      text(c, W - 3 - textW(c), 4, pct >= GATE_SHARE * 100 ? 0 : 1);
    }
    rect(0, 132, W, 12, 3);
    text(city().name, 3, 136, 0);
    const rs = S.world.rescues;
    if (rs.length) {
      const r = `SAVED ${rs.filter((x) => x.freed).length}/${rs.length}`;
      text(r, W - 3 - textW(r), 136, 1);
    }
  }

  function drawWorld() {
    drawSky();
    for (const bd of S.world.buildings) { const x = sx(bd.x); if (x + bd.w > -4 && x < W + 4) drawBuilding(bd); }
    drawGate();
    for (const r of S.world.rescues) drawRescue(r);
    for (const p of S.props) drawProp(p);
    drawBoss();
    for (const e of S.enemies) drawEnemy(e);
    drawBoulder();
    for (const s of S.shots) drawShot(s);
    drawFx();
    drawHud();
  }

  function drawMenu(items, y) {
    const w = 104, x = (W - w) / 2;
    rect(x - 1, y - 4, w + 2, items.length * 10 + 6, 0);
    rect(x, y - 3, w, items.length * 10 + 4, 3);
    items.forEach((item, i) => {
      const on = i === S.sel;
      if (on) rect(x + 2, y - 1 + i * 10, w - 4, 8, 0);
      ctext(on ? `> ${item} <` : item, y + 1 + i * 10, on ? 3 : 1);
    });
  }

  function drawTitle() {
    S.cam = (S.t * 12) % 400;
    S.world = S.world || layoutCity(0);
    drawSky();
    rect(0, 0, W, 12, 3);
    ctext("CAMBO INDUSTRIES PRESENTS", 4, 1);
    banner(["BOULDER", "SMASH"], 16, 2);
    // Boulder flexing.
    const flex = Math.floor(S.t * 2) % 2;
    const x = 80, y = 104;
    arm(x - 10, y - 26, x + (flex ? -16 : -14), y + (flex ? -40 : -10), 2, true);
    sprite(BODY, x, y, false, BOULDER, 2);
    arm(x + 10, y - 26, x + (flex ? 16 : 14), y + (flex ? -40 : -10), 2, true);
    const locked = cityIx >= unlocked;
    rect(8, 110, W - 16, 9, 3);
    ctext(`${cityIx > 0 ? "<" : " "} ${cityIx + 1} ${city().name}${locked ? " *" : ""} ${cityIx < CITIES.length - 1 ? ">" : " "}`, 112, locked ? 1 : 0);
    rect(0, 124, W, 20, 3);
    if (locked) ctext(`BEAT CITY ${cityIx} TO UNLOCK`, 127, 1);
    else if (Math.floor(S.t * 2) % 2) ctext("PRESS START", 127, 0);
    ctext("UP JUMP  A SMASH  B GRAB/THROW", 136, 1);
    if (best) { rect(4, 52, 52, 9, 3); text(`BEST ${best}`, 6, 54, 0); }
  }

  function drawIntro() {
    drawWorld();
    banner([`CITY ${cityIx + 1}`, city().name, "", ...city().tip], 30);
  }

  function drawFinal() {
    drawSky();
    const r = S.result;
    banner([r.champs ? "HERO!" : r.won ? "CITY SAVED!" : "OUCH!"], 14, 2);
    const lines = [`SCORE ${S.score}`, `BEST ${best}`];
    if (r.newCity) lines.push("", "NEW CITY:", r.newCity);
    else if (r.champs) lines.push("", "YOU SAVED EVERY CITY!");
    else if (!r.won) lines.push("", "BOULDER NEEDS A NAP.");
    banner(lines, 38);
    drawMenu(S.menu, 128 - S.menu.length * 10);
  }

  function drawHelp() {
    // The move list, on the pause screen where there's time to read it.
    rect(4, 106, W - 8, 24, 3);
    ctext("JUMP + A: LEAP UP HIGH", 108, 0);
    ctext("JUMP + DOWN + A: SLAM", 115, 0);
    ctext("LEAP, THEN DOWN + A: SUPER!", 122, 1);
  }

  function draw() {
    if (S.phase === "title") return drawTitle();
    if (S.phase === "final") return drawFinal();
    if (S.phase === "intro") return drawIntro();
    drawWorld();
    if (S.phase === "down") banner(["OOF!"], 50, 2);
    if (S.toast) banner(S.toast.lines, 40, S.toast.s);
    if (S.paused) {
      banner(["PAUSED"], 22, 2);
      drawMenu(PAUSE_ITEMS, 52);
      ctext("A CHOOSE  B BACK", 90, 3);
      drawHelp();
    }
  }

  return {
    update,
    draw,
    suspend() { if (S.phase === "play" || S.phase === "boss") setPaused(true); },
    dispose() { snd.dispose(); },
  };
}

/** The label on the cartridge. */
export function cover(lcd) {
  const { rect, sprite, banner, ctext, line } = lcd;
  rect(0, 0, W, H, 0);
  for (let i = 0; i < 7; i++) rect(4 + i * 23, GROUND - 30 - ((i * 37) % 5) * 7, 18, 30 + ((i * 37) % 5) * 7, 1);
  rect(0, GROUND, W, 24, 2);
  rect(0, GROUND, W, 1, 3);
  banner(["BOULDER", "SMASH"], 14, 2);
  const x = 80, y = GROUND - 2;
  const arm = (x0, y0, x1, y1) => {
    for (let k = -2; k <= 2; k++) line(x0 + k, y0, x1 + k, y1, 3);
    line(x0, y0, x1, y1, 2);
    rect(x1 - 5, y1 - 5, 10, 10, 3); rect(x1 - 3, y1 - 3, 6, 6, 2);
  };
  arm(x - 10, y - 26, x - 16, y - 40);
  sprite(BODY, x, y, false, BOULDER, 2);
  arm(x + 10, y - 26, x + 16, y - 40);
  rect(0, 128, W, 16, 3);
  ctext("SMASH THE CITY!", 133, 0);
}
