---
name: verify
description: Build and drive the portfolio SPA (and /tools/<slug> tools) in headless Chromium to verify changes at the GUI surface.
---

# Verifying portfolio changes

Build: `cd apps/portfolio && npm install && CI=true npm run build` (CRA; CI=true
makes warnings non-fatal errors visible without watch mode).

Serve the production build with an SPA fallback (mimics the Firebase rewrite —
CRA assumes it is hosted at `/`, and `/tools/<slug>` must fall back to
`index.html`):

```js
// serve.js — node serve.js (port 4173)
const http = require("http"), fs = require("fs"), path = require("path");
const root = "<repo>/apps/portfolio/build";
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, "index.html");
  fs.createReadStream(p).pipe(res);
}).listen(4173);
```

Drive with the globally installed Playwright
(`NODE_PATH=/opt/node22/lib/node_modules node script.js`; Chromium is at
`/opt/pw-browsers`, already configured — do not `playwright install`).

Gotchas learned the hard way (remote sandbox):

- Headless Chromium has **no direct egress**, and the agent proxy only accepts
  CONNECT, so plain-HTTP localhost cannot be routed through it — configuring
  `proxy:` on `chromium.launch` breaks localhost (405) without fixing remote
  fetches. Don't fight it: leave the browser proxy-less and stub external APIs
  with `context.route(url, route.fulfill(...))` serving real JSON downloaded
  via curl (curl uses the proxy fine).
- Downloads: `page.waitForEvent("download")` works headless; use it to verify
  blob-download features (.m3u export etc.).
- Clipboard: grant `["clipboard-read", "clipboard-write"]` context permissions,
  then read back with `navigator.clipboard.readText()`.
- Custom URL schemes (`vlc-x-callback://` etc.) do not navigate in headless
  Chromium — the click is observable but the handoff isn't; note it as
  unverifiable rather than failing it.
