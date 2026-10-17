// Import the necessary Firebase SDKs
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDNVoxKpQ6atcfEZOlUslT7K68rzDRBM8k",
    authDomain: "battle-roy-al.firebaseapp.com",
    projectId: "battle-roy-al",
    storageBucket: "battle-roy-al.appspot.com",
    messagingSenderId: "562464814439",
    appId: "1:562464814439:web:7c582c2c930b8a7b286bc2",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// export const googleAuthProvider = new app.auth.GoogleAuthProvider();

export default app;
// Export the Firebase authentication and Google provider instances
