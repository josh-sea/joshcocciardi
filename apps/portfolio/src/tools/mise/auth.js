// Mise uses the portfolio's shared sign-in (src/lib/auth.js). Kept as a thin
// re-export so AuthScreen and index keep importing `./auth` unchanged, and so
// the bundle holds exactly one getRedirectResult() call.
export {
  authMessage,
  redirectSettled,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  watchAuth,
} from "../../lib/auth";
export { signOutEverywhere as signOutOfMise } from "../../lib/auth";
