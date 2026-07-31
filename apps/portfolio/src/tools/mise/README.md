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
  layout     { depthWindow: 3|4|5, view: "chart"|"plan", focusId }
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
