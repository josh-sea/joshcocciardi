# Roy

A two-player, turn-based territory game (Color Chasers). It's an Expo / React Native app shipped as a web build. It was moved here from [josh-sea/roy](https://github.com/josh-sea/roy) at `1600ef0`. That repo and its `battle-roy-al` Firebase project stay as they were, along with the Android/EAS build. This copy is the web version going forward.

Live at **https://josh-cocciardi-roy.web.app** (its own Hosting site in the `josh-cocciardi` project).

## Layout

```
apps/roy/
  App.js, components/, hooks/, utils/   # the app (React Native + react-native-web)
  admin/                                # firebaseConfig (royRef helper), login, signup
  public/                               # copied into the web export as-is:
                                        #   privacy-policy.html, delete-account.html
  functions/                            # Cloud Functions codebase "roy" (Node 22)
    test/rules.test.mjs                 # Realtime Database rules suite (emulator)
```

## Namespacing in the shared project

- **Realtime Database:** everything lives under `/roy` (`/roy/users/{uid}`, `/roy/games/{gameId}`) in the default instance. Client code goes through `royRef(path)` from `admin/firebaseConfig.js`, never `ref(database, ...)`. Rules are in the `roy` section of the root `database.rules.json`.
- **Functions:** separate codebase `roy`, exported under the `roy` group (`roy-onTurnChange`, `roy-onGameCreated`, `roy-onTrashTalk`, `roy-deleteAccount`).
- **Auth:** the shared user pool, with email/password and Google (web). The app shows the login screens, a "pick a username" screen (signed in but no Roy profile yet) or the game screens, based on `useSession()` in `admin/session.js`. Screens get the uid from `useUserId()`, never from navigation params. `josh-cocciardi-roy.web.app` (and any custom domain later) must be in Firebase Auth's authorized domains for Google sign-in. Signing up with an email that already has an account elsewhere on the site signs in with that password and adds a Roy profile. Deleting a Roy account removes only Roy data. The login itself stays.
- **Hosting:** target `roy`, site `josh-cocciardi-roy`. It deliberately has no `node_modules` ignore, because Expo's export keeps the icon fonts under `assets/node_modules/`. `/api/delete-account` rewrites to `roy-deleteAccount`.

## Paid features

Tiers are read from `/roy/users/{uid}/features` (`useFeatureFlags`). The rules make that node **server-only**, so a purchase flow has to write it from a Cloud Function (for example, a Stripe webhook). Clients can never grant it to themselves.

## Local development

```sh
cd apps/roy && npm ci
npm run web          # dev server
npm run build:web    # static export to dist/
```

To run against the local emulators instead of production (from the repo root, `npx firebase-tools emulators:start --only auth,database --project josh-cocciardi`):

```sh
EXPO_PUBLIC_USE_EMULATORS=1 npm run web
```

The rules suite starts and stops its own database emulator:

```sh
cd apps/roy/functions && npm ci && npm run test:rules
```

## Deploy

On merge to `master`, CI exports the web build and deploys `hosting:roy` and `functions:roy` in their own step. The `/roy` database rules go out with the shared rules. To deploy by hand: `./deploy.sh roy`.

## URLs

Every screen has a path (`/`, `/signup`, `/practice`, `/games`, `/game/:gameId`, `/solo`, `/friends`, `/profile`; see `linking` in `App.js`), so browser back, the iOS edge swipe and refresh all follow the app's stack.

## Push notifications

- **Turning it on:** Profile → "Turn on for this device" asks for permission and saves the device's FCM token to `/roy/users/{uid}/webPushTokens/{token}` (`admin/webPush.js`). The app re-saves the current token on every start, because tokens rotate. On iPhone, web push only works from the home screen app (Share → Add to Home Screen), so Profile shows that hint instead of the button.
- **Sending:** `notify()` in `functions/index.js` sends to the native Expo token (if any) and to every web token through `admin.messaging()`, pruning tokens FCM reports as gone. A tap opens `/game/{gameId}`. Turn, invite and trash-talk notifications still skip a player who is in that game right now. `onDisconnect` clears that presence flag when a tab closes.
- **Installable app:** `public/index.html` (the template Expo builds from), `public/manifest.json`, `public/icons/` and `public/firebase-messaging-sw.js`.

## Move effects

Each move is one `update()` of the game: grid, selected, turn, moveCount, and a `lastMove` record `{ id, by, index, shape, anim }`. A screen plays an effect only for a `lastMove.id` it hasn't seen, made by the other player, using the effect stored in that move. Opening a game never replays the last move.

## Web limits (for now)

- **Haptics:** `expo-haptics` vibrates on Android browsers and does nothing on iOS Safari.
