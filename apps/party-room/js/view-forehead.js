/* Forehead on screen: the full-screen card the guesser holds up, the view
 * everyone else gets in a room, and the one-phone game with no room at all.
 */
import { FOREHEAD_DECKS } from './decks.js';
import { screenUp, tiltLatch, deal, currentCard, TURN_MS, COUNTDOWN_MS } from './forehead.js';
import { esc, sound, buzz, unlockAudio, secondsLeft } from './ui.js';
import { arr } from './room.js';

/* iOS asks before handing out the motion sensors, and only from a tap. */
export async function requestMotion() {
  unlockAudio();
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
  }
  return 'DeviceOrientationEvent' in window;
}

/* The card on your forehead. Runs off deadlines rather than its own timer,
 * so in a room it agrees with every other phone about when time is up.
 */
export function runForehead({ cards, startsAt, deadline, now, marked = 0, onMark, onExit, deckName }) {
  const el = document.createElement('div');
  el.className = 'fh';
  el.innerHTML = `
    <button class="fh-x" aria-label="Stop">✕</button>
    <div class="fh-time"></div>
    <div class="fh-card"><div class="fh-word"></div><div class="fh-sub"></div></div>
    <div class="fh-tap"><button class="fh-pass">Pass</button><button class="fh-got">Got it</button></div>`;
  document.body.appendChild(el);
  const word = el.querySelector('.fh-word'), sub = el.querySelector('.fh-sub'), time = el.querySelector('.fh-time');
  let idx = marked, lockUntil = 0, done = false, wake = null, lastSec = -1;
  const results = [];

  try { navigator.wakeLock && navigator.wakeLock.request('screen').then((w) => { wake = w; }).catch(() => {}); } catch { /* fine */ }
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch { /* fine */ }

  function mark(ok) {
    const t = now();
    if (done || t < startsAt || t < lockUntil || idx >= cards.length) return;
    results.push({ card: cards[idx], ok });
    onMark && onMark(idx, ok);
    idx++;
    lockUntil = t + 700;
    el.dataset.flash = ok ? 'got' : 'pass';
    word.textContent = ok ? 'Got it!' : 'Pass';
    sub.textContent = '';
    sound(ok ? 'good' : 'bad');
    buzz(ok ? 40 : [20, 40, 20]);
  }

  const latch = tiltLatch();
  const onTilt = (e) => {
    const r = latch(screenUp(e.beta, e.gamma));
    if (r) mark(r === 'got');
  };
  window.addEventListener('deviceorientation', onTilt);
  el.querySelector('.fh-got').addEventListener('click', () => mark(true));
  el.querySelector('.fh-pass').addEventListener('click', () => mark(false));
  el.querySelector('.fh-x').addEventListener('click', () => { stop(); onExit && onExit(results); });

  function frame() {
    if (done) return;
    const t = now();
    if (t < startsAt) {
      el.dataset.state = 'count';
      const n = Math.ceil((startsAt - t) / 1000);
      if (n !== lastSec) { lastSec = n; sound('tick'); }
      word.textContent = String(n);
      sub.textContent = `Phone on your forehead, screen facing out · ${deckName || ''}`;
      time.textContent = '';
    } else if (t < deadline && idx < cards.length) {
      el.dataset.state = 'play';
      if (t >= lockUntil) {
        delete el.dataset.flash;
        word.textContent = cards[idx];
        sub.textContent = 'Nod down if you got it · tip up to pass';
      }
      const s = secondsLeft(deadline, t);
      time.textContent = String(s);
      if (s <= 5 && s !== lastSec) { lastSec = s; sound('tick'); }
    } else {
      el.dataset.state = 'over';
      delete el.dataset.flash;
      word.textContent = "Time's up!";
      sub.textContent = '';
      time.textContent = '';
      sound('end');
      done = true;
      setTimeout(() => { stop(); onExit && onExit(results, true); }, 1400);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function stop() {
    done = true;
    window.removeEventListener('deviceorientation', onTilt);
    try { wake && wake.release(); } catch { /* fine */ }
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch { /* fine */ }
    el.remove();
  }
  return { stop, get open() { return el.isConnected; } };
}

const tally = (results) => {
  const r = arr(results);
  return { got: r.filter((x) => x).length, pass: r.filter((x) => !x).length };
};

function resultsList(cards, results) {
  const r = arr(results);
  if (!r.length) return '<p class="muted">No cards this time.</p>';
  return `<ul class="fh-results">${r.map((ok, i) => `<li class="${ok ? 'got' : 'pass'}">${ok ? '✓' : '✗'} ${esc(cards[i])}</li>`).join('')}</ul>`;
}

/* ── in a room ───────────────────────────────────────────────────────────── */

export function mount(stage, api) {
  stage.innerHTML = '<div class="forehead"></div>';
  const el = stage.firstChild;
  let player = null, s = null;

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-go]')) {
      e.target.closest('[data-go]').disabled = true;
      await requestMotion();
      api.send({ t: 'go' });
    }
  });

  function update(next) {
    s = next;
    const p = s.pub, me = s.me, deck = FOREHEAD_DECKS[p.deck] || FOREHEAD_DECKS.animals;
    const name = s.names[p.guesser] || 'Someone';
    const mine = p.guesser === me;

    if (p.phase === 'playing' && mine && !player) {
      player = runForehead({
        cards: arr(p.cards), startsAt: p.startsAt, deadline: p.deadline, now: api.now,
        marked: arr(p.results).length, deckName: deck.name,
        onMark: (i, ok) => api.send({ t: 'mark', i, ok }),
        onExit: () => { player = null; },
      });
    }
    if (p.phase !== 'playing' && player) { player.stop(); player = null; }

    const head = `<div class="kicker">${deck.emoji} ${esc(deck.name)} · turn ${p.turn + 1} of ${p.turns}</div>`;
    if (p.phase === 'ready') {
      el.innerHTML = mine ? `${head}
        <div class="panel center">
          <h2>You're up!</h2>
          <p>Hold your phone on your forehead with the screen facing out. Everyone else gets you to say the word: ${esc(deck.how.toLowerCase())}.</p>
          <div class="howto"><span>⬇️ Nod down: got it</span><span>⬆️ Tip up: pass</span></div>
          <p class="muted">No tilt sensor? Tap the right side for got it, the left side to pass.</p>
          <button class="btn big yellow" data-go>I'm ready</button>
        </div>` : `${head}
        <div class="panel center"><h2>${esc(name)} is up</h2>
          <p>When they start, the word shows up here too. ${esc(deck.how)} so they say it!</p>
          <div class="spinner"></div></div>`;
    } else if (p.phase === 'playing') {
      const t = tally(p.results);
      const card = currentCard(p, arr(p.results).length);
      el.innerHTML = mine ? `${head}<div class="panel center"><h2>Phone up!</h2><p>Your word is on the screen.</p></div>` : `${head}
        <div class="panel center fh-mirror">
          <p>Get <b>${esc(name)}</b> to say</p>
          <div class="mirror-word" data-start="${p.startsAt}" data-card="${esc(card || 'All done!')}"></div>
          <div class="tally"><span class="good">✓ ${t.got}</span><span class="bad">✗ ${t.pass}</span></div>
        </div>`;
    } else if (p.phase === 'turnover') {
      const t = tally(p.results);
      el.innerHTML = `${head}<div class="panel center">
        <h2>${mine ? 'You' : esc(name)} got ${t.got}!</h2>
        ${resultsList(arr(p.cards), p.results)}
        <div class="tbar" data-deadline="${p.deadline}" data-span="8000"></div></div>`;
    }
    paintMirror();
  }

  // Before the countdown ends, others see a countdown too, not the word.
  function paintMirror() {
    const w = el.querySelector('.mirror-word');
    if (!w) return;
    const left = Number(w.dataset.start) - api.now();
    w.classList.toggle('counting', left > 0);
    w.textContent = left > 0 ? String(Math.ceil(left / 1000)) : w.dataset.card;
  }
  const timer = setInterval(paintMirror, 200);

  return {
    update,
    destroy() { clearInterval(timer); if (player) player.stop(); },
  };
}

