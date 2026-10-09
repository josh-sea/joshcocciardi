/* Where Am I — the photo-deck half of the ticket book.
 *
 * Loaded on demand the first time somebody switches to this game, never on
 * page load. That matters: the trivia half is a static page with no network
 * dependency at all, and importing Firebase up front would have cost it both
 * its speed and its ability to work with no signal. Nothing in here runs
 * until init() is called.
 *
 * The rules of the game live in game.js, the network in store.js, and the
 * password derivation in keys.js. This file only decides what is on screen.
 */
import {
  TAPS_ALLOWED, DEFAULT_TOLERANCE, peepholeCentre, revealAt, judge, scoreRound,
} from './game.js';

const $ = (id) => document.getElementById(id);
const show = (el, on) => { el.hidden = !on; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = null;             // store.js, imported alongside this module
let deck = null;
let rounds = [], queue = [], round = null;
let taps = 0, guess = null, settled = false;
let points = 0, played = 0;
let mapURL = null;
let answerDraft = null;
let started = false;

const DOOR_BLURB = 'Open a deck with its name and password. Nobody can see a deck without both.';
const say = (el, msg, kind) => { el.textContent = msg; el.className = 'note' + (kind ? ' ' + kind : ''); };
const blurb = (text) => { const b = $('blurb'); if (b) b.textContent = text; };

/* ── entry ─────────────────────────────────────────────────────────────── */

export async function init() {
  if (started) return;
  started = true;
  S = await import('./store.js');
  wire();
  try { $('me-name').value = localStorage.getItem('whereami.name') || ''; } catch { /* private mode */ }
  try {
    await S.ready();
    show($('wa-boot'), false);
    show($('door'), true);
    blurb(DOOR_BLURB);
    await drawRecent();
  } catch (err) {
    $('wa-boot').textContent = err.message;
  }
}

// Called by the page when you switch away to the trivia half and back.
export function onShow() {
  blurb(deck ? deck.name : DOOR_BLURB);
}

/* ── door ──────────────────────────────────────────────────────────────── */

function pickTab(which) {
  const open = which === 'open';
  $('tab-open').setAttribute('aria-selected', String(open));
  $('tab-make').setAttribute('aria-selected', String(!open));
  show($('form-open'), open);
  show($('form-make'), !open);
}

async function drawRecent() {
  const decks = await S.myDecks();
  show($('recent'), decks.length > 0);
  const box = $('recent-list');
  box.innerHTML = '';
  decks.forEach(d => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = d.name || 'Deck';
    // Already a member, so the rules let this browser straight back in.
    // Anybody else still needs the password.
    b.onclick = async () => {
      try { await enterDeck(await S.getDeck(d.id)); }
      catch (err) { say($('open-note'), err.message, 'bad'); await S.forget(d.id); drawRecent(); }
    };
    box.appendChild(b);
  });
}

/* ── deck ──────────────────────────────────────────────────────────────── */

async function enterDeck(d) {
  deck = d;
  show($('door'), false);
  show($('deck'), true);
  blurb(d.name);
  mapURL = d.map ? await S.urlFor(d.map.path) : null;
  $('map-img').src = mapURL || '';
  $('add-map-img').src = mapURL || '';
  await refreshRounds();
  pickMode('play');
}

function leaveDeck() {
  deck = null; rounds = []; queue = []; round = null; points = 0; played = 0;
  show($('deck'), false);
  show($('door'), true);
  blurb(DOOR_BLURB);
  say($('open-note'), '');
  drawRecent();
}

function pickMode(which) {
  for (const [id, pane] of [['mode-play', 'pane-play'], ['mode-add', 'pane-add'], ['mode-board', 'pane-board']]) {
    const on = id === 'mode-' + which;
    $(id).setAttribute('aria-selected', String(on));
    show($(pane), on);
  }
  if (which === 'board') drawBoard();
  if (which === 'add') drawRoundList();
}

async function refreshRounds() {
  rounds = await S.listRounds(deck.id);
  queue = rounds.slice();
  show($('play-empty'), rounds.length === 0);
  show($('play-live'), false);
  show($('play-done'), false);
  if (rounds.length) nextRound();
}

/* ── a round ───────────────────────────────────────────────────────────── */

