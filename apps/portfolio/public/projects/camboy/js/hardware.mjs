/**
 * Camboy: the hardware. One screen, one set of controls, two wheels and a
 * speaker, shared by every cartridge.
 *
 * A cartridge is a module with a `boot(hw)` that returns
 * { update(dt), draw(), suspend?(), dispose?() }. The hardware runs the
 * frame loop, owns input, audio and storage, and pulls the cartridge out
 * again when the power switch goes off.
 */

import { W, H, makeLcd } from "./lcd.mjs";

/* ---------- storage ---------- */

/** Saved values live under "camboy.". Older Sweat Boy saves are read once from their old keys. */
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`camboy.${key}`) ?? localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(`camboy.${key}`, JSON.stringify(value)); } catch { /* private window: memory only */ }
}

/* ---------- stick math ---------- */

/**
 * Turn a touch point into a stick direction. (dx, dy) is the offset from
 * the D-pad's center in pad radii. Inside the dead zone it reads as
 * centered; anywhere else, however far off the pad, it reads as a full
 * push in that direction, so a thumb that drifts never stalls.
 */
export function stickFrom(dx, dy, dead = 0.2) {
  const m = Math.hypot(dx, dy);
  if (m < dead) return { x: 0, y: 0 };
  return { x: dx / m, y: dy / m };
}

/** Eight-way D-pad directions from a stick, 45 degree slices. */
export function dirsFrom(stick, edge = 0.383) {
  return {
    up: stick.y < -edge, down: stick.y > edge,
    left: stick.x < -edge, right: stick.x > edge,
  };
}

/* ---------- the hardware ---------- */

