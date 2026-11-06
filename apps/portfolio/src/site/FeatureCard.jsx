import React from "react";
import { SmartLink } from "./ui";

// A featured project: its screenshot on top, then the name and one line.
const FeatureCard = ({ project }) => (
  <SmartLink to={project.link} className="card feature">
    {project.frame && <img src={project.frame} alt={`${project.title} screenshot`} loading="lazy" />}
    <div className="feature-body">
      <h3>{project.title}</h3>
      <p>{project.blurb}</p>
      <span className="feature-host">{project.host}</span>
    </div>
  </SmartLink>
);

export default FeatureCard;
