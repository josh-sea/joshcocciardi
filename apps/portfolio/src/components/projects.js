import React, { useMemo, useState } from "react";
import { Container, Card, Icon, Modal, Image } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import toolRegistry from "../tools/registry";
import "../App.css";

/* ------------------------------------------------------------------ */
/*  The index: everything I've built, in one browsable, shareable page */
/* ------------------------------------------------------------------ */

// Paths served by the SPA router. Everything else under /projects/* is a
// separately built static app, so it needs a real page load rather than a
// client-side route.
const isSpaRoute = (link) =>
  ["/tools/", "/expense-analyzer", "/hulk-game", "/doom-life-game"].some((p) => link.startsWith(p));

// ── Apps: real accounts, real users, live data ───────────────────────────────
const apps = [
  {
    title: "📸 Moment Capture",
    description:
      "Mobile-first PWA for capturing and curating daily moments into video compilations. Google Auth, camera capture, review queue, gallery, and FFmpeg-powered export — all on Firebase.",
    tech: ["React", "Vite", "Firebase", "Tailwind CSS", "FFmpeg", "PWA"],
    link: "/projects/moments",
  },
  {
    title: "🗃️ Collector Shop",
    description:
      "Shared inventory tracker for sports cards, comics, and memorabilia. Add items in one tap (name and you're done), then fill in price paid, category, grading, tags, and photos later. Log sales, check recent eBay sold comps, and watch a live dashboard of cost basis, profit, and margins. Two collaborators share one shop with an invite code.",
    tech: ["React", "Vite", "Firebase", "Firestore", "Storage", "Tailwind CSS"],
    link: "/projects/collector",
  },
  {
    title: "⚾ Playball",
    description:
      "Walk-up music manager for game day. Pull in Spotify playlists, set start/stop times per song, assign players to songs, and drag the batting order — the playlist re-syncs to Spotify automatically.",
    tech: ["JavaScript", "Spotify API", "Firebase Auth", "Firestore", "PWA"],
    link: "/projects/playball",
  },
  {
    title: "🚽 CanITwo",
    description:
      "Community bathroom finder for travelers. See nearby gas stations, stores, and cafes on a map, report whether they have a toilet, rate and review it, and launch directions when nature calls.",
    tech: ["JavaScript", "Leaflet", "OpenStreetMap", "Firebase Auth", "Firestore", "PWA"],
    link: "/projects/canitwo",
  },
  {
    title: "🗃️ Recipe Box",
    description:
      "The family recipe box, digitized. Write recipes onto simple cards, attach photos or videos of the people who make them, connect with family, and hand cards — or your whole box — to each other. No blogs, no ads, just the cards. Also lives at gramandpops.com.",
    tech: ["JavaScript", "Firebase Auth", "Firestore", "Storage", "PWA"],
    link: "/projects/recipebox",
  },
  {
    title: "✉️ Electronic Mail",
    description:
      "An iMessage-styled Gmail client with Google OAuth, thread-based chat UI, and Firestore-backed email caching for fast loads.",
    tech: ["React", "Firebase", "Google OAuth", "Gmail API"],
    link: "/projects/electronic-mail",
  },
];

// ── Tools: rendered from the registry so this index can't drift ──────────────
// Adding a tool to src/tools/registry.js puts it here and at /tools with no
// edit to either page.
const registryTools = toolRegistry.map((t) => ({
  title: t.title,
  description: t.description,
  tech: t.tech || ["React"],
  link: `/tools/${t.slug}`,
}));

const tools = [
  ...registryTools,
  {
    title: "💳 Expense Analyzer",
    description:
      "Upload a CSV of transactions and instantly get AI-powered categorization, spending breakdowns, and visual analytics to understand your expenses.",
    tech: ["React", "JavaScript", "Data Visualization"],
    link: "/expense-analyzer",
  },
];

