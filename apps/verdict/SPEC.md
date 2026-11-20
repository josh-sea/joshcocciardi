# Verdict: v1 Spec

> **Working name.** "Verdict" is a placeholder. The app folder (`apps/verdict`), the
> Firestore collection prefix (`verdict_`), the functions codebase (`verdict`) and the
> function names (`verdict*`) all use it, so a rename is a single find-and-replace.

## 0. Instructions for the implementing agent

- This is a **new Expo app inside the existing monorepo** at `apps/verdict`. Follow the
  conventions already in this repo:
  - Expo SDK and React versions match `apps/roy` and `apps/weather` (Expo `~54`,
    React `19.1.0`, React Native `0.81.x`, `firebase` JS SDK `^10`, React Navigation 7).
  - Shared Firebase project `josh-cocciardi` (`.firebaserc`). Auth users are shared
    across the apps in this project, so every collection is **prefixed** (`verdict_*`),
    the same way `canitwo_*` and `recipebox_*` are.
  - Security rules go into the shared root `firestore.rules`, in a clearly marked
    `// ── Verdict ──` section.
  - Server code is its own functions codebase at `apps/verdict/functions`, registered in
    `firebase.json` like `apps/roy/functions` and `apps/weather/functions`.
  - API keys are stored server side only, using the `weather_secrets/keys` pattern
    (`verdict_secrets/keys`, no client access, `process.env` fallback for the emulator).
  - The connection document design (sorted uid pair id, pending → accepted) copies
    `recipebox_connections`. The edit-history rule copies `canitwo_places/.../reviews`.
    Read both blocks in `firestore.rules` before writing the Verdict rules.
- Use the **Firebase JS SDK** (not `@react-native-firebase`) so the app runs in Expo Go
  during development. Persist auth with `initializeAuth(app, { persistence:
  getReactNativePersistence(AsyncStorage) })`.
- JavaScript is fine (the sibling Expo apps use JS). If you choose TypeScript, use it for
  the whole app.
- Build in the phase order in section 11. Each phase ends with its acceptance checks
  passing. Don't start tags (section 9) beyond the data fields noted.
- Write rules tests with the Firestore emulator, in the style of
  `functions/test/casino-rules.test.mjs`.
- Do not deploy Firestore indexes from CI (see the note in `.github/workflows/deploy.yml`).
  List required indexes in `apps/verdict/README.md` and create them in the console.

---

## 1. Product summary

People trust recommendations from friends more than from algorithms. Verdict lets you
give any movie or show a quick verdict (👍 recommend / 😐 it's fine / 👎 don't bother)
and see what **your friends** think of anything you're considering, plus what they're
watching right now.

The core moment: looking at a title and seeing `👍 4 😐 1 👎 0` from people you know,
then tapping to see exactly who said what.

**Platform:** iOS first (Expo, EAS Build). Region: **US** for streaming availability in
v1 (stored as a setting so it can change later).

---

## 2. Decisions (locked)

| Area | Decision |
|---|---|
| Auth | Email and password. Unique username plus display name. Forgot password. In-app account deletion. |
| Title data | TMDB, called only through a Cloud Function. US watch providers. |
| Connections | Always **mutual with approval**. One person requests, the other accepts. |
| Discoverability | Per-user setting. **Public**: findable by username search. **Private**: not in search; reachable only by invite link or invite code (still needs approval). |
| Friend lists | **Never shown** to anyone else. Profiles show only a **mutual friend count**. |
| Per-friend setting | ⭐ Starred / Normal / 🔇 Muted. Private to you; the other person is never told. |
| Muted | Hidden from your feed, recs and **every count you see**. |
| Starred | Ranked first in breakdowns, weighted higher in recs. |
| Ratings | `up` / `meh` / `down`, optional note (≤ 280 chars). Rate at any time, change any time, history kept. |
| While watching | A rating made while the title is on your Watching list is labeled "Still watching". |
| Shows | Rated as a whole. No per-season ratings in v1. |
| Lists | Want to watch → Watching → Finished, plus Gave up. |
| Tags | **Later phase.** Fixed list, many per rating, no custom tags. `tags: []` is stored from day one. |
| Notifications (v1) | Friend request received, friend request accepted. |

