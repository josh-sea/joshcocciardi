// /work uses the portfolio's shared sign-in (src/lib/auth.js). Kept as a thin
// re-export so AuthGate keeps importing `./auth` unchanged, and so the bundle
// holds exactly one getRedirectResult() call. Two modules each racing their
// own call against the same pending redirect is how a returning sign-in gets
// consumed by one of them and read as "signed out" by the other.
export { authMessage, redirectSettled, signInWithGoogle, watchAuth } from "../lib/auth";
export { signOutEverywhere as signOutOfWork } from "../lib/auth";
