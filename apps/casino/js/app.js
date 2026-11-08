/* Casino: the home screen, the blackjack and craps tables, the trainers.
 *
 * Practice is a table on this phone alone: the same engine a table with
 * friends uses, run by a Host against a local "room" that keeps the table
 * in memory (and in localStorage, so a reload keeps your shoe and chips).
 * Nothing goes over the network.
 *
 * With friends, the phone that opened the table is the host and runs the
 * engine; every other phone posts what it did to the table's inbox
 * (net.js, loaded only when you open or join one).
 */
import * as bj from './blackjack.js';
import { Host } from './host.js';
import { compLeft, runningCount, trueCount, idx } from './cards.js';
import { advise, why, cellKey, ACTION_NAME, INSURANCE_INDEX } from './strategy.js';
import { moveEVs, houseEdge } from './odds.js';
import { emptyStats, loadStats, recordDecision, recordRound, drillResult, emptyCraps, loadCraps, recordCrapsRoll } from './stats.js';
import * as craps from './craps.js';
import { houseEdge as crapsEdge } from './craps-odds.js';
import { mountCraps } from './craps-view.js';
import { learnScreen, payoutDrill } from './craps-learn.js';
import { codeProblem, normaliseCode, cleanName, nameProblem, online, pickHost } from './lobby.js';
import { renderTable, controlsHtml, hintHtml } from './table.js';
import { mountDrawer } from './drawer.js';
import { strategyDrill, countDrill, statsScreen } from './trainers.js';
import { $, esc, money, toast, unlockAudio, sound, setMuted, store, signed, buzz, setHtml } from './ui.js';

const ME = 'me';
const DEFAULT_SETTINGS = { hints: true, coach: true, showCount: false, deviations: false, sound: true, narrate: true, table3d: true, voice: true };
const SOLO_KEY = { blackjack: 'casino.solo', craps: 'casino.solo.craps' };
const TABLE_SCREEN = { blackjack: 'table', craps: 'craps' };

const S = {
  mode: null, uid: null, host: null, pub: null, vault: null, room: null, net: null,
  hostTimer: 0, inboxOff: null, bet: 0, betRound: -1, betSendTimer: 0, recorded: -1,
  feedback: null, peekCount: false, sitAt: 0, lastTurnKey: '', names: {},
  settings: { ...DEFAULT_SETTINGS, ...store.get('casino.settings', {}) },
  rules: bj.cleanRules(store.get('casino.rules', {})),
  crapsRules: craps.cleanRules(store.get('casino.crapsRules', {})),
  game: 'blackjack', newGame: store.get('casino.newGame', 'blackjack') === 'craps' ? 'craps' : 'blackjack', crapsLanded: -1,
  bank: store.get('casino.bank', 1000),
  session: emptyStats(),
  life: loadStats(store.get('casino.stats', null)),
  sessionStart: null,
};
setMuted(!S.settings.sound);
S.life.craps = loadCraps(S.life.craps);
S.session.craps = emptyCraps();
const newSession = () => { S.session = emptyStats(); S.session.craps = emptyCraps(); };

const saveStats = () => store.set('casino.stats', S.life);
const saveSettings = () => { store.set('casino.settings', S.settings); setMuted(!S.settings.sound); };

function show(id) {
  for (const sc of document.querySelectorAll('.screen')) sc.hidden = sc.id !== id;
  document.body.dataset.screen = id;
  if (id !== 'table') drawer.close();
  if (id !== 'craps') crapsView.close();
  window.scrollTo(0, 0);
}

/* ── home ────────────────────────────────────────────────────────────── */

const nameIn = $('#name'), codeIn = $('#code'), homeErr = $('#homeErr');
nameIn.value = store.get('casino.name', '') || '';
const linked = normaliseCode(new URLSearchParams(location.search).get('table'));
if (linked) { codeIn.value = linked; document.body.classList.add('invited'); $('#inviteCode').textContent = linked; }

