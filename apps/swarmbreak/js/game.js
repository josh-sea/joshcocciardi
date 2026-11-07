/* Screens, the main loop, the host's job and the clients' job.
 *
 * Three ways to run:
 *   local   one browser, one to four marines (keyboard halves and gamepads)
 *   host    the online lobby's host: runs the sim, streams snapshots
 *   client  everyone else online: draws snapshots, moves its own marines
 *           on its own screen and tells the host where they are
 */

import { TICK, SNAP_HZ, LEVELS, WEAPONS, COLORS, ENEMIES, DEFAULTS, cleanConfig, MAX_BODIES } from './config.js';
import { newMatch, step, snapshot, decode, interpolate, serialize, restore, mapOf, addPlayer, removePlayer, movePredict, retryLevel, startLevel } from './sim.js';
import { buildLevel, lineClear } from './map.js';
import { createRenderer } from './render.js';
import { createInput, schemesFor, SCHEME_HELP, TOUCH } from './input.js';
import { bodies, inMatch, pickHost, cleanName, list, STALE_MS } from './lobby.js';
import * as sfx from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const R = createRenderer(canvas);
const input = createInput(canvas, $('touch'));
document.body.classList.toggle('touch', TOUCH);
if (TOUCH) {
  $('lTitle').textContent = 'This device';
  $('lSub').textContent = 'Twin thumbs on the screen. Plug in gamepads for more marines.';
  $('oTwoWrap').hidden = true;
}

// Phones: go full screen and sideways if the browser allows it (Android
// does; iPhone Safari ignores both, which is fine).
function goFull() {
  if (!TOUCH) return;
  const el = document.documentElement;
  try { const r = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' }); if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch {}
}

let S = null; // the running session
const PLAY_DELAY = 140; // ms clients draw behind the host

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ['menu', 'lobby', 'hud']) $(s).hidden = s !== id;
  $('over').hidden = true; $('pause').hidden = true;
  $('touch').hidden = !(id === 'hud' && TOUCH);
  document.body.classList.toggle('playing', id === 'hud');
}

const levelOptions = sel => { sel.innerHTML = LEVELS.map((L, i) => `<option value="${i}">${i + 1}. ${L.name}</option>`).join(''); };
levelOptions($('lLevel')); levelOptions($('oLevel'));

