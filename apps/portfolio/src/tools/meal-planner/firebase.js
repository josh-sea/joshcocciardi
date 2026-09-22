// The Meal Planner uses the shared portfolio Firebase app (src/lib/firebase.js)
// so every signed-in tool runs through one initialized app and one auth
// instance.
export { auth, db } from "../../lib/firebase";
export { default } from "../../lib/firebase";
