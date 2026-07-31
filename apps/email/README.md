# Electronic Mail

An iMessage-styled Gmail client. React (CRA) + Firebase Auth + Firestore,
talking to the Gmail REST API from the browser.

Live at <https://www.joshcocciardi.com/projects/electronic-mail>.

## How it fits together

Two identities are in play, and they are not the same thing:

| | What it is | Used for |
|---|---|---|
| **Firebase Auth** | Your account on this app (email/password or Google) | Owning the cache and the stored token |
| **Gmail OAuth** | Authorization to read/send from a mailbox | Every Gmail API call |

You can sign in to Firebase with one address and authorize a completely
different mailbox — so everything is keyed on the **Firebase uid**, never on
an email address.

```
users/{uid}/private/gmail     ← Gmail OAuth token (owner-only)
users/{uid}/threads/{id}      ← cached thread metadata
users/{uid}/messages/{id}     ← cached message bodies
users/{uid}/meta/sync         ← per-category sync watermarks
```

### Loading a mailbox

1. Read cached threads from Firestore and render them immediately.
2. Sync with Gmail, **await it**, write results to the cache, re-render.
3. Scrolling to the bottom backfills older mail by page token.

Step 2 is awaited on purpose. Firing the sync and not waiting is what made a
first load look like an empty mailbox.

Category tabs and search are applied in both places: the Gmail query (`q=`)
narrows the sync, and the cached list is filtered to match. Searches
containing Gmail operators (`from:`, `has:attachment`) are answered by the
server only, since they can't be evaluated against local fields.

### Rendering message bodies

Email HTML is attacker-controlled — anyone who can email you decides what
lands in it. It is rendered in an iframe that is sandboxed **without**
`allow-same-origin`, so its document has an opaque origin with no access to
this app's DOM, storage or Firebase session. A CSP inside that document
blocks every script except the nonce-tagged height reporter, and blocks
images (`img-src 'none'`) until you ask for them — which covers `<img>`,
`srcset` and CSS background images alike.

There is no HTML sanitizer, by design. See `src/components/MessageBody.js`.

## Setup

### Prerequisites

- A Firebase project with **Firestore** and **Authentication** enabled
  (Email/Password and Google providers).
- A Google Cloud OAuth 2.0 Client ID (Web application) with the Gmail API
  enabled. Authorized JavaScript origins must list every origin you serve
  from — `http://localhost:3000` for development, plus the production host.

### Configuration

```bash
cp .env.example .env    # then fill it in
npm install
```

`.env.production` is committed and holds the production values. Nothing in
either file is a secret: `REACT_APP_*` variables are compiled into the
JavaScript bundle and served publicly. Access control lives in
`firestore.rules` and in the OAuth client's authorized origins.

### Running

```bash
npm run dev     # development server on :3000
npm test        # unit tests
npm run build   # production build
```

## Deploying

CI does it: merging to `master` runs `.github/workflows/deploy.yml`, which
tests and builds this app, copies the output into
`apps/portfolio/public/projects/electronic-mail`, builds the portfolio, and
deploys.

For a manual build:

```bash
./deploy-to-portfolio.sh            # build + stage into the portfolio
./deploy-to-portfolio.sh --deploy   # ...and push to Firebase
```

Firestore rules live at the **repository root** (`firestore.rules`) and cover
every app on the project. `apps/email/firestore.rules` is a readable copy of
this app's slice and is not deployed — change both.

## Gmail scopes

- `gmail.readonly` — read messages
- `gmail.send` — send replies and new messages
- `gmail.modify` — mark messages read
- `userinfo.email`, `userinfo.profile` — identify the authorized mailbox

## Security notes

- OAuth tokens live at `users/{uid}/private/gmail`, readable only by that
  uid. They were previously stored in a world-readable `gmail_tokens`
  collection keyed by email address; that collection is now denied outright
  and any leftover documents should be deleted from the Firebase console.
- The root ruleset's authenticated catch-all explicitly excludes `users`.
  Without that exclusion any signed-in account — and anyone can create one —
  could read every other user's cached mail.
- Access tokens are short-lived (~1 hour) and refreshed silently through
  Google Identity Services. Consent is only requested when a silent refresh
  fails.

## Troubleshooting

**"REACT_APP_GOOGLE_CLIENT_ID is not set"** — copy `.env.example` to `.env`
and fill in the client ID, then restart the dev server. CRA only reads env
files at startup.

**"Failed to load Google Identity Services"** — the GIS script in
`public/index.html` didn't load. Check the network tab and any blockers.

**Authorization popup closes and nothing happens** — the origin you're
browsing from isn't in the OAuth client's authorized JavaScript origins.

**Firestore permission-denied** — the deployed rules are the ones at the
repository root. Confirm they include the `users/{uid}/private` match and the
`users` exclusion in the catch-all.

**Empty inbox after authorizing** — the first sync pulls 25 threads for the
selected tab; scroll to backfill. If it stays empty, check the console for
Gmail API errors.

## Other docs

`FIRESTORE_CACHE_GUIDE.md` covers the cache design. The remaining `*.md`
files are historical setup notes from earlier iterations and may describe
paths and URLs that have since changed — this README is authoritative.
