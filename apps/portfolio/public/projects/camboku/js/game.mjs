/* Camboku: the board, taps, hearts, hints and saved progress.
 * The puzzle rules and the level generator live in rules.mjs. */
import { makeLevel, makeDaily, stageFor, blockedBy, hint, rowOf, colOf, TIER } from './rules.mjs';

const $ = id => document.getElementById(id);
const HEARTS = 3;
const SAVE_KEY = 'camboku.v1';

// Region colors, with the names the hints use.
const COLORS = [
  ['#FFB59A', 'orange'], ['#FFE07A', 'yellow'], ['#A8E0B0', 'green'],
  ['#A7D3F5', 'blue'], ['#CDB8F2', 'purple'], ['#F7B2CF', 'pink'],
  ['#D3E08F', 'lime'], ['#E6CBA8', 'tan'], ['#94DDD5', 'teal'],
];
const FACES = { cam: 'img/cam.jpg', bo: 'img/bo.jpg' };

// ── Saved progress ──────────────────────────────────────────────────────────
const save = load();
function load() {
  const base = { unlocked: 1, best: {}, daily: {}, avatar: 'mix', autoBlock: true, current: null };
  try { return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return base; }
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode: play on without saving */ }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ── Round state ─────────────────────────────────────────────────────────────
let L = null;          // the level from rules.mjs
let key = '';          // "level:12" or "daily:2026-10-28", for the resume slot
let stars = [];        // faces placed, always right
let marks = new Set(); // the player's ✕ marks
let hearts = HEARTS;
let elapsed = 0, ticking = null, over = false;
let mode = 'face';
let hinted = [];

const faceFor = cell => {
  if (save.avatar !== 'mix') return FACES[save.avatar];
  return stars.indexOf(cell) % 2 ? FACES.bo : FACES.cam;
};

function blockedNow() {
  const out = new Set();
  for (const s of stars) for (const i of blockedBy(L.n, L.regions, s)) out.add(i);
  return out;
}

// ── Home ────────────────────────────────────────────────────────────────────
let shownLevels = 0;
function showHome() {
  stopClock();
  $('game').hidden = true;
  $('overlay').hidden = true;
  $('home').hidden = false;
  const next = save.unlocked;
  $('play-level').textContent = next;
  $('play-stage').textContent = `${stageFor(next).name} · ${stageFor(next).n}×${stageFor(next).n}`;
  const d = save.daily[today()];
  $('daily').textContent = d != null ? `Today's board ✓ ${clock(d)}` : "Today's board";
  shownLevels = Math.max(shownLevels, Math.ceil((next + 6) / 10) * 10);
  drawLevels();
  drawPicks();
  $('auto-block').checked = save.autoBlock;
}

function drawLevels() {
  const box = $('levels');
  box.innerHTML = '';
  let lastStage = '';
  for (let lv = 1; lv <= shownLevels; lv++) {
    const st = stageFor(lv);
    if (st.name !== lastStage) {
      const h = document.createElement('div');
      h.className = 'stage-head';
      h.textContent = `${st.name} · ${st.n}×${st.n}`;
      box.append(h);
      lastStage = st.name;
    }
    const b = document.createElement('button');
    b.className = 'lv';
    b.textContent = lv;
    if (save.best[lv] != null) { b.classList.add('done'); b.title = `Best ${clock(save.best[lv])}`; }
    if (lv === save.unlocked) b.classList.add('next');
    if (lv > save.unlocked) { b.disabled = true; b.classList.add('locked'); }
    b.onclick = () => startLevel(lv);
    box.append(b);
  }
}

function drawPicks() {
  document.querySelectorAll('.pick').forEach(p => {
    const on = p.dataset.avatar === save.avatar;
    p.classList.toggle('on', on);
    p.setAttribute('aria-checked', on);
  });
  $('mode-face-img').src = save.avatar === 'bo' ? FACES.bo : FACES.cam;
}

// ── Starting a round ────────────────────────────────────────────────────────
function startLevel(lv) { begin(`level:${lv}`, () => makeLevel(lv)); }
function startDaily() { begin(`daily:${today()}`, () => makeDaily(today())); }

