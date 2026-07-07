# Recipe Box

An electronic family recipe box, served at **/projects/recipebox**.

The idea: recipe cards, not recipe blogs. You write your recipes onto cards and
keep them in your own box. Family and friends make their own boxes, you connect
with each other (request → accept, like real friendships), and then you can hand
someone a single card — or your whole box — exactly like passing recipe cards
around in real life. Cards can carry photos and videos, so grandma rolling out
the dough lives on the card next to the dough recipe.

Originally started as a React tutorial skeleton in
[recipe-app-react-review](https://github.com/josh-sea/recipe-app-react-review);
rebuilt for real here.

## How it works

Static vanilla-JS PWA, same pattern as `apps/playball` and `apps/canitwo`:
no build step, Firebase SDK from the CDN.

- `index.html` — shell, modals, `StoreReady` bootstrap
- `js/store.js` — Firebase auth (Google + email), Firestore, Storage
- `js/app.js` — hash-routed UI (`#/box`, `#/shared`, `#/people`, `#/recipe/:id`, `#/new`, `#/edit/:id`)
- `css/styles.css` — index-card aesthetic

### Data model (Firestore, `recipebox_` prefix)

| Collection | Doc id | Purpose |
|---|---|---|
| `recipebox_users/{uid}` | auth uid | profile (username) |
| `recipebox_usernames/{name}` | lowercase username | unique-claim + lookup |
| `recipebox_connections/{a__b}` | both uids, sorted | friendship: `pending` → `accepted` |
| `recipebox_recipes/{id}` | auto | one card; `sharedWith: [uid]` gates reads |

Queries filter on a single field only (`ownerUid ==`, `array-contains`) so no
composite indexes are needed; sorting is client-side. Rules live in the root
`firestore.rules`.

Media uploads go to Storage under `users/{uid}/recipebox/{recipeId}/` (covered
by the existing `storage.rules` size/type limits); docs store tokenized
download URLs so shared viewers can see them.

## Deploying

```bash
./deploy.sh recipebox
```

CI (`.github/workflows/deploy.yml`) copies this directory into
`apps/portfolio/public/projects/recipebox/` on every deploy, like the other
static apps.
