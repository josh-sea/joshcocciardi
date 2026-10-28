# Party Room

Five party games for a video call, in the spirit of the ones everyone played
on Houseparty in 2020. Live at `/projects/party-room` (short link: `/party`).

One person taps **Start a room** and reads out the five-character code (or
taps **Invite people** to send a link). Everyone else joins on their own
phone. The host picks a game; the others just play.

| Game | How it plays |
|---|---|
| 🤳 **Forehead** | Hold the phone to your forehead, screen out. Everyone else gets you to say the word. Nod down when you get it, tip up to pass, one minute a turn. Every other phone in the room shows the same word, so people on the far end of the call can play along. Also playable on one phone with no room (**Play Forehead here**). Seven decks. |
| 🧠 **Trivia** | The same multiple-choice question on every phone. 100 points for right, up to 100 more for quick. Nine categories or everything, 5, 10 or 15 questions. |
| ✏️ **Quick Sketch** | One person picks a word (easy, medium or hard) and draws it. Everyone else watches it appear and types guesses. A near miss gets a private "so close!", a letter is revealed at 40% and 70% of the time, and the drawer scores for everyone who gets it. |
| 🥣 **Chips & Dip** | Two chips on the table ("Sticky" + "Famous"). Everyone but the judge plays the dip from their hand of five that goes best with both. The judge picks a favorite without knowing whose is whose. The judge changes every round; first to 3, 5 or 7 wins. |
| 🔤 **Word Race** | Houseparty's Word Racers. Eight letters on a wheel, the same on every phone, and 90 seconds to swipe out as many words as you can (tap, or type on a laptop, works too). Longer words score far more (100 for three letters up to 1,600 for all eight), and being first in the round to find a 5, 6, 7 or 8-letter word earns a bonus, announced to everyone as it happens. Best score wins the round 👑; three or five rounds. |

All the decks are in `js/decks.js` and are original, written for a family
table: Cam and Bo should be able to play every one. Word Race's puzzles are
generated from the SCOWL word lists (see below and `CREDITS.md`).

## Video

Tap **Turn on video** in a room to see and hear everyone, up to 6 people.
The strip sits above the lobby and every game, smaller during a game, with
buttons to mute, turn the camera off, or leave the call. It's optional:
the games work the same without it.

Video goes **phone to phone** (WebRTC), never through Firebase. Firebase
only carries the few KB of setup messages each pair needs to find each
other, so the call costs nothing beyond the free allowance.

- Each phone sends its video to every other phone, which is why the call
  stops at 6: past that, phones get hot and choppy. The seventh person is
  told it's full and can still play.
- Low quality on purpose: 320x240 at 15 fps, capped at 250 kbps per stream.
- **No relay server (TURN), on purpose**, to keep the cost at zero. Most
  home Wi-Fi connects directly. A pair that can't (some cellular carriers,
  strict work Wi-Fi) shows "Video unavailable" for each other and carries
  on playing.
- iPhones ask for camera and mic permission when you tap Turn on video. A
  Home Screen install asks more often than Safari does.

Setup messages live at `party/rooms/{code}/rtc/{uid}`, readable only by who
they're for and deleted as soon as they're read; who is on the call is
`media/{uid}`. Both are removed by the server when a phone disconnects.
Who connects to whom is `js/callplan.js` (pure, tested in node);
`js/call.js` is the WebRTC side and `js/view-call.js` the strip.

## How it works

The host's phone runs the game. Every other phone only says what it did
("I picked B", "I guessed cake") by posting to the room's inbox, and the
host's phone deals, keeps time, checks answers and keeps score. If the
host's phone drops out, whoever has been in the room longest takes over
from what the room and the vault hold, so the game carries on.

Each game is three pure functions, `start`, `act` and `tick`, over a world
of `{ pub, vault, secret, fx }` (see `js/engine.js`):

- `pub` is what everyone sees, written to `game`
- `vault` is what only the host may see: the trivia answer, the word being
  drawn, everyone's hands, who played which dip
- `secret[uid]` is one player's eyes only: a hand of dips, the sketch word
  for the drawer and for anyone who has guessed it
- `fx` is side effects for the host to carry out: clear the drawing, send
  someone a private note

The drawing is the one thing that skips the host: the drawer writes strokes
straight to the room, in chunks every 70 ms, on a 1000 by 750 grid so a
line drawn on a phone lands in the same place on a laptop.

Timers run off deadlines in the server's clock (`.info/serverTimeOffset`),
so every phone agrees on when time is up.

### Room data

`party/rooms/{code}` in the Realtime Database. See the header of
`js/net.js` for the shape. The rules (`database.rules.json` at the repo
root) refuse to list rooms, keep the vault to whoever is host right now,
keep each secret and note to its owner, let only the host write the game
and only the drawer touch the drawing, and hand the host's seat over only
once the host has gone offline.

## Files

| File | What it is |
|---|---|
| `js/decks.js` | Every card, question and word |
| `js/race-puzzles.js` | Word Race's 400 puzzles. Generated, do not edit |
| `scripts/build-race.mjs` | Regenerates them from SCOWL |
| `js/room.js` | Codes, names, turn order, who is host. Pure |
| `js/forehead.js`, `js/trivia.js`, `js/sketch.js`, `js/chips.js`, `js/race.js` | The games. Pure |
| `js/engine.js` | Runs a game on the host's phone and writes it to the room |
| `js/net.js` | Firebase: sign-in, presence, the room, call setup messages |
| `js/callplan.js` | Who is on the video call and who calls whom. Pure |
| `js/call.js`, `js/view-call.js` | The video call (WebRTC) and its strip |
| `js/app.js` | Home, lobby, the host loop, switching screens |
| `js/view-*.js` | Each game's screen |
| `js/ui.js` | Escaping, toasts, synthesised sounds |

## Word Race puzzles

Each puzzle is a common eight-letter word, scrambled, plus every word its
letters make. The answers are worked out ahead of time, so the game ships
no dictionary: the host checks a word against the puzzle's own list.

- **common** answers come from SCOWL's two most common sizes (10 and 20).
  They make up the "every word" list at the end of a round.
- **rare** answers (sizes 35 to 50, like "tarn" or "gelt") still score, and
  show up at the reveal only if somebody found them, so nobody feels bad
  for missing them.
- Anything on the LDNOOBW list, plus a short extra list of words you don't
  want on Grammy's phone, is left out entirely.

To change the word lists or the filters, edit the script and rebuild:

```sh
npm --prefix /tmp/words install --no-save wordlist-english naughty-words
node apps/party-room/scripts/build-race.mjs /tmp/words/node_modules
```

It is seeded, so the same inputs make the same file.

## Testing

```sh
node apps/portfolio/test/party-room.test.mjs
```

Plays every game start to finish in node: dealing, answering, guessing,
judging, timeouts, players leaving halfway and arriving late, a host
hand-over, and every game through a fake database round trip at every
step (Firebase drops empty objects and arrays, so every read is
defensive). Also the tilt maths and the decks. Runs in CI.

The rules have their own suite against the database emulator:
`functions/test/party-rules.test.mjs` (see `functions/test/README.md`).

To play a real multi-phone game locally against the emulators:

```sh
npx firebase-tools@13 emulators:start --only database,auth --project josh-cocciardi
cd apps/party-room && python3 -m http.server 8765
# open http://localhost:8765/?emu in a few tabs (each tab is its own player)
```

Forehead's tilt needs a real phone. On iOS it asks for motion access when
you tap **I'm ready**; without it, tap the right half of the screen for
got it and the left half to pass.
