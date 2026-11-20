import { collection, deleteDoc, doc, getDocs, onSnapshot, query, runTransaction, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { nextHistory, titleKeyOf, newestFirst } from '../lib/verdict';
import { snapshotOf } from './tmdb';

export const ratingRef = (uid, titleKey) => doc(db, 'verdict_ratings', `${uid}__${titleKey}`);

// Rate or re-rate. The previous version goes onto `history`, which the
// security rules require on every update.
export async function saveRating(uid, title, { rating, note = '', tags = [], whileWatching = false }) {
  const titleKey = titleKeyOf(title.mediaType, title.tmdbId);
  const ref = ratingRef(uid, titleKey);
  const now = Timestamp.now();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const base = {
      uid,
      titleKey,
      mediaType: title.mediaType,
      tmdbId: Number(title.tmdbId),
      rating,
      note: String(note).slice(0, 280),
      tags,
      whileWatching: Boolean(whileWatching),
      title: snapshotOf(title),
      updatedAt: now,
    };
    if (!prev) {
      tx.set(ref, { ...base, history: [], createdAt: now });
    } else {
      const same = prev.rating === rating && (prev.note || '') === base.note
        && JSON.stringify(prev.tags || []) === JSON.stringify(tags) && Boolean(prev.whileWatching) === base.whileWatching;
      if (same) return;
      tx.set(ref, { ...base, history: nextHistory(prev), createdAt: prev.createdAt });
    }
  });
}

export const removeRating = (uid, titleKey) => deleteDoc(ratingRef(uid, titleKey));

export function watchRating(uid, titleKey, cb) {
  return onSnapshot(ratingRef(uid, titleKey), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

// Everything a user has rated, newest first. Works for me and my friends.
// Sorted here rather than with orderBy, so no composite index is needed.
export async function ratingsOf(uid) {
  const snap = await getDocs(query(collection(db, 'verdict_ratings'), where('uid', '==', uid)));
  return newestFirst(snap.docs.map((d) => d.data()));
}

export function watchMyRatings(uid, cb) {
  const q = query(collection(db, 'verdict_ratings'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => cb(newestFirst(snap.docs.map((d) => d.data()))), (err) => {
    console.warn('Could not load your ratings:', err.message);
    cb([]);
  });
}
