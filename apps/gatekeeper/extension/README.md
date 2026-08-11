# Gatekeeper

A Chrome extension that puts a reasoning layer between a curious kid and the open web. It does not just block. It asks him to make a case, and it can be persuaded.

## Install

1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this folder.
2. The settings page opens on first install. Paste an Anthropic API key.
3. Edit **What he's working on**. This is the single highest-leverage field in the whole thing.
4. Set a parent PIN.

## Setup (for someone testing this)

You need your own Anthropic API key. On install the settings page opens; paste the key, then set the four things that make the rest work:

1. **API key** — from console.anthropic.com. Put a spend limit on it; anyone with devtools on this profile can read it.
2. **Parent PIN** — required for sessions and dad mode. Without it, sessions can't be started, since the PIN is how Gatekeeper knows a grown-up is present.
3. **Background interests** — a sentence or two about the kid. This is general context, not the per-session goal.
4. **Kid's name and age** — used in the prompts and copy.

Then the first time the kid browses, an adult starts a session (below).

## How a decision gets made

Cheapest test first, model last:

| Tier | Cost | What it covers |
|---|---|---|
| Skip list | none | localhost, dev servers |
| Blocked list | none | domains you've ruled out |
| Allowed list | none | Wikipedia, Adafruit, Arduino, Khan Academy, and so on |
| Cache | none | anything already decided, for 7 days by default |
| Claude Haiku | ~a tenth of a cent | the gray zone |
| Claude Sonnet | ~a cent | appeals only |

After the first week of real use the cache absorbs most of the traffic. Expect the running cost to be small, but put a spend limit on the key anyway.

## The three outcomes

- **Allow** — page loads, nothing shown.
- **Ask** — page stays hidden, he gets a text box. A specific, honest reason usually wins. Winning grants a **topic pass**, not a single URL, so he can follow a thread for 30 minutes without re-arguing on every link. This is deliberate: the point is to make him articulate what he's after, not to make him grind.
- **Block** — hard categories only. No appeal to the model, but he can push it up to you, and it lands in **Waiting on you** on the settings page.

Every decision and every reason he typed goes into **Activity**. That log is the actual product. Read it weekly.

## Side quests

The helper isn't only a suggestion box. Investigating earns Campbell mini games, and the games are gated by a question about what he actually read, so the reward tracks real engagement rather than time served.

**Earning.** Reading an allowed page for a genuine stretch accrues toward a token, measured by the same visible-time heartbeat the log uses, so a tab idling in the background counts for nothing. Ten minutes of real reading mints a token by default. A well-reasoned appeal earns one too, since arguing your way through the gate is itself investigation. Tokens bank up to a small cap so it stays earn-one, play-one rather than a hoard.

**Unlocking.** A token buys a shot, not an automatic game. He gets one question generated from something he recently looked at: not a definition he could copy, but a why or how or what-if that only makes sense if he read the thing. He gets three tries, judged leniently, since the point is engagement and not spelling. Answer it and the game opens. Run out of tries and it costs him no token, just a short cooldown before a fresh quest. This is deliberate: a hard question shouldn't burn something he earned.

Because the question is drawn from his own session, it can't be searched for. A kid who opened ten tabs to farm credit can't answer it; a kid who actually read can.

**Playing.** The game runs in its own small window, not the popup, because a popup closes the moment it loses focus and the first tap would end the game. The window checks a single-use ticket the quest minted, so navigating to the game page directly just shows a locked screen.

**Playing, and the grace period.** Answering a quest opens the arcade window, where he picks a game. A session is time-boxed rather than sudden-death: for the first two minutes a loss just offers a free restart or a switch to the other game, so a fast death never wastes the reward. The clock is only checked when a run ends, so a run still going when the two minutes are up plays out to its natural finish and then the session closes. In practice that lands a session in the three-to-five-minute range, which pairs with the ten-to-twenty-minute earning cycle like a pomodoro rhythm: investigate for a stretch, earn a few minutes of play. The window is tunable in settings.

**The games.** Two so far, built as interchangeable modules:

- **Signal** — the memory game. A pattern of tones and colors lights up and he taps it back, one longer each round.
- **Circuit Dash** — the Flappy-style runner he asked for. He's an electron flowing through a circuit, tapping or pressing space to stay aloft and thread the gaps between components while dodging resistor bands. Score is gaps cleared; it speeds up as he goes.

Adding another is a drop-in: a module exposing `start(onGameOver)` and `onTap(x, y)`, registered in the `GAMES` map in `game.js`. Nothing else changes.

Everything is tunable in **parent settings → Side quests**: reading per token, the bank cap, the cooldown, or the whole feature off. Tokens and quests never touch the safety pipeline; a quest that wanders into a hard category comes back as a plain "not this one," same as everywhere else.

## The helper popup

Clicking the toolbar icon opens a small panel aimed at Campbell, not at you. It answers the question a filter normally leaves hanging: fine, so what *should* I look at?

It does two things.

**Ideas, unprompted.** On open it suggests four searches and a few starting places, built from the project context plus what he actually looked at over the last three days. It's told not to repeat ground he's covered and to go one step past where he got to, so the suggestions move rather than circle.