---

## 3. Tech stack

- **App:** Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7
  (`@react-navigation/native`, `@react-navigation/bottom-tabs`,
  `@react-navigation/native-stack`), `react-native-safe-area-context`,
  `react-native-screens`, `@react-native-async-storage/async-storage`,
  `expo-image` (posters), `expo-notifications`, `expo-linking`, `expo-clipboard`,
  `expo-haptics`, `react-native-qrcode-svg` + `react-native-svg` (invite QR).
- **Backend:** Firebase Auth, Cloud Firestore, Cloud Functions v2 (Node 22,
  `firebase-functions` v6, `firebase-admin` v12).
- **Data:** TMDB API v3 with a v4 read access token (Bearer).
- **Builds:** EAS Build for iOS. Bundle id `com.joshcocciardi.verdict`.
  URL scheme `verdict`.

### Suggested app layout

```
apps/verdict/
  App.js
  app.json
  package.json
  babel.config.js
  metro.config.js
  README.md                 # setup, env, indexes, deploy notes
  SPEC.md                   # this file
  src/
    firebase.js             # app, auth (RN persistence), db, functions
    constants/
      tags.js               # fixed tag list (section 9), unused UI in v1
      ratings.js            # 'up' | 'meh' | 'down', emoji, labels, colors
    api/
      tmdb.js               # wraps the verdictTmdb callable
      users.js              # profile, username claim, search
      connections.js        # request, accept, decline, remove, block
      ratings.js            # rate, change, history
      lists.js              # list status changes
      prefs.js              # star / mute
    hooks/                  # useAuth, useProfile, usePrefs, useFriendActivity, useFeed ...
    navigation/
      RootNavigator.js      # auth stack vs main tabs vs onboarding
      MainTabs.js
    screens/                # one file per screen in section 6
    components/
      VerdictChip.js        # 👍 4 😐 1 👎 0
      RatingButtons.js
      Poster.js
      ProviderRow.js
      TitleRow.js
      UserRow.js
      ListStatusPicker.js
  functions/
    index.js
    tmdb.js
    fanout.js
    users.js
    account.js
    notify.js
    package.json
    test/
```

---

## 4. Data model (Firestore)

IDs and keys:
- `titleKey` = `"<mediaType>_<tmdbId>"`, where mediaType is `movie` or `tv`
  (e.g. `movie_603`, `tv_1396`). Used everywhere a title is referenced.
- `pairId` = the two uids **sorted** and joined with `__` (same as Recipe Box).

