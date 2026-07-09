# React Tools (`/tools/<slug>`)

This is the standard home for small React tools/web toys so they ship as part of
the main portfolio SPA with clean URLs (no `.html`, no hash routing).

## How it works

- Each tool is a React component living in `src/tools/<slug>/index.jsx`
  (default export).
- `src/tools/registry.js` maps a URL slug to a lazily-imported component plus
  title/description metadata.
- `src/App.js` routes `/tools/:slug` (via `BrowserRouter`) to `ToolPage`, which
  looks the slug up in the registry and renders the tool **full-bleed** — no
  portfolio nav or container — so the component owns the whole viewport.
- `/tools` (client-side) renders `ToolsIndex`, a card list of everything in the
  registry.
- Lazy imports mean each tool is code-split into its own chunk; adding tools
  does not grow the main bundle.
- Hosting: Firebase's existing SPA rewrite (`!/projects/** → /index.html` in
  `firebase.json`) already sends `/tools/<slug>` to the SPA. No hosting config
  changes are needed per tool.

## Adding a new tool (the whole workflow)

1. Create `src/tools/<slug>/index.jsx` with the component as the default
   export. Multi-file tools are fine — keep everything inside the
   `src/tools/<slug>/` folder.
2. Register it in `src/tools/registry.js`:

   ```js
   {
     slug: "my-tool",
     title: "My Tool",
     description: "One-line description for the /tools index.",
     added: "YYYY-MM-DD",
     component: lazy(() => import("./my-tool")),
   }
   ```

3. If the tool needs a new npm package, add it to `apps/portfolio/package.json`
   (`npm install <pkg>` in `apps/portfolio/`).
4. Verify with `npm run build` in `apps/portfolio/` (or `npm start` to try it
   locally at `http://localhost:3000/tools/<slug>`).
5. Deploy from the repo root: `./deploy.sh portfolio`. The tool is live at
   `https://www.joshcocciardi.com/tools/<slug>`.

## Conventions for generated components

- Default-export a single root component; no props required to render.
- Self-contained styling (inline styles or a `<style>` tag) — the page is
  full-bleed, so the component should set its own background and layout.
- Prefer dependencies already in `package.json` (react, recharts,
  semantic-ui-react); call out anything new.

## Legacy patterns (superseded)

- `public/apps/` (Babel-in-browser JSX viewer) and one-off static HTML files in
  `public/tools/` predate this setup. New tools should use the registry above.
- Note: `public/tools/index.html` (the old static tools hub) still shadows the
  SPA `/tools` index on a direct page load, because Firebase serves static
  files before rewrites. Individual `/tools/<slug>` routes are unaffected.
  Removing/merging the old hub is planned cleanup.