**A refining box.** He types roughly what he's after and gets back sharper search wording, plus a one-line tip explaining what changed about the phrasing. That tip is the point. Query formulation is a real skill and almost nobody teaches it directly.

**Show me with the camera.** For when he doesn't have the words yet. The button opens a small window, he points the laptop camera at his breadboard or his parts, snaps a photo, and types something plain like "I want to make the LED light up." The photo and the text go to the vision model together, so the answer is about the actual parts in front of him rather than a guess. The image is downscaled before sending to keep it small, the camera stream is released the moment the window closes, and nothing about the photo is stored. Camera access is a one-time browser prompt for the extension; if it's denied he can still type.

Two details that matter:

- **Suggestions are pre-approved.** Anything the popup offers is written into the cache as allowed before it's shown, so clicking one never hits the gate. The helper and the gatekeeper can't contradict each other.
- **Suggested URLs are verified.** Models invent plausible-looking links. Every suggested URL gets fetched before it's rendered and dropped if it doesn't resolve, so he never lands on a 404 from his own tool. The prompt also biases toward searches over deep links for the same reason.

The refining box runs the same safety line as everything else: hard categories come back as a plain refusal instead of suggestions, and both the request and the outcome land in the activity log.

Since the toolbar icon now opens this, **parent settings moved to right-click the icon → Options**, or the link at the bottom of the popup. It's PIN-gated either way.

## Sessions

Every stretch of browsing happens inside a session with a stated goal, and the goal is what "relevant" means for that whole session. This is the spine the rest of the gate hangs on.

**Starting one.** Whenever the tool is enabled with no active session, browsing is held and the helper popup shows a start card: a box for the goal and the parent PIN. The goal can be typed by the child, but the PIN means an adult authorized it, so a kid can't quietly set a session to something off-limits. Anyone can start a session anytime, but only with the PIN.

**What it does.** While a session runs, the screener judges against the goal. On-topic and clearly-supporting material flows; genuinely ambiguous things still go to the appeal box; unsafe is still blocked. What's new is a fourth outcome, **off session**: safe content that has nothing to do with today's goal is held with a friendly note. The child can't talk their way past that one, because only an adult can change what the session is about. That's the mechanism that keeps a "let's learn about circuits" session from drifting into an afternoon of unrelated videos, without ever calling that content bad.

**Changing it.** Change your mind, or want to follow a tangent that's worth its own session? The popup's "New session" needs the PIN again. Starting a fresh session clears the old topic passes and cached decisions, so the new goal genuinely reframes things rather than inheriting the last session's allowances.

**The record.** Every goal is saved to a session history, newest first, visible in settings. Over time it's a quiet map of what he's been curious about. The suggestion helper and the camera helper both steer toward the current goal too, so "what's next" means next *on this*, not next in general.

You can turn the requirement off in settings if you'd rather run without per-session goals; then the gate falls back to judging against the background interests, the way it did before.

## Dad mode

For when you're browsing alongside him. Tap **Dad mode** at the bottom of the helper, enter the parent PIN, and two things happen: the gate stands down completely so the browser is open on this profile, and every configured game becomes playable without earning a ticket. A banner shows how long it's on with a live countdown, and **End** shuts it off early. It runs 60 minutes by default, tunable in settings.

Two things make it safe. It requires a parent PIN to exist, so Campbell can't switch it on himself, and while it's active none of your browsing is written to his activity log. The only entries it leaves are that dad mode turned on and off.

The dad games window skips the earn-and-quest flow entirely: pick any game, no time cap, restart as much as you like. It's also where his own creations will appear once the builder ships. The slot is already wired, so saved games light up there automatically with nothing more to change.

## The activity record

Everything is written to `chrome.storage.local`, bucketed one array per day. That storage survives browser restarts and, importantly, is **not** touched when someone clears browsing data. It goes away only if the extension itself is removed or you erase it from the settings page.

With **Record allowed pages** on, the log is a full browsing history rather than just a record of friction: every page, its title, and roughly how long he actually looked at it. Time is measured by a heartbeat from the page, and only counts while the tab is visible, so a tab left open in the background doesn't inflate it.

The settings page gives you:

- **Range and filter** — today, 7 days, 30 days, everything; narrowed by outcome or free text across sites, titles, and the reasons he typed
- **A summary strip** — events, distinct sites, total minutes, and the allow / stopped / blocked split
- **Export JSON** and **Export CSV** — exports whatever the current filter shows, not just what fits on screen
- **Save copy to Downloads** — the full history, on demand

The `unlimitedStorage` permission means you won't hit a quota. A heavy day runs around 50KB, so a year of use is a few tens of megabytes.

### The weekly copy

**Save a weekly copy to Downloads** writes the whole history to `Downloads/gatekeeper/activity-YYYY-MM-DD.json` every seven days. This is the answer to "assuming they don't get cleared out." Extension storage is durable against normal browser use but not against uninstalling the extension, and a kid who finds the toggle can find the uninstall button. A file sitting in your Downloads folder survives that.

Set **Keep history for** to `0` to retain everything, or to a number of days if you'd rather it roll off.

