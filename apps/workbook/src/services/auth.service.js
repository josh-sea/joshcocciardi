import {
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// Adults sign in with Google (same as the other apps in the monorepo). A young
// child never types a password — the grown-up signs in once and hands over the
// device. Each adult owns a small set of kid profiles (see kids.service.js).
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Ensure the adult's profile doc exists.
  const ref = doc(db, 'workbook_users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || '',
      displayName: user.displayName || (user.email || 'Grown-up').split('@')[0],
      createdAt: serverTimestamp(),
    });
  }
  return user;
};

export const logout = () => signOut(auth);

export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

export const getCurrentUser = () => auth.currentUser;
