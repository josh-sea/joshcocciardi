/* Controls for every marine on this computer.
 *
 *   solo   WASD or arrows to move, mouse to aim, click or Space to fire,
 *          Q / E or the wheel or 1-5 to change weapon
 *   left   (two on one keyboard) WASD, Space or F fire, Left Shift holds
 *          your aim (strafe), Q / E weapon
 *   right  arrows, Enter or / fire, Right Shift or . holds aim, , weapon
 *   pad    left stick moves, right stick aims, either trigger or A fires,
 *          bumpers or Y change weapon
 *   touch  (phones and tablets) a thumb on the left half moves, a thumb on
 *          the right half aims and fires while it's down, the Swap button
 *          changes weapon. Each stick appears wherever the thumb lands.
 *
 * Keyboard marines without a mouse aim where they walk; the game nudges
 * that aim onto the nearest bug so eight directions are enough.
 */

const SCHEMES = {
  solo:  { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], fire: ['Space'], hold: [], prev: ['KeyQ'], next: ['KeyE'], digits: true, mouse: true },
  left:  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space', 'KeyF'], hold: ['ShiftLeft'], prev: ['KeyQ'], next: ['KeyE'], digits: true },
  right: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'NumpadEnter', 'Slash', 'Numpad0'], hold: ['ShiftRight', 'Period'], prev: [], next: ['Comma', 'Quote'] },
};

export const SCHEME_HELP = {
  solo: 'WASD move · mouse aim · click fire · Q/E weapon',
  left: 'WASD move · Space fire · L-Shift hold aim · Q/E weapon',
  right: 'Arrows move · Enter or / fire · R-Shift hold aim · , weapon',
  pad: 'Gamepad: sticks move and aim · trigger fire · bumpers weapon',
  touch: 'Left thumb moves · right thumb aims and fires · Swap changes weapon',
};

// Phones and tablets: a coarse pointer and no fine one.
export const TOUCH = typeof matchMedia === 'function'
  && matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

// On a touch device the first marine is the screen and the rest are gamepads.
export function schemesFor(n, touch = TOUCH) {
  if (touch) return ['touch', 'pad', 'pad', 'pad'].slice(0, n);
  return n === 1 ? ['solo'] : ['left', 'right', 'pad', 'pad'].slice(0, n);
}
export const padFor = (i, n, touch = TOUCH) => (touch ? i - 1 : n <= 2 ? i : i >= 2 ? i - 2 : -1);

const STICK_R = 56; // px of thumb travel for full speed

