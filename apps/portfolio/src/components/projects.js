import React, { useState } from "react";
import { Container, Card, Icon, Modal, Image } from "semantic-ui-react";
import "../App.css";

const Projects = () => {
  const [selectedImage, setSelectedImage] = useState(null);

  // ── Live sub-apps ──────────────────────────────────────────────────────────
  const featuredApps = [
    {
      title: "📸 Moment Capture",
      description: "Mobile-first PWA for capturing and curating daily moments into video compilations. Google Auth, camera capture, review queue, gallery, and FFmpeg-powered export — all on Firebase.",
      tech: ["React", "Vite", "Firebase", "Tailwind CSS", "FFmpeg", "PWA"],
      link: "/projects/moments",
    },
    {
      title: "✉️ Electronic Mail",
      description: "An iMessage-styled Gmail client with Google OAuth, thread-based chat UI, and Firestore-backed email caching for fast loads.",
      tech: ["React", "Firebase", "Google OAuth", "Gmail API"],
      link: "/projects/electronic-mail",
    },
    {
      title: "🔐 Cam's Secret Decoder",
      description: "A retro-styled cipher tool for encoding and decoding secret messages. Features a custom A–Z substitution cipher with a full reference table.",
      tech: ["JavaScript", "HTML5", "CSS3"],
      link: "/projects/camcoded",
    },
    {
      title: "💀 Dead Net",
      description: "An interactive Dead Internet Theory experience — explore a web populated entirely by bots, AI-generated content, and automated noise.",
      tech: ["JavaScript", "HTML5", "Canvas API"],
      link: "/projects/deadnet",
    },
    {
      title: "🔍 Spelling Detective",
      description: "Interactive spelling practice app with pattern sorting, look-cover-write-check drills, tricky letter identification, and custom word lists.",
      tech: ["JavaScript", "HTML5", "CSS3"],
      link: "/projects/writer",
      images: [
        { src: require("../assets/writersImage.png"), alt: "Spelling Detective app screenshot" },
      ],
    },
  ];

  // ── Other projects ─────────────────────────────────────────────────────────
  const otherProjects = [
    {
      title: "💳 Expense Analyzer",
      description: "Upload a CSV of transactions and instantly get AI-powered categorization, spending breakdowns, and visual analytics to understand your expenses.",
      tech: ["React", "JavaScript", "Data Visualization"],
      link: "/expense-analyzer",
    },
    {
      title: "Hulk Smash: 8-Bit!",
      description: "An 8-bit style platformer where you play as the Hulk. Smash objects, defeat enemies, and navigate retro-inspired levels.",
      tech: ["JavaScript", "Canvas API"],
      link: "/hulk-game",
      images: [
        { src: require("../assets/hulkGameImage.png"), alt: "Hulk Smash 8-bit game screenshot" },
      ],
    },
    {
      title: "Conway's DOOM",
      description: "Conway's Game of Life meets first-person shooter. Navigate an evolving cellular automata maze, shoot walls, manage ammo, and survive progressive difficulty levels.",
      tech: ["JavaScript", "Three.js", "WebGL"],
      link: "/doom-life-game",
    },
    {
      title: "NBA Player Performance Predictor",
      description: "LSTM/RNN neural network app that predicts NBA player props. Automated box score scraping for model retraining, with interactive Streamlit dashboards.",
      tech: ["Python", "LSTM/RNN", "Streamlit", "Web Scraping"],
      images: [
        { src: require("../assets/nba_prediction.png"), alt: "Player prediction interface" },
        { src: require("../assets/nba_team_stats.png"), alt: "Team statistics dashboard" },
        { src: require("../assets/nba_player_chart.png"), alt: "Player performance trend" },
      ],
    },
    {
      title: "Weight Challenge Bros",
      description: "A collaborative weight-loss tracker for friends with interactive charts and friendly competition.",
      tech: ["React", "Chart.js", "Firebase"],
      link: "https://weightchallengebros.com/home",
      images: [
        { src: require("../assets/weight_challenge.png"), alt: "Weight tracking dashboard" },
      ],
    },
    {
      title: "Color Chasers",
      description: "Multiplayer color-based strategy game where players compete to capture territory on a dynamic grid in real time.",
      tech: ["React", "WebSocket", "Game Development"],
      images: [
        { src: require("../assets/colorchasers1.png"), alt: "Color Chasers early game" },
        { src: require("../assets/colorchasers2.png"), alt: "Color Chasers advanced game" },
      ],
    },
    {
      title: "Never Late — Fitbit Clock Face",
      description: "Randomizes the displayed time up to 15 minutes fast, creating healthy uncertainty to keep you punctual.",
      tech: ["Fitbit SDK", "JavaScript"],
      link: "https://gallery.fitbit.com/details/515c8da3-82a8-4aaf-8446-587398ef4cdb",
    },
    {
      title: "Mobile App",
      description: "My first mobile application, currently in internal testing and coming soon to iOS and Android.",
      tech: ["React Native"],
      comingSoon: true,
    },
  ];

  const renderCard = (project, index) => (
    <Card key={index}>
      <Card.Content>
        {/* Header row */}
        <Card.Header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ flex: 1, marginRight: "0.5em" }}>{project.title}</span>
          {project.link && !project.comingSoon && (
            <Icon
              name={project.link.startsWith("http") ? "external alternate" : "play circle"}
              color="blue"
              style={{ cursor: "pointer", flexShrink: 0, marginTop: "2px" }}
              title={project.link.startsWith("http") ? "Open external link" : "Launch app"}
              onClick={() =>
                project.link.startsWith("http")
                  ? window.open(project.link, "_blank")
                  : (window.location.href = project.link)
              }
            />
          )}
        </Card.Header>

        {/* Tech tags */}
        <Card.Meta style={{ marginTop: "0.35em", fontSize: "0.8rem", color: "#888" }}>
          {project.tech.join(" · ")}
        </Card.Meta>

        {/* Description */}
        <Card.Description style={{ marginTop: "0.75em", lineHeight: "1.55", fontSize: "0.9rem" }}>
          {project.description}
        </Card.Description>

        {/* Images */}
        {project.images && (
          <div className="project-images-strip" style={{ marginTop: "0.75em" }}>
            {project.images.map((img, i) => (
              <img
                key={i}
                src={img.src}
                alt={img.alt}
                onClick={() =>
                  project.link && !project.link.startsWith("http")
                    ? (window.location.href = project.link)
                    : setSelectedImage(img)
                }
              />
            ))}
          </div>
        )}
      </Card.Content>

      {/* Footer */}
      {project.comingSoon && (
        <Card.Content extra>
          <Icon name="clock outline" />
          Coming Soon
        </Card.Content>
      )}
      {project.link && !project.link.startsWith("http") && !project.comingSoon && (
        <Card.Content extra>
          <span
            className="card-launch-link"
            onClick={() => (window.location.href = project.link)}
          >
            <Icon name="external alternate" />
            Launch App
          </span>
        </Card.Content>
      )}
    </Card>
  );

  return (
    <Container style={{ padding: "1.5em 0 3em" }}>

      {/* ── Featured Apps ── */}
      <div className="projects-section-title">Live Apps</div>
      <div className="featured-apps-grid">
        {featuredApps.map((p, i) => renderCard(p, i))}
      </div>

      {/* ── Other Projects ── */}
      <div className="projects-section-title">Other Projects</div>
      <div className="projects-grid">
        {otherProjects.map((p, i) => renderCard(p, i))}
      </div>

      {/* Lightbox modal */}
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
