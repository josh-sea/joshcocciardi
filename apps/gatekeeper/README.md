# Gatekeeper

A reasoning layer between a curious kid and the open web — now with a parent
account. The Chrome extension screens browsing (this is unchanged; see
[`extension/README.md`](extension/README.md)). What's new here is the cloud
side: the extension can **pair to a parent account**, the Anthropic key moves
**server-side**, activity and requests **sync to Firestore**, and a parent can
**approve or deny access requests in real time** from the web app — with push
notifications.

```
apps/gatekeeper/
  app/         Parent console — static Firebase PWA → igatekeeper.web.app
  extension/   The Chrome extension (cloud client added in cloud.js)
functions/
  gatekeeper.js   Extension-facing HTTP API + push trigger
firestore.rules   gatekeeper_* collections (owner-scoped)
```

## How it fits together

The child's browser is deliberately **not** a Firebase-auth client. It talks
to one Cloud Function over HTTPS with a per-device bearer token minted at
pairing time. Everything it writes lands via the Admin SDK, which is why the
security rules only ever describe what the *parent* app may do.

```
  ┌──────────────┐   Bearer <hid.deviceId.secret>   ┌────────────────────┐
  │  Extension   │ ───────────────────────────────▶ │  gatekeeperApi     │
  │ (kid's PC)   │   /pair /screen /event           │  (Cloud Function)  │
  │              │   /session /request /verdicts    │  · holds API key   │
  └──────────────┘ ◀─────────────────────────────── │  · Admin SDK write │
        ▲  polls /verdicts for the parent's decision └─────────┬──────────┘
        │                                                      │ writes
        │                                             ┌────────▼──────────┐
        │  push (new request)                         │     Firestore     │
        │                                             │ gatekeeper_house… │
  ┌─────┴────────┐   Firebase Auth (Google)           └────────┬──────────┘
  │  Parent app  │ ◀──────── realtime listeners ───────────────┘
  │ igatekeeper  │ ───────── approve / deny ───────────────────▶ (status flip)
  └──────────────┘
```

Why a server proxy for Claude: it takes the Anthropic key **out of the kid's
browser** entirely. The old model (README in `extension/`) warns that anyone
with devtools on the kid's profile can read the key. Paired to an account, the
key lives in a write-only Firestore doc the client can never read back, and the
extension asks `/screen` to run each prompt.

## Data model (`gatekeeper_*`)

```
gatekeeper_households/{uid}            one per parent; owners:[uid]
  .kidName .kidAge .projectContext .settings .usage .hasKey
  /private/config   { anthropicKey }   write-only; never read by any client
  /devices/{id}     extension tokens (type:'extension') + parent push (type:'parent')
  /sessions/{id}    browsing sessions (goal per stretch)
  /activity/{id}    mirrored decision log — the live history
  /requests/{id}    access requests → status pending|approved|denied
gatekeeper_pairing/{CODE}              short-lived code → householdId (15 min)
```

Security rules are in the repo-root `firestore.rules` (`gatekeeper_*` block):
owners read their household and act on requests; the API key is never readable;
pairing codes are never client-readable (only the `/pair` function redeems
them, via Admin SDK).

## The extension API (`functions/gatekeeper.js`)

One path-routed HTTPS function, `gatekeeperApi`:

| Method + path        | Auth          | Purpose |
|----------------------|---------------|---------|
| `POST /pair`         | pairing code  | Exchange a code for a device token |
| `POST /screen`       | device token  | Proxy a Claude call with the server-held key |
| `POST /event`        | device token  | Mirror activity-log entries |
| `POST /session`      | device token  | Upsert a browsing session |
| `POST /request`      | device token  | Raise an access request (fires push) |
| `GET  /verdicts`     | device token  | Poll for parent decisions since a timestamp |
| `GET  /config`       | device token  | Pull cloud-managed config |
| `POST /unpair`       | device token  | Remove this device |

Plus `gatekeeperOnRequest`, a Firestore trigger that web-pushes every parent
device when a request is created.

Requests are reconciled back into the gate by a 1-minute alarm in the
extension (`pollCloudVerdicts`) — MV3 has no persistent socket — and also
opportunistically whenever the popup opens. An approval caches an allow and
grants a topic pass; a denial caches a block. (One-minute latency is the MV3
alarm floor; the popup-open poll makes the common case feel immediate.)

## Setup / deploy

Everything runs in the existing **josh-cocciardi** Firebase project. The
`igatekeeper` hosting target is already wired in `firebase.json` /
`.firebaserc`.

```bash
./deploy.sh gatekeeper      # hosting:igatekeeper + functions + firestore rules/indexes
```

Two things must be configured in the Firebase console **once** (they can't be
committed to the repo):

1. **Anthropic key** — set per-household by the parent in the web app
   (Setup → Anthropic API key). Stored server-side; put a spend limit on it.
2. **Web Push (VAPID) key** — for notifications. Firebase console →
   Project settings → Cloud Messaging → Web configuration → *Web Push
   certificates* → copy the public key into `app/config.js` (`vapidKey`). Left
   blank, the app still works; it just falls back to the in-page live list
   instead of OS notifications.

### Pairing a browser

1. Parent signs in at `igatekeeper.web.app`, goes to **Setup → Generate code**.
2. In the extension: **right-click the icon → Options → Account**, enter the
   six-character code within 15 minutes.
3. From then on: the key is server-side, activity/sessions/requests sync, and
   escalated requests show up live under **Requests** for approve/deny.

## What's deferred (next PRs)

- **API-key auto-provisioning / usage billing.** The `/screen` function already
  records token usage on the household (`.usage`); metering/billing and
  provisioning keys per family build on that seam.
- **Co-parents.** The `owners` array supports multiple accounts; there's no
  invite flow yet (one household per signed-in parent for now).
- **Every appeal (not just escalations) as a live request.** Today the parent
  queue is the escalation path; the full activity history is already synced.
