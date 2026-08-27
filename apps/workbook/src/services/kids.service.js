import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// Kid profiles live under the adult who owns them:
//   workbook_users/{adultUid}/kids/{kidId}
// so ownership is the path itself and the security rules stay trivial.
const kidsCol = (uid) => collection(db, 'workbook_users', uid, 'kids');

export const listKids = async (uid) => {
  const snap = await getDocs(query(kidsCol(uid), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const addKid = async (uid, name) => {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Please enter a name.');
  const ref = await addDoc(kidsCol(uid), {
    name: clean,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name: clean };
};

export const deleteKid = async (uid, kidId) => {
  // Note: this removes the kid profile doc. Their saved pages (a subcollection)
  // are orphaned in Firestore but unreachable in the UI; a Cloud Function could
  // deep-delete later if it ever matters.
  await deleteDoc(doc(db, 'workbook_users', uid, 'kids', kidId));
};
