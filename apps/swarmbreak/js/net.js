/* The room, over Firebase Realtime Database.
 *
 * swarm/rooms/{key}/
 *   meta      { host, phase: 'lobby'|'playing', config, created, startedAt }
 *   players   { [uid]: { names: [..], joined, online, leftAt } }
 *   state     compact snapshot, written by the host ~10x a second
 *   full      the whole match every 2 s, so another browser can take over
 *   inputs    { [uid]: { [pid]: input } }, written by each browser ~20x a second
 *   cmds      { [push id]: { uid, t, ... } }   retry, next, etc; the host consumes them
 *
 * The room key comes from the password (keys.js). The rules refuse to list
 * rooms, so you can only reach one whose password you know. Sign-in is
 * anonymous and kept per tab.
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
import { seat, pickHost, list } from './lobby.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  databaseURL: 'https://josh-cocciardi-default-rtdb.firebaseio.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = initializeApp(firebaseConfig, 'swarmbreak');
const auth = initializeAuth(app, { persistence: browserSessionPersistence });
const db = getDatabase(app);

// Local testing against the emulators: open on localhost with ?emu.
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

export function openRoom(key, uid) {
  const base = `swarm/rooms/${key}`;
  const r = p => ref(db, `${base}/${p}`);
  const unsubs = [];
  const room = {
    uid, key, players: {}, meta: null,

    async join(names) {
      await runTransaction(r('meta'), cur => cur || { host: uid, phase: 'lobby', config: { ...DEFAULTS }, created: Date.now() });
      const res = await runTransaction(r('players'), cur => seat(cur || {}, uid, names) || undefined);
      if (!res.committed) throw new Error('This lobby is full: four marines are already in.');
      const players = res.snapshot.val() || {};
      if (!list(players).some(p => p.uid !== uid && p.online)) {
        await update(r('meta'), { host: uid, phase: 'lobby' });
        await Promise.all(['state', 'full', 'cmds', 'inputs'].map(p => remove(r(p))));
      }
      unsubs.push(onValue(ref(db, '.info/connected'), snap => {
        if (snap.val() !== true) return;
        onDisconnect(r(`players/${uid}`)).update({ online: false, leftAt: serverTimestamp() });
        onDisconnect(r(`inputs/${uid}`)).remove();
        update(r(`players/${uid}`), { online: true, names });
      }));
    },

    watch({ onMeta, onPlayers }) {
      unsubs.push(onValue(r('meta'), s => { room.meta = s.val(); onMeta && onMeta(room.meta); }));
      unsubs.push(onValue(r('players'), s => { room.players = s.val() || {}; onPlayers && onPlayers(room.players); }));
    },

    setConfig(config) { return update(r('meta'), { config }); },
    async start(config) {
      await Promise.all(['state', 'full', 'cmds', 'inputs'].map(p => remove(r(p))));
      await update(r('meta'), { phase: 'playing', config, startedAt: serverTimestamp(), seed: (Math.random() * 2 ** 31) | 0 });
    },
    toLobby() { return update(r('meta'), { phase: 'lobby' }); },

    claimHost() {
      return runTransaction(r('meta/host'), cur => (pickHost(room.players, cur) === uid && cur !== uid ? uid : undefined))
        .then(res => res.committed);
    },
    loadFull() { return get(r('full')).then(s => s.val()); },

    sendCmd(cmd) { return push(r('cmds'), { ...cmd, uid, t: Date.now() }); },
    sendInputs(byPid) { return set(r(`inputs/${uid}`), byPid); },
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
      await remove(r(`players/${uid}`));
      await remove(r(`inputs/${uid}`));
    },
  };
  return room;
}
