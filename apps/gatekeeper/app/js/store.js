// Firebase auth + Firestore + Cloud Messaging for the Gatekeeper parent app.
// Loaded as a <script type="module">; exposes window.GKStore and resolves
// window.GKStoreReady (created inline in index.html before any script runs).
//
// Data model (see functions/gatekeeper.js and firestore.rules):
//   gatekeeper_households/{uid}                     one household per parent
//     .owners [uid]  .kidName .kidAge .projectContext .settings .usage
//     /private/config    { anthropicKey }           write-only, never read
//     /devices/{id}      extension tokens + parent push tokens
//     /sessions/{id}     browsing sessions (goal per stretch)
//     /activity/{id}     mirrored decision log
//     /requests/{id}     live access requests → approve / deny
//   gatekeeper_pairing/{CODE}  short-lived code → householdId

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getMessaging, getToken, onMessage, isSupported as messagingSupported,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  databaseURL: 'https://josh-cocciardi-default-rtdb.firebaseio.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:874be0258bd2b6dadaed0d',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const CFG = window.GK_CONFIG || {};

getRedirectResult(auth).catch((e) => console.warn('[GK] redirect result:', e.message));

// A household is keyed by the owner's uid: one per parent for now, with room
// in the `owners` array to add co-parents later.
const hRef = (uid) => doc(db, 'gatekeeper_households', uid);
const sub = (uid, name) => collection(db, 'gatekeeper_households', uid, name);

function randomCode() {
  // Unambiguous alphabet (no 0/O/1/I) so it reads cleanly off a screen.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
  return c;
}

const GKStore = {
  currentUser() { return auth.currentUser; },
  onAuth(cb) { return onAuthStateChanged(auth, cb); },

  async signIn() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') return;
      if (['auth/popup-blocked', 'auth/cancelled-popup-request',
           'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        await signInWithRedirect(auth, provider);
      } else { throw e; }
    }
  },
  signOut() { return signOut(auth); },

  // Get the caller's household, creating it on first sign-in.
  async ensureHousehold() {
    const uid = auth.currentUser.uid;
    const ref = hRef(uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        owners: [uid],
        kidName: '',
        kidAge: null,
        projectContext: '',
        settings: {},
        createdAt: serverTimestamp(),
      });
      return { hid: uid, data: (await getDoc(ref)).data() };
    }
    return { hid: uid, data: snap.data() };
  },

  watchHousehold(hid, cb) { return onSnapshot(hRef(hid), (s) => cb(s.data())); },

  // Requests, newest first. Pending ones float to the top in the UI.
  watchRequests(hid, cb) {
    const q = query(sub(hid, 'requests'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },
  watchActivity(hid, cb, max = 200) {
    const q = query(sub(hid, 'activity'), orderBy('createdAt', 'desc'), limit(max));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },
  watchSessions(hid, cb) {
    const q = query(sub(hid, 'sessions'), orderBy('updatedAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },
  watchDevices(hid, cb) {
    return onSnapshot(sub(hid, 'devices'), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  },

  // Parent approves or denies. The extension polls /verdicts and acts on this.
  async decide(hid, requestId, status, note = '') {
    await updateDoc(doc(db, 'gatekeeper_households', hid, 'requests', requestId), {
      status,                       // 'approved' | 'denied'
      note: String(note).slice(0, 500),
      decidedAt: serverTimestamp(),
      decidedBy: auth.currentUser.uid,
    });
  },

  async saveConfig(hid, patch) {
    await updateDoc(hRef(hid), patch);
  },

  // The Anthropic key goes into a write-only private doc — never read back to
  // any client, only used server-side by the /screen function.
  async setKey(hid, key) {
    await setDoc(doc(db, 'gatekeeper_households', hid, 'private', 'config'),
      { anthropicKey: String(key).trim(), updatedAt: serverTimestamp() }, { merge: true });
    // Mirror a boolean so the UI can show "key set" without reading the key.
    await updateDoc(hRef(hid), { hasKey: !!String(key).trim() });
  },

  async createPairingCode(hid) {
    const code = randomCode();
    await setDoc(doc(db, 'gatekeeper_pairing', code), {
      householdId: hid,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return code;
  },

  async removeDevice(hid, deviceId) {
    await deleteDoc(doc(db, 'gatekeeper_households', hid, 'devices', deviceId));
  },

  // Register this browser for web-push. Returns a status string for the UI.
  async enablePush(hid) {
    if (!CFG.vapidKey) return 'unconfigured';
    if (!(await messagingSupported().catch(() => false))) return 'unsupported';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return 'no-token';
    // One device doc per push token (id derived from the token so re-enabling
    // is idempotent rather than piling up dead registrations).
    const id = 'push_' + token.slice(-16);
    await setDoc(doc(db, 'gatekeeper_households', hid, 'devices', id), {
      type: 'parent', fcmToken: token, uid: auth.currentUser.uid,
      label: navigator.userAgent.slice(0, 80),
      createdAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    }, { merge: true });
    onMessage(messaging, (payload) => {
      window.dispatchEvent(new CustomEvent('gk-push', { detail: payload }));
    });
    return 'enabled';
  },
};

window.GKStore = GKStore;
if (window.__gkStoreResolve) window.__gkStoreResolve(GKStore);
