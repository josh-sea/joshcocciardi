import { lazy } from "react";

// Private pages served at /work/<slug>.
//
// Deliberately separate from src/tools/registry.js: that registry feeds the
// public /tools and /projects indexes, so anything listed there is advertised.
// Nothing here is ever rendered into an index — a /work page is reachable only
// by knowing its URL, and only after passing the allowlist in ./access.js.
//
// To add one:
//   1. Drop the component in src/work/<slug>/index.jsx (default export).
//   2. Add an entry below, with `component` as lazy(() => import(...)) so the
//      page is code-split and never lands in the main portfolio bundle.
//   3. Build + deploy (`./deploy.sh portfolio`). Firebase's SPA rewrite already
//      routes /work/<slug> into the app; no hosting config change per page.
const workPages = [
  {
    slug: "onboarding",
    title: "Intake Emulator",
    // Storage key for the per-user Firestore doc (see ./store.js). Changing it
    // orphans whatever was already saved, so treat it as permanent.
    pageKey: "onboarding-intake-v1",
    component: lazy(() => import("./onboarding")),
  },
];

export default workPages;
