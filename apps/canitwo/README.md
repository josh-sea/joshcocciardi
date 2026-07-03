# 🚽 CanITwo

*Can I… number two?* A community bathroom finder for travelers.

Open the map, see gas stations / convenience stores / cafes near you, and check
whether real people say the place has a bathroom you can actually use — with
star ratings and reviews. Tap a pin, read the reports, then launch directions
in Google Maps, Apple Maps, or Waze.

**Live:** https://www.joshcocciardi.com/projects/canitwo

## How it works

- **Browse without an account.** Anyone can see pins, ratings, and reviews.
- **Sign in to contribute** (Google or email/password via Firebase Auth).
  You pick a username on first sign-in — that's the *only* thing ever shown
  publicly; emails stay private.
- **Grey dots** are unrated candidate places pulled from OpenStreetMap
  (gas stations, convenience stores, supermarkets, cafes, fast food,
  restaurants, bars, rest areas, hotels, libraries, public toilets).
  Tap one and be the first to report.
- **Colored pins** are places with reports: green = great bathroom,
  yellow/orange = questionable, red = people say there's *no* bathroom.
  The number on the pin is the average star rating.
- **One report per person per place** — you can update yours any time.
- **Missing a spot?** Long-press the map (or use the ➕ button) to add a
  place manually.
- **Filters:** minimum star rating chips, and a toggle for unrated spots.

## Tech / architecture

Static app, no build step (same pattern as Playball):

| Piece | Choice |
|---|---|
| Map | [Leaflet](https://leafletjs.com) + OpenStreetMap tiles (no API key) |
| Nearby place search | Google Places API (New) Nearby Search, with the [Overpass API](https://overpass-api.de) as automatic fallback (key in `config.js`, referrer-restricted) |
| Auth | Firebase Auth (Google popup/redirect + email/password) |
| Data | Firestore |
| Geo queries | `geofire-common` geohash bounds on `canitwo_places.geohash` |

### Firestore collections

```
canitwo_places/{placeId}                # placeId: osm-{type}-{id} or custom-…
  name, category, emoji, lat, lng, geohash, address, source
  yesCount, noCount, reviewCount, ratingCount, avgRating   # denormalized
  reviews/{uid}                         # one review per user, doc id = uid
    hasBathroom, rating (1–5 | null), text, username, createdAt, updatedAt

canitwo_users/{uid}        # { username } — public profile, email never stored
canitwo_usernames/{lower}  # { uid } — username reservation (create-only)
```

Rating aggregates are recomputed client-side after each review write. Fine at
this scale; move to a Cloud Function trigger if volume ever demands it.

### Why not Google Maps / Places?

Google's Maps JavaScript + Places APIs require an API key with billing
enabled before anything renders. Leaflet + OSM + Overpass gives the same
"find gas stations and stores near me" experience with zero keys and zero
cost. If you later want Google's basemap/POI data, swap the tile layer and
the `searchArea()` function in `js/app.js` — the Firestore data model
doesn't care where places come from.

## Someday / maybe

- Photos on reviews (needs moderation — deliberately punted).
- Verified-business responses ("we have a 5★ rating!").
- Cloud Function for aggregate recomputation + review rate limiting.

## Local dev

```bash
firebase serve   # from repo root, then open /projects/canitwo/
```
