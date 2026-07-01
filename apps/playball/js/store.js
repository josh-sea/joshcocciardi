// Firebase auth + Firestore persistence for Playball.
// Loaded as a <script type="module">; exposes window.Store and resolves
// window.StoreReady (created inline in index.html before any script runs).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, getDoc,
  setDoc, addDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Complete a Google redirect sign-in if we're returning from one.
getRedirectResult(auth).catch(e => console.warn('[Store] redirect result:', e.message));

function _uid() {
  if (!auth.currentUser) throw new Error('Sign in to save playlists.');
  return auth.currentUser.uid;
}

function _playlistsCol() { return collection(db, 'users', _uid(), 'playball_playlists'); }
function _lineupDoc(id)  { return doc(db, 'users', _uid(), 'playball_lineups', id); }

const Store = {
  currentUser() { return auth.currentUser; },

  onAuth(cb) { return onAuthStateChanged(auth, cb); },

  async signInGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      // Popups are often blocked on mobile / in PWAs — fall back to redirect.
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' ||
          e.code === 'auth/cancelled-popup-request' || e.code === 'auth/operation-not-supported-in-this-environment') {
        if (e.code === 'auth/popup-closed-by-user') return; // user changed their mind
        await signInWithRedirect(auth, provider);
      } else {
        throw e;
      }
    }
  },

  async signInEmail(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  async signUpEmail(email, password) {
    await createUserWithEmailAndPassword(auth, email, password);
  },

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  },

  async signOut() { await signOut(auth); },

  // ── Playlists: users/{uid}/playball_playlists/{docId} ──────────────────
  async listPlaylists() {
    const snap = await getDocs(_playlistsCol());
    return snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  },

  // data: { name, spotifyId, tracks, created, updated }. Returns docId.
  async savePlaylist(docId, data) {
    const payload = { ...data, updatedAt: serverTimestamp() };
    if (docId) {
      await setDoc(doc(_playlistsCol(), docId), payload);
      return docId;
    }
    const ref = await addDoc(_playlistsCol(), payload);
    return ref.id;
  },

  async deletePlaylist(docId) {
    await deleteDoc(doc(_playlistsCol(), docId));
  },

  // ── Lineups: users/{uid}/playball_lineups/{spotifyPlaylistId} ──────────
  // data: { playlistId, playlistName, names: {trackId: player}, order: [trackId] }
  async saveLineup(spotifyPlaylistId, data) {
    await setDoc(_lineupDoc(spotifyPlaylistId), { ...data, updatedAt: serverTimestamp() });
  },

  async loadLineup(spotifyPlaylistId) {
    const snap = await getDoc(_lineupDoc(spotifyPlaylistId));
    return snap.exists() ? snap.data() : null;
  },
};

window.Store = Store;
window.__storeResolve?.(Store);
