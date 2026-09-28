// My Reading Buddy uses the portfolio's shared sign-in (src/lib/auth.js).
// Google or any email address works. A bookshelf is shared by email, so an
// email and password account has to click its verification link before the
// rules let it see anything; a Google account is verified from the start.
export {
  authMessage,
  redirectSettled,
  refreshVerified,
  resetPassword,
  sendVerification,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  watchAuth,
} from "../../lib/auth";
export { signOutEverywhere as signOutOfReadingBuddy } from "../../lib/auth";
