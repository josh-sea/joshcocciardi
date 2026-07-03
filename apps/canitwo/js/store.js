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
  query, orderBy, startAt, endAt, serverTimestamp, runTransaction,
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

// Profile cache so submitting a report doesn't re-fetch it every time.
let _profileCache = null;
let _profileCacheUid = null;

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
    const uid = auth.currentUser.uid;
    if (_profileCache && _profileCacheUid === uid) return _profileCache;
    const snap = await getDoc(doc(db, 'canitwo_users', uid));
    const profile = snap.exists() ? snap.data() : null;
    if (profile) { _profileCache = profile; _profileCacheUid = uid; }
    return profile;
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
    _profileCache = { username };
    _profileCacheUid = uid;
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

  // Upserts the place and the caller's review in ONE transaction, adjusting
  // the place's denormalized aggregates incrementally (subtract the old
  // review's contribution, add the new one). Two round trips total instead
  // of six, and concurrent reports can't clobber each other's counts.
  //
  // place:  { id, name, category, emoji, lat, lng, address?, source }
  // report: { hasBathroom: bool, rating: 1–5|null, text: string }
  async submitReport(place, report) {
    const uid = _uid();
    const profile = await this.getMyProfile();
    if (!profile?.username) throw new Error('Pick a username before posting.');

    const placeRef = _placeDoc(place.id);
    const reviewRef = doc(_reviewsCol(place.id), uid);
    const newReview = {
      hasBathroom: !!report.hasBathroom,
      rating: report.hasBathroom && report.rating ? report.rating : null,
      text: (report.text || '').trim(),
      tags: report.hasBathroom ? [...(report.tags || [])].sort() : [],
      facility: report.hasBathroom ? (report.facility || 'all') : null,
      username: profile.username,
    };

    return runTransaction(db, async tx => {
      const [placeSnap, reviewSnap] = await Promise.all([
        tx.get(placeRef), tx.get(reviewRef),
      ]);
      const prevAgg = placeSnap.exists() ? placeSnap.data() : {};
      const old = reviewSnap.exists() ? reviewSnap.data() : null;

      // No-op edit: don't write anything (and don't pollute edit history).
      if (old &&
          old.hasBathroom === newReview.hasBathroom &&
          (old.rating ?? null) === newReview.rating &&
          (old.text || '') === newReview.text &&
          (old.facility ?? null) === newReview.facility &&
          JSON.stringify([...(old.tags || [])].sort()) === JSON.stringify(newReview.tags)) {
        return prevAgg;
      }

      // Edits append the previous version to history — the security rules
      // reject updates that don't, so past versions can't be rewritten.
      const history = old
        ? [...(old.history || []), {
            hasBathroom: old.hasBathroom,
            rating: old.rating ?? null,
            text: old.text || '',
            tags: old.tags || [],
            facility: old.facility ?? null,
            at: old.updatedAt,
          }]
        : [];
      if (history.length >= 20) {
        throw new Error('This review has reached its edit limit.');
      }

      let yes = prevAgg.yesCount || 0;
      let no = prevAgg.noCount || 0;
      let reviewCount = prevAgg.reviewCount || 0;
      let ratingCount = prevAgg.ratingCount || 0;
      let ratingSum = typeof prevAgg.ratingSum === 'number'
        ? prevAgg.ratingSum
        : (prevAgg.avgRating || 0) * ratingCount;

      if (old) {
        old.hasBathroom ? yes-- : no--;
        reviewCount--;
        if (typeof old.rating === 'number') { ratingSum -= old.rating; ratingCount--; }
      }
      newReview.hasBathroom ? yes++ : no++;
      reviewCount++;
      if (typeof newReview.rating === 'number') { ratingSum += newReview.rating; ratingCount++; }

      // Amenity tag counts, adjusted the same subtract-old/add-new way.
      const tagCounts = { ...(prevAgg.tagCounts || {}) };
      for (const t of (old?.tags || [])) tagCounts[t] = Math.max(0, (tagCounts[t] || 0) - 1);
      for (const t of newReview.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;

      const aggregates = {
        tagCounts,
        yesCount: Math.max(0, yes),
        noCount: Math.max(0, no),
        reviewCount: Math.max(0, reviewCount),
        ratingCount: Math.max(0, ratingCount),
        ratingSum: Math.max(0, ratingSum),
        avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      };

      // merge:true so the function-owned flagCount survives edits.
      tx.set(reviewRef, {
        ...newReview,
        history,
        createdAt: old ? old.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Base fields only — aggregates are recomputed server-side by the
      // canitwoAggregates Cloud Function (rules reject client writes to them).
      tx.set(placeRef, {
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

      // Returned for optimistic UI only; the function's recount is the
      // authoritative version and lands moments later.
      return aggregates;
    });
  },

  // ── Flags: canitwo_flags/{placeId}__{reviewUid}__{flaggerUid} ────────────
  async flagReview(placeId, reviewUid) {
    const uid = _uid();
    if (uid === reviewUid) throw new Error("You can't flag your own report.");
    const flagId = `${placeId}__${reviewUid}__${uid}`;
    await setDoc(doc(db, 'canitwo_flags', flagId), {
      placeId,
      reviewUid,
      by: uid,
      createdAt: serverTimestamp(),
    });
  },
};

window.Store = Store;
window.__storeResolve?.(Store);
