import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Firebase web config is public by design (it identifies the project, it does
// not grant access — Firestore rules do that), so it ships in the bundle the
// same way it does in apps/recipebox. The env overrides exist so the tool can
// be pointed at a scratch project without editing source.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "josh-cocciardi.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "josh-cocciardi",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "josh-cocciardi.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "21223323384",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:21223323384:web:2df2e363a8a4a52adaed0d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Local development against the Firebase emulator suite:
//   REACT_APP_FIREBASE_EMULATORS=1 npm start
// Never on in a production build — the env var is compiled in at build time,
// and deploy.sh doesn't set it.
if (process.env.REACT_APP_FIREBASE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export default app;