function rulesHtml(r, editable) {
  const pills = (key, items) => `<div class="pills">${items.map(([v, l]) => `<button class="pill${String(r[key]) === String(v) ? ' on' : ''}" data-rule="${key}" data-val="${v}" ${editable ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;
  return `<div class="rules-grid">
    <label>Decks</label>${pills('decks', bj.DECK_CHOICES.map((d) => [d, String(d)]))}
    <label>Soft 17</label>${pills('h17', [[false, 'Dealer stands'], [true, 'Dealer hits']])}
    <label>Blackjack pays</label>${pills('bj', [[1.5, '3 to 2'], [1.2, '6 to 5']])}
    <label>Double after split</label>${pills('das', [[true, 'Yes'], [false, 'No']])}
    <label>Surrender</label>${pills('surrender', [[true, 'Late'], [false, 'None']])}
    <label>Minimum bet</label>${pills('min', [[1, '$1'], [5, '$5'], [10, '$10'], [25, '$25'], [100, '$100']])}
  </div><p class="small muted">House edge with perfect basic strategy: <b>${houseEdge(r).toFixed(2)}%</b>.</p>`;
}

function parseRule(b) {
  const v = b.dataset.val;
  return { [b.dataset.rule]: v === 'true' ? true : v === 'false' ? false : Number(v) };
}

function renderHome() {
  $('#bankPills').innerHTML = bj.BANK_CHOICES.map((n) => `<button class="pill${S.bank === n ? ' on' : ''}" data-bank="${n}">${money(n)}</button>`).join('')
    + `<input id="bankCustom" class="pill-input${bj.BANK_CHOICES.includes(S.bank) ? '' : ' on'}" type="number" inputmode="numeric" min="10" max="${bj.MAX_BANK}" placeholder="Other" value="${bj.BANK_CHOICES.includes(S.bank) ? '' : S.bank}" aria-label="Other amount">`;
  $('#homeRules').innerHTML = rulesHtml(S.rules, true);
  $('#crapsRules').innerHTML = crapsRulesHtml(S.crapsRules, true);
  const savedSeat = (game) => { const v = store.get(SOLO_KEY[game], null); return v && v.pub && v.pub.seats && v.pub.seats[ME]; };
  const seat = savedSeat('blackjack');
  $('#practice').innerHTML = seat ? `Continue practice <small>${money(seat.bank)} in chips</small>` : 'Practice <small>just you and the dealer</small>';
  $('#newSession').hidden = !seat;
  const cseat = savedSeat('craps');
  const cBank = cseat ? cseat.bank + Object.values(cseat.bets || {}).reduce((a, v) => a + v, 0) : 0;
  $('#crapsPractice').innerHTML = cseat ? `Continue practice <small>${money(cBank)} in chips</small>` : 'Practice <small>you roll, the narrator explains</small>';
  $('#crapsNew').hidden = !cseat;
  const lessonsDone = Object.keys(S.life.craps.lessons || {}).length;
  $('#learnBtn').innerHTML = lessonsDone ? `Learn to play <small>${lessonsDone} of 9 lessons done</small>` : 'Learn to play <small>new to craps? start here</small>';
  $('#gamePills').innerHTML = [['blackjack', '🂡 Blackjack'], ['craps', '🎲 Craps']].map(([g, l]) => `<button class="pill${S.newGame === g ? ' on' : ''}" data-newgame="${g}">${l}</button>`).join('');
  $('#homeLeak').innerHTML = S.life.hands ? `${S.life.hands} hands played${S.life.decisions ? ` · ${Math.round(S.life.correct / S.life.decisions * 100)}% by the chart` : ''}` : '';
}

$('#bankPills').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bank]');
  if (!b) return;
  S.bank = Number(b.dataset.bank);
  store.set('casino.bank', S.bank);
  renderHome();
});
$('#bankPills').addEventListener('change', (e) => {
  if (e.target.id !== 'bankCustom') return;
  S.bank = bj.cleanBank(e.target.value);
  store.set('casino.bank', S.bank);
  renderHome();
});
function crapsRulesHtml(r, editable) {
  const pills = (key, items) => `<div class="pills">${items.map(([v, l]) => `<button class="pill${String(r[key]) === String(v) ? ' on' : ''}" data-crule="${key}" data-val="${v}" ${editable ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;
  return `<div class="rules-grid">
    <label>Odds allowed</label>${pills('odds', [['1', '1×'], ['2', '2×'], ['345', '3-4-5×'], ['5', '5×'], ['10', '10×']])}
    <label>Field 12 pays</label>${pills('field12', [[3, '3 to 1'], [2, '2 to 1']])}
    <label>Minimum bet</label>${pills('min', [[1, '$1'], [5, '$5'], [10, '$10'], [25, '$25'], [100, '$100']])}
  </div><p class="small muted">More odds is better for you: the odds bet has no house edge, so the more of your money sits there, the less you pay overall.</p>`;
}

function parseCrule(b) {
  const v = b.dataset.val;
  return { [b.dataset.crule]: b.dataset.crule === 'odds' ? v : Number(v) };
}

$('#crapsRules').addEventListener('click', (e) => {
  const b = e.target.closest('[data-crule]');
  if (!b) return;
  S.crapsRules = craps.cleanRules({ ...S.crapsRules, ...parseCrule(b) }, S.crapsRules);
  store.set('casino.crapsRules', S.crapsRules);
  renderHome();
});
$('#gamePills').addEventListener('click', (e) => {
  const b = e.target.closest('[data-newgame]');
  if (!b) return;
  S.newGame = b.dataset.newgame;
  store.set('casino.newGame', S.newGame);
  renderHome();
});
$('#crapsPractice').addEventListener('click', () => { unlockAudio(); startSolo(false, 'craps'); });
$('#crapsNew').addEventListener('click', () => {
  if (!confirm(`Start a new craps session with ${money(S.bank)}?`)) return;
  unlockAudio();
  startSolo(true, 'craps');
});
$('#learnBtn').addEventListener('click', () => { unlockAudio(); show('learn'); learn.start(); });
$('#payoutBtn').addEventListener('click', () => { unlockAudio(); show('cdrill'); payouts.start(); });

$('#homeRules').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule]');
  if (!b) return;
  S.rules = bj.cleanRules({ ...S.rules, ...parseRule(b) }, S.rules);
  store.set('casino.rules', S.rules);
  renderHome();
});