function nextRound() {
  show($('play-done'), false);
  if (!queue.length) {
    show($('play-live'), false);
    show($('play-empty'), false);
    $('play-done').innerHTML =
      `<p><strong>${points} points</strong> over ${played} photo${played === 1 ? '' : 's'}.</p>` +
      `<p class="fine">Play again, or add more photos.</p>`;
    show($('play-done'), true);
    $('play-done').appendChild(Object.assign(document.createElement('button'), {
      className: 'btn ghost', textContent: 'Play again',
      onclick: () => { queue = rounds.slice(); points = 0; played = 0; nextRound(); },
    }));
    saveMyScore();
    return;
  }
  round = queue.splice(Math.floor(Math.random() * queue.length), 1)[0];
  taps = 0; guess = null; settled = false;

  show($('play-live'), true);
  show($('verdict'), false);
  show($('nextround'), false);
  show($('pin-guess'), false);
  show($('pin-answer'), false);
  show($('ring'), false);
  $('peep').classList.remove('revealed');
  $('widen').disabled = false;
  $('lockin').disabled = true;
  $('play-prompt').textContent = 'Where was this taken? Drop a pin on the map.';

  S.urlFor(round.photo.path).then(url => { $('peep-img').src = url; });
  paintPeep();
  paintTaps();
}

/* The box is given the photo's own aspect ratio, so a point 40% across the
 * photo is 40% across the box and the radius can be a percentage of each
 * axis. Two percentages on an ellipse describe a true circle exactly because
 * the box and the photo are the same shape. */
function paintPeep() {
  const { cx, cy } = peepholeCentre(round.id);
  const { w, h } = round.photo;
  const r = revealAt(taps, w, h);
  const el = $('peep');
  el.style.setProperty('--ar', w + ' / ' + h);
  el.style.setProperty('--cx', (cx * 100).toFixed(3) + '%');
  el.style.setProperty('--cy', (cy * 100).toFixed(3) + '%');
  el.style.setProperty('--rx', ((r / w) * 100).toFixed(3) + '%');
  el.style.setProperty('--ry', ((r / h) * 100).toFixed(3) + '%');
}

function paintTaps() {
  $('taps').innerHTML = '';
  for (let i = 0; i < TAPS_ALLOWED; i++) {
    const tick = document.createElement('i');
    if (i < taps) tick.className = 'spent';
    $('taps').appendChild(tick);
  }
  const left = TAPS_ALLOWED - taps;
  $('widen').textContent = left ? `Tap to see more (${left} left)` : 'No more looks';
  $('widen').disabled = left === 0 || settled;
}

// A tap anywhere on the map is a guess, in normalised coordinates so it means
// the same thing at any display size.
function mapPoint(e, el) {
  const r = el.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return {
    x: Math.min(Math.max((p.clientX - r.left) / r.width, 0), 1),
    y: Math.min(Math.max((p.clientY - r.top) / r.height, 0), 1),
  };
}

function placePin(el, pt) {
  el.style.left = (pt.x * 100) + '%';
  el.style.top = (pt.y * 100) + '%';
  show(el, true);
}

function drawRing(ring, box, at) {
  const mw = (deck.map && deck.map.w) || 1000;
  const mh = (deck.map && deck.map.h) || 1000;
  const tol = deck.tolerance || DEFAULT_TOLERANCE;
  const radiusPx = tol * Math.min(mw, mh) / mw * box.width;
  ring.style.left = (at.x * 100) + '%';
  ring.style.top = (at.y * 100) + '%';
  ring.style.width = (radiusPx * 2) + 'px';
  ring.style.height = (radiusPx * 2) + 'px';
  show(ring, true);
}

function lockIn() {
  if (!guess || settled) return;
  settled = true;
  $('lockin').disabled = true;
  $('widen').disabled = true;

  const mw = (deck.map && deck.map.w) || 1000;
  const mh = (deck.map && deck.map.h) || 1000;
  const tol = deck.tolerance || DEFAULT_TOLERANCE;
  const verdict = judge(guess, round.answer, mw, mh, tol);
  const got = scoreRound(verdict, taps);
  points += got;
  played += 1;

  placePin($('pin-answer'), round.answer);
  drawRing($('ring'), $('mapwrap').getBoundingClientRect(), round.answer);
  $('peep').classList.add('revealed');

  const off = Math.round(verdict.off * 100);
  const v = $('verdict');
  v.className = 'wa-verdict ' + (verdict.within ? 'hit' : 'miss');
  v.innerHTML =
    `<h3>${verdict.bullseye ? 'Nailed it' : verdict.within ? 'Close enough' : 'Not quite'}</h3>` +
    `<p>${verdict.within ? `+${got} points` : 'No points'} · you were ${off}% of the map away` +
    (round.label ? ` · <strong>${esc(round.label)}</strong>` : '') + '</p>';
  show(v, true);
  show($('nextround'), true);
  $('play-prompt').textContent = 'The green pin is the real spot.';
  paintTaps();
}

async function saveMyScore() {
  const name = ($('me-name').value || '').trim();
  if (!name) return;
  try { await S.saveScore(deck.id, { name, points, played }); } catch { /* not fatal */ }
}

/* ── adding a round ────────────────────────────────────────────────────── */

