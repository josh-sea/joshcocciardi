/* The room, over Firebase Realtime Database.
 *
 * tophat/rooms/{key}/
 *   meta      { host, phase: 'lobby'|'playing'|'over', config, created }
 *   players   { [uid]: { name, role: 'tophat'|'spear', joined, online, leftAt } }
 *   request   { uid, name, at, status: 'pending'|'no' }   someone asking for Tophat
 *   state     compact snapshot, written by the host ~10x a second
 *   full      the whole simulation, every 2s, so another player can take over as host
 *   inputs    { [uid]: Spear pose }, written by each Spear ~15x a second
 *   cmds      { [push id]: { uid, t, ... } }   orders, shots, hops; the host consumes them
 *
 * The room key comes from the password (keys.js). The rules refuse to list
 * rooms, so you can only reach one whose password you know.
 *
 * Sign-in is anonymous and kept per tab, so two tabs on one laptop are two
 * players, and a reload keeps your seat.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeAuth, browserSessionPersistence, onAuthStateChanged, signInAnonymously, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, onValue, set, update, push, remove, runTransaction, onDisconnect,
  serverTimestamp, onChildAdded, get, connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { DEFAULTS } from './config.js';
import { seatFor, applyRole, pickHost, list } from './lobby.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  databaseURL: 'https://josh-cocciardi-default-rtdb.firebaseio.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = initializeApp(firebaseConfig, 'tophat-spears');
const auth = initializeAuth(app, { persistence: browserSessionPersistence });
const db = getDatabase(app);

// Local testing against the Firebase emulators: open the page on localhost
// with ?emu in the address.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emu')) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

export function signIn() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, async user => {
      if (user) { stop(); resolve(user.uid); return; }
      try { const cred = await signInAnonymously(auth); stop(); resolve(cred.user.uid); }
      catch (e) { stop(); reject(new Error('Could not start a session: ' + e.message)); }
    });
  });
}

// Players who left more than this long ago lose their seat when someone joins.
const STALE_MS = 10 * 60 * 1000;

export function openRoom(key, uid) {
  const base = `tophat/rooms/${key}`;
  const r = p => ref(db, `${base}/${p}`);
  const unsubs = [];
  const room = {
    uid, key, players: {}, meta: null, request: null,

    async join(name) {
      await runTransaction(r('meta'), cur => cur || { host: uid, phase: 'lobby', config: { ...DEFAULTS }, created: Date.now() });
      const now = Date.now();
      const res = await runTransaction(r('players'), cur => {
        const next = { ...(cur || {}) };
        for (const [id, p] of Object.entries(next)) {
          if (id !== uid && !p.online && p.leftAt && now - p.leftAt > STALE_MS) delete next[id];
        }
        const seat = seatFor(next, uid);
        if (!seat.role) return; // full: abort
        if (seat.replace) delete next[seat.replace];
        next[uid] = { ...(next[uid] || {}), name, role: seat.role, joined: (next[uid] && next[uid].joined) || now, online: true };
        delete next[uid].leftAt;
        return next;
      });
      if (!res.committed) throw new Error('This lobby is full: one Tophat and four Spears are already in.');
      const players = res.snapshot.val() || {};
      // Nobody else here: whatever the room was doing before is over.
      if (!list(players).some(p => p.uid !== uid && p.online)) {
        await update(r('meta'), { host: uid, phase: 'lobby' });
        await Promise.all(['state', 'full', 'cmds', 'inputs', 'request'].map(p => remove(r(p))));
      }
      // Presence: mark online now and whenever the connection comes back;
      // the server marks us offline if the tab closes or the network drops.
      unsubs.push(onValue(ref(db, '.info/connected'), snap => {
        if (snap.val() !== true) return;
        onDisconnect(r(`players/${uid}`)).update({ online: false, leftAt: serverTimestamp() });
        update(r(`players/${uid}`), { online: true, name });
      }));
    },

    watch({ onMeta, onPlayers, onRequest }) {
      unsubs.push(onValue(r('meta'), s => { room.meta = s.val(); onMeta && onMeta(room.meta); }));
      unsubs.push(onValue(r('players'), s => { room.players = s.val() || {}; onPlayers && onPlayers(room.players); }));
      unsubs.push(onValue(r('request'), s => { room.request = s.val(); onRequest && onRequest(room.request); }));
    },

    async role(action, who = uid) {
      const res = await runTransaction(r('players'), cur => {
        const next = applyRole(cur || {}, who, action);
        return next || undefined;
      });
      return res.committed;
    },

    askTophat(name) { return set(r('request'), { uid, name, at: serverTimestamp(), status: 'pending' }); },
    cancelAsk() { return runTransaction(r('request'), cur => (cur && cur.uid === uid ? null : undefined)); },
    async answer(yes) {
      const req = room.request; if (!req) return;
      if (yes) { await room.role('swap', req.uid); await remove(r('request')); }
      else await update(r('request'), { status: 'no' });
    },
    clearRequest() { return remove(r('request')); },

    setConfig(config) { return update(r('meta'), { config }); },
    async start(config) {
      await Promise.all(['state', 'full', 'cmds', 'inputs'].map(p => remove(r(p))));
      await update(r('meta'), { phase: 'playing', config, startedAt: serverTimestamp() });
    },
    setPhase(phase) { return update(r('meta'), { phase }); },

    // Host takeover when the current host's tab is gone.
    claimHost() {
      return runTransaction(r('meta/host'), cur => (pickHost(room.players, cur) === uid && cur !== uid ? uid : undefined))
        .then(res => res.committed);
    },
    loadFull() { return get(r('full')).then(s => s.val()); },

    // ---- in-match traffic ----
    sendCmd(cmd) { return push(r('cmds'), { ...cmd, uid }); },
    sendPose(p) { return set(r(`inputs/${uid}`), p); },
    writeState(snap) { return set(r('state'), snap); },
    writeFull(data) { return set(r('full'), data); },
    onState(cb) { const u = onValue(r('state'), s => { const v = s.val(); if (v) cb(v); }); unsubs.push(u); return u; },
    onInputs(cb) { const u = onValue(r('inputs'), s => cb(s.val() || {})); unsubs.push(u); return u; },
    onCmd(cb) {
      const u = onChildAdded(r('cmds'), s => { const v = s.val(); remove(s.ref); if (v) cb(v); });
      unsubs.push(u); return u;
    },

    async leave() {
      unsubs.splice(0).forEach(u => u());
      await onDisconnect(r(`players/${uid}`)).cancel();
      await runTransaction(r('request'), cur => (cur && cur.uid === uid ? null : undefined));
      await remove(r(`players/${uid}`));
      await remove(r(`inputs/${uid}`));
    },
  };
  return room;
}