// ── Games, toys and experiments ──────────────────────────────────────────────
const playthings = [
  {
    title: "💀 Dead Net",
    description:
      "Dead Internet Theory as a Grateful Dead fan forum: every thread, reply and reaction is posted by a bot, and you're the only human in the room.",
    tech: ["JavaScript", "HTML5", "Canvas API"],
    link: "/projects/deadnet",
  },
  {
    title: "🕰️ Binary Flip Counter",
    description:
      "A wooden split-flap clock that counts in base 2. Hours, minutes and seconds each get a tray of flipping tiles, with the decimal value read out alongside so you can check your own binary math.",
    tech: ["JavaScript", "CSS 3D transforms", "HTML5"],
    link: "/projects/binary",
  },
  {
    title: "🔐 Cam's Secret Decoder",
    description:
      "A retro-styled cipher tool for encoding and decoding secret messages. Features a custom A–Z substitution cipher with a full reference table.",
    tech: ["JavaScript", "HTML5", "CSS3"],
    link: "/projects/camcoded",
  },
  {
    title: "🔍 Spelling Detective",
    description:
      "Interactive spelling practice app with pattern sorting, look-cover-write-check drills, tricky letter identification, and custom word lists.",
    tech: ["JavaScript", "HTML5", "CSS3"],
    link: "/projects/writer",
    images: [{ src: require("../assets/writersImage.png"), alt: "Spelling Detective app screenshot" }],
  },
  {
    title: "🟢 Hulk Smash: 8-Bit!",
    description:
      "An 8-bit style platformer where you play as the Hulk. Smash objects, defeat enemies, and navigate retro-inspired levels.",
    tech: ["JavaScript", "Canvas API"],
    link: "/hulk-game",
    images: [{ src: require("../assets/hulkGameImage.png"), alt: "Hulk Smash 8-bit game screenshot" }],
  },
  {
    title: "👾 Conway's DOOM",
    description:
      "Conway's Game of Life meets first-person shooter. Navigate an evolving cellular automata maze, shoot walls, manage ammo, and survive progressive difficulty levels.",
    tech: ["JavaScript", "Three.js", "WebGL"],
    link: "/doom-life-game",
  },
  {
    title: "🎨 Color Chasers",
    description:
      "Multiplayer color-based strategy game where players compete to capture territory on a dynamic grid in real time.",
    tech: ["React", "WebSocket", "Game Development"],
    images: [
      { src: require("../assets/colorchasers1.png"), alt: "Color Chasers early game" },
      { src: require("../assets/colorchasers2.png"), alt: "Color Chasers advanced game" },
    ],
  },
];

// ── Lives somewhere else ─────────────────────────────────────────────────────
const elsewhere = [
  {
    title: "🏋️ Weight Challenge Bros",
    description:
      "A collaborative weight-loss tracker for friends with interactive charts and friendly competition.",
    tech: ["React", "Chart.js", "Firebase"],
    link: "https://weightchallengebros.com/home",
    images: [{ src: require("../assets/weight_challenge.png"), alt: "Weight tracking dashboard" }],
  },
  {
    title: "⌚ Never Late — Fitbit Clock Face",
    description:
      "Randomizes the displayed time up to 15 minutes fast, creating healthy uncertainty to keep you punctual.",
    tech: ["Fitbit SDK", "JavaScript"],
    link: "https://gallery.fitbit.com/details/515c8da3-82a8-4aaf-8446-587398ef4cdb",
  },
  {
    title: "🏀 NBA Player Performance Predictor",
    description:
      "LSTM/RNN neural network app that predicts NBA player props. Automated box score scraping for model retraining, with interactive Streamlit dashboards.",
    tech: ["Python", "LSTM/RNN", "Streamlit", "Web Scraping"],
    images: [
      { src: require("../assets/nba_prediction.png"), alt: "Player prediction interface" },
      { src: require("../assets/nba_team_stats.png"), alt: "Team statistics dashboard" },
      { src: require("../assets/nba_player_chart.png"), alt: "Player performance trend" },
    ],
  },
  {
    title: "📱 Mobile App",
    description:
      "My first mobile application, currently in internal testing and coming soon to iOS and Android.",
    tech: ["React Native"],
    comingSoon: true,
  },
];

const SECTIONS = [
  { key: "apps", label: "Apps", blurb: "Sign in, save your stuff, come back to it.", items: apps },
  {
    key: "tools",
    label: "Tools",
    blurb: "Single-purpose things that do one job in the browser.",
    items: tools,
  },
  {
    key: "play",
    label: "Games & experiments",
    blurb: "Built for the fun of building them.",
    items: playthings,
  },
  {
    key: "elsewhere",
    label: "Elsewhere",
    blurb: "Lives on another host, or isn't a website at all.",
    items: elsewhere,
  },
];

const TOTAL = SECTIONS.reduce((n, s) => n + s.items.length, 0);

