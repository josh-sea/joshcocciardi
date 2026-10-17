/**
 * Where the bag, the rounds and the shots live.
 *
 * Signed in, that is Firestore under users/{uid}, with the SDK's own
 * persistent cache switched on — golf courses are exactly the place a phone
 * loses signal, and the cache lets a round carry on being written and sync
 * when it comes back.
 *
 * Signed out, or with the SDK blocked, the same interface is backed by
 * localStorage so the caddy still works. Nothing silently vanishes: the UI
 * reads `mode` and says which one you are on.
 */

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

const firebaseConfig = {
  apiKey: "AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc",
  authDomain: "josh-cocciardi.firebaseapp.com",
  projectId: "josh-cocciardi",
  storageBucket: "josh-cocciardi.firebasestorage.app",
  messagingSenderId: "21223323384",
  appId: "1:21223323384:web:2df2e363a8a4a52adaed0d",
};

const LS = "swingcoach.caddy.v1";
const uuid = () =>
  (crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/* ---------------- local backend ---------------- */

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}
function writeLocal(data) {
  try {
    localStorage.setItem(LS, JSON.stringify(data));
  } catch {
    /* private mode, quota, blocked storage — the round still runs in memory */
  }
}

function localBackend() {
  let cache = readLocal();
  const flush = () => writeLocal(cache);
  return {
    mode: "local",
    async getProfile() { return cache.profile || null; },
    async saveProfile(p) { cache.profile = { ...p, updatedAt: Date.now() }; flush(); },
    async getBag() { return cache.bag || null; },
    async saveBag(bag) { cache.bag = bag; flush(); },
    async listRounds() { return Object.values(cache.rounds || {}).sort((a, b) => b.startedAt - a.startedAt); },
    async saveRound(r) { (cache.rounds ||= {})[r.id] = r; flush(); return r; },
    async listShots(roundId) {
      return Object.values(cache.shots || {})
        .filter((s) => !roundId || s.roundId === roundId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async saveShot(s) { (cache.shots ||= {})[s.id] = s; flush(); return s; },
    async deleteShot(id) { delete (cache.shots || {})[id]; flush(); },
    reload() { cache = readLocal(); },
  };
}

/* ---------------- the store ---------------- */

export async function createStore() {
  const local = localBackend();
  let firebase = null;

  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}firebase-app.js`),
      import(`${SDK}firebase-auth.js`),
      import(`${SDK}firebase-firestore.js`),
    ]);
    firebase = { ...appMod, ...authMod, ...fsMod };
  } catch (e) {
    console.warn("[Caddy] Firebase unavailable, staying on this device:", e.message);
    return { ...local, cloudReason: "The Firebase SDK could not be loaded.", signedIn: () => false,
             onAuth(cb) { cb(null); return () => {}; },
             async signInGoogle() { throw new Error("Cloud sync is unavailable right now."); },
             async signOut() {}, currentUser: () => null };
  }

  const {
    initializeApp, getAuth, onAuthStateChanged, GoogleAuthProvider,
    signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, query, orderBy,
  } = firebase;

  let app, auth, db;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // The persistent cache is the whole point out on a course: reads come from
    // disk and writes queue until there's signal again.
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      const { getFirestore } = firebase;
      db = getFirestore(app);
    }
  } catch (e) {
    console.warn("[Caddy] Firebase init failed, staying on this device:", e.message);
    return { ...local, cloudReason: e.message, signedIn: () => false,
             onAuth(cb) { cb(null); return () => {}; },
             async signInGoogle() { throw new Error(e.message); },
             async signOut() {}, currentUser: () => null };
  }

  getRedirectResult(auth).catch((e) => console.warn("[Caddy] redirect result:", e.message));

  const uid = () => auth.currentUser?.uid || null;
  const col = (name) => collection(db, "users", uid(), name);
  const row = (name, id) => doc(db, "users", uid(), name, id);
  const cloud = () => !!uid();

  return {
    get mode() { return cloud() ? "cloud" : "local"; },
    cloudReason: "",

    currentUser() { return auth.currentUser; },
    signedIn() { return cloud(); },
    onAuth(cb) { return onAuthStateChanged(auth, cb); },

    async signInGoogle() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (["auth/popup-blocked", "auth/cancelled-popup-request",
             "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
          await signInWithRedirect(auth, provider);
        } else if (e.code !== "auth/popup-closed-by-user") {
          throw e;
        }
      }
    },

    async signOut() { await signOut(auth); },

    async getProfile() {
      if (!cloud()) return local.getProfile();
      const snap = await getDoc(row("caddy_profile", "profile"));
      return snap.exists() ? snap.data() : null;
    },

    async saveProfile(p) {
      await local.saveProfile(p);                        // keep a local mirror
      if (!cloud()) return;
      await setDoc(row("caddy_profile", "profile"), { ...p, updatedAt: Date.now() }, { merge: true });
    },

    async getBag() {
      if (!cloud()) return local.getBag();
      const snap = await getDocs(col("caddy_bag"));
      if (snap.empty) return null;
      const out = [];
      snap.forEach((d) => out.push(d.data()));
      return out;
    },

    async saveBag(bag) {
      await local.saveBag(bag);
      if (!cloud()) return;
      const batch = writeBatch(db);
      for (const club of bag) batch.set(row("caddy_bag", club.id), club, { merge: false });
      await batch.commit();
    },

    async listRounds() {
      if (!cloud()) return local.listRounds();
      const snap = await getDocs(query(col("caddy_rounds"), orderBy("startedAt", "desc")));
      const out = [];
      snap.forEach((d) => out.push(d.data()));
      return out;
    },

    async saveRound(r) {
      const round = { ...r, id: r.id || uuid() };
      await local.saveRound(round);
      if (cloud()) await setDoc(row("caddy_rounds", round.id), round, { merge: true });
      return round;
    },

    async listShots(roundId) {
      if (!cloud()) return local.listShots(roundId);
      const snap = await getDocs(query(col("caddy_shots"), orderBy("createdAt", "asc")));
      const out = [];
      snap.forEach((d) => { const s = d.data(); if (!roundId || s.roundId === roundId) out.push(s); });
      return out;
    },

    async saveShot(s) {
      const shot = { ...s, id: s.id || uuid() };
      await local.saveShot(shot);
      if (cloud()) await setDoc(row("caddy_shots", shot.id), shot, { merge: true });
      return shot;
    },

    async deleteShot(id) {
      await local.deleteShot(id);
      if (cloud()) await deleteDoc(row("caddy_shots", id));
    },

    /** Everything held locally, pushed up after a first sign-in. */
    async adoptLocal() {
      if (!cloud()) return { rounds: 0, shots: 0 };
      const [p, bag, rounds, shots] = await Promise.all([
        local.getProfile(), local.getBag(), local.listRounds(), local.listShots(),
      ]);
      if (p) await setDoc(row("caddy_profile", "profile"), p, { merge: true });
      if (bag?.length) {
        const batch = writeBatch(db);
        for (const club of bag) batch.set(row("caddy_bag", club.id), club, { merge: true });
        await batch.commit();
      }
      for (const r of rounds) await setDoc(row("caddy_rounds", r.id), r, { merge: true });
      for (const s of shots) await setDoc(row("caddy_shots", s.id), s, { merge: true });
      return { rounds: rounds.length, shots: shots.length };
    },
  };
}

export { uuid };
