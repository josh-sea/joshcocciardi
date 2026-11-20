import { collection, deleteDoc, doc, getDocs, onSnapshot, query, runTransaction, Timestamp, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { nextHistory, titleKeyOf } from '../lib/verdict';
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
export async function ratingsOf(uid) {
  const snap = await getDocs(query(collection(db, 'verdict_ratings'), where('uid', '==', uid), orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => d.data());
}

export function watchMyRatings(uid, cb) {
  const q = query(collection(db, 'verdict_ratings'), where('uid', '==', uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())), () => cb([]));
}
