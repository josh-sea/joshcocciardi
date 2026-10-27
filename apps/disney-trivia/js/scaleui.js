/* "1 to 10": the screen.
 *
 * Pass-and-play on one phone, which is how this actually gets played: one
 * person holds it, the other answers out loud. That makes hiding the secret
 * number the central UI problem rather than an afterthought, because the
 * person guessing is looking at the same screen as the person who knows.
 *
 * So the number lives behind a press-and-hold. It is never printed anywhere
 * the guesser can scroll back to, and the round only reveals it once a
 * guess is locked in.
 */

import {
  SUBJECTS, PLACES, placesFor, topicFor, randomTopic,
  secretNumber, isValidGuess, scoreGuess, verdictFor,
  SCALE_MIN, SCALE_MAX, DEFAULT_QUESTIONS,
} from './scale.js';

const $ = (id) => document.getElementById(id);

const STORE = 'disneyTrivia.scale';

let state = null;

const fresh = () => ({
  phase: 'setup',          // setup → asking → guessing → done
  secret: null,
  questions: DEFAULT_QUESTIONS,
  asked: [],               // topics read out so far
  subject: 'ride',
  places: [],
  custom: '',
  scores: { picker: 0, guesser: 0, rounds: 0 },
});

const load = () => {
  try {
    const raw = localStorage.getItem(STORE);
    const saved = raw ? JSON.parse(raw) : null;
    // Only the running tally survives a reload. A half-played round does
    // not: the secret would outlive the moment and whoever reloads could
    // simply read it.
    state = fresh();
    if (saved && saved.scores) state.scores = { ...state.scores, ...saved.scores };
  } catch { state = fresh(); }
};

const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify({ scores: state.scores })); }
  catch { /* private mode */ }
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ── the builder ─────────────────────────────────────────────────────────── */

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
      b.setAttribute('aria-pressed', String(s.id === state.subject));
      b.onclick = () => {
        state.subject = s.id;
        // Drop any place the new subject cannot take, rather than silently
        // keeping it and composing something the builder then ignores.
        const allowed = new Set(placesFor(s.id));
        state.places = state.places.filter((p) => allowed.has(p));
        drawSubjects();
        drawPlaces();
        drawPreview();
      };
      return b;
    }));
    return [head, row];
  }));
}

function drawPlaces() {
  const allowed = placesFor(state.subject);
  const box = $('sc-places');
  const note = $('sc-places-note');

  if (!allowed.length) {
    box.replaceChildren();
    note.textContent = 'This one is not about anywhere in particular.';
    return;
  }
  note.textContent = 'Leave them all off for "any park".';
  box.replaceChildren(...PLACES.filter((p) => allowed.includes(p.id)).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.label;
    b.setAttribute('aria-pressed', String(state.places.includes(p.id)));
    b.onclick = () => {
      state.places = state.places.includes(p.id)
        ? state.places.filter((x) => x !== p.id)
        : [...state.places, p.id];
      drawPlaces();
      drawPreview();
    };
    return b;
  }));
}

const currentTopic = () => (state.custom.trim() ? state.custom.trim() : topicFor(state.subject, state.places));

function drawPreview() {
  $('sc-preview').textContent = currentTopic() || '—';
}

/* ── the round ───────────────────────────────────────────────────────────── */

function show(phase) {
  state.phase = phase;
  for (const id of ['sc-setup', 'sc-asking', 'sc-guessing', 'sc-done']) {
    $(id).hidden = id !== `sc-${phase}`;
  }
}

function startRound() {
  state.secret = secretNumber();
  state.asked = [];
  $('sc-guess').value = '';
  $('sc-peek-out').textContent = '';
  $('sc-peek-out').dataset.shown = 'no';
  show('asking');
  nextTopic();
  drawAsked();
  drawTally();
}

/* The number, behind a press and hold.
 *
 * A tap would be too easy to do by accident while the phone is being passed
 * across, and a toggle would leave it on screen. Holding means the person
 * who knows has to be deliberately looking.
 */
