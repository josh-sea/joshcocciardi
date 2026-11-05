import React from "react";
import { Icon, SmartLink } from "./ui";
import { isExternal } from "./data";

const KIND_LABEL = { apps: "App", play: "Game", tools: "Tool", elsewhere: "Elsewhere" };

const FeatureCard = ({ project }) => (
  <SmartLink to={project.link} className="panel feature">
    <div className="feature-top">
      <span className="tile tile--lg" aria-hidden="true">
        {project.emoji}
      </span>
      <span className="pill">
        <span className="led" /> Live {KIND_LABEL[project.kind]}
      </span>
    </div>
    <h3>{project.title}</h3>
    <p>{project.blurb}</p>
    <div className="feature-foot">
      <span className="feature-host">{project.host}</span>
      <span className="key key--small key--accent" aria-hidden="true">
        {isExternal(project.link) ? "Visit" : "Play"} <Icon name="arrow" size={14} />
      </span>
    </div>
  </SmartLink>
);

export default FeatureCard;