export function createHardware(root = document) {
  const cv = root.getElementById("lcd");
  const g = cv.getContext("2d");
  const lcd = makeLcd(g);
  const dpad = root.getElementById("dpad");
  const zone = root.getElementById("padzone");
  const led = root.getElementById("led");

  /* ---- haptics ---- */

  // Phones that support the Vibration API get a buzz. iPhones don't, but
  // Safari 18 taps the Taptic Engine when a switch control flips, so a
  // hidden one gets flipped instead.
  const hapt = document.createElement("label");
  hapt.setAttribute("aria-hidden", "true");
  hapt.style.cssText = "position:fixed;left:-200px;top:0;opacity:0;pointer-events:none";
  hapt.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.append(hapt);
  let lastBuzz = 0;
  let haptics = load("haptics", true);
  function haptic(ms = 8) {
    if (!haptics) return;
    const now = performance.now();
    if (now - lastBuzz < 35) return;
    lastBuzz = now;
    if (navigator.vibrate) navigator.vibrate(ms);
    else hapt.click();
  }

  /* ---- audio ---- */

  let ac = null;
  let out = null;
  let volume = load("volume", 0.7);
  let audioSubs = []; // the inserted cartridge's, waiting for the first tap
  function unlock() {
    if (!ac) {
      try {
        // Lets iPhones play sound with the ringer switch on silent.
        if (navigator.audioSession) navigator.audioSession.type = "playback";
        ac = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return; }
      // A limiter at the end, so a buzzer-beater cheer on top of the music never clips.
      const limit = ac.createDynamicsCompressor();
      limit.threshold.value = -10;
      limit.ratio.value = 12;
      limit.attack.value = 0.003;
      limit.release.value = 0.25;
      limit.connect(ac.destination);
      out = ac.createGain();
      out.gain.value = volume ** 1.6;
      out.connect(limit);
      audioSubs.forEach((fn) => fn(ac, out));
    }
    if (ac.state === "suspended") ac.resume();
  }
  function tone(f, dur, { type = "square", vol = 0.08, at = 0, to = null } = {}) {
    if (!ac) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const v = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    v.gain.setValueAtTime(vol, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const chime = () => { tone(988, 0.09, { vol: 0.09 }); tone(1319, 0.7, { vol: 0.09, at: 0.09 }); };
  const clunk = () => { tone(140, 0.08, { type: "triangle", vol: 0.3, to: 60 }); tone(900, 0.02, { vol: 0.04 }); };
  const click = () => tone(2400, 0.012, { vol: 0.03 });

  /* ---- input ---- */

  const held = { up: false, down: false, left: false, right: false, a: false, b: false, start: false, select: false };
  const pressed = new Set();
  const stick = { x: 0, y: 0 };
  let touchStick = null;
  const keyDirs = { up: false, down: false, left: false, right: false };

  function setKey(k, on) {
    if (on && !held[k]) pressed.add(k);
    held[k] = on;
  }

  /** The stick is the touch zone while a thumb is down, the keyboard otherwise. */
  let lastDirs = "";
  function refreshStick() {
    let s = touchStick;
    if (!s) {
      const x = (keyDirs.right ? 1 : 0) - (keyDirs.left ? 1 : 0);
      const y = (keyDirs.down ? 1 : 0) - (keyDirs.up ? 1 : 0);
      s = stickFrom(x, y, 0.1);
    }
    stick.x = s.x;
    stick.y = s.y;
    const dirs = dirsFrom(stick);
    for (const k of ["up", "down", "left", "right"]) setKey(k, dirs[k]);
    const names = Object.keys(dirs).filter((k) => dirs[k]).join(" ");
    if (names && names !== lastDirs && touchStick) haptic(6);
    lastDirs = names;
    if (dpad) dpad.dataset.dir = names;
  }

  const KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right", KeyZ: "a", Space: "a", KeyJ: "a", KeyX: "b", KeyK: "b",
    ShiftLeft: "b", ShiftRight: "b", Enter: "start", KeyP: "start", KeyM: "select", Backspace: "select",
  };
  addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (!k || !running) return;
    e.preventDefault();
    unlock();
    if (e.repeat) return;
    if (k in keyDirs) { keyDirs[k] = true; refreshStick(); } else setKey(k, true);
  });
  addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    if (k in keyDirs) { keyDirs[k] = false; refreshStick(); } else setKey(k, false);
  });
  addEventListener("blur", () => {
    Object.keys(held).forEach((k) => (held[k] = false));
    Object.keys(keyDirs).forEach((k) => (keyDirs[k] = false));
    touchStick = null;
    refreshStick();
  });

  root.querySelectorAll("[data-key]").forEach((el) => {
    const k = el.dataset.key;
    const up = () => { setKey(k, false); el.classList.remove("down"); };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlock();
      el.setPointerCapture?.(e.pointerId);
      setKey(k, true);
      el.classList.add("down");
      haptic(10);
    });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  // Under the D-pad is a joystick. The whole left side of the controls
  // listens, and the direction is the angle from the pad's center, so a
  // thumb that slides past the edge keeps going the way it points.
  let stickPointer = null;
  function readZone(e) {
    const r = dpad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    touchStick = stickFrom(dx, dy);
    refreshStick();
  }
  function releaseZone(e) {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    touchStick = null;
    refreshStick();
  }
  if (zone) {
    zone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlock();
      if (stickPointer != null) return; // one thumb drives
      stickPointer = e.pointerId;
      zone.setPointerCapture?.(e.pointerId);
      readZone(e);
    });
    zone.addEventListener("pointermove", (e) => { if (e.pointerId === stickPointer) readZone(e); });
    zone.addEventListener("pointerup", releaseZone);
    zone.addEventListener("pointercancel", releaseZone);
    zone.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /* ---- wheels: contrast on the left, volume on the right ---- */

  let contrast = load("contrast", 0.5);
  function applyContrast() {
    // At the middle the screen looks exactly as drawn; up is darker and punchier, down washes out.
    cv.style.filter = `brightness(${(1.3 - 0.6 * contrast).toFixed(3)}) contrast(${(0.7 + 0.6 * contrast).toFixed(3)})`;
  }
  applyContrast();
  function setWheel(name, v) {
    v = Math.max(0, Math.min(1, v));
    if (name === "contrast") { contrast = v; applyContrast(); save("contrast", v); }
    else {
      volume = v;
      if (out) out.gain.setTargetAtTime(v ** 1.6, ac.currentTime, 0.02);
      save("volume", v);
    }
    return v;
  }
  root.querySelectorAll(".wheel").forEach((el) => {
    const name = el.dataset.wheel;
    let value = name === "contrast" ? contrast : volume;
    const STEP = 1 / 12;
    const paint = () => {
      el.style.setProperty("--turn", `${(value * 120).toFixed(1)}px`);
      el.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    };
    paint();
    let from = null;
    const nudge = (delta) => {
      const before = Math.round(value / STEP);
      value = setWheel(name, value + delta);
      if (Math.round(value / STEP) !== before) { haptic(4); click(); }
      paint();
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      unlock();
      el.setPointerCapture?.(e.pointerId);
      from = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointermove", (e) => {
      if (!from) return;
      // Drag along the wheel's long side; up or right turns it up.
      const r = el.getBoundingClientRect();
      const along = r.height >= r.width ? from.y - e.clientY : e.clientX - from.x;
      from = { x: e.clientX, y: e.clientY };
      nudge(along / 140);
    });
    const end = () => { from = null; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => { e.preventDefault(); nudge(-e.deltaY / 600); }, { passive: false });
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); nudge(STEP); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); nudge(-STEP); }
    });
  });

  /* ---- no zooming the toy ---- */

  // iOS Safari ignores user-scalable=no, so quick double taps on the buttons
  // would zoom the page. Swallow the touch defaults on the controls (the
  // pointer handlers above still fire), and stop double-tap and pinch zoom
  // anywhere else on the page except links.
  root.querySelectorAll("[data-key], #padzone, #lcd, .wheel, .power-switch").forEach((el) => {
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    unlock(); // iOS unlocks sound on touchend, not pointerdown
    if (e.timeStamp - lastTouchEnd < 400 && !e.target.closest("a, .cart, .book button")) e.preventDefault();
    lastTouchEnd = e.timeStamp;
  }, { passive: false });
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault());
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault());

  /* ---- power, boot and the frame loop ---- */

  let running = false;
  let state = "off"; // off, boot, on
  let bootT = 0;
  let cart = null;
  let game = null;

  function drawOff() {
    g.fillStyle = "#9aa781";
    g.fillRect(0, 0, W, H);
  }

  /** The Cambo logo scrolls down, lands with a chime, then the cartridge starts. */
  function drawBoot(t) {
    lcd.rect(0, 0, W, H, 0);
    const y = Math.min(54, -16 + t * 60);
    lcd.ctext("CAMBO", Math.round(y), 3, 3);
    if (y >= 54) {
      lcd.ctext("INDUSTRIES", 76, 2);
      if (t > 1.9) lcd.ctext(cart.meta.title, 100, 2);
    }
  }

  function startGame() {
    // Each cartridge gets its own audio subscription, dropped when it comes out.
    audioSubs = [];
    game = cart.boot({
      lcd, W, H, haptic, load, save,
      input: { held, pressed, stick },
      onAudio(fn) { audioSubs.push(fn); if (ac) fn(ac, out); },
    });
    state = "on";
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === "off") drawOff();
    else if (state === "boot") {
      const before = bootT;
      bootT += dt;
      if (before < 1.17 && bootT >= 1.17) chime();
      drawBoot(bootT);
      if (bootT > 2.6) startGame();
    } else if (state === "on" && game) {
      game.update(dt);
      game.draw();
    }
    pressed.clear();
    if (running) requestAnimationFrame(frame);
  }

  function powerOn(c) {
    cart = c;
    bootT = 0;
    state = "boot";
    led?.classList.add("on");
    unlock();
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function powerOff() {
    game?.dispose?.();
    audioSubs = [];
    game = null;
    cart = null;
    state = "off";
    led?.classList.remove("on");
    drawOff();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game?.suspend?.();
  });

  drawOff();

  return {
    lcd, haptic, unlock, chime, clunk, click, powerOn, powerOff, load, save,
    get state() { return state; },
    get cart() { return cart; },
    setHaptics(on) { haptics = on; save("haptics", on); },
  };
}
