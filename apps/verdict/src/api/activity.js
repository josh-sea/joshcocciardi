import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../firebase';

export const activityRef = (uid, titleKey) => doc(db, 'verdict_activity', uid, 'titles', titleKey);

export function watchActivity(uid, titleKey, cb) {
  return onSnapshot(activityRef(uid, titleKey), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
}

// Titles friends rated, most 👍 first (raw counts; the app re-ranks with
// star and mute applied).
export async function topRated(uid, n = 50) {
  const snap = await getDocs(query(collection(db, 'verdict_activity', uid, 'titles'), orderBy('upCount', 'desc'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function friendsWatching(uid, n = 30) {
  const snap = await getDocs(query(collection(db, 'verdict_activity', uid, 'titles'), where('watchingCount', '>', 0), orderBy('watchingCount', 'desc'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Activity docs for a set of title keys, for chips in lists.
export async function activityFor(uid, keys) {
  const out = {};
  const unique = [...new Set(keys)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, 'verdict_activity', uid, 'titles'), where('titleKey', 'in', chunk)));
    snap.docs.forEach((d) => { out[d.id] = d.data(); });
  }
  return out;
}

export const FEED_PAGE = 25;
export async function feedPage(uid, after = null) {
  const parts = [collection(db, 'verdict_feeds', uid, 'items'), orderBy('at', 'desc')];
  if (after) parts.push(startAfter(after));
  parts.push(limit(FEED_PAGE));
  const snap = await getDocs(query(...parts));
  return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })), last: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < FEED_PAGE };
}
