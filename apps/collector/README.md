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
- **Add detail whenever.** Photos (snap from your phone), category → sport →
  league → type, graded/grade/company, tags, where you got it, who it's
  assigned to, notes.
- **Log sales.** Sale price is the only required field; where it sold, who
  bought it, and fees are optional and sharpen the profit math.
- **eBay sold comps.** One button opens eBay's *completed & sold* listings for
  the item, sorted by most recent — the real going rate, not active asks. No API
  key needed.
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
`collector/{shopId}/...` and are gated by shop membership. The `collector_items`
query needs the composite index in the root `firestore.indexes.json`.

## Local development

```bash
cd apps/collector
cp .env.example .env.local   # fill in the josh-cocciardi Firebase web config
npm install
npm run dev
```

`npm run build` outputs to `dist/` (base path `/projects/collector`).

## Deploy

From the repo root:

```bash
./deploy.sh collector
```

That builds the app, copies `dist/` into `apps/portfolio/public/projects/collector`,
deploys the Firestore rules + indexes, and pushes hosting. First deploy: give the
new `collector_items` index a minute to finish building.

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
