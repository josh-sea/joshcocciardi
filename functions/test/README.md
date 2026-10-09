# Function tests

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
