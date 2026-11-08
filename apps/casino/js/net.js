/* A table with friends, over Firebase Realtime Database.
 *
 * casino/tables/{code}/
 *   meta     { host, created }                    the host's phone runs the table
 *   players  { [uid]: { name, joined, online, leftAt } }
 *   game     the table everyone sees (blackjack.js `pub`). Host writes.
 *   vault    the shoe and the dealer's hole card. Only the host may read it.
 *   inbox    { [push id]: { uid, t, ... } } what players did; the host consumes it
 *
 * The rules (database.rules.json) refuse to list tables, keep the vault to
 * the current host, let only the host write the table, and let players
 * post to the inbox only as themselves. See functions/test/casino-rules.test.mjs.
 *
 * Sign-in is anonymous and kept per tab, so two tabs are two players and a
 * reload keeps your seat.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeAuth, browserSessionPersistence, onAuthStateChanged, signInAnonymously, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, onValue, set, update, push, remove, runTransaction, onDisconnect,
  serverTimestamp, onChildAdded, get, connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { makeCode, pickHost } from './lobby.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  databaseURL: 'https://josh-cocciardi-default-rtdb.firebaseio.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = initializeApp(firebaseConfig, 'casino');
const auth = initializeAuth(app, { persistence: browserSessionPersistence });
const db = getDatabase(app);

// Local testing against the emulators: open the page on localhost with ?emu.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emu')) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
/* Every phone counts down to the same deadline, so every phone reads the
 * server's clock rather than its own.
 */
export const serverNow = () => Date.now() + offset;

export function signIn() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      if (user) { stop(); resolve(user.uid); return; }
      try { const cred = await signInAnonymously(auth); stop(); resolve(cred.user.uid); }
      catch (e) { stop(); reject(new Error('Could not connect: ' + e.message)); }
    });
  });
}

/* A fresh code nobody is using. A code that was used before is skipped
 * rather than taken over, so an old table can never leak into a new one.
 */
export async function createRoom(uid) {
  for (let tries = 0; tries < 6; tries++) {
    const code = makeCode();
    const res = await runTransaction(ref(db, `casino/tables/${code}/meta`), (cur) =>
      (cur ? undefined : { host: uid, created: Date.now() }));
    if (res.committed) return code;
  }
  throw new Error('Could not find a free table code. Try again.');
}

export function openRoom(code, uid) {
  const base = `casino/tables/${code}`;
  const r = (p) => ref(db, p ? `${base}/${p}` : base);
  const unsubs = [];
  const room = {
    code, uid, meta: null, players: {}, game: null, live: false,

    async join(name) {
      const meta = (await get(r('meta'))).val();
      if (!meta) throw new Error('There is no table with that code. Check it with whoever opened it.');
      const mine = (await get(r(`players/${uid}`))).val();
      await set(r(`players/${uid}`), { name, joined: (mine && mine.joined) || Date.now(), online: true });
      // Presence: online now and whenever the connection comes back; the
      // server marks us offline if the tab closes or the network drops.
      unsubs.push(onValue(ref(db, '.info/connected'), (snap) => {
        room.live = snap.val() === true;
        room.onLive && room.onLive(room.live);
        if (!room.live) return;
        onDisconnect(r(`players/${uid}`)).update({ online: false, leftAt: serverTimestamp() });
        update(r(`players/${uid}`), { online: true, name });
      }));
    },

    watch(cb) {
      const on = (path, key) => unsubs.push(onValue(r(path), (s) => { room[key] = s.val(); cb(key); }));
      on('meta', 'meta');
      on('players', 'players');
      on('game', 'game');
    },

    isHost() { return !!room.meta && room.meta.host === uid; },

    send(msg) { return push(r('inbox'), { ...msg, uid }); },

    // ---- host only (the rules refuse everyone else) ----
    onInbox(cb) {
      const u = onChildAdded(r('inbox'), (s) => { const v = s.val(); remove(s.ref); if (v) cb(v); });
      return u;
    },
    writeGame(pub) { return set(r('game'), pub); },
    writeVault(v) { return set(r('vault'), v); },
    loadVault() { return get(r('vault')).then((s) => s.val()); },
    claimHost() {
      return runTransaction(r('meta/host'), (cur) => (pickHost(room.players, cur) === uid && cur !== uid ? uid : undefined))
        .then((res) => res.committed);
    },

    async leave() {
      room.onLeave && await room.onLeave();
      unsubs.splice(0).forEach((u) => u());
      await onDisconnect(r(`players/${uid}`)).cancel();
      await remove(r(`players/${uid}`));
    },
  };
  return room;
}
