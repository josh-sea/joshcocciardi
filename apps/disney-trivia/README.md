# Disney trivia, Where Am I, and the Park Planner

Three tabs in one static page, served at `/projects/disney-trivia`. The
ticket book is the page itself; the other two are ES modules fetched the
first time their tab is opened, so the trivia half still loads with no
network at all.

`deploy.sh` copies this folder verbatim and deletes this README from the
published copy. There is no build step.

| | |
|---|---|
| `index.html` | the ticket book, its inline styles and script, plus the tab switcher at the bottom |
| `js/whereami.js` | the photo game (Firebase, lazy) |
| `js/planner.js` | the Park Planner screen (lazy) |
| `js/scaleui.js` | the "1 to 10" game screen (lazy) |
| `js/scale.js` | its topic builder and scoring. Pure, tested in node |
| `js/room.js` | rooms, roles and turn order. Pure, tested in node |
| `js/roomstore.js` | the Firebase layer for rooms |
| `js/park.js` | planner rules: walking, waits, scoring. Pure, tested in node |
| `js/curve.js` | each ride's hourly day curve, and whether now is a good moment. Pure |
| `js/parkdata.js` | ThemeParks.wiki client with a cache-first fallback |
| `js/music.js` / `js/musicui.js` | background music |
| `parks/attractions.json` | the committed ride catalogue |
| `scripts/seed-attractions.mjs` | rebuilds that catalogue |

Tests: `park.test.mjs`, `scale.test.mjs` and `whereami.test.mjs` under
`apps/portfolio/test/`. All three run in CI.

## 1 to 10

One person picks a secret number from 1 to 10, which is how much they like
things. The others ask about a category, and the picker answers with
something they would rate exactly that: ask for an EPCOT ride on an 8 and
you get Frozen Ever After, not Guardians and not Imagination. A few answers
in, everyone guesses.

**Everyone plays on their own phone.** Playing it round one device defeats
the point: if you are all stood together you would just talk. One person
starts a room and reads out a five-character code, the others join with it
and a name, and after that each screen shows exactly one thing to do.

### The secret, and why it is a database problem

Firestore can hide a document but not a field inside one, and every player
has to read the room document because the questions, the answers and the
turn order all live there. So the number is never in the room while the
round is running. It is committed to `scale_rooms/{code}/private/{uid}`,
which the rules hand to exactly one person, and copied into the room only
at the reveal.

The copy is checked against the commit rather than trusted, so a picker
cannot look at the guesses and then decide they meant a different number.
That costs one document read per reveal and settles an argument that would
otherwise have no answer.

`functions/test/scale-rules.test.mjs` proves all of that against the
emulator, including by mutation: remove `scale_` from the catch-all deny
list, or open up the private document, or drop the commit check, and the
suite fails.

### Other things worth keeping

- The topic builder is pure string composition: a subject (`desserts`,
  `queues`, `single rider lines`) crossed with a place (`in Magic Kingdom`,
  `in any park`, `at Disney Springs`). It stores nothing about actual
  desserts, because the players already know what the desserts are. A
  subject declares which kinds of place it accepts, so it never offers
  "Disney films in EPCOT", and all four parks reads as "any park".
- Room codes leave out `O`, `0`, `I`, `1` and `L`. Somebody is going to
  read one down a phone to a grandparent.
- Whose turn it is comes from one function, `whatNow()`, rather than being
  decided per screen. Four phones each working it out for themselves is the
  fastest way to break a turn-based game.
- **Every write that depends on existing state is a transaction.** Ask and
  answer used to rebuild the whole questions array from the snapshot that
  phone was holding, so two people acting at once meant one message was
  silently erased. That is what made the game feel like it was not syncing.
  `functions/test/scale-race.test.mjs` reproduces the old behaviour and
  proves the new one.
- The room listener runs with `includeMetadataChanges`, so the app can tell
  a live update from a cached one. A phone that has been asleep shows stale
  state that looks perfectly normal, which is why reloading seemed to be the
  fix; it now says "Not connected" and forces a read past the cache when the
  page comes back.
- Rejoining keeps your score. It used to write `{ name, score: 0 }` over
  your entry, so coming back after a reload reset you to nothing.
