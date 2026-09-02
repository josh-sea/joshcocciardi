# PSX Station

A PlayStation 1 emulator that runs in a browser tab, served at
`/projects/psx` on the portfolio site.

Drop in a disc image you own — `.7z`, `.zip`, `.rar`, or a raw `.bin`/`.cue`,
`.chd`, `.pbp`, `.iso` — and it plays. Sign in and your save states and memory
cards follow you to the next device.

## How it's put together

Static app, no build step, same shape as `apps/playball` and `apps/canitwo`:
`deploy.sh psx` copies the folder into `apps/portfolio/public/projects/psx/`
and the portfolio build carries it up with everything else.

```
index.html      two views (library, player) behind a hash route
config.js       emulator CDN, core choice, slot count, size limits
js/db.js        IndexedDB: discs, BIOS, save states, memory cards
js/store.js     Firebase auth, Firestore metadata, Cloud Storage saves
js/app.js       library UI + emulator lifecycle
css/styles.css  the whole stylesheet
```

Emulation is [EmulatorJS](https://emulatorjs.org) 4.x — libretro cores
compiled to WebAssembly — loaded from its CDN at runtime. Nothing about the
emulator is vendored into this repo. `config.js` points at
`https://cdn.emulatorjs.org/stable/data/`; swap that for a self-hosted copy of
its `data/` folder if the CDN ever becomes a problem.

`EJS_core` is set to the generic `psx` key, which gives you two cores in the
emulator's own settings menu:

| Core | BIOS | Notes |
| --- | --- | --- |
| `pcsx_rearmed` *(default)* | not required | Ships an HLE BIOS. Fast, plays most things, runs fine on phones. |
| `mednafen_psx_hw` | **required** | More accurate, upscales the 3D. Will not boot without a real BIOS dump. |

## Where things are stored

The split matters, because PS1 discs are enormous and Firebase Storage's free
tier is 5GB stored / 1GB egress per day. One `.7z` would eat a day's egress
every time you started a game.

**On the device (IndexedDB), never uploaded:**

- Disc images. A 600MB `.7z` is written straight to disk by IndexedDB, so a
  library can be far larger than available RAM.
- The BIOS, if you add one.
- A local copy of every save state and memory card.

**In Firebase, per signed-in user:**

- `users/{uid}/psx_games/{discId}` — title, filename, size, last played,
  playtime, plus a `states` map of which slots exist and a `cardUpdatedAt`
  stamp. This is the index the UI reads; it never has to list Storage.
- `psx/{uid}/{discId}/slot-N.state` — the save state itself (1–9MB).
- `psx/{uid}/{discId}/slot-N.png` — a screenshot for the slot, when the core
  can produce one.
- `psx/{uid}/{discId}/memcard.srm` — the memory card (~128KB).

### Disc IDs

A save state has to find its way back to the right disc on a device that has
never seen the file. Hashing 600MB on every add would be slow, so the id is a
SHA-256 over the file's **size plus its first and last megabyte** — a few
milliseconds regardless of disc size, and unique in practice for real disc
images. Add the same file on a second device and it lands on the same id, which
is what reattaches it to your cloud saves.

## Save behaviour

- **Save states** are manual, four slots, via the *Saves* panel in the player.
  Saving writes locally first and then uploads; if the upload fails you keep
  the local copy and get told so.
- **Memory cards** sync on their own: restored on game start when the cloud
  copy is newer than this device's, checkpointed every 60 seconds, and flushed
  when you leave the game or background the tab.
- Conflicts resolve by timestamp, newest wins. Nothing merges — that's not a
  thing you can do to a PS1 save.
- **Removing a disc keeps its cloud saves** by default: you remove a disc to
  reclaim space, not to throw away forty hours, and adding the same file again
  reattaches them. The remove dialog offers to delete them too, which is the
  only thing that clears them out of Storage.

## When a game goes black

A PS1 disc has to be held **twice** while it boots: once as a JavaScript array
of the whole file, and again inside the core's own in-memory filesystem. A
500MB disc therefore wants well over a gigabyte, and a phone hands a browser
tab a fraction of what a desktop does. When that budget runs out you get a
black rectangle with the page still working around it — either the core aborts,
or the browser quietly takes the WebGL context back.

Neither of those says anything on its own. EmulatorJS routes the core's stderr
into handlers that only log when its debug flag is set, and it has no
`webglcontextlost` handling at all. So the app taps both:

- `hookEmulatorRuntime()` in `js/app.js` intercepts the `window.EJS_Runtime`
  assignment and folds our own `printErr` and `onAbort` into the Emscripten
  module config before the core sees it. Out-of-memory output raises the
  overlay immediately, and the last few lines of real core output are shown
  under "Emulator output" — which is the only way to read them on a phone.
- The boot watchdog binds a `webglcontextlost` listener to the emulator's
  canvas once it exists.

Discs past `mobile_disc_warn_bytes` (mobile) or `large_disc_warn_bytes`
(desktop) get a one-time warning before booting, acknowledged per disc so it
only asks once.

**The fix that actually sticks is converting the disc to CHD.** It is a
compressed disc format the core reads natively, typically a third of the size
of a `.bin`/`.cue` pair, and it cuts both copies at once. `chdman` (ships with
MAME) does it:

```bash
chdman createcd -i "Wipeout XL.cue" -o "Wipeout XL.chd"
```

A `.7z` is the wrong shape for this even though it is small on disk: it has to
be fully decompressed into memory before anything can boot, so it costs *more*
peak memory than the raw disc, not less.

## Things worth knowing

- **Switching games reloads the page.** EmulatorJS mounts a canvas, a WASM core
  and a pile of listeners and has no teardown API, so the player and the
  library each get a fresh page. Cores are cached in IndexedDB, so it's quick.
- **Discs are decompressed into memory before booting.** A 900MB+ disc can
  exhaust memory on a phone even though it stored fine. The app warns above
  that size rather than blocking.
- **Ask for storage persistence** (Settings → Device storage) if you're keeping
  a real library. Without it the browser may evict discs under storage
  pressure. Chrome usually grants it silently to sites you revisit.
- **Threads are off.** The threaded cores need COOP/COEP headers on this path,
  which would break the CDN loads. The single-threaded cores are plenty for
  PS1. If you ever self-host EmulatorJS, set `EJS_threads` and add the headers
  in `firebase.json` together.

## Bring your own everything

No BIOS and no games ship with this page, and none ever will — they're
copyrighted, and this repo is public. Dump them from hardware you own. The
emulator itself is just a program, and the one running here is
[GPL/MIT-licensed and public](https://github.com/EmulatorJS/EmulatorJS).

## Deploy

```bash
./deploy.sh psx          # copy into portfolio, build portfolio, deploy hosting
                         # (also pushes firestore + storage rules)
```

Live at <https://www.joshcocciardi.com/projects/psx>.
