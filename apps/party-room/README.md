# Party Room

Four party games for a video call, in the spirit of the ones everyone played
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

All the decks are in `js/decks.js` and are original, written for a family
table: Cam and Bo should be able to play every one.

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
| `js/room.js` | Codes, names, turn order, who is host. Pure |
| `js/forehead.js`, `js/trivia.js`, `js/sketch.js`, `js/chips.js` | The games. Pure |
| `js/engine.js` | Runs a game on the host's phone and writes it to the room |
| `js/net.js` | Firebase: sign-in, presence, the room |
| `js/app.js` | Home, lobby, the host loop, switching screens |
| `js/view-*.js` | Each game's screen |
| `js/ui.js` | Escaping, toasts, synthesised sounds |

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
