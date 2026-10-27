/* "1 to 10": the screen, played across phones.
 *
 * Everybody is holding their own device, so at any moment each phone shows
 * exactly one thing to do and everything else is out of the way. What that
 * one thing is comes from room.js's whatNow(), in one place, because the
 * fastest way to break a turn-based game is to let four screens each decide
 * for themselves whose turn it is.
 *
 * The secret number is never rendered on a screen that is not the picker's,
 * and never arrives on one either: it is not in the room document until the
 * reveal.
 */

import {
  SUBJECTS, PLACES, placesFor, topicFor, randomTopic,
  isValidGuess, scoreGuess, verdictFor, SCALE_MIN, SCALE_MAX,
} from './scale.js';
import {
  normaliseCode, codeProblem, cleanName, nameProblem,
  whatNow, isPicker, playerIds, guesserIds, canOpenGuessing,
} from './room.js';
import * as store from './roomstore.js';

const $ = (id) => document.getElementById(id);
const ME = 'disneyTrivia.scaleName';
const LAST = 'disneyTrivia.scaleRoom';

let room = null;
let code = null;
let unwatch = null;
let subject = 'ride';
let places = [];
let custom = '';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const recall = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

const screen = (name) => {
  for (const id of ['sc-lobby', 'sc-play']) $(id).hidden = id !== `sc-${name}`;
};

const panel = (name) => {
  for (const id of ['sc-wait', 'sc-pick', 'sc-ask', 'sc-answer', 'sc-guess', 'sc-reveal']) {
    $(id).hidden = id !== `sc-${name}`;
  }
};

const say = (el, msg) => { $(el).textContent = msg || ''; };

/* ── the lobby ───────────────────────────────────────────────────────────── */

async function doCreate() {
  const name = $('sc-name').value;
  const problem = nameProblem(name);
  if (problem) { say('sc-lobby-error', problem); return; }
  say('sc-lobby-error', '');
  busy(true);
  try {
    remember(ME, cleanName(name));
    const made = await store.createRoom(name);
    enterRoom(made);
  } catch (err) {
    say('sc-lobby-error', err.message);
  } finally { busy(false); }
}

async function doJoin() {
  const name = $('sc-name').value;
  const typed = normaliseCode($('sc-code').value);
  const np = nameProblem(name);
  const cp = codeProblem(typed);
  if (np) { say('sc-lobby-error', np); return; }
  if (cp) { say('sc-lobby-error', cp); return; }
  say('sc-lobby-error', '');
  busy(true);
  try {
    remember(ME, cleanName(name));
    await store.joinRoom(typed, name);
    enterRoom(typed);
  } catch (err) {
    say('sc-lobby-error', err.message);
  } finally { busy(false); }
}

const busy = (on) => {
  $('sc-create').disabled = on;
  $('sc-join').disabled = on;
};

function enterRoom(theCode) {
  code = theCode;
  remember(LAST, theCode);
  $('sc-roomcode').textContent = theCode;
  screen('play');
  if (unwatch) unwatch();
  unwatch = store.watch(theCode, (next) => {
    if (!next) {
      say('sc-play-error', 'The room has gone.');
      return;
    }
    room = next;
    render();
  }, (err) => say('sc-play-error', 'Lost the room: ' + err.message));
}

/* ── the builder, used by whoever is asking ──────────────────────────────── */

function drawSubjects() {
  const box = $('sc-subjects');
  const groups = [...new Set(SUBJECTS.map((s) => s.group))];
  box.replaceChildren(...groups.flatMap((g) => {
    const head = document.createElement('h4');
    head.textContent = g;
    const row = document.createElement('div');
    row.className = 'sc-chips';
    row.append(...SUBJECTS.filter((s) => s.group === g).map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.label;
      b.setAttribute('aria-pressed', String(s.id === subject));
      b.onclick = () => {
        subject = s.id;
        const allowed = new Set(placesFor(s.id));
        places = places.filter((p) => allowed.has(p));
        custom = '';
        $('sc-custom').value = '';
        drawSubjects(); drawPlaces(); drawPreview();
      };
      return b;
    }));
    return [head, row];
  }));
}

function drawPlaces() {
  const allowed = placesFor(subject);
  const box = $('sc-places');
  if (!allowed.length) {
    box.replaceChildren();
    say('sc-places-note', 'This one is not about anywhere in particular.');
    return;
  }
  say('sc-places-note', 'Leave them all off for "any park".');
  box.replaceChildren(...PLACES.filter((p) => allowed.includes(p.id)).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.label;
    b.setAttribute('aria-pressed', String(places.includes(p.id)));
    b.onclick = () => {
      places = places.includes(p.id) ? places.filter((x) => x !== p.id) : [...places, p.id];
      drawPlaces(); drawPreview();
    };
    return b;
  }));
}

const currentTopic = () => (custom.trim() ? custom.trim() : topicFor(subject, places));
const drawPreview = () => { $('sc-preview').textContent = currentTopic() || '—'; };

/* ── rendering the room ──────────────────────────────────────────────────── */

function render() {
  if (!room) return;
  const me = store.currentUid();
  const next = whatNow(room, me);

  drawPlayers();
  drawHistory();
  say('sc-instruction', next.say);
  $('sc-roundno').textContent = room.round ? `Round ${room.round.n}` : '';

  /* Shown on its own terms rather than as part of a panel. The picker is on
   * the "waiting for a question" panel for most of the asking phase, which
   * is exactly when they are most likely to want to call time. */
  $('sc-open-guessing').hidden = !canOpenGuessing(room, me);

  switch (next.do) {
    case 'pick':   panel('pick'); break;
    case 'ask':    panel('ask'); drawPreview(); break;
    case 'answer': panel('answer'); drawToAnswer(); break;
    case 'guess':  panel('guess'); drawToGuess(); break;
    case 'reveal': panel('reveal'); drawReveal(false); break;
    case 'next':   panel('reveal'); drawReveal(true); break;
    default:       panel('wait');
  }
}

