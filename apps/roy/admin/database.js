
import { getDatabase } from "firebase/database";
import { appAuth } from './firebaseConfig'
// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
  apiKey: "AIzaSyDNVoxKpQ6atcfEZOlUslT7K68rzDRBM8k",
  authDomain: "battle-roy-al.firebaseapp.com",
  projectId: "battle-roy-al",
  storageBucket: "battle-roy-al.appspot.com",
  messagingSenderId: "562464814439",
  appId: "1:562464814439:web:7c582c2c930b8a7b286bc2",
  databaseURL: "https://battle-roy-al-default-rtdb.firebaseio.com/",
};

// Initialize Firebase
const appDB = initializeApp(firebaseConfig);
// Initialize Realtime Database and get a reference to the service
const database = getDatabase(appDB);

export default database;
