// Mise uses the shared portfolio Firebase app (src/lib/firebase.js). Kept as a
// thin re-export so the rest of the tool keeps importing `./firebase`
// unchanged, and so mise and /work share one auth instance rather than racing
// two of them through the same redirect sign-in.
export { auth, db } from "../../lib/firebase";
export { default } from "../../lib/firebase";