$('#practice').addEventListener('click', () => { unlockAudio(); startSolo(false); });
$('#newSession').addEventListener('click', () => {
  if (!confirm(`Start over with ${money(S.bank)} and a fresh shoe?`)) return;
  unlockAudio();
  startSolo(true);
});
$('#drillBtn').addEventListener('click', () => { unlockAudio(); openDrill(); });
$('#countBtn').addEventListener('click', () => { unlockAudio(); show('count'); counter.start(); });
$('#statsBtn').addEventListener('click', () => openStats('home'));

/* ── the practice table ──────────────────────────────────────────────── */

function startSolo(fresh, game = 'blackjack') {
  leaveTable(true);
  S.mode = 'solo';
  S.uid = ME;
  S.game = game;
  crapsView.reset();
  const local = {
    writeGame(pub) { S.pub = pub; persistSolo(); render(); return Promise.resolve(); },
    writeVault(v) { S.vault = v; persistSolo(); return Promise.resolve(); },
  };
  const host = new Host(local, { players: () => [{ uid: ME }], now: () => Date.now(), hostUid: ME });
  S.host = host;
  const saved = fresh ? null : store.get(SOLO_KEY[game], null);
  S.recorded = saved && typeof saved.recorded === 'number' ? saved.recorded : -1;
  if (saved && host.resume(saved.pub, saved.vault) && host.world.pub.seats[ME]) {
    S.pub = host.world.pub;
    S.vault = host.world.vault;
  } else {
    host.start({ game, rules: game === 'craps' ? S.crapsRules : S.rules, timed: false });
    host.act(ME, { t: 'sit', bank: S.bank, name: 'You' });
    newSession();
    S.recorded = -1;
    S.sessionStart = S.bank;
  }
  if (S.sessionStart === null) S.sessionStart = S.pub.seats[ME].bank;
  S.hostTimer = setInterval(() => host.tick(), 120);
  S.title = game === 'craps' ? 'Practice craps' : 'Practice table';
  $('#tTitle').innerHTML = S.title;
  show(TABLE_SCREEN[game]);
  render();
}

function persistSolo() {
  if (S.mode !== 'solo') return;
  store.set(SOLO_KEY[S.game], { pub: S.pub, vault: S.vault, recorded: S.recorded });
}

/* ── a table with friends ────────────────────────────────────────────── */

async function loadNet() {
  if (!S.net) S.net = await import('./net.js');
  return S.net;
}

function readName() {
  const problem = nameProblem(nameIn.value);
  if (problem) { homeErr.textContent = problem; nameIn.focus(); return null; }
  const n = cleanName(nameIn.value);
  store.set('casino.name', n);
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
  const net = await loadNet();
  S.uid = await net.signIn();
  const code = await net.createRoom(S.uid);
  await enterTable(code, name, S.newGame);
}));

async function joinTyped(btn) {
  const name = readName(); if (!name) return;
  const problem = codeProblem(codeIn.value);
  if (problem) { homeErr.textContent = problem; codeIn.focus(); return; }
  await busy(btn, async () => {
    const net = await loadNet();
    S.uid = await net.signIn();
    await enterTable(normaliseCode(codeIn.value), name);
  });
}
$('#join').addEventListener('click', (e) => joinTyped(e.currentTarget));
codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTyped($('#join')); });

/* `creating` is the game to start when this phone opened the table; a
 * player joining finds out the game from the table itself.
 */
async function enterTable(code, name, creating = null) {
  leaveTable(true);
  S.creating = creating;
  const net = await loadNet();
  const room = net.openRoom(code, S.uid);
  await room.join(name);
  S.mode = 'multi';
  S.room = room;
  S.myName = name;
  newSession();
  S.sessionStart = S.bank;
  S.recorded = -1;
  crapsView.reset();
  store.sset('casino.table', code);
  history.replaceState(null, '', `${location.pathname}?table=${code}${location.search.includes('emu') ? '&emu' : ''}`);
  room.onLive = (live) => { $('#live').hidden = live; };
  room.watch(onRoomChange);
  S.title = `Table <b class="code">${code}</b> <button class="btn tiny gold" data-invite>Invite</button>`;
  $('#tTitle').innerHTML = S.title;
  S.game = S.creating || 'blackjack';
  show(TABLE_SCREEN[S.game]);
}

function onRoomChange(key) {
  const room = S.room;
  if (!room) return;
  S.names = {};
  for (const p of online(room.players)) S.names[p.uid] = p.name;
  if (key === 'meta' || key === 'players') syncHost();
  const g = room.game && room.game.game === 'craps' ? 'craps' : 'blackjack';
  S.pub = room.game ? (g === 'craps' ? craps : bj).normalise(JSON.parse(JSON.stringify(room.game))) : null;
  if (S.pub && S.game !== g) { S.game = g; show(TABLE_SCREEN[g]); }
  render();
}

