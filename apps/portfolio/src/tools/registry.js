import { lazy } from "react";

// Registry of React tools served at /tools/<slug>.
//
// To add a new tool:
//   1. Drop the component in src/tools/<slug>/index.jsx (default export).
//   2. Add an entry below. `component` MUST use lazy(() => import(...)) so
//      each tool is code-split into its own chunk and doesn't bloat the
//      main portfolio bundle.
//   3. Build + deploy (`./deploy.sh portfolio` from the repo root). Firebase's
//      SPA rewrite already routes /tools/<slug> here — no config changes needed.
const tools = [
  {
    slug: "income-inequality",
    title: "Whose Wealth Rides the Money Supply",
    description:
      "Money supply vs. wealth concentration (the Cantillon chart), plus real income growth by quintile since 1967.",
    added: "2026-07-09",
    component: lazy(() => import("./income-inequality")),
  },
  {
    slug: "analyzer",
    title: "The Hit Field",
    description:
      "Little League batted-ball physics: hit probability heat map, field simulator, and player luck report from an in-browser logistic regression.",
    added: "2026-07-11",
    component: lazy(() => import("./analyzer")),
  },
  {
    slug: "channel-surfer",
    title: "Channel Surfer",
    description:
      "Search the iptv-org channel guide (~40k channels, ~17k live streams) by name, country, or category, then open any stream in VLC or copy its link.",
    added: "2026-07-20",
    component: lazy(() => import("./channel-surfer")),
  },
];

export default tools;
