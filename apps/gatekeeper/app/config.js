// ─── Gatekeeper parent app — public config ───────────────────────────────
// Firebase web config values are public by design; access is gated by the
// Firestore security rules, not by hiding these.
window.GK_CONFIG = {
  // The extension-facing Cloud Function base URL. Used here only to show the
  // parent the exact value to paste into the extension's pairing screen.
  apiBase: 'https://us-central1-josh-cocciardi.cloudfunctions.net/gatekeeperApi',

  // Web Push (VAPID) public key from the Firebase console:
  //   Project settings → Cloud Messaging → Web configuration → "Web Push
  //   certificates" → Key pair. Paste the public key here to turn on push
  //   notifications. Left blank, the app still works — it just falls back to
  //   the in-page live list instead of OS notifications.
  vapidKey: '',
};
