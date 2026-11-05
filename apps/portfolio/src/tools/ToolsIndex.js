import React from "react";
import { Link } from "react-router-dom";
import { ALL_PROJECTS } from "../site/data";
import { Icon, usePageTitle } from "../site/ui";

// Directory of the React tools. Same cards as /projects, filtered to tools.
const ToolsIndex = () => {
  usePageTitle("Tools");
  const tools = ALL_PROJECTS.filter((p) => p.kind === "tools");
  return (
    <>
      <header className="page-head">
        <span className="label">Tools</span>
        <h1>Small, single-purpose tools</h1>
        <p>Interactive tools and visualizations that each do one job in the browser.</p>
      </header>
      <div className="card-grid" style={{ marginTop: 32 }}>
        {tools.map((t) => (
          <Link key={t.id} to={t.link} className="panel pcard feature" style={{ padding: 16 }}>
            <div className="pcard-top">
              <span className="tile" aria-hidden="true">
                {t.emoji}
              </span>
              <div className="pcard-title">
                <h3>{t.title}</h3>
                <p className="pcard-blurb">{t.blurb}</p>
              </div>
            </div>
            <div className="pcard-foot">
              <span className="pcard-tech" style={{ marginTop: 0 }}>
                {t.tech.slice(0, 3).join(" · ")}
              </span>
              <span className="key key--small" aria-hidden="true">
                Open <Icon name="arrow" size={13} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
};

export default ToolsIndex;