### 4.1 `verdict_users/{uid}`: public profile
Any signed-in user can `get` a profile by uid, but **`list` is denied**, so private
users can't be found by querying. All search goes through `verdictSearchUsers`.
```js
{
  username: 'josh',            // lowercase, 3–20 chars, [a-z0-9_.]
  displayName: 'Josh C',
  avatarUrl: null,             // v1: null, initials avatar
  discoverable: true,          // public (searchable) vs private
  region: 'US',
  services: ['nflx', 'hulu'],  // TMDB provider ids the user subscribes to
  onboarded: true,
  createdAt, updatedAt
}
```
Clients write only their own doc. `username` can't be changed by the client after it
is set (it's claimed through `verdictClaimUsername`).

### 4.2 `verdict_users/{uid}/private/{docId}`: owner only
- `private/prefs`
  ```js
  { starred: { [friendUid]: true }, muted: { [friendUid]: true } }
  ```
  One doc so the app loads it once and keeps it in memory.
- `private/blocks`: `{ blocked: { [uid]: true } }`. Written only by functions.
- `private/push`: `{ tokens: ['ExponentPushToken[...]'] }`.

### 4.3 `verdict_usernames/{username}`: no client access
`{ uid }`. Written only by `verdictClaimUsername` in a transaction. Clients never read
it, so private users can't be found by guessing usernames.

### 4.4 `verdict_connections/{pairId}`
```js
{
  users: [uidA, uidB],         // sorted
  requestedBy: uidA,
  status: 'pending' | 'accepted',
  via: 'search' | 'invite',
  createdAt, respondedAt
}
```
Readable by the two members. Create (pending, by requester), accept (by the other
member only), delete (either member: decline, cancel or remove). Copy the
`recipebox_connections` rule block and add a block check (section 7).

### 4.5 `verdict_invites/{code}`
```js
{ uid, createdAt, expiresAt }   // code: 8 chars, A–Z 2–9, no 0/O/1/I
```
Created by the owner. Readable by any signed-in user via `get` only (no `list`).
One active code per user. Regenerating replaces it.

### 4.6 `verdict_ratings/{uid}__{titleKey}`
```js
{
  uid, titleKey, mediaType, tmdbId,
  rating: 'up' | 'meh' | 'down',
  note: '',                    // ≤ 280 chars
  tags: [],                    // tag ids from constants/tags.js; empty in v1
  whileWatching: true,         // true if list status was 'watching' at rating time
  title: { name, year, posterPath },   // snapshot for feed and lists
  history: [ { rating, note, tags, at } ],   // previous versions, ≤ 20, append-only
  createdAt, updatedAt
}
```
Readable by the owner and **accepted connections**. Only the owner writes. Delete is
allowed (un-rate) by the owner. Updates must append the previous version to `history`,
same rule shape as `canitwo_places/{id}/reviews/{uid}`.

### 4.7 `verdict_lists/{uid}__{titleKey}`
```js
{
  uid, titleKey, mediaType, tmdbId,
  status: 'want' | 'watching' | 'finished' | 'abandoned',
  title: { name, year, posterPath },
  startedAt, finishedAt, updatedAt
}
```
Readable by the owner and accepted connections **unless** `status == 'want'` and the
owner's profile has `shareWantList != true` (v1 default: Want to watch is private).
Add `shareWantList: false` to the profile for this.

### 4.8 `verdict_activity/{uid}/titles/{titleKey}`: per-viewer friend index
Written **only by functions** (fan-out). Readable only by `uid`. This is what makes
counts and "who voted what" cheap: the app reads one doc per title.
```js
{
  titleKey, mediaType, tmdbId,
  title: { name, year, posterPath },
  ratings:  { [friendUid]: { rating, note, whileWatching, at } },
  watching: { [friendUid]: at },
  upCount, mehCount, downCount, watchingCount,   // raw counts, ignore mute
  updatedAt
}
```
The raw counts exist only for server-side ordering. **The UI always recomputes counts
from the maps after removing muted uids.**

### 4.9 `verdict_feeds/{uid}/items/{itemId}`
Written only by functions. Readable only by `uid`.
```js
{
  actorUid, actorName, actorUsername,
  type: 'rated' | 'rerated' | 'started' | 'finished',
  titleKey, title: { name, year, posterPath },
  rating, note, whileWatching,
  at,
  expireAt                     // at + 90 days; enable a TTL policy on this field
}
```

### 4.10 `verdict_titles/{titleKey}`: TMDB cache
Written only by functions. Readable by signed-in users.
```js
{
  details: { ... trimmed TMDB fields ... },
  providers: { US: { link, flatrate: [...], rent: [...], buy: [...] } },
  detailsFetchedAt, providersFetchedAt
}
```

### 4.11 `verdict_reports/{id}`
`{ reporterUid, targetUid, ratingId?, reason, createdAt }`. Create-only by the reporter.
No client reads. (Apple requires a way to report user content.)

### 4.12 `verdict_secrets/keys`
`{ tmdbReadToken }`. No client access. Same pattern as `weather_secrets/keys`.

---

## 5. Cloud Functions (`apps/verdict/functions`, codebase `verdict`)

All callables require `request.auth`. Region default. Keep each module lazy-loaded like
the root `functions/index.js`.

### 5.1 `verdictTmdb` (callable)
`{ action, ...params }`:

| action | TMDB endpoint | Cache |
|---|---|---|
| `search` `{ query, page }` | `/search/multi` (filter to movie and tv) | none |
| `trending` `{ window: 'week' }` | `/trending/all/week` | 6 h, in `verdict_titles/_trending` |
| `details` `{ mediaType, tmdbId }` | `/{type}/{id}?append_to_response=credits,videos` | 7 days |
| `providers` `{ mediaType, tmdbId, region }` | `/{type}/{id}/watch/providers` | 24 h |
| `providerList` `{ region }` | `/watch/providers/movie` + `/tv` merged | 7 days |

- Return trimmed objects (id, mediaType, name, year, posterPath, backdropPath, overview,
  genres, runtime or seasons count, top cast). Don't send whole TMDB payloads.
- Images: the client builds URLs as `https://image.tmdb.org/t/p/w342{posterPath}`.
- Token from `verdict_secrets/keys.tmdbReadToken`, falling back to
  `process.env.TMDB_READ_TOKEN`.
- Per-user rate limit: 60 calls per minute (in-memory counter is fine for v1).

### 5.2 `verdictClaimUsername` (callable)
`{ username, displayName }`. Validate format, lowercase, check reserved words
(`admin`, `support`, `verdict`, ...). Transaction: fail if `verdict_usernames/{name}`
exists, else create it and set `username` + `displayName` on the profile.

### 5.3 `verdictSearchUsers` (callable)
`{ query }` (≥ 2 chars). Prefix match (Admin SDK) on usernames where `discoverable == true`,
excluding the caller, anyone either side has blocked, and existing connections are
marked. Returns `[{ uid, username, displayName, avatarUrl, connection: 'none' |
'pending_out' | 'pending_in' | 'friends' }]`, max 20. Needs a `username` field
and index on `verdict_users`.

### 5.4 `verdictRedeemInvite` (callable)
`{ code }`. Looks up the invite, rejects self, expired, blocked or already connected,
then creates a **pending** connection with `requestedBy = caller`, `via: 'invite'`.
The inviter approves it like any request. Returns the inviter's public profile.

### 5.5 `verdictMutualCount` (callable)
`{ otherUid }`. Only allowed if caller and other are connected (or have a pending
request). Counts the overlap of both users' accepted connections. Returns `{ count }`.
Friend lists never leave the server.

### 5.6 `verdictBlock` / `verdictUnblock` (callable)
Block deletes any connection between the two, writes `private/blocks` for the caller,
and removes each user's entries from the other's `verdict_activity` and feed.
Blocked users can't request, redeem invites, or appear in search for each other.

### 5.7 `verdictOnRatingWrite` (Firestore trigger on `verdict_ratings/{id}`)
For each accepted connection of the rater:
- Upsert `verdict_activity/{friendUid}/titles/{titleKey}`: set or delete
  `ratings.{raterUid}`, recompute raw counts.
- On create, or when `rating` changed: add a feed item (`rated` or `rerated`). Note-only
  edits update the activity doc but don't create a feed item.
Use batched writes (≤ 500 per batch). Friend count is small in v1; no queue needed.

### 5.8 `verdictOnListWrite` (trigger on `verdict_lists/{id}`)
Fan out `watching.{uid}` into each friend's activity doc (set when status becomes
`watching`, delete otherwise). Feed items for `started` and `finished`. `want` is
never fanned out.

