import { listedTools } from "../tools/registry";
import { DOMAINS, hostFor, linkFor } from "./domains";

/* ------------------------------------------------------------------------ */
/*  Everything the public pages say about me and what I've built.           */
/*  Home, Projects and Contact all read from here, so a change to a link    */
/*  or a job title happens in exactly one place.                            */
/* ------------------------------------------------------------------------ */

export const PROFILE = {
  name: "Josh Cocciardi",
  role: "Technical Implementation Manager",
  company: "Casap",
  location: "Greater NYC",
  email: "joshua.cocciardi@gmail.com",
  phone: "(845) 392-1971",
  phoneHref: "tel:+18453921971",
  linkedin: "https://www.linkedin.com/in/joshcocciardi",
  github: "https://github.com/josh-sea",
};

export const EXPERIENCE = [
  {
    company: "Casap",
    role: "Technical Implementation Manager",
    when: "2025 to now",
    current: true,
    summary:
      "I take new customers from signed contract to live. That means scoping the integration, mapping their data and workflows onto the platform, coordinating engineering on both sides, and staying on until the launch is boring.",
  },
  {
    company: "Riskified",
    role: "Integration Engineer",
    when: "Before Casap",
    summary:
      "Integrated fraud prevention into e-commerce checkout flows. Owned the integration lifecycle and sat between product, engineering and the merchant's own developers.",
  },
  {
    company: "Enertiv",
    role: "QA Engineer & BI Lead",
    when: "Earlier",
    summary:
      "Led business intelligence and the move to Power BI. Built internal tools for hardware health monitoring and shipped client-facing dashboards.",
  },
];

export const EDUCATION = [
  { school: "Flatiron School", detail: "Immersive Software Engineering" },
  { school: "University of Connecticut", detail: "BSE, Mechanical Engineering (Energy & Power)" },
];

export const STACK = [
  "JavaScript / TypeScript",
  "React & React Native",
  "Node & Cloud Functions",
  "Firebase & Firestore",
  "Python",
  "SQL",
  "Claude API",
  "Three.js / Canvas",
];

/* ------------------------------------------------------------------------ */
/*  Projects                                                                */
/*                                                                          */
/*  kind:     apps | tools | play | elsewhere                               */
/*  link:     "/path" for something on this site, "https://..." for         */
/*            something hosted on its own domain.                           */
/*  blurb:    one line for the card. `description` is the long version,     */
/*            shown when the card is opened.                                */
/*  Promotion, frames and subdomains are applied below ALL_PROJECTS; the   */
/*  addresses themselves live in domains.js.                                */
/* ------------------------------------------------------------------------ */

