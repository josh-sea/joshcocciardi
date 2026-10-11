/* Tophat & Spears: the page. Join screen, lobby, and the match itself.
 *
 * One browser in the room is the host and runs sim.js; it writes a compact
 * snapshot to the room about ten times a second. Everyone else draws those
 * snapshots about 120 ms in the past, blending between the two either side
 * of that moment so motion stays smooth.
 *
 * A Spear moves their own body locally (no waiting on the network) and
 * reports the pose. Shots are raycast on the shooter's screen and the host
 * checks them. Tophat orders, hops and redeploys go to the host as commands.
 *
 * Practice solo runs the same host code with no room at all, and keeps the
 * prototype's Tab swap between the two seats.
 */
/* global THREE */

import { DEFAULTS, TUNE, BASE, WAVES, SQUADS, RELAY_MAX, SHOT_RANGE, cleanConfig } from './config.js';
import { H, RELAY, SPAWNS, PROPS, clampM } from './map.js';
import {
  newMatch, step, addSpear, removeSpear, setDriven, hop, redeploy, spearPose, spearShot, order,
  snapshot, decode, interpolate, serialize, restore, rankBodies, leashStatus, moveSpear,
} from './sim.js';
import { tophatAction, tophatOf, spearsOf, canBeSpear, pickHost, cleanName } from './lobby.js';
import { roomKey, passwordProblem } from './keys.js';
import * as R from './render.js';

const $ = s => document.querySelector(s);
const canvas = $('#view');

const TICK = 1 / 30, STATE_EVERY = 0.1, FULL_EVERY = 2, POSE_EVERY = 1 / 15, INTERP_DELAY = 0.12;

// ---------- session ----------
const S = {
  screen: 'join', solo: false, uid: null, room: null, name: '',
  players: {}, meta: null, role: 'spear', isHost: false, config: { ...DEFAULTS },
  sim: null, hostT: { acc: 0, state: 0, full: 0 }, outShots: [], outEvents: [], hostUnsubs: [], overSent: false,
  snaps: [], offset: null, clientUnsub: null, view: null, lastSnapAt: 0,
  phase: 'lobby',
};
const toastSeen = new Set();

// ---------- toasts ----------
function toast(msg, color) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  if (color) el.style.borderLeftColor = color;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
function showEvent(e) {
  if (e.to === '' || e.to === S.uid || (e.to === 'tophat' && S.role === 'tophat')) toast(e.m, e.c || undefined);
}

// ---------- join ----------
const NAME_KEY = 'tophat-spears:name';
try { $('#fName').value = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* storage blocked */ }
{
  // An invite link can carry the password in the hash, which never reaches a server.
  const m = location.hash.match(/(?:^#|&)pw=([^&]+)/);
  if (m) { $('#fPw').value = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname + location.search); }
}
if (matchMedia('(pointer: coarse)').matches) $('#mobileNote').hidden = false;

$('#joinForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#fPw').value, name = cleanName($('#fName').value);
  const problem = passwordProblem(pw) || (name ? '' : 'Pick a name.');
  $('#joinErr').textContent = problem; if (problem) return;
  $('#joinBtn').disabled = true; $('#joinBtn').textContent = 'Joining…';
  try {
    const [key, net] = await Promise.all([roomKey(pw), import('./net.js')]);
    const uid = await net.signIn();
    const room = net.openRoom(key, uid);
    await room.join(name);
    try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* fine */ }
    Object.assign(S, { solo: false, uid, room, name, invitePw: pw });
    room.watch({ onMeta, onPlayers, onRequest });
    show('lobby');
  } catch (err) {
    $('#joinErr').textContent = err.message || String(err);
  } finally {
    $('#joinBtn').disabled = false; $('#joinBtn').textContent = 'Join lobby';
  }
});

$('#soloBtn').onclick = () => {
  Object.assign(S, { solo: true, uid: 'me', room: null, name: cleanName($('#fName').value) || 'You', isHost: true, role: 'tophat' });
  S.players = { me: { name: S.name, role: 'tophat', online: true, joined: 0 } };
  startSoloMatch();
};

function startSoloMatch() {
  S.sim = newMatch(S.config); S.overSent = false;
  addSpear(S.sim, 'me', S.name); setDriven(S.sim, 'me', S.role === 'spear');
  S.phase = 'playing'; enterGame();
}

// ---------- screens ----------
function show(screen) {
  S.screen = screen;
  $('#menu').hidden = screen !== 'join';
  $('#lobby').hidden = screen !== 'lobby';
  if (screen !== 'game') { $('#over').hidden = true; R.clearUnits(); S.view = null; }
  if (screen === 'lobby') renderLobby();
  syncHud();
}

// ---------- room events ----------
function onMeta(meta) {
  if (!meta) return;
  const prevPhase = S.phase;
  S.meta = meta; S.phase = meta.phase;
  if (!S.isHost || S.phase === 'lobby') S.config = cleanConfig(meta.config);
  const wasHost = S.isHost;
  S.isHost = meta.host === S.uid;
  if (S.isHost && !wasHost) becomeHost();
  if (!S.isHost && wasHost) stopHost();
  if (S.phase === 'playing' && S.screen !== 'game') enterGame();
  else if (S.phase === 'lobby' && S.screen === 'game') leaveGameToLobby();
  else if (S.phase === 'over' && S.screen === 'game' && (prevPhase !== 'over' || wasHost !== S.isHost)) showOver();
  checkHost();
  renderLobby(); syncHud();
}

function onPlayers(players) {
  const prevRole = S.role;
  S.players = players;
  const me = players[S.uid];
  if (!me) { kickedOut('Your seat was given to someone else while you were away.'); return; }
  S.role = me.role;
  if (S.role !== prevRole) onRoleChanged(prevRole);
  if (S.isHost && S.sim) syncSpears();
  checkHost();
  renderLobby(); syncHud();
}

function onRequest(req) {
  const fresh = req && (!req.at || Date.now() - req.at < 90000);
  const mine = req && req.uid === S.uid;
  $('#askModal').hidden = !(fresh && !mine && req.status === 'pending' && S.role === 'tophat');
  if ($('#askModal').hidden === false) $('#askTitle').textContent = `${req.name || 'A Spear'} wants to be Tophat`;
  $('#asking').hidden = !(mine && req.status === 'pending');
  if (mine && req.status === 'pending') {
    const top = tophatOf(S.players);
    $('#askingTxt').textContent = `Asked ${top ? top.name : 'the Tophat'} to switch. Waiting…`;
  }
  if (mine && req.status === 'no') {
    const top = tophatOf(S.players);
    toast(`${top ? top.name : 'The Tophat'} wants to keep the seat`, '#ff9f3a');
    S.room.clearRequest();
  }
}

