// ---------------------------------------------------------------------------
// Shared sign-in for the portfolio's signed-in tools.
//
// One implementation, because the redirect leg of a Google sign-in only
// completes if something calls getRedirectResult() after the browser comes
// back. A tool that calls signInWithRedirect without that call sends you to
// Google, brings you back, and leaves you signed out — which is exactly what
// a hand-rolled second copy of this logic did.
//
// It is also called exactly once, here, at module load. Two modules each
// racing their own getRedirectResult() against the same pending redirect is
// its own class of bug.
// ---------------------------------------------------------------------------

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
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

/* Completing a redirect is asynchronous, and until it settles "no user yet"
   and "signed out" look identical. Callers await this before rendering a
   sign-in screen, so returning from Google doesn't flash the gate you just
   came through. Never rejects: a failed redirect still has to unblock the UI. */
export const redirectSettled = getRedirectResult(auth).catch((e) => {
  console.warn("[auth] redirect sign-in did not complete:", e?.code || e?.message);
  return null;
});

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

/* Popups are the good path: they keep the page, and they are unaffected by the
   third-party storage restrictions that make redirect sign-in unreliable.
   Fall back to redirect only when the popup genuinely cannot run. A popup the
   person closed on purpose is not a reason to throw them into a full-page
   redirect — doing that is what produces the "Google twice, then signed out"
   loop — so those cases surface as an error instead. */
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

export const signInWithGoogle = async () => {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  } catch (e) {
    if (POPUP_UNAVAILABLE.has(e.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null; // the page is navigating away; the return leg finishes it
    }
    throw e;
  }
};

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password).then((c) => c.user);

export const signUpWithEmail = async (email, password, displayName) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  return cred.user;
};

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export const signOutEverywhere = () => signOut(auth);

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
  "auth/popup-closed-by-user": "The sign-in window closed before it finished. Try again.",
  "auth/cancelled-popup-request": "Another sign-in window was already open. Try again.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow popups for this site.",
};

export const authMessage = (e) => MESSAGES[e?.code] || e?.message || "Something went wrong.";