const PROJECTS = [
  // ── Featured: live on their own and worth a visit ─────────────────────────
  {
    id: "gramandpops",
    kind: "apps",
    title: "Gram & Pop's Recipe Box",
    host: "gramandpops.com",
    blurb: "The family recipe box, digitized. No blogs, no ads, just the cards.",
    description:
      "Write recipes onto simple cards, attach photos or videos of the people who make them, connect with family, and hand cards (or your whole box) to each other.",
    tech: ["JavaScript", "Firebase Auth", "Firestore", "Storage", "PWA"],
    link: "https://gramandpops.com",
  },
  {
    id: "roy",
    kind: "play",
    title: "Roy",
    host: "josh-cocciardi-roy.web.app",
    blurb: "A two-player, turn-based territory game. Claim the grid, then talk trash.",
    description:
      "Formerly Color Chasers, and my first React Native app. Challenge a friend to a game that lives on both phones, take turns claiming cells, and box in the board before they do. There's a practice mode against the Computer Overlord, a solo mode, bigger and smaller boards, themes, emote packs and move effects.",
    tech: ["React Native", "Expo", "Firebase Realtime Database", "Cloud Functions"],
    link: "https://josh-cocciardi-roy.web.app",
    images: [
      { src: require("../assets/colorchasers1.png"), alt: "Roy early game" },
      { src: require("../assets/colorchasers2.png"), alt: "Roy late game" },
    ],
  },
  {
    id: "party-room",
    kind: "play",
    title: "Party Room",
    host: "joshcocciardi.com/party",
    blurb: "The Houseparty games, rebuilt for the family. Everyone plays on their own phone.",
    description:
      "One person starts a room and reads out a five-letter code; everyone else joins on their own phone. Five games: Forehead (phone to forehead, nod for got it), Trivia, Quick Sketch, Chips & Dip, and Word Race. The host's phone runs the game and keeps secrets out of everyone else's reach; if it drops, the next phone carries on.",
    tech: ["JavaScript", "Firebase Realtime Database", "Canvas API", "Device Orientation", "Web Audio"],
    link: "/projects/party-room",
  },

  {
    id: "weather",
    kind: "apps",
    title: "Weather",
    host: "josh-cocciardi-weather.web.app",
    blurb: "The forecast, plus a short summary in the voice you pick. Snarky is the default.",
    description:
      "Search a town or zip, or use where you are. The forecast comes from Pirate Weather through a Cloud Function that holds the key, and Claude writes the summary for now, today, tomorrow, the week or the weekend in one of several personalities. The bevelled buttons are where this site's look came from.",
    tech: ["React Native", "Expo", "Cloud Functions", "Claude API", "Pirate Weather"],
    link: "https://josh-cocciardi-weather.web.app",
  },

  // ── Apps: real accounts, real users, live data ───────────────────────────
  {
    id: "moments",
    kind: "apps",
    title: "Moment Capture",
    blurb: "Capture daily moments and stitch them into video compilations.",
    description:
      "Mobile-first PWA with Google sign-in, camera capture, a review queue, gallery, and FFmpeg-powered export, all on Firebase.",
    tech: ["React", "Vite", "Firebase", "FFmpeg", "PWA"],
    link: "/projects/moments",
  },
  {
    id: "collector",
    kind: "apps",
    title: "Collector Shop",
    blurb: "Shared inventory for cards, comics and memorabilia, with profit tracking.",
    description:
      "Add items in one tap, then fill in price paid, grading, tags and photos later. Log sales, check recent eBay sold comps, and watch a live dashboard of cost basis, profit and margins. Two collaborators share one shop with an invite code.",
    tech: ["React", "Vite", "Firestore", "Storage", "Tailwind CSS"],
    link: "/projects/collector",
  },
  {
    id: "swing-coach",
    host: "joshcocciardi.com/projects/swing-coach",
    kind: "apps",
    title: "Swing Coach",
    blurb: "A pose model reads your swing 30 times a second, plus a GPS golf caddy.",
    description:
      "The analyzer reads stance width, knee bend, spine angle, head travel, hip/shoulder sequencing and balance, and talks you through fixes out loud. Video never leaves the device. The golf caddy reads distance and terrain from a satellite map, picks a club, and learns how far you actually hit each one.",
    tech: ["MediaPipe", "WebAssembly", "Leaflet", "Firestore", "Web Speech API"],
    link: "/projects/swing-coach",
  },
  {
    id: "workbook",
    kind: "apps",
    title: "Workbook Reader",
    blurb: "Snap a workbook page and tap any word to hear it read aloud.",
    description:
      "AI rebuilds the page's questions and directions on screen. Spoken words are cached in a shared bank so common words play instantly, with an on-device voice fallback. Grown-ups manage a profile per child; the child does the work on paper.",
    tech: ["React", "Firebase", "Gemini Vision", "Cloud TTS", "PWA"],
    link: "/projects/workbook",
  },
  {
    id: "psx",
    kind: "apps",
    title: "PSX Station",
    blurb: "A PlayStation 1 emulator in a browser tab, with saves that sync.",
    description:
      "Drop in a disc image you own and it plays, with gamepad and touch controls. Discs stay on your device; save states and memory cards sync to your account so you can switch from desktop to phone.",
    tech: ["WebAssembly", "EmulatorJS", "IndexedDB", "Cloud Storage", "PWA"],
    link: "/projects/psx",
  },
  {
    id: "solra",
    kind: "apps",
    title: "Solra Trainer",
    blurb: "Practice a constructed language whose phonemes are pure tones.",
    description:
      "Ear training, minimal-pair drills, a 192-word dictionary, a sentence composer with the spec's validator, and a microphone decoder built on Goertzel filters. Every sound is synthesized in the browser.",
    tech: ["Web Audio", "AudioWorklet", "Goertzel DSP", "Spaced repetition"],
    link: "/projects/solra",
  },
  {
    id: "playball",
    kind: "apps",
    title: "Playball",
    blurb: "Walk-up music manager for game day, synced to Spotify.",
    description:
      "Pull in Spotify playlists, set start and stop times per song, assign players, and drag the batting order. The playlist re-syncs automatically.",
    tech: ["Spotify API", "Firebase Auth", "Firestore", "PWA"],
    link: "/projects/playball",
  },
  {
    id: "canitwo",
    kind: "apps",
    title: "CanITwo",
    blurb: "Community bathroom finder for when nature calls on the road.",
    description:
      "See nearby gas stations, stores and cafes on a map, report whether they have a toilet, rate it, and launch directions.",
    tech: ["Leaflet", "OpenStreetMap", "Firestore", "PWA"],
    link: "/projects/canitwo",
  },
  {
    id: "electronic-mail",
    kind: "apps",
    title: "Electronic Mail",
    blurb: "Gmail, but it looks and feels like iMessage.",
    description:
      "Google OAuth, a thread-based chat UI, and Firestore-backed caching for fast loads.",
    tech: ["React", "Firebase", "Google OAuth", "Gmail API"],
    link: "/projects/electronic-mail",
  },

  // ── Games, toys and experiments ──────────────────────────────────────────
  {
    id: "camboy",
    host: "joshcocciardi.com/projects/camboy",
    kind: "play",
    title: "Camboy",
    blurb: "A pocket game console with four cartridges, named for Cam and Bo.",
    description:
      "Flip through the cartridge book and watch one slide into the back before it boots. Sweat Boy (mop the court before the players come back), a 2D Boulder Smash, Dark Hat: Sorcerer's Escape (Campbell's game), and Conway's DOOM. Chiptune music and sound are synthesized in the browser, and it installs to a home screen.",
    tech: ["Canvas API", "Web Audio", "CSS 3D transforms", "PWA"],
    link: "/projects/camboy",
  },
  {
    id: "camboku",
    kind: "play",
    title: "Camboku",
    blurb: "An ad-free logic puzzle with a generator that guarantees one answer.",
    description:
      "Put one face in every row, column and region without two touching. Every board is generated on the spot, then solved by a logic-only solver that sets the difficulty. New 8×8 board daily.",
    tech: ["Procedural generation", "Constraint solving", "PWA"],
    link: "/projects/camboku",
  },
  {
    id: "parkday",
    kind: "apps",
    title: "Park Day",
    blurb: "Everything for a day at Disney World: a ride planner with live waits, trivia, and games for the line.",
    description:
      "The Park Planner reads live wait times and each ride's usual daily curve, so it can say when a line is about to dip; a history tab keeps every wait it has seen. For the line itself: Ticket Book, 248 flip-to-reveal trivia tickets dealt by topic or by park; Where Am I?, a password-protected photo hunt that ends with a pin on the map; and 1 to 10, a guessing game where everyone plays on their own phone.",
    tech: ["JavaScript", "ThemeParks.wiki", "Cloud Functions", "Firestore", "Web Audio", "PBKDF2"],
    link: "/projects/disney-trivia",
  },
  {
    id: "tophat-spears",
    host: "joshcocciardi.com/tophat",
    kind: "play",
    title: "Tophat & Spears",
    blurb: "Co-op RTS and FPS in one match for up to five friends.",
    description:
      "One player commands squads from above while up to four others drop into those marines in first person. One browser runs the battle and streams it to the rest; if it leaves, the next one picks it up.",
    tech: ["Three.js", "WebGL", "Firebase Realtime Database", "Pointer Lock API"],
    link: "/projects/tophat-spears",
  },
  {
    id: "boulder-smash",
    kind: "play",
    title: "Boulder Smash",
    blurb: "A 3D smash-em-up for kids, playable on a phone.",
    description:
      "Stomp through four cities, punch buildings down, rescue trapped people, and beat a boss in each. Aim assist and an on-screen controller make it work on touch.",
    tech: ["Three.js", "WebGL", "Web Audio"],
    link: "/projects/boulder-smash",
  },
  {
    id: "deadnet",
    kind: "play",
    title: "Dead Net",
    blurb: "Dead Internet Theory as a Grateful Dead fan forum. You're the only human.",
    description: "Every thread, reply and reaction is posted by a bot.",
    tech: ["JavaScript", "Canvas API"],
    link: "/projects/deadnet",
  },
  {
    id: "binary",
    kind: "play",
    title: "Binary Flip Counter",
    blurb: "A wooden split-flap clock that counts in base 2.",
    description: "Hours, minutes and seconds each get a tray of flipping tiles, with the decimal value alongside.",
    tech: ["JavaScript", "CSS 3D transforms"],
    link: "/projects/binary",
  },
  {
    id: "camcoded",
    kind: "play",
    title: "Cam's Secret Decoder",
    blurb: "A retro cipher tool for passing secret messages.",
    description: "A custom A to Z substitution cipher with a full reference table.",
    tech: ["JavaScript", "CSS"],
    link: "/projects/camcoded",
  },
  {
    id: "writer",
    kind: "play",
    title: "Spelling Detective",
    blurb: "Spelling practice with pattern sorts and look-cover-write-check drills.",
    description: "Tricky letter identification and custom word lists, too.",
    tech: ["JavaScript", "CSS"],
    link: "/projects/writer",
    images: [{ src: require("../assets/writersImage.png"), alt: "Spelling Detective screenshot" }],
  },
  {
    id: "doom-life",
    kind: "play",
    title: "Conway's DOOM",
    blurb: "A maze whose walls follow Conway's Game of Life. Now a Camboy cartridge.",
    description:
      "Still lifes stand like walls, oscillators flap like doors, gliders drift across the room and glider guns keep firing them. Shoot a cell and the pattern carries on without it (shoot one cell of a block and it grows back), plant seed cells to grow your own, and reach the exit. Six built levels, then endless fields, plus a field guide to the patterns.",
    tech: ["Canvas API", "Web Audio"],
    link: "/projects/camboy/?cart=conway-doom",
  },

  // ── Lives somewhere else ─────────────────────────────────────────────────
  {
    id: "weight-challenge",
    kind: "elsewhere",
    title: "Weight Challenge Bros",
    blurb: "A weight-loss tracker for friends, with charts and friendly competition.",
    description: "Collaborative tracking with interactive charts.",
    tech: ["React", "Chart.js", "Firebase"],
    link: "https://weightchallengebros.com/home",
    images: [{ src: require("../assets/weight_challenge.png"), alt: "Weight tracking dashboard" }],
  },
  {
    id: "never-late",
    kind: "elsewhere",
    title: "Never Late",
    blurb: "A Fitbit clock face that runs up to 15 minutes fast, at random.",
    description: "Healthy uncertainty to keep you punctual.",
    tech: ["Fitbit SDK", "JavaScript"],
    link: "https://gallery.fitbit.com/details/515c8da3-82a8-4aaf-8446-587398ef4cdb",
  },
  {
    id: "nba",
    kind: "elsewhere",
    title: "NBA Performance Predictor",
    blurb: "An LSTM that predicts player props from scraped box scores.",
    description: "Automated scraping for retraining, with interactive Streamlit dashboards.",
    tech: ["Python", "LSTM/RNN", "Streamlit"],
    images: [
      { src: require("../assets/nba_prediction.png"), alt: "Player prediction interface" },
      { src: require("../assets/nba_team_stats.png"), alt: "Team statistics dashboard" },
      { src: require("../assets/nba_player_chart.png"), alt: "Player performance trend" },
    ],
  },
];

