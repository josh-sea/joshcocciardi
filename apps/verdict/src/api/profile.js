import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, call } from '../firebase';

export const userRef = (uid) => doc(db, 'verdict_users', uid);

export const createProfile = (uid) =>
  setDoc(userRef(uid), {
    displayName: '',
    avatarUrl: null,
    discoverable: true,
    shareWantList: false,
    region: 'US',
    services: [],
    onboarded: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export const updateProfile = (uid, patch) => updateDoc(userRef(uid), { ...patch, updatedAt: serverTimestamp() });

export const checkUsername = (username) => call('verdictClaimUsername', { username, check: true });
export const claimUsername = (username, displayName) => call('verdictClaimUsername', { username, displayName });
export const deleteAccount = () => call('verdictDeleteAccount');
