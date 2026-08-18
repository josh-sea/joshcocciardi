import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { ITEM_STATUS } from '../utils/constants';

// Default shape of an item. Only `name` is ever required — every other field
// is optional and can be filled in later. This is the whole point: get stuff
// into the shop fast, add detail whenever.
const blankItem = (shopId, createdBy) => ({
  shopId,
  createdBy,
  name: '',
  status: ITEM_STATUS.INVENTORY,
  pricePaid: null,
  acquiredFrom: '',
  acquiredAt: null,
  category: '',
  taxa: {},
  graded: false,
  grade: '',
  gradingCompany: '',
  assignedTo: '',
  tags: [],
  notes: '',
  photos: [],
  sold: null,
});

// Live subscription to every item in a shop, newest first. Returns the
// unsubscribe function. Both members share this stream, so an add by one shows
// up for the other without a refresh.
//
// We query on shopId only (a single-field filter, which Firestore indexes
// automatically) and sort newest-first in JS. That deliberately avoids a
// composite index, so the app works the moment the rules deploy — no
// Firebase-console step. A shop's item count is small enough that client-side
// sorting is a non-issue. A just-added item has a null createdAt until the
// server timestamp resolves, so it's floated to the top.
export const subscribeShopItems = (shopId, onData, onError) => {
  const q = query(
    collection(db, 'collector_items'),
    where('shopId', '==', shopId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      items.sort(
        (a, b) =>
          (b.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER) -
          (a.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER)
      );
      onData(items);
    },
    onError
  );
};

// The fast path: name (+ optional price) and you're done.
export const quickAddItem = async (shopId, createdBy, { name, pricePaid = null }) => {
  const ref = await addDoc(collection(db, 'collector_items'), {
    ...blankItem(shopId, createdBy),
    name: name.trim(),
    pricePaid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const addItem = async (shopId, createdBy, data) => {
  const ref = await addDoc(collection(db, 'collector_items'), {
    ...blankItem(shopId, createdBy),
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateItem = (itemId, updates) =>
  updateDoc(doc(db, 'collector_items', itemId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });

// Mark an item sold. Only the sale price is really required; the rest is
// optional context (where, to whom, fees).
export const markSold = (itemId, sold) =>
  updateDoc(doc(db, 'collector_items', itemId), {
    status: ITEM_STATUS.SOLD,
    sold: {
      price: sold.price ?? null,
      soldAt: sold.soldAt || new Date().toISOString(),
      channel: sold.channel || '',
      buyer: sold.buyer || '',
      fees: sold.fees ?? null,
      notes: sold.notes || '',
    },
    updatedAt: serverTimestamp(),
  });

export const unmarkSold = (itemId) =>
  updateDoc(doc(db, 'collector_items', itemId), {
    status: ITEM_STATUS.INVENTORY,
    sold: null,
    updatedAt: serverTimestamp(),
  });

export const deleteItem = (itemId) => deleteDoc(doc(db, 'collector_items', itemId));