### 5.9 `verdictOnConnectionWrite` (trigger on `verdict_connections/{pairId}`)
- **Created (pending):** push "X wants to be friends" to the recipient.
- **Accepted:** push "X accepted your request" to the requester, then **backfill** both
  directions: copy each user's existing ratings and `watching` list items into the
  other's activity docs. (No backfilled feed items; feed is only new activity.)
- **Deleted (after accepted):** remove each user's entries from the other's activity
  docs and delete their feed items in each other's feeds.

### 5.10 `verdictDeleteAccount` (callable)
Deletes: ratings, lists, connections, invites, username, profile and private docs,
activity and feed subcollections, the user's entries in friends' activity docs and
feeds, then the Auth user. Idempotent so it can be retried.

### 5.11 Push sending
Helper in `notify.js`: read `private/push.tokens`, POST to
`https://exp.host/--/api/v2/push/send`, drop tokens that come back
`DeviceNotRegistered`.

---

## 6. Screens

Navigation:
- **Auth stack** (signed out): Welcome → Sign up / Log in / Forgot password.
- **Onboarding stack** (signed in, `onboarded != true`): Username → Services →
  Quick rate → Find friends.
- **Main tabs:** Feed · Discover · ＋ · Friends · Profile. Title Detail, Friend Profile,
  Breakdown sheet, Settings and Edit Profile are stack screens pushed on top of tabs.
