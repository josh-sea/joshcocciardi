# Crowd Cannon

A 3D crowd shooter for phones. Slide a cannon along the bottom of the track,
hold to fire a stream of little blue runners, and send them through gates that
multiply them (`×2`, `×3`) or add to them (`+4`). The red army keeps pouring
out of its fort at the far end; blue and red trade one for one wherever they
meet. Knock the fort's health to zero before they break your wall.

Live at `/projects/crowd-cannon` (short link: `/cannon`).

A take on the "multiply your crowd through gates" genre of mobile games. The
name, levels, characters, art and sounds are all original.

## Playing

| | Phone | Keyboard |
|---|---|---|
| Fire | Hold anywhere | Hold Space |
| Aim | Slide your finger | Arrows or A/D |

- **Gates.** Each runner can use each gate once, and the clones a gate makes
  have already used it. Some gates sweep side to side. Gates always copy a
  unit as plain runners.
- **Barricades** (from level 2) block one side of the track and show their hit
  points. Every unit that runs into one spends itself on it. Break it and the
  gold bonus gate behind it (`×3`, `+8` and up) is yours.
- **Champion.** Every shot fills the meter. When it is full, the next shot is a
  big gold champion that ploughs through red runners and hits the fort hard.
- **Bruisers** (unlock in the shop) are big white fluffy runners that take
  several hits. **Bombers** (unlock) are walking bombs that blow up a pack of
  red on contact and crack barricades. Each level of either makes the cannon
  fire one more often.
- **Their army.** Grunts pour out in packed rushes, **brutes** (from level 2)
  take many hits, and giant green **ogres** (from level 3) shrug off dozens of
  runners and smash 8 points off your wall. They shrink as they are hurt.
- **Boss levels.** Every fifth level has a bigger fort, more ogres and double
  the coins.
- **Spinners** (from level 4) knock out runners and bombers. Champions and
  bruisers shrug them off.
- **Coins.** A win pays the level's reward plus a bonus for an unhurt wall. A
  loss still pays a share for the damage you did.
- **Shop.** Cannon: fire rate, double shot, charge speed, thick wall, head
  start. Squad: champion, bruisers, bombers.

Progress, coins and upgrades are saved in the browser. `#level=7` in the
address jumps to a level, for testing.

## Files

| File | What |
|---|---|
| `js/logic.js` | Pure rules: level generation, gate and spinner maths, upgrades, saves |
| `js/game.js` | three.js scene and simulation: instanced crowds, spatial hash, combat |
| `js/audio.js` | Synthesised sound effects (Web Audio, nothing downloaded) |
| `js/main.js` | Screens, HUD, shop, saving |

Every crowd is one `InstancedMesh` (one draw call for up to 1,500 runners),
with matrices written straight into the instance buffer each frame. Collisions
use a 1-unit spatial hash over the track.

## Tests

```sh
node apps/portfolio/test/crowd-cannon.test.mjs
```

No install needed. three.js loads from jsDelivr through an import map, the same
version Casino and Tophat & Spears use.

## Deploy

```sh
./deploy.sh cannon
```

Static copy, no build step. CI copies it into the portfolio along with the
other static apps.