function syncHost() {
  const room = S.room;
  if (room.isHost() && !S.host) becomeHost();
  else if (!room.isHost() && S.host) dropHost();
}

async function becomeHost() {
  const room = S.room;
  const host = new Host(room, { players: () => online(room.players), now: S.net.serverNow, hostUid: S.uid });
  S.host = host;
  const ok = room.game && host.resume(room.game, await room.loadVault().catch(() => null));
  const blackjackWithoutShoe = ok && host.world.pub.game === 'blackjack' && !(host.world.vault && host.world.vault.shoe);
  if (!ok || blackjackWithoutShoe) {
    const game = S.creating || 'blackjack';
    await host.start({ game, rules: game === 'craps' ? S.crapsRules : S.rules, timed: true });
  }
  S.inboxOff = room.onInbox((m) => host.act(m.uid, m));
  S.hostTimer = setInterval(() => { host.tick().catch((e) => console.warn('tick', e)); }, 200);
}

function dropHost() {
  clearInterval(S.hostTimer);
  if (S.inboxOff) S.inboxOff();
  S.inboxOff = null;
  S.host = null;
}

/* If the host's phone drops out, whoever has been at the table longest
 * picks it up, from the same shoe.
 */
setInterval(() => {
  const room = S.room;
  if (!room || !room.meta || room.isHost()) return;
  const h = room.players && room.players[room.meta.host];
  if (h && h.online) return;
  if (pickHost(room.players, room.meta.host) === S.uid) room.claimHost().catch(() => {});
}, 2500);

function send(msg) {
  if (S.mode === 'solo' || S.host) return S.host.act(S.uid, msg);
  if (S.room) return S.room.send(msg);
  return Promise.resolve();
}

function leaveTable(quiet) {
  clearInterval(S.hostTimer);
  if (S.inboxOff) S.inboxOff();
  S.inboxOff = null;
  const room = S.room;
  if (room) {
    room.send({ t: 'up' }).catch(() => {});
    room.leave().catch(() => {});
    store.sset('casino.table', null);
    history.replaceState(null, '', location.pathname + (location.search.includes('emu') ? '?emu' : ''));
    document.body.classList.remove('invited');
  }
  S.room = null; S.host = null; S.pub = null; S.mode = null; S.feedback = null; S.creating = null;
  if (!quiet) { renderHome(); show('home'); }
}

$('#tLeave').addEventListener('click', () => {
  if (S.mode === 'multi' && !confirm('Leave this table? Your chips here stay at the table.')) return;
  leaveTable(false);
});

/* ── what the odds and the hints need ────────────────────────────────── */

function myHand() {
  const pub = S.pub;
  if (!pub || pub.phase !== 'play' || !pub.turn || pub.turn.uid !== S.uid) return null;
  return pub.seats[S.uid].hands[pub.turn.h] || null;
}

function countNow() {
  const pub = S.pub;
  const comp = compLeft(pub.rules.decks, pub.shoe.seen);
  const rc = runningCount(pub.shoe.seen);
  const cardsLeft = pub.shoe.left || 0;
  return { comp, rc, cardsLeft, tc: trueCount(rc, cardsLeft) };
}

function adviceNow() {
  const hand = myHand();
  if (!hand) return null;
  const pub = S.pub;
  const can = bj.moves(pub, S.uid);
  const c = countNow();
  const a = advise(hand.cards, bj.upcard(pub), pub.rules, can, { counting: S.settings.deviations, rc: c.rc, cardsLeft: c.cardsLeft });
  a.whyText = why(a.cell, a.action);
  return a;
}

function situation() {
  const pub = S.pub;
  const c = countNow();
  const hand = myHand();
  return {
    pub, rules: pub.rules, phase: pub.phase, up: bj.upcard(pub), hand,
    can: bj.moves(pub, S.uid), advice: adviceNow(), ...c,
    showCount: S.settings.showCount, peekCount: S.peekCount,
  };
}

/* ── rendering ───────────────────────────────────────────────────────── */

