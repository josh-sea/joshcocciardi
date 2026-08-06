// Who is allowed into /work/*.
//
// Everything under /work is private: it is not in the tools registry, so it
// never appears on /tools or /projects, and it is served behind a Google
// sign-in gate that admits only the addresses below.
//
// Read this honestly: the portfolio is a static SPA, so the *code* for these
// pages is public no matter what — anyone who guesses the URL can download the
// JavaScript chunk. What this gate buys is that the page refuses to render and,
// more importantly, that the stored data is unreachable: the matching rules in
// the repo-root firestore.rules enforce the same allowlist server-side, which
// is where the real boundary lives. Keep the two lists in sync.
export const ALLOWED_EMAILS = ["joshua.cocciardi@gmail.com"];

export const isAllowed = (user) =>
  !!user &&
  !!user.email &&
  ALLOWED_EMAILS.includes(user.email.trim().toLowerCase());