- Deep link `verdict://invite/{code}` opens the Redeem Invite screen (after auth and
  onboarding if needed).

### 6.1 Auth
- **Welcome:** app pitch, Sign up, Log in.
- **Sign up:** email, password (≥ 8), confirm. Creates the Auth user and an empty
  profile doc, then goes to onboarding.
- **Log in:** email, password, "Forgot password?".
- **Forgot password:** email → `sendPasswordResetEmail`.

### 6.2 Onboarding
1. **Username + display name:** live availability check (debounced call to
   `verdictClaimUsername` in dry-run mode, or a separate `check` flag), discoverable
   toggle (default **on**, with one line explaining public vs private).
2. **Your services:** grid of US providers from `providerList` (top ~20 by popularity
   first). Multi-select. Skippable.
3. **Quick rate:** 15–20 trending titles, one at a time or as a grid, with 👍 😐 👎 and
   "Haven't seen". Goal: at least 5 ratings so taste match has something to work with.
   Skippable.
4. **Find friends:** username search plus "Share your invite link". Done →
   `onboarded: true`.

### 6.3 Feed (tab 1, home)
- Reverse-chronological `verdict_feeds/{uid}/items`, paginated (25 per page),
  **muted actors filtered out client-side**.
- Item: avatar, "**Mike** 👍 *The Bear*" (or "started watching", "finished"),
  "Still watching" label when applicable, note preview, time ago, poster. Tap → Title
  Detail. Tap the name → Friend Profile.
- Top strip: "Friends are watching" horizontal posters (from activity docs with
  `watchingCount > 0`, muted removed).
- Empty state: invite friends, plus trending titles to rate.

### 6.4 Discover (tab 2)
- Search bar (TMDB `search`), results as TitleRows with the VerdictChip from the
  viewer's activity doc if one exists.
- Rows when not searching:
  - **Friends recommend:** activity docs ordered by `upCount` desc, limit 50, then
    recompute without muted, add a starred bonus (score = up − down, starred votes
    count ×2), sort, hide titles the viewer has already rated.
  - **Friends are watching:** `watchingCount > 0`, ordered by `updatedAt`.
  - **Trending:** TMDB trending.
  - Filter toggle: "Only on my services" (uses cached providers).
- v2 adds tag rows ("Friends' picks for Kids movie night").

### 6.5 ＋ (tab 3, center)
Opens a modal: search a title → pick → Rate Sheet (6.7) with list status picker.
Shortcut for "rate the thing I just watched".

### 6.6 Title Detail (stack)
- Backdrop, poster, name, year, runtime or seasons, genres, overview, top cast.
- **Where to watch** (US): streaming first, then rent and buy, with provider logos;
  highlight the viewer's services; the TMDB/JustWatch link opens in the browser.
