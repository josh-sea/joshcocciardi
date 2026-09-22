// The Meal Planner uses the portfolio's shared sign-in (src/lib/auth.js). Only
// Google is offered here: household access is granted by verified email, and
// a Google account is verified from the first sign-in, where an email and
// password account would not be.
export { authMessage, redirectSettled, signInWithGoogle, watchAuth } from "../../lib/auth";
export { signOutEverywhere as signOutOfMealPlanner } from "../../lib/auth";
