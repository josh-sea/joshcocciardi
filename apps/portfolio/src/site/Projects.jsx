import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_PROJECTS, FEATURED, SECTIONS, isExternal } from "./data";
import FeatureCard from "./FeatureCard";
import { Icon, SmartLink, usePageTitle } from "./ui";

// Every whitespace-separated term must appear somewhere on the card, so
// "firebase game" narrows rather than widens.
const matches = (p, q) => {
  if (!q) return true;
  const hay = `${p.title} ${p.blurb} ${p.description} ${p.tech.join(" ")}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
};

const ProjectCard = ({ project, onImage }) => {
  const [open, setOpen] = useState(false);
  const detailsId = `more-${project.id}`;
  const hasMore = project.description || project.images;

  return (
    <article className="card pcard">
      <h3>{project.title}</h3>
      <p className="pcard-blurb">{project.blurb}</p>

      {open && (
        <div id={detailsId}>
          {project.description && <p className="pcard-more">{project.description}</p>}
          <p className="pcard-tech">{project.tech.join(" · ")}</p>
          {project.images && (
            <div className="pcard-shots">
              {project.images.map((img) => (
                <button key={img.alt} type="button" onClick={() => onImage(img)} aria-label={`Enlarge: ${img.alt}`}>
                  <img src={img.src} alt={img.alt} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pcard-foot">
        {hasMore ? (
          <button
            type="button"
            className="linkish"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Less" : "Details"} <Icon name="chevron" size={14} />
          </button>
        ) : (
          <span />
        )}
        {project.link && (
          <SmartLink to={project.link} className="key key--small">
            {isExternal(project.link) ? "Visit" : "Open"} <Icon name="arrow" size={13} />
          </SmartLink>
        )}
      </div>
    </article>
  );
};

const Projects = () => {
  usePageTitle("Projects");
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((s) => s.key === params.get("show")) ? params.get("show") : "all";
  const [query, setQuery] = useState("");
  const [image, setImage] = useState(null);

  const setSection = (key) => {
    const next = new URLSearchParams(params);
    if (key === "all") next.delete("show");
    else next.set("show", key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!image) return undefined;
    const onKey = (e) => e.key === "Escape" && setImage(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image]);

  // Featured projects get the big cards up top, so they're left out of the
  // groups below unless someone is searching or filtering.
  const browsing = !query && section === "all";

  const groups = useMemo(
    () =>
      SECTIONS.filter((s) => section === "all" || s.key === section)
        .map((s) => ({
          ...s,
          items: ALL_PROJECTS.filter(
            (p) => p.kind === s.key && matches(p, query) && !(browsing && p.featured)
          ),
        }))
        .filter((s) => s.items.length > 0),
    [query, section, browsing]
  );

  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const countFor = (key) => ALL_PROJECTS.filter((p) => p.kind === key).length;

  return (
    <>
      <header className="page-head">
        <h1>Everything I've built</h1>
        <p>
          {ALL_PROJECTS.length} apps, tools, games and experiments. Most run right in the browser, so
          open anything that looks fun.
        </p>
      </header>

      {browsing && (
        <section style={{ marginTop: 32 }}>
          <div className="feature-grid">
            {FEATURED.map((p) => (
              <FeatureCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, idea or tech"
            aria-label="Search projects"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </label>
        <div className="chips-row" role="group" aria-label="Filter by kind">
          <button
            type="button"
            className="key key--small key--pill"
            aria-pressed={section === "all"}
            onClick={() => setSection("all")}
          >
            All <span className="count">{ALL_PROJECTS.length}</span>
          </button>
          {SECTIONS.map((s) => (
            <button
              type="button"
              key={s.key}
              className="key key--small key--pill"
              aria-pressed={section === s.key}
              onClick={() => setSection(s.key)}
            >
              {s.label} <span className="count">{countFor(s.key)}</span>
            </button>
          ))}
        </div>
      </div>

      {query && (
        <p className="muted" style={{ marginTop: 16 }} aria-live="polite">
          {shown} {shown === 1 ? "match" : "matches"}
        </p>
      )}

      {groups.map((g) => (
        <section className="group" key={g.key}>
          <div className="group-head">
            <h2>{g.label}</h2>
            <p>{g.blurb}</p>
          </div>
          <div className="card-grid">
            {g.items.map((p) => (
              <ProjectCard key={p.id} project={p} onImage={setImage} />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <div className="empty">
          <p>Nothing matches “{query}”.</p>
          <button type="button" className="key key--small" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      )}

      {image && (
        <div className="lightbox" role="dialog" aria-label={image.alt} onClick={() => setImage(null)}>
          <img src={image.src} alt={image.alt} />
        </div>
      )}
    </>
  );
};

export default Projects;
