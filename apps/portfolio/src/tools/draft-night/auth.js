import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

// Finish a Google redirect sign-in if this load is the return leg of one.
getRedirectResult(auth).catch((e) => console.warn("[draft-night] redirect sign-in:", e.message));

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

export const signInWithGoogle = async () => {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (e) {
    // Popups are blocked in plenty of mobile browsers, and this tool is used
    // on a phone at a draft table. Fall back to redirect rather than dead-end.
    if (
      e.code === "auth/popup-blocked" ||
      e.code === "auth/popup-closed-by-user" ||
      e.code === "auth/cancelled-popup-request" ||
      e.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw e;
  }
};

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password).then((c) => c.user);

export const signUpWithEmail = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password).then((c) => c.user);

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export const signOutOfDraftNight = () => signOut(auth);

const MESSAGES = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter a password.",
  "auth/weak-password": "Passwords need at least 6 characters.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "No account for that email yet. Create one below.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and retry.",
  "auth/unauthorized-domain": "This domain isn't authorized for sign-in in Firebase Auth.",
};

export const authMessage = (e) => MESSAGES[e?.code] || e?.message || "Something went wrong.";
