/* "1 to 10" rooms: everything that talks to Firebase.
 *
 * Sign-in is anonymous, same as the photo game. Nobody is making an account
 * to play a guessing game with their cousins; the room code plus a name is
 * the whole identity. The uid exists so the security rules have something
 * to check, and because "only the picker may read the number" has to mean
 * something at the database rather than only in the UI.
 *
 * The one rule worth restating here because it constrains every write
 * below: the secret number never goes into the room document until the
 * reveal. It is committed to a private document first, and the rules check
 * the reveal against that commit, so a picker cannot see the guesses and
 * then decide they meant something else.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, updateDoc, onSnapshot,
  deleteField, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { makeCode, isValidCode, cleanName, freshRound, nextPicker, guesserIds } from './room.js';
import { scoreGuess } from './scale.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

// The photo game may already have started the app; starting it twice throws.
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let uid = null;
export const currentUid = () => uid;

export function ready() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) { uid = user.uid; resolve(uid); return; }
      try { const cred = await signInAnonymously(auth); uid = cred.user.uid; resolve(uid); }
      catch (e) { reject(new Error('Could not start a session: ' + e.message)); }
    });
  });
}

const roomRef = (code) => doc(db, 'scale_rooms', code);
const secretRef = (code, who) => doc(db, 'scale_rooms', code, 'private', who || uid);

/* ── making and joining ──────────────────────────────────────────────────── */

export async function createRoom(name) {
  const who = cleanName(name);
  /* Codes are short enough to collide eventually. The rules forbid reading
   * a room you are not in, so we cannot look before we leap: write, and on
   * refusal try another code. A collision and a permissions problem look
   * the same from here, which is why the last failure is reported plainly
   * rather than guessed at.
   */
  let last = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    try {
      await setDoc(roomRef(code), {
        code,
        hostUid: uid,
        createdAt: Date.now(),
        players: { [uid]: { name: who, score: 0 } },
        round: freshRound(1, uid),
      });
      return code;
    } catch (err) { last = err; }
  }
  throw new Error('Could not make a room. ' + (last ? last.message : 'Try again.'));
}

/* Join a room, or come back to one.
 *
 * These are the same write, which is convenient but was quietly destructive:
 * it wrote { name, score: 0 } over whatever was there, so coming back after
 * a reload reset your score to nothing. That was survivable while rejoining
 * was a deliberate tap and became permanent once it happened automatically.
 *
 * Being able to read the room is itself the test of membership, since the
 * rules only hand it to players. A successful read means keep the score and
 * change nothing but the name; a refusal means this is a genuine newcomer
 * who has to write blind.
 */
export async function joinRoom(code, name) {
  if (!isValidCode(code)) throw new Error('That is not a room code.');
  const who = cleanName(name);

  try {
    const snap = await getDoc(roomRef(code));
    if (snap.exists() && uid in (snap.data().players || {})) {
      const mine = snap.data().players[uid] || {};
      await updateDoc(roomRef(code), { [`players.${uid}`]: { ...mine, name: who } });
      return (await getDoc(roomRef(code))).data();
    }
  } catch {
    // Not a member, so the read was refused. Fall through and join properly.
  }

  try {
    await updateDoc(roomRef(code), { [`players.${uid}`]: { name: who, score: 0 } });
  } catch (err) {
    throw new Error('No room with that code, or it has been closed.');
  }
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) throw new Error('No room with that code.');
  return snap.data();
}

/* Watch a room.
 *
 * includeMetadataChanges is on so the caller can tell a live update from one
 * served out of the local cache. That difference is the whole of "is it my
 * turn yet": a phone that has been asleep shows cached state that looks
 * perfectly normal and is simply old, and without this nothing on screen or
 * in code can tell the difference.
 */
export function watch(code, onRoom, onError) {
  return onSnapshot(
    roomRef(code),
    { includeMetadataChanges: true },
    (snap) => onRoom(snap.exists() ? snap.data() : null, {
      fromCache: snap.metadata.fromCache,
      pending: snap.metadata.hasPendingWrites,
    }),
    (err) => { if (onError) onError(err); }
  );
}

