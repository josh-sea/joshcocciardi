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