// Local setup: how many marines on this computer, and their names.
let localCount = 2;
const savedNames = (() => { try { return JSON.parse(localStorage.getItem('swarm:names') || '[]'); } catch { return []; } })();
function drawLocalNames() {
  document.querySelectorAll('#lCount button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === localCount));
  const schemes = schemesFor(localCount);
  $('lNames').innerHTML = schemes.map((sc, i) => `
    <div class="field seat"><label><i style="background:${COLORS[i]}"></i>Marine ${i + 1}<span class="how">${SCHEME_HELP[sc]}</span></label>
    <input data-i="${i}" maxlength="18" value="${escape(savedNames[i] || '')}" placeholder="Name"></div>`).join('');
  const pads = input.padCount(), need = Math.max(0, localCount - (TOUCH ? 1 : 2));
  const who = TOUCH ? 'Marines 2 to 4' : 'Marines 3 and 4';
  $('lPads').textContent = need ? (pads >= need ? `${pads} gamepad${pads > 1 ? 's' : ''} ready.` : `${who} need gamepads: plug one in and press a button (${pads} found).`) : '';
}
document.querySelectorAll('#lCount button').forEach(b => b.onclick = () => { localCount = Number(b.dataset.n); drawLocalNames(); });
addEventListener('gamepadconnected', drawLocalNames);
drawLocalNames();

function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function rememberNames(names) { names.forEach((n, i) => { savedNames[i] = n; }); try { localStorage.setItem('swarm:names', JSON.stringify(savedNames)); } catch {} }

$('lStart').onclick = () => {
  sfx.unlock(); goFull();
  const names = [...document.querySelectorAll('#lNames input')].map((el, i) => cleanName(el.value) || `Marine ${i + 1}`);
  rememberNames(names);
  const cfg = cleanConfig({ startLevel: Number($('lLevel').value), friendlyFire: $('lFF').checked, swarm: Number($('lSwarm').value) });
  const schemes = schemesFor(names.length);
  const seats = names.map((name, i) => ({ pid: `L_${i}`, name, scheme: schemes[i] }));
  const sim = newMatch({ seed: (Math.random() * 2 ** 31) | 0, cfg, players: seats });
  begin({ mode: 'local', seats, sim });
};

// Online: password, names, and an optional second marine on this keyboard.
const hashPw = new URLSearchParams(location.hash.slice(1)).get('pw');
if (hashPw) { $('oPw').value = hashPw; history.replaceState(null, '', location.pathname + location.search); }
$('oName').value = savedNames[0] || '';
$('oName2').value = savedNames[1] || '';
$('oTwo').onchange = () => { $('oName2Wrap').hidden = !$('oTwo').checked; };

$('joinForm').onsubmit = async e => {
  e.preventDefault();
  sfx.unlock(); goFull();
  const err = $('joinErr'); err.textContent = '';
  const { passwordProblem, roomKey } = await import('./keys.js');
  const pw = $('oPw').value, problem = passwordProblem(pw);
  if (problem) { err.textContent = problem; return; }
  const names = [cleanName($('oName').value)];
  if (!names[0]) { err.textContent = 'Type a name your brothers will recognise.'; return; }
  if ($('oTwo').checked && !TOUCH) names.push(cleanName($('oName2').value) || `${names[0]} 2`);
  rememberNames(names);
  $('oJoin').disabled = true; $('oJoin').textContent = 'Joining...';
  try {
    const net = await import('./net.js');
    const [uid, key] = await Promise.all([net.signIn(), roomKey(pw)]);
    const room = net.openRoom(key, uid);
    await room.join(names);
    enterLobby(room, uid, names, pw);
  } catch (ex) {
    err.textContent = ex.message || String(ex);
  } finally { $('oJoin').disabled = false; $('oJoin').textContent = 'Join lobby'; }
};

// ---------------------------------------------------------------- lobby
let L = null; // { room, uid, names, pw }
function enterLobby(room, uid, names, pw) {
  L = { room, uid, names, pw, joinedMatch: false };
  show('lobby');
  room.watch({
    onMeta: m => { if (!m) return; drawLobby(); syncPhase(m); hostCheck(); },
    onPlayers: () => { drawLobby(); if (S && S.room) hostCheck(); },
  });
}

function drawLobby() {
  if (!L) return;
  const { room, uid } = L, meta = room.meta || {}, isHost = meta.host === uid;
  const cfg = cleanConfig(meta.config || DEFAULTS);
  // Away players linger a few minutes so a dropped brother can come back to
  // his seat; after that they're gone from the list.
  const now = Date.now();
  const bs = bodies(room.players).filter(b => b.online || now - ((room.players[b.uid] || {}).leftAt || now) < STALE_MS);
  $('roster').innerHTML = bs.map((b, i) => `<li class="${b.online ? '' : 'off'}"><i style="background:${COLORS[i]}"></i>${escape(b.name)}${b.uid === meta.host ? '<span class="tag">Host</span>' : ''}${b.uid === uid ? '<span class="tag you">You</span>' : ''}${b.online ? '' : '<span class="tag">Away</span>'}</li>`).join('')
    + Array.from({ length: Math.max(0, MAX_BODIES - bs.length) }, () => '<li class="empty">Open seat</li>').join('');
  for (const [id, v] of [['oLevel', cfg.startLevel], ['oSwarm', cfg.swarm]]) { if (document.activeElement !== $(id)) $(id).value = String(v); $(id).disabled = !isHost; }
  $('oFF').checked = cfg.friendlyFire; $('oFF').disabled = !isHost;
  $('oStart').hidden = !isHost;
  $('oWait').hidden = isHost || meta.phase === 'playing';
  $('oRejoin').hidden = meta.phase !== 'playing';
}
const pushConfig = () => L && L.room.meta && L.room.meta.host === L.uid && L.room.setConfig(cleanConfig({ startLevel: Number($('oLevel').value), friendlyFire: $('oFF').checked, swarm: Number($('oSwarm').value) }));
['oLevel', 'oSwarm', 'oFF'].forEach(id => { $(id).onchange = pushConfig; });
$('oStart').onclick = () => { sfx.unlock(); L.room.start(cleanConfig({ startLevel: Number($('oLevel').value), friendlyFire: $('oFF').checked, swarm: Number($('oSwarm').value) })); };
$('oRejoin').onclick = () => { sfx.unlock(); L.joinedMatch = false; syncPhase(L.room.meta); };
$('oInvite').onclick = async () => {
  const url = `${location.origin}${location.pathname}#pw=${encodeURIComponent(L.pw)}`;
  try { await navigator.clipboard.writeText(url); $('oInvite').textContent = 'Link copied'; }
  catch { prompt('Copy this link:', url); }
  setTimeout(() => { $('oInvite').textContent = 'Copy invite link'; }, 2000);
};
$('oLeave').onclick = leaveAll;

async function leaveAll() {
  end();
  if (L) { const r = L.room; L = null; try { await r.leave(); } catch {} }
  show('menu');
}

// The room's phase drives everyone into and out of the match.
function syncPhase(meta) {
  if (!L) return;
  if (meta.phase === 'playing' && !S && !L.joinedMatch) { L.joinedMatch = true; startOnline(meta); }
  if (meta.phase === 'lobby' && S && S.room) { end(); L.joinedMatch = false; show('lobby'); drawLobby(); }
}

async function startOnline(meta) {
  const { room, uid, names } = L;
  const schemes = schemesFor(names.length);
  const seats = names.map((name, i) => ({ pid: `${uid}_${i}`, name, scheme: schemes[i] }));
  const sess = { mode: meta.host === uid ? 'host' : 'client', seats, room, uid };
  room.setOut(false);
  if (sess.mode === 'host') {
    const full = await room.loadFull().catch(() => null);
    sess.sim = full && full.seed === meta.seed ? restore(full) : newMatch({ seed: meta.seed || 1, cfg: meta.config });
  }
  begin(sess);
}

// ---------------------------------------------------------------- session
function begin(sess) {
  end();
  S = { ...sess, view: null, acc: 0, last: performance.now(), snaps: [], pred: {}, want: {}, aim: {}, sent: 0, wrote: 0, fulled: 0,
    remote: {}, netEvents: [], paused: false, lastSnapT: -1, banners: [] };
  for (const seat of S.seats) { S.want[seat.pid] = 0; S.aim[seat.pid] = -Math.PI / 2; }
  show('hud');
  R.resetCam();
  if (S.room) {
    if (S.mode === 'host') becomeHost();
    else S.unState = S.room.onState(onSnapshot);
  }
  S.raf = requestAnimationFrame(loop);
  startPump();
}

function end() {
  if (!S) return;
  cancelAnimationFrame(S.raf);
  input.clearTouch();
  stopPump();
  for (const u of [S.unState, S.unInputs, S.unCmd]) u && u();
  S = null;
}

function becomeHost() {
  S.mode = 'host';
  if (S.unState) { S.unState(); S.unState = null; }
  S.unInputs = S.room.onInputs(all => { S.remote = {}; for (const [u, byPid] of Object.entries(all)) if (u !== S.uid) Object.assign(S.remote, byPid || {}); });
  S.unCmd = S.room.onCmd(c => command(c));
  hostCheck();
}

function becomeClient() {
  S.mode = 'client';
  S.sim = null;
  for (const u of [S.unInputs, S.unCmd]) u && u();
  S.unInputs = S.unCmd = null;
  S.snaps = []; S.off = null; S.lastSnapT = -1;
  S.unState = S.room.onState(onSnapshot);
  banner('Reconnected', 'A teammate is running the match now.');
}

function command(c) {
  if (!S || !S.sim) return;
  if (c.do === 'retry' && S.sim.phase === 'lost') retryLevel(S.sim);
  if (c.do === 'again' && S.sim.phase === 'won') { const sim = S.sim; for (const p of Object.values(sim.players)) { p.score = 0; p.kills = 0; } retryLevel(sim); startLevel(sim, 0); }
}

// Host: keep the sim's marines matching who is in the room; take over as
// host if the old one is gone.
async function hostCheck() {
  if (!S || !S.room || !L) return;
  const meta = L.room.meta || {};
  // Someone else took over while this browser was away (a phone that
  // switched apps, a sleeping laptop): stop running the match, or two hosts
  // fight over it and everyone's teammates jump around.
  if (S.mode === 'host' && meta.host && meta.host !== S.uid) { becomeClient(); return; }
  if (S.mode === 'client' && pickHost(L.room.players, meta.host) === S.uid && meta.host !== S.uid) {
    if (await L.room.claimHost()) {
      const full = await L.room.loadFull();
      S.sim = full ? restore(full) : newMatch({ seed: meta.seed || 1, cfg: meta.config });
      becomeHost();
      banner('You are now running the match');
    }
    return;
  }
  if (S.mode !== 'host') return;
  const want = inMatch(L.room.players);
  const ids = new Set(want.map(b => b.pid));
  for (const pid of Object.keys(S.sim.players)) if (!ids.has(pid)) removePlayer(S.sim, pid);
  for (const b of want) addPlayer(S.sim, b.pid, b.name);
}

function onSnapshot(raw) {
  if (!S) return;
  const d = decode(raw);
  if (d.t === S.lastSnapT) return;
  // The match clock went backwards: a new host took over from its last save.
  if (d.t < S.lastSnapT - 0.5) { S.snaps = []; S.off = null; }
  S.lastSnapT = d.t;
  const at = performance.now();
  // Map the host's match clock onto ours. Packets arrive late by varying
  // amounts, so track the quickest one (fast down, slow drift up) and play
  // a fixed delay behind it: timing by arrival instead turns every late
  // packet into a stall and every bunch into a jump.
  const o = at - d.t * 1000;
  S.off = S.off == null || o < S.off ? o : S.off + (o - S.off) * 0.03;
  S.snaps.push({ at, d });
  if (S.snaps.length > 12) S.snaps.shift();
  S.pendingEvents = (S.pendingEvents || []).concat(d.events);
}

// ---------------------------------------------------------------- frame
// A worker keeps the host's match ticking while its tab is hidden (the
// browser stops animation frames there).
let pump = null;
function startPump() {
  if (!S || S.mode === 'local') return;
  const src = 'let t=setInterval(()=>postMessage(0),33);';
  pump = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  pump.onmessage = () => { if (S && document.hidden) tick(performance.now(), true); };
}
function stopPump() { if (pump) { pump.terminate(); pump = null; } }

function loop(now) {
  if (!S) return;
  S.raf = requestAnimationFrame(loop);
  tick(now, false);
}

function tick(now, hidden) {
  const dt = Math.min(0.1, (now - S.last) / 1000);
  S.last = now;
  const local = new Set(S.seats.map(s => s.pid));
  const mine = readSeats(dt);

  let events = [];
  if (S.sim) {
    if (!S.paused) {
      S.acc += dt;
      const inputs = { ...S.remote, ...mine };
      while (S.acc >= TICK) {
        S.acc -= TICK;
        step(S.sim, inputs, TICK);
        events.push(...S.sim.ev);
      }
    }
    S.view = decode(snapshot(S.sim, []));
    if (S.mode === 'host' && (!S.room.connected || (S.room.meta && S.room.meta.host !== S.uid))) {
      // Offline, or no longer the host: don't queue writes that would land
      // on top of whoever is running the match now.
      S.netEvents = [];
    } else if (S.mode === 'host') {
      S.netEvents.push(...events);
      if (now - S.wrote > 1000 / SNAP_HZ) {
        S.wrote = now;
        S.room.writeState(snapshot(S.sim, S.netEvents.slice(-60)));
        S.netEvents = [];
      }
      if (now - S.fulled > 2000) { S.fulled = now; S.room.writeFull(serialize(S.sim)); }
    }
  } else {
    // Client: draw a little behind the host's clock, blended between the two
    // snapshots either side.
    const sn = S.snaps;
    if (!sn.length) return;
    const rt = (now - S.off - PLAY_DELAY) / 1000;
    let a = sn[0], b = sn[0];
    if (rt >= sn[sn.length - 1].d.t) { a = b = sn[sn.length - 1]; }
    else for (let i = 0; i < sn.length - 1; i++) if (sn[i].d.t <= rt && sn[i + 1].d.t >= rt) { a = sn[i]; b = sn[i + 1]; break; }
    const k = b.d.t === a.d.t ? 1 : Math.max(0, Math.min(1, (rt - a.d.t) / (b.d.t - a.d.t)));
    S.view = interpolate(a.d, b.d, k);
    // Shots fly on from the newest snapshot.
    const age = (now - sn[sn.length - 1].at) / 1000;
    S.view.shots = sn[sn.length - 1].d.shots.map(s => ({ ...s, x: s.x + s.vx * age, y: s.y + s.vy * age }));
    events = S.pendingEvents || []; S.pendingEvents = [];
    // Our own marines go where we steer them.
    const m = mapOf(S.view);
    for (const p of S.view.players) {
      if (!local.has(p.pid)) continue;
      const pr = S.pred[p.pid];
      if (!p.alive) { delete S.pred[p.pid]; continue; }
      if (!pr || Math.hypot(pr.x - p.x, pr.y - p.y) > 140) S.pred[p.pid] = { x: p.x, y: p.y };
      const inp = mine[p.pid] || {};
      const q = movePredict(m, S.pred[p.pid], inp.mx, inp.my, dt);
      S.pred[p.pid] = q;
      p.x = q.x; p.y = q.y; p.a = S.aim[p.pid];
    }
    if (now - S.sent > 50) {
      S.sent = now;
      const out = {};
      for (const [pid, inp] of Object.entries(mine)) {
        const pr = S.pred[pid];
        out[pid] = { mx: inp.mx, my: inp.my, a: Math.round(inp.a * 100) / 100, fire: inp.fire, w: inp.w, ...(pr ? { px: Math.round(pr.x), py: Math.round(pr.y) } : {}) };
      }
      S.room.sendInputs(out);
    }
  }
  if (hidden) return;
  const v = S.view;
  R.setMap(mapOf(v), v.level, v.seed);
  for (const p of v.players) p.local = local.has(p.pid);
  R.events(events, v.players);
  sfx.eventSounds(events);
  messages(events, v);
  R.frame(v, local, dt);
  hud(v, now);
}

// Read every seat on this computer into the input the sim expects.
function readSeats(dt) {
  const out = {};
  const v = S.view;
  S.seats.forEach((seat, i) => {
    const r = input.read(i, S.seats.length, seat.scheme);
    const me = v && v.players.find(p => p.pid === seat.pid);
    const pos = (S.pred[seat.pid]) || me;
    let a = S.aim[seat.pid];
    if (r.aimAt && pos) { const w = R.toWorld(r.aimAt.x, r.aimAt.y); a = Math.atan2(w.y - pos.y, w.x - pos.x); }
    else if (r.stick != null) a = r.stick;
    else if ((r.mx || r.my) && !r.hold) a = Math.atan2(r.my, r.mx);
    // Aim help for marines aiming with the keys.
    if (!r.aimAt && r.fire && pos && v) a = assist(v, pos, a);
    S.aim[seat.pid] = a;
    if (me) {
      const owned = me.owned || [1];
      if (r.pick != null && owned[r.pick]) S.want[seat.pid] = r.pick;
      if (r.cycle) {
        let w = me.w;
        for (let k = 0; k < WEAPONS.length; k++) { w = (w + r.cycle + WEAPONS.length) % WEAPONS.length; if (owned[w]) break; }
        S.want[seat.pid] = w;
      }
      if (!owned[S.want[seat.pid]]) S.want[seat.pid] = me.w;
    }
    out[seat.pid] = { mx: r.mx, my: r.my, a, fire: r.fire && !S.paused, w: S.want[seat.pid] };
  });
  return out;
}

function assist(v, pos, a) {
  let best = null, bs = 0.45;
  const m = mapOf(v);
  for (const f of v.foes) {
    const dx = f.x - pos.x, dy = f.y - pos.y, d = Math.hypot(dx, dy);
    if (d > 460) continue;
    let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const score = Math.abs(da) + d / 2000;
    if (score < bs && lineClear(m, pos.x, pos.y, f.x, f.y)) { bs = score; best = Math.atan2(dy, dx); }
  }
  return best == null ? a : best;
}

// ---------------------------------------------------------------- HUD
let hudAt = 0;
function hud(v, now) {
  if (now - hudAt < 100) return;
  hudAt = now;
  const Lv = LEVELS[v.level];
  const nests = v.foes.filter(f => f.type === 'nest').length;
  const boss = v.foes.find(f => f.type === 'matriarch');
  $('hLevel').textContent = `${v.level + 1}. ${Lv.name}`;
  $('hGoal').textContent = v.exitOpen ? 'Exit open: everyone to the pad' : boss ? 'Kill the Matriarch' : `Nests left: ${nests}`;
  $('hLives').textContent = v.lives;
  $('hKills').textContent = v.kills;
  $('hBoss').hidden = !boss;
  if (boss) $('hBossBar').style.width = boss.hp + '%';
  const local = new Set(S.seats.map(s => s.pid));
  $('cards').innerHTML = v.players.filter(p => local.has(p.pid)).map(p => card(p, true)).join('')
    + `<div class="mates">${v.players.filter(p => !local.has(p.pid)).map(p => card(p, false)).join('')}</div>`;
  overlay(v);
}
function card(p, big) {
  const W = WEAPONS[p.w] || WEAPONS[0];
  const ammo = p.ammo < 0 ? '∞' : p.ammo;
  const status = p.alive ? '' : p.respawnT > 0 ? `<span class="dead">Back in ${Math.ceil(p.respawnT)}</span>` : '<span class="dead">Out</span>';
  return `<div class="card ${big ? 'big' : ''}" style="--c:${COLORS[p.c]}"><div class="nm">${escape(p.name)} ${status}</div>
    <div class="hp"><i style="width:${p.hp}%"></i></div>
    ${big ? `<div class="wp"><b>${W.name}</b><span>${ammo}</span></div><div class="slots">${WEAPONS.map((w, i) => `<span class="${p.owned[i] ? 'has' : ''} ${i === p.w ? 'cur' : ''}">${i + 1}</span>`).join('')}</div>` : ''}
    <div class="sc">${p.kills} kills · ${p.score}</div></div>`;
}

function overlay(v) {
  const o = $('over');
  if (v.phase === 'play') { o.hidden = true; return; }
  o.hidden = false;
  const board = `<table class="board">${[...v.players].sort((a, b) => b.score - a.score).map(p => `<tr><td><i style="background:${COLORS[p.c]}"></i>${escape(p.name)}</td><td>${p.kills} kills</td><td>${p.score}</td></tr>`).join('')}</table>`;
  if (v.phase === 'clear') o.innerHTML = `<div class="eyebrow">Level ${v.level + 1} cleared</div><h2>${LEVELS[v.level].name} is clear</h2>${board}<p>Next: ${LEVELS[v.level + 1] ? LEVELS[v.level + 1].name : ''} in ${Math.ceil(v.phaseT)}</p>`;
  else if (v.phase === 'lost') o.innerHTML = `<div class="eyebrow">Squad wiped</div><h2>The swarm took ${LEVELS[v.level].name}</h2>${board}<div class="go"><button id="xRetry">Retry level</button><button class="ghost" id="xLeave">Leave</button></div>`;
  else if (v.phase === 'won') o.innerHTML = `<div class="eyebrow">Mission complete</div><h2>The Matriarch is dead. Station clear.</h2>${board}<div class="go"><button id="xAgain">Play again</button><button class="ghost" id="xLeave">Leave</button></div>`;
  const b = id => o.querySelector('#' + id);
  if (b('xRetry')) b('xRetry').onclick = () => (S.sim ? retryLevel(S.sim) : S.room.sendCmd({ do: 'retry' }));
  if (b('xAgain')) b('xAgain').onclick = () => (S.sim ? command({ do: 'again' }) : S.room.sendCmd({ do: 'again' }));
  if (b('xLeave')) b('xLeave').onclick = quit;
}

function messages(events, v) {
  const name = pid => (v.players.find(p => p.pid === pid) || {}).name || 'Someone';
  for (const e of events) {
    if (e[0] === 'level') banner(`Level ${e[1] + 1}: ${LEVELS[e[1]].name}`, LEVELS[e[1]].boss ? 'Something big is in here.' : 'Destroy every nest, then reach the exit.');
    else if (e[0] === 'nest') banner(e[1] ? `Nest destroyed. ${e[1]} to go.` : 'Last nest down!');
    else if (e[0] === 'open') banner('Exit open', 'Everyone still standing, onto the pad.');
    else if (e[0] === 'down') banner(`${name(e[1])} is down`);
    else if (e[0] === 'pick' && e[2] < 4) banner(`${name(e[1])} grabbed the ${WEAPONS[e[2] + 1].name}`);
  }
}
let bannerT = 0;
function banner(text, sub = '') {
  const b = $('banner');
  b.innerHTML = `<b>${escape(text)}</b>${sub ? `<span>${escape(sub)}</span>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- pause
addEventListener('keydown', e => {
  if (e.code !== 'Escape' || !S) return;
  togglePause();
});
$('hPause').onclick = () => togglePause();
function togglePause() {
  const p = $('pause');
  p.hidden = !p.hidden;
  if (S.mode === 'local') S.paused = !p.hidden;
  $('pHelp').innerHTML = S.seats.map((s, i) => `<li><i style="background:${COLORS[i]}"></i><b>${escape(s.name)}</b> ${SCHEME_HELP[s.scheme]}</li>`).join('');
  $('pNote').textContent = S.mode === 'local' ? 'Paused.' : 'The match keeps going online.';
}
$('pResume').onclick = () => togglePause();
$('pMute').onclick = () => { const m = $('pMute').classList.toggle('on'); sfx.setMuted(m); $('pMute').textContent = m ? 'Sound off' : 'Sound on'; };
$('pLeave').onclick = quit;

function quit() {
  if (S && S.room) {
    // Step out: the host benches your marine (keeping its guns and score)
    // until you rejoin, so it isn't left standing there eating respawns.
    if (S.mode !== 'host') L.room.setOut(true);
    // Host ending the match sends everyone back to the lobby; anyone else
    // just steps out to the lobby screen.
    if (S.mode === 'host') L.room.toLobby();
    end(); show('lobby'); drawLobby();
    return;
  }
  end(); show('menu');
}

show('menu');
window.__swarm = { get S() { return S; } };