function render() {
  const pub = S.pub;
  if (pub && pub.game === 'craps') { renderCraps(); return; }
  if (!pub || $('#table').hidden) return;
  const seat = pub.seats[S.uid];

  // Keep the bet in step with the table between rounds.
  if (seat && pub.phase === 'betting' && S.betRound !== pub.round) { S.bet = seat.bet; S.betRound = pub.round; }
  if (seat && S.bet > seat.bank) S.bet = Math.floor(seat.bank);

  // A seat for you, if there is one.
  if (S.mode === 'multi' && !seat && pub.order.length < bj.MAX_SEATS && Date.now() - S.sitAt > 4000) {
    S.sitAt = Date.now();
    send({ t: 'sit', bank: S.bank, name: S.myName });
  }

  recordIfSettled();

  const hostUid = S.mode === 'multi' && S.room && S.room.meta ? S.room.meta.host : S.uid;
  const onlineUids = S.mode === 'multi' ? online(S.room.players).map((p) => p.uid) : [S.uid];
  renderTable($('#table'), { pub, me: S.uid, names: S.names, hostUid, online: onlineUids });

  const can = bj.moves(pub, S.uid);
  const advice = adviceNow();
  let hint = null;
  if (S.settings.hints && advice) hint = advice.dev ? advice.dev.action : advice.action;
  if (S.settings.hints && pub.phase === 'insurance') hint = S.settings.deviations && Math.floor(countNow().tc) >= INSURANCE_INDEX ? 'I' : 'N';
  setHtml($('#controls'), controlsHtml({ pub, me: S.uid, can, pendingBet: S.bet, multi: S.mode === 'multi', hint, names: S.names }));
  $('#tBank').textContent = seat ? money(seat.bank - (pub.phase === 'betting' ? S.bet : 0)) : '';

  // Hints and the coach's last word.
  const lines = [];
  if (S.settings.hints && advice) lines.push(hintHtml(advice));
  if (S.settings.hints && pub.phase === 'insurance' && seat && bj.inRound(seat) && seat.ins === null) {
    const c = countNow();
    const take = S.settings.deviations && Math.floor(c.tc) >= INSURANCE_INDEX;
    lines.push(`<div class="hint">💡 <b>${take ? 'Take insurance' : 'No insurance'}</b> <span class="muted">· ${take ? `true count ${signed(c.tc, 1)} is +${INSURANCE_INDEX} or more` : 'it only pays when over a third of the cards left are tens'}</span></div>`);
  }
  if (S.feedback && Date.now() - S.feedback.at < 9000) lines.push(`<div class="coachline ${S.feedback.ok ? 'yes' : 'no'}">${S.feedback.html}</div>`);
  if (S.settings.showCount) {
    const c = countNow();
    lines.push(`<div class="countline">Count <b>${signed(c.rc, 0)}</b> · true <b>${signed(c.tc, 1)}</b> · ${(c.cardsLeft / 52).toFixed(1)} decks left</div>`);
  }
  if (pub.say && pub.say.text && (Date.now() - (pub.say.at || 0) < 6000 || S.mode === 'solo') && pub.phase !== 'play') lines.push(`<div class="say">${esc(pub.say.text)}</div>`);
  setHtml($('#coach'), lines.join(''));

  // Your turn at a busy table: a little nudge.
  const turnKey = pub.turn && pub.turn.uid === S.uid ? `${pub.round}:${pub.turn.h}` : '';
  if (turnKey && turnKey !== S.lastTurnKey && S.mode === 'multi') { sound('turn'); buzz(40); }
  S.lastTurnKey = turnKey;

  paintCountdowns();
  drawer.render(situation());
  $('#oddsTab').hidden = false;
}

/* ── craps ───────────────────────────────────────────────────────────── */

const crapsView = mountCraps($('#craps'), $('#codds'), {
  send: (msg) => send(msg),
  sit: () => { S.sitAt = Date.now(); send({ t: 'sit', bank: S.bank, name: S.myName }); },
  leave: () => { if (S.mode === 'multi' && !confirm('Leave this table? Chips on the table that can come down come back to you.')) return; leaveTable(false); },
  stats: () => openStats('craps'),
  settings: () => openSettings(),
  onLanded: (pub, seat) => {
    if (S.crapsLanded === pub.rolls) return;
    S.crapsLanded = pub.rolls;
    const edge = (k) => crapsEdge(k, pub.rules);
    recordCrapsRoll(S.session.craps, seat, pub.event, edge);
    recordCrapsRoll(S.life.craps, seat, pub.event, edge);
    saveStats();
  },
});

function renderCraps() {
  const pub = S.pub;
  if ($('#craps').hidden) return;
  const seat = pub.seats[S.uid];
  if (S.mode === 'multi' && !seat && pub.order.length < craps.MAX_SEATS && Date.now() - S.sitAt > 4000) {
    S.sitAt = Date.now();
    send({ t: 'sit', bank: S.bank, name: S.myName });
  }
  const hostUid = S.mode === 'multi' && S.room && S.room.meta ? S.room.meta.host : S.uid;
  crapsView.render({
    pub, me: S.uid, names: S.names, hostUid, settings: S.settings, title: S.title || '',
    live: S.mode !== 'multi' || !S.room || S.room.live !== false,
  });
  paintCountdowns();
  $('#oddsTab').hidden = false;
}

function recordIfSettled() {
  const pub = S.pub, seat = pub.seats[S.uid];
  if (!seat || pub.phase !== 'betting' || !seat.hands.length || !seat.hands[0].res || S.recorded === pub.round) return;
  S.recorded = pub.round;
  recordRound(S.session, seat);
  recordRound(S.life, seat);
  saveStats();
  persistSolo();
  const res = seat.hands.map((h) => h.res);
  if (res.includes('bj')) sound('bj');
  else if (seat.last > 0) sound('win');
  else if (seat.last < 0) sound('lose');
}