- **Your verdict:** RatingButtons (tap to rate or change), note field, "Still watching"
  label shown when relevant, "History" link if `history.length > 0`.
- **Your list status:** Want to watch / Watching / Finished / Gave up / none.
  Marking **Finished** prompts: "Still 👍? Keep / Change".
- **Friends' verdict:** VerdictChip from the activity doc (muted removed). Tap →
  Breakdown sheet. "No friends have rated this yet" when empty. A line for
  "3 friends are watching".

### 6.7 Rate Sheet (modal, reused from ＋ and Title Detail)
Three big buttons (👍 Recommend / 😐 It's fine / 👎 Don't bother), optional note,
list status picker, Save. Haptic on select.

### 6.8 Breakdown sheet (modal)
Three sections (👍 / 😐 / 👎), each listing friends with avatar, name, ⭐ if starred,
note, "Still watching" label, time ago. **Starred first** in each section, then by
recency. Muted friends are not listed. Tap a person → Friend Profile.

### 6.9 Friends (tab 4)
- Segments: **Friends** · **Requests** (badge with count) · **Find**.
- Friends: your connections (only you see this), each with ⭐ / 🔇 indicators and a
  taste match % when available. Tap → Friend Profile.
- Requests: incoming (Accept / Decline) and sent (Cancel).
- Find: username search (`verdictSearchUsers`), "Enter invite code", and your invite
  card: link, code, QR, Share button (system share sheet with
  `verdict://invite/{code}` plus the code in plain text).

### 6.10 Friend Profile (stack)
- Header: avatar, display name, @username, **N mutual friends** (from
  `verdictMutualCount`).
- Not connected: "Add friend" / "Request sent" / "Accept". Nothing else is shown.
- Connected:
  - **Taste match** (6.13) with "You agree on 18 of 22 titles".
  - Controls: ⭐ Star, 🔇 Mute (with a one-line note: "They won't be told"),
    "⋯" menu with Remove friend, Block, Report.
  - Tabs: **Ratings** (filter 👍 / 😐 / 👎, movies / shows), **Watching**,
    **Agree / Disagree** (titles you both rated, split by whether you agree).

### 6.11 Profile (tab 5, you)
- Header with your info, counts (rated, watching).
- Tabs: **Ratings** (your history, filterable), **Watching**, **Want to watch**,
  **Finished**, **Gave up**.
- Gear icon → Settings.

### 6.12 Settings
- Edit profile (display name, avatar later).
- Account: email (read-only), change password, sign out.
- Privacy: Discoverable toggle, "Show my Want to watch list to friends" toggle,
  blocked users list (unblock).
