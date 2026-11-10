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
  centreFor, peepLayout, revealAt, judgeGuess, scoreRound,
} from './game.js';
import { PARK_CENTRES, judgeGeo, offWords, parkAt, isPoint, WITHIN_M } from './geo.js';

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
  pickedPark = null;
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

/* A round can be dealt if it can be judged: real coordinates, or a pin on a
 * park map that still exists. Rounds made before the built-in maps pinned
 * against artwork that is gone, and have neither.
 */
const playable = (r) => !!r && (isPoint(r.at) || (!!r.answer && isPark(r.answer.park)));

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
  /* A new opening every time, so a photo that comes round again is still a
   * puzzle rather than a memory test. Where the round carries a region, the
   * opening is drawn from inside it: still different every deal, but never
   * on the blank sky or the flat side of a building.
   */
  centre = centreFor(round.start);

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
  show($('geowrap'), false);
  $('geo-note').hidden = true;
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
/* ── the real map ──────────────────────────────────────────────────────────
 *
 * A round carrying coordinates is guessed on an actual map and judged in
 * metres. A round without them is a round added before this existed, and
 * keeps the drawn map and the share-of-the-picture score it was made for.
 */
const isGeo = (r) => !!r && isPoint(r.at);

let geoMap = null;       // the Leaflet handle, once built
let geoFor = null;       // which park it is currently showing

async function showGeoMap(parkKey) {
  const box = $('geowrap');
  show(box, true);
  const centreOn = PARK_CENTRES[parkKey] || PARK_CENTRES.mk;

  try {
    if (!geoMap) {
      const { makeMap } = await import('./wamap.js');
      geoMap = await makeMap(box, {
        centre: centreOn,
        onPick: (p) => {
          if (settled) return;
          guess = p;
          geoMap.pin('guess', p);
          $('lockin').disabled = false;
          $('play-prompt').textContent = 'Lock it in, or tap somewhere else.';
        },
      });
    }
    if (geoFor !== parkKey) { geoMap.recentre(centreOn); geoFor = parkKey; }
    geoMap.pin('guess', null);
    geoMap.pin('answer', null);
    geoMap.ring(null);
    geoMap.lock(false);
    geoMap.resize();
    $('geo-note').hidden = false;
    $('geo-note').textContent = 'Drag and pinch the map, then tap the spot.';
  } catch (err) {
    /* No map is not no game: fall back to saying so rather than leaving a
     * blank box, because the tiles come off a network that may not be there.
     */
    show(box, false);
    $('geo-note').hidden = false;
    $('geo-note').textContent = `The map could not load (${err.message}). Skip this one for now.`;
  }
}

