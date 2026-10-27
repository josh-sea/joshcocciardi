# Function tests

The root `firebase.json` now has two functions codebases. Before starting the
functions emulator from the repo root, build the EzPayze one once:
`npm --prefix apps/ezpayze/functions ci && npm --prefix apps/ezpayze/functions run build`.

## `espn-proxy.test.mjs`

Exercises the `espnFantasy` callable against the emulator suite: its auth gate,
its input validation (view allowlist, numeric-only ids so no path traversal or
SSRF, season range, filter size), the real round trip to ESPN, and the promise
that a cookie value never appears in an error response.

The ESPN calls are real. Without valid cookies ESPN answers 401, which is
exactly what the test asserts on — it proves the whole pipeline works, short of
a successful private-league read.

```sh
# from the repo root, in one terminal
firebase emulators:start --only auth,firestore,functions --project josh-cocciardi

# in another
node functions/test/espn-proxy.test.mjs
```

Exits non-zero if any case fails.

## `seasonalbox-runner.test.mjs`

Runs the Seasonal Box agent runtime end to end (runner, tools, executors, and
stage machine) against the Firestore and Storage emulators, with a local fake
of the Claude Messages API that streams scripted replies. No API key and no
spend. Covers a full run from queue to brief, the request shape per model
tier, prompt-cache breakpoints, taste-note injection, append-only replay, the
ledger and counters, approval levels and executors, the season budget, budget
pause and continue, cancel, duplicate trigger delivery, resume after a failed
call, and the heartbeat.

```sh
# from the repo root, in one terminal
firebase emulators:start --only firestore,storage --project josh-cocciardi

# in another
cd functions && npm ci
node test/seasonalbox-runner.test.mjs
```

Exits non-zero if any case fails.

## `whereami-rules.test.mjs`

Exercises the Firestore rules behind Where Am I's private photo decks against
the emulator: that the deck, its rounds and its photos are unreadable by a
signed-in stranger, that the key pointers can be fetched by exact id but never
listed (listing them would hand over every deck without a password), that
joining requires naming a valid key that points at that deck, and that joining
only ever adds the joiner.

The case that matters most is the first block. `firestore.rules` ends with a
rule granting any signed-in user read and write on any collection NOT named in
a deny list, so a new app is wide open until its prefix is added there. Delete
the `whereami_.*` line from that list and the first five cases fail.

```sh
# from the repo root, in one terminal
firebase emulators:start --only firestore --project whereami-rules-test

# in another
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test/whereami-rules.test.mjs
```

Needs `@firebase/rules-unit-testing` and `firebase` on the module path.
Exits non-zero if any case fails.

## `readingbuddy-file.test.mjs`

Exercises `readingBuddyFile`, the function My Reading Buddy's video export
reads page photos and recordings through (same-origin at
`/api/readingbuddy/file`, because the bucket has no CORS policy): no token,
a bad token, an unverified email account, a stranger, and a shelf that
doesn't exist are all refused; a member gets the file byte for byte with its
type, whatever the case of their email; paths outside
`readingbuddy/{shelf}/{book}/{file}` are rejected; a missing file is 404 and
a file that isn't a photo or recording is 415.

The function has to see the same default bucket the app uploads to. Without
credentials the functions emulator falls back to `<project>.appspot.com`, so
set it explicitly:

```sh
# from the repo root, in one terminal
STORAGE_BUCKET_URL=josh-cocciardi.firebasestorage.app \
  firebase emulators:start --only auth,firestore,storage,functions --project josh-cocciardi

# in another
node functions/test/readingbuddy-file.test.mjs
```

## `scale-rules.test.mjs`

The security rules behind "1 to 10" rooms, against the Firestore emulator.

The whole game is "exactly one person knows the number", and every other
player has to be able to read the room document, so the only thing keeping
the number secret is a rule. This checks that nobody but the picker can read
the private document holding it, that the number revealed at the end is the
one committed at the start, that joining a room cannot shove the other
players out, and that the catch-all at the bottom of `firestore.rules` does
not reach `scale_` collections.

Verified by mutation: dropping `scale_` from the deny list, opening the
private document, or removing the commit check each make it fail.

```sh
# from the repo root, in one terminal
npx firebase-tools@13 emulators:start --only firestore --project scale-rules-test
# in another
node functions/test/scale-rules.test.mjs
```

Needs `@firebase/rules-unit-testing` and `firebase`, which are not in
`functions/package.json` (they are test-only and the deploy does not want
them): `npm --prefix functions install --no-save @firebase/rules-unit-testing firebase`.

## `scale-race.test.mjs`

Concurrent writes in a "1 to 10" room, against the Firestore emulator.

Written after actually playing the game and finding it felt dead. The cause
was not a slow database: ask and answer each rebuilt the whole `questions`
array from whatever snapshot that phone happened to be holding and wrote it
back, so two people acting within a second of each other meant the later
write replaced the earlier one wholesale. A question would simply vanish,
which from the inside is indistinguishable from the app not syncing at all.

The first assertion reproduces the old behaviour deliberately, so the suite
demonstrates the bug it exists to prevent. The rest exercise the shipped
transaction logic: simultaneous questions, a full exchange staying in order,
double-tapped answers landing once, writes into a round that has moved on,
and that rejoining a room keeps your score instead of resetting it to zero.

Same setup as `scale-rules.test.mjs`.