function begin(k, build) {
  stopClock();
  L = null;
  $('home').hidden = true;
  $('overlay').hidden = true;
  $('game').hidden = false;
  $('board').innerHTML = '';
  $('building').hidden = false;
  closeHint();
  // Let "Building the board…" paint before the generator runs; a 9×9 can
  // take a moment on an older phone.
  setTimeout(() => {
    L = build();
    key = k;
    const resume = save.current && save.current.key === k ? save.current : null;
    stars = resume ? resume.stars : [];
    marks = new Set(resume ? resume.marks : []);
    hearts = resume ? resume.hearts : HEARTS;
    elapsed = resume ? resume.elapsed : 0;
    over = false;
    $('building').hidden = true;
    $('g-name').textContent = L.daily ? "Today's board" : `Level ${L.level}`;
    $('g-stage').textContent = `${L.stage} · ${L.n}×${L.n}`;
    drawBoard();
    startClock();
  }, 30);
}

function keepRound() {
  save.current = over ? null : { key, stars, marks: [...marks], hearts, elapsed };
  persist();
}

function startClock() {
  stopClock();
  $('timer').textContent = clock(elapsed);
  ticking = setInterval(() => {
    if (document.hidden || over) return;
    elapsed++;
    $('timer').textContent = clock(elapsed);
    if (elapsed % 5 === 0) keepRound();
  }, 1000);
}
function stopClock() { clearInterval(ticking); ticking = null; }

// ── The board ───────────────────────────────────────────────────────────────
function drawBoard() {
  const { n, regions } = L;
  const board = $('board');
  board.innerHTML = '';
  board.style.setProperty('--n', n);
  for (let i = 0; i < n * n; i++) {
    const r = rowOf(n, i), c = colOf(n, i), g = regions[i];
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.i = i;
    cell.style.background = COLORS[g][0];
    // Thick lines where regions meet, thin ones inside a region.
    if (r === 0 || regions[i - n] !== g) cell.classList.add('bt');
    if (c === 0 || regions[i - 1] !== g) cell.classList.add('bl');
    if (r === n - 1 || regions[i + n] !== g) cell.classList.add('bb');
    if (c === n - 1 || regions[i + 1] !== g) cell.classList.add('br');
    board.append(cell);
  }
  paint();
}

function paint() {
  const { n } = L;
  const blocked = save.autoBlock ? blockedNow() : new Set();
  const cells = $('board').children;
  for (let i = 0; i < n * n; i++) {
    const el = cells[i];
    const star = stars.includes(i), mark = marks.has(i), dot = !star && !mark && blocked.has(i);
    const want = star ? 'star' : mark ? 'mark' : dot ? 'dot' : '';
    if (el.dataset.show !== want) {
      el.dataset.show = want;
      el.innerHTML = star ? `<img class="face" src="${faceFor(i)}" alt="">` : mark ? '<span class="x">✕</span>' : dot ? '<span class="dot"></span>' : '';
    }
    el.classList.toggle('hinted', hinted.includes(i));
    const what = star ? 'face' : mark ? 'marked' : dot ? 'ruled out' : 'empty';
    el.setAttribute('aria-label', `Row ${rowOf(n, i) + 1}, column ${colOf(n, i) + 1}, ${COLORS[L.regions[i]][1]}, ${what}`);
  }
  $('hearts').innerHTML = Array.from({ length: HEARTS }, (_, k) => `<span class="heart ${k < hearts ? '' : 'lost'}">♥</span>`).join('');
  $('progress').textContent = `${stars.length} of ${n} faces`;
}

// ── Taps and drags ──────────────────────────────────────────────────────────
// Face mode: a tap places a face (long press marks ✕ instead). Mark mode: a
// tap toggles ✕, and a drag paints ✕ (or erases, if it started on one).
let drag = null;
const cellAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const c = el && el.closest('.cell');
  return c && $('board').contains(c) ? Number(c.dataset.i) : null;
};

