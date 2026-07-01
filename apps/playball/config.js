// ─── Site Configuration ──────────────────────────────────────────────────────
// 1. Spotify app dashboard: https://developer.spotify.com/dashboard
// 2. Make sure these Redirect URIs are registered on the Spotify app:
//      https://www.joshcocciardi.com/projects/playball
//      https://joshcocciardi.com/projects/playball
//      http://localhost:5000/projects/playball   (for `firebase serve` testing)
// 3. Client ID is set below (no secret needed — this app uses PKCE).
//
// Firebase config lives in js/store.js (web config values are public).

window.APP_CONFIG = {
  spotify_client_id: '9f589e7d793d4fd9bfe87cc9ab753cb1',
  // Old GitHub-based playball repo — used only by "Import legacy playlists".
  legacy_repo: 'josh-sea/playball',
};
