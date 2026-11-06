/* --------------------------------------------------------------------------
   Apps with their own address.

   Every entry is a Firebase Hosting site, josh-cocciardi-<sub>.web.app, set
   up in firebase.json / .firebaserc and deployed by CI. Once the custom
   domain is connected in the Firebase console (see SUBDOMAINS.md), flip
   `live` to true and the rest of the site starts linking to
   <sub>.joshcocciardi.com instead of the old path. The old path keeps
   working either way.

   `tool` marks a React tool from src/tools/registry.js. Those sites serve
   the portfolio build, and App.js renders the tool whose hostname this is.
   -------------------------------------------------------------------------- */

export const ROOT_DOMAIN = "joshcocciardi.com";

export const DOMAINS = {
  // Static apps
  "party-room": { sub: "partyroom", path: "/projects/party-room", live: false },
  canitwo: { sub: "canitwo", path: "/projects/canitwo", live: false },
  parkday: { sub: "parkday", path: "/projects/disney-trivia", live: false },
  camboku: { sub: "camboku", path: "/projects/camboku", live: false },
  camboy: { sub: "camboy", path: "/projects/camboy", live: false },
  "swing-coach": { sub: "swingcoach", path: "/projects/swing-coach", live: false },
  "tophat-spears": { sub: "tophat", path: "/projects/tophat-spears", live: false },

  // React tools
  "tool-mise": { sub: "mise", tool: "mise", path: "/tools/mise", live: false },
  "tool-channel-surfer": { sub: "channelsurfer", tool: "channel-surfer", path: "/tools/channel-surfer", live: false },
  "tool-sunday-desk": { sub: "sundaydesk", tool: "sunday-desk", path: "/tools/sunday-desk", live: false },
  "tool-myreadingbuddy": { sub: "readingbuddy", tool: "myreadingbuddy", path: "/tools/myreadingbuddy", live: false },
  "tool-meal-planner": { sub: "mealplanner", tool: "meal-planner", path: "/tools/meal-planner", live: false },

  // Already their own sites; only the custom domain is new.
  roy: { sub: "roy", site: "josh-cocciardi-roy", path: "https://josh-cocciardi-roy.web.app", live: false },
  weather: { sub: "weather", site: "josh-cocciardi-weather", path: "https://josh-cocciardi-weather.web.app", live: false },
};

const siteId = (d) => d.site || `josh-cocciardi-${d.sub}`;

/* Where a project should link: its subdomain once live, otherwise its path. */
export const linkFor = (id, fallback) => {
  const d = DOMAINS[id];
  if (!d) return fallback;
  return d.live ? `https://${d.sub}.${ROOT_DOMAIN}` : d.path;
};

/* What to print under a project's name. */
export const hostFor = (id, fallback) => {
  const d = DOMAINS[id];
  if (!d) return fallback;
  if (d.live) return `${d.sub}.${ROOT_DOMAIN}`;
  return d.path.startsWith("http") ? d.path.replace(/^https?:\/\//, "") : `${ROOT_DOMAIN}${d.path}`;
};

/* The tool slug this page should render on its own, if it was served from a
   tool's subdomain or its web.app site. Null on the main site. */
export const toolForHost = (hostname = typeof window !== "undefined" ? window.location.hostname : "") => {
  const host = hostname.toLowerCase();
  for (const d of Object.values(DOMAINS)) {
    if (!d.tool) continue;
    if (host === `${d.sub}.${ROOT_DOMAIN}` || host === `${siteId(d)}.web.app` || host === `${siteId(d)}.firebaseapp.com`) {
      return d.tool;
    }
  }
  return null;
};