$('board').addEventListener('pointerdown', e => {
  if (over || !L) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i == null) return;
  e.preventDefault();
  if (mode === 'mark') {
    drag = { erase: marks.has(i), last: i };
    setMark(i, !drag.erase);
  } else {
    drag = { face: i, timer: setTimeout(() => { if (drag && drag.face === i) { drag = null; setMark(i, !marks.has(i)); buzz(10); } }, 450) };
  }
});
$('board').addEventListener('pointermove', e => {
  if (!drag || drag.face != null) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i != null && i !== drag.last) { drag.last = i; setMark(i, !drag.erase); }
});
const endDrag = e => {
  if (!drag) return;
  if (drag.face != null) {
    clearTimeout(drag.timer);
    if (e.type === 'pointerup' && cellAt(e.clientX, e.clientY) === drag.face) tapFace(drag.face);
  }
  drag = null;
  keepRound();
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
// Keep a drag from scrolling the page.
$('board').addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

function setMark(i, on) {
  if (stars.includes(i)) return;
  if (on) marks.add(i); else marks.delete(i);
  clearHintCells();
  paint();
}

function tapFace(i) {
  if (stars.includes(i)) return;
  const el = $('board').children[i];
  // A cell a face already rules out is a plain no, not a mistake.
  if (blockedNow().has(i)) {
    el.classList.add('nope');
    setTimeout(() => el.classList.remove('nope'), 400);
    return;
  }
  if (L.answer.includes(i)) {
    stars.push(i);
    marks.delete(i);
    clearHintCells();
    paint();
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 400);
    buzz(15);
    if (stars.length === L.n) win();
    keepRound();
    return;
  }
  // Wrong: lose a heart, and mark the cell so the same mistake can't happen
  // twice.
  hearts--;
  marks.add(i);
  clearHintCells();
  paint();
  el.classList.add('wrong');
  setTimeout(() => el.classList.remove('wrong'), 500);
  buzz([30, 40, 30]);
  if (hearts <= 0) lose();
  keepRound();
}

function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* no vibration */ } }

function setMode(m) {
  mode = m;
  $('mode-face').classList.toggle('on', m === 'face');
  $('mode-mark').classList.toggle('on', m === 'mark');
  $('mode-face').setAttribute('aria-checked', m === 'face');
  $('mode-mark').setAttribute('aria-checked', m === 'mark');
}

// ── Hints ───────────────────────────────────────────────────────────────────
const nth = (kind, i) => kind === 'region' ? `the ${COLORS[i][1]} region` : `${kind === 'row' ? 'row' : 'column'} ${i + 1}`;
const list = words => words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
const cap = s => s[0].toUpperCase() + s.slice(1);

function hintText(h) {
  switch (h.rule) {
    case 'wrongMark': return 'This ✕ is covering a spot that needs a face.';
    case 'reveal': return 'Here is where the next face goes.';
    case 'single': return `${cap(nth(h.unit.kind, h.unit.index))} has only one spot left. Tap it to place a face.`;
    case 'squeeze': {
      const what = cap(nth(h.unit.kind, h.unit.index)), into = nth(h.into.kind, h.into.index);
      return `${what} only has spots in ${into}, so its face has to be there. Nothing else in ${into} can have a face.`;
    }
    case 'blocks': return `A face here would rule out every spot left in ${nth(h.unit.kind, h.unit.index)}, so it can't go here.`;
    case 'pigeonhole': {
      const g = h.group, t = h.into;
      const groupWords = g.kind === 'region'
        ? `The ${list(g.indexes.map(i => COLORS[i][1]))} regions`
        : `${g.kind === 'row' ? 'Rows' : 'Columns'} ${list(g.indexes.map(i => i + 1))}`;
      const intoWords = t.kind === 'region'
        ? `the ${list(t.indexes.map(i => COLORS[i][1]))} regions`
        : `${t.kind === 'row' ? 'rows' : 'columns'} ${list(t.indexes.map(i => i + 1))}`;
      return `${groupWords} only fit in ${intoWords}. That's ${g.indexes.length} faces for ${g.indexes.length} spots, so the rest of ${intoWords} is out.`;
    }
    case 'deadEnd': return 'Picture a face here and follow it through: some row, column or color ends up with nowhere to go.';
    default: return '';
  }
}

