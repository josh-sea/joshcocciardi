import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Verdict lives in the shared josh-cocciardi project, like Roy and Weather.
// Every collection is prefixed verdict_ so nothing collides with the other
// apps (see the Verdict section of the root firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;
try {
  authInstance = Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  // Fast refresh re-runs this file; auth is already initialized.
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

// Local testing against the emulators: EXPO_PUBLIC_USE_EMULATORS=1 npx expo start
if (process.env.EXPO_PUBLIC_USE_EMULATORS === '1' && !globalThis.__verdictEmulators) {
  globalThis.__verdictEmulators = true;
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}

// Call a Verdict callable and return its data. Errors carry a readable
// message from the function.
export async function call(name, data = {}) {
  try {
    const res = await httpsCallable(functions, name)(data);
    return res.data;
  } catch (err) {
    const e = new Error(err.message || 'Something went wrong.');
    e.code = err.code;
    throw e;
  }
}
