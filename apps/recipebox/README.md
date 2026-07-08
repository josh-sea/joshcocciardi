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
- `js/app.js` — hash-routed UI (`#/box`, `#/shared`, `#/groups`, `#/group/:id`,
  `#/people`, `#/u/:username`, `#/recipe/:id`, `#/new`, `#/edit/:id`, `#/import`)
- `js/ai.js` — AI import (lazily loaded; see below)
- `css/styles.css` — index-card aesthetic

### Data model (Firestore, `recipebox_` prefix)

| Collection | Doc id | Purpose |
|---|---|---|
| `recipebox_users/{uid}` | auth uid | profile (username, curated `wisdom`) |
| `recipebox_usernames/{name}` | lowercase username | unique-claim + lookup |
| `recipebox_connections/{a__b}` | both uids, sorted | friendship: `pending` → `accepted` |
| `recipebox_recipes/{id}` | auto | one card; `sharedWith: [uid]` + `sharedGroups: [gid]` gate reads |
| `recipebox_groups/{id}` | auto | group box: name, `createdBy` admin, `members` |
| `recipebox_groups/{id}/cards/{rid}` | recipe id | the shelf: snapshot per shared card |
| `recipebox_group_invites/{gid__uid}` | group + invitee | one invite per person per box |

Cards carry **words of wisdom** (`tips: [string]`, rendered as a list; legacy
freeform `notes` shows as a single tip and migrates on next save).

**Bio pages** (`#/u/username`): a person's page shows exactly what they've let
you see — cards shared with you directly plus cards on group shelves you both
stand at — topped by their words of wisdom (curated via `wisdom` on their
profile; drawn from their visible cards until they curate).

**Group boxes** are shared shelves, deliberately separate from friendships:
joining one never touches anyone's connections list. Everyone keeps exactly
one personal box; a group box holds *access* to cards members chose to put on
it. Only the creator invites/removes (invites by username, accept/decline);
creating a box requires inviting at least one person (a box for one is just a
tag). A card can sit in at most 4 group boxes — the security rules check
membership with a fixed number of indexed lookups, since rules can't loop.

A shared card can be **copied into your own box** ("Copy to my box"): a new
doc owned by you, with media bytes re-uploaded into your own Storage area and
`copiedFrom` recording whose card it was — so the copy survives unsharing,
deletion, or the original owner's account going away.

Queries filter on a single field only (`ownerUid ==`, `array-contains`) so no
composite indexes are needed; sorting is client-side. Rules live in the root
`firestore.rules`.

Media uploads go to Storage under `users/{uid}/recipebox/{recipeId}/` (covered
by the existing `storage.rules` size/type limits); docs store tokenized
download URLs so shared viewers can see them.

### AI import (`#/import`)

Two ways to bring an existing recipe in:

- **From photos** — snap the handwritten card or cookbook page (up to 4
  photos); the AI reads it into card fields and the original photos are
  attached to the card, so the handwriting is preserved.
- **By voice** — record someone talking through the recipe (MediaRecorder,
  5-minute cap); the AI transcribes and structures it.

Both land on the normal `#/new` edit form as an unsaved draft for human
review. Recipes in any language are kept in their original language (nonna's
Italian stays Italian); the detected language is shown on the review banner.

Powered by **Gemini (`gemini-2.5-flash`) via Firebase AI Logic** — the client
SDK talks to the model through the Firebase project, so no API key ships in
the code. `js/ai.js` is the only file that knows the provider; to move a path
to a different model later (e.g. Claude for handwriting), swap its internals.

**One-time setup**: in the Firebase console, open **AI Logic** (Build section)
and enable the **Gemini Developer API** backend. Until then, imports fail with
a toast pointing at this step. Optional hardening: enable App Check to keep
other sites from borrowing the endpoint.

## Deploying

```bash
./deploy.sh recipebox
```

CI (`.github/workflows/deploy.yml`) copies this directory into
`apps/portfolio/public/projects/recipebox/` on every deploy, like the other
static apps.
