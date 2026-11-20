import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, addDoc } from 'firebase/firestore';
import { db, call } from '../firebase';
import { WEB_URL } from '../constants/config';

export const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const connRef = (a, b) => doc(db, 'verdict_connections', pairId(a, b));

// All of my connections, any status.
export function watchConnections(uid, cb, onError) {
  const q = query(collection(db, 'verdict_connections'), where('users', 'array-contains', uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => {
    console.warn('Could not load your friends:', err.message);
    if (onError) onError(err);
  });
}

export async function sendRequest(me, other, via = 'search') {
  const users = [me, other].sort();
  await setDoc(connRef(me, other), { users, requestedBy: me, status: 'pending', via, createdAt: serverTimestamp() });
}

export const acceptRequest = (me, other) => updateDoc(connRef(me, other), { status: 'accepted', respondedAt: serverTimestamp() });

// Decline, cancel and remove are all the same delete. The other person is
// not told.
export const removeConnection = (me, other) => deleteDoc(connRef(me, other));

export async function getPublicProfile(uid) {
  const snap = await getDoc(doc(db, 'verdict_users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { uid, username: d.username || '', displayName: d.displayName || d.username || '', avatarUrl: d.avatarUrl || null };
}

export const searchUsers = (q) => call('verdictSearchUsers', { query: q }).then((r) => r.results);
export const fetchProfile = (uid) => call('verdictGetProfile', { uid });
export const inviteCode = (regenerate = false) => call('verdictInviteCode', { regenerate }).then((r) => r.code);
export const redeemInvite = (code) => call('verdictRedeemInvite', { code });
export const mutualCount = (uid) => call('verdictMutualCount', { uid }).then((r) => r.count);
export const blockUser = (uid) => call('verdictBlock', { uid });
export const unblockUser = (uid) => call('verdictUnblock', { uid });
export const blockedList = () => call('verdictBlockedList').then((r) => r.results);

export const reportUser = (me, targetUid, reason, titleKey = null) =>
  addDoc(collection(db, 'verdict_reports'), {
    reporterUid: me, targetUid, reason: String(reason).slice(0, 500), titleKey, createdAt: serverTimestamp(),
  });

// A web link works for everyone: it opens the web app, which redeems it.
export const inviteLink = (code) => `${WEB_URL}/invite/${code}`;
export const prettyCode = (code) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : '');
