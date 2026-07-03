// Firebase auth + Firestore persistence for CanITwo.
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
  getFirestore, collection, doc, getDoc, getDocs, setDoc,
  query, orderBy, startAt, endAt, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  geohashForLocation, geohashQueryBounds, distanceBetween,
} from 'https://cdn.jsdelivr.net/npm/geofire-common@6.0.0/+esm';

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
  if (!auth.currentUser) throw new Error('Sign in to submit bathroom reports.');
  return auth.currentUser.uid;
}

const _placesCol = () => collection(db, 'canitwo_places');
const _placeDoc  = id => doc(db, 'canitwo_places', id);
const _reviewsCol = placeId => collection(db, 'canitwo_places', placeId, 'reviews');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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

  // ── Profiles: canitwo_users/{uid} + canitwo_usernames/{lowercase} ────────
  // Only the username is ever displayed publicly — never the email.

  async getMyProfile() {
    if (!auth.currentUser) return null;
    const snap = await getDoc(doc(db, 'canitwo_users', auth.currentUser.uid));
    return snap.exists() ? snap.data() : null;
  },

  validateUsername(username) {
    if (!USERNAME_RE.test(username || '')) {
      throw new Error('Username must be 3–20 characters: letters, numbers, underscores.');
    }
  },

  async claimUsername(username) {
    const uid = _uid();
    this.validateUsername(username);
    const key = username.toLowerCase();
    const nameRef = doc(db, 'canitwo_usernames', key);
    const snap = await getDoc(nameRef);
    if (snap.exists() && snap.data().uid !== uid) {
      throw new Error('That username is taken — try another.');
    }
    if (!snap.exists()) {
      await setDoc(nameRef, { uid, createdAt: serverTimestamp() });
    }
    await setDoc(doc(db, 'canitwo_users', uid), {
      username, updatedAt: serverTimestamp(),
    }, { merge: true });
    return username;
  },

  // ── Places: canitwo_places/{placeId} ─────────────────────────────────────
  // placeId is `osm-{type}-{id}` for OSM places, `custom-{random}` for
  // manually added spots. Docs carry denormalized rating aggregates.

  geohashFor(lat, lng) { return geohashForLocation([lat, lng]); },

  newCustomPlaceId() {
    return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  },

  // All rated places within radiusKm of center {lat, lng}.
  async placesNear(center, radiusKm) {
    const bounds = geohashQueryBounds([center.lat, center.lng], radiusKm * 1000);
    const snaps = await Promise.all(bounds.map(([start, end]) =>
      getDocs(query(_placesCol(), orderBy('geohash'), startAt(start), endAt(end)))
    ));
    const out = [];
    const seen = new Set();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const p = d.data();
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
        if (distanceBetween([p.lat, p.lng], [center.lat, center.lng]) <= radiusKm) {
          out.push({ id: d.id, ...p });
        }
      }
    }
    return out;
  },

  async getPlace(placeId) {
    const snap = await getDoc(_placeDoc(placeId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  // ── Reviews: canitwo_places/{placeId}/reviews/{uid} ──────────────────────
  // One review per user per place (doc id = reviewer uid).

  async getReviews(placeId) {
    const snap = await getDocs(_reviewsCol(placeId));
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  },

  async getMyReview(placeId) {
    if (!auth.currentUser) return null;
    const snap = await getDoc(doc(_reviewsCol(placeId), auth.currentUser.uid));
    return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
  },

  // Upserts the place, writes/updates the caller's review, then recomputes
  // the place's rating aggregates from all reviews.
  //
  // place:  { id, name, category, emoji, lat, lng, address?, source }
  // report: { hasBathroom: bool, rating: 1–5|null, text: string }
  async submitReport(place, report) {
    const uid = _uid();
    const profile = await this.getMyProfile();
    if (!profile?.username) throw new Error('Pick a username before posting.');

    const placeRef = _placeDoc(place.id);
    await setDoc(placeRef, {
      name: place.name,
      category: place.category,
      emoji: place.emoji,
      lat: place.lat,
      lng: place.lng,
      geohash: geohashForLocation([place.lat, place.lng]),
      address: place.address || null,
      source: place.source || 'osm',
      updatedAt: serverTimestamp(),
    }, { merge: true });

    const reviewRef = doc(_reviewsCol(place.id), uid);
    const existing = await getDoc(reviewRef);
    await setDoc(reviewRef, {
      hasBathroom: !!report.hasBathroom,
      rating: report.hasBathroom && report.rating ? report.rating : null,
      text: (report.text || '').trim(),
      username: profile.username,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Recompute aggregates from all reviews (fine at this scale; a Cloud
    // Function could take over if volume ever demands it).
    const all = await getDocs(_reviewsCol(place.id));
    let yes = 0, no = 0, sum = 0, count = 0;
    all.forEach(d => {
      const r = d.data();
      r.hasBathroom ? yes++ : no++;
      if (typeof r.rating === 'number') { sum += r.rating; count++; }
    });
    const aggregates = {
      yesCount: yes,
      noCount: no,
      reviewCount: all.size,
      ratingCount: count,
      avgRating: count ? Math.round((sum / count) * 10) / 10 : null,
      updatedAt: serverTimestamp(),
    };
    await setDoc(placeRef, aggregates, { merge: true });
    return aggregates;
  },
};

window.Store = Store;
window.__storeResolve?.(Store);
