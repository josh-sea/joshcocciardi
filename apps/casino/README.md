# Casino

Table games to learn on and to play with friends, for play money. Live at
`/projects/casino` (short link: `/casino`). Blackjack is the first table.

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

## How it works

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
the stats. Runs in CI.

The rules have their own suite against the database emulator:
`functions/test/casino-rules.test.mjs` (see `functions/test/README.md`).

To play a table with friends locally against the emulators:

```sh
npx firebase-tools@13 emulators:start --only database,auth --project josh-cocciardi
cd apps/casino && python3 -m http.server 8765
# open http://localhost:8765/?emu in a few windows (each is its own player)
```
