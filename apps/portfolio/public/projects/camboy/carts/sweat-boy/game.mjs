/**
 * Sweat Boy, cartridge #1 for the Camboy.
 *
 * You're the court mopper. Players scrum under the hoop, drip sweat and run
 * to the far end; mop every puddle before they come back up the floor.
 * Win a game to unlock the next venue.
 */

import {
  W, H, COURT, HOOP, TRIPS, LEVELS, SWIPE, WALK, HUSTLE, GAS, BENCH, LEAVE_TIME, WAVE_START, WAVE_END,
  makeRng, tripSpec, puddleShape, spawnPuddles, wetUnits, mopTime, puddleUnder, swipe, sweep,
  slippedUnits, shotFor, awayPoints, quarterOf, unlockAfter, POWERUPS, rollPowerup, touches,
} from "./rules.mjs";
import { createSound } from "./sound.mjs";

export const meta = {
  id: "sweat-boy",
  title: "SWEAT BOY",
  blurb: "Mop the court before the players come back.",
};

const LEAGUES = ["WOMEN'S", "MEN'S"];
const LANES = [28, 46, 64, 82, 100, 118];

/* ---------- sprites ---------- */

const BOY = [
  "..333..",
  ".33333.",
  ".30003.",
  "..000..",
  ".22222.",
  "2222222",
  "0.222.0",
  "..222..",
  "..3.3..",
  "..3.3..",
  ".33.33.",
];
const BOY_STEP = [...BOY.slice(0, 8), "..3.3..", ".3...3.", "33...33"];
// Fast Kicks: bright sneakers.
const KICKS_FEET = ["..3.3..", "..3.3..", ".00.00."];

const PLAYER = [
  "..333..",
  "..222..",
  "..222..",
  "...2...",
  ".JJJJJ.",
  "2JJJJJ2",
  "2JJJJJ2",
  ".JJJJJ.",
  ".SSSSS.",
  ".S...S.",
  ".2...2.",
  ".2...2.",
  ".3...3.",
  "33...33",
];
const PLAYER_STEP = [...PLAYER.slice(0, 10), "..2.2..", ".2...2.", "3....3.", "3.....3"];
const PONYTAIL = ["..3333.", "..2223.", "..222.3"];
const withTail = (rows) => [...PONYTAIL, ...rows.slice(3)];
const HOME = { J: 0, S: 0 };
const AWAY = { J: 3, S: 3 };

const ICONS = {
  jumbo: [
    "......3",
    ".....3.",
    "....3..",
    "...3...",
    ".333...",
    "30003..",
    ".333...",
  ],
  kicks: [
    ".......",
    ".33....",
    ".303...",
    ".30333.",
    ".300003",
    "3333333",
    ".3.3.3.",
  ],
  timeout: [
    "..333..",
    ".30303.",
    "3000003",
    "3003303",
    "3000003",
    ".30003.",
    "..333..",
  ],
};

/* ---------- the cartridge ---------- */