export function createInput(target, touchLayer) {
  const down = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  let wheel = 0;
  const edges = new Map(); // seat -> previous buttons, for presses

  const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote']);
  addEventListener('keydown', e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    down.add(e.code);
    if (block.has(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); mouse.down = false; });
  target.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; });
  target.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; mouse.seen = true; });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  target.addEventListener('wheel', e => { wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  target.addEventListener('contextmenu', e => e.preventDefault());

  // Touch: two floating sticks and a swap button.
  const sticks = { L: null, R: null };
  let swaps = 0;
  if (touchLayer) {
    const el = { L: touchLayer.querySelector('#stL'), R: touchLayer.querySelector('#stR') };
    const draw = side => {
      const s = sticks[side], e = el[side];
      e.classList.toggle('on', !!s);
      if (!s) { e.style.transform = ''; e.firstElementChild.style.transform = ''; return; }
      e.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
      e.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const start = e => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('button')) continue;
        const side = t.clientX < innerWidth / 2 ? 'L' : 'R';
        if (sticks[side]) continue;
        sticks[side] = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        draw(side);
      }
      if (e.cancelable) e.preventDefault();
    };
    const move = e => {
      for (const t of e.changedTouches) for (const side of ['L', 'R']) {
        const s = sticks[side];
        if (!s || s.id !== t.identifier) continue;
        s.x = t.clientX; s.y = t.clientY;
        // Drag past the rim and the stick follows the thumb.
        const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
        if (d > STICK_R * 1.6) { const k = (d - STICK_R * 1.6) / d; s.ox += dx * k; s.oy += dy * k; }
        draw(side);
      }
      if (e.cancelable) e.preventDefault();
    };
    const stop = e => {
      for (const t of e.changedTouches) for (const side of ['L', 'R']) {
        if (sticks[side] && sticks[side].id === t.identifier) { sticks[side] = null; draw(side); }
      }
    };
    touchLayer.addEventListener('touchstart', start, { passive: false });
    touchLayer.addEventListener('touchmove', move, { passive: false });
    touchLayer.addEventListener('touchend', stop);
    touchLayer.addEventListener('touchcancel', stop);
    const swap = touchLayer.querySelector('#tSwap');
    swap.addEventListener('touchstart', e => { swaps++; e.preventDefault(); e.stopPropagation(); }, { passive: false });
    swap.addEventListener('click', () => { swaps++; });
  }
  const stickVec = s => {
    if (!s) return null;
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
    return { x: dx / Math.max(d, STICK_R), y: dy / Math.max(d, STICK_R), m: Math.min(1, d / STICK_R), a: Math.atan2(dy, dx) };
  };

  const any = codes => codes.some(c => down.has(c));
  const dz = v => (Math.abs(v) < 0.2 ? 0 : v);

  /* What seat `i` (of `n` on this computer) is doing right now:
   * { mx, my, fire, hold, aimAt: {x,y} screen point | null, stick: angle | null,
   *   cycle: -1|0|1, pick: weapon index | null }
   */
  function read(i, n, scheme) {
    const S = SCHEMES[scheme];
    const out = { mx: 0, my: 0, fire: false, hold: false, aimAt: null, stick: null, cycle: 0, pick: null };
    const btn = { prev: false, next: false, digit: -1 };
    if (S) {
      out.mx = (any(S.right) ? 1 : 0) - (any(S.left) ? 1 : 0);
      out.my = (any(S.down) ? 1 : 0) - (any(S.up) ? 1 : 0);
      out.fire = any(S.fire) || (S.mouse && mouse.down);
      out.hold = any(S.hold);
      btn.prev = any(S.prev); btn.next = any(S.next);
      if (S.digits) for (let d = 1; d <= 5; d++) if (down.has('Digit' + d)) btn.digit = d - 1;
      if (S.mouse && mouse.seen) out.aimAt = { x: mouse.x, y: mouse.y };
      if (S.mouse && wheel) { out.cycle = wheel > 0 ? 1 : -1; wheel = 0; }
    }
    if (scheme === 'touch') {
      const l = stickVec(sticks.L), r = stickVec(sticks.R);
      if (l && l.m > 0.15) { out.mx = l.x; out.my = l.y; }
      if (r && r.m > 0.3) { out.stick = r.a; out.fire = true; }
      if (swaps) { out.cycle = 1; swaps = 0; }
    }
    const pi = padFor(i, n);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pi >= 0 ? [...pads].filter(Boolean)[pi] : null;
    if (pad) {
      const ax = dz(pad.axes[0] || 0), ay = dz(pad.axes[1] || 0);
      if (ax || ay) { out.mx = ax; out.my = ay; }
      const b = k => pad.buttons[k] && (pad.buttons[k].pressed || pad.buttons[k].value > 0.4);
      if (b(12)) out.my = -1; if (b(13)) out.my = 1; if (b(14)) out.mx = -1; if (b(15)) out.mx = 1;
      const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.35) { out.stick = Math.atan2(ry, rx); out.aimAt = null; }
      out.fire = out.fire || b(7) || b(6) || b(0);
      btn.prev = btn.prev || b(4); btn.next = btn.next || b(5) || b(3);
    }
    const was = edges.get(i) || {};
    if (btn.next && !was.next) out.cycle = 1;
    if (btn.prev && !was.prev) out.cycle = -1;
    if (btn.digit >= 0 && btn.digit !== was.digit) out.pick = btn.digit;
    edges.set(i, btn);
    return out;
  }

  const padCount = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean).length : 0);
  const clearTouch = () => { sticks.L = sticks.R = null; swaps = 0; };
  return { read, padCount, mouse, clearTouch };
}