// Tools come from the tools registry so this list can't drift from /tools.
const firstSentence = (s) => {
  // A sentence ends at . ! or ? followed by a capital letter or the end, so
  // "Money supply vs. wealth" stays whole.
  const m = s.match(/^.*?[.!?](?=\s+[A-Z]|$)/);
  return (m ? m[0] : s).trim();
};

const TOOLS = [
  ...listedTools.map((t) => ({
    id: `tool-${t.slug}`,
    kind: "tools",
    title: t.title,
    blurb: firstSentence(t.description),
    description: t.description,
    tech: t.tech || ["React"],
    link: `/tools/${t.slug}`,
  })),
  {
    id: "expense-analyzer",
    kind: "tools",
    title: "Expense Analyzer",
    blurb: "Upload a CSV of transactions and get categorized spending breakdowns.",
    description: "AI-powered categorization and visual analytics for your expenses.",
    tech: ["React", "Data Visualization"],
    link: "/expense-analyzer",
  },
];

// Shorter card lines for the tools that are promoted to their own address.
const TOOL_BLURBS = {
  "tool-mise": "A convergence chart for implementation work. Tasks bracket rightward into one outcome.",
  "tool-channel-surfer": "Search about 40,000 TV channels by name, country or category, and open any live stream in VLC.",
  "tool-sunday-desk": "Matchups, live scoring, both rosters and the waiver wire for a private ESPN fantasy league.",
  "tool-myreadingbuddy": "Photograph a picture book, read it aloud, and the kids can play it back any time.",
  "tool-meal-planner": "Recipes rated by all four of us, the week's plan, and what's in the kitchen.",
};