/* Force a read past the cache, for when the page comes back from being
 * backgrounded and the socket may have died without anyone noticing.
 */
export async function refetch(code) {
  const snap = await getDocFromServer(roomRef(code));
  return snap.exists() ? snap.data() : null;
}

export async function leave(code) {
  try { await updateDoc(roomRef(code), { [`players.${uid}`]: deleteField() }); }
  catch { /* already gone, or the room is */ }
}

/* ── playing ─────────────────────────────────────────────────────────────── */

/* Commit the number privately, then open the room for questions. Two
 * writes, and the order matters: if the second fails the round simply does
 * not start, where the other way round would leave everyone asking
 * questions of a picker who has not decided yet.
 */
export async function commitNumber(code, roundN, n) {
  await setDoc(secretRef(code), { round: roundN, secret: n });
  await updateDoc(roomRef(code), { 'round.phase': 'asking' });
}

/* ── writes that depend on what is already there ─────────────────────────
 *
 * Every one of these used to rebuild the whole questions array from the
 * snapshot this phone happened to be holding, and write it back. Two people
 * acting within a second of each other meant the later write replaced the
 * earlier one wholesale, so a question or an answer simply disappeared.
 * From the inside that is indistinguishable from the app not syncing at
 * all, which is exactly how it felt to play.
 *
 * A transaction re-reads inside the write, so what goes back is built on
 * what is actually in the room rather than on what this phone last saw.
 * Firestore retries the whole thing if somebody else got there first.
 *
 * They also check the phase they are about to act on, so a double tap or a
 * screen that has not caught up cannot shove the round somewhere silly.
 */
export async function askQuestion(code, topic) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('The room has gone.');
    const r = snap.data().round;
    if (r.phase !== 'asking') throw new Error('Too late, the round has moved on.');
    const last = r.questions[r.questions.length - 1];
    if (last && typeof last.answer !== 'string') throw new Error('There is already a question waiting.');
    tx.update(roomRef(code), {
      'round.questions': [...r.questions, { topic, askedBy: uid, answer: null }],
    });
  });
}

export async function answerQuestion(code, text) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('The room has gone.');
    const r = snap.data().round;
    if (r.phase !== 'asking' || !r.questions.length) throw new Error('Nothing to answer.');
    const at = r.questions.length - 1;
    if (typeof r.questions[at].answer === 'string') throw new Error('That one is already answered.');
    tx.update(roomRef(code), {
      'round.questions': r.questions.map((q, i) => (i === at ? { ...q, answer: String(text) } : q)),
    });
  });
}

export async function openGuessing(code) {
  await updateDoc(roomRef(code), { 'round.phase': 'guessing' });
}

export async function submitGuess(code, n) {
  await updateDoc(roomRef(code), { [`round.guesses.${uid}`]: n });
}

/* The reveal, which is also when points are awarded.
 *
 * The number comes back out of the private document rather than from
 * anything held in memory, so a reloaded phone can still finish the round,
 * and so the value written is provably the one the rules check against.
 */
/* The reveal writes the whole players map to add up the scores, so it has
 * the same hazard and the same fix. The number still comes out of the
 * private document rather than memory, so a reloaded phone can finish the
 * round and the value written is provably the one the rules check against.
 */
export async function reveal(code) {
  const mine = await getDoc(secretRef(code));
  if (!mine.exists()) throw new Error('Your number is missing. Start the round again.');
  const secret = mine.data().secret;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('The room has gone.');
    const room = snap.data();
    if (room.round.phase === 'revealed') return;       // somebody already did
    const players = { ...room.players };
    for (const g of guesserIds(room)) {
      const points = scoreGuess(room.round.guesses[g], secret);
      if (players[g]) players[g] = { ...players[g], score: (players[g].score || 0) + points };
    }
    tx.update(roomRef(code), { 'round.secret': secret, 'round.phase': 'revealed', players });
  });
}

export async function startNextRound(code) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('The room has gone.');
    const room = snap.data();
    // Two people tapping "next round" must not advance it twice.
    if (room.round.phase !== 'revealed') return;
    tx.update(roomRef(code), { round: freshRound((room.round.n || 1) + 1, nextPicker(room)) });
  });
}