let lastHint = null;
function showHint() {
  if (over || !L) return;
  const h = hint(L, stars, marks);
  if (!h) return;
  lastHint = h;
  hinted = h.cells;
  $('hint-text').textContent = hintText(h);
  const canMark = h.place == null && h.rule !== 'wrongMark';
  $('hint-apply').hidden = !canMark && h.rule !== 'wrongMark';
  $('hint-apply').textContent = h.rule === 'wrongMark' ? 'Remove ✕' : h.cells.length > 1 ? `Mark these ${h.cells.length} ✕` : 'Mark ✕';
  $('hint-box').hidden = false;
  paint();
}
function applyHint() {
  if (!lastHint) return;
  for (const i of lastHint.cells) {
    if (lastHint.rule === 'wrongMark') marks.delete(i); else marks.add(i);
  }
  closeHint();
  keepRound();
}
function clearHintCells() { if (hinted.length) { hinted = []; $('hint-box').hidden = true; lastHint = null; } }
function closeHint() { hinted = []; lastHint = null; $('hint-box').hidden = true; if (L) paint(); }

// ── Round over ──────────────────────────────────────────────────────────────
function win() {
  over = true;
  stopClock();
  const mins = clock(elapsed);
  let text = `Solved in ${mins} with ${hearts} of ${HEARTS} hearts left.`;
  if (L.daily) {
    const prev = save.daily[L.daily];
    if (prev == null || elapsed < prev) save.daily[L.daily] = elapsed;
  } else {
    const prev = save.best[L.level];
    if (prev != null && elapsed < prev) text += ' A new best!';
    if (prev == null || elapsed < prev) save.best[L.level] = elapsed;
    save.unlocked = Math.max(save.unlocked, L.level + 1);
  }
  save.current = null;
  persist();
  $('board').classList.add('cheer');
  setTimeout(() => {
    $('board').classList.remove('cheer');
    overlay({
      faces: ['cam', 'bo'], title: L.tier >= TIER.PIGEONHOLE ? 'Big brain!' : 'Nice one!', text,
      main: L.daily ? ['Home', showHome] : [`Level ${L.level + 1}`, () => startLevel(L.level + 1)],
      alt: ['Home', showHome],
    });
  }, 900);
}

function lose() {
  over = true;
  stopClock();
  save.current = null;
  persist();
  setTimeout(() => overlay({
    faces: [save.avatar === 'bo' ? 'bo' : 'cam'], title: 'Out of hearts',
    text: 'Three wrong taps. Same board, fresh start?',
    main: ['Try again', () => (L.daily ? startDaily() : startLevel(L.level))],
    alt: ['Home', showHome],
  }), 600);
}

function overlay({ faces, title, text, main, alt }) {
  $('o-faces').innerHTML = faces.map((f, k) => `<img class="face big ${k ? 'tilt-r' : 'tilt-l'} bounce" src="${FACES[f]}" alt="">`).join('');
  $('o-title').textContent = title;
  $('o-text').textContent = text;
  $('o-main').textContent = main[0];
  $('o-main').onclick = main[1];
  $('o-alt').textContent = alt[0];
  $('o-alt').onclick = alt[1];
  $('overlay').hidden = false;
}

// ── Wiring ──────────────────────────────────────────────────────────────────
$('play').onclick = () => startLevel(save.unlocked);
$('daily').onclick = startDaily;
$('more-levels').onclick = () => { shownLevels += 20; drawLevels(); };
$('back').onclick = () => { keepRound(); showHome(); };
$('hint').onclick = showHint;
$('hint-apply').onclick = applyHint;
$('hint-close').onclick = closeHint;
$('clear-marks').onclick = () => { marks.clear(); closeHint(); keepRound(); };
$('mode-face').onclick = () => setMode('face');
$('mode-mark').onclick = () => setMode('mark');
$('auto-block').onchange = e => { save.autoBlock = e.target.checked; persist(); };
document.querySelectorAll('.pick').forEach(p => {
  p.onclick = () => { save.avatar = p.dataset.avatar; persist(); drawPicks(); };
});
document.addEventListener('keydown', e => {
  if ($('game').hidden) return;
  if (e.key === 'x' || e.key === 'X') setMode(mode === 'mark' ? 'face' : 'mark');
  if (e.key === 'h' || e.key === 'H') showHint();
});
window.addEventListener('pagehide', () => { if (L && !$('game').hidden) keepRound(); });

showHome();
