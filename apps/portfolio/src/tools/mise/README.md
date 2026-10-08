# Mise — a convergence chart for implementation work

Live at `/tools/mise`. Tasks sit on the left and bracket rightward through merge
blocks until they converge on one outcome. Dependencies are structural, so no
arrows are ever drawn. Full background is in the handoff spec this was built
from; this file covers what the shipped version does and how it persists.

## Layout

| File | What it holds |
|---|---|
| `index.jsx` | Root. Auth state, the plan list, and which plan is open. |
| `AuthScreen.jsx` | Sign in / create account / reset password. |
| `Picker.jsx` | The shelf of implementations, plus the new-plan form. |
| `Editor.jsx` | One implementation: the chart, the action dock, and all writes. |
| `Chart.jsx` | Presentational cells, owner stripe, progress track, plan view. |
| `tree.js` | Tree model, layout engine, seed templates. Pure, no React. |
| `themes.js` | Color themes, as CSS custom properties scoped to `t-<key>`. |
| `ThemePicker.jsx` | The row of theme swatches used in the editor, picker, and new-plan form. |
| `transfer.js` | JSON import and export. Pure, plus one download helper. |
| `store.js` | Firestore reads and writes. |
| `auth.js`, `firebase.js` | Firebase app, providers, friendly error strings. |

## Data model

One document per implementation. These trees run to the low hundreds of nodes
and are always read whole, so splitting them per node would buy nothing.

```
mise_implementations/{implId}
  ownerUid   uid of the only account that can read or write it
  name       "Sunrise CU go-live"
  client     optional
  tree       nested { id, name, owner, done, children[] }
  layout     { depthWindow: 3|4|5, view: "chart"|"plan", focusId, theme }
  createdAt, updatedAt

mise_implementations/{implId}/events/{eventId}
  nodeId, nodeName, type, actor, at
```

Notes:

- `done` is only meaningful on end steps. Merge blocks derive completion from
  the leaves beneath them and are never toggled directly.
- `layout` is persisted with the plan rather than in local storage, so the depth
  window, the view, and where you were zoomed follow you between devices. Which
  plan you had open last is local-only (`localStorage`), since that is a
  per-device convenience.
- **Nesting is capped at 9 levels** (`MAX_DEPTH` in `tree.js`). Firestore stops
  at 20 levels of map/array nesting and one tree level costs two, so the cap
  keeps the client from building a tree it cannot save. `＋ step left` disables
  itself at the limit instead of failing at write time.

### The event ledger

`events` is append-only and nothing reads it yet. It exists so that running this
across several implementations yields empirical cycle times for free: end steps
are dateless but timestamped when they open and close, so after a few
implementations you can forecast merge-block targets from your own history.

Types written today: `opened` (step created), `closed` (marked done),
`reopened`, and `deleted` — the last so a step removed while still open doesn't
read as forever-open in that math. `nodeId` is the join key back into the tree;
`nodeName` is a snapshot from the moment of the event, so a step renamed later
keeps its old name in the ledger.

## Themes

Six themes: **Pine** (the original), **Ember** (orange), **Harbor** (blue),
**Fuchsia**, **Ink** (black and white with one red accent), and **Terminal**
(green on black, all monospace). Each is a block of CSS custom properties in
`themes.js`; `styles.js` and the inline owner colors in `tree.js` only ever
read those tokens, so adding a theme is one entry in `THEMES` and nothing else.

The theme is stored per plan in `layout.theme` and picked from the swatches in
the editor's second row (or on the new-plan form). The shelf and sign-in screen
use a separate per-device theme kept in `localStorage`, and each card on the
shelf wears its own plan's theme. Older plans without a theme read as Pine.

## JSON import and export

`export ↓` in the editor downloads the open plan; `export all ↓` on the shelf
downloads every plan in one file. `import ↑` on the shelf takes pasted JSON or
a `.json` file and creates new plans from it. One plan opens straight away;
several land on the shelf.

```json
{
  "format": "mise",
  "version": 1,
  "name": "Kitchen remodel",
  "client": "",
  "theme": "ember",
  "tree": {
    "name": "Kitchen done",
    "children": [
      { "name": "Demo complete", "children": [
        { "name": "Permit approved", "owner": "third", "done": true },
        { "name": "Cabinets removed", "owner": "us" }
      ] },
      { "name": "Countertop chosen", "owner": "them" }
    ]
  }
}
```

- Several plans go in `{ "plans": [ … ] }` or a plain array.
- A bare tree (`{ "name", "children" }` with no wrapper) is also accepted; the
  plan is named after its outcome.
- Import is forgiving about hand-written files: `title`/`label` work for
  `name`, `steps` works for `children`, owners like `client` or `vendor` map
  to `them` and `third`, and `"status": "done"` counts as done. `done` is
  ignored on merge blocks, which always derive it.
- Ids are never exported and are regenerated on import, so the same file can
  be imported twice without colliding. The event ledger isn't exported.
- Files deeper than `MAX_DEPTH` or over 2,000 steps are refused with a
  message, rather than failing at write time.

Tests: `node test/mise-transfer.test.mjs` from `apps/portfolio`.

## Writes

Edits land in local state immediately and are flushed to Firestore on a 600ms
debounce, so renaming a step is one write rather than one per keystroke. The
header shows `saving…` / `saved`, and offers a retry if a write fails. Pending
edits are also flushed on unmount and on `pagehide`/tab-hide, so navigating away
mid-edit doesn't strand a change.

A plan open in two places stays in sync through `onSnapshot`, but a remote
update is only adopted when there is no local edit still on its way out —
otherwise an echo of your own write could clobber what you just typed.

## Security rules

In the repo-root `firestore.rules`. Plans are private to `ownerUid`, ownership
can't be reassigned after create, and the ledger is append-only.

**The `mise_` carve-out in the catch-all rule at the bottom of that file is
load-bearing.** Firestore grants access if *any* matching rule allows it, so
without `!collection.matches('mise_.*')` the catch-all would override
everything above and let every signed-in user read and write every other user's
plans. Don't remove it.

## Local development

```bash
cd apps/portfolio && npm start          # → http://localhost:3000/tools/mise
```

That talks to the real Firebase project. To work against the emulator suite
instead, so sign-ups and writes don't touch production:

```bash
firebase emulators:start --only auth,firestore
REACT_APP_FIREBASE_EMULATORS=1 npm start
```

The env var is compiled in at build time and `deploy.sh` never sets it, so
production builds always point at the real project.

## Deploying

```bash
./deploy.sh firestore     # rules — required before the tool works for anyone
./deploy.sh portfolio     # the app
```

Auth providers used are Google and email/password; both are already enabled on
the project. Google sign-in also requires the serving domain to be listed under
Firebase Auth → Settings → Authorized domains.

## Known gaps

- **Tasks feed exactly one merge block.** A step gating two branches would make
  this a DAG, and the layout engine assumes a tree. Worth settling before the
  shape of stored data gets harder to change.
- **No sharing.** Plans are private to their owner. A client-facing read-only
  view is the obvious next step, and the rules are shaped so a `sharedWith`
  array could be added without restructuring.
- **No time layer.** End steps stay dateless by design; dates belong at merge
  boundaries when that lands.
- **Filtering by owner** ("show me only what is on them") falls straight out of
  the existing data with no new fields, and is the cheapest next feature.
