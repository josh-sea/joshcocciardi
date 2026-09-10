// Draft Night uses the shared portfolio Firebase app (src/lib/firebase.js), so
// this tool, Mise, and /work all run through one initialized app and one auth
// instance rather than racing several through the same redirect sign-in.
export { auth, db } from "../../lib/firebase";
export { default } from "../../lib/firebase";
