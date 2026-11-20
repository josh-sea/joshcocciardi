# Verdict

Movie and TV recommendations from the people you actually trust. Give anything a
👍 Recommend, 😐 It's fine or 👎 Don't bother, and see what your friends think
of anything before you start it. The full product spec is in [SPEC.md](SPEC.md).

Built with Expo (SDK 54) on the shared `josh-cocciardi` Firebase project, and
published as a web app at **https://josh-cocciardi-verdict.web.app** (later
verdict.joshcocciardi.com), the same way Roy and Weather are. The same code
runs on iOS and Android. Title data and "where to watch" come from TMDB through
a Cloud Function.

## What's in v1

| Area | What it does |
|---|---|
| **Accounts** | Email and password, forgot password, a unique username (can't change) and a display name. Delete account in Settings. |
| **Onboarding** | Username and public/private choice, your streaming services, quick-rate trending titles, find friends. |
| **Feed** | Friends' new verdicts, changed verdicts, and what they started or finished. A "Friends are watching" strip on top. |
| **Discover** | Search all of TMDB. Friends recommend (👍 minus 👎, starred friends count double, titles you've rated hidden), Friends are watching, Trending. "Only on my services" filter. |
| **Title** | Friends' chip (`👍 4 😐 1 👎 0`), tap for who said what. Your verdict and note, your list status, where it streams in the US (your services highlighted), summary, cast, trailer. |
| **Lists** | Want to watch, Watching, Finished, Gave up. Rating while Watching is labelled "Still watching". Marking Finished asks if your verdict still holds. |
| **Friends** | Always mutual, always approved. Public accounts are searchable by username; private ones only by invite link or code. Friend lists are never shown; profiles show only a mutual friend count. |
| **Star / Mute** | Private to you. Starred friends come first and count double; muted friends disappear from the feed, recommendations and every count. |
| **Friend profile** | Taste match % (after 5 titles in common), their ratings, what they're watching, and where you agree and disagree. Remove, block, report. |
| **Push** | Friend request received, request accepted. |

Tags (the fixed list in `src/constants/tags.js`) are stored on every rating as
`tags: []` but have no screens yet. See SPEC.md section 9.

## Layout

```
App.js                 auth state, invite links, navigation
src/firebase.js        Firebase app, auth with AsyncStorage persistence, call()
src/context/           AppContext: profile, prefs, connections, my ratings and lists
src/api/               Firestore reads and writes, one file per area
src/lib/verdict.js     pure logic: counts, breakdowns, taste match, history
src/screens/           Auth, Onboarding, Feed, Discover, Title, Friends, People, Settings
src/components/        UI kit, chip, rating buttons, poster, rows, pickers
functions/             Cloud Functions, codebase "verdict"
test/                  unit, rules and end-to-end tests
```

## Data

Every collection starts with `verdict_` (rules in the Verdict section of the root
`firestore.rules`):

| Collection | Who reads | Who writes |
|---|---|---|
| `verdict_users/{uid}` | any signed-in user, by id only (no listing) | owner; `username` only through the function |
| `verdict_users/{uid}/private/prefs` (star/mute), `push` | owner | owner |
| `verdict_users/{uid}/private/blocks`, `invite` | owner / nobody | functions |
| `verdict_usernames`, `verdict_invites`, `verdict_secrets` | nobody | functions |
| `verdict_connections/{a__b}` | the two people | requester creates pending, the other accepts, either deletes |
| `verdict_ratings/{uid__titleKey}` | owner and accepted friends | owner; history is append-only |
| `verdict_lists/{uid__titleKey}` | owner and friends (Want to watch only if shared) | owner |
| `verdict_activity/{uid}/titles/{titleKey}` | owner | functions (friends' verdicts per title) |
| `verdict_feeds/{uid}/items` | owner | functions |
| `verdict_titles/{titleKey}` | signed in | functions (TMDB cache) |
| `verdict_reports` | nobody | reporter creates |

`titleKey` is `movie_603` or `tv_1396`.

## Functions (`functions/`)

| Function | What it does |
|---|---|
| `verdictTmdb` | Search, trending, details, US watch providers, provider list. Caches in `verdict_titles` (details 7 days, providers 1 day, trending 6 hours). |
| `verdictClaimUsername` | Checks or claims a username. |
| `verdictSearchUsers` | Prefix search over public accounts, skipping blocks. |
| `verdictGetProfile`, `verdictMutualCount` | Public profile with connection state; mutual friend count. Friend lists never leave the server. |
| `verdictInviteCode`, `verdictRedeemInvite` | Your invite code; using someone's code sends them a request. |
| `verdictBlock`, `verdictUnblock`, `verdictBlockedList` | Blocking. |
| `verdictOnRatingWrite`, `verdictOnListWrite` | Fan a verdict or a Watching status out to every friend's activity index and feed. |
| `verdictOnConnectionWrite` | Push on request and accept; backfill both sides on accept; scrub both sides on remove. |
| `verdictDeleteAccount` | Removes every Verdict record. The Firebase Auth user is kept on purpose because the Auth pool is shared with the other apps in this project. |

## One-time setup

1. **TMDB.** Make a free account at themoviedb.org, then Settings → API and copy
   the **API Read Access Token** (the long v4 one). In the Firebase console →
   Firestore, create the document `verdict_secrets/keys` with a string field
   `tmdbReadToken` set to it. Nothing works without this; until then title
   screens say "TMDB is not set up yet."
2. **Indexes.** They're listed in the root `firestore.indexes.json`, but CI
   doesn't deploy indexes. Run `firebase deploy --only firestore:indexes` once
   from the repo root and answer **No** when it offers to delete indexes that
   aren't in the file, or create them in the console when a query error links
   to them:
   - `verdict_connections`: `users` array-contains + `status`
   - `verdict_users`: `discoverable` + `username`
   - `verdict_ratings`: `uid` + `updatedAt` desc
   - `verdict_lists`: `uid` + `updatedAt` desc, and `uid` + `status` + `updatedAt` desc
3. **Feed TTL.** Firestore → TTL policies → collection group `items`, field
   `expireAt`, so feed items clear after 90 days.
4. **Email/Password sign-in** is on for the project already if other apps use it;
   check Authentication → Sign-in method.
5. **EAS.** `npm i -g eas-cli`, then in this folder `eas init` (adds the
   project id to `app.json`, which push notifications need) and
   `eas build --profile development --platform ios`.

The web app, functions and rules deploy from CI when a change merges to master
(the "Deploy Verdict" step creates the Hosting site the first time), or by hand
with `./deploy.sh verdict` from the repo root. To serve it at
verdict.joshcocciardi.com, connect the domain to the `josh-cocciardi-verdict`
site (see `apps/portfolio/SUBDOMAINS.md`), then change `WEB_URL` in
`src/constants/config.js` so invite links use it.

## Running it

```bash
npm install
npx expo start
```

Open it in Expo Go on your phone. To run against the emulators instead of
production: `EXPO_PUBLIC_USE_EMULATORS=1 npx expo start` (set
`EXPO_PUBLIC_EMULATOR_HOST` to your computer's LAN address when using a phone).

Invite links are `https://josh-cocciardi-verdict.web.app/invite/CODE`, so they
open for anyone in a browser. An installed build also accepts
`verdict://invite/CODE`, and the typed code works everywhere.

On the web, confirmations use the browser's own dialogs (`src/lib/dialog.js`),
because React Native's Alert does nothing there.

## Tests

```bash
npm test                     # pure logic and function helpers
```

The rules and end-to-end tests need the emulators. From the repo root:

```bash
firebase emulators:start --only firestore --project josh-cocciardi
```

```bash
cd apps/verdict && npm i --no-save @firebase/rules-unit-testing firebase@12 && node test/verdict-rules.test.mjs
```

`test/functions-flow.test.mjs` runs usernames, search, invites, fan-out,
backfill, mute-free counts, remove, block and account deletion against the
auth, Firestore and functions emulators. Its header says how to start them with
only the Verdict codebase.

## Attribution

TMDB's terms require the notice in Settings → About ("This product uses the TMDB
API but is not endorsed or certified by TMDB"), and streaming data credits
JustWatch. Charging money for the app needs a commercial agreement with TMDB
first.
