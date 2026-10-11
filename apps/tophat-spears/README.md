# Tophat & Spears

A co-op RTS and FPS in the same match. One player is the **Tophat**, commanding
marines from above. Up to four **Spears** play those marines in first person and
hop between bodies. Ten waves of swarm come over the ridge, and they don't wait
for you to finish the last one. Keep the relay standing.

Live at `/projects/tophat-spears` (short link: `/tophat`).

## Playing with friends

1. Everyone opens the page and types the **same lobby password**, then a name.
2. Spear seats fill first. Tap **Be Tophat** to take command. If someone already
   has it, they get a popup asking to switch.
3. The host (whoever made the lobby, shown with a Host tag) presses **Start match**.
   Open Spear seats are played by AI.
4. **Copy invite link** puts the password in the link's `#hash`, which the
   browser never sends to a server. Only send it to friends.

Phones and tablets work too (landscape is best). See `js/touch.js`:

- **Tophat:** tap marines or a squad button to select, tap the ground to send
  them. One finger drags the map, two fingers pinch to zoom. Patrol or Hold
  then tap; Box turns the next drag into a selection box. All and Clear do
  what they say.
- **Spear:** left thumb is a floating joystick, right thumb drags to look.
  Hold Fire to shoot (drag it to keep aiming), tap Hop while aiming at a
  marine. Jump, and Sprint as a toggle. A light aim assist pulls the
  crosshair onto a bug that's already very close to it.

No accounts. Each tab signs in anonymously, so two tabs on one laptop are two
players and a reload keeps your seat. **Practice solo** runs offline with the
prototype's Tab swap between seats.

## The map

North is where the swarm comes from; the relay is at the south end.

- **Bluffs** stand against the west and east walls, about 9 m up with sheer
  cliffs all round. Each has one ramp, cut into its inner face and climbing
  north from the base side. Getting up there is a long walk for soldiers and
  bugs alike, and from the top you outrange everything below (high ground adds
  up to 6 m of range). Bugs that can't reach you up there prefer targets on
  their own level.
- **Buildings**: two bunkers in front of the relay (4 inside), an outpost on
  the ridge crest (6 on its roof) and a watchtower on each bluff (2 on a
  platform 6 m up). Soldiers inside get extra range and heal slowly, and the
  building takes the hits instead of them (at half damage). If it falls,
  everyone is thrown out. Buildings patch themselves up when nothing is
  attacking them, and a wrecked one is rebuilt after a quiet minute.
  - Tophat: right-click (or tap) a building with soldiers selected to send them
    in. Any other move order brings them back out; Hold keeps them inside.
  - Spear: walk up to the door and press **G** (or tap **Enter**). Inside you
    hold your firing slot: look and shoot, no walking. **G** again to leave.
    You can also hop straight into a soldier who is already inside.
- Units find their own way round the cliffs and up the ramps (`route()` in
  `js/map.js`), and nothing the AI moves can climb a cliff. Spears can't
  either, jumping included.

## Difficulty

Each wave arrives over about half a minute, thickening toward the end, and
the next starts six seconds after the last of it is out, so anything you
don't kill stacks up. Every wave is bigger than the one before and its bugs
have more health (+7% per wave). The last wave brings extra Brutes.

Balance is checked with a headless soak of the simulation (5 to 8 seeds each):

| Setup | Result at 100% swarm |
|---|---|
| AI alone, no orders | always loses, around wave 6 to 7 of 10 |
| Scripted Tophat (bunkers and towers manned, stim on contact) plus 4 AI-driven Spear bodies | loses later, around wave 8 |

Real Spears aim better than the AI and the Tophat can do far more than the
script, so a good team gets further. If it's too much, the host can turn
**Swarm size** down in Tune (50% to 150%): at 60% the scripted team reaches
the final wave every time.

## Units

Soldiers (Spears can hop into any of them, and play its weapon):

| Unit | HP | Weapon | Notes |
|---|---|---|---|
| Marine | 100 | Machine gun, 4-round bursts | Stims |
| Torch | 130 | Flamethrower, burns every bug in a short cone | Stims |
| Shade | 70 | Sniper rifle, one heavy shot | Sees burrowed bugs; right-click to scope |
| Strider | 320 | Twin cannons | Walker mech, slow, tall eye line |

**Stim** (Tophat: T or the Stim button; Spear: F or the Stim button) costs 10 HP
and gives 8 s of 1.5x fire rate and 1.4x speed. Marines and Torches only.

Swarm: **Lings** (fast melee), **Brutes** (tanky melee), **Spitters** (stop
at range and spit acid, from wave 2) and **Burrowers** (dig in, then send a
line of spikes through every soldier in front of them, from wave 3).

Squads start mixed (Alpha: 3 Marines and a Torch; Bravo: 2 Marines, a
Torch and a Shade; Charlie: 2 Marines, a Shade and a Strider) and
reinforcements rotate through the types. All the numbers are in
`js/config.js` (`MTYPES`, `BUGT`, `STIM`).

