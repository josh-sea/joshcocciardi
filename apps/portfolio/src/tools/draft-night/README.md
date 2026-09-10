# Draft Night (`/tools/draft-night`)

A live draft board. Strike names as they come off the board and the clock, the
branches, and the roster all reprice against who is left.

## State

Two arrays drive everything: `gone` (names off the board, however they left)
and `mine` (names taken, in pick order). Every other view is derived.

Where those arrays live depends on sign-in:

| | config | draft state |
|---|---|---|
| signed out | `localStorage: dn.league.v1` | `localStorage: dn.draft.v1` |
| signed in | `draftnight_leagues/{id}` | same document |

Signed-out use is a first-class path, not a degraded one: the whole tool works
without an account, which is what makes the URL shareable. Signing in moves the
browser's draft into the account on first sign-in (once — `dn.importedAt`
records it) and creates the league if the account is empty, so "signed in"
never means "still writing to localStorage only".

## Leagues

`league.js` owns the config: team count, draft slot, roster slots, scoring.
Pick numbers, round count, starting lineup, and positional targets are all
derived from it, so the tool works for any seat in any snake draft.

Three presets, all editable after the fact:

- **John Jay FC** — the 10-team half-PPR league the pick tree was written for.
- **ESPN default** — 10 team, full PPR, 7 bench.
- **Custom** — start from a 12-team shape and change everything.

## The pick tree vs. the fallback

`data.js` holds a hand-written pick tree for one specific draft. `treeFits()`
gates it: 10 teams, slot 2, 14 rounds, half PPR. Any other league gets
`recommend.js` instead, which takes the best available player at a position
still short of its target and forces QB/TE/D-ST/K once there are only enough
picks left to fill them. The tree is deliberately not generalized — it encodes
judgments about specific players in a specific league, and stretching it to
other formats would make it confidently wrong.

## Firestore

One document per league in `draftnight_leagues`, holding both the config and
the draft. Rules are in the repo root `firestore.rules`: private to the owner,
ownership fixed at create.

Rules tests live in `apps/portfolio/test/draftnight-rules.test.mjs` — see
`apps/portfolio/test/README.md` for how to run them against the emulator.

## Refreshing the board

`data.js` carries a fixed 189-player board (ESPN 9/2 ranks with half-PPR and
injury adjustments) and news notes dated to one week. Both go stale. Replacing
`RAW` with a newer export is the whole update; nothing else reads ranks except
by `rk` order.