/* ── one phone, no room ──────────────────────────────────────────────────── */

export function soloScreen(root, { onHome }) {
  let deckId = null;

  function menu() {
    root.innerHTML = `
      <header class="bar"><button class="ghost" data-home>← Home</button><span>Forehead</span><span></span></header>
      <div class="panel">
        <h2>Pick a deck</h2>
        <p class="muted">Hold the phone on your forehead, screen facing out. Everyone else gets you to say what's on it. Nod down when you get it, tip up to pass. One minute per turn.</p>
        <div class="decks">${Object.entries(FOREHEAD_DECKS).map(([id, d]) => `
          <button class="deck" data-deck="${id}"><span class="em">${d.emoji}</span><b>${esc(d.name)}</b><small>${esc(d.how)}</small></button>`).join('')}
        </div>
      </div>`;
  }

  function results(cards, res) {
    const got = res.filter((r) => r.ok).length;
    root.innerHTML = `
      <header class="bar"><button class="ghost" data-home>← Home</button><span>Forehead</span><span></span></header>
      <div class="panel center">
        <h2>${got} ${got === 1 ? 'card' : 'cards'}!</h2>
        <ul class="fh-results">${res.map((r) => `<li class="${r.ok ? 'got' : 'pass'}">${r.ok ? '✓' : '✗'} ${esc(r.card)}</li>`).join('') || '<li class="muted">Nothing marked.</li>'}</ul>
        <div class="row gap"><button class="btn yellow" data-again>Next player</button><button class="btn" data-menu>Other deck</button></div>
      </div>`;
  }

  async function play(id) {
    deckId = id;
    await requestMotion();
    const cards = deal(id);
    const t0 = Date.now();
    runForehead({
      cards, startsAt: t0 + COUNTDOWN_MS, deadline: t0 + COUNTDOWN_MS + TURN_MS, now: () => Date.now(),
      deckName: FOREHEAD_DECKS[id].name,
      onExit: (res) => results(cards, res),
    });
  }

  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-deck]');
    if (d) return play(d.dataset.deck);
    if (e.target.closest('[data-again]')) return play(deckId);
    if (e.target.closest('[data-menu]')) return menu();
    if (e.target.closest('[data-home]')) return onHome();
  });
  menu();
  return { menu };
}

