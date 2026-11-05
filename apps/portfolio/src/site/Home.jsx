import React from "react";
import { Link } from "react-router-dom";
import headshot from "../assets/josh_headshot.JPG";
import { ALL_PROJECTS, EDUCATION, EXPERIENCE, FEATURED, PROFILE, STACK } from "./data";
import FeatureCard from "./FeatureCard";
import { Icon, usePageTitle } from "./ui";

const Home = () => {
  usePageTitle(null);

  return (
    <>
      <section className="section hero">
        <div>
          <span className="panel hero-status">
            <span className="led" />
            {PROFILE.role} at {PROFILE.company}
          </span>
          <h1>Hi, I'm Josh.</h1>
          <p className="hero-lede">
            I get software working inside other people's businesses. By day I run{" "}
            <strong>technical implementations at {PROFILE.company}</strong>, taking new customers from
            signed contract to live. By night (and early morning) I build apps, tools and games for my
            family and friends, and most of them run right here in the browser.
          </p>
          <div className="hero-actions">
            <Link to="/projects" className="key key--accent">
              See what I've built <Icon name="arrow" size={15} />
            </Link>
            <Link to="/contact" className="key">
              Get in touch
            </Link>
          </div>
        </div>
        <div className="bezel">
          <img src={headshot} alt="Josh Cocciardi" />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="label">Featured</span>
            <h2>Live and worth a click</h2>
          </div>
          <Link to="/projects" className="key key--small">
            All {ALL_PROJECTS.length}
          </Link>
        </div>
        <div className="feature-grid">
          {FEATURED.map((p) => (
            <FeatureCard key={p.id} project={p} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="label">Work</span>
            <h2>Experience</h2>
          </div>
        </div>
        <div className="two-col">
          <div className="panel timeline">
            {EXPERIENCE.map((j) => (
              <article className="job" key={j.company}>
                <div className="job-head">
                  <h3>
                    {j.company} <span>· {j.role}</span>
                  </h3>
                  <span className="job-when">
                    <span className={j.current ? "led" : "led led--off"} />
                    {j.when}
                  </span>
                </div>
                <p>{j.summary}</p>
              </article>
            ))}
          </div>

          <div className="side-stack">
            <div className="panel side-card">
              <h3>Daily drivers</h3>
              <div className="chips">
                {STACK.map((s) => (
                  <span className="chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="panel side-card">
              <h3>Education</h3>
              <ul className="edu">
                {EDUCATION.map((e) => (
                  <li key={e.school}>
                    <strong>{e.school}</strong>
                    <span>{e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="panel cta">
          <div>
            <h2>Want to talk shop?</h2>
            <p>Implementation, integrations, or something you want built. I read everything.</p>
          </div>
          <div className="cta-actions">
            <Link to="/contact" className="key key--accent">
              <Icon name="send" size={15} /> Send a message
            </Link>
            <a href={PROFILE.linkedin} className="key" target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
