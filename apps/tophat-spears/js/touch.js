/* Touch controls for phones and tablets.
 *
 * Tophat: tap a marine to select it (tap again to drop it), tap the ground
 * to send the selection there. One finger drags the map, two fingers pinch
 * to zoom. "Box" turns the next drag into a selection box. Squad buttons,
 * Patrol and Hold are the same buttons the mouse uses.
 *
 * Spear: left thumb is a floating joystick, right thumb drags to look.
 * Fire, Hop, Jump and Sprint are buttons on the right. Fire also looks while
 * held, so you can track a target with the same thumb.
 *
 * The touch layout switches on for coarse pointers, and on the first touch
 * anywhere, so a laptop with a touchscreen still gets the mouse layout until
 * someone actually touches it.
 */

const STICK_R = 56;
const LOOK_SPEED = 0.0055;

export function initTouch(G) {
  const T = { on: false, move: { f: 0, s: 0 } };
  const $ = s => document.querySelector(s);
  const canvas = G.canvas;

  const ui = document.createElement('div');
  ui.id = 'touchUi';
  ui.innerHTML = `
    <div id="tStick" hidden><i></i></div>
    <div id="tSpear" hidden>
      <button id="tSprint" class="tb sm" type="button">Sprint</button>
      <button id="tJump" class="tb sm" type="button">Jump</button>
      <button id="tHop" class="tb" type="button">Hop</button>
      <button id="tFire" class="tb fire" type="button">Fire</button>
    </div>
    <div id="tTop" hidden>
      <button id="tAll" class="tb sm" type="button">All</button>
      <button id="tBox" class="tb sm" type="button">Box</button>
      <button id="tClear" class="tb sm" type="button">Clear</button>
    </div>
    <div id="tRotate" hidden>Turn your phone sideways for more room.</div>`;
  document.querySelector('#app').appendChild(ui);

  function enable() {
    if (T.on) return;
    T.on = true;
    document.body.classList.add('touch');
    G.onChange();
  }
  if (matchMedia('(pointer: coarse)').matches) enable();
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') enable(); }, { capture: true });

  // ---------- show and hide ----------
  T.sync = ({ playing, tophat, spearActive }) => {
    const show = T.on && playing;
    $('#tSpear').hidden = !(show && spearActive);
    $('#tTop').hidden = !(show && tophat);
    if (!(show && spearActive)) { releaseStick(); $('#tStick').hidden = true; setSprint(false); G.setFire(false); }
    $('#tRotate').hidden = !(show && innerHeight > innerWidth);
    $('#tBox').classList.toggle('on', boxMode);
  };
  addEventListener('resize', () => G.onChange());

  // ---------- shared pointer tracking ----------
  // Every live touch we care about, by pointer id: what it is doing and
  // where it last was.
  const pts = new Map();

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !G.inMatch()) return;
    e.preventDefault();
    if (G.role() === 'tophat') tophatDown(e);
    else if (G.spearActive()) spearDown(e);
  });
  window.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === 'stick') stickMove(p);
    else if (p.kind === 'look' || p.kind === 'fire') G.look(dx * LOOK_SPEED, dy * LOOK_SPEED);
    else tophatMove(p, dx, dy);
  }, { passive: true });
  const up = e => {
    const p = pts.get(e.pointerId); if (!p) return;
    pts.delete(e.pointerId);
    if (p.kind === 'stick') releaseStick();
    else if (p.kind === 'fire') { G.setFire(false); $('#tFire').classList.remove('down'); }
    else if (p.kind !== 'look') tophatUp(p, e.type === 'pointercancel');
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  // ---------- spear ----------
  function spearDown(e) {
    const left = e.clientX < innerWidth * 0.45;
    const hasStick = [...pts.values()].some(p => p.kind === 'stick');
    const kind = left && !hasStick ? 'stick' : 'look';
    const p = { kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, p);
    if (kind === 'stick') {
      const st = $('#tStick');
      st.hidden = false; st.style.left = e.clientX + 'px'; st.style.top = e.clientY + 'px';
      st.firstElementChild.style.transform = 'translate(-50%,-50%)';
    }
  }
  function stickMove(p) {
    let dx = p.x - p.x0, dy = p.y - p.y0;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    $('#tStick').firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const k = Math.hypot(dx, dy) / STICK_R < 0.18 ? 0 : 1 / STICK_R;
    T.move.f = -dy * k; T.move.s = dx * k;
  }
  function releaseStick() {
    T.move.f = 0; T.move.s = 0;
    for (const [id, p] of pts) if (p.kind === 'stick') pts.delete(id);
    $('#tStick').hidden = true;
  }

  const hold = (id, onDown, onUp) => {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); onDown(e); });
    const end = () => { b.classList.remove('down'); onUp && onUp(); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
  };
  // Fire: hold to shoot, and drag the same thumb to keep aiming.
  $('#tFire').addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    G.setFire(true);
    pts.set(e.pointerId, { kind: 'fire', x: e.clientX, y: e.clientY });
    $('#tFire').classList.add('down');
  });

  hold('#tHop', () => G.hop());
  hold('#tJump', () => G.key('Space', true), () => G.key('Space', false));
  let sprint = false;
  function setSprint(v) { sprint = v; G.key('ShiftLeft', v); $('#tSprint').classList.toggle('on', v); }
  $('#tSprint').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setSprint(!sprint); });

  // ---------- tophat ----------
  let boxMode = false;
  const setBox = v => { boxMode = v; $('#tBox').classList.toggle('on', v); };
  $('#tAll').addEventListener('click', () => G.selectAll());
  $('#tClear').addEventListener('click', () => { G.clearSel(); setBox(false); });
  $('#tBox').addEventListener('click', () => setBox(!boxMode));

  let pinch = null;
  function tophatDown(e) {
    const p = { kind: boxMode ? 'box' : 'tap', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, p);
    const two = [...pts.values()].filter(q => q.kind !== 'done');
    if (two.length === 2) {
      // Second finger: whatever the first was doing becomes a pinch.
      two.forEach(q => q.kind = 'pinch');
      G.drawBox(0, 0, 0, 0);
      pinch = { d: dist(two), mid: mid(two), camDist: G.cam.dist };
    }
  }
  function tophatMove(p, dx, dy) {
    if (p.kind === 'tap' && Math.hypot(p.x - p.x0, p.y - p.y0) > 12) p.kind = 'pan';
    if (p.kind === 'pan') G.pan(dx, dy);
    else if (p.kind === 'box') G.drawBox(p.x0, p.y0, p.x, p.y);
    else if (p.kind === 'pinch' && pinch) {
      const two = [...pts.values()].filter(q => q.kind === 'pinch');
      if (two.length < 2) return;
      const d = dist(two), m = mid(two);
      G.zoomTo(pinch.camDist * pinch.d / Math.max(20, d));
      G.pan(m.x - pinch.mid.x, m.y - pinch.mid.y);
      pinch.mid = m;
    }
  }
  function tophatUp(p, cancelled) {
    if (p.kind === 'pinch') {
      // Lifting one finger of a pinch shouldn't turn the other into a tap.
      for (const q of pts.values()) if (q.kind === 'pinch') q.kind = 'done';
      pinch = null; return;
    }
    if (cancelled) { G.drawBox(0, 0, 0, 0); return; }
    if (p.kind === 'tap') G.tap(p.x0, p.y0);
    else if (p.kind === 'box') { G.drawBox(0, 0, 0, 0); G.boxSelect(p.x0, p.y0, p.x, p.y); setBox(false); }
  }
  const dist = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return T;
}
