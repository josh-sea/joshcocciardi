// My Reading Buddy uses the shared portfolio Firebase app (src/lib/firebase.js)
// so every signed-in tool runs through one initialized app and one auth
// instance. Storage is set up here rather than in the shared module so the
// Storage SDK only loads with this tool's chunk.
import { connectStorageEmulator, getStorage } from "firebase/storage";
import app from "../../lib/firebase";

export { auth, db } from "../../lib/firebase";
export const storage = getStorage(app);

// Same switch as src/lib/firebase.js: REACT_APP_FIREBASE_EMULATORS=1 npm start
if (process.env.REACT_APP_FIREBASE_EMULATORS === "1") {
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

export default app;
