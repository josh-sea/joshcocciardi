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

Everything is kept in `localStorage` on the device (key `daybook.v1`).
Settings has a backup download and restore.

## Skylight

Skylight's web app loads the calendar from a JSON:API style backend while you
are signed in. Daybook can read those responses without ever seeing a
password or cookie: **Import from Skylight** takes either

- the response body of a `calendar_events` request, copied from the browser's
  Network tab, or
- a whole HAR file (Network tab, *Save all as HAR*). Only response bodies of
  `calendar_events` requests are read; the request headers, which carry the
  session cookie, are ignored and the file is not kept.

Skylight categories (one per family member) become Daybook calendars with
their colours. Importing the same weeks again replaces the earlier copies
instead of duplicating them. The reader is `js/skylight.js`; it accepts the
usual field names (`starts_at`/`ends_at`/`all_day`/`summary`) and a few
alternatives, and treats all-day end dates as exclusive.

### Live sync (not built yet)

A browser page on joshcocciardi.com cannot call Skylight's API directly
(CORS), so a live sync needs a small Cloud Function that holds the Skylight
token and proxies reads. What community projects report about the API, **not
yet checked against a real capture**:

| Call | Notes |
|---|---|
| `POST https://app.ourskylight.com/api/sessions` | `{ email, password }` returns a user id and a token. |
| Auth header | `Authorization: Basic base64(<user id>:<token>)` |
| `GET /api/frames` | The household's frames (calendars). |
| `GET /api/frames/{frame}/calendar_events?date_min=…&date_max=…` | Events, with categories in `included`. |
| `GET /api/frames/{frame}/categories` | The people and their colours. |

A HAR from the Skylight tab is the quickest way to confirm the exact paths and
auth before building the proxy.

## Code

| File | What |
|---|---|
| `js/time.js` | Local date keys and minute arithmetic. No time zones. |
| `js/layout.js` | Repeats, lanes, gaps, busy time, the window to draw. |
| `js/trackers.js` | Tracker kinds, status, badges, streaks. |
| `js/todos.js` | Which to-dos show on a day. |
| `js/store.js` | State shape and pure updates. |
| `js/skylight.js` | Skylight JSON and HAR reader. |
| `js/app.js` | The page. |

Tests: `node apps/portfolio/test/daybook.test.mjs` (no dependencies).
Deploy: `./deploy.sh daybook`.