function paintCountdowns() {
  const now = S.mode === 'multi' && S.net ? S.net.serverNow() : Date.now();
  document.querySelectorAll('.countdown[data-deadline]').forEach((el) => {
    const d = Number(el.dataset.deadline);
    el.textContent = d ? String(Math.max(0, Math.ceil((d - now) / 1000))) : '';
  });
}
setInterval(paintCountdowns, 250);

/* ── your moves ──────────────────────────────────────────────────────── */

const ACT_CODE = { hit: 'H', stand: 'S', double: 'D', split: 'P', surr: 'R' };

function coach(act) {
  const pub = S.pub;
  const hand = myHand();
  const advice = adviceNow();
  if (!hand || !advice) return;
  const did = ACT_CODE[act];
  const should = advice.dev ? advice.dev.action : advice.action;
  const c = countNow();
  const ids = hand.cards.map(idx);
  const evs = moveEVs(ids, bj.upcard(pub), c.comp, pub.rules);
  const loss = evs[should] !== undefined && evs[did] !== undefined ? Math.max(0, evs[should] - evs[did]) : 0;
  const rec = { key: cellKey(advice.cell), name: advice.name, did, should, loss };
  const ok = recordDecision(S.session, rec);
  recordDecision(S.life, rec);
  saveStats();
  if (!S.settings.coach) return;
  S.feedback = ok
    ? { ok, at: Date.now(), html: `✅ ${ACTION_NAME[did]} is right on ${esc(advice.name)}${advice.dev ? ' (count play)' : ''}.` }
    : { ok, at: Date.now(), html: `❌ ${esc(advice.name)}: the ${advice.dev ? 'count' : 'chart'} says <b>${ACTION_NAME[should]}</b>. ${ACTION_NAME[did]} gives up about ${Math.round(loss * 100)}¢ per $1. <span class="muted">${esc(advice.dev ? advice.dev.note : why(advice.cell, should))}</span>` };
  if (!ok) buzz(50);
}

function coachInsurance(take) {
  const c = countNow();
  const should = S.settings.deviations && Math.floor(c.tc) >= INSURANCE_INDEX ? 'I' : 'N';
  const did = take ? 'I' : 'N';
  const rec = { key: 'ins', name: 'Insurance', did, should, loss: 0 };
  const ok = recordDecision(S.session, rec);
  recordDecision(S.life, rec);
  saveStats();
  if (!S.settings.coach) return;
  S.feedback = ok
    ? { ok, at: Date.now(), html: `✅ ${take ? 'Insurance is right at this count.' : 'Right: insurance is a losing side bet.'}` }
    : { ok, at: Date.now(), html: take ? '❌ Insurance loses about 7¢ per $1 off the top of the shoe. Only counters take it, at +3 or more.' : `❌ At a true count of ${signed(c.tc, 1)} insurance is worth taking.` };
}

function setBet(n) {
  const pub = S.pub, seat = pub && pub.seats[S.uid];
  if (!seat) return;
  S.bet = Math.max(0, Math.min(Math.floor(n), Math.floor(seat.bank), pub.rules.max));
  clearTimeout(S.betSendTimer);
  if (S.mode === 'solo') send({ t: 'bet', amt: S.bet });
  else S.betSendTimer = setTimeout(() => send({ t: 'bet', amt: S.bet }), 300);
  render();
}

async function deal() {
  const pub = S.pub, seat = pub && pub.seats[S.uid];
  if (!seat || pub.phase !== 'betting') return;
  clearTimeout(S.betSendTimer);
  S.feedback = null;
  S.peekCount = false;
  await send({ t: 'bet', amt: S.bet });
  await send({ t: 'deal' });
}

$('#controls').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || !S.pub) return;
  unlockAudio();
  if (b.dataset.chip) { sound('chip'); setBet(S.bet + Number(b.dataset.chip)); return; }
  if (b.dataset.bet === 'clear') { setBet(0); return; }
  if (b.dataset.bet === 'half') { setBet(Math.max(S.pub.rules.min, Math.floor(S.bet / 2))); return; }
  if (b.dataset.bet === 'double') { sound('chip'); setBet(S.bet * 2); return; }
  if (b.dataset.rebuy) { send({ t: 'rebuy', amt: Number(b.dataset.rebuy) }); S.sessionStart = (S.sessionStart || 0) + Number(b.dataset.rebuy); return; }
  const act = b.dataset.act;
  if (!act) return;
  if (act === 'deal') deal();
  else if (act === 'unready') send({ t: 'unready' });
  else if (act === 'sit') { S.sitAt = Date.now(); send({ t: 'sit', bank: S.bank, name: S.myName }); }
  else if (act === 'ins-yes' || act === 'ins-no') { coachInsurance(act === 'ins-yes'); send({ t: 'ins', take: act === 'ins-yes' }); }
  else if (ACT_CODE[act]) { coach(act); send({ t: act }); }
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const screen = document.body.dataset.screen;
  if (screen === 'drill') { drill.key(e); return; }
  if (screen === 'cdrill') { payouts.key(e); return; }
  if (screen === 'craps') { crapsView.key(e); return; }
  if (screen !== 'table' || !S.pub) return;
  const k = e.key.toLowerCase();
  const pub = S.pub;
  if (k === 'o') { drawer.toggle(); return; }
  if (pub.phase === 'betting' && (k === ' ' || k === 'enter')) { e.preventDefault(); const b = $('#controls [data-act="deal"]'); if (b && !b.disabled) b.click(); return; }
  const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surr', i: 'ins-yes', n: 'ins-no' };
  const act = map[k];
  if (!act) return;
  const b = $(`#controls [data-act="${act}"]`);
  if (b && !b.disabled) { e.preventDefault(); b.click(); }
});

