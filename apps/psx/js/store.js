// Firebase auth + cloud save sync for PSX Station.
//
// Discs never leave the device. What syncs is small: one metadata row per game
// in Firestore, and the save states / memory cards themselves in Cloud Storage.
// That keeps a library of 500MB discs off the 5GB Storage quota while still
// letting you stand up from the desk mid-boss-fight and finish on a laptop.
//
// The SDK is imported dynamically so that losing it — offline on a plane, a
// blocked CDN, a firewalled network — degrades to a local-only library instead
// of taking the whole app down with it. Everything that actually matters for
// playing a game is on-device already.
//
// Loaded as a <script type="module">; exposes window.Store and resolves
// window.StoreReady (created inline in index.html before any script runs).

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

function publish(store) {
  window.Store = store;
  if (window._storeReadyResolve) window._storeReadyResolve(store);
}

// Stand-in with the same shape as the real thing. Reads answer empty, writes
// no-op, and the two calls a person can trigger deliberately (sign in, push a
// save) fail loudly so the UI can say why.
function offlineStore(reason) {
  const fail = async () => { throw new Error(reason); };
  return {
    offline: true,
    reason,
    currentUser: () => null,
    signedIn: () => false,
    onAuth(cb) { cb(null); return () => {}; },
    signInGoogle: fail,
    async signOut() {},
    async listGames() { return {}; },
    async putGame() {},
    async deleteGame() {},
    uploadState: fail,
    downloadState: fail,
    async downloadShot() { return null; },
    async purgeSaves() {},
    uploadCard: fail,
    async downloadCard() { return null; },
  };
}

(async () => {
  let firebase;
  try {
    const [appMod, authMod, fsMod, storageMod] = await Promise.all([
      import(`${SDK}firebase-app.js`),
      import(`${SDK}firebase-auth.js`),
      import(`${SDK}firebase-firestore.js`),
      import(`${SDK}firebase-storage.js`),
    ]);
    firebase = { ...appMod, ...authMod, ...fsMod, ...storageMod };
  } catch (e) {
    console.warn('[Store] Firebase SDK unavailable, running local-only:', e.message);
    publish(offlineStore('Cloud sync is unavailable — the Firebase SDK could not be loaded.'));
    return;
  }

  const {
    initializeApp,
    getAuth, onAuthStateChanged, GoogleAuthProvider,
    signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
    getFirestore, collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp,
    getStorage, ref, uploadBytes, getBytes, deleteObject,
  } = firebase;

  let app, auth, db, storage;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (e) {
    console.warn('[Store] Firebase init failed, running local-only:', e.message);
    publish(offlineStore(`Cloud sync is unavailable: ${e.message}`));
    return;
  }

  // Complete a Google redirect sign-in if we're returning from one.
  getRedirectResult(auth).catch(e => console.warn('[Store] redirect result:', e.message));

  function uid() {
    if (!auth.currentUser) throw new Error('Sign in to sync saves.');
    return auth.currentUser.uid;
  }

  const gamesCol = () => collection(db, 'users', uid(), 'psx_games');
  const gameDoc = id => doc(db, 'users', uid(), 'psx_games', id);
  const stateRef = (gameId, slot) => ref(storage, `psx/${uid()}/${gameId}/slot-${slot}.state`);
  const shotRef = (gameId, slot) => ref(storage, `psx/${uid()}/${gameId}/slot-${slot}.png`);
  const cardRef = gameId => ref(storage, `psx/${uid()}/${gameId}/memcard.srm`);

  publish({
    offline: false,

    currentUser() { return auth.currentUser; },

    signedIn() { return !!auth.currentUser; },

    onAuth(cb) { return onAuthStateChanged(auth, cb); },

    async signInGoogle() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Popups are often blocked on mobile / in PWAs — fall back to redirect.
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' ||
            e.code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
        } else if (e.code !== 'auth/popup-closed-by-user') {
          throw e;
        }
      }
    },

    async signOut() { await signOut(auth); },

    /* ── Game metadata ────────────────────────────────────────────────────
       One row per disc fingerprint. `states` is a map of slot → {updatedAt,
       size} so the library can show which slots exist in the cloud without
       listing Storage, and `cardUpdatedAt` does the same for the memory card. */

    async listGames() {
      const snap = await getDocs(gamesCol());
      const out = {};
      snap.forEach(d => { out[d.id] = d.data(); });
      return out;
    },

    async putGame(id, meta) {
      await setDoc(gameDoc(id), { ...meta, updatedAt: serverTimestamp() }, { merge: true });
    },

    async deleteGame(id) {
      await deleteDoc(gameDoc(id));
    },

    /* ── Save states ──────────────────────────────────────────────────────
       Uint8Array in, Uint8Array out. Screenshots ride along when the core can
       produce one; a missing screenshot is never an error.                   */

    async uploadState(gameId, slot, bytes, shotBytes, meta = {}) {
      const max = window.APP_CONFIG?.max_state_bytes ?? 32 * 1024 * 1024;
      if (bytes.byteLength > max) {
        throw new Error(`Save state is ${(bytes.byteLength / 1048576).toFixed(1)}MB, over the ${(max / 1048576) | 0}MB sync limit.`);
      }
      await uploadBytes(stateRef(gameId, slot), bytes, { contentType: 'application/octet-stream' });
      if (shotBytes && shotBytes.byteLength) {
        try {
          await uploadBytes(shotRef(gameId, slot), shotBytes, { contentType: 'image/png' });
        } catch (e) {
          console.warn('[Store] screenshot upload failed:', e.message);
        }
      }
      await setDoc(gameDoc(gameId), {
        ...meta,
        states: { [slot]: { updatedAt: Date.now(), size: bytes.byteLength } },
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    async downloadState(gameId, slot) {
      return new Uint8Array(await getBytes(stateRef(gameId, slot)));
    },

    async downloadShot(gameId, slot) {
      try {
        return new Uint8Array(await getBytes(shotRef(gameId, slot)));
      } catch { return null; }
    },

    // Wipes every cloud save for a disc: each slot's state and screenshot, the
    // memory card, and the metadata row. Individual objects are allowed to be
    // missing — a slot listed in the doc may already be gone.
    async purgeSaves(gameId, slots) {
      await Promise.all([
        ...slots.flatMap(slot => [
          deleteObject(stateRef(gameId, slot)).catch(() => {}),
          deleteObject(shotRef(gameId, slot)).catch(() => {}),
        ]),
        deleteObject(cardRef(gameId)).catch(() => {}),
      ]);
      await deleteDoc(gameDoc(gameId));
    },

    /* ── Memory card ──────────────────────────────────────────────────────
       The in-game saves, as opposed to save states. Tiny (128KB), so it syncs
       automatically whenever you leave a game.                               */

    async uploadCard(gameId, bytes) {
      await uploadBytes(cardRef(gameId), bytes, { contentType: 'application/octet-stream' });
      await setDoc(gameDoc(gameId), {
        cardUpdatedAt: Date.now(),
        cardSize: bytes.byteLength,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },

    async downloadCard(gameId) {
      try {
        return new Uint8Array(await getBytes(cardRef(gameId)));
      } catch { return null; }
    },
  });
})();
