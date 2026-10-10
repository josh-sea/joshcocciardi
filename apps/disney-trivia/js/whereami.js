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
  TAPS_ALLOWED, DEFAULT_TOLERANCE, PARKS, PARK_ORDER, isPark,
  freshCentre, peepLayout, revealAt, judgeGuess, scoreRound,
} from './game.js';

const $ = (id) => document.getElementById(id);
const show = (el, on) => { el.hidden = !on; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = null;             // store.js, imported alongside this module
let deck = null;
let rounds = [], queue = [], round = null;
let taps = 0, guess = null, settled = false;
let points = 0, played = 0;
let centre = null;         // this playing's peephole, fresh on every deal
let pickedPark = null;     // the park being guessed this round
let answerDraft = null;    // {park, x, y} being set on the Add tab
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

/* ── the park picker ───────────────────────────────────────────────────────
 *
 * The four maps ship with the app, so this is just a radio group of
 * thumbnails. It is used twice: to say which park a photo was taken in, and
 * to guess which park a photo is in. Thumbnails are ~25KB each; the full map
 * is only fetched once a park is chosen.
 */
function drawParks(box, selected, onPick) {
  box.innerHTML = '';
  PARK_ORDER.forEach(key => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(key === selected));
    b.innerHTML =
      `<img src="maps/${key}-thumb.webp" alt="" loading="lazy">` +
      `<span>${PARKS[key].name}</span>`;
    b.onclick = () => onPick(key);
    box.appendChild(b);
  });
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
  await refreshRounds();
  pickMode('play');
}

function leaveDeck() {
  deck = null; rounds = []; queue = []; round = null; points = 0; played = 0;
  pickedPark = null; answerDraft = null;
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
  if (which === 'add') { if (!addPark) resetAddForm(); drawRoundList(); }
}

const playable = (r) => r && r.answer && isPark(r.answer.park);

async function refreshRounds() {
  rounds = await S.listRounds(deck.id);
  // Rounds made before the built-in park maps pinned against a map that is no
  // longer there. They stay listed on the Add tab so they can be removed, but
  // they cannot be dealt.
  queue = rounds.filter(playable);
  show($('play-empty'), queue.length === 0);
  show($('play-live'), false);
  show($('play-done'), false);
  if (queue.length) nextRound();
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
      onclick: () => { queue = rounds.filter(playable); points = 0; played = 0; nextRound(); },
    }));
    saveMyScore();
    return;
  }
  round = queue.splice(Math.floor(Math.random() * queue.length), 1)[0];
  taps = 0; guess = null; settled = false; pickedPark = null;
  // A new opening every time, so a photo that comes round again is still a
  // puzzle rather than a memory test.
  centre = freshCentre();

  show($('play-live'), true);
  show($('verdict'), false);
  show($('nextround'), false);
  show($('pin-guess'), false);
  show($('pin-answer'), false);
  show($('ring'), false);
  $('peep').classList.remove('revealed');
  $('widen').disabled = false;
  $('lockin').disabled = true;
  $('play-prompt').textContent = 'Which park is this?';
  show($('mapwrap'), false);
  drawParks($('park-pick'), null, choosePark);

  S.urlFor(round.photo.path).then(url => { $('peep-img').src = url; paintPeep(); });
  paintPeep();
  paintTaps();
}

/* Draw the peephole.
 *
 * The photo is positioned and scaled so the revealed circle always lands in
 * the middle of the box at a readable size (see peepLayout in game.js). That
 * makes the geometry depend on the box's measured size, so this runs again on
 * resize and rotation, and again once the photo itself has loaded.
 *
 * The mask radius is a real length now, which is why it can go back to
 * `circle`: percentages are only ever legal on `ellipse`.
 */
function paintPeep() {
  if (!round || !centre) return;
  const el = $('peep');
  const img = $('peep-img');
  const box = el.getBoundingClientRect();
  const { w, h } = round.photo;
  const L = peepLayout(centre, revealAt(taps, w, h), w, h, box.width, box.height);
  if (!L) return;
  img.style.width = L.width + 'px';
  img.style.height = L.height + 'px';
  img.style.left = L.left + 'px';
  img.style.top = L.top + 'px';
  // The mask lives on the photo, so its centre is in the photo's coordinates.
  img.style.setProperty('--r', L.radius + 'px');
  img.style.setProperty('--mx', L.maskX + 'px');
  img.style.setProperty('--my', L.maskY + 'px');
}

// Rotating a phone changes the box, and the layout is measured from it.
let relayoutTimer;
window.addEventListener('resize', () => {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(paintPeep, 120);
});

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

/* Pick a park: redraw the radio group, swap in that park's map, and clear any
 * pin already dropped, because a point on one map means nothing on another.
 */