// Reel frames: real screenshots of each app, keyed by project id.
const FRAMES = {
  gramandpops: require("../assets/reel/gramandpops.jpg"),
  roy: require("../assets/reel/roy.jpg"),
  "party-room": require("../assets/reel/party-room.jpg"),
  weather: require("../assets/reel/weather.jpg"),
  camboy: require("../assets/reel/camboy.jpg"),
  camboku: require("../assets/reel/camboku.jpg"),
  "swing-coach": require("../assets/reel/swing-coach.jpg"),
  "tophat-spears": require("../assets/reel/tophat-spears.jpg"),
  parkday: require("../assets/reel/parkday.jpg"),
  canitwo: require("../assets/reel/canitwo.jpg"),
  collector: require("../assets/reel/collector.jpg"),
  "boulder-smash": require("../assets/reel/boulder-smash.jpg"),
  psx: require("../assets/reel/psx.jpg"),
  deadnet: require("../assets/reel/deadnet.jpg"),
  binary: require("../assets/reel/binary.jpg"),
  "doom-life": require("../assets/reel/doom-life.jpg"),
  "tool-mise": require("../assets/reel/mise.jpg"),
  "tool-channel-surfer": require("../assets/reel/channel-surfer.jpg"),
  "tool-sunday-desk": require("../assets/reel/sunday-desk.jpg"),
  "tool-myreadingbuddy": require("../assets/reel/myreadingbuddy.jpg"),
  "tool-meal-planner": require("../assets/reel/meal-planner.jpg"),
};

