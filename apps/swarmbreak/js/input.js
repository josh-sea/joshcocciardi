/* Controls for every marine on this computer.
 *
 *   solo   WASD or arrows to move, mouse to aim, click or Space to fire,
 *          Q / E or the wheel or 1-5 to change weapon
 *   left   (two on one keyboard) WASD, Space or F fire, Left Shift holds
 *          your aim (strafe), Q / E weapon
 *   right  arrows, Enter or / fire, Right Shift or . holds aim, , weapon
 *   pad    left stick moves, right stick aims, either trigger or A fires,
 *          bumpers or Y change weapon
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
};

export function schemesFor(n) { return n === 1 ? ['solo'] : ['left', 'right', 'pad', 'pad'].slice(0, n); }
export const padFor = (i, n) => (n <= 2 ? i : i >= 2 ? i - 2 : -1);

export function createInput(target) {
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
  return { read, padCount, mouse };
}