function choosePark(key) {
  if (settled) return;
  pickedPark = key;
  guess = null;
  drawParks($('park-pick'), key, choosePark);
  $('map-img').src = `maps/${key}.webp`;
  show($('mapwrap'), true);
  show($('pin-guess'), false);
  $('play-prompt').textContent = `Where in ${PARKS[key].name}? Tap the map.`;
  $('lockin').disabled = true;
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

function drawRing(ring, box, at, parkKey) {
  const { w: mw, h: mh } = PARKS[parkKey];
  const tol = (deck && deck.tolerance) || DEFAULT_TOLERANCE;
  const radiusPx = tol * Math.min(mw, mh) / mw * box.width;
  ring.style.left = (at.x * 100) + '%';
  ring.style.top = (at.y * 100) + '%';
  ring.style.width = (radiusPx * 2) + 'px';
  ring.style.height = (radiusPx * 2) + 'px';
  show(ring, true);
}

function lockIn() {
  if (!guess || !pickedPark || settled) return;
  settled = true;
  $('lockin').disabled = true;
  $('widen').disabled = true;

  const answer = round.answer;
  const verdict = judgeGuess({ park: pickedPark, ...guess }, answer,
    (deck && deck.tolerance) || DEFAULT_TOLERANCE);
  const got = scoreRound(verdict, taps);
  points += got;
  played += 1;

  // Show the answer on the park it was actually in, which may not be the one
  // being looked at. Swapping the map is the clearest way to say "wrong park".
  drawParks($('park-pick'), answer.park, () => {});
  if (pickedPark !== answer.park) {
    $('map-img').src = `maps/${answer.park}.webp`;
    show($('pin-guess'), false);
  }
  show($('mapwrap'), true);
  placePin($('pin-answer'), answer);
  drawRing($('ring'), $('mapwrap').getBoundingClientRect(), answer, answer.park);
  $('peep').classList.add('revealed');

  const v = $('verdict');
  v.className = 'wa-verdict ' + (verdict.within ? 'hit' : 'miss');
  const head = verdict.bullseye ? 'Nailed it'
    : verdict.within ? 'Close enough'
    : verdict.rightPark ? 'Right park, wrong spot'
    : 'Wrong park';
  const detail = verdict.rightPark
    ? `you were ${Math.round(verdict.off * 100)}% of the map away`
    : `it was ${PARKS[answer.park].name}`;
  v.innerHTML =
    `<h3>${head}</h3>` +
    `<p>${verdict.within ? `+${got} points` : 'No points'} · ${detail}` +
    (round.label ? ` · <strong>${esc(round.label)}</strong>` : '') + '</p>';
  show(v, true);
  show($('nextround'), true);
  $('play-prompt').textContent = `The green pin is the real spot, in ${PARKS[answer.park].name}.`;
  paintTaps();
}

async function saveMyScore() {
  const name = ($('me-name').value || '').trim();
  if (!name) return;
  try { await S.saveScore(deck.id, { name, points, played }); } catch { /* not fatal */ }
}

/* ── adding a round ────────────────────────────────────────────────────── */

let addPark = null;

function refreshAddSubmit() {
  $('add-submit').disabled = !addPark || !answerDraft || !$('add-photo').files[0];
}

function chooseAddPark(key) {
  addPark = key;
  answerDraft = null;
  drawParks($('add-park-pick'), key, chooseAddPark);
  $('add-map-img').src = `maps/${key}.webp`;
  show($('add-map-prompt'), true);
  show($('add-mapwrap'), true);
  show($('add-pin'), false);
  show($('add-ring'), false);
  refreshAddSubmit();
}

function resetAddForm() {
  addPark = null;
  answerDraft = null;
  drawParks($('add-park-pick'), null, chooseAddPark);
  show($('add-map-prompt'), false);
  show($('add-mapwrap'), false);
  show($('add-pin'), false);
  show($('add-ring'), false);
  refreshAddSubmit();
}

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
    const where = playable(r) ? PARKS[r.answer.park].name : 'added before the park maps — remove and re-add';
    who.innerHTML = esc(r.label || 'Untitled') +
      `<div class="sub2">${esc(where)} · ${r.createdByUid === S.currentUid() ? 'added by you' : 'added by someone in the deck'}</div>`;
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
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    say($('make-note'), 'Creating…');
    try {
      const made = await S.createDeck({
        name: $('make-name').value, password: $('make-pass').value,
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
    if (!addPark) return;
    const pt = mapPoint(e, $('add-mapwrap'));
    answerDraft = { park: addPark, x: pt.x, y: pt.y };
    placePin($('add-pin'), answerDraft);
    drawRing($('add-ring'), $('add-mapwrap').getBoundingClientRect(), answerDraft, addPark);
    refreshAddSubmit();
  };
  $('add-photo').onchange = refreshAddSubmit;

  $('form-add').onsubmit = async (e) => {
    e.preventDefault();
    if (!addPark) { say($('add-note'), 'Pick the park it was taken in.', 'bad'); return; }
    if (!answerDraft) { say($('add-note'), 'Tap the map to mark the spot.', 'bad'); return; }
    $('add-submit').disabled = true;
    say($('add-note'), 'Uploading…');
    try {
      await S.addRound(deck.id, {
        photoFile: $('add-photo').files[0],
        park: addPark,
        answer: answerDraft,
        label: $('add-label').value,
      });
      $('form-add').reset();
      resetAddForm();
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
