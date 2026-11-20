import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { titleKeyOf, newestFirst } from '../lib/verdict';
import { snapshotOf } from './tmdb';

export const listRef = (uid, titleKey) => doc(db, 'verdict_lists', `${uid}__${titleKey}`);

// status: 'want' | 'watching' | 'finished' | 'abandoned' | null (remove)
export async function setListStatus(uid, title, status, prev = null) {
  const titleKey = titleKeyOf(title.mediaType, title.tmdbId);
  if (!status) return deleteDoc(listRef(uid, titleKey));
  const now = Timestamp.now();
  const doc_ = {
    uid,
    titleKey,
    mediaType: title.mediaType,
    tmdbId: Number(title.tmdbId),
    status,
    title: snapshotOf(title),
    updatedAt: now,
  };
  if (prev && prev.startedAt) doc_.startedAt = prev.startedAt;
  if (status === 'watching' && !(prev && prev.status === 'watching')) doc_.startedAt = now;
  if (status === 'finished') doc_.finishedAt = now;
  return setDoc(listRef(uid, titleKey), doc_);
}

export function watchListItem(uid, titleKey, cb) {
  return onSnapshot(listRef(uid, titleKey), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

export function watchMyLists(uid, cb) {
  const q = query(collection(db, 'verdict_lists'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => cb(newestFirst(snap.docs.map((d) => d.data()))), (err) => {
    console.warn('Could not load your lists:', err.message);
    cb([]);
  });
}

// A friend's list for one status. Want to watch is only readable when they
// share it, so that query may fail; it then comes back empty.
export async function listOf(uid, status) {
  try {
    const snap = await getDocs(query(collection(db, 'verdict_lists'), where('uid', '==', uid), where('status', '==', status)));
    return newestFirst(snap.docs.map((d) => d.data()));
  } catch {
    return [];
  }
}
