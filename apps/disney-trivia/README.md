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
| `js/scaleui.js` | the "1 to 10" guessing game screen (lazy) |
| `js/scale.js` | its topic builder and scoring. Pure, tested in node |
| `js/park.js` | planner rules: walking, waits, scoring. Pure, tested in node |
| `js/parkdata.js` | ThemeParks.wiki client with a cache-first fallback |
| `js/music.js` / `js/musicui.js` | background music |
| `parks/attractions.json` | the committed ride catalogue |
| `scripts/seed-attractions.mjs` | rebuilds that catalogue |

Tests: `park.test.mjs`, `scale.test.mjs` and `whereami.test.mjs` under
`apps/portfolio/test/`. All three run in CI.

## 1 to 10

One person picks a secret number from 1 to 10, which is how much they like
things. The other names a category, and the picker answers with something
they would rate exactly that: ask for an EPCOT ride on an 8 and you get
Frozen Ever After, not Guardians and not Imagination. A few answers in,
you guess the number.

The app builds categories and keeps score. It stores nothing about actual
desserts, because the players already know what the desserts are, so the
whole thing is string composition: a subject (`desserts`, `queues`,
`single rider lines`) crossed with a place (`in Magic Kingdom`, `in any
park`, `at Disney Springs`) to make the line you read out.

Two details worth keeping:

- A subject declares which kinds of place it accepts, so the builder never
  offers "Disney films in EPCOT". Picking all four parks reads as "any
  park" rather than listing them.
- The secret number sits behind a press-and-hold that falls closed after
  four seconds. Two people are looking at the same screen and only one is
  allowed to know, so a tap would fire while the phone is being passed and
  a toggle would leave it on display. Only the running tally is persisted:
  a half-played round is deliberately dropped on reload, or whoever
  reloads could just read the answer.

## Park Planner

Given where you are standing, what the queues are doing, and what you have
already ridden, it suggests the next three moves. It optimises for **most
rides in the day**: the score is value divided by total minutes, so ten
minutes of walking costs exactly as much as ten minutes of queueing.

Data comes from [ThemeParks.wiki](https://themeparks.wiki) — free, no key,
300 requests a minute, and `access-control-allow-origin: *`, so the browser
reads it directly and the planner needs no backend to work. Attribution is
shown in the tab's footer.

Things worth knowing:

- **Walk times** are straight-line distance times a 1.45 detour factor,
  divided by your pace. Crude, but within a couple of minutes at park
  scale, and it is what makes the planner usable without a walkway graph.
  A real graph built from OpenStreetMap is the obvious next step.
- **Lightning Lanes are typed in by hand.** Nothing here touches a Disney
  account or My Disney Experience. The planner uses them to avoid sending
  you somewhere you cannot get back from, and to skip rides you are about
  to walk onto anyway (overridable: riding something twice is fine).
- **Must-dos are a deadline, not a weight.** A fixed multiplier always
  loses to a nearby walk-on, which is how you go home without riding the
  thing you came for. Instead the planner works out what the remaining
  must-dos need, compares it with how much day is left, and pushes harder
  as that slack runs out.
- **The day is kept in localStorage**, per park, per date. Firestore rules
  for `park_plans/{uid}/days/{date}` are already in place for when it
  should sync across phones, but a sign-in and a round trip before you can
  tick off a ride is the wrong trade in a place with no signal.

## The wait-time collector

`functions/parks.js` polls all four parks and writes `park_live/{park}` and
`park_snaps/{park}_{stamp}`. It is an HTTPS endpoint rather than
`onSchedule` because Cloud Scheduler is not enabled on this project and CI
deploys every function in one command, so a scheduled export would fail the
whole site's deploy.

`.github/workflows/collect-waits.yml` calls it every five minutes.

**Setup, needed once before any data lands:**

1. Deploy, then copy the `parkCollect` function URL from the Firebase console.
2. Generate a token: `openssl rand -hex 32`
3. Firestore → create `park_secrets/collector` with field `token` = that value.
4. GitHub → Settings → Secrets and variables → Actions, add:
   - `PARK_COLLECT_URL` = the function URL
   - `PARK_COLLECT_TOKEN` = the same token
5. Actions tab → "Collect park waits" → Run workflow, to check it.

Until both secrets exist the workflow exits cleanly without doing anything,
so it is safe to merge before you set them up.

Snapshots are deliberately lean: a row is
`[status, standbyMinutes, llState, llReturnHHMM]`. Storing the API's
24-entry hourly forecast 288 times a day would be roughly 40x the bytes for
no extra information. At four parks and five-minute polling that is about
3.5 MB a day, so an archive-to-Storage step and a Firestore TTL will be
wanted before this runs for a year.
