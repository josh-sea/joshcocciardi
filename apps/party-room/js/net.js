/* The room, over Firebase Realtime Database.
 *
 * party/rooms/{code}/
 *   meta       { host, created }              the host's phone runs the game
 *   players    { [uid]: { name, joined, online, leftAt } }
 *   game       what everyone sees: phase, question, scores, timers. Host writes.
 *   vault      what only the host may see: answers, the sketch word, hands
 *   secret     { [uid]: ... } one player's eyes only (a hand, a word)
 *   notes      { [uid]: { text, at } } a private nudge ("so close!")
 *   inbox      { [push id]: { uid, t, ... } } what players did; the host consumes it
 *   strokes    { [push id]: { s, c, w, p } } the drawing, written by whoever is drawing
 *   media      { [uid]: { on, cam, mic, since, sid } } who is on the video call
 *   rtc        { [to uid]: { [push id]: { from, t, d, sid, to } } } call setup
 *              messages (offer, answer, ice), readable only by who they're for
 *
 * The rules (database.rules.json) refuse to list rooms, keep the vault to
 * the current host, and keep each secret and note to its owner. See
 * functions/test/party-rules.test.mjs.
 *
 * Sign-in is anonymous and kept per tab, so two tabs are two players and a
 * reload keeps your place.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeAuth, browserSessionPersistence, onAuthStateChanged, signInAnonymously, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, onValue, set, update, push, remove, runTransaction, onDisconnect,
  serverTimestamp, onChildAdded, onChildRemoved, get, connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { makeCode, pickHost } from './room.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  databaseURL: 'https://josh-cocciardi-default-rtdb.firebaseio.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = initializeApp(firebaseConfig, 'party-room');
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
 * rather than taken over, so an old room can never leak into a new one.
 */
export async function createRoom(uid) {
  for (let tries = 0; tries < 6; tries++) {
    const code = makeCode();
    const res = await runTransaction(ref(db, `party/rooms/${code}/meta`), (cur) =>
      (cur ? undefined : { host: uid, created: Date.now() }));
    if (res.committed) return code;
  }
  throw new Error('Could not find a free room code. Try again.');
}

export function openRoom(code, uid) {
  const base = `party/rooms/${code}`;
  const r = (p) => ref(db, p ? `${base}/${p}` : base);
  const unsubs = [];
  const room = {
    code, uid, meta: null, players: {}, game: null, secret: null, note: null, live: false,

    async join(name) {
      const meta = (await get(r('meta'))).val();
      if (!meta) throw new Error('There is no room with that code. Check it with whoever made it.');
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
        // The server dropped our place on the call when the connection
        // went; put it back.
        if (room.mediaNow) room.setMedia(room.mediaNow);
      }));
    },

    watch(cb) {
      const on = (path, key) => unsubs.push(onValue(r(path), (s) => { room[key] = s.val(); cb(key); }));
      on('meta', 'meta');
      on('players', 'players');
      on('game', 'game');
      on(`secret/${uid}`, 'secret');
      on(`notes/${uid}`, 'note');
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
    writeSecret(who, v) { return set(r(`secret/${who}`), v); },
    writeNote(who, text) { return set(r(`notes/${who}`), { text, at: serverNow() }); },
    clearStrokes() { return remove(r('strokes')); },
    endGame() {
      return update(r(''), { game: null, vault: null, secret: null, notes: null, strokes: null });
    },
    claimHost() {
      return runTransaction(r('meta/host'), (cur) => (pickHost(room.players, cur) === uid && cur !== uid ? uid : undefined))
        .then((res) => res.committed);
    },

    // ---- the drawing ----
    addStroke(chunk) { return push(r('strokes'), chunk); },
    removeStrokes(keys) {
      const u = {};
      keys.forEach((k) => { u[`strokes/${k}`] = null; });
      return update(r(''), u);
    },
    onStrokes(added, removed) {
      const a = onChildAdded(r('strokes'), (s) => added(s.key, s.val()));
      const b = onChildRemoved(r('strokes'), (s) => removed(s.key));
      return () => { a(); b(); };
    },

    // ---- the video call (rtc.js). Video goes phone to phone; only these
    // small setup messages pass through the database. ----
    mediaNow: null,
    async setMedia(v) {
      room.mediaNow = v;
      await onDisconnect(r(`media/${uid}`)).remove();
      await onDisconnect(r(`rtc/${uid}`)).remove();
      return set(r(`media/${uid}`), v);
    },
    updateMedia(v) {
      if (room.mediaNow) Object.assign(room.mediaNow, v);
      return update(r(`media/${uid}`), v);
    },
    async clearMedia() {
      room.mediaNow = null;
      await Promise.all([remove(r(`media/${uid}`)), remove(r(`rtc/${uid}`))]);
      await onDisconnect(r(`media/${uid}`)).cancel();
      await onDisconnect(r(`rtc/${uid}`)).cancel();
    },
    onMedia(cb) {
      const u = onValue(r('media'), (s) => cb(s.val() || {}));
      unsubs.push(u);
      return u;
    },
    sendSignal(to, msg) { return push(r(`rtc/${to}`), { ...msg, from: uid }); },
    onSignal(cb) {
      const u = onChildAdded(r(`rtc/${uid}`), (s) => { const v = s.val(); remove(s.ref); if (v) cb(v); });
      unsubs.push(u);
      return u;
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
