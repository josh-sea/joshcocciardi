# Casino

Table games to learn on and to play with friends, for play money. Live at
`/projects/casino` (short link: `/casino`). Two tables so far: blackjack and
craps. Your bankroll is picked once on the home screen and used by both.

## Blackjack

Pick a bankroll ($100, $500, $1,000, $5,000 or any amount) and either:

- **Practice**: just you and the dealer, on your phone alone. No network.
  The shoe, your chips and your place survive a reload; **New session**
  starts over.
- **Open a table** for friends: up to 5 seats plus the dealer. Read out the
  five-character code or tap **Invite**. Anyone past five watches until a
  seat opens. Each player brings their own bankroll.

Rules are set on the home screen (or in ⚙️ between hands; at a friends table
only the host can change them): 1, 2, 4, 6 or 8 decks, dealer stands or hits
soft 17, blackjack pays 3:2 or 6:5, double after split, late surrender,
minimum bet. The dealer peeks for blackjack with an ace or ten showing. You
can split to four hands; split aces get one card each. The cut card sits at
75% of the shoe.

### Learning aids

| Aid | What it does |
|---|---|
| **Hints** (on by default) | Shows the basic-strategy move and why, and lights up that button. |
| **Coach** (on by default) | After every move: right or wrong, what the chart says, and what a mistake costs in cents per dollar. Insurance too. |
| **Odds drawer** | Swipe in from the right edge (or tap **Odds**). *Odds*: what every move is worth right now from the cards left in the shoe, your chance to bust, win/push/lose if you stand, where the dealer finishes; between hands, the house edge of these rules and how often each dealer card busts; insurance maths when the dealer shows an ace. *Chart*: the full strategy chart for these rules with your hand highlighted. *Count*: Hi-Lo running and true count, what is left in the shoe compared to a fresh one, and a "quiz me". On a wide screen it can be pinned open. |
| **Show the count** | Keeps the running and true count on the table. Leave it off to count in your head and check yourself in the drawer. |
| **Count plays** | Hints and the coach use the Illustrious 18 and Fab 4: the plays that change with the true count, insurance at +3 included. |
| **Strategy drill** | A hand and a dealer card; pick the move. Shows why, and the value of every option. Hands you miss come back a few questions later until you get them. Filter to hard, soft or pairs. |
| **Count drill** | Cards flash by at three speeds; say the running count. A whole deck counts back to zero. Also true-count conversion questions. |
| **Stats** | Session and all-time: hands, net, chart accuracy, the cost of your mistakes, bankroll over time, your worst chart cells ("leaks") with a button to drill exactly those, and recent mistakes. Kept on this device only. |

Keyboard: H hit, S stand, D double, P split, R surrender, I/N insurance,
Space deal, O odds drawer.

## Craps