## Graphics

- **Three.js 0.169** as ES modules from jsDelivr (import map in `index.html`),
  with ACES tone mapping. Bloom on desktop only.
- **Animated models** (`models/`, all CC0 by Quaternius, see `models/CREDITS.md`):
  armored troopers for Marines, Torches and Shades (one rig, different paint,
  helmets, plates, tanks and guns), a rusty walker for the Strider, and two
  alien crawlers tinted and scaled into the four swarm types. They were
  trimmed to the animations the game uses and compressed with glTF-Transform
  (meshopt + WebP), about 1.35 MB together. Until they load, or if they
  can't, the old low-poly shapes stand in.
- **Effects** (`js/fx.js`): pooled particles for the flamethrower (a rolling
  fireball that turns to smoke), muzzle flashes, sparks, dust, smoke, acid
  and bug ichor; moving tracers, sniper beams and cannon rounds with small
  explosions; a few reusable lights for flashes and fire. Phones get fewer
  particles, no bloom and no unit shadows.

To refresh a model: convert with three.js FBXLoader/GLTFLoader + GLTFExporter
(height 1, feet at 0), then `npx @gltf-transform/cli optimize in.glb out.glb
--compress meshopt --texture-compress webp --texture-size 1024`.

## How the multiplayer works

The handoff plan suggested Colyseus on Fly.io. We went with Firebase instead,
because it was already set up for this site and ships through the normal
merge-to-deploy pipeline with no new accounts or bills. The tradeoffs:

- **Host-authoritative in a browser.** The lobby's host runs `js/sim.js` and
  writes a compact snapshot to the Realtime Database about 10 times a second.
  Everyone else draws those snapshots about 120 ms in the past, blending between
  them. If the host leaves, the longest-standing player takes over from the last
  full save (written every 2 s), so the match keeps going.
- **Spears move locally.** Your own body never waits on the network. The host
  eases the body toward your reported pose. Shots are raycast on the shooter's
  screen (favour the shooter) and the host checks fire rate, range and that the
  bug is still alive. Hops and redeploys are re-checked on the host, including a
  line-of-sight test against the terrain and rocks.
- **Hidden host tab.** A worker timer keeps the match ticking if the host
  alt-tabs.
- Latency is roughly 50 to 150 ms through Firebase. Fine for co-op against AI.
  For PvP or big player counts, move `sim.js` onto a real server (Colyseus,
  PartyKit or a Durable Object). It has no DOM or Three.js, so it ports as is.

### Room data

`tophat/rooms/{key}` in the Realtime Database, where `key` is PBKDF2 of the
password (`js/keys.js`). The rules (`database.rules.json` at the repo root)
refuse to list rooms, so you can only reach a room whose password you know.
See the header of `js/net.js` for the shape of each node.

## Files

| File | What it is |
|---|---|
| `js/config.js` | Tunables (`DEFAULTS`, the Tune sliders) and fixed numbers |
| `js/map.js` | Height function, bluffs and ramps, buildings, routes round the cliffs, rocks and spires, collision, line of sight |
| `js/sim.js` | The match: AI, swarm, waves, buildings, leash, hops, deaths, snapshots |
| `js/lobby.js` | Seat rules: Spears first, Tophat swaps, host takeover |
| `js/keys.js` | Password to room key |
| `js/net.js` | Firebase: sign-in, presence, seats, commands, state |
| `js/render.js` | Three.js scene, terrain, unit meshes, bloom |
| `js/units.js` | Animated unit models: dressing, held weapons, animation states |
| `js/fx.js` | Particles, tracers, beams and flash lights |
| `js/game.js` | Screens, input, HUD, host loop, client interpolation |
| `js/touch.js` | Touch controls: Tophat gestures, Spear joystick and buttons |
| `prototype.html` | The original single-player prototype, kept for reference (not deployed) |

## Testing

```sh
node apps/portfolio/test/tophat-spears.test.mjs
```

Runs the rules and seat logic in Node (death timer, leash, hop checks, slope
limit, wire format through a JSON round trip, host takeover, seat assignment).

To play a real multi-browser match locally against the Firebase emulators:

```sh
npx firebase-tools@13 emulators:start --only database,auth --project josh-cocciardi
cd apps/tophat-spears && python3 -m http.server 8765
# open http://localhost:8765/?emu in a few tabs
```

## Changes from the prototype

- Multiplayer: each player has one seat. The Tab swap is solo-only.
- A body owned by a connected Spear is always driven by that Spear. If they
  disconnect, it runs on AI but stays reserved for them.
- AI marines only shoot what they can see.
- Spears can't walk up ground steeper than about 42 degrees.
- Tuning is set by the host in the lobby and locked during the match.

Still open from the handoff: sound, terrain textures and reloads.