function kickedOut(msg) {
  const room = S.room;
  stopHost(); stopClient();
  Object.assign(S, { room: null, isHost: false, players: {}, meta: null, phase: 'lobby' });
  if (room) room.leave().catch(() => {});
  show('join'); $('#joinErr').textContent = msg || '';
}

// Host takeover: if the host's tab is gone, the longest-standing online
// player claims the job and carries on from the last full save.
let claiming = false;
function checkHost() {
  if (S.solo || !S.room || !S.meta || claiming) return;
  const host = S.players[S.meta.host];
  if (host && host.online) return;
  if (pickHost(S.players, S.meta.host) !== S.uid) return;
  claiming = true;
  S.room.claimHost().finally(() => { claiming = false; });
}

// ---------- host ----------
async function becomeHost() {
  if (S.solo) return;
  stopClient();
  if (S.phase === 'playing' && !S.sim) {
    const room = S.room;
    const full = await room.loadFull();
    // Left the room (or lost the host job) while the save was loading.
    if (S.room !== room || !S.isHost) return;
    if (full && full.phase !== 'over') {
      S.sim = restore(full);
      showBanner('The host left. You are running the match now.', 4000);
    } else { room.setPhase('lobby'); return; }
  }
  if (S.sim) attachHost();
}
function attachHost() {
  detachHost();
  syncSpears();
  S.hostUnsubs.push(S.room.onCmd(c => handleCmd(c.uid, c)));
  S.hostUnsubs.push(S.room.onInputs(inputs => {
    for (const [pid, p] of Object.entries(inputs)) if (pid !== S.uid) spearPose(S.sim, pid, p);
  }));
}
function detachHost() { S.hostUnsubs.splice(0).forEach(u => u()); }
function stopHost() { detachHost(); S.sim = null; }

function syncSpears() {
  const sim = S.sim; if (!sim) return;
  if (S.solo) { setDriven(sim, 'me', S.role === 'spear'); return; }
  const spears = spearsOf(S.players);
  for (const p of spears) { addSpear(sim, p.uid, p.name); setDriven(sim, p.uid, !!p.online); }
  for (const pid of Object.keys(sim.spears)) if (!spears.some(p => p.uid === pid)) removeSpear(sim, pid);
}

function handleCmd(pid, c) {
  const sim = S.sim; if (!sim || !c) return;
  const p = S.players[pid];
  if (c.t === 'order') {
    if (!S.solo && (!p || p.role !== 'tophat')) return;
    order(sim, c.kind, Array.isArray(c.ids) ? c.ids : Object.values(c.ids || {}), { x: c.x, z: c.z });
  } else if (c.t === 'hop' || c.t === 'redeploy') {
    const r = (c.t === 'hop' ? hop : redeploy)(sim, pid, c.target);
    sim.events.push(r.ok ? { m: (c.t === 'hop' ? 'Hopped into ' : 'Dropped into ') + r.name, c: '#7fe0ff', to: pid } : { m: r.why, c: '', to: pid });
  } else if (c.t === 'shot') {
    spearShot(sim, pid, { bug: c.bug, a: c.a ? Object.values(c.a) : null, b: c.b ? Object.values(c.b) : null });
  }
}

function hostFrame(dt) {
  const sim = S.sim;
  if (S.role === 'spear' && pose.u) spearPose(sim, S.uid, pose);
  S.hostT.acc += dt;
  let n = 0;
  while (S.hostT.acc >= TICK && n++ < 8) { step(sim, TICK); S.hostT.acc -= TICK; }
  if (S.hostT.acc > TICK) S.hostT.acc = 0;
  // Fresh shots and events: draw them here, and queue them for the room.
  for (const sh of sim.shots.splice(0)) {
    if (sh[6] !== S.uid) R.tracer(new THREE.Vector3(sh[0], sh[1], sh[2]), new THREE.Vector3(sh[3], sh[4], sh[5]), !!sh[6]);
    S.outShots.push(sh.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v));
  }
  for (const e of sim.events.splice(0)) { showEvent(e); S.outEvents.push(e); }
  if (sim.phase === 'over' && !S.overSent) {
    S.overSent = true;
    if (S.room) S.room.setPhase('over'); else showOver();
  }
  if (!S.room) { S.outShots = []; S.outEvents = []; return; }
  S.hostT.state += dt; S.hostT.full += dt;
  if (S.hostT.state >= STATE_EVERY) {
    S.hostT.state = 0;
    const snap = snapshot(sim);
    if (S.outShots.length) snap.s = S.outShots.slice(-60);
    if (S.outEvents.length) snap.e = S.outEvents.map(e => ({ ...e, id: Math.random().toString(36).slice(2, 8) }));
    S.outShots = []; S.outEvents = [];
    S.room.writeState(snap).catch(() => {});
  }
  if (S.hostT.full >= FULL_EVERY) { S.hostT.full = 0; S.room.writeFull(serialize(sim)).catch(() => {}); }
}

// ---------- client ----------
function startClient() {
  if (S.clientUnsub || S.isHost || !S.room) return;
  S.snaps = []; S.offset = null;
  S.clientUnsub = S.room.onState(raw => {
    const t = performance.now() / 1000;
    const v = decode(raw);
    const off = v.now - t;
    S.offset = S.offset === null || off > S.offset ? off : S.offset + (off - S.offset) * 0.05;
    if (S.snaps.length && v.now < S.snaps[S.snaps.length - 1].now - 1) S.snaps = []; // a new host restarted the clock
    S.snaps.push(v); if (S.snaps.length > 8) S.snaps.shift();
    S.lastSnapAt = t;
    for (const sh of Object.values(raw.s || {})) {
      const a = Object.values(sh);
      if (a[6] !== S.uid) R.tracer(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(a[3], a[4], a[5]), !!a[6]);
    }
    for (const e of Object.values(raw.e || {})) { if (e.id && toastSeen.has(e.id)) continue; if (e.id) toastSeen.add(e.id); showEvent(e); }
    if (toastSeen.size > 300) toastSeen.clear();
    if (v.phase === 'over' && S.phase !== 'over') { S.phase = 'over'; showOver(); }
  });
}
function stopClient() { if (S.clientUnsub) { S.clientUnsub(); S.clientUnsub = null; } S.snaps = []; }
const hostNow = () => S.isHost && S.sim ? S.sim.now : (S.offset === null ? 0 : performance.now() / 1000 + S.offset);