async function drawRoundList() {
  const box = $('add-list');
  box.innerHTML = '';
  if (!rounds.length) { box.innerHTML = '<p class="fine">Nothing yet.</p>'; return; }
  for (const r of rounds) {
    const row = document.createElement('div');
    row.className = 'row';
    const img = document.createElement('img');
    img.alt = '';
    S.urlFor(r.photo.path).then(u => { img.src = u; });
    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = esc(r.label || 'Untitled') +
      `<div class="sub2">${r.createdByUid === S.currentUid() ? 'added by you' : 'added by someone in the deck'}</div>`;
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.onclick = async () => {
      if (!confirm('Remove this photo from the deck? This cannot be undone.')) return;
      await S.removeRound(deck.id, r);
      await refreshRounds();
      drawRoundList();
    };
    row.append(img, who, del);
    box.appendChild(row);
  }
}

/* ── scores ────────────────────────────────────────────────────────────── */

async function drawBoard() {
  const box = $('board');
  box.innerHTML = '<p class="fine">Loading…</p>';
  const scores = await S.listScores(deck.id);
  box.innerHTML = '';
  if (!scores.length) { box.innerHTML = '<p class="fine">No finished games yet.</p>'; return; }
  scores.forEach(s => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      `<div class="who">${esc(s.name || 'Player')}` +
      `<div class="sub2">${s.played || 0} photo${s.played === 1 ? '' : 's'}</div></div>` +
      `<div class="pts">${s.points || 0}</div>`;
    box.appendChild(row);
  });
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function wire() {
  $('tab-open').onclick = () => pickTab('open');
  $('tab-make').onclick = () => pickTab('make');

  $('form-open').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    say($('open-note'), 'Checking…');
    try {
      // Deriving the key is deliberately slow, so this wait is the
      // brute-force defence doing its job.
      const d = await S.openDeck({ name: $('open-name').value, password: $('open-pass').value });
      $('open-pass').value = '';
      await enterDeck(d);
    } catch (err) {
      say($('open-note'), err.message, 'bad');
    } finally { btn.disabled = false; }
  };

  $('form-make').onsubmit = async (e) => {
    e.preventDefault();
    const { passwordProblem } = await import('./keys.js');
    const problem = passwordProblem($('make-pass').value);
    if (problem) { say($('make-note'), problem, 'bad'); return; }
    const file = $('make-map').files[0];
    if (!file) { say($('make-note'), 'Pick a map image first.', 'bad'); return; }
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    say($('make-note'), 'Creating…');
    try {
      const made = await S.createDeck({
        name: $('make-name').value, password: $('make-pass').value, mapFile: file,
      });
      $('make-pass').value = '';
      await enterDeck(await S.getDeck(made.id));
    } catch (err) {
      say($('make-note'), err.message, 'bad');
    } finally { btn.disabled = false; }
  };

  $('mode-play').onclick = () => pickMode('play');
  $('mode-add').onclick = () => pickMode('add');
  $('mode-board').onclick = () => pickMode('board');

  $('widen').onclick = () => {
    if (settled || taps >= TAPS_ALLOWED) return;
    taps++;
    paintPeep();
    paintTaps();
  };

  $('mapwrap').onclick = (e) => {
    if (settled || !round) return;
    guess = mapPoint(e, $('mapwrap'));
    placePin($('pin-guess'), guess);
    $('lockin').disabled = false;
  };

  $('lockin').onclick = lockIn;
  $('nextround').onclick = nextRound;

  $('add-mapwrap').onclick = (e) => {
    answerDraft = mapPoint(e, $('add-mapwrap'));
    placePin($('add-pin'), answerDraft);
    drawRing($('add-ring'), $('add-mapwrap').getBoundingClientRect(), answerDraft);
    $('add-submit').disabled = !$('add-photo').files[0];
  };
  $('add-photo').onchange = () => {
    $('add-submit').disabled = !answerDraft || !$('add-photo').files[0];
  };

  $('form-add').onsubmit = async (e) => {
    e.preventDefault();
    if (!answerDraft) { say($('add-note'), 'Tap the map to mark where it was taken.', 'bad'); return; }
    $('add-submit').disabled = true;
    say($('add-note'), 'Uploading…');
    try {
      await S.addRound(deck.id, {
        photoFile: $('add-photo').files[0], answer: answerDraft, label: $('add-label').value,
      });
      $('form-add').reset();
      answerDraft = null;
      show($('add-pin'), false);
      show($('add-ring'), false);
      say($('add-note'), 'Added.', 'good');
      await refreshRounds();
      drawRoundList();
    } catch (err) {
      say($('add-note'), err.message, 'bad');
    } finally { $('add-submit').disabled = true; }
  };

  $('me-name').oninput = () => {
    try { localStorage.setItem('whereami.name', $('me-name').value); } catch { /* private mode */ }
  };

  $('leave-deck').onclick = leaveDeck;
}
