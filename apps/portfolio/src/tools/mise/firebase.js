// Mise uses the shared portfolio Firebase app (src/lib/firebase.js). Kept as a
// thin re-export so the rest of the tool keeps importing `./firebase`
// unchanged, and so mise and /work share one auth instance rather than racing
// two of them through the same redirect sign-in. Storage (step attachments)
// is set up here rather than in the shared module so the Storage SDK only
// loads with this tool's chunk.
import { connectStorageEmulator, getStorage } from "firebase/storage";
import app from "../../lib/firebase";

export { auth, db } from "../../lib/firebase";
export const storage = getStorage(app);

// Same switch as src/lib/firebase.js: REACT_APP_FIREBASE_EMULATORS=1 npm start
if (process.env.REACT_APP_FIREBASE_EMULATORS === "1") {
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

export default app;