/* ── the odds drawer ─────────────────────────────────────────────────── */

const drawer = mountDrawer($('#odds'), {
  onPeek: () => { S.peekCount = true; render(); },
  onQuiz: (ok) => { drillResult(S.life, 'count', ok); saveStats(); },
});
$('#oddsTab').addEventListener('click', () => {
  if (document.body.dataset.screen === 'craps') crapsView.toggle(); else drawer.toggle();
  render();
});

/* ── settings ────────────────────────────────────────────────────────── */

const TOGGLES = [
  ['hints', 'Hints', 'Show what the chart says before you move, and light up that button.'],
  ['coach', 'Coach', 'After each move, say whether it matched the chart and what a mistake cost.'],
  ['showCount', 'Show the count', 'Keep the Hi-Lo running and true count on the table. Off to practise counting in your head; the Count tab has a quiz.'],
  ['deviations', 'Count plays', 'Hints and the coach use the Illustrious 18 and Fab 4: the plays that change with the true count.'],
  ['sound', 'Sound', 'Card and chip sounds.'],
];

const CRAPS_TOGGLES = [
  ['table3d', '3D table', 'A real table: flick up to throw the dice, tap the felt to bet. Off for the simple stacked layout.'],
  ['voice', 'Stickman voice', 'The stickman calls each roll out loud, slang and all (uses the phone\'s built-in voice).'],
  ['hints', 'Hints and smart bets', 'Nudges like "take odds now", warnings about high-edge bets, and one-tap setups for the good bets.'],
  ['narrate', 'Narrator', 'Explain every roll in plain English, and what it did to each of your bets.'],
  ['coach', 'Coach', 'A quick note the first time you put money on a high-edge bet.'],
  ['sound', 'Sound', 'Dice and chip sounds.'],
];