function drawPlayers() {
  const box = $('sc-players');
  const ids = playerIds(room).sort((a, b) =>
    (room.players[b].score || 0) - (room.players[a].score || 0));
  box.replaceChildren(...ids.map((id) => {
    const el = document.createElement('div');
    el.className = 'sc-player';
    if (isPicker(room, id)) el.dataset.picker = 'yes';
    if (id === store.currentUid()) el.dataset.me = 'yes';
    el.innerHTML = `<span>${esc(room.players[id].name || '?')}</span><b>${room.players[id].score || 0}</b>`;
    return el;
  }));
}

function drawHistory() {
  const box = $('sc-history');
  const qs = (room.round && room.round.questions) || [];
  box.replaceChildren(...qs.map((q) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(q.topic)}</span>` +
      (typeof q.answer === 'string' ? `<b>${esc(q.answer) || '(nothing)'}</b>` : '<i>waiting…</i>');
    return li;
  }));
}

function drawToAnswer() {
  const qs = room.round.questions;
  $('sc-answer-topic').textContent = qs.length ? qs[qs.length - 1].topic : '';
}

function drawToGuess() {
  $('sc-guess-of').textContent = (room.players[room.round.pickerUid] || {}).name || '';
}

function drawReveal(done) {
  const r = room.round;
  const pickerName = (room.players[r.pickerUid] || {}).name || '';
  $('sc-reveal-who').textContent = pickerName;

  if (!done) {
    // The picker, with everyone's guesses in but the number not yet shown
    // to the room.
    $('sc-reveal-number').textContent = '?';
    $('sc-reveal-list').replaceChildren(...guesserIds(room).map((g) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${esc(room.players[g].name)}</span><b>${r.guesses[g]}</b>`;
      return li;
    }));
    $('sc-do-reveal').hidden = false;
    $('sc-next-round').hidden = true;
    return;
  }

  $('sc-reveal-number').textContent = String(r.secret);
  $('sc-reveal-list').replaceChildren(...guesserIds(room).map((g) => {
    const points = scoreGuess(r.guesses[g], r.secret);
    const li = document.createElement('li');
    li.dataset.good = points >= 3 ? 'yes' : 'no';
    li.innerHTML = `<span>${esc(room.players[g].name)}</span>` +
      `<em>${esc(verdictFor(r.guesses[g], r.secret))}</em>` +
      `<b>${r.guesses[g]}${points ? ` +${points}` : ''}</b>`;
    return li;
  }));
  $('sc-do-reveal').hidden = true;
  $('sc-next-round').hidden = false;
}

/* ── actions ─────────────────────────────────────────────────────────────── */

const guard = async (fn) => {
  try { say('sc-play-error', ''); await fn(); }
  catch (err) { say('sc-play-error', err.message || String(err)); }
};

export async function init() {
  await store.ready();

  $('sc-name').value = recall(ME);
  $('sc-create').onclick = doCreate;
  $('sc-join').onclick = doJoin;
  $('sc-code').oninput = (e) => { e.target.value = normaliseCode(e.target.value); };

  drawSubjects();
  drawPlaces();
  drawPreview();

  $('sc-custom').oninput = (e) => { custom = e.target.value; drawPreview(); };
  $('sc-shuffle').onclick = () => {
    custom = randomTopic();
    $('sc-custom').value = custom;
    drawPreview();
  };

  // Picking: the number goes to a document only this phone can read.
  $('sc-pick-pad').replaceChildren(...Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => {
    const n = SCALE_MIN + i;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.onclick = () => guard(() => store.commitNumber(code, room.round.n, n));
    return b;
  }));

  $('sc-send-topic').onclick = () => guard(async () => {
    const topic = currentTopic();
    if (!topic) return;
    await store.askQuestion(code, room, topic);
    custom = '';
    $('sc-custom').value = '';
  });

  $('sc-send-answer').onclick = () => guard(async () => {
    await store.answerQuestion(code, room, $('sc-answer-text').value);
    $('sc-answer-text').value = '';
  });
  $('sc-open-guessing').onclick = () => guard(() => store.openGuessing(code));

  $('sc-guess-pad').replaceChildren(...Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => {
    const n = SCALE_MIN + i;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.onclick = () => guard(() => store.submitGuess(code, n));
    return b;
  }));

  $('sc-do-reveal').onclick = () => guard(() => store.reveal(code, room));
  $('sc-next-round').onclick = () => guard(() => store.startNextRound(code, room));
  $('sc-leave').onclick = () => guard(async () => {
    if (unwatch) { unwatch(); unwatch = null; }
    await store.leave(code);
    room = null; code = null;
    remember(LAST, '');
    screen('lobby');
  });

  screen('lobby');
  // Coming back to a room you were already in, after a reload or a locked
  // phone. Rejoining is the same write as joining, so it is safe to repeat.
  const was = recall(LAST);
  if (was && recall(ME)) {
    $('sc-code').value = was;
    say('sc-lobby-note', `You were in room ${was}. Tap Join to go back.`);
  }
}

export function onShow() { if (room) render(); }
