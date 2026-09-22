# Portfolio tests

Tests that need more than a bundler. Create React App's jest only scans
`src/`, so nothing in here runs during `npm test` or the deploy build.

## `draftnight-rules.test.mjs`

Firestore security-rules tests for the Draft Night tool: they prove one
signed-in user cannot read, write, delete, or list another user's league, that
ownership cannot be reassigned after create, and that signed-out clients are
shut out of the collection entirely.

Needs the Firestore emulator running against the repo's real `firestore.rules`:

```sh
# from the repo root, in one terminal
firebase emulators:start --only firestore --project josh-cocciardi

# in another
cd apps/portfolio
npm i --no-save @firebase/rules-unit-testing
node test/draftnight-rules.test.mjs
```

Exits non-zero if any case fails.

## `mealplan-rules.test.mjs`

Firestore security-rules tests for the Family Meal Planner: household members
(matched by verified email) share recipes, days, and inventory; strangers,
signed-out clients, and an unverified account claiming a member's address get
nothing; and a member can't remove themselves, empty the list, or take over
the household. Same setup as the Draft Night suite:

```sh
firebase emulators:start --only firestore --project josh-cocciardi
cd apps/portfolio
npm i --no-save @firebase/rules-unit-testing
node test/mealplan-rules.test.mjs
```

## `meal-planner.test.mjs`

Pure-helper tests for the Meal Planner: Monday-to-Sunday week math across
month, year, and DST boundaries; the inventory splitter (commas, semicolons,
and new lines only, so "mac and cheese" stays whole); per-person slot states;
and link normalizing. No dependencies and no emulator:

```sh
cd apps/portfolio
node test/meal-planner.test.mjs
```

`deploy.sh` and the CI workflow both run it before the portfolio build.

## `swing-coach.test.mjs`

Geometry tests for Swing Coach. The page is one static file with its analysis
engine inlined, so the suite pulls that engine straight out of the shipped
HTML and drives it with synthetic swings built from joint angles — the thing
under test is literally the thing that gets deployed.

Covers phase detection (setup, coil, launch, contact, finish), the ten checks
and their thresholds, the baseball and golf profiles, left- and right-handed
swings, which checks sit out from each camera angle, and the two cases where
it should refuse to say anything: a clip with no swing in it, and too few
frames to read.

No dependencies and no emulator:

```sh
cd apps/portfolio
node test/swing-coach.test.mjs
```

Exits non-zero if any case fails. `deploy.sh` and the CI workflow both run it
before the portfolio build.
