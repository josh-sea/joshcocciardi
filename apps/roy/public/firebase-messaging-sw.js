/* Roy web push. Firebase Cloud Messaging shows each notification and, on a
   tap, opens or focuses the app at the link the functions attach
   (webpush.fcmOptions.link, e.g. /game/{gameId}). */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc",
  authDomain: "josh-cocciardi.firebaseapp.com",
  projectId: "josh-cocciardi",
  storageBucket: "josh-cocciardi.firebasestorage.app",
  messagingSenderId: "21223323384",
  appId: "1:21223323384:web:2df2e363a8a4a52adaed0d",
});

firebase.messaging();
