import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

const googleProvider = new GoogleAuthProvider();

// The collector app keeps its own lightweight profile doc so a shop can show
// friendly member names. Kept under a namespaced collection so it never
// collides with the shared /users tree the other apps own.
const ensureProfile = async (user, displayName) => {
  const ref = doc(db, 'collector_users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: displayName || user.displayName || user.email.split('@')[0],
      createdAt: serverTimestamp(),
    });
  }
};

export const signUp = async (email, password, displayName) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureProfile(cred.user, displayName);
  return cred.user;
};

export const signIn = async (email, password) => {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureProfile(cred.user);
  return cred.user;
};

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureProfile(result.user);
  return result.user;
};

export const logout = () => signOut(auth);

export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

export const getCurrentUser = () => auth.currentUser;