- Your services (same picker as onboarding), region (US only in v1, shown read-only).
- Notifications toggle (requests).
- About: TMDB attribution with logo ("This product uses the TMDB API but is not endorsed
  or certified by TMDB."), "Streaming data provided by JustWatch", version.
- **Delete account** (confirm by typing your username) → `verdictDeleteAccount`.

### 6.13 Taste match (logic)
Computed on the client when opening a Friend Profile (load both users' ratings).
- Overlap = titles both have rated.
- Per title score: same rating = 1; `meh` vs `up` or `meh` vs `down` = 0.5;
  `up` vs `down` = 0.
- Match % = round(100 × sum / overlap). Show only if overlap ≥ 5, otherwise
  "Rate a few more in common to see your match".
- Cache the result in memory for the session. (v2 can move this server side and show
  it in the friends list without loading full histories.)

---

## 7. Security rules (outline)

Add to root `firestore.rules`. Helpers:

```
function vSignedIn() { return request.auth != null; }
function vPair(a, b) { return a < b ? a + '__' + b : b + '__' + a; }
function vFriends(other) {
  let c = /databases/$(database)/documents/verdict_connections/$(vPair(request.auth.uid, other));
  return exists(c) && get(c).data.status == 'accepted';
}
```
(Rules support the ternary operator. If the linter disagrees, check both orders with two
`exists()` calls.)

| Path | read | write |
|---|---|---|
| `verdict_users/{uid}` | signed in, `get` only (no `list`) | owner; `username` immutable once set, only via function |
| `verdict_users/{uid}/private/prefs` | owner | owner |
| `verdict_users/{uid}/private/push` | owner | owner |
| `verdict_users/{uid}/private/blocks` | owner | none (function) |
| `verdict_usernames/*` | none | none (function) |
| `verdict_connections/{pairId}` | members (`resource == null` allowed for the existence check) | Recipe Box rules + requester not blocked (functions handle block cleanup) |
| `verdict_invites/{code}` | signed in, `get` only | owner create/delete, `uid == auth.uid` |
| `verdict_ratings/{id}` | owner or `vFriends(resource.data.uid)` | owner; id must equal `uid + '__' + titleKey`; rating in enum; note ≤ 280; tags is list ≤ 5; history append rule from canitwo |
| `verdict_lists/{id}` | owner, or friend when `status != 'want'` or owner's `shareWantList` | owner; status in enum |
| `verdict_activity/{uid}/**` | owner | none |
| `verdict_feeds/{uid}/**` | owner | none |
| `verdict_titles/*` | signed in | none |
| `verdict_reports/*` | none | create by reporter only |
| `verdict_secrets/*` | none | none |

Rules tests must cover at least: a non-friend can't read ratings; a pending (not yet
accepted) request can't read ratings; prefs can't be read by the friend; the requester
can't accept their own request; activity, feeds, usernames and secrets are not
client-writable; rating history can't be rewritten.

---

## 8. Indexes (create in the console, list in README)

- `verdict_users`: `discoverable ASC, username ASC` (search prefix range).
- `verdict_ratings`: `uid ASC, updatedAt DESC` (profile ratings).
- `verdict_lists`: `uid ASC, status ASC, updatedAt DESC`.
- `verdict_activity/{uid}/titles`: `upCount DESC`; `watchingCount DESC, updatedAt DESC`
  (single-field may be enough; add composites when the console asks).
- `verdict_feeds/{uid}/items`: `at DESC` (single field).
- TTL policy on `verdict_feeds/*/items.expireAt`.

---

## 9. Tags (later phase; constants only in v1)

`src/constants/tags.js`, fixed ids with labels. A rating can have several (max 5).
No custom tags.

```js
export const TAGS = [
  { id: 'kids_movie_night',  label: 'Kids movie night', emoji: '🍿' },
  { id: 'fall_asleep_to',    label: 'Fall asleep to',   emoji: '😴' },
  { id: 'date_night',        label: 'Date night',       emoji: '🕯️' },
  { id: 'background_tv',     label: 'Background TV',    emoji: '📺' },
  { id: 'binge_worthy',      label: 'Binge-worthy',     emoji: '🔁' },
  { id: 'comfort_rewatch',   label: 'Comfort rewatch',  emoji: '🛋️' },
  { id: 'full_attention',    label: 'Needs full attention', emoji: '🧠' },
  { id: 'with_parents',      label: 'Watch with the parents', emoji: '👵' },
  { id: 'edge_of_seat',      label: 'Edge of your seat', emoji: '😬' },
];
```
When the phase arrives: tag picker on the Rate Sheet, `tags` added to activity map
entries, Title Detail line ("3 friends tagged *Fall asleep to*"), Discover tag rows.

---

## 10. Out of scope for v1

Tags UI, per-season ratings, "ask friends for a rec", contacts import, friends of
friends, avatars upload, universal links (v1 uses the `verdict://` scheme plus a
typed invite code), regions other than US, Android polish, monetization (if the app
ever charges, a TMDB commercial agreement is required first), notifications beyond
friend requests and accepts.

---

## 11. Build phases and acceptance checks

### Phase 1: Scaffold and auth
- Expo app in `apps/verdict`, versions matching `apps/roy`. `src/firebase.js` with RN
  auth persistence. Navigation skeleton (auth stack, onboarding stack, tabs with
  placeholder screens).
- Sign up, log in, log out, forgot password. Profile doc created on sign up.
- Functions codebase `verdict` registered in `firebase.json`; `verdictClaimUsername`.
- Onboarding step 1 (username, display name, discoverable).
- **Done when:** a new user can sign up, claim a unique username (a duplicate is
  rejected), restart the app and still be signed in, sign out and back in.

### Phase 2: Titles
- `verdictTmdb` with cache. Discover search and Trending. Title Detail with
  details and US providers. Services picker (onboarding step 2 and Settings).
- **Done when:** searching "the bear" shows the show; its detail page shows where it
  streams; a second open is served from `verdict_titles` (check logs).

### Phase 3: Ratings and lists
- Rate Sheet, RatingButtons, notes, history, "Still watching" label. List statuses and
  the Finished → confirm-rating prompt. ＋ tab flow. Profile tab lists. Onboarding
  quick rate (step 3).
- Rules for ratings and lists, with tests.
- **Done when:** rating, changing and un-rating work; history grows on every change;
  rules tests pass.

### Phase 4: Connections
- Search (`verdictSearchUsers`), requests (send, accept, decline, cancel), invites
  (create, share, QR, deep link, typed code, `verdictRedeemInvite`), Friends tab,
  Friend Profile (not connected and connected states), `verdictMutualCount`,
  remove friend, block, report. Push tokens and request/accept notifications.
  Onboarding step 4.
- Rules for connections, invites, prefs, with tests.
- **Done when:** two test accounts can connect via search and via invite code; a
  private account doesn't appear in search but can be reached by invite; the
  recipient gets a push for the request and the requester for the accept; blocking
  removes the connection and hides each from the other's search.

### Phase 5: Friend activity, feed, breakdown
- `verdictOnRatingWrite`, `verdictOnListWrite`, `verdictOnConnectionWrite` (backfill
  and cleanup). Feed tab. VerdictChip everywhere titles appear. Breakdown sheet.
  Discover "Friends recommend" and "Friends are watching". Star and mute.
- **Done when:** with accounts A, B, C all connected: B rates a title 👍 and C 👎, and A
  sees `👍 1 😐 0 👎 1` and both in the breakdown; A mutes C and sees `👍 1 😐 0 👎 0`,
  C disappears from A's feed and breakdown, and C can't tell; A stars B and B appears
  first; removing B as a friend clears B from A's chips and feed.

### Phase 6: Taste match, settings, deletion, polish
- Taste match on Friend Profile and in the Friends list. Agree / Disagree tab.
  Settings complete, including TMDB and JustWatch attribution. `verdictDeleteAccount`.
  Empty states, loading skeletons, error toasts, pull to refresh.
- EAS config (`eas.json`), app icon and splash placeholders, iOS bundle id.
- **Done when:** deleting an account removes every trace (verify with a script that
  scans the `verdict_*` collections for the uid); an EAS development build installs on
  a device.

### Phase 7 (later): Tags
See section 9.

---

## 12. Setup notes for the README

- TMDB: create an API account, copy the **v4 read access token**, store it in Firestore
  at `verdict_secrets/keys.tmdbReadToken` (or `TMDB_READ_TOKEN` for the emulator).
- Firebase: Email/Password sign-in is already enabled on the shared project if other
  apps use it; confirm in the console. Add an iOS app in the Firebase console for the
  bundle id and put the web config in `src/firebase.js` (same approach as sibling apps).
- Enable the TTL policy on `expireAt` for the feed items collection group.
- Deploy: `firebase deploy --only functions:verdict,firestore:rules`. Add a `verdict`
  target to `deploy.sh` following the `roy` and `weather` steps. No hosting target
  needed for v1.
