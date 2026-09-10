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
