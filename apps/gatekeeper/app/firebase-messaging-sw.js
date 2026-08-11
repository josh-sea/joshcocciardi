/* Gatekeeper parent app — service worker.
 * Handles background web-push (Firebase Cloud Messaging) and gives the app a
 * registered SW so it is installable as a PWA. Must live at the site root so
 * its scope covers the whole app.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:874be0258bd2b6dadaed0d',
});

const messaging = firebase.messaging();

// Background messages arrive here when the app tab isn't focused.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const requestId = payload.data && payload.data.requestId;
  self.registration.showNotification(n.title || 'Gatekeeper', {
    body: n.body || 'A new access request is waiting.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: requestId ? 'gk-' + requestId : 'gk',
    requireInteraction: true,
    data: { url: '/?request=' + (requestId || '') },
  });
});

// Tapping a notification focuses an open tab or opens the console.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});

// A no-op fetch handler keeps the app installable; requests pass straight
// through to the network (the app is realtime and shouldn't be cached stale).
self.addEventListener('fetch', () => {});
