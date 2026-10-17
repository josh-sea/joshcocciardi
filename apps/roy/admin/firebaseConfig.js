import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getDatabase } from "firebase/database";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDNVoxKpQ6atcfEZOlUslT7K68rzDRBM8k",
  authDomain: "battle-roy-al.firebaseapp.com",
  projectId: "battle-roy-al",
  storageBucket: "battle-roy-al.appspot.com",
  messagingSenderId: "562464814439",
  appId: "1:562464814439:web:7c582c2c930b8a7b286bc2",
  databaseURL: "https://battle-roy-al-default-rtdb.firebaseio.com/",
};

const appAuth = initializeApp(firebaseConfig);
const auth = Platform.OS === 'web'
  ? getAuth(appAuth)
  : initializeAuth(appAuth, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
const database = getDatabase(appAuth);

export { auth, appAuth, database };
