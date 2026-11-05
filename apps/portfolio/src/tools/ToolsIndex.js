import React from "react";
import { Link } from "react-router-dom";
import { ALL_PROJECTS } from "../site/data";
import { usePageTitle } from "../site/ui";

// Directory of the React tools. Same cards as /projects, filtered to tools.
const ToolsIndex = () => {
  usePageTitle("Tools");
  const tools = ALL_PROJECTS.filter((p) => p.kind === "tools");
  return (
    <>
      <header className="page-head">
        <h1>Tools</h1>
        <p>Small interactive tools and visualizations that each do one job in the browser.</p>
      </header>
      <div className="card-grid" style={{ marginTop: 32 }}>
        {tools.map((t) => (
          <article key={t.id} className="card pcard">
            <h3>{t.title}</h3>
            <p className="pcard-blurb">{t.blurb}</p>
            <div className="pcard-foot">
              <span className="pcard-tech" style={{ marginTop: 0 }}>
                {t.tech.slice(0, 3).join(" · ")}
              </span>
              <Link to={t.link} className="key key--small">
                Open
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
};

export default ToolsIndex;
