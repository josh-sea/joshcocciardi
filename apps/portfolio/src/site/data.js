import { listedTools } from "../tools/registry";

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
/*  featured: shown large at the top of Projects and on the home page.      */
/* ------------------------------------------------------------------------ */

const PROJECTS = [
  // ── Featured: live on their own and worth a visit ─────────────────────────
  {
    id: "gramandpops",
    kind: "apps",
    featured: true,
    emoji: "🗃️",
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
    featured: true,
    emoji: "🟥",
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
    featured: true,
    emoji: "👋",
    title: "Party Room",
    host: "joshcocciardi.com/party",
    blurb: "The Houseparty games, rebuilt for the family. Everyone plays on their own phone.",
    description:
      "One person starts a room and reads out a five-letter code; everyone else joins on their own phone. Five games: Forehead (phone to forehead, nod for got it), Trivia, Quick Sketch, Chips & Dip, and Word Race. The host's phone runs the game and keeps secrets out of everyone else's reach; if it drops, the next phone carries on.",
    tech: ["JavaScript", "Firebase Realtime Database", "Canvas API", "Device Orientation", "Web Audio"],
    link: "/projects/party-room",
  },

  // ── Apps: real accounts, real users, live data ───────────────────────────
  {
    id: "moments",
    kind: "apps",
    emoji: "📸",
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
    emoji: "🃏",
    title: "Collector Shop",
    blurb: "Shared inventory for cards, comics and memorabilia, with profit tracking.",
    description:
      "Add items in one tap, then fill in price paid, grading, tags and photos later. Log sales, check recent eBay sold comps, and watch a live dashboard of cost basis, profit and margins. Two collaborators share one shop with an invite code.",
    tech: ["React", "Vite", "Firestore", "Storage", "Tailwind CSS"],
    link: "/projects/collector",
  },
  {
    id: "swing-coach",
    kind: "apps",
    emoji: "🏌️",
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
    emoji: "📖",
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
    emoji: "🎮",
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
    emoji: "🎼",
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
    emoji: "⚾",
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
    emoji: "🚽",
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
    emoji: "✉️",
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
    kind: "play",
    emoji: "🕹️",
    title: "Camboy",
    blurb: "A pocket game console with three cartridges, named for Cam and Bo.",
    description:
      "Flip through the cartridge book and watch one slide into the back before it boots. Sweat Boy (mop the court before the players come back), a 2D Boulder Smash, and Dark Hat: Sorcerer's Escape, Campbell's game. Chiptune music and sound are synthesized in the browser, and it installs to a home screen.",
    tech: ["Canvas API", "Web Audio", "CSS 3D transforms", "PWA"],
    link: "/projects/camboy",
  },
  {
    id: "camboku",
    kind: "play",
    emoji: "🧩",
    title: "Camboku",
    blurb: "An ad-free logic puzzle with a generator that guarantees one answer.",
    description:
      "Put one face in every row, column and region without two touching. Every board is generated on the spot, then solved by a logic-only solver that sets the difficulty. New 8×8 board daily.",
    tech: ["Procedural generation", "Constraint solving", "PWA"],
    link: "/projects/camboku",
  },
  {
    id: "disney-trivia",
    kind: "play",
    emoji: "🎟️",
    title: "Ticket Book",
    blurb: "Disney trivia on flip tickets, plus a private photo hunt.",
    description:
      "248 trivia tickets dealt by topic or by park. Where Am I? is a password-protected photo deck: a peephole widens over three taps, then you drop a pin on the map.",
    tech: ["Firestore", "Cloud Storage", "PBKDF2", "Web Audio", "CSS masks"],
    link: "/projects/disney-trivia",
  },
  {
    id: "tophat-spears",
    kind: "play",
    emoji: "🎩",
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
    emoji: "🪨",
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
    emoji: "💀",
    title: "Dead Net",
    blurb: "Dead Internet Theory as a Grateful Dead fan forum. You're the only human.",
    description: "Every thread, reply and reaction is posted by a bot.",
    tech: ["JavaScript", "Canvas API"],
    link: "/projects/deadnet",
  },
  {
    id: "binary",
    kind: "play",
    emoji: "🕰️",
    title: "Binary Flip Counter",
    blurb: "A wooden split-flap clock that counts in base 2.",
    description: "Hours, minutes and seconds each get a tray of flipping tiles, with the decimal value alongside.",
    tech: ["JavaScript", "CSS 3D transforms"],
    link: "/projects/binary",
  },
  {
    id: "camcoded",
    kind: "play",
    emoji: "🔐",
    title: "Cam's Secret Decoder",
    blurb: "A retro cipher tool for passing secret messages.",
    description: "A custom A to Z substitution cipher with a full reference table.",
    tech: ["JavaScript", "CSS"],
    link: "/projects/camcoded",
  },
  {
    id: "writer",
    kind: "play",
    emoji: "🔍",
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
    emoji: "👾",
    title: "Conway's DOOM",
    blurb: "Game of Life meets first-person shooter.",
    description: "Navigate an evolving cellular automata maze, shoot walls, manage ammo, and survive.",
    tech: ["Three.js", "WebGL"],
    link: "/doom-life-game",
  },

  // ── Lives somewhere else ─────────────────────────────────────────────────
  {
    id: "weight-challenge",
    kind: "elsewhere",
    emoji: "🏋️",
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
    emoji: "⌚",
    title: "Never Late",
    blurb: "A Fitbit clock face that runs up to 15 minutes fast, at random.",
    description: "Healthy uncertainty to keep you punctual.",
    tech: ["Fitbit SDK", "JavaScript"],
    link: "https://gallery.fitbit.com/details/515c8da3-82a8-4aaf-8446-587398ef4cdb",
  },
  {
    id: "nba",
    kind: "elsewhere",
    emoji: "🏀",
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
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
};

const TOOL_EMOJI = {
  "income-inequality": "💵",
  analyzer: "⚾",
  "channel-surfer": "📺",
  mise: "🍳",
  "draft-night": "🏈",
  "sunday-desk": "🗓️",
  "meal-planner": "🥘",
  myreadingbuddy: "📚",
};

const TOOLS = [
  ...listedTools.map((t) => ({
    id: `tool-${t.slug}`,
    kind: "tools",
    emoji: TOOL_EMOJI[t.slug] || "🛠️",
    title: t.title,
    blurb: firstSentence(t.description),
    description: t.description,
    tech: t.tech || ["React"],
    link: `/tools/${t.slug}`,
  })),
  {
    id: "expense-analyzer",
    kind: "tools",
    emoji: "💳",
    title: "Expense Analyzer",
    blurb: "Upload a CSV of transactions and get categorized spending breakdowns.",
    description: "AI-powered categorization and visual analytics for your expenses.",
    tech: ["React", "Data Visualization"],
    link: "/expense-analyzer",
  },
];

export const ALL_PROJECTS = [...PROJECTS, ...TOOLS];
export const FEATURED = ALL_PROJECTS.filter((p) => p.featured);

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
