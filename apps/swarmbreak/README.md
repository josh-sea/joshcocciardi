# Swarmbreak

A top-down co-op alien shooter. Up to four marines sweep a dark station deck
by deck: destroy every nest, grab heavier guns, and get the whole squad onto
the exit pad. Six decks, and a boss at the bottom.

Live at `/projects/swarmbreak` (short link: `/swarm`).

Inspired by the overhead alien-blasting DOS games of the mid 90s. Everything
here (name, decks, creatures, weapons, art and sound) is original.

## Playing

**One computer.** Pick 1 to 4 marines on the title screen.

| Seat | Controls |
|---|---|
| Solo | WASD or arrows move, mouse aims, click or Space fires, Q/E, 1-5 or the wheel change weapon |
| Marine 1 (shared keyboard) | WASD move, Space or F fire, Left Shift holds your aim (strafe), Q/E weapon |
| Marine 2 (shared keyboard) | Arrows move, Enter or / fire, Right Shift or . holds aim, , weapon |
| Marines 3 and 4 | Gamepads: left stick moves, right stick aims, trigger or A fires, bumpers or Y change weapon |

Marines 1 and 2 also pick up gamepads 1 and 2 if they're plugged in.
Keyboard marines aim where they walk, and the game nudges that aim onto the
nearest bug in front of them, so eight directions are enough. Some cheaper
keyboards can't register lots of keys at once; if a key seems to stick, that's
the keyboard, and a gamepad fixes it.

**Online.** Everyone types the same lobby password and a name. Tick
"Two of us on this keyboard" to bring a second marine from the same computer.
The host (whoever made the lobby) picks the starting deck, swarm size and
friendly fire, then presses **Deploy squad**. **Copy invite link** puts the
password in the link's `#hash`, which the browser never sends to a server.

## Rules

- Each deck is locked until every **nest** is dead. Nests birth crawlers while
  a marine is near, so push in and burn them out.
- Then everyone still standing has to stand on the **exit pad** together.
- The squad shares **six respawns per deck**. A downed marine comes back after
  five seconds beside a teammate. Run out with everyone down and you retry the
  deck. Guns and ammo carry over between decks.
- **Friendly fire** is off by default. Turn it on for chaos, or if you want
  to settle something.

| Weapon | Notes |
|---|---|
| 1 Pulse Carbine | Never runs dry |
| 2 Scattergun | Eight pellets, brutal up close |
| 3 Torch | Short range, burns through a whole crowd |
| 4 Lance | Instant beam through everything in a line |
| 5 Boomtube | Rockets with splash (it can hurt you) |

| Swarm | Notes |
|---|---|
| Crawler | Fast, weak, many |
| Brute | Slow, armoured, hits hard |
| Spitter | Keeps its distance and lobs acid |
| Nest | Doesn't move; births crawlers |
| Matriarch | The last deck. Acid rings, broods, and gets angrier when hurt |

All the numbers are in `js/config.js` (`WEAPONS`, `ENEMIES`, `LEVELS`).

Balance check: a scripted bot that walks to the nearest nest and shoots
whatever it can see (perfect aim, no dodging) beats the whole campaign in 10
to 15 minutes as a pair, and stalls around deck 5 alone, at Normal swarm.

## Decks

Generated from `(level, seed)` in `js/map.js`: rooms, two-wide corridors, a
spanning tree plus a few loops. The start is the first room, the exit the
farthest on foot, and the nests fill in from the far end. Because the map
comes from two numbers, the host never sends it. The last deck is a fixed
arena for the boss.

## How the multiplayer works

Same approach as Tophat & Spears (Firebase, no new servers or bills):

- **Host-authoritative in a browser.** The host runs `js/sim.js` at 30 steps a
  second and writes a compact snapshot to the Realtime Database 10 times a
  second. Everyone else draws those snapshots about 120 ms in the past,
  blended, with shots flying on from the newest one.
- **Your own marine moves on your own screen** and tells the host where it is.
  The host accepts it if it's plausible (not in a wall, not too far).
- **Host hand-over.** The host saves the whole match every 2 s. If its tab
  goes, the longest-standing browser takes over from that save.
- **Hidden host tab.** A worker timer keeps the match ticking if the host
  switches tabs.

Room data lives at `swarm/rooms/{key}`, where `key` is PBKDF2 of the password
(`js/keys.js`). The rules in `database.rules.json` refuse to list rooms. See
the header of `js/net.js` for the shape of each node.

## Files

| File | What it is |
|---|---|
| `js/config.js` | Every tunable: weapons, swarm, decks, colours |
| `js/map.js` | Deck generator, walking-distance flood fill, collision, line of sight |
| `js/sim.js` | The match: marines, swarm AI, shots, pickups, goals, snapshots |
| `js/lobby.js` | Seats counted in marines, host hand-over |
| `js/keys.js` | Password to room key |
| `js/net.js` | Firebase: sign-in, presence, inputs, state |
| `js/input.js` | Keyboard halves, mouse and gamepads |
| `js/render.js` | Canvas drawing, darkness and torch light, particles, decals |
| `js/audio.js` | Sound effects synthesised with Web Audio |
| `js/game.js` | Screens, the loop, host and client jobs, HUD |

## Testing

```sh
node apps/portfolio/test/swarmbreak.test.mjs
```

Every deck on several seeds is rebuilt twice and walked (same map each time,
exit, nests, bugs and pickups all reachable), plus the rules: walls, shooting,
friendly fire on and off, pickups, respawns, the exit, losing and retrying,
the boss, a three-minute soak on every deck, snapshots through JSON with
Firebase's dropped empty arrays, a host hand-over save, and lobby seats.

To play a real multi-browser match locally against the Firebase emulators:

```sh
npx firebase-tools@13 emulators:start --only database,auth --project josh-cocciardi
cd apps/swarmbreak && python3 -m http.server 8765
# open http://localhost:8765/?emu in a few tabs
```

## Ideas not built yet

- Versus mode (deathmatch between marines)
- More hand-built decks, doors and keycards, destructible crates
- Music, a minimap, saved progress between sessions
- A subdomain (`swarm.joshcocciardi.com`) like the other games
