/* Party Room: home, lobby, and whichever game is on.
 *
 * Whoever's phone is the host also runs the game (engine.js). Everyone,
 * the host included, sends what they did with send(); the host's own
 * moves skip the round trip through the database.
 */
import { signIn, createRoom, openRoom, serverNow } from './net.js';
import {
  GAMES, codeProblem, normaliseCode, cleanName, nameProblem, online, displayNames, pickHost, byJoin,
} from './room.js';
import { Host } from './engine.js';
import { Call } from './call.js';
import { mountCallBar } from './view-call.js';
import { FOREHEAD_DECKS, TRIVIA_CATEGORIES } from './decks.js';
import { questionPool, COUNTS } from './trivia.js';
import { TARGETS } from './chips.js';
import { ROUNDS as RACE_ROUNDS } from './race.js';
import { $, esc, toast, unlockAudio, sound, standingsHtml, paintTimers, secondsLeft } from './ui.js';
import * as foreheadView from './view-forehead.js';
import * as triviaView from './view-trivia.js';
import * as sketchView from './view-sketch.js';
import * as chipsView from './view-chips.js';
import * as raceView from './view-race.js';

const VIEWS = { forehead: foreheadView, trivia: triviaView, sketch: sketchView, chips: chipsView, race: raceView };

const S = {
  uid: null, room: null, host: null, inboxOff: null, hostTimer: 0,
  view: null, viewGame: null, names: {}, noteAt: 0, setup: null, overShown: false,
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* fine */ } },
};

function show(id) {
  for (const sc of document.querySelectorAll('.screen')) sc.hidden = sc.id !== id;
  // The video strip shrinks during a game, where the screen is busy.
  document.body.classList.toggle('in-game', id === 'play');
  window.scrollTo(0, 0);
}

/* ── home ────────────────────────────────────────────────────────────────── */

const nameIn = $('#name'), codeIn = $('#code'), homeErr = $('#homeErr');
nameIn.value = store.get('party.name') || '';
const linked = normaliseCode(new URLSearchParams(location.search).get('room'));
if (linked) {
  codeIn.value = linked;
  document.body.classList.add('invited');
}

function readName() {
  const problem = nameProblem(nameIn.value);
  if (problem) { homeErr.textContent = problem; nameIn.focus(); return null; }
  const n = cleanName(nameIn.value);
  store.set('party.name', n);
  return n;
}

async function busy(btn, fn) {
  unlockAudio();
  homeErr.textContent = '';
  btn.disabled = true;
  try { await fn(); } catch (e) { homeErr.textContent = e.message || String(e); } finally { btn.disabled = false; }
}

$('#create').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  const name = readName(); if (!name) return;
  S.uid = S.uid || await signIn();
  const code = await createRoom(S.uid);
  await enter(code, name);
}));

async function joinTyped(btn) {
  const name = readName(); if (!name) return;
  const problem = codeProblem(codeIn.value);
  if (problem) { homeErr.textContent = problem; codeIn.focus(); return; }
  await busy(btn, async () => {
    S.uid = S.uid || await signIn();
    await enter(normaliseCode(codeIn.value), name);
  });
}
$('#join').addEventListener('click', (e) => joinTyped(e.currentTarget));
codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTyped($('#join')); });
nameIn.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (codeIn.value.trim()) joinTyped($('#join')); else $('#create').click();
});

const solo = foreheadView.soloScreen($('#solo'), { onHome: () => show('home') });
$('#soloBtn').addEventListener('click', () => { unlockAudio(); solo.menu(); show('solo'); });

/* ── the room ────────────────────────────────────────────────────────────── */

async function enter(code, name) {
  const room = openRoom(code, S.uid);
  await room.join(name);
  S.room = room;
  store.sset('party.room', code);
  history.replaceState(null, '', `${location.pathname}?room=${code}${location.search.includes('emu') ? '&emu' : ''}`);
  room.onLive = (live) => { $('#live').hidden = live; };
  room.watch(onChange);
  $('#roomCode').textContent = code;
  startCallBar(room);
  show('lobby');
}

