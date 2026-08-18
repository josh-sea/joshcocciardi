import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// A "shop" is the shared workspace Joe & Lindsey both belong to. Items live
// under a shop, so both members see the same inventory. Membership is stored
// two ways on the shop doc:
//   - members:   a map uid -> { role, displayName, email, joinedAt } for display
//   - memberUids: an array, so we can query "shops I belong to" and so the
//                 security rules can check membership with `uid in memberUids`.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous O/0/I/1
const makeInviteCode = () =>
  Array.from({ length: 6 }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join('');

export const createShop = async (user, name, profile) => {
  const shopRef = doc(collection(db, 'collector_shops'));
  const inviteCode = makeInviteCode();
  const displayName = profile?.displayName || user.displayName || user.email.split('@')[0];

  const shop = {
    name: (name || 'My Collection').trim(),
    ownerId: user.uid,
    inviteCode,
    members: {
      [user.uid]: {
        role: 'owner',
        displayName,
        email: user.email,
        joinedAt: new Date().toISOString(),
      },
    },
    memberUids: [user.uid],
    createdAt: serverTimestamp(),
  };

  await setDoc(shopRef, shop);

  // The invite doc is what a code resolves to. It's readable by any signed-in
  // user (so an invited person can look up which shop the code belongs to),
  // and it can only be created by a shop member.
  await setDoc(doc(db, 'collector_invites', inviteCode), {
    shopId: shopRef.id,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });

  return { id: shopRef.id, ...shop };
};

export const getUserShops = async (uid) => {
  const q = query(
    collection(db, 'collector_shops'),
    where('memberUids', 'array-contains', uid)
  );
  const snap = await getDocs(q);
  const shops = [];
  snap.forEach((d) => shops.push({ id: d.id, ...d.data() }));
  // Newest first, sorted client-side to avoid needing a composite index.
  shops.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return shops;
};

export const getShop = async (shopId) => {
  const snap = await getDoc(doc(db, 'collector_shops', shopId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Join a shop using an invite code. Resolves the code to a shop, then adds the
// current user to the member list. `lastJoinedVia` is written so the security
// rules can confirm the caller actually presented a valid code for this shop.
export const joinShopByCode = async (user, rawCode, profile) => {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter an invite code.');

  const inviteSnap = await getDoc(doc(db, 'collector_invites', code));
  if (!inviteSnap.exists()) throw new Error('That invite code was not found.');

  const { shopId } = inviteSnap.data();
  const displayName = profile?.displayName || user.displayName || user.email.split('@')[0];

  await updateDoc(doc(db, 'collector_shops', shopId), {
    memberUids: arrayUnion(user.uid),
    [`members.${user.uid}`]: {
      role: 'member',
      displayName,
      email: user.email,
      joinedAt: new Date().toISOString(),
    },
    lastJoinedVia: code,
  });

  return shopId;
};

export const renameShop = (shopId, name) =>
  updateDoc(doc(db, 'collector_shops', shopId), { name: name.trim() });
