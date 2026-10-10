/* Everything that talks to Firebase.
 *
 * Sign-in is anonymous: the game needs a uid so the security rules have
 * something to check, but nobody should have to make an account to play a
 * photo game with their family. The durable credential is the deck password,
 * not this uid — clear your browser and you rejoin with the password.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  getDocs, addDoc, arrayUnion, serverTimestamp, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { deriveKey, normaliseName } from './keys.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let uid = null;
export function currentUid() { return uid; }

export function ready() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) { uid = user.uid; resolve(uid); return; }
      try { const cred = await signInAnonymously(auth); uid = cred.user.uid; resolve(uid); }
      catch (e) { reject(new Error('Could not start a session: ' + e.message)); }
    });
  });
}

/* ── photos ────────────────────────────────────────────────────────────────
 *
 * Phone photos are far bigger than this game needs and bigger than the
 * Storage rules allow, so everything is redrawn to a sane size and
 * re-encoded as JPEG before it goes anywhere. Shrinking here also strips the
 * EXIF block, which is worth saying out loud: the GPS coordinates and the
 * camera serial in a phone photo do not get uploaded.
 */
const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.82;

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
    img.src = url;
  });
}

export async function shrink(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Could not process that photo.');
  return { blob, w, h };
}

async function putImage(path, file) {
  const { blob, w, h } = await shrink(file);
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  return { path, w, h };
}

export async function urlFor(path) { return getDownloadURL(ref(storage, path)); }

/* ── decks ─────────────────────────────────────────────────────────────── */

const deckRef = (id) => doc(db, 'whereami_decks', id);
const keyRef = (k) => doc(db, 'whereami_keys', k);
const meRef = () => doc(db, 'whereami_users', uid);

// Remember which decks this browser is in, so they can be listed again
// without retyping the password. Best effort: losing it costs nothing.
async function remember(deckId, name) {
  try {
    const snap = await getDoc(meRef());
    const decks = (snap.exists() && snap.data().decks) || [];
    const kept = decks.filter(d => d.id !== deckId);
    await setDoc(meRef(), { decks: [{ id: deckId, name }, ...kept].slice(0, 40) });
  } catch { /* the deck still works without a bookmark */ }
}

export async function myDecks() {
  try {
    const snap = await getDoc(meRef());
    return (snap.exists() && snap.data().decks) || [];
  } catch { return []; }
}

export async function forget(deckId) {
  const decks = await myDecks();
  try { await setDoc(meRef(), { decks: decks.filter(d => d.id !== deckId) }); } catch { /* ignore */ }
}

/* Make a deck. The password is turned into a key and only the key is stored;
 * if you forget the password there is no reset, because there is nothing on
 * the server that knows it.
 */
export async function createDeck({ name, password, tolerance }) {
  const key = await deriveKey(name, password);
  const existing = await getDoc(keyRef(key));
  if (existing.exists()) throw new Error('A deck already uses that name and password. Pick a different password.');

  const made = await addDoc(collection(db, 'whereami_decks'), {
    name: String(name).trim(),
    nameKey: normaliseName(name),
    ownerUid: uid,
    memberUids: [uid],
    tolerance: tolerance || 0.08,
    createdAt: serverTimestamp(),
  });

  await setDoc(keyRef(key), { deckId: made.id });
  await remember(made.id, String(name).trim());
  return { id: made.id, name: String(name).trim() };
}

/* Open a deck by name and password. A wrong pair is indistinguishable from a
 * deck that does not exist, which is the point: there is no oracle telling an
 * attacker that a deck name is real.
 */
export async function openDeck({ name, password }) {
  const key = await deriveKey(name, password);
  const pointer = await getDoc(keyRef(key));
  if (!pointer.exists()) throw new Error('No deck with that name and password.');
  const deckId = pointer.data().deckId;

  /* Join first, read second. The rules hand a deck only to its members, so
   * reading it to find out whether we are one would be denied for exactly
   * the people who need to join. The update is safe to repeat: arrayUnion
   * means joining a deck you are already in changes nothing, and it never
   * needs the current member list. */
  try {
    await updateDoc(deckRef(deckId), { memberUids: arrayUnion(uid), joinedVia: key });
  } catch (e) {
    // A pointer left behind by a deleted deck lands here; the read below
    // turns that into the same "no such deck" the caller expects.
  }

  const snap = await getDoc(deckRef(deckId));
  if (!snap.exists()) throw new Error('No deck with that name and password.');
  const deck = { id: deckId, ...snap.data() };
  await remember(deckId, deck.name);
  return deck;
}

export async function getDeck(deckId) {
  const snap = await getDoc(deckRef(deckId));
  if (!snap.exists()) throw new Error('That deck is gone, or this browser is no longer a member.');
  return { id: deckId, ...snap.data() };
}

export async function setTolerance(deckId, tolerance) {
  await updateDoc(deckRef(deckId), { tolerance });
}

/* ── rounds ────────────────────────────────────────────────────────────── */

/* A round is a photo, the park it was taken in, and the point on that park's
 * map. `answer` carries the park as well as the coordinates so a guess can be
 * judged in one piece, and so a round stays self-describing if the deck's
 * settings ever change underneath it.
 */
export async function addRound(deckId, { photoFile, park, answer, label }) {
  const id = doc(collection(db, 'whereami_decks', deckId, 'rounds')).id;
  const photo = await putImage(`whereami/${deckId}/rounds/${id}.jpg`, photoFile);
  const round = {
    photo,
    park,
    answer: { park, x: answer.x, y: answer.y },
    label: String(label || '').trim(),
    createdByUid: uid,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'whereami_decks', deckId, 'rounds', id), round);
  return { id, ...round };
}

export async function listRounds(deckId) {
  const snap = await getDocs(
    query(collection(db, 'whereami_decks', deckId, 'rounds'), orderBy('createdAt', 'asc')),
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function removeRound(deckId, round) {
  await deleteDoc(doc(db, 'whereami_decks', deckId, 'rounds', round.id));
  try { await deleteObject(ref(storage, round.photo.path)); } catch { /* already gone */ }
}

/* ── scores ────────────────────────────────────────────────────────────── */

export async function saveScore(deckId, { name, points, played }) {
  await setDoc(doc(db, 'whereami_decks', deckId, 'scores', uid), {
    name: String(name || 'Player').trim().slice(0, 24), points, played,
    at: serverTimestamp(),
  });
}

export async function listScores(deckId) {
  const snap = await getDocs(collection(db, 'whereami_decks', deckId, 'scores'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (b.points || 0) - (a.points || 0));
}
