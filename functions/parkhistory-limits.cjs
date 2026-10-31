// The two timings that have to stay in a known relationship, kept apart from
// parkhistory.js so a test can read them without pulling in firebase-admin.
//
// Firebase Hosting caps a request to a function at 60 seconds and answers
// 504, and it does NOT cancel the function: it keeps running and writing
// while the caller has given up, so a caller that retries starts a second
// invocation on top of the first. The work budget therefore has to finish
// comfortably inside the cap, not inside the function's own 300s timeout.
module.exports = {
  BUDGET_MS: 40 * 1000,
  HOSTING_CAP_MS: 60 * 1000,
};
