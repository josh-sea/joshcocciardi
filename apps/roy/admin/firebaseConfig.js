import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getDatabase, ref } from "firebase/database";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Roy lives in the shared josh-cocciardi project. Auth is the shared user
// pool; all Roy data sits under /roy in the default Realtime Database so it
// never collides with the other apps (see database.rules.json at the repo root).
const firebaseConfig = {
  apiKey: "AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc",
  authDomain: "josh-cocciardi.firebaseapp.com",
  projectId: "josh-cocciardi",
  storageBucket: "josh-cocciardi.firebasestorage.app",
  messagingSenderId: "21223323384",
  appId: "1:21223323384:web:2df2e363a8a4a52adaed0d",
  databaseURL: "https://josh-cocciardi-default-rtdb.firebaseio.com",
};

const ROOT = "roy";

const appAuth = initializeApp(firebaseConfig);
const auth = Platform.OS === 'web'
  ? getAuth(appAuth)
  : initializeAuth(appAuth, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
const database = getDatabase(appAuth);

// A database ref inside Roy's namespace: royRef(`/games/${id}`) → /roy/games/{id}
const royRef = (path = "") => ref(database, `${ROOT}/${path.replace(/^\/+/, "")}`);

export { auth, appAuth, database, royRef };