/* ── the video call ──────────────────────────────────────────────────────── */

function startCallBar(room) {
  const bar = $('#videoBar');
  const call = new Call(room, {
    onChange: () => {
      // Seven people turned video on at once: the last one in is told.
      if (call.on && call.full()) {
        call.stop().then(() => { call.error = 'The video call is full (6 people). You can still play.'; S.callBar.render(); });
        return;
      }
      S.callBar.render();
    },
  });
  S.call = call;
  S.callBar = mountCallBar(bar, call, { names: () => S.names });
  room.onLeave = () => call.stop();
  bar.hidden = false;
  S.callBar.render();
}

async function leave() {
  const room = S.room;
  if (!room) return;
  dropHost();
  closeView();
  S.room = null;
  store.sset('party.room', null);
  history.replaceState(null, '', location.pathname + (location.search.includes('emu') ? '?emu' : ''));
  document.body.classList.remove('invited');
  codeIn.value = '';
  $('#videoBar').hidden = true;
  $('#videoBar').replaceChildren();
  S.call = null;
  show('home');
  await room.leave().catch(() => {});
}
$('#leave').addEventListener('click', leave);

$('#share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${S.room.code}`;
  const text = `Join my Party Room! Code ${S.room.code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Party Room', text, url }); return; }
    await navigator.clipboard.writeText(`${text}: ${url}`);
    toast('Invite link copied');
  } catch { /* they closed the share sheet */ }
});

function onChange(key) {
  const room = S.room;
  if (!room) return;
  S.names = displayNames(room.players);
  if (key === 'meta' || key === 'players') syncHost();
  if (key === 'players' && S.call) S.call.sync();
  if (key === 'note' && room.note && room.note.at > S.noteAt) {
    S.noteAt = room.note.at;
    // A note left over from before a reload is old news.
    if (serverNow() - room.note.at < 20000) { toast(room.note.text); sound(/got it/i.test(room.note.text) ? 'good' : 'pop'); }
  }
  render();
}

/* ── being the host ──────────────────────────────────────────────────────── */

function syncHost() {
  const room = S.room;
  if (room.isHost() && !S.host) becomeHost();
  else if (!room.isHost() && S.host) dropHost();
}

async function becomeHost() {
  const room = S.room;
  const host = new Host(room, { players: () => online(room.players), now: serverNow });
  S.host = host;
  if (room.game) host.resume(room.game, await room.loadVault().catch(() => null));
  S.inboxOff = room.onInbox((m) => host.act(m.uid, m));
  S.hostTimer = setInterval(() => { host.tick().catch((e) => console.warn('tick', e)); }, 250);
}

function dropHost() {
  clearInterval(S.hostTimer);
  if (S.inboxOff) S.inboxOff();
  S.inboxOff = null;
  S.host = null;
}

/* If the host's phone drops out, the longest-standing player picks the
 * game up. Checked every couple of seconds rather than on every change,
 * so a host whose phone blinked for a moment gets it back.
 */
setInterval(() => {
  const room = S.room;
  if (!room || !room.meta || room.isHost()) return;
  const host = room.players && room.players[room.meta.host];
  if (host && host.online) return;
  if (pickHost(room.players, room.meta.host) === S.uid) room.claimHost().catch(() => {});
}, 2500);

function send(msg) {
  if (S.host) return S.host.act(S.uid, msg);
  return S.room.send(msg);
}

/* ── rendering ───────────────────────────────────────────────────────────── */

function closeView() {
  if (S.view) S.view.destroy();
  S.view = null;
  S.viewGame = null;
  $('#stage').innerHTML = '';
}

function render() {
  const room = S.room;
  if (!room) return;
  const pub = room.game;
  if (!pub || !GAMES[pub.game]) {
    if (S.view) closeView();
    S.overShown = false;
    renderLobby();
    if ($('#lobby').hidden) show('lobby');
    return;
  }
  if ($('#play').hidden) show('play');
  const g = GAMES[pub.game];
  $('#gameName').textContent = `${g.emoji} ${g.name}`;
  $('#endBtn').hidden = !room.isHost();
  const s = { pub, me: S.uid, names: S.names, secret: room.secret, online: online(room.players), isHost: room.isHost() };

  if (pub.phase === 'over') {
    if (S.view) closeView();
    renderOver(s);
    return;
  }
  S.overShown = false;
  if (S.viewGame !== pub.game) {
    closeView();
    S.view = VIEWS[pub.game].mount($('#stage'), { send, now: serverNow, room });
    S.viewGame = pub.game;
  }
  S.view.update(s);
  paintTimers($('#play'), serverNow());
}

function renderOver(s) {
  const html = `<div class="panel center over">
      <div class="confetti">🎉</div>
      <h2>Game over!</h2>
      ${standingsHtml(s.pub.scores, s.names, s.me, { badges: s.pub.wins })}
      ${s.isHost ? `<div class="row gap"><button class="btn big yellow" data-again>Play again</button>
        <button class="btn big" data-lobby>Pick another game</button></div>`
        : `<p class="muted">Waiting for ${esc(S.names[S.room.meta.host] || 'the host')} to pick what's next.</p>`}
    </div>`;
  const stage = $('#stage');
  if (!S.overShown) { sound('end'); S.overShown = true; }
  stage.innerHTML = html;
}

$('#stage').addEventListener('click', (e) => {
  if (!S.host || !S.room.game) return;
  if (e.target.closest('[data-again]')) S.host.start(S.room.game.game, S.room.game.opts || {});
  else if (e.target.closest('[data-lobby]')) S.host.stop();
});

$('#endBtn').addEventListener('click', () => {
  if (S.host && confirm('End this game for everyone?')) S.host.stop();
});

$('#scoresBtn').addEventListener('click', () => {
  const pub = S.room && S.room.game;
  const sheet = $('#scores');
  sheet.innerHTML = `<div class="sheet-card"><h2>Scores</h2>
    ${pub ? standingsHtml(pub.scores, S.names, S.uid) : ''}
    <button class="btn" data-close>Close</button></div>`;
  sheet.hidden = false;
});
$('#scores').addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) e.currentTarget.hidden = true;
});

/* The header timer and every bar on screen follow the server clock. */
setInterval(() => {
  const pub = S.room && S.room.game;
  const t = $('#timer');
  if (pub && pub.deadline && pub.phase !== 'over' && !$('#play').hidden) {
    const left = secondsLeft(pub.deadline, serverNow());
    t.textContent = `⏱ ${left}`;
    t.classList.toggle('low', left <= 5);
    t.hidden = false;
  } else t.hidden = true;
  if (!$('#play').hidden) paintTimers($('#play'), serverNow());
}, 200);

/* ── the lobby ───────────────────────────────────────────────────────────── */

function renderLobby() {
  const room = S.room;
  const me = S.uid, hostUid = room.meta && room.meta.host, iHost = room.isHost();
  const people = byJoin(room.players);
  $('#people').innerHTML = people.map((p) => `
    <li class="${p.online ? '' : 'away'}${p.uid === me ? ' me' : ''}">
      <span class="av" style="--h:${hue(p.uid)}">${esc((S.names[p.uid] || '?').slice(0, 1).toUpperCase())}</span>
      <span>${esc(S.names[p.uid])}${p.uid === me ? ' <em>(you)</em>' : ''}${p.uid === hostUid ? ' 👑' : ''}</span>
      ${p.online ? '' : '<small>away</small>'}</li>`).join('');
  const count = online(room.players).length;
  $('#pickTitle').textContent = iHost ? 'Pick a game' : `Waiting for ${S.names[hostUid] || 'the host'} to pick a game`;
  $('#menu').innerHTML = Object.entries(GAMES).map(([id, g]) => `
    <button class="game g-${id}${S.setup === id ? ' on' : ''}" data-game="${id}" ${iHost ? '' : 'disabled'}>
      <span class="em">${g.emoji}</span><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small>
      ${count < g.min ? `<i class="need">Needs ${g.min} players</i>` : ''}</button>`).join('');
  renderSetup();
}

function hue(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const opts = { forehead: { deck: 'animals' }, trivia: { category: 'mixed', count: 10 }, sketch: { rounds: 1 }, chips: { target: 5 }, race: { rounds: 3 } };

function chipRow(key, items, current) {
  return `<div class="pills">${items.map(([v, label]) => `
    <button class="pill${String(v) === String(current) ? ' on' : ''}" data-opt="${key}" data-val="${esc(v)}">${label}</button>`).join('')}</div>`;
}

function renderSetup() {
  const box = $('#setup');
  const id = S.setup;
  if (!id || !S.room.isHost()) { box.hidden = true; return; }
  const g = GAMES[id], o = opts[id];
  const count = online(S.room.players).length;
  let body = '';
  if (id === 'forehead') {
    body = `<h3>Deck</h3>${chipRow('deck', Object.entries(FOREHEAD_DECKS).map(([k, d]) => [k, `${d.emoji} ${esc(d.name)}`]), o.deck)}
      <p class="muted">Everyone takes a one-minute turn. Each turn shows up on every other phone too, so remote players can play along.</p>`;
  } else if (id === 'trivia') {
    const cats = [['mixed', '🎲 Everything'], ...Object.entries(TRIVIA_CATEGORIES).map(([k, c]) => [k, `${c.emoji} ${esc(c.name)}`])];
    body = `<h3>Category</h3>${chipRow('category', cats, o.category)}
      <h3>Questions</h3>${chipRow('count', COUNTS.filter((n) => n <= questionPool(o.category).length || n === COUNTS[0]).map((n) => [n, String(n)]), o.count)}`;
  } else if (id === 'sketch') {
    body = `<h3>Turns each</h3>${chipRow('rounds', [[1, '1'], [2, '2'], [3, '3']], o.rounds)}
      <p class="muted">80 seconds to draw. Guess fast for more points; the drawer scores for everyone who gets it.</p>`;
  } else if (id === 'chips') {
    body = `<h3>First to</h3>${chipRow('target', TARGETS.map((n) => [n, `${n} points`]), o.target)}
      <p class="muted">Everyone gets five dips. The judge changes every round.</p>`;
  } else if (id === 'race') {
    body = `<h3>Rounds</h3>${chipRow('rounds', RACE_ROUNDS.map((n) => [n, String(n)]), o.rounds)}
      <p class="muted">90 seconds a round, same eight letters on every phone. Longer words score more, and the first to find a 5, 6, 7 or 8-letter word gets a bonus.</p>`;
  }
  box.innerHTML = `<h2>${g.emoji} ${esc(g.name)}</h2>${body}
    <button class="btn big yellow" data-start ${count < g.min ? 'disabled' : ''}>${count < g.min ? `Needs ${g.min} players` : 'Start'}</button>`;
  box.hidden = false;
}

$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-game]');
  if (!b || !S.room.isHost()) return;
  S.setup = S.setup === b.dataset.game ? null : b.dataset.game;
  renderLobby();
  if (S.setup) $('#setup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('#setup').addEventListener('click', (e) => {
  const pill = e.target.closest('[data-opt]');
  const id = S.setup;
  if (pill && id) {
    const v = pill.dataset.val;
    opts[id][pill.dataset.opt] = /^\d+$/.test(v) ? Number(v) : v;
    if (id === 'trivia' && pill.dataset.opt === 'category') {
      const max = questionPool(opts.trivia.category).length;
      if (opts.trivia.count > max) opts.trivia.count = COUNTS.filter((n) => n <= max).pop() || COUNTS[0];
    }
    renderSetup();
    return;
  }
  if (e.target.closest('[data-start]') && S.host && id) {
    unlockAudio();
    S.host.start(id, { ...opts[id] });
    S.setup = null;
  }
});

/* ── coming back after a reload ──────────────────────────────────────────── */

(async () => {
  const code = store.sget('party.room');
  const name = store.get('party.name');
  if (!code || !name || (linked && linked !== code)) return;
  try {
    S.uid = await signIn();
    await enter(code, name);
  } catch {
    store.sset('party.room', null);
  }
})();

/* So a phone that slept through a turn catches up when it wakes. */
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
