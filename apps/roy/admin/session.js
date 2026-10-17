import { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { onAuthStateChanged, GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { onValue } from "firebase/database";
import { auth, royRef } from "./firebaseConfig";

// Who is signed in, and whether they have a Roy profile yet. App renders a
// different set of screens for each state, so screens never pass userId
// around in navigation params (which would also leak it into the URL).
//   status: "loading" | "signedOut" | "needsProfile" | "ready"
export function useSession() {
  const [session, setSession] = useState({ status: "loading", user: null });

  useEffect(() => {
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile();
      if (!user) {
        setSession({ status: "signedOut", user: null });
        return;
      }
      stopProfile = onValue(royRef(`/users/${user.uid}/username`), (snap) => {
        setSession({ status: snap.exists() ? "ready" : "needsProfile", user });
      }, () => setSession({ status: "needsProfile", user }));
    });
    return () => { stopProfile(); stopAuth(); };
  }, []);

  return session;
}

export const UserContext = createContext(null);

// The signed-in user's uid, for screens inside the "ready" stack.
export const useUserId = () => useContext(UserContext)?.uid;

// Google sign-in (web only). Same approach as the portfolio's shared auth:
// popups first, since they survive the third-party storage limits that make
// redirects unreliable, and a redirect only when a popup can't run at all.
const googleProvider = new GoogleAuthProvider();
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

// Finishes a redirect sign-in when the browser comes back. Called once, here.
if (Platform.OS === "web") {
  getRedirectResult(auth).catch((e) => console.warn("[auth] redirect sign-in did not complete:", e?.code));
}

export const canUseGoogle = Platform.OS === "web";

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (!POPUP_UNAVAILABLE.has(e.code)) throw e;
    await signInWithRedirect(auth, googleProvider);
  }
}

export function googleErrorMessage(e) {
  if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return null;
  if (e?.code === "auth/unauthorized-domain") {
    return "Google sign-in isn't enabled for this site yet. Use email and password for now.";
  }
  return e?.message || "Google sign-in failed. Please try again.";
}