// Every whitespace-separated term has to appear somewhere in the card, so
// "firebase game" narrows rather than widens.
const matches = (item, q) => {
  if (!q) return true;
  const hay = `${item.title} ${item.description} ${item.tech.join(" ")}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
};

const Projects = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const navigate = useNavigate();

  const go = (link) => {
    if (!link) return;
    if (link.startsWith("http")) window.open(link, "_blank", "noopener");
    else if (isSpaRoute(link)) navigate(link);
    else window.location.href = link; // separately built static app
  };

  const visible = useMemo(
    () =>
      SECTIONS.filter((s) => section === "all" || s.key === section)
        .map((s) => ({ ...s, items: s.items.filter((i) => matches(i, query)) }))
        .filter((s) => s.items.length > 0),
    [query, section]
  );

  const shown = visible.reduce((n, s) => n + s.items.length, 0);

  const renderCard = (project, index) => {
    const clickable = Boolean(project.link) && !project.comingSoon;
    const external = clickable && project.link.startsWith("http");
    return (
      <Card
        key={index}
        className={clickable ? "index-card is-clickable" : "index-card"}
        onClick={clickable ? () => go(project.link) : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  go(project.link);
                }
              }
            : undefined
        }
        tabIndex={clickable ? 0 : undefined}
        role={clickable ? "link" : undefined}
      >
        <Card.Content>
          <Card.Header
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <span style={{ flex: 1, marginRight: "0.5em" }}>{project.title}</span>
            {clickable && (
              <Icon
                name={external ? "external alternate" : "play circle"}
                color="blue"
                style={{ flexShrink: 0, marginTop: "2px" }}
              />
            )}
          </Card.Header>

          <Card.Meta style={{ marginTop: "0.35em", fontSize: "0.8rem", color: "#888" }}>
            {project.tech.join(" · ")}
          </Card.Meta>

          <Card.Description style={{ marginTop: "0.75em", lineHeight: "1.55", fontSize: "0.9rem" }}>
            {project.description}
          </Card.Description>

          {project.images && (
            <div className="project-images-strip" style={{ marginTop: "0.75em" }}>
              {project.images.map((img, i) => (
                <img
                  key={i}
                  src={img.src}
                  alt={img.alt}
                  onClick={(e) => {
                    // Thumbnails open the lightbox without also launching the
                    // card's link.
                    e.stopPropagation();
                    setSelectedImage(img);
                  }}
                />
              ))}
            </div>
          )}
        </Card.Content>

        {project.comingSoon && (
          <Card.Content extra>
            <Icon name="clock outline" />
            Coming Soon
          </Card.Content>
        )}
        {clickable && (
          <Card.Content extra>
            <span className="card-launch-link">
              <Icon name="external alternate" />
              {external ? "Visit" : "Launch"}
            </span>
          </Card.Content>
        )}
      </Card>
    );
  };

  return (
    <Container style={{ padding: "1.5em 0 3em" }}>
      <div className="index-header">
        <h1 className="index-title">Everything I've built</h1>
        <p className="index-sub">
          {TOTAL} apps, tools, games and experiments — most run right in the browser, so you can
          click into any of them from here.
        </p>
      </div>

      <div className="index-toolbar">
        <div className="index-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description, or tech…"
            aria-label="Search projects"
          />
          {query && (
            <button className="index-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div className="index-chips">
          <button
            className={`index-chip${section === "all" ? " on" : ""}`}
            onClick={() => setSection("all")}
          >
            All <span className="index-count">{TOTAL}</span>
          </button>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`index-chip${section === s.key ? " on" : ""}`}
              onClick={() => setSection(s.key)}
            >
              {s.label} <span className="index-count">{s.items.length}</span>
            </button>
          ))}
        </div>
      </div>

      {query && (
        <div className="index-results">
          {shown} {shown === 1 ? "match" : "matches"} for “{query}”
        </div>
      )}

      {visible.map((s) => (
        <section key={s.key}>
          <div className="projects-section-title">
            {s.label}
            <span className="index-blurb">{s.blurb}</span>
          </div>
          <div className={s.key === "apps" ? "featured-apps-grid" : "projects-grid"}>
            {s.items.map((p, i) => renderCard(p, i))}
          </div>
        </section>
      ))}

      {visible.length === 0 && (
        <div className="index-empty">
          <Icon name="search" size="big" />
          <p>
            Nothing matches “{query}”.{" "}
            <button className="index-linkish" onClick={() => setQuery("")}>
              Clear the search
            </button>
          </p>
        </div>
      )}

      <Modal
        open={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        size="large"
        closeIcon
      >
        <Modal.Content image>
          <Image
            src={selectedImage?.src}
            alt={selectedImage?.alt}
            style={{ maxHeight: "80vh", width: "auto", margin: "0 auto" }}
          />
        </Modal.Content>
      </Modal>
    </Container>
  );
};

export default Projects;
