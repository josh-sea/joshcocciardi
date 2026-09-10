// Draft Night uses the portfolio's shared sign-in (src/lib/auth.js). Kept as a
// thin re-export so the rest of the tool keeps importing `./auth` unchanged,
// and so there is exactly one getRedirectResult() call in the bundle.
export {
  authMessage,
  redirectSettled,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  watchAuth,
} from "../../lib/auth";
export { signOutEverywhere as signOutOfDraftNight } from "../../lib/auth";
