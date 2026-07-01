# ⚾ Playball — Timed Playlist & Lineup Manager

Walk-up music manager, migrated from `josh-sea/playball` (GitHub Pages + GitHub-token
storage) to this monorepo (Firebase Hosting + Firebase Auth + Firestore).

**Live URL (after deploy):** https://www.joshcocciardi.com/projects/playball

## What it does

- **Connect Spotify** (PKCE OAuth, no backend). Premium required for in-browser playback.
- **Sign in with Google or email/password** (Firebase Auth) to save playlists —
  replaces the old GitHub-token requirement.
- **Import Spotify playlists** — imported playlists stay *linked* to their Spotify ID.
- **Timed playback** — per-track start/stop times (stored in Firestore, since Spotify
  can't hold that metadata), auto-advance through the playlist.
- **Sync to Spotify** — reorder tracks in the editor and push the order back to the
  linked Spotify playlist. Unlinked playlists get a "Create on Spotify" button.
- **Lineup Manager (batting order)** — assign a player name to each song. Drag rows to
  reorder the batting order: the songs move with the players, player names auto-save to
  Firestore, and the new order auto-syncs to the Spotify playlist.
- **Import legacy playlists** — one-click import of the JSON playlists saved by the old
  GitHub-based app (fetched from the public `josh-sea/playball` repo).

## Data model (Firestore)

```
users/{uid}/playball_playlists/{docId}   { name, spotifyId, tracks[], created, updated }
users/{uid}/playball_lineups/{spotifyPlaylistId}
                                         { playlistId, playlistName, names{trackId: player}, order[] }
```

Per-user security rules are in the repo root `firestore.rules`.

## One-time setup checklist

1. **Spotify app** ([dashboard](https://developer.spotify.com/dashboard)) — add Redirect URIs:
   - `https://www.joshcocciardi.com/projects/playball`
   - `https://joshcocciardi.com/projects/playball`
2. **Firebase Console → Authentication → Sign-in method** — enable **Google** and
   **Email/Password** providers (project `josh-cocciardi`).
3. **Firebase Console → Authentication → Settings → Authorized domains** — make sure
   `joshcocciardi.com` and `www.joshcocciardi.com` are listed.
4. Deploy rules + hosting: `./deploy.sh firestore && ./deploy.sh playball`

## Deploying

No build step — plain HTML/CSS/JS. From the repo root:

```bash
./deploy.sh playball    # copies this app into portfolio/public + deploys hosting
```

## Files

- `index.html` / `css/styles.css` — UI shell
- `js/auth.js` — Spotify PKCE auth + Web API (paginated fetches, chunked playlist replace)
- `js/store.js` — Firebase Auth + Firestore (ES module, config inline — web config is public)
- `js/app.js` — app logic: editor, player, import, lineup
- `sw.js` / `manifest.json` — PWA bits (network-first for same-origin, so deploys show immediately)