function wirePeek() {
  const btn = $('sc-peek');
  const out = $('sc-peek-out');
  let timer = null;

  const reveal = (e) => {
    e.preventDefault();
    if (state.secret === null) return;
    out.textContent = String(state.secret);
    out.dataset.shown = 'yes';
    clearTimeout(timer);
    // Falls closed on its own, so a phone put down mid-round does not sit
    // there displaying the answer.
    timer = setTimeout(hide, 4000);
  };
  const hide = () => {
    clearTimeout(timer);
    out.textContent = '';
    out.dataset.shown = 'no';
  };

  btn.addEventListener('pointerdown', reveal);
  btn.addEventListener('pointerup', hide);
  btn.addEventListener('pointerleave', hide);
  btn.addEventListener('pointercancel', hide);
  // Keyboard: space or enter while held.
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') reveal(e); });
  btn.addEventListener('keyup', hide);
  btn.addEventListener('blur', hide);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function nextTopic() {
  const t = currentTopic();
  if (!t) return;
  state.asked.push(t);
  $('sc-current').textContent = t;
  $('sc-count').textContent = `Question ${state.asked.length} of ${state.questions}`;
  $('sc-ask-next').hidden = state.asked.length >= state.questions;
  $('sc-to-guess').hidden = state.asked.length < state.questions;
  drawAsked();
}

function drawAsked() {
  const box = $('sc-asked');
  box.replaceChildren(...state.asked.slice(0, -1).map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));
}

function lockGuess() {
  const n = Number($('sc-guess').value);
  const err = $('sc-guess-error');
  if (!isValidGuess(n)) {
    err.textContent = `A whole number from ${SCALE_MIN} to ${SCALE_MAX}.`;
    return;
  }
  err.textContent = '';

  const points = scoreGuess(n, state.secret);
  state.scores.guesser += points;
  state.scores.rounds += 1;
  save();

  $('sc-reveal-secret').textContent = String(state.secret);
  $('sc-reveal-guess').textContent = String(n);
  $('sc-verdict').textContent = verdictFor(n, state.secret);
  $('sc-points').textContent = points ? `+${points}` : 'no points';
  $('sc-points').dataset.good = points >= 3 ? 'yes' : 'no';
  $('sc-recap').replaceChildren(...state.asked.map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));
  drawTally();
  show('done');
}

function drawTally() {
  const { guesser, rounds } = state.scores;
  $('sc-tally').textContent = rounds
    ? `${guesser} points over ${rounds} round${rounds === 1 ? '' : 's'}`
    : '';
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

export function init() {
  load();
  drawSubjects();
  drawPlaces();
  drawPreview();
  drawTally();
  wirePeek();

  $('sc-custom').oninput = (e) => { state.custom = e.target.value; drawPreview(); };
  $('sc-shuffle').onclick = () => {
    state.custom = '';
    $('sc-custom').value = '';
    $('sc-preview').textContent = randomTopic();
    // A shuffled topic is a one-off: remember it so Next question does not
    // immediately rebuild from the chips underneath.
    state.custom = $('sc-preview').textContent;
    $('sc-custom').value = state.custom;
  };

  $('sc-questions').value = String(state.questions);
  $('sc-questions').onchange = (e) => {
    const n = Number(e.target.value);
    state.questions = Number.isFinite(n) && n >= 1 && n <= 9 ? n : DEFAULT_QUESTIONS;
  };

  $('sc-start').onclick = startRound;
  $('sc-ask-next').onclick = () => {
    // A fresh topic each question, unless they typed one on purpose.
    if (!$('sc-custom').value.trim()) state.custom = '';
    nextTopic();
  };
  $('sc-to-guess').onclick = () => { show('guessing'); $('sc-guess').focus(); };
  $('sc-lock').onclick = lockGuess;
  $('sc-guess').addEventListener('keydown', (e) => { if (e.key === 'Enter') lockGuess(); });
  $('sc-again').onclick = () => { show('setup'); drawPreview(); };
  $('sc-clear').onclick = () => {
    state.scores = { picker: 0, guesser: 0, rounds: 0 };
    save();
    drawTally();
  };

  show('setup');
}

export function onShow() { drawTally(); }
