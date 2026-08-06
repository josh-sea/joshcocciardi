import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";

// Google only. These pages are gated to a specific Google address, so
// email/password sign-up (which anyone can do) would just create accounts that
// bounce off the allowlist.
const googleProvider = new GoogleAuthProvider();

// Finish a Google redirect sign-in if this load is the return leg of one.
getRedirectResult(auth).catch((e) => console.warn("[work] redirect sign-in:", e.message));

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

export const signInWithGoogle = async () => {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (e) {
    // Popups are blocked or unsupported in plenty of mobile browsers; fall
    // back to the redirect flow rather than dead-ending the sign-in.
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

export const signOutOfWork = () => signOut(auth);

const MESSAGES = {
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Network problem — check your connection and retry.",
  "auth/unauthorized-domain": "This domain isn't authorized for sign-in in Firebase Auth.",
};

export const authMessage = (e) => MESSAGES[e?.code] || e?.message || "Something went wrong.";
