# Private pages (`/work/<slug>`)

Sign-in-gated pages that are **not** part of the public site. They live outside
`src/tools/` on purpose: that registry feeds `/tools` and `/projects`, so
anything in it is advertised. Nothing here is ever listed anywhere.

Currently: `/work/onboarding` — the Casap intake emulator.

## How access works

Three separate things, and it's worth being precise about which one is real:

1. **The client gate** (`access.js`, `AuthGate.jsx`). Google sign-in, then the
   address is checked against `ALLOWED_EMAILS`. A visitor who isn't on the list
   sees "No access" instead of the page.
2. **The Firestore rules** (`work_private` in the repo-root `firestore.rules`).
   Same allowlist, enforced server-side, plus an owner check on the document id.
3. **Noindex** — `X-Robots-Tag: noindex, nofollow, noarchive` on `/work/**` in
   `firebase.json`, a matching `<meta name="robots">` injected by `WorkPage.js`,
   and `Disallow: /work` in `public/robots.txt`.

**Only #2 is a security boundary.** The portfolio is a static SPA, so the
JavaScript for these pages is downloadable by anyone who knows the URL — the
client gate stops the page from *rendering*, not from being fetched. What it
can't do is get at the saved data, because the rules check a verified Google
identity that can't be faked client-side. So: don't put anything in the page
source that would be a problem to publish, and do rely on the rules for the data.

If you ever want the code itself private too, that needs a different hosting
shape than Firebase static hosting — a Cloud Function or Cloud Run service that
checks the session before serving the bundle.

### Changing who has access

Edit `ALLOWED_EMAILS` in `access.js` **and** the matching list in the
`work_private` block of `firestore.rules`, then deploy both:

```bash
./deploy.sh firestore
./deploy.sh portfolio
```

Changing only the client list gives someone a page that can't load or save
anything; changing only the rules leaves them locked out at the gate.

## Adding a page

1. `src/work/<slug>/index.jsx`, default export. It receives two props:
   `user` (the Firebase user, already allowlisted) and `pageKey`.
2. Register it in `registry.js` with a `lazy(() => import(...))` component and a
   permanent `pageKey`.
3. Build and deploy `./deploy.sh portfolio`. Firebase's SPA rewrite
   (`!/projects/**` → `/index.html`) already routes `/work/<slug>`, and the
   `/work/**` headers already cover it — no hosting config change per page.

## Persistence

`store.js` writes one document per (user, page) at
`work_private/{uid}__{pageKey}`.

The payload is a **JSON string**, not a nested map. Firestore stops at 20 levels
of map/array nesting and the intake questionnaire costs four levels per question
depth (`nodes[] → node{} → options[] → option{}`), so a deeply nested branch
stored natively would fail at write time. A string only has to fit the 1MB
document limit, which this is nowhere near.

Writes are debounced 800ms and skipped when the serialized state matches what
was last read or written, so a session that only reads doesn't write anything
back.

## Local development

```bash
cd apps/portfolio && npm start     # → http://localhost:3000/work/onboarding
```

That talks to the real Firebase project. `localhost` is already an authorized
domain for Firebase Auth, so Google sign-in works. To work against the emulator
suite instead:

```bash
firebase emulators:start --only auth,firestore
REACT_APP_FIREBASE_EMULATORS=1 npm start
```