function clientView() {
  const sn = S.snaps; if (!sn.length) return null;
  const rt = hostNow() - INTERP_DELAY;
  let a = sn[0], b = sn[0];
  for (let i = 0; i < sn.length - 1; i++) { if (sn[i].now <= rt) { a = sn[i]; b = sn[i + 1]; } }
  if (rt >= sn[sn.length - 1].now) { a = sn[Math.max(0, sn.length - 2)]; b = sn[sn.length - 1]; }
  const span = b.now - a.now;
  return interpolate(a, b, span > 0 ? (rt - a.now) / span : 1);
}

function cmd(c) {
  if (S.isHost) handleCmd(S.uid, c);
  else if (S.room) S.room.sendCmd(c).catch(() => {});
}

// ---------- entering and leaving a match ----------
function enterGame() {
  show('game');
  $('#over').hidden = true;
  S.overSent = false;
  selected.clear(); resetPose();
  Object.assign(cam, { fx: 0, fz: 34, dist: 80 });
  if (S.isHost) { if (S.sim && S.room) attachHost(); }
  else startClient();
  if (S.role === 'tophat') { /* start with Alpha selected, like the prototype */ pendingAlpha = true; }
  toastSeen.clear();
}
let pendingAlpha = false;
function leaveGameToLobby() {
  if (document.pointerLockElement) document.exitPointerLock();
  stopClient();
  if (S.isHost) { detachHost(); S.sim = null; }
  show('lobby');
}
function onRoleChanged(prev) {
  if (document.pointerLockElement) document.exitPointerLock();
  selected.clear(); resetPose(); mouseFire = false; setPatrol(false);
  if (S.screen === 'game') toast(S.role === 'tophat' ? 'You are the Tophat now' : 'You are a Spear now', '#ffcc4d');
  if (prev && S.screen === 'game' && S.role === 'tophat' && S.view) {
    const me = S.view.spears[S.uid]; const u = me && S.view.units.get(me.unitId);
    if (u) { cam.fx = u.x; cam.fz = u.z + 12; }
  }
}

// ---------- lobby ----------
function renderLobby() {
  if (S.screen !== 'lobby' || S.solo) return;
  const P = S.players, top = tophatOf(P), spears = spearsOf(P);
  const seat = (p, label, cls) => {
    if (!p) return `<div class="seat ${cls} empty"><span class="k">${label}</span><b>Open</b></div>`;
    const tags = [p.uid === S.uid ? '<span class="pill you">You</span>' : '', S.meta && S.meta.host === p.uid ? '<span class="pill">Host</span>' : '', p.online ? '' : '<span class="pill">Away</span>'].join('');
    return `<div class="seat ${cls} ${p.uid === S.uid ? 'me' : ''} ${p.online ? '' : 'off'}"><span class="k">${label}</span><div class="who"><b>${esc(p.name)}</b><span>${tags}</span></div></div>`;
  };
  let html = seat(top, 'Tophat · commander', 'top');
  for (let i = 0; i < 4; i++) html += seat(spears[i], 'Spear ' + (i + 1), 'sp');
  $('#seats').innerHTML = html;
  const amTop = S.role === 'tophat';
  const act = tophatAction(P, S.uid);
  $('#topBtn').hidden = amTop;
  $('#topBtn').textContent = act === 'ask' ? `Ask ${top ? top.name : ''} for Tophat` : 'Be Tophat';
  $('#spearBtn').hidden = !amTop;
  $('#spearBtn').disabled = !canBeSpear(P, S.uid);
  $('#startBtn').hidden = !S.isHost;
  $('#startBtn').disabled = !top;
  $('#tuneBtn').textContent = S.isHost ? 'Tune' : 'Tuning';
  const hostName = S.meta && P[S.meta.host] ? P[S.meta.host].name : 'the host';
  $('#lobbyMsg').textContent = !top ? 'Someone needs to be the Tophat before the match can start.'
    : S.isHost ? 'Start when everyone is in. Spear seats left open are filled by AI.'
    : `Waiting for ${hostName} to start the match.`;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function wantTophat() {
  const act = tophatAction(S.players, S.uid);
  if (act === 'take') { if (!(await S.room.role('take-tophat'))) toast('Someone grabbed it first'); }
  else if (act === 'ask') S.room.askTophat(S.name);
}
$('#topBtn').onclick = wantTophat;
$('#bAskTop').onclick = wantTophat;
$('#spearBtn').onclick = async () => { if (!(await S.room.role('be-spear'))) toast('No Spear seat is free'); };
$('#askYes').onclick = () => { $('#askModal').hidden = true; S.room.answer(true); };
$('#askNo').onclick = () => { $('#askModal').hidden = true; S.room.answer(false); };
$('#askCancel').onclick = () => { $('#asking').hidden = true; S.room.cancelAsk(); };
$('#startBtn').onclick = () => {
  if (!S.isHost || !tophatOf(S.players)) return;
  S.sim = newMatch(S.config); S.overSent = false; S.hostT = { acc: 0, state: 0, full: 0 };
  syncSpears();
  S.room.start(S.config);
};
$('#copyLink').onclick = async () => {
  const withPw = location.origin + location.pathname + '#pw=' + encodeURIComponent(S.invitePw || '');
  try { await navigator.clipboard.writeText(withPw); $('#copyNote').textContent = 'Copied. The link has the password in it, so only send it to friends.'; }
  catch (e) { $('#copyNote').textContent = withPw; }
};
async function leave() {
  if (document.pointerLockElement) document.exitPointerLock();
  if (S.solo) { S.sim = null; S.solo = false; S.phase = 'lobby'; show('join'); return; }
  const room = S.room;
  stopHost(); stopClient();
  Object.assign(S, { room: null, isHost: false, players: {}, meta: null, phase: 'lobby' });
  show('join');
  if (room) await room.leave().catch(() => {});
}
$('#leaveBtn').onclick = leave;
$('#bLeave').onclick = leave;

// ---------- tuning ----------
$('#tuneRows').innerHTML = TUNE.map(([k, label, mn, mx, st]) => `<label class="tr" for="t_${k}"><span>${label}</span><output id="o_${k}"></output><input type="range" id="t_${k}" min="${mn}" max="${mx}" step="${st}"></label>`).join('');
let tuneTimer = 0;
function renderTune() {
  const C = S.solo && S.sim ? S.sim.C : S.config;
  const editable = S.solo || (S.isHost && S.phase === 'lobby');
  for (const [k, , , , , fmt] of TUNE) { const inp = $('#t_' + k); inp.value = C[k]; inp.disabled = !editable; $('#o_' + k).textContent = fmt(C[k]); }
}
TUNE.forEach(([k, , , , , fmt]) => {
  $('#t_' + k).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    $('#o_' + k).textContent = fmt(v);
    S.config = cleanConfig({ ...S.config, [k]: v });
    if (S.solo && S.sim) {
      const me = S.sim.spears.me, u = me && S.sim.marines.find(m => m.id === me.unitId);
      if (k === 'heroHp' && u) { const f = u.hp / u.maxHp; u.maxHp = BASE.mHp * (1 + v); u.hp = f * u.maxHp; }
      S.sim.C = cleanConfig({ ...S.sim.C, [k]: v });
    } else if (S.room && S.isHost) {
      clearTimeout(tuneTimer); tuneTimer = setTimeout(() => S.room.setConfig(S.config), 250);
    }
  });
});
const openTune = v => { $('#tuning').hidden = !v; if (v) { renderTune(); if (document.pointerLockElement) document.exitPointerLock(); } };
$('#tuneBtn').onclick = () => openTune($('#tuning').hidden);
$('#bTune').onclick = () => openTune($('#tuning').hidden);
$('#tClose').onclick = () => openTune(false);