const KIND_LABEL = { apps: "App", tools: "Tool", play: "Game", elsewhere: "Elsewhere" };

// Anything with its own address (src/site/domains.js) links there once the
// domain is live, and says so under its name.
export const ALL_PROJECTS = [...PROJECTS, ...TOOLS].map((p) => ({
  ...p,
  blurb: TOOL_BLURBS[p.id] || p.blurb,
  frame: FRAMES[p.id],
  link: DOMAINS[p.id] ? linkFor(p.id, p.link) : p.link,
  host: DOMAINS[p.id] ? hostFor(p.id, p.host) : p.host,
  promoted: p.id === "gramandpops" || Boolean(DOMAINS[p.id]),
  kindLabel: KIND_LABEL[p.kind],
}));

const byId = (id) => {
  const p = ALL_PROJECTS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown project id: ${id}`);
  return p;
};

// The top tier on /projects: every app with its own address.
const PROMOTED_ORDER = [
  "gramandpops", "party-room", "parkday", "tool-meal-planner", "tool-myreadingbuddy",
  "camboy", "camboku", "weather", "tool-mise", "tool-sunday-desk",
  "tool-channel-surfer", "canitwo", "swing-coach", "roy", "tophat-spears",
];
export const PROMOTED = PROMOTED_ORDER.map(byId);

// The reels on the home page. A reel holds exactly seven frames.
export const REELS = [
  {
    id: "family",
    name: "Family",
    blurb: "Built for the four of us, and whoever else is at the table.",
    frames: ["gramandpops", "tool-meal-planner", "tool-myreadingbuddy", "party-room", "parkday", "camboy", "camboku"].map(byId),
  },
  {
    id: "everyday",
    name: "Everyday",
    blurb: "Tools I actually open during the week.",
    frames: ["weather", "tool-mise", "tool-sunday-desk", "tool-channel-surfer", "canitwo", "swing-coach", "collector"].map(byId),
  },
  {
    id: "games",
    name: "Games",
    blurb: "Built for the fun of building them.",
    frames: ["roy", "tophat-spears", "boulder-smash", "psx", "deadnet", "binary", "doom-life"].map(byId),
  },
];

export const SECTIONS = [
  { key: "apps", label: "Apps", blurb: "Sign in, save your stuff, come back to it." },
  { key: "tools", label: "Tools", blurb: "Single-purpose things that do one job well." },
  { key: "play", label: "Games", blurb: "Built for the fun of building them." },
  { key: "elsewhere", label: "Elsewhere", blurb: "Lives on another host, or isn't a website at all." },
];

// Paths served by this SPA's router. Everything under /projects/<name> is a
// separately built static app and needs a real page load.
export const isSpaRoute = (link) =>
  !!link && link.startsWith("/") && !link.startsWith("/projects/");

export const isExternal = (link) => /^https?:\/\//.test(link || "");
