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
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, deleteField,
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

export async function joinRoom(code, name) {
  if (!isValidCode(code)) throw new Error('That is not a room code.');
  const who = cleanName(name);
  try {
    // Join blind: you cannot read the room until you are in it.
    await updateDoc(roomRef(code), { [`players.${uid}`]: { name: who, score: 0 } });
  } catch (err) {
    throw new Error('No room with that code, or it has been closed.');
  }
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) throw new Error('No room with that code.');
  return snap.data();
}

export function watch(code, onRoom, onError) {
  return onSnapshot(
    roomRef(code),
    (snap) => onRoom(snap.exists() ? snap.data() : null),
    (err) => { if (onError) onError(err); }
  );
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

export async function askQuestion(code, room, topic) {
  const questions = [...room.round.questions, { topic, askedBy: uid, answer: null }];
  await updateDoc(roomRef(code), { 'round.questions': questions });
}

export async function answerQuestion(code, room, text) {
  const last = room.round.questions.length - 1;
  const questions = room.round.questions.map((q, i) => (i === last ? { ...q, answer: String(text) } : q));
  await updateDoc(roomRef(code), { 'round.questions': questions });
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
export async function reveal(code, room) {
  const snap = await getDoc(secretRef(code));
  if (!snap.exists()) throw new Error('Your number is missing. Start the round again.');
  const secret = snap.data().secret;

  const players = { ...room.players };
  for (const g of guesserIds(room)) {
    const points = scoreGuess(room.round.guesses[g], secret);
    if (players[g]) players[g] = { ...players[g], score: (players[g].score || 0) + points };
  }

  await updateDoc(roomRef(code), {
    'round.secret': secret,
    'round.phase': 'revealed',
    players,
  });
}

export async function startNextRound(code, room) {
  const who = nextPicker(room);
  await updateDoc(roomRef(code), { round: freshRound((room.round.n || 1) + 1, who) });
}