// ---------- over ----------
function showOver() {
  if (document.pointerLockElement) document.exitPointerLock();
  const v = S.view || (S.sim ? decode(snapshot(S.sim)) : S.snaps[S.snaps.length - 1]);
  if (!v) return;
  const win = v.win === true;
  $('#ovEyebrow').textContent = win ? 'Mission complete' : 'Mission failed';
  $('#ovTitle').textContent = win ? 'Ridge held' : 'Relay lost';
  const mm = Math.floor(v.now / 60), ss = Math.floor(v.now % 60).toString().padStart(2, '0');
  $('#ovStats').innerHTML = [['Time', `${mm}:${ss}`], ['Waves survived', win ? WAVES : Math.max(0, v.waveN - 1)], ['Marines lost', v.lost]]
    .map(([k, val]) => `<span>${k}</span><span class="num">${val}</span>`).join('');
  const rows = Object.values(v.spears);
  $('#ovBoard').innerHTML = rows.length ? '<tr><th>Spear</th><th>Kills</th><th>Deaths</th><th>Hops</th></tr>' +
    rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.kills}</td><td class="num">${r.deaths}</td><td class="num">${r.hops}</td></tr>`).join('') : '';
  $('#again').hidden = !(S.solo || S.isHost);
  $('#again').textContent = S.solo ? 'Play again' : 'Back to lobby';
  $('#ovWait').hidden = S.solo || S.isHost;
  $('#over').hidden = false;
}
$('#again').onclick = () => {
  $('#over').hidden = true;
  if (S.solo) { R.clearUnits(); startSoloMatch(); return; }
  if (S.isHost && S.room) S.room.setPhase('lobby');
};

let bannerTimer = 0;
function showBanner(msg, ms) { const b = $('#banner'); b.textContent = msg; b.hidden = false; clearTimeout(bannerTimer); if (ms) bannerTimer = setTimeout(() => b.hidden = true, ms); }

// ---------- local player state ----------
const cam = { fx: 0, fz: 34, dist: 80 };
const keys = {};
const selected = new Set();
let patrolArmed = false, mouseFire = false, lockFailed = false, hopCand = null, aimEnemy = false;
let markers = [], vign = 0, hitFlash = 0, recoil = 0, flashT = 0, fireCd = 0, poseSendT = 0, lastHp = null;
const pose = { u: 0, x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: -0.05 };
function resetPose() { pose.u = 0; lastHp = null; }

const mySpear = () => (S.view && S.view.spears[S.uid]) || null;
const spearActive = () => { const m = mySpear(); return S.role === 'spear' && m && m.state === 'active' && m.unitId; };
const inMatch = () => S.screen === 'game' && S.phase === 'playing';

function setPatrol(v) { patrolArmed = v; document.body.classList.toggle('patrol', v); $('#cPatrol').classList.toggle('armed', v); }
const aliveMarines = () => S.view ? [...S.view.units.values()].filter(u => u.team === 'm' && !u.dead) : [];
function selectSquad(sq, addTo) { if (!addTo) selected.clear(); for (const m of aliveMarines()) if (m.squad === sq) selected.add(m.id); }
function issue(kind, p) {
  const ids = [...selected].filter(id => { const u = S.view && S.view.units.get(id); return u && !u.dead; });
  if (!ids.length) { toast('Select marines first'); return; }
  cmd({ t: 'order', kind, ids, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
  if (kind !== 'hold') markers.push({ x: p.x, z: p.z, t: 0, col: kind === 'move' ? '#7bd88f' : '#ff9f3a' });
}
function holdSel() { issue('hold', { x: 0, z: 0 }); }

function tryHop() {
  const me = mySpear(); if (!spearActive()) return;
  const cd = me.hopReadyAt - hostNow();
  if (cd > 0) { toast('Hop cooling down: ' + Math.ceil(cd) + 's'); return; }
  if (!hopCand) { toast('Aim at a marine within ' + S.view.C.hopRange + 'm'); return; }
  cmd({ t: 'hop', target: hopCand });
}

// ---------- spear frame ----------
const ray = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);
const occluders = [R.terrain, R.rockGroup, R.relayMesh];

function spearFrame(dt) {
  const me = mySpear(), u = S.view.units.get(me.unitId);
  if (pose.u !== me.unitId) {
    // New body: start from wherever it is now.
    if (!u) return;
    Object.assign(pose, { u: me.unitId, x: u.x, z: u.z, y: H(u.x, u.z), vy: 0, yaw: u.face, pitch: -0.05 });
  }
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const mv = moveSpear(pose, { f, s, sprint: keys.ShiftLeft || keys.ShiftRight, jump: keys.Space }, dt);
  const bob = mv.moving && mv.grounded ? Math.sin(performance.now() / 1000 * 11) * 0.04 : 0;
  R.fpsCam.position.set(pose.x, pose.y + 1.62 + bob, pose.z);
  R.fpsCam.rotation.set(pose.pitch + recoil * 0.04, pose.yaw, 0);
  if (u) { u.x = pose.x; u.y = pose.y; u.z = pose.z; u.face = pose.yaw; }
  if (u && lastHp !== null && u.hp < lastHp) vign = Math.min(1, vign + (lastHp - u.hp) / 30);
  lastHp = u ? u.hp : null;

  if (!S.isHost) {
    poseSendT += dt;
    if (poseSendT >= POSE_EVERY && S.room) {
      poseSendT = 0;
      S.room.sendPose({ u: pose.u, x: r2(pose.x), y: r2(pose.y), z: r2(pose.z), yaw: r2(pose.yaw) }).catch(() => {});
    }
  }

  // Aim probe: a friendly marine under the crosshair is the hop candidate.
  const C = S.view.C;
  ray.setFromCamera(CENTER, R.fpsCam); ray.far = Math.max(C.hopRange, SHOT_RANGE);
  const targets = occluders.concat(R.unitMeshes(id => { const x = S.view.units.get(id); return x && !x.dead && id !== me.unitId; }));
  const hit = ray.intersectObjects(targets, true)[0];
  const hid = hit ? R.unitIdOf(hit.object) : null, hu = hid !== null ? S.view.units.get(hid) : null;
  hopCand = hu && hu.team === 'm' && !hu.owner && hit.distance <= C.hopRange ? hu.id : null;
  aimEnemy = !!(hu && hu.team === 's');

  fireCd -= dt;
  if (mouseFire && fireCd <= 0 && (document.pointerLockElement === canvas || lockFailed)) {
    fireCd = BASE.mFire; recoil = 1;
    const spread = 0.012;
    ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread), R.fpsCam); ray.far = SHOT_RANGE;
    const shoot = occluders.concat(R.unitMeshes((id, e) => e.team === 's' && S.view.units.get(id) && !S.view.units.get(id).dead));
    const h = ray.intersectObjects(shoot, true)[0];
    const end = h ? h.point : ray.ray.at(SHOT_RANGE, new THREE.Vector3());
    R.viewGun.updateMatrixWorld(); const muzzle = R.viewGun.localToWorld(new THREE.Vector3(0, 0.05, -0.62));
    R.tracer(muzzle, end, true); R.flash.visible = true; flashT = 0.04;
    const bid = h ? R.unitIdOf(h.object) : null;
    if (bid !== null) hitFlash = 1;
    cmd({ t: 'shot', bug: bid || 0, a: [muzzle.x, muzzle.y, muzzle.z].map(r2), b: [end.x, end.y, end.z].map(r2) });
  }
}
const r2 = v => Math.round(v * 100) / 100;

// ---------- input ----------
let drag = null;
function ndc(e) { const r = canvas.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
function groundAt(e) { ray.setFromCamera(ndc(e), R.rtsCam); ray.far = 1000; const h = ray.intersectObject(R.terrain)[0]; return h ? h.point : null; }
function requestLock() {
  if (lockFailed) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; }); }
  catch (e) { lockFailed = true; }
}
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
$('#mini').addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!inMatch() || !S.view) return;
  if (S.role === 'tophat') {
    if (e.button === 0) {
      if (patrolArmed) { const p = groundAt(e); if (p) issue('patrol', p); setPatrol(false); return; }
      drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey };
    } else if (e.button === 2) { const p = groundAt(e); if (p) issue(patrolArmed ? 'patrol' : 'move', p); setPatrol(false); }
  } else if (spearActive()) {
    if (document.pointerLockElement !== canvas && !lockFailed) { requestLock(); return; }
    if (e.button === 0) mouseFire = true;
  }
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.x1 = e.clientX; drag.y1 = e.clientY;
  const b = $('#selbox'), x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
  if (Math.abs(drag.x1 - drag.x0) + Math.abs(drag.y1 - drag.y0) > 6) { b.hidden = false; Object.assign(b.style, { left: x + 'px', top: y + 'px', width: Math.abs(drag.x1 - drag.x0) + 'px', height: Math.abs(drag.y1 - drag.y0) + 'px' }); }
});
window.addEventListener('pointerup', e => {
  if (e.button === 0) mouseFire = false;
  if (!drag) return;
  const d = drag; drag = null; $('#selbox').hidden = true;
  const r = canvas.getBoundingClientRect();
  if (!d.shift) selected.clear();
  if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) <= 6) {
    let best = null, bd = 24;
    for (const m of aliveMarines()) { const s = proj(m.x, m.y + 1, m.z, R.rtsCam); if (!s) continue;
      const dd = Math.hypot(s.x - (d.x0 - r.left), s.y - (d.y0 - r.top)); if (dd < bd) { bd = dd; best = m; } }
    if (best) { if (d.shift && selected.has(best.id)) selected.delete(best.id); else selected.add(best.id); }
  } else {
    const x0 = Math.min(d.x0, d.x1) - r.left, x1 = Math.max(d.x0, d.x1) - r.left, y0 = Math.min(d.y0, d.y1) - r.top, y1 = Math.max(d.y0, d.y1) - r.top;
    for (const m of aliveMarines()) { const s = proj(m.x, m.y + 1, m.z, R.rtsCam); if (s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) selected.add(m.id); }
  }
});
document.addEventListener('mousemove', e => {
  if (!inMatch() || !spearActive()) return;
  if (document.pointerLockElement === canvas || (lockFailed && (e.buttons & 2))) {
    pose.yaw -= e.movementX * 0.0022; pose.pitch = Math.max(-1.45, Math.min(1.45, pose.pitch - e.movementY * 0.0022));
  }
});
canvas.addEventListener('wheel', e => { if (S.role === 'tophat' && inMatch()) { e.preventDefault(); cam.dist = Math.max(28, Math.min(120, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); } }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT')) return;
  keys[e.code] = true;
  if (!inMatch()) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'Tab' && S.solo) { soloSwap(S.role === 'tophat' ? 'spear' : 'tophat'); return; }
  if (S.role === 'tophat') {
    const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (i >= 0) selectSquad(SQUADS[i], e.shiftKey);
    else if (e.code === 'KeyQ') { selected.clear(); aliveMarines().forEach(m => selected.add(m.id)); }
    else if (e.code === 'KeyP') setPatrol(!patrolArmed);
    else if (e.code === 'KeyX') holdSel();
    else if (e.code === 'Escape') { setPatrol(false); selected.clear(); }
  } else {
    if (e.code === 'KeyE') tryHop();
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    const me = mySpear();
    if (i >= 0 && me && me.state !== 'active' && hostNow() >= me.deadUntil && rdRank[i]) cmd({ t: 'redeploy', target: rdRank[i].m.id });
  }
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseFire = false; });

function soloSwap(role) {
  if (!S.solo || role === S.role) return;
  const prev = S.role; S.role = role; S.players.me.role = role;
  setDriven(S.sim, 'me', role === 'spear');
  onRoleChanged(prev);
  if (role === 'spear') { const me = S.sim.spears.me; if (me && me.unitId) { const u = S.sim.marines.find(m => m.id === me.unitId); if (u) Object.assign(pose, { u: u.id, x: u.x, z: u.z, y: u.y, yaw: u.face }); } }
  syncHud();
}
$('#bTop').onclick = () => soloSwap('tophat');
$('#bSpear').onclick = () => soloSwap('spear');
$('#cPatrol').onclick = () => setPatrol(!patrolArmed);
$('#cHold').onclick = holdSel;
$('#squads').innerHTML = SQUADS.map((s, i) => `<button class="sq" data-s="${s}"><b>${s}</b><span><kbd>${i + 1}</kbd> <span class="num" data-c="${s}">4</span> marines</span></button>`).join('');
$('#squads').addEventListener('click', e => { const b = e.target.closest('.sq'); if (b) selectSquad(b.dataset.s, e.shiftKey); });

// ---------- redeploy ----------
let rdRank = [], lastRd = '';
function renderRedeploy() {
  const me = mySpear(); if (!me) return;
  const now = hostNow(), ready = now >= me.deadUntil, first = me.state === 'none';
  $('#rdTitle').textContent = first ? 'Pick a body' : 'Killed in action';
  const left = Math.max(0, me.deadUntil - now);
  const why = first ? 'Most needed first. You drop in with a small buff: a bit more health and damage, nothing more.'
    : `${esc(me.reason)} <span id="rdTimer" class="num ${ready ? 'ready' : ''}">${ready ? 'Ready to redeploy.' : 'Redeploy in ' + left.toFixed(1) + 's'}</span>`;
  if ($('#rdWhy').innerHTML !== why) $('#rdWhy').innerHTML = why;
  rdRank = rankBodies([...S.view.units.values()]);
  const tagTxt = { combat: 'In combat', moving: 'Moving', hold: 'Holding' };
  const html = rdRank.map((r, i) => `<button class="dep" data-id="${r.m.id}" ${ready ? '' : 'disabled'}>
    <span class="n">${i + 1}</span><b>${r.m.name}</b><span class="s ${r.tag}">${tagTxt[r.tag]}${r.near ? ' · ' + r.near + ' swarm' : ''}</span>
    <span class="mini"><i style="width:${Math.round(r.m.hp / r.m.maxHp * 100)}%"></i></span></button>`).join('') || '<p class="k">No marines free. Reinforcements are on the way.</p>';
  if (html !== lastRd) { lastRd = html; $('#rdList').innerHTML = html; }
}
$('#rdList').addEventListener('click', e => {
  const b = e.target.closest('.dep'); if (!b || b.disabled) return;
  cmd({ t: 'redeploy', target: +b.dataset.id });
});

// ---------- HUD ----------
function syncHud() {
  const playing = S.screen === 'game' && !!S.view;
  const sp = playing && S.role === 'spear';
  const active = sp && !!spearActive();
  $('#topbar').hidden = !playing; $('#mini').hidden = !playing;
  $('#thHud').hidden = !(playing && S.role === 'tophat');
  $('#spHud').hidden = !active;
  $('#redeploy').hidden = !(sp && !active && S.phase === 'playing');
  $('#soloSeg').hidden = !S.solo; $('#tabHint').hidden = !S.solo; $('#bTune').hidden = !S.solo;
  $('#bAskTop').hidden = S.solo || S.role !== 'spear';
  $('#bTop').classList.toggle('on', S.role === 'tophat'); $('#bSpear').classList.toggle('on', S.role === 'spear');
  $('#youChip').textContent = S.solo ? '' : (S.role === 'tophat' ? 'You · Tophat' : 'You · Spear') + (S.isHost ? ' · host' : '');
  R.setFog(active);
  if (S.screen === 'game' && !S.view && !S.isHost) showBanner('Joining the match…'); else if (!$('#banner').textContent.startsWith('The host')) $('#banner').hidden = true;
}

let hudT = 0;
function hud(dt) {
  const v = S.view, now = hostNow();
  const me = mySpear();
  if (spearActive()) {
    const u = v.units.get(me.unitId);
    $('#cross').className = 'cross' + (hopCand ? ' ally' : aimEnemy ? ' enemy' : '');
    const cd = me.hopReadyAt - now, hc = hopCand && v.units.get(hopCand);
    $('#hopTag').textContent = hc ? `${hc.name} · ${Math.round(Math.hypot(hc.x - pose.x, hc.z - pose.z))}m · ${cd > 0 ? 'hop in ' + Math.ceil(cd) + 's' : 'E to hop'}` : '';
    $('#hitm').style.opacity = hitFlash;
    $('#vignette').style.opacity = vign;
    const show = document.pointerLockElement !== canvas && S.phase === 'playing';
    $('#lockhint').hidden = !show;
    $('#lockhint').textContent = lockFailed ? 'Hold right mouse to look around. Left click fires.' : 'Click to take control. Esc releases the mouse.';
    if (u) R.drawLeash(me.leash, v.C.leashR, leashStatus(u, me.leash, v.C, now).s); else R.drawLeash(null);
  } else {
    $('#vignette').style.opacity = 0;
    R.drawLeash(null);
  }
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  $('#sWave').textContent = `${v.waveN}/${WAVES}`;
  const aliveB = [...v.units.values()].filter(b => b.team === 's' && !b.dead).length + v.queueN;
  $('#sNext').textContent = v.waveActive ? '' : v.waveN < WAVES ? `next ${Math.max(0, Math.ceil(v.nextWaveAt - now))}s` : '';
  $('#sRelay').style.width = (v.relayHp / RELAY_MAX * 100) + '%';
  const alive = aliveMarines();
  $('#sMar').textContent = alive.length; $('#sBug').textContent = aliveB;
  if (S.role === 'tophat') {
    for (const id of [...selected]) if (!v.units.has(id) || v.units.get(id).dead) selected.delete(id);
    SQUADS.forEach(s => {
      const el = document.querySelector(`[data-c="${s}"]`), sq = alive.filter(m => m.squad === s);
      if (el) el.textContent = sq.length;
      document.querySelector(`.sq[data-s="${s}"]`).classList.toggle('on', sq.length > 0 && sq.every(m => selected.has(m.id)));
    });
    const sel = alive.filter(m => selected.has(m.id)), heroes = sel.filter(m => m.owner);
    $('#selInfo').innerHTML = sel.length ? `<b class="num">${sel.length}</b> selected${heroes.length ? ' · <span class="g">includes ' + heroes.map(m => esc(spearName(m.owner))).join(', ') + '</span>' : ''}` : 'Nothing selected';
  } else if (spearActive()) {
    const u = v.units.get(me.unitId); if (!u) return;
    const f = u.hp / u.maxHp;
    $('#hName').textContent = (S.solo ? '' : S.name + ' · ') + u.name;
    $('#hHp').style.width = (f * 100) + '%'; $('#hHp').style.background = hpCol(f);
    $('#hHpTxt').textContent = `${Math.ceil(u.hp)} / ${Math.round(u.maxHp)}`;
    $('#hBuff').textContent = `+${Math.round(v.C.heroHp * 100)}% HP · +${Math.round(v.C.heroDmg * 100)}% DMG`;
    const cd = me.hopReadyAt - now, hopEl = $('#hop');
    hopEl.classList.toggle('ready', cd <= 0); hopEl.textContent = cd <= 0 ? 'Hop ready · aim at a marine, press E' : `Hop cooldown ${Math.ceil(cd)}s`;
    const ls = leashStatus(u, me.leash, v.C, now), el = $('#leash');
    if (ls.s !== 'none') {
      el.hidden = false; el.className = ls.s === 'ok' ? 'ok' : ls.s === 'bad' ? 'bad' : '';
      $('#leashT').textContent = ls.s === 'ok' ? 'On station' : ls.s === 'bad' ? `Out of position · −${v.C.leashDrain} HP/s` : 'Tophat orders · reach the zone';
      $('#leashV').textContent = ls.s === 'go' ? `${Math.ceil(ls.left)}s · ${Math.round(ls.d - v.C.leashR)}m out` : ls.s === 'bad' ? `${Math.round(ls.d - v.C.leashR)}m out` : 'Hold the zone';
    } else el.hidden = true;
  }
  if (S.role === 'spear' && !spearActive() && S.phase === 'playing') renderRedeploy();
}
function spearName(pid) { const sp = S.view && S.view.spears[pid]; return sp ? sp.name : 'Spear'; }
function hpCol(f) { return f > 0.6 ? '#7bd88f' : f > 0.3 ? '#ffcc4d' : '#ff5a4f'; }

// ---------- minimap ----------
const mini = $('#mini'), mctx = mini.getContext('2d'), MS = 320;
const mbake = document.createElement('canvas'); mbake.width = mbake.height = MS;
{
  const c = mbake.getContext('2d'), img = c.createImageData(MS, MS);
  for (let py = 0; py < MS; py++) for (let px = 0; px < MS; px++) {
    const x = px / MS * 160 - 80, z = py / MS * 160 - 80, y = H(x, z), i = (py * MS + px) * 4;
    let r = 150 + y * 7, g = 100 + y * 4, b = 64 + y * 2;
    if (SPAWNS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 13)) { r = 74; g = 36; b = 67; }
    img.data[i] = Math.min(255, r); img.data[i + 1] = Math.min(255, g); img.data[i + 2] = Math.min(255, b); img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  c.fillStyle = '#5a3c2c'; for (const o of PROPS.obstacles) { c.beginPath(); c.arc((o.x + 80) / 160 * MS, (o.z + 80) / 160 * MS, o.r / 160 * MS, 0, 7); c.fill(); }
}
const mm = (x, z) => [(x + 80) / 160 * MS, (z + 80) / 160 * MS];
function drawMini() {
  const v = S.view;
  mctx.drawImage(mbake, 0, 0);
  const [rx, rz] = mm(RELAY.x, RELAY.z); mctx.fillStyle = '#7fe0ff'; mctx.fillRect(rx - 7, rz - 7, 14, 14);
  for (const b of v.units.values()) { if (b.team !== 's' || b.dead) continue; const [x, z] = mm(b.x, b.z); mctx.fillStyle = '#e04aa8'; const sz = b.type === 'brute' ? 9 : 6; mctx.fillRect(x - 3, z - 3, sz, sz); }
  for (const m of v.units.values()) { if (m.team !== 'm' || m.dead) continue; const [x, z] = mm(m.x, m.z);
    mctx.fillStyle = m.owner ? '#ffcc4d' : selected.has(m.id) ? '#b9f5c6' : '#8fb3d6'; mctx.beginPath(); mctx.arc(x, z, m.owner ? 6 : 4, 0, 7); mctx.fill(); }
  const me = mySpear();
  if (spearActive() && me.leash) {
    const L = me.leash; mctx.strokeStyle = '#ff9f3a'; mctx.lineWidth = 2;
    const pts = L.kind === 'point' ? [[L.x, L.z]] : [[L.ax, L.az], [L.bx, L.bz]];
    pts.forEach(([x, z]) => { const [a, b] = mm(x, z); mctx.beginPath(); mctx.arc(a, b, v.C.leashR / 160 * MS, 0, 7); mctx.stroke(); });
  }
  mctx.strokeStyle = 'rgba(241,230,210,.8)'; mctx.lineWidth = 2;
  if (S.role === 'tophat') { const w = cam.dist * 0.9, h = cam.dist * 0.6; const [a, b] = mm(cam.fx - w / 2, cam.fz - h / 2); mctx.strokeRect(a, b, w / 160 * MS, h / 160 * MS); }
  else if (spearActive()) { const [a, b] = mm(pose.x, pose.z); mctx.beginPath(); mctx.moveTo(a, b); mctx.lineTo(a - Math.sin(pose.yaw) * 22, b - Math.cos(pose.yaw) * 22); mctx.stroke(); }
}
function miniWorld(e) { const r = mini.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 160 - 80, z: (e.clientY - r.top) / r.height * 160 - 80 }; }
mini.addEventListener('pointerdown', e => {
  if (!inMatch() || S.role !== 'tophat') return;
  const p = miniWorld(e);
  if (e.button === 2) issue(patrolArmed ? 'patrol' : 'move', { x: clampM(p.x), z: clampM(p.z) });
  else { cam.fx = p.x; cam.fz = p.z + cam.dist * 0.25; }
});

// ---------- overlay ----------
const ov = $('#ov'), ctx = ov.getContext('2d');
let W = 1, Hh = 1, DPR = 1;
const pv = new THREE.Vector3();
function proj(x, y, z, c) { pv.set(x, y, z).project(c); if (pv.z > 1 || pv.z < -1) return null; return { x: (pv.x + 1) / 2 * W, y: (1 - pv.y) / 2 * Hh }; }
function bar(x, y, w, f, col) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5); ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 3); }
function drawOverlay(c) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, Hh);
  if (S.screen !== 'game' || !S.view) return;
  const v = S.view;
  ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
  if (c === R.rtsCam) {
    for (const mk of markers) { const s = proj(mk.x, H(mk.x, mk.z) + 0.2, mk.z, c); if (!s) continue;
      ctx.strokeStyle = mk.col; ctx.lineWidth = 2; ctx.globalAlpha = 1 - mk.t / 0.7; ctx.beginPath(); ctx.ellipse(s.x, s.y, 18 * (1 - mk.t), 9 * (1 - mk.t), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    for (const m of v.units.values()) {
      if (m.team !== 'm' || m.dead) continue; const s = proj(m.x, m.y + 2.3, m.z, c); if (!s) continue;
      const f = m.hp / m.maxHp;
      if (selected.has(m.id) || f < 1 || m.owner) bar(s.x, s.y, 26, f, hpCol(f));
      if (m.owner) {
        ctx.fillStyle = '#ffcc4d'; ctx.fillText(S.solo ? 'SPEAR' : spearName(m.owner).toUpperCase(), s.x, s.y - 6);
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 26); ctx.lineTo(s.x + 5, s.y - 20); ctx.lineTo(s.x, s.y - 14); ctx.lineTo(s.x - 5, s.y - 20); ctx.fill();
      }
    }
    for (const b of v.units.values()) { if (b.team !== 's' || b.dead || b.hp >= b.maxHp) continue; const s = proj(b.x, b.y + (b.type === 'brute' ? 2.6 : 1.4), b.z, c); if (s) bar(s.x, s.y, b.type === 'brute' ? 30 : 16, b.hp / b.maxHp, '#e04aa8'); }
    const rs = proj(RELAY.x, H(RELAY.x, RELAY.z) + 10, RELAY.z, c); if (rs) bar(rs.x, rs.y, 60, v.relayHp / RELAY_MAX, '#7fe0ff');
  } else {
    // Allies within 60m get a chevron; other Spears get their name.
    const me = mySpear();
    for (const m of v.units.values()) {
      if (m.team !== 'm' || m.dead || (me && m.id === me.unitId)) continue;
      const d = Math.hypot(m.x - pose.x, m.z - pose.z); if (d > 60) continue;
      const s = proj(m.x, m.y + 2.3, m.z, c); if (!s) continue;
      const isC = m.id === hopCand;
      ctx.fillStyle = m.owner ? '#ffcc4d' : isC ? '#7fe0ff' : 'rgba(143,179,214,.85)';
      ctx.beginPath(); ctx.moveTo(s.x - 5, s.y - 6); ctx.lineTo(s.x + 5, s.y - 6); ctx.lineTo(s.x, s.y); ctx.fill();
      if (m.owner && !S.solo) ctx.fillText(spearName(m.owner), s.x, s.y - 10);
      if (isC) bar(s.x, s.y - 14, 26, m.hp / m.maxHp, hpCol(m.hp / m.maxHp));
    }
  }
}

// ---------- loop ----------
function resize() {
  W = innerWidth; Hh = innerHeight; DPR = Math.min(devicePixelRatio, 2);
  R.resize(W, Hh); ov.width = W * DPR; ov.height = Hh * DPR;
}
addEventListener('resize', resize); resize();

let last = performance.now(), menuA = 0, wasActive = null, wasView = false;
const hostRuns = () => S.screen === 'game' && S.isHost && !!S.sim && (S.phase === 'playing' || S.solo);
function frame(ts) {
  requestAnimationFrame(frame);
  // The match runs on wall-clock time even when this machine draws slowly,
  // so a weak laptop as host doesn't slow the game down for everyone.
  const rawDt = Math.min(0.25, Math.max(0, (ts - last) / 1000)), dt = Math.min(0.05, rawDt); last = ts;

  if (S.screen === 'game') {
    if (S.isHost && S.sim) {
      if (hostRuns()) hostFrame(rawDt);
      S.view = decode(snapshot(S.sim));
    } else if (!S.isHost) {
      const v = clientView(); if (v) S.view = v;
    }
  }
  const hasView = S.screen === 'game' && !!S.view;
  if (hasView !== wasView) { wasView = hasView; syncHud(); }
  if (!S.isHost && S.screen === 'game' && S.phase === 'playing' && S.lastSnapAt) {
    const quiet = performance.now() / 1000 - S.lastSnapAt > 3;
    if (quiet && $('#banner').hidden) showBanner('Lost the host. Waiting for someone to take over…');
    else if (!quiet && $('#banner').textContent.startsWith('Lost the host')) $('#banner').hidden = true;
  }

  const active = hasView && !!spearActive() && S.phase === 'playing';
  if (active) spearFrame(dt);
  else { hopCand = null; aimEnemy = false; }
  if (active !== wasActive) { wasActive = active; syncHud(); }

  if (hasView && pendingAlpha && S.role === 'tophat') { pendingAlpha = false; selectSquad('Alpha'); }

  if (hasView && S.role === 'tophat' && inMatch()) {
    const sp = cam.dist * 0.9 * dt;
    if (keys.KeyW || keys.ArrowUp) cam.fz -= sp; if (keys.KeyS || keys.ArrowDown) cam.fz += sp;
    if (keys.KeyA || keys.ArrowLeft) cam.fx -= sp; if (keys.KeyD || keys.ArrowRight) cam.fx += sp;
    cam.fx = Math.max(-80, Math.min(80, cam.fx)); cam.fz = Math.max(-80, Math.min(85, cam.fz));
  }

  if (hasView) {
    const me = mySpear();
    R.sync(S.view, { tophat: S.role === 'tophat', selected, hideId: active && me ? me.unitId : -1 }, dt);
  }
  R.tickTracers(dt);
  markers.forEach(mk => mk.t += dt); markers = markers.filter(mk => mk.t < 0.7);
  recoil = Math.max(0, recoil - dt * 9); R.viewGun.position.z = -0.45 + recoil * 0.05;
  flashT -= dt; if (flashT <= 0) R.flash.visible = false;
  vign = Math.max(0, vign - dt * 1.2); hitFlash = Math.max(0, hitFlash - dt * 6);

  if (!hasView) {
    menuA += dt * 0.05; R.rtsCam.position.set(Math.sin(menuA) * 95, 55, Math.cos(menuA) * 95); R.rtsCam.lookAt(0, 2, 0);
  } else {
    const a = 0.98; R.rtsCam.position.set(cam.fx, cam.dist * Math.sin(a), cam.fz + cam.dist * Math.cos(a)); R.rtsCam.lookAt(cam.fx, 0, cam.fz);
  }
  const c = active ? R.fpsCam : R.rtsCam;
  R.renderer.render(R.scene, c);
  drawOverlay(c);
  if (hasView) { drawMini(); hud(dt); }
}
requestAnimationFrame(frame);

/* Browsers stop animation frames in a hidden tab. If the host alt-tabs, a
 * worker's timer keeps the match ticking for everyone else. (Solo just
 * pauses, which is what you want.)
 */
try {
  const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' })));
  let lastBg = performance.now();
  ticker.onmessage = () => {
    const t = performance.now(), d = Math.min(0.25, (t - lastBg) / 1000); lastBg = t;
    if (document.hidden && !S.solo && hostRuns()) hostFrame(d);
  };
} catch (e) { /* no workers: the match pauses while the host's tab is hidden */ }

// Handy for poking at things from the console while testing.
window.__ts = { S, pose };