function choosePark(key) {
  if (settled) return;
  pickedPark = key;
  guess = null;
  drawParks($('park-pick'), key, choosePark);
  $('lockin').disabled = true;

  if (isGeo(round)) {
    show($('mapwrap'), false);
    $('play-prompt').textContent = `Where in ${PARKS[key].name}? Tap the map.`;
    showGeoMap(key);
    return;
  }

  show($('geowrap'), false);
  $('geo-note').hidden = true;
  $('map-img').src = `maps/${key}.webp`;
  show($('mapwrap'), true);
  show($('pin-guess'), false);
  $('play-prompt').textContent = `Where in ${PARKS[key].name}? Tap the map.`;
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

/* Settling a round that has real coordinates.
 *
 * The number shown is metres, which is the point of the whole thing: it
 * means the same in every park, it is what the photo's own GPS speaks, and
 * it does not depend on which drawing a deck happens to use.
 */
function settleGeo() {
  const answer = round.at;
  const verdict = judgeGeo(guess, answer);
  const got = scoreRound(verdict, taps);
  points += got;
  played += 1;

  const realPark = parkAt(answer) || round.park;
  drawParks($('park-pick'), realPark, () => {});

  if (geoMap) {
    geoMap.pin('answer', answer);
    geoMap.ring(answer, WITHIN_M);
    geoMap.frame([answer, guess]);
    geoMap.lock(true);
  }
  $('peep').classList.add('revealed');

  const v = $('verdict');
  v.className = 'wa-verdict ' + (verdict.within ? 'hit' : 'miss');
  const head = verdict.bullseye ? 'Nailed it'
    : verdict.within ? 'Close enough'
    : verdict.rightPark ? 'Right park, wrong spot'
    : 'Wrong park';
  v.innerHTML =
    `<h3>${head}</h3>` +
    `<p>${verdict.within ? `+${got} points` : 'No points'} · ` +
    `you were ${offWords(verdict.distance)} away` +
    (round.label ? ` · <strong>${esc(round.label)}</strong>` : '') + '</p>';
  show(v, true);
  show($('nextround'), true);
  $('geo-note').hidden = false;
  $('geo-note').textContent = `The green dot is the real spot, in ${(PARKS[realPark] || {}).name || 'the park'}.`;
  $('play-prompt').textContent = 'How close were you?';
  paintTaps();
}

function lockIn() {
  if (!guess || !pickedPark || settled) return;
  settled = true;
  $('lockin').disabled = true;
  $('widen').disabled = true;

  if (isGeo(round)) { settleGeo(); return; }

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

/* ── adding photos ─────────────────────────────────────────────────────────
 *
 * The old flow was one photo at a time: pick a file, pick a park, find the
 * spot on a drawing, submit, start again. Four decisions and a page reload's
 * worth of friction for each picture, which is why decks stayed small.
 *
 * Now the whole selection is a queue. Each photo needs two things and both
 * are a single gesture: drag a circle to where the round should open, and
 * take the location from the phone, the photo, or one tap on a map. The park
 * follows from the coordinates rather than being asked for.
 */
let addQueue = [];        // files still to deal with
let addAt = 0;            // which one is on screen
let addPark = null;
let addPoint = null;      // { lat, lng, from }
let addStart = null;      // { x, y, r } in normalised photo coordinates
let addMap = null;        // the Leaflet handle for the Add tab
let addUrl = null;        // object URL for the photo being shown

const addFile = () => addQueue[addAt] || null;

function refreshAddSubmit() {
  const ready = !!addFile() && !!addPoint && !!addStart;
  $('add-save').disabled = !ready;
}

/* The circle. Dragging moves it, the slider sizes it, and both are stored in
 * normalised coordinates so the region means the same thing whatever size
 * the photo is displayed at.
 */
function paintCircle() {
  const wrap = $('add-startwrap');
  const el = $('add-circle');
  const img = $('add-preview');
  if (!addStart || !img.naturalWidth) { show(el, false); return; }

  const box = img.getBoundingClientRect();
  const wrapBox = wrap.getBoundingClientRect();
  // The radius is a fraction of the shorter side, so a region keeps its size
  // and its shape on a photo of any proportion.
  const px = addStart.r * Math.min(box.width, box.height);
  el.style.width = `${px * 2}px`;
  el.style.height = `${px * 2}px`;
  el.style.left = `${(box.left - wrapBox.left) + addStart.x * box.width - px}px`;
  el.style.top = `${(box.top - wrapBox.top) + addStart.y * box.height - px}px`;
  show(el, true);
}

function setCircleFrom(e) {
  const img = $('add-preview');
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const p = e.touches ? e.touches[0] : e;
  const r = addStart ? addStart.r : Number($('add-size').value) / 100;
  addStart = {
    x: Math.min(Math.max((p.clientX - box.left) / box.width, 0), 1),
    y: Math.min(Math.max((p.clientY - box.top) / box.height, 0), 1),
    r,
  };
  paintCircle();
  refreshAddSubmit();
}

function sayWhere() {
  const el = $('add-where');
  if (!addPoint) { el.textContent = 'Where was it taken?'; return; }
  const where = addPark ? PARKS[addPark].name : 'outside the parks';
  const how = addPoint.from === 'gps' ? 'from this phone'
    : addPoint.from === 'exif' ? 'from the photo itself'
    : 'from your tap';
  el.textContent = `${where}, ${how}.`;
}

/* Which park, when the coordinates do not say.
 *
 * A photo taken at the hotel, or just outside the gates, still belongs to a
 * deck and is still worth guessing; it just needs telling which park it goes
 * with. The coordinates stay exactly as they were: this names the round, it
 * does not move it.
 */
function pickAddPark(key) {
  addPark = key;
  drawParks($('add-park-pick'), key, pickAddPark);
  sayWhere();
  refreshAddSubmit();
}

function usePoint(point, from) {
  addPoint = { lat: point.lat, lng: point.lng, from };
  const inPark = parkAt(addPoint);
  if (inPark) addPark = inPark;
  drawParks($('add-park-pick'), addPark, pickAddPark);
  if (addMap) { addMap.pin('answer', addPoint); addMap.recentre(addPoint, 17); }
  sayWhere();
  refreshAddSubmit();
}

async function showAddMap() {
  const box = $('add-geowrap');
  show(box, true);
  try {
    if (!addMap) {
      const { makeMap } = await import('./wamap.js');
      addMap = await makeMap(box, {
        centre: addPoint || PARK_CENTRES[addPark || 'mk'],
        onPick: (p) => usePoint(p, 'map'),
      });
    }
    addMap.resize();
    if (addPoint) { addMap.pin('answer', addPoint); addMap.recentre(addPoint, 17); }
  } catch (err) {
    show(box, false);
    say($('add-note'), `The map could not load: ${err.message}`, 'bad');
  }
}

/* Show the photo at `addAt`, with whatever we can work out about it already.
 *
 * The location is tried from the photo's own metadata first, because it costs
 * nothing and is right when it is there. It usually is not: iOS strips GPS
 * from anything that goes through a file input, so this is a bonus rather
 * than the mechanism, and the buttons are what actually get used.
 */
async function showAddPhoto() {
  const file = addFile();
  const queueBox = $('add-queue');
  if (!file) {
    show(queueBox, false);
    say($('add-note'), addQueue.length ? 'All done. Pick more photos to carry on.' : '', 'good');
    drawRoundList();
    return;
  }

  show(queueBox, true);
  addPoint = null;
  addPark = null;
  addStart = null;
  $('add-label').value = '';
  $('add-count').textContent = `Photo ${addAt + 1} of ${addQueue.length}`;
  drawParks($('add-park-pick'), null, pickAddPark);
  sayWhere();
  refreshAddSubmit();

  if (addUrl) URL.revokeObjectURL(addUrl);
  addUrl = URL.createObjectURL(file);
  const img = $('add-preview');
  img.onload = () => {
    // A sensible default region in the middle, so the circle is visible and
    // draggable rather than something you have to discover by tapping.
    addStart = { x: 0.5, y: 0.5, r: Number($('add-size').value) / 100 };
    paintCircle();
    refreshAddSubmit();
  };
  img.src = addUrl;

  try {
    const { gpsFromFile } = await import('./exif.js');
    const found = await gpsFromFile(file);
    if (found && addFile() === file) usePoint(found, 'exif');
  } catch { /* no metadata is the normal case, not a failure */ }
}

function resetAddForm() {
  addQueue = [];
  addAt = 0;
  addPoint = null;
  addPark = null;
  addStart = null;
  if (addUrl) { URL.revokeObjectURL(addUrl); addUrl = null; }
  show($('add-queue'), false);
  show($('add-geowrap'), false);
  $('add-photo').value = '';
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

  /* Dragging the circle. Pointer events rather than mouse or touch, so one
   * path covers a finger, a trackpad and a stylus; `setPointerCapture` keeps
   * the drag alive when the finger leaves the photo, which otherwise strands
   * the circle wherever it was when contact was lost.
   */
  {
    const wrap = $('add-startwrap');
    let dragging = false;
    wrap.addEventListener('pointerdown', (e) => {
      if (!addFile()) return;
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      setCircleFrom(e);
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => { if (dragging) setCircleFrom(e); });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      try { wrap.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };
    wrap.addEventListener('pointerup', stop);
    wrap.addEventListener('pointercancel', stop);
  }

  $('add-size').oninput = () => {
    if (!addStart) return;
    addStart = { ...addStart, r: Number($('add-size').value) / 100 };
    paintCircle();
  };

  $('add-here').onclick = () => {
    if (!navigator.geolocation) {
      say($('add-note'), 'This browser will not share a location.', 'bad');
      return;
    }
    say($('add-note'), 'Asking for your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        usePoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'gps');
        say($('add-note'), '', '');
      },
      (err) => say($('add-note'), `No location: ${err.message}`, 'bad'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  $('add-pickmap').onclick = () => showAddMap();

  $('add-photo').onchange = () => {
    addQueue = [...($('add-photo').files || [])];
    addAt = 0;
    say($('add-note'), '', '');
    showAddPhoto();
  };

  $('add-skip').onclick = () => { addAt += 1; showAddPhoto(); };

  $('add-save').onclick = async () => {
    const file = addFile();
    if (!file || !addPoint || !addStart) return;
    $('add-save').disabled = true;
    say($('add-note'), `Uploading ${addAt + 1} of ${addQueue.length}…`);
    try {
      await S.addRound(deck.id, {
        photoFile: file,
        // A photo outside every park still belongs to a deck; it just has to
        // be told which park it goes with, and the picker above asks.
        park: addPark || parkAt(addPoint) || 'mk',
        at: addPoint,
        start: addStart,
        label: $('add-label').value,
      });
      addAt += 1;
      say($('add-note'), '', '');
      await refreshRounds();
      showAddPhoto();
    } catch (err) {
      say($('add-note'), err.message, 'bad');
      refreshAddSubmit();
    }
  };

  // The form has no submit button any more, but Enter in the label field
  // still counts as one and would reload the page.
  $('form-add').onsubmit = (e) => e.preventDefault();

  $('me-name').oninput = () => {
    try { localStorage.setItem('whereami.name', $('me-name').value); } catch { /* private mode */ }
  };

  $('leave-deck').onclick = leaveDeck;
}
