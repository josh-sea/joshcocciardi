# Daybook

A calendar where every day runs left to right, from morning to night, so the
open stretches in a day are visible as space instead of disappearing between
list rows. Live at `/projects/daybook` (short link: `/daybook`).

## What's on the page

| Part | What it does |
|---|---|
| **Week** | Seven horizontal strips on one shared time ruler. Free stretches over 30 minutes are labelled ("3h 30m free") where the label fits. Under each date: a badge for every tracker logged that day, and how many to-dos are due. Below the strips, a grid of this week's trackers you can tick straight from the table. |
| **Day** | One big strip with a summary (booked, open, longest open stretch), then the day in order with the free time listed between events, then a card per tracker. |
| **Strips** | Overlapping events split the strip into lanes; an event that overlaps nothing keeps the full height. Short events let their label run out into the open time after them. The strip stretches past your day hours when something is booked earlier or later. Drag across any strip to block out time; tap it to make a one-hour event. |
| **To-do tray** | Pinned to the bottom of every view. A to-do with no date stays in the tray every day until you tick it off. A dated one appears on its day and follows you, marked overdue, until it is done. Ticked items stay struck through for the day and then drop away. |
| **Trackers** | Five kinds, each with its own little control: *habit* (done or not), *counter* (tap up to a daily goal), *number* (weight, miles, sleep), *mood* (five faces) and *note* (a line of journal). Streaks, a 14-day sparkline, and a badge on the week. |
| **Calendars** | Josh, Ash and Family to start; add, rename, recolour, hide. |

Keyboard: `t` today, `d` day, `w` week, `←`/`→` move, `n` new event, `/` add a to-do.

Everything is kept in `localStorage` on the device (key `daybook.v1`); only the Skylight token lives on the server.
Settings has a backup download and restore.

## Skylight

### Live sync

**Sync with Skylight** (sidebar) signs in with Google and asks for two things
once: the Skylight calendar URL (or just the frame number in it) and the
`Authorization` value from a `calendar_events` request in the browser's
Network tab. Both go to the `daybookSkylight` Cloud Function
(`functions/skylight.js`), which checks the token against Skylight and stores
it in `daybook_skylight/{uid}`. The Firestore rules close that collection to
every client, so the token is never in the page, the repo, or anyone's
browser after that.

From then on Daybook asks the function for the month in view plus a week
either side whenever you move around (and every ten minutes while the page is
open), and replaces that range's Skylight events with what comes back, so
events deleted in Skylight disappear too. Synced events are read-only copies:
edits made in Daybook are overwritten on the next sync.

The call, confirmed against a real frame:

```
GET https://app.ourskylight.com/api/frames/{frame}/calendar_events
    ?date_min=YYYY-MM-DD&date_max=YYYY-MM-DD&timezone=America/New_York
    &include=categories,calendar_account,event_notification_setting
Authorization: Bearer <token>
```

It returns JSON:API: `data` is `calendar_event` records (`summary`,
`starts_at`/`ends_at` with a UTC offset, `all_day`, `location`,
`description`, recurring events already expanded into instances), and
`included` carries the `category` records (`label`, `color`), one per person.
An event shared by two people lists both categories; Daybook files it under
the first. When the token expires the sidebar says so; paste a fresh one in
the same dialog.

The function only talks to that host and path, only with a numeric frame id
and checked dates (93 days at most per call), and never logs or returns the
token.

### Import a file

Without signing in, **Import a Skylight file** takes a pasted
`calendar_events` response or a HAR file saved from the Network tab. Only
response bodies are read.

## Code

| File | What |
|---|---|
| `js/time.js` | Local date keys and minute arithmetic. No time zones. |
| `js/layout.js` | Repeats, lanes, gaps, busy time, the window to draw. |
| `js/trackers.js` | Tracker kinds, status, badges, streaks. |
| `js/todos.js` | Which to-dos show on a day. |
| `js/store.js` | State shape and pure updates. |
| `js/skylight.js` | Skylight JSON and HAR reader. |
| `js/sync.js` | Google sign-in and calls to the `daybookSkylight` function. |
| `js/app.js` | The page. |

Tests: `node apps/portfolio/test/daybook.test.mjs` (no dependencies; also covers the proxy's URL and token checks in `functions/skylight-lib.js`).
Deploy: `./deploy.sh daybook`.