## What it catches

- Search queries on Google, Bing, DuckDuckGo, YouTube, checked before results are visible
- Link clicks, checked with the link text and the page he came from as context
- Any page load, including typed addresses and redirects, when **Check every page** is on
- SafeSearch, forced by URL rewrite on the three search engines

## What it does not catch

Be clear-eyed about the fence:

- **He can disable the extension** from `chrome://extensions`, and no extension can guard that page. Fix this at the OS level with Chrome's `ExtensionInstallForcelist` policy, which makes the extension unremovable. On macOS that's a plist under `/Library/Managed Preferences/com.google.Chrome.plist`; on Windows it's a registry key. Pair it with a supervised profile so he can't just create a fresh one.
- **The API key is readable** by anyone who opens devtools on that profile. You chose this tradeoff knowingly. Keep the key scoped and capped.
- **The page still loads underneath.** Content is hidden, not prevented. Blocking calls `window.stop()`, but bytes have already moved.
- **Other browsers, phones, friends' laptops** are all outside this. A DNS-level filter on the router is the floor this sits on top of.

## Tuning

If it's too chatty, the fix is almost never the strictness setting. It's the project context field. Naming what he's actually building this month widens the auto-allow band dramatically, because the screener is told to be permissive toward anything plausibly connected to it.

If he's routing around a category you care about, add the domain to **Always block** rather than arguing with the prompt.

## Files

```
manifest.json     permissions and wiring
background.js     decision pipeline, cache, API calls, activity log, archiving
content.js        page hiding, search + click interception, appeal panel, visit heartbeat
options.html/js   parent settings, pending requests, log browser, exports
popup.html/js     the helper panel he sees when he clicks the icon
game.html/js      the arcade window (menu, Signal, Circuit Dash, grace period)
capture.html/js   the camera window for showing the helper a photo
builder.html/js   the game builder: editor, knobs, save/load, watchdog
sandbox.html/js   the locked engine that runs model-written game code
                  (dad mode lives in popup + background, no new files)
offscreen.html/js builds download files, since service workers can't make blob URLs
```

## The game builder

He types how he wants to change a side-scroller and the model rewrites it, live. "Let me fly," "give me a laser," "add more enemies," "bouncier jumps." The change loads into the running game so he can test it and keep going. This is the open-ended, he-writes-real-code feature, built so it can't hurt anything and rarely breaks.

**How the safety works.** The game runs in a manifest-declared sandbox page (`sandbox.html`) embedded as an iframe. Sandbox pages get a null, opaque origin: no `chrome.*` APIs, no extension storage, no cookies, no access to the parent page. Model-written code is built there with `new Function`, which the sandbox CSP allows precisely because that context has nothing worth reaching. The builder page holds the API key and storage and passes only game code across the boundary, and the two talk exclusively through `postMessage`. So even a hostile or broken generation is boxed.

The engine supports power-ups natively (grow bigger and take an extra hit, fly, fireballs, speed, extra heart), so "make me bigger" or "power-ups that let me shoot fireballs" fill in real game data rather than improvised code. Requests it genuinely can't do in a flat 2D world, like "make it 3D," come back as a friendly note explaining what it can do instead, rather than a broken build.

**How it stays reliable.** The model doesn't write a game engine each turn. It edits a config object against a fixed harness that already owns physics, collision, camera, lives, and win/lose. Common requests map to real built-in abilities (`fly`, `doubleJump`, `dash`, `weapon`, enemy types), so they just work, with an optional `onUpdate` hook as the escape hatch for unusual ideas. Every generation is validated (arrays capped, numbers coerced, hooks type-checked) and then trial-loaded in the sandbox before it's kept; if it errors, the builder silently reverts to the last good version. A watchdog heartbeat guards against a runaway loop: if the frame goes silent for a couple of seconds, the builder reloads the iframe, which kills the runaway, and restores the working game. There's an Undo button for AI edits too, and the returned code is run through a repair pass that tolerates the stray commas and comments models sometimes emit.

**The knobs.** Alongside the natural-language box, the game exposes a set of live sliders the model declares, gravity, jump height, run speed, hearts, and any others it adds. Dragging a slider updates the running game instantly with no model call. This is the "expose small pieces he can edit" idea: he sees cause and effect in real values, and a "peek at the code" panel shows the actual object he's shaping. He can change what we let him change and nothing else.

**Saving and playing.** In dad mode the builder's My games list gains a delete button per game, so you can prune the ones he's done with. He names and saves creations to `chrome.storage.local`. Saved games appear in two places: back in the builder under "My games" to keep tweaking, and as tiles in the arcade menu, so **playing his own creations is one of the earnable rewards**, opened straight from a quest unlock or from dad mode. Reach the builder itself from the helper popup's "Make your own game," available freely since building is the good kind of screen time.

## One thing worth telling him

He should know the log exists. A kid who discovers he's been silently recorded learns to route around the tool; a kid who knows the record is there and knows you read it is in a different relationship with it. The appeal box already tells him something is listening. Saying the rest out loud costs you nothing and buys the whole system its legitimacy.