export function boot(hw) {
  const { lcd, input, haptic } = hw;
  const { px, rect, ellipse, arc, line, text, textW, ctext, banner, sprite } = lcd;
  const { held, pressed, stick } = input;
  const snd = createSound(hw);
  const { sfx, crowd } = snd;
  snd.play("title");

  let rng = makeRng(Date.now());
  let league = hw.load("sweatboy.league", 0);
  let record = hw.load("sweatboy.record", { w: 0, l: 0 });
  let unlocked = Math.max(1, Math.min(LEVELS.length, hw.load("sweatboy.unlocked", 1)));
  let level = Math.min(unlocked - 1, hw.load("sweatboy.level", 0));

  const S = {
    phase: "title",
    t: 0,
    trip: 0,
    home: 0,
    away: 0,
    puddles: [],
    pending: [],
    clock: 0,
    waveX: 0,
    lanes: [],
    boy: null,
    fx: [],
    toast: null,
    blinkAway: 0,
    shot: null,
    paused: false,
    stats: { mopped: 0, slips: 0, spotless: 0 },
    lastTick: 0,
    item: null,      // a power-up waiting on the floor
    power: {},       // the ones you have: { jumbo: true, kicks: true }
    result: null,
  };

  function toast(lines, dur = 1.1, s = 1) { S.toast = { lines: [].concat(lines), t: dur, s }; }
  function setPhase(p) { S.phase = p; S.t = 0; }

  /** Pausing quiets the arena and holds the song's place. */
  function setPaused(p) {
    if (p === S.paused) return;
    S.paused = p;
    if (p) {
      S.song = snd.pause();
      crowd.murmur(false);
    } else {
      if (S.song?.name) snd.play(S.song.name, S.song.at);
      crowd.murmur(true);
    }
  }

  function freshBoy() {
    return { x: BENCH.x, y: BENCH.y, fx: 1, fy: -1, swipe: 0, step: 0, gas: GAS, moving: false };
  }

  function newGame() {
    rng = makeRng(Date.now());
    Object.assign(S, {
      trip: 0, home: 0, away: 0, puddles: [], fx: [], toast: null, shot: null, paused: false,
      stats: { mopped: 0, slips: 0, spotless: 0 }, item: null, power: {}, result: null,
    });
    S.boy = freshBoy();
    S.lanes = LANES.map((y, i) => ({ y, x: -10 - (i % 3) * 6, home: i % 2 === 0, slip: 0, jx: 0, jy: 0 }));
    hw.save("sweatboy.level", level);
    sfx.whistle();
    snd.play("game");
    snd.setTempo(1);
    crowd.murmur(true);
    crowd.cheer(0.25, 1.6);
    toast([`LV${level + 1} ${LEVELS[level].name}`], 1.4);
    setPhase("arrive");
  }

  /** Where the mop head is touching the floor right now. */
  function mopHead() {
    const b = S.boy;
    const reach = S.power.jumbo ? 9 : 7;
    const sway = b.swipe > 0 ? Math.sin((1 - b.swipe / SWIPE) * Math.PI * 2) * (S.power.jumbo ? 4 : 3) : 0;
    const hx = b.x + b.fx * reach + (b.fy !== 0 ? sway : 0);
    const hy = b.y - 2 + b.fy * 4 + (b.fx !== 0 && b.fy === 0 ? sway * 0.6 : 0);
    return { x: Math.round(hx), y: Math.round(hy) };
  }

  const canMove = () => ["scrum", "leave", "mop", "return"].includes(S.phase);
  const canMop = () => ["leave", "mop", "return"].includes(S.phase);

  function grab(kind) {
    const p = POWERUPS[kind];
    sfx.power();
    haptic(25);
    toast(p.label, 1.0);
    if (kind === "timeout") {
      if (S.phase === "mop") S.clock += p.seconds;
      else if (S.phase === "return") S.waveX = Math.max(WAVE_START, S.waveX - p.seconds * tripSpec(S.trip, level).waveSpeed);
      crowd.cheer(0.15, 0.8);
    } else {
      S.power[kind] = true;
    }
  }

  function updateBoy(dt) {
    const b = S.boy;
    if (b.swipe > 0) {
      b.swipe -= dt;
      if (b.swipe <= 0) {
        b.swipe = 0;
        const head = mopHead();
        const jumbo = S.power.jumbo;
        const i = puddleUnder(S.puddles, head.x, head.y, jumbo ? POWERUPS.jumbo.slack : 3);
        if (i >= 0) {
          const p = S.puddles[i];
          const dry = swipe(p, jumbo ? POWERUPS.jumbo.units : 1);
          S.stats.mopped++;
          for (let k = 0; k < (jumbo ? 7 : 4); k++) S.fx.push({ kind: "drop", x: head.x, y: head.y, vx: (rng() - 0.5) * 40, vy: -20 - rng() * 30, t: 0.4 });
          if (dry) {
            sfx.dry();
            haptic(14);
            if (p.max >= 3) crowd.cheer(0.12, 0.7);
            S.fx.push({ kind: "ring", x: p.x, y: p.y, t: 0.35 });
          }
        }
      }
    }
    b.moving = false;
    if (!canMove()) return;

    if (S.item && touches(S.item, b.x, b.y)) {
      const kind = S.item.kind;
      S.item = null;
      grab(kind);
    }

    const wantMop = canMop() && (pressed.has("a") || held.a);
    if (b.swipe <= 0 && wantMop) {
      b.swipe = SWIPE;
      sfx.squeak();
    }
    if (b.swipe > 0) return; // planted while the mop goes back and forth

    // The stick is a direction, not four switches: any angle moves at full speed.
    const dx = stick.x;
    const dy = stick.y;
    if (!dx && !dy) { b.gas = Math.min(GAS, b.gas + dt * 0.5); return; }
    const kicks = S.power.kicks;
    const hustling = held.b && (b.gas > 0 || kicks);
    if (!kicks) b.gas = hustling ? Math.max(0, b.gas - dt) : Math.min(GAS, b.gas + dt * 0.5);
    const sp = (hustling ? HUSTLE : WALK) * (kicks ? POWERUPS.kicks.speed : 1);
    b.x = Math.max(COURT.x0 + 3, Math.min(COURT.x1 - 3, b.x + dx * sp * dt));
    b.y = Math.max(COURT.y0 + 11, Math.min(COURT.y1 - 1, b.y + dy * sp * dt));
    // Face the way the stick mostly points; diagonals mop sideways, which reads better on screen.
    b.fx = Math.abs(dx) > 0.383 ? Math.sign(dx) : 0;
    b.fy = b.fx === 0 ? Math.sign(dy) : 0;
    b.moving = true;
    b.step += dt * (hustling ? 12 : 8);
  }

  function runLanes(targetX, dt, speed) {
    for (const l of S.lanes) {
      l.x += Math.sign(targetX - l.x) * Math.min(Math.abs(targetX - l.x), speed * dt);
    }
  }

  function titleInput() {
    if (pressed.has("select")) { league = 1 - league; hw.save("sweatboy.league", league); sfx.blip(); }
    if (pressed.has("left") && level > 0) { level--; sfx.blip(); }
    if (pressed.has("right") && level < LEVELS.length - 1) { level++; sfx.blip(); }
    if (pressed.has("start") || (S.t > 0.6 && pressed.has("a"))) {
      if (level < unlocked) newGame();
      else { sfx.clank(); haptic(30); }
    }
  }

  function update(dt) {
    if (S.phase === "title") {
      S.t += dt;
      titleInput();
      return;
    }
    if (S.phase === "final") {
      S.t += dt;
      if (S.t > 0.8 && (pressed.has("start") || pressed.has("a"))) newGame();
      if (S.t > 0.8 && pressed.has("b")) { snd.play("title"); setPhase("title"); }
      return;
    }
    if (pressed.has("select")) toast(["SOUND ON", "MUSIC OFF", "SOUND OFF"][snd.cycleMode()], 0.8);
    if (pressed.has("start")) { setPaused(!S.paused); sfx.blip(); }
    if (S.paused) return;

    S.t += dt;
    if (S.toast && (S.toast.t -= dt) <= 0) S.toast = null;
    if (S.blinkAway > 0) S.blinkAway -= dt;
    for (const l of S.lanes) if (l.slip > 0) l.slip -= dt;
    S.fx = S.fx.filter((f) => {
      f.t -= dt;
      if (f.kind === "drop" || f.kind === "word") { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; if (f.kind === "drop") f.vy += 160 * dt; }
      return f.t > 0;
    });
    updateBoy(dt);

    const spec = tripSpec(S.trip, level);
    switch (S.phase) {
      case "arrive": {
        // Opening tip: the teams jog in from midcourt to the key.
        S.lanes.forEach((l, i) => { l.x = Math.min(112 + (i % 3) * 8, l.x + 70 * dt); });
        if (S.t > 1.6) startScrum();
        break;
      }
      case "scrum": {
        // Bodies jostle under the hoop and sweat hits the floor one drop at a time.
        for (const l of S.lanes) {
          l.jx = Math.sin(S.t * 13 + l.y) * 3;
          l.jy = Math.cos(S.t * 11 + l.y * 0.7) * 2;
        }
        const shown = Math.floor((S.t / 1.8) * (S.pending.length + 1));
        while (S.puddles.length < Math.min(shown, S.pending.length)) {
          const p = S.pending[S.puddles.length];
          S.puddles.push(p);
          sfx.plop();
          S.fx.push({ kind: "ring", x: p.x, y: p.y, t: 0.3 });
        }
        if (S.t > 2.0) {
          S.puddles = S.pending;
          S.awayScore = awayPoints(rng, level);
          for (const l of S.lanes) { l.jx = 0; l.jy = 0; }
          setPhase("leave");
        }
        break;
      }
      case "leave": {
        runLanes(-24, dt, 130);
        if (S.t > LEAVE_TIME) {
          S.clock = mopTime(S.trip, S.puddles, level);
          S.lastTick = Math.ceil(S.clock);
          toast("MOP!", 0.7, 2);
          S.item = rollPowerup(S.trip, rng, S.puddles);
          if (S.item) sfx.blip();
          setPhase("mop");
        }
        break;
      }
      case "mop": {
        S.clock -= dt;
        if (S.t > 1.2 && S.awayScore != null) {
          // The other end of the floor: the away team's trip plays out while you mop.
          S.away += S.awayScore;
          S.blinkAway = S.awayScore ? 1.6 : 0;
          S.awayScore = null;
        }
        const sec = Math.ceil(S.clock);
        if (sec < S.lastTick && sec <= 3 && sec > 0) { sfx.tick(); haptic(5); }
        S.lastTick = sec;
        if (S.clock <= 0 || wetUnits(S.puddles) === 0) {
          if (S.awayScore != null) { S.away += S.awayScore; S.awayScore = null; }
          S.clock = 0;
          S.waveX = WAVE_START;
          S.lanes.forEach((l, i) => { l.x = S.waveX - (i % 2) * 4; });
          toast(wetUnits(S.puddles) ? "HERE THEY COME!" : "ALL DRY!", 1.0);
          sfx.whistle();
          if (!wetUnits(S.puddles)) crowd.cheer(0.3, 1.6);
          snd.setTempo(1.12); // the players are coming, so is the beat
          setPhase("return");
        }
        break;
      }
      case "return": {
        // The players come back up the floor as one front.
        S.waveX += spec.waveSpeed * dt * (wetUnits(S.puddles) ? 1 : 2.2);
        S.lanes.forEach((l, i) => { l.x = S.waveX - ((i * 5) % 7); });
        for (const p of sweep(S.puddles, S.waveX)) {
          S.stats.slips++;
          const lane = S.lanes.reduce((a, l) => (Math.abs(l.y - 2 - p.y) < Math.abs(a.y - 2 - p.y) ? l : a));
          lane.slip = 0.7;
          sfx.slip();
          haptic(30);
          crowd.groan(0.22, 0.9);
          S.fx.push({ kind: "word", x: p.x, y: p.y - 14, vy: -14, t: 0.9, word: "SLIP!" });
          if (S.power.kicks) {
            // The sneakers only last until somebody goes down.
            delete S.power.kicks;
            sfx.powerDown();
            toast("KICKS GONE", 0.9);
          }
        }
        // A power-up still on the floor gets trampled.
        if (S.item && S.waveX >= S.item.x) S.item = null;
        if (S.waveX >= WAVE_END) startShot();
        break;
      }
      case "shot": {
        const sh = S.shot;
        if (!sh.done && S.t > sh.dur) {
          sh.done = true;
          if (sh.make) {
            S.home += sh.points;
            sfx.swish();
            haptic(20);
            crowd.cheer(sh.points === 3 ? 0.5 : 0.32, 2.2);
            toast([sh.points === 3 ? "SPLASH! +3" : "BUCKET! +2"], 1.2);
          } else {
            sfx.clank();
            crowd.groan(0.3, 1.2);
            toast("CLANK!", 1.0);
          }
        }
        if (S.t > sh.dur + 1.4) {
          S.trip++;
          // The Jumbo Mop is a one-trip rental.
          if (S.power.jumbo) delete S.power.jumbo;
          if (S.trip >= TRIPS) finish();
          else startScrum();
        }
        break;
      }
    }
  }

  function startScrum() {
    S.puddles = [];
    S.item = null;
    S.pending = spawnPuddles(S.trip, rng, level);
    S.lanes.forEach((l, i) => {
      l.x = 108 + (i % 3) * 11;
      l.y = 40 + i * 13;
      l.slip = 0;
    });
    // The mopper waits on the sideline between trips.
    Object.assign(S.boy, { x: BENCH.x, y: BENCH.y, fx: 1, fy: -1, swipe: 0 });
    snd.setTempo(1);
    if (S.trip % 2 === 0 && S.trip > 0) toast(`QUARTER ${quarterOf(S.trip)}`, 1.2);
    setPhase("scrum");
  }

  function startShot() {
    const slipped = slippedUnits(S.puddles);
    const { points, chance } = shotFor(slipped);
    if (slipped === 0) S.stats.spotless++;
    const make = rng() < chance;
    const shooter = S.lanes.find((l) => l.home && l.slip <= 0) || S.lanes[0];
    const sx = points === 3 ? 100 : 132;
    shooter.x = sx;
    shooter.y = HOOP.y + 6;
    S.shot = { from: { x: sx + 2, y: HOOP.y - 8 }, make, points, chance, dur: points === 3 ? 1.0 : 0.7, done: false };
    S.item = null;
    if (slipped === 0) toast("SPOTLESS! GOING FOR 3", 1.0);
    setPhase("shot");
  }

  function finish() {
    sfx.buzzer();
    const won = S.home > S.away;
    crowd.murmur(false);
    snd.play(won ? "win" : "lose");
    if (won) { crowd.cheer(0.6, 3.5); haptic(40); } else crowd.groan(0.35, 1.6);
    if (S.home !== S.away) record = { w: record.w + (won ? 1 : 0), l: record.l + (won ? 0 : 1) };
    hw.save("sweatboy.record", record);
    const before = unlocked;
    unlocked = unlockAfter(level, won, unlocked);
    hw.save("sweatboy.unlocked", unlocked);
    const played = level;
    // A win lines up the next venue, so START goes straight there.
    if (won && level < LEVELS.length - 1) level++;
    hw.save("sweatboy.level", level);
    S.result = { won, played, newVenue: unlocked > before ? LEVELS[unlocked - 1].name : null, champs: won && played === LEVELS.length - 1 };
    S.paused = false;
    setPhase("final");
  }

  /* ---------- drawing ---------- */

  const insideCourt = (x, y) => x >= COURT.x0 && x <= COURT.x1 && y >= COURT.y0 && y <= COURT.y1;

  function drawCourt() {
    rect(0, 0, W, H, 1);
    // Paint under the hoop.
    rect(116, 57, COURT.x1 - 116, 33, 2);
    rect(117, 58, COURT.x1 - 117, 31, 1);
    for (let y = 60; y < 88; y += 3) for (let x = 119 + (y % 2); x < COURT.x1 - 1; x += 3) px(x, y, 2);
    // Lines.
    rect(COURT.x0, COURT.y0, COURT.x1 - COURT.x0 + 1, 1, 0);
    rect(COURT.x0, COURT.y1, COURT.x1 - COURT.x0 + 1, 1, 0);
    rect(COURT.x0, COURT.y0, 1, COURT.y1 - COURT.y0, 0);
    rect(COURT.x1, COURT.y0, 1, COURT.y1 - COURT.y0, 0);
    arc(COURT.x0, HOOP.y, 14, -Math.PI / 2, Math.PI / 2, 0);
    arc(116, HOOP.y, 15, Math.PI / 2, Math.PI * 1.5, 0);
    // Three-point line: corners run straight, the rest is the arc.
    const r3 = 52;
    arc(HOOP.x, HOOP.y, r3, Math.PI * 0.62, Math.PI * 1.38, 0, (x, y) => insideCourt(x, y) && y > COURT.y0 + 6 && y < COURT.y1 - 6);
    const cy = Math.round(Math.sin(Math.PI * 0.38) * r3);
    const cx = Math.round(HOOP.x + Math.cos(Math.PI * 0.62) * r3);
    rect(cx, COURT.y0 + 6, COURT.x1 - cx, 1, 0);
    rect(cx, COURT.y1 - 6, COURT.x1 - cx, 1, 0);
    if (HOOP.y - cy > COURT.y0 + 6) rect(cx, COURT.y0 + 6, 1, HOOP.y - cy - COURT.y0 - 6, 0);
    if (HOOP.y + cy < COURT.y1 - 6) rect(cx, HOOP.y + cy, 1, COURT.y1 - 6 - HOOP.y - cy, 0);
    // Midcourt logo grows with the venue.
    ellipse(COURT.x0, HOOP.y, 4 + level, 3 + Math.ceil(level / 2), 2, 0);
    // Backboard and rim.
    rect(151, HOOP.y - 10, 2, 21, 3);
    rect(149, HOOP.y - 1, 2, 2, 3);
    ellipse(HOOP.x, HOOP.y, 3, 2, null, 3);
    px(HOOP.x - 1, HOOP.y + 1, 0); px(HOOP.x + 1, HOOP.y + 1, 0); px(HOOP.x, HOOP.y + 2, 0);
  }

  function drawPuddles() {
    const t = performance.now() / 1000;
    for (const p of S.puddles) {
      if (p.units <= 0) continue;
      const { rx, ry } = puddleShape(p.units);
      if (p.locked) {
        ellipse(p.x, p.y, rx, ry, 0, Math.floor(t * 6) % 2 ? 3 : 2);
        continue;
      }
      ellipse(p.x, p.y, rx, ry, 0, 2);
      // A glint that drifts across the water.
      const gx = Math.round(p.x - rx + 2 + ((t * 4 + p.x) % Math.max(1, rx * 2 - 3)));
      px(gx, p.y - Math.max(0, ry - 2), 1);
      if (p.units > 1) px(p.x + Math.round(rx / 2), p.y + 1, 1);
      // Pips under the bigger puddles show how many swipes are left.
      if (p.units > 1) for (let k = 0; k < p.units; k++) px(p.x - p.units + 1 + k * 2, p.y + ry + 2, 3);
    }
  }

  function drawItem() {
    const it = S.item;
    if (!it) return;
    const t = performance.now() / 1000;
    const bob = Math.round(Math.sin(t * 5) * 1.5);
    const x = it.x - 5, y = it.y - 12 + bob;
    rect(x, y, 11, 11, Math.floor(t * 4) % 2 ? 3 : 2);
    rect(x + 1, y + 1, 9, 9, 0);
    sprite(ICONS[it.kind], it.x, y + 9);
  }

  function drawPlayer(l, frame) {
    const base = frame ? PLAYER_STEP : PLAYER;
    const rows = league === 0 ? withTail(base) : base;
    const map = l.home ? HOME : AWAY;
    const x = Math.round(l.x + (l.jx || 0));
    const y = Math.round(l.y + (l.jy || 0));
    if (l.slip > 0) {
      // Feet out, flat on the floor.
      rect(x - 7, y - 3, 14, 3, map.J === 0 ? 0 : 3);
      rect(x - 7, y - 3, 14, 1, 3);
      rect(x + 5, y - 4, 3, 4, 2);
      rect(x - 9, y - 3, 2, 2, 3);
      return;
    }
    sprite(rows, x, y, false, map);
  }

  function drawBoy() {
    const b = S.boy;
    const head = mopHead();
    const stepping = b.moving && Math.floor(b.step) % 2;
    let frame = stepping ? BOY_STEP : BOY;
    if (S.power.kicks) frame = stepping ? [...BOY_STEP.slice(0, 10), "00...00"] : [...BOY.slice(0, 8), ...KICKS_FEET];
    const flip = b.fx < 0;
    const handX = b.x + (b.fx || (flip ? -1 : 1)) * 3;
    const handY = b.y - 6;
    const drawMop = () => {
      // Handle from hand to head, then the big round mop head on the floor.
      line(handX, handY, head.x, head.y, 3);
      if (S.power.jumbo) {
        ellipse(head.x, head.y, 5, 3, 2, 3);
        px(head.x - 2, head.y - 1, 1); px(head.x + 1, head.y, 1);
      } else {
        ellipse(head.x, head.y, 3, 2, 2, 3);
        px(head.x - 1, head.y - 1, 1);
      }
    };
    if (b.fy < 0) drawMop();
    sprite(frame, Math.round(b.x), Math.round(b.y), flip);
    if (b.fy >= 0) drawMop();
    // Fast Kicks leave a little dust behind.
    if (S.power.kicks && b.moving && Math.floor(b.step * 2) % 2) px(Math.round(b.x - b.fx * 5), Math.round(b.y), 0);
  }

  function drawFx() {
    for (const f of S.fx) {
      if (f.kind === "drop") px(f.x, f.y, 0);
      if (f.kind === "ring") ellipse(Math.round(f.x), Math.round(f.y), Math.round(10 - f.t * 18), Math.round(6 - f.t * 10), null, 0);
      if (f.kind === "word") { rect(f.x - 11, f.y - 1, 22, 7, 3); ctext(f.word, Math.round(f.y), 0, 1, f.x); }
    }
  }

  function drawBall() {
    const sh = S.shot;
    if (!sh || S.phase !== "shot") return;
    const k = Math.min(1, S.t / sh.dur);
    let x, y;
    if (!sh.done || sh.make) {
      x = sh.from.x + (HOOP.x - sh.from.x) * k;
      y = sh.from.y + (HOOP.y - 2 - sh.from.y) * k - Math.sin(k * Math.PI) * (sh.points === 3 ? 26 : 14);
      if (sh.done) { x = HOOP.x; y = HOOP.y + Math.min(8, (S.t - sh.dur) * 20); }
    } else {
      // Off the rim and out.
      const e = S.t - sh.dur;
      x = HOOP.x - e * 40;
      y = HOOP.y - 4 - Math.sin(Math.min(1, e * 1.6) * Math.PI) * 12 + e * 10;
    }
    ellipse(Math.round(x), Math.round(y), 2, 2, 2, 3);
    px(Math.round(x) - 1, Math.round(y) - 1, 0);
  }

  function drawHud() {
    rect(0, 0, W, 12, 3);
    text(`HOME ${String(S.home).padStart(2, " ")}`, 3, 4, 0);
    const awayStr = `AWAY ${String(S.away).padStart(2, " ")}`;
    if (!(S.blinkAway > 0 && Math.floor(S.blinkAway * 6) % 2)) text(awayStr, W - 3 - textW(awayStr), 4, 0);
    ctext(`Q${quarterOf(Math.min(S.trip, TRIPS - 1))}`, 4, 1);

    rect(0, 132, W, 12, 3);
    const wet = wetUnits(S.puddles);
    if (S.phase === "mop") {
      const c = Math.max(0, S.clock).toFixed(1);
      text(`BACK IN ${c}`, 3, 136, S.clock < 3 && Math.floor(S.clock * 4) % 2 ? 1 : 0);
      const r = `WET ${wet}`;
      text(r, W - 3 - textW(r), 136, 0);
    } else if (S.phase === "return") {
      const slipped = slippedUnits(S.puddles);
      text(`SLIPS ${slipped}`, 3, 136, 0);
      const r = wet + slipped === 0 ? "FOR 3!" : `SHOT ${Math.round(shotFor(slipped).chance * 100)}%`;
      text(r, W - 3 - textW(r), 136, 0);
    } else if (S.phase === "arrive") {
      text(`LV${level + 1} ${LEVELS[level].name}`, 3, 136, 0);
    } else {
      text(`TRIP ${Math.min(S.trip + 1, TRIPS)}/${TRIPS}`, 3, 136, 0);
      const r = S.phase === "scrum" ? "SCRUM!" : S.phase === "leave" ? "GET READY" : "";
      if (r) text(r, W - 3 - textW(r), 136, 0);
    }
    if (["scrum", "leave", "mop", "return"].includes(S.phase)) {
      // Hustle gas: a little meter in the middle of the bottom bar. Fast Kicks keep it full.
      rect(62, 136, 20, 5, 2);
      const full = S.power.kicks ? 18 : Math.round((S.boy.gas / GAS) * 18);
      rect(63, 137, full, 3, S.boy.gas < 0.3 && !S.power.kicks ? 1 : 0);
      // Power-ups you're carrying, next to the meter.
      let ix = 90;
      for (const k of ["jumbo", "kicks"]) {
        if (!S.power[k]) continue;
        rect(ix - 1, 133, 9, 10, 0);
        sprite(ICONS[k], ix + 3, 142);
        ix += 11;
      }
    }
  }

  function drawMopper(x, y, s, t) {
    const sway = Math.round(Math.sin(t * 18) * 6);
    line(x + 4, y - 18, x + 26 + sway, y - 6, 3);
    ellipse(x + 26 + sway, y - 6, 6, 3, 2, 3);
    sprite(BOY, x, y, false, null, s);
  }

  function drawTitle() {
    drawCourt();
    rect(0, 0, W, 12, 3);
    ctext(`${LEAGUES[league]} PRO NIGHT`, 4, 0);
    banner(["SWEAT BOY"], 18, 2);
    const t = performance.now() / 1000;
    // A mopper scrubbing a puddle, on loop.
    const k = (t % 1.4) / 1.4;
    const units = 3 - Math.floor(k * 3);
    const { rx, ry } = puddleShape(Math.max(1, units));
    ellipse(92, 72, rx * 2, ry * 2, 0, 2);
    drawMopper(64, 78, 2, t);
    const locked = level >= unlocked;
    if (locked) ctext(`WIN LV${level} TO UNLOCK`, 86, 3);
    else if (Math.floor(t * 2) % 2) ctext("PRESS START", 86, 0);
    rect(18, 95, W - 36, 9, 3);
    ctext(`${level > 0 ? "<" : " "} LV${level + 1} ${LEVELS[level].name}${locked ? " *" : ""} ${level < LEVELS.length - 1 ? ">" : " "}`, 97, locked ? 1 : 0);
    rect(0, 108, W, 36, 3);
    ctext(`SELECT  ${LEAGUES[league]} / ${LEAGUES[1 - league]}`, 111, 0);
    ctext("D-PAD MOVE  A MOP  B HUSTLE", 120, 1);
    ctext("GRAB POWER-UPS ON THE FLOOR", 128, 1);
    ctext(`RECORD ${record.w}-${record.l}  VENUES ${unlocked}/${LEVELS.length}`, 136, 0);
  }

  function drawFinal() {
    drawCourt();
    const r = S.result;
    const tie = S.home === S.away;
    banner([r.champs ? "CHAMPIONS!" : "FINAL"], 12, 2);
    const lines = [
      `HOME ${S.home}  -  AWAY ${S.away}`,
      tie ? "A TIE. SO CLOSE." : r.won ? "YOU WIN! GREAT MOPPING" : "TOUGH LOSS",
      `SLIPS ${S.stats.slips}  SPOTLESS ${S.stats.spotless}/${TRIPS}`,
    ];
    if (r.newVenue) lines.push("", "NEW VENUE UNLOCKED:", r.newVenue);
    else if (r.champs) lines.push("", "YOU MOPPED THE FINALS!");
    else if (!r.won) lines.push("", "TRY AGAIN!");
    banner(lines, 36);
    if (Math.floor(S.t * 2) % 2) ctext(r.won && !r.champs ? "START: NEXT VENUE" : "START: PLAY AGAIN", 118, 0);
    ctext("B: TITLE", 128, 3);
  }

  function draw() {
    if (S.phase === "title") return drawTitle();
    if (S.phase === "final") return drawFinal();
    drawCourt();
    drawPuddles();
    drawItem();
    const frame = Math.floor(performance.now() / 120) % 2;
    const running = ["arrive", "leave", "return"].includes(S.phase);
    // Draw back to front so lower bodies overlap higher ones.
    const bodies = [...S.lanes.map((l) => ({ y: l.y, draw: () => drawPlayer(l, running && frame) })),
                    { y: S.boy.y, draw: drawBoy }];
    bodies.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    drawBall();
    drawFx();
    drawHud();
    if (S.toast) banner(S.toast.lines, 54, S.toast.s);
    if (S.paused) banner(["PAUSED", "START TO PLAY"], 56);
  }

  return {
    update,
    draw,
    suspend() { if (!["title", "final"].includes(S.phase)) setPaused(true); },
    dispose() { snd.dispose(); },
  };
}

/** The label on the cartridge: a still of the title screen. */
export function cover(lcd) {
  const { rect, ellipse, sprite, banner, ctext, line, arc } = lcd;
  rect(0, 0, W, H, 1);
  rect(116, 57, 36, 33, 2);
  rect(117, 58, 35, 31, 1);
  rect(8, 16, 145, 1, 0);
  rect(8, 130, 145, 1, 0);
  arc(HOOP.x, HOOP.y, 52, Math.PI * 0.62, Math.PI * 1.38, 0);
  rect(151, HOOP.y - 10, 2, 21, 3);
  banner(["SWEAT BOY"], 18, 2);
  ellipse(94, 84, 12, 5, 0, 2);
  ellipse(122, 104, 6, 3, 0, 2);
  ellipse(40, 100, 4, 2, 0, 2);
  line(68, 66, 92, 80, 3);
  ellipse(92, 80, 6, 3, 2, 3);
  sprite(BOY, 64, 96, false, null, 2);
  rect(0, 116, W, 28, 3);
  ctext("MOP IT BEFORE THEY'RE BACK", 126, 0);
}
