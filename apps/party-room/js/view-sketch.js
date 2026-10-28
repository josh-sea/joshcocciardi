/* Quick Sketch on screen: the canvas, the drawer's tools and the guesses.
 *
 * Strokes are stored in a 1000-wide grid (750 tall), so a line drawn on a
 * phone lands in the same place on a laptop. The drawer sends a short chunk
 * of the line every 70 ms while the pen is down, each starting from the
 * last point of the one before, so watchers see it appear as it is drawn
 * and the pieces join up.
 */
import { CHOOSE_MS, DRAW_MS, REVEAL_MS } from './sketch.js';
import { esc, sound, buzz } from './ui.js';
import { obj, arr } from './room.js';

export const COLORS = ['#1d1b26', '#e8344e', '#ff8a1f', '#ffd23f', '#2bb673', '#2f80ed', '#8e44ef', '#8b5a2b', '#ffffff'];
export const SIZES = [5, 12, 28];
const W = 1000, H = 750;
const TIERS = ['Easy', 'Medium', 'Hard'];

export function mount(stage, api) {
  stage.innerHTML = `
    <div class="sketch">
      <div class="sk-top"><div class="sk-hint"></div><div class="sk-who"></div></div>
      <div class="tbar sk-bar"></div>
      <div class="sk-wrap"><canvas></canvas><div class="sk-over" hidden></div></div>
      <div class="sk-tools" hidden>
        <div class="sk-colors">${COLORS.map((c, i) => `<button class="sw${i === 0 ? ' on' : ''}" data-color="${i}" style="--c:${c}" aria-label="${i === COLORS.length - 1 ? 'Eraser' : 'Color'}">${i === COLORS.length - 1 ? '🧽' : ''}</button>`).join('')}</div>
        <div class="sk-sizes">${SIZES.map((sz, i) => `<button class="sz${i === 1 ? ' on' : ''}" data-size="${i}"><i style="--d:${6 + i * 6}px"></i></button>`).join('')}
          <button class="btn small" data-undo>Undo</button><button class="btn small" data-clear>Clear</button></div>
      </div>
      <form class="sk-guess" hidden autocomplete="off"><input maxlength="40" placeholder="Type a guess" enterkeyhint="send"><button class="btn pink">Guess</button></form>
      <ul class="sk-feed"></ul>
    </div>`;
  const root = stage.firstElementChild;
  const canvas = root.querySelector('canvas'), cx = canvas.getContext('2d');
  const wrap = root.querySelector('.sk-wrap'), over = root.querySelector('.sk-over');
  const tools = root.querySelector('.sk-tools'), form = root.querySelector('.sk-guess');
  const input = form.querySelector('input'), feed = root.querySelector('.sk-feed');
  const hint = root.querySelector('.sk-hint'), who = root.querySelector('.sk-who'), bar = root.querySelector('.sk-bar');
  const chunks = new Map();
  let s = null, color = 0, size = 1, mine = [], pen = null, sent = 0, flushTimer = 0, lastPhase = null, lastTurn = -1;

  /* ── drawing ── */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr * H / W);
    canvas.style.height = `${(w * H) / W}px`;
    redraw();
  }
  function line(c) {
    const k = canvas.width / W, p = arr(c.p);
    if (p.length < 2) return;
    cx.strokeStyle = COLORS[c.c] || COLORS[0];
    cx.fillStyle = cx.strokeStyle;
    cx.lineWidth = (SIZES[c.w] || SIZES[1]) * k;
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    if (p.length === 2) {
      cx.beginPath();
      cx.arc(p[0] * k, p[1] * k, cx.lineWidth / 2, 0, Math.PI * 2);
      cx.fill();
      return;
    }
    cx.beginPath();
    cx.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) cx.lineTo(p[i] * k, p[i + 1] * k);
    cx.stroke();
  }
  function redraw() {
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, canvas.width, canvas.height);
    for (const c of chunks.values()) line(c);
    if (pen) line({ c: pen.c, w: pen.w, p: pen.p });
  }
  const off = api.room.onStrokes(
    (k, v) => { chunks.set(k, v); line(v); },
    (k) => { chunks.delete(k); redraw(); },
  );
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  const isDrawing = () => s && s.pub.phase === 'drawing' && s.pub.drawer === s.me;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W, Math.round(((e.clientX - r.left) / r.width) * W))),
      Math.max(0, Math.min(H, Math.round(((e.clientY - r.top) / r.height) * H))),
    ];
  };
  function flush() {
    if (!pen || pen.p.length <= sent) return;
    const from = Math.max(0, sent - 2); // overlap one point so the pieces join
    api.room.addStroke({ s: pen.s, c: pen.c, w: pen.w, p: pen.p.slice(from) });
    sent = pen.p.length;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!isDrawing()) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const id = Date.now() % 1e9;
    pen = { s: id, c: color, w: size, p: at(e) };
    mine.push(id);
    sent = 0;
    line({ c: pen.c, w: pen.w, p: pen.p });
    flushTimer = setInterval(flush, 70);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pen) return;
    const [x, y] = at(e), p = pen.p;
    if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) < 3) return;
    line({ c: pen.c, w: pen.w, p: [p[p.length - 2], p[p.length - 1], x, y] });
    p.push(x, y);
  });
  const up = () => {
    if (!pen) return;
    clearInterval(flushTimer);
    flush();
    pen = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  tools.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]'), z = e.target.closest('[data-size]');
    if (c) {
      color = Number(c.dataset.color);
      tools.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === c));
      if (color === COLORS.length - 1 && size < 2) { size = 2; markSize(); }
    } else if (z) {
      size = Number(z.dataset.size);
      markSize();
    } else if (e.target.closest('[data-undo]')) {
      const id = mine.pop();
      const keys = [...chunks.entries()].filter(([, v]) => v.s === id).map(([k]) => k);
      if (keys.length) api.room.removeStrokes(keys);
    } else if (e.target.closest('[data-clear]')) {
      mine = [];
      api.room.clearStrokes();
    }
  });
  const markSize = () => tools.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === size));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    api.send({ t: 'guess', text });
    input.value = '';
    sound('pop');
  });

  over.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choose]');
    if (!b) return;
    api.send({ t: 'choose', i: Number(b.dataset.choose) });
    buzz(20);
    over.querySelectorAll('button').forEach((x) => { x.disabled = true; });
  });

  /* ── the state ── */
  const spaced = (w) => [...String(w || '')].map((c) => (c === ' ' ? '&nbsp;&nbsp;' : esc(c))).join(' ');

  function update(next) {
    s = next;
    const p = s.pub, me = s.me, drawer = p.drawer === me;
    const solved = obj(p.solved);
    const known = obj(s.secret).word;
    const dname = esc(s.names[p.drawer] || 'Someone');
    if (p.turn !== lastTurn) { lastTurn = p.turn; mine = []; }
    if (p.phase !== lastPhase) {
      if (p.phase === 'reveal') sound('end');
      if (p.phase === 'choosing' && drawer) { sound('good'); buzz(60); }
      lastPhase = p.phase;
    }

    const span = p.phase === 'choosing' ? CHOOSE_MS : p.phase === 'drawing' ? DRAW_MS : REVEAL_MS;
    bar.dataset.deadline = p.deadline;
    bar.dataset.span = span;

    hint.innerHTML = p.phase === 'choosing' ? '<span class="muted">…</span>'
      : `<span class="letters">${spaced(known || p.hint)}</span>`;
    who.innerHTML = `Turn ${p.turn + 1} of ${p.turns} · ${drawer ? '<b>You are drawing</b>' : `${dname} is drawing`}`;

    over.hidden = p.phase === 'drawing';
    if (p.phase === 'choosing') {
      const choices = arr(obj(s.secret).choices);
      over.innerHTML = drawer && choices.length
        ? `<h2>Your turn to draw!</h2><p>Pick a word:</p><div class="choices">${choices.map((c, i) => `
            <button class="btn ${['teal', 'yellow', 'pink'][i]}" data-choose="${i}"><small>${TIERS[i]}</small>${esc(c)}</button>`).join('')}</div>`
        : `<h2>${dname} is picking a word</h2><div class="spinner"></div>`;
    } else if (p.phase === 'reveal') {
      const got = Object.entries(solved).sort((a, b) => a[1] - b[1]).map(([u]) => esc(s.names[u] || '?'));
      over.innerHTML = `<p>The word was</p><h2 class="reveal-word">${esc(p.word)}</h2>
        <p>${got.length ? `Got it: ${got.join(', ')}` : 'Nobody got it!'}</p>`;
    }

    tools.hidden = !(drawer && p.phase === 'drawing');
    canvas.classList.toggle('live', drawer && p.phase === 'drawing');
    const canGuess = !drawer && p.phase === 'drawing' && !solved[me];
    const wasHidden = form.hidden;
    form.hidden = !canGuess;
    if (canGuess && wasHidden && matchMedia('(pointer: fine)').matches) input.focus();

    const items = arr(p.feed).slice().reverse();
    feed.innerHTML = items.map((f) => f.k === 'got'
      ? `<li class="got"><b>${esc(s.names[f.who] || '?')}</b> got it! 🎉</li>`
      : `<li><b>${esc(s.names[f.who] || '?')}</b> ${esc(f.text)}</li>`).join('')
      || `<li class="muted">${p.phase === 'drawing' ? (drawer ? 'Guesses show up here.' : 'Type a guess. Wrong ones show up here for everyone.') : ''}</li>`;
  }

  return {
    update,
    destroy() { off(); ro.disconnect(); clearInterval(flushTimer); },
  };
}
