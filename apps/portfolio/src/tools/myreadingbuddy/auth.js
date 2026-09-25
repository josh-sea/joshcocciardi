// My Reading Buddy uses the portfolio's shared sign-in (src/lib/auth.js). Only
// Google is offered: a bookshelf is shared by verified email, and a Google
// account is verified from the first sign-in, where an email and password
// account would not be.
export { authMessage, redirectSettled, signInWithGoogle, watchAuth } from "../../lib/auth";
export { signOutEverywhere as signOutOfReadingBuddy } from "../../lib/auth";
