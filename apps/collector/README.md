# Collector Shop

A low-friction inventory + sales tracker for collectibles — sports cards,
comics, memorabilia, jerseys, gear, whatever. Built for two people to share one
collection: add stuff fast, fill in the details whenever, and see what you own,
what you paid, and what you've made.

Served at **https://www.joshcocciardi.com/projects/collector** as part of the
monorepo's portfolio hosting target. Shares the `josh-cocciardi` Firebase
project (Auth, Firestore, Storage) with the other apps here.

## What it does

- **One-tap add.** Type a name, hit enter — that's a valid item. Price is
  optional (look it up later), and so is everything else.
- **Add detail whenever.** Photos (snap from your phone — auto-resized in the
  browser to fit under the 5 MB cap, no camera-settings fiddling), category →
  sport → league → type, graded/grade/company, tags, where you got it, who it's
  assigned to, notes.
- **Log sales.** Sale price is the only required field; where it sold, who
  bought it, and fees are optional and sharpen the profit math.
- **Value lookups.** One button opens eBay's *completed & sold* listings for
  the item name, sorted by most recent — the real going rate, not active asks.
  A second **Search by photo** button reverse-image-searches the item's photo
  via Google Lens (eBay doesn't expose a URL to launch its own image search with
  a supplied image, so Lens — which accepts a hosted image URL — is the working
  path). No API key needed for either.
- **Dashboard.** Item counts, cost basis on hand, sold-to-date, realized profit
  (sold − cost − fees), average paid/sold/profit, profit margin & ROI, best
  flip, and a by-category cost-basis breakdown. Items missing a price are
  excluded from the money math (and the app tells you how many) so the numbers
  stay honest.
- **Shared shop.** Create a shop, share the 6-character invite code, and the
  other person joins the same live inventory. Changes sync in real time.

## Data model (Firestore, all namespaced `collector_*`)

- `collector_users/{uid}` — display-name profile for this app.
- `collector_shops/{shopId}` — `{ name, ownerId, inviteCode, members{}, memberUids[] }`.
  Membership (`memberUids`) gates everything.
- `collector_invites/{code}` — `{ shopId }`. Resolves an invite code to a shop.
- `collector_items/{itemId}` — one collectible; `shopId` ties it to a shop.

Security rules for these live in the repo-root `firestore.rules` and
`storage.rules` (shared, deployed project). Item photos live in Storage under
`collector/{shopId}/...` and are gated by shop membership. **No composite index
is required** — the item stream queries on `shopId` only (a single-field filter
Firestore indexes automatically) and sorts newest-first in the client.

## How this ships (no local setup needed)

The Firebase web config is public by design and committed in `.env.production`
(same values the other apps in this repo use), so the production build is
reproducible from any Claude Code web session — no laptop, no secrets to wire up.

The build output is **committed** under
`apps/portfolio/public/projects/collector/`, mirroring how `moment-capture` is
handled. On merge to `master`, `.github/workflows/deploy.yml` deploys hosting +
Firestore rules + Storage rules automatically. So the loop is: edit here → open a
PR → merge → it's live at `/projects/collector`. Nothing to run by hand.

When the app source changes, rebuild and re-commit the output (this is what a
Claude Code session does for you):

```bash
cd apps/collector && npm ci && npm run build
rm -rf ../portfolio/public/projects/collector
mkdir -p ../portfolio/public/projects/collector
cp -r dist/. ../portfolio/public/projects/collector/
```

## Local development (optional)

```bash
cd apps/collector
cp .env.example .env.local   # already-public josh-cocciardi Firebase config
npm install
npm run dev
```

`npm run build` outputs to `dist/` (base path `/projects/collector`). The repo
root also has a `./deploy.sh collector` target for deploying from a machine with
the Firebase CLI, but it isn't required for the merge-to-deploy flow above.

## Notes on collectible-value data

The eBay sold-listings hand-off needs no credentials and gives real recently-sold
prices, so it's the default. If you want automated median values later, options
worth a look:

- **eBay Marketplace Insights API** — median sold prices programmatically
  (restricted access; needs an approved eBay developer app + a small backend).
- **Card Ladder / 130point** — card-specific price indices and sales history
  (their data isn't a free public API; would require an account/partnership).

Both need server-side credentials, so they're deliberately out of scope for this
static client for now — the eBay UI hand-off covers the "what's it going for?"
question today.