For someone who has never played. Start with **Learn to play**: nine short
lessons (the 36 ways, the come-out, the point, odds, come bets, place bets,
don't pass, the field and the middle, how to play it well), each with real
dice to roll on the page and a question to check it stuck. The last one
drops you at a practice table with the narrator on.

- **Practice**: you are always the shooter. Your chips, bets and the point
  survive a reload.
- **Tables with friends**: up to 8 at the rail. The dice pass to the next
  player on a seven-out, or if the shooter steps away; a shooter who stalls
  for 40 seconds has the dice rolled for them.

Bets: pass line and don't pass with odds, come and don't come (they move to
their number, with odds), place 4 to 10, field, hardways, and the one-roll
props (any 7, any craps, yo, aces, ace-deuce, twelve). Rules: odds 1x, 2x,
3-4-5x, 5x or 10x; field 12 pays 3:1 or 2:1; minimum bet. Place bets, come
odds and hardways are off on the come-out, as at most casinos. Winning bets
are paid and stay up; odds and come bets on a number come back with the win.

### The table

Craps plays on a real 3D table (three.js): felt with the full layout
printed on it, wooden rails, and a back wall with rubber pyramids. **Flick
up** from the bottom of the table to throw (or tap Roll); how hard and which
way you flick decides how the dice fly. They roll with rigid-body physics
(cannon-es), click off the felt and the wall, and settle. **Tap the felt** to
bet; a number box asks whether you mean a place bet or odds on your come
bet. Chips slide out from your rail, get swept to the dealer when they lose,
and get paid beside the bet before coming back to you. The puck moves to the
point. Everyone else's chips show as smaller stacks.

The dice are fair: the engine decides what they show, every phone replays
the shooter's actual flick through the same simulation, and the faces are
numbered once the dice settle so the face that landed up shows the engine's
number (opposite faces still add to 7). See `js/dice-physics.js`.

The **stickman** calls every roll in the table's slang ("Eighter from
Decatur, the point is eight!", "Yo-leven!", "Seven out, line away, pay the
don'ts"), out loud if the phone has a voice, and the **rail** cheers, groans
and heckles in speech bubbles, with cheers and groans to match. At a table
with friends, every phone hears the same calls.

Settings turn off the 3D table (for the simple stacked layout), the voice,
or the narrator. Without WebGL the stacked layout is used.

### Learning aids

| Aid | What it does |
|---|---|
| **Edge on every spot** | Each bet on the layout shows its house edge, green (odds, 0%) through red (any 7, 16.7%). |
| **Smart bets** | One tap for the good plays: pass line, max odds behind everything, a come bet with odds, place 6 & 8 in $6 units, don't pass. |
| **Hints** | Nudges at the right moment: "take odds now", "your come bet moved to the 9, back it", "place the 6 in multiples of $6", and a warning naming the worst bet you have down. |
| **Narrator** | Every roll in plain English ("9. The point is still 6: nothing happens to the pass line"), then what it did to each of your bets and your net. |
| **Coach** | A note the first time you put money on a high-edge bet, and when you first take odds. |
| **Odds drawer** | *Your bets*: for each bet, the chance it wins or loses on the next roll, the chance it wins in the end, and what it is worth from here; plus what your bets cost in house edge. *Edges*: every bet ranked. *Dice*: the 36 ways, point-before-7 chances against the odds payouts, and how the last rolls compare (the dice have no memory). |
| **Payouts drill** | "$30 on place 6 wins. What's the pay?" with the working shown. The maths dealers learn. |
| **Stats** | Rolls, net, and the **edge you paid**: every settled bet times its house edge, which is what a betting style really costs once luck evens out. Also how much of your action was on good bets, and net by bet. |

Keyboard: Space rolls, O opens the drawer.

## How it works

`js/craps.js` is craps as the same kind of pure state machine, run by the
same Host. `js/craps-odds.js` works every edge, chance and payout out from
the 36 ways rather than typing them in, and the tests check those against
the published figures. `js/craps-lessons.js` is the tutorial as data.

`js/blackjack.js` is the whole game as three pure functions, `start`,
`act` and `tick`, over `{ pub, vault }`: `pub` is the table everyone sees,
`vault` the shoe and the hole card. `js/host.js` runs them and writes the
result. At a practice table it writes to memory; at a friends table the
host's phone writes to the Realtime Database and everyone else posts their
moves to the table's inbox (`js/net.js`), as in Party Room. If the host's
phone drops out, whoever has been at the table longest picks it up from the
same shoe. Friends tables have timers (20 s to bet once someone is ready,
12 s for insurance, 30 s a turn, then you stand); practice waits for you.

The odds come from `js/odds.js`, which works out every move's expected value
from the composition of the cards still in the shoe. The strategy chart in
`js/strategy.js` is written out by hand, the way it is printed on a card;
the test suite checks every cell of it against the odds engine, for both
soft-17 rules.

### Table data

`casino/tables/{code}` in the Realtime Database: `meta`, `players`, `game`,
`vault`, `inbox`. See the header of `js/net.js`. The rules
(`database.rules.json` at the repo root) refuse to list tables, keep the
vault to whoever is host right now, let only the host write the table, and
hand the host's seat over only once the host has gone offline.

## Files

| File | What it is |
|---|---|
| `js/cards.js` | Cards, shoes, hand totals, Hi-Lo. Pure |
| `js/strategy.js` | The chart, count deviations, the reason for each move. Pure |
| `js/odds.js` | Dealer outcomes, move values, insurance, house edge. Pure |
| `js/blackjack.js` | The game. Pure |
| `js/craps.js`, `js/craps-odds.js`, `js/craps-lessons.js` | Craps: the game, its maths and advice, the tutorial. Pure |
| `js/craps-view.js`, `js/craps-learn.js` | The craps table and drawer; the tutorial and payouts drill |
| `js/craps-table3d.js` | The 3D table: felt, chips, puck, dice playback, tap and flick. Loaded on demand |
| `js/dice-physics.js` | The throw, simulated with cannon-es, and the face numbering |
| `js/craps-voice.js` | The stickman's calls, the rail's shouts, the slang. Pure |
| `js/host.js` | Runs the game and writes it out |
| `js/stats.js`, `js/drills.js`, `js/lobby.js` | Your record, the trainers' questions, table codes. Pure |
| `js/net.js` | Firebase: sign-in, presence, the table |
| `js/app.js` | Screens, settings, the coach |
| `js/table.js`, `js/drawer.js`, `js/trainers.js` | The table, the odds drawer, the drills and stats screens |
| `js/ui.js` | Money, cards, toasts, synthesised sounds |

## Testing

```sh
node apps/portfolio/test/casino.test.mjs
```

Deals from rigged shoes to check every payout (3:2 and 6:5 blackjack,
insurance, even money, double, split and double after split, split aces,
surrender, busts), the dealer on soft 17 both ways, the peek, bet limits,
the cut card, seat order, turn and betting timers, a player whose phone
dies mid-hand, a new host resuming after a database round trip, and 3,000
rounds of random play at a three-seat table where the chips must always add
up. Also the chart against the odds engine, the count plays, the drills and
the stats.

Craps is checked roll by roll with forced dice: every bet's win, loss,
push and move, odds and lay payouts, bets that are off on the come-out,
rounding, bet limits and contract bets, shooters passing the dice, the
roll timer, a table resumed from the database, and 20,000 random rolls
where bank plus chips on the table must always equal buy-in plus winnings.
Every house edge is checked against the published figure. The dice face
numbering, throw clamping and the stickman's calls are checked too. With
cannon-es installed (`npm i cannon-es`, or `CANNON_ES=<path to
cannon-es.js>`) the suite also throws 120 dice for real: every one settles
flat on the table, shows the engine's numbers, finishes inside the tumble
time, and plays out identically from the same throw. Runs in CI (the
physics part is skipped there).

The rules have their own suite against the database emulator:
`functions/test/casino-rules.test.mjs` (see `functions/test/README.md`).

To play a table with friends locally against the emulators:

```sh
npx firebase-tools@13 emulators:start --only database,auth --project josh-cocciardi
cd apps/casino && python3 -m http.server 8765
# open http://localhost:8765/?emu in a few windows (each is its own player)
```