function openSettings() {
  const pub = S.pub;
  if (pub && pub.game === 'craps') { openCrapsSettings(); return; }
  const canRules = pub && pub.phase === 'betting' && (S.mode === 'solo' || (S.room && S.room.isHost()));
  const seat = pub && pub.seats[S.uid];
  $('#sheet').innerHTML = `<div class="sheet-card"><h2>Table settings</h2>
    <div class="toggles">${TOGGLES.map(([k, l, d]) => `<label class="toggle"><input type="checkbox" data-set="${k}" ${S.settings[k] ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
    <h3>Rules</h3>${pub ? rulesHtml(pub.rules, canRules) : ''}
    ${pub && !canRules ? `<p class="small muted">${S.mode === 'multi' && !S.room.isHost() ? 'The host sets the rules.' : 'Rules can change between hands.'}</p>` : ''}
    ${seat ? `<h3>Chips</h3><div class="row">${[100, 500, 1000].map((n) => `<button class="btn small" data-rebuy="${n}" ${pub.phase === 'betting' ? '' : 'disabled'}>Add ${money(n)}</button>`).join('')}</div>` : ''}
    ${canRules ? '<div class="row"><button class="btn small ghost" data-shuffle>Shuffle a new shoe</button></div>' : ''}
    <button class="btn big" data-close>Done</button></div>`;
  $('#sheet').hidden = false;
}

function openCrapsSettings() {
  const pub = S.pub;
  const canRules = pub.phase === 'betting' && !pub.point && (S.mode === 'solo' || (S.room && S.room.isHost()));
  const seat = pub.seats[S.uid];
  $('#sheet').innerHTML = `<div class="sheet-card"><h2>Table settings</h2>
    <div class="toggles">${CRAPS_TOGGLES.map(([k, l, d]) => `<label class="toggle"><input type="checkbox" data-set="${k}" ${S.settings[k] ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
    <h3>Rules</h3>${crapsRulesHtml(pub.rules, canRules)}
    ${!canRules ? `<p class="small muted">${S.mode === 'multi' && !S.room.isHost() ? 'The host sets the rules.' : 'Rules can change before a come-out roll.'}</p>` : ''}
    ${seat ? `<h3>Chips</h3><div class="row">${[100, 500, 1000].map((n) => `<button class="btn small" data-rebuy="${n}">Add ${money(n)}</button>`).join('')}</div>
      <div class="row"><button class="btn small ghost" data-takeall>Take down every bet I can</button></div>` : ''}
    <button class="btn big" data-close>Done</button></div>`;
  $('#sheet').hidden = false;
}

$('#tSettings').addEventListener('click', openSettings);
$('#sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) { e.currentTarget.hidden = true; render(); return; }
  const cr = e.target.closest('[data-crule]');
  if (cr && !cr.disabled) {
    const rules = craps.cleanRules({ ...S.pub.rules, ...parseCrule(cr) }, S.pub.rules);
    S.crapsRules = rules;
    store.set('casino.crapsRules', rules);
    send({ t: 'rules', rules }).then(() => setTimeout(openSettings, S.mode === 'solo' ? 0 : 500));
    return;
  }
  if (e.target.closest('[data-takeall]')) { send({ t: 'take', key: '*' }); toast('Bets taken down'); return; }
  const r = e.target.closest('[data-rule]');
  if (r && !r.disabled) {
    const rules = bj.cleanRules({ ...S.pub.rules, ...parseRule(r) }, S.pub.rules);
    S.rules = rules;
    store.set('casino.rules', rules);
    send({ t: 'rules', rules }).then(() => setTimeout(openSettings, S.mode === 'solo' ? 0 : 500));
    return;
  }
  const rb = e.target.closest('[data-rebuy]');
  if (rb && !rb.disabled) { send({ t: 'rebuy', amt: Number(rb.dataset.rebuy) }); S.sessionStart = (S.sessionStart || 0) + Number(rb.dataset.rebuy); toast(`Added ${money(Number(rb.dataset.rebuy))}`); return; }
  if (e.target.closest('[data-shuffle]')) { send({ t: 'shuffle' }); toast('New shoe'); }
});
$('#sheet').addEventListener('change', (e) => {
  const k = e.target.dataset.set;
  if (!k) return;
  S.settings[k] = e.target.checked;
  saveSettings();
  render();
});

/* ── trainers and stats ──────────────────────────────────────────────── */

let statsBack = 'home';
const drill = strategyDrill($('#drill'), {
  rules: () => (S.pub ? S.pub.rules : S.rules),
  onResult: (res, streak) => {
    const rec = { key: res.key, name: res.name, did: res.answer, should: res.should, loss: res.loss, drill: true };
    recordDecision(S.life, rec);
    drillResult(S.life, 'strategy', res.ok, streak);
    saveStats();
  },
  onBack: () => { renderHome(); show('home'); },
});
function openDrill(focus) { show('drill'); drill.start(focus); }

const counter = countDrill($('#count'), {
  onResult: (ok) => { drillResult(S.life, 'count', ok); saveStats(); },
  onBack: () => { renderHome(); show('home'); },
});

const learn = learnScreen($('#learn'), {
  onBack: () => { renderHome(); show('home'); },
  onPractice: () => { S.settings.narrate = true; S.settings.hints = true; saveSettings(); startSolo(false, 'craps'); },
  progress: {
    get: () => S.life.craps.lessons,
    mark: (id) => { S.life.craps.lessons[id] = true; saveStats(); },
  },
});

const payouts = payoutDrill($('#cdrill'), {
  rules: () => (S.pub && S.pub.game === 'craps' ? S.pub.rules : S.crapsRules),
  onBack: () => { renderHome(); show('home'); },
  onResult: (ok, streak) => {
    const d = S.life.craps.drill;
    d.n++; if (ok) d.ok++; if (streak > d.best) d.best = streak;
    saveStats();
  },
});

const stats = statsScreen($('#stats'), {
  get: () => ({ session: S.session, life: S.life, startBank: S.sessionStart, game: statsBack === 'craps' ? 'craps' : 'blackjack' }),
  onBack: () => {
    if (statsBack === 'table' && S.pub) { show('table'); render(); }
    else if (statsBack === 'craps' && S.pub) { show('craps'); render(); }
    else { renderHome(); show('home'); }
  },
  onDrill: (keys) => openDrill(keys),
  onReset: () => { S.life = emptyStats(); S.life.craps = emptyCraps(); newSession(); saveStats(); },
});
function openStats(from) { statsBack = from; show('stats'); stats.show(); }
$('#tStats').addEventListener('click', () => openStats('table'));

document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-invite]') || !S.room) return;
  const url = `${location.origin}${location.pathname}?table=${S.room.code}`;
  const text = S.game === 'craps' ? `Come roll some dice. Craps table code ${S.room.code}` : `Pull up a chair at my blackjack table. Code ${S.room.code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Casino', text, url }); return; }
    await navigator.clipboard.writeText(`${text}: ${url}`);
    toast('Invite link copied');
  } catch { /* closed the share sheet */ }
});

/* ── start ───────────────────────────────────────────────────────────── */

renderHome();
show('home');

// Back at a friends table after a reload.
(async () => {
  const code = store.sget('casino.table');
  const name = store.get('casino.name', '');
  if (!code || !name || (linked && linked !== code)) return;
  try {
    const net = await loadNet();
    S.uid = await net.signIn();
    await enterTable(code, name);
  } catch { store.sset('casino.table', null); }
})();

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

// For poking at the table from the console.
window.__casino = { S };
