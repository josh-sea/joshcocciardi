// The two timings that have to stay in a known relationship, kept apart from
// parkhistory.js so a test can read them without pulling in firebase-admin.
//
// Firebase Hosting caps a request to a function at 60 seconds and answers
// 504, and it does NOT cancel the function: it keeps running and writing
// while the caller has given up, so a caller that retries starts a second
// invocation on top of the first. The work budget therefore has to finish
// comfortably inside the cap, not inside the function's own 300s timeout.
// Within the overall budget, fetching gets the first share and the rollup
// rebuild gets the rest. A rebuild reads a park's whole archive and writes a
// ~200KB document, which is seconds of work per park, so it cannot be an
// afterthought tacked onto a fetch loop that has already spent the budget.
// Both are resumable, so running out mid-way costs another pass, never data.
module.exports = {
  BUDGET_MS: 40 * 1000,
  FETCH_SHARE_MS: 25 * 1000,
  HOSTING_CAP_MS: 60 * 1000,
};
