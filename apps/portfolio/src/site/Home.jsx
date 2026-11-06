import React from "react";
import { Link } from "react-router-dom";
import headshot from "../assets/josh_headshot.JPG";
import { ALL_PROJECTS, EDUCATION, EXPERIENCE, PROFILE, REELS, STACK } from "./data";
import Reel from "./Reel";
import { Icon, usePageTitle } from "./ui";

const Home = () => {
  usePageTitle(null);

  return (
    <>
      <section className="section hero">
        <div>
          <span className="hero-role">
            {PROFILE.role}, {PROFILE.company}
          </span>
          <h1>Hi, I'm Josh.</h1>
          <p className="hero-lede">
            I get software working inside other people's businesses. At {PROFILE.company} I run{" "}
            <strong>technical implementations</strong>, taking new customers from signed contract to live.
            The rest of the time I build apps, tools and games for my family and friends, and most of them
            run right here in the browser.
          </p>
          <div className="hero-actions">
            <Link to="/projects" className="key key--blue">
              See what I've built
            </Link>
            <Link to="/contact" className="key">
              Get in touch
            </Link>
          </div>
        </div>
        <div className="photo">
          <img src={headshot} alt="Josh Cocciardi" />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>A few favorites</h2>
            <p>Three reels of seven. Pick one, then scroll to turn it.</p>
          </div>
          <Link to="/projects" className="key key--small">
            All {ALL_PROJECTS.length} <Icon name="arrow" size={13} />
          </Link>
        </div>
      </section>
      <Reel reels={REELS} />

      <section className="section">
        <div className="section-head">
          <h2>Experience</h2>
        </div>
        <div className="two-col">
          <div className="card timeline">
            {EXPERIENCE.map((j) => (
              <article className="job" key={j.company}>
                <div className="job-head">
                  <h3>
                    {j.company} <span>· {j.role}</span>
                  </h3>
                  <span className={j.current ? "job-when now" : "job-when"}>{j.when}</span>
                </div>
                <p>{j.summary}</p>
              </article>
            ))}
          </div>

          <div className="side-stack">
            <div className="card side-card">
              <h3>What I reach for</h3>
              <div className="tags">
                {STACK.map((s) => (
                  <span className="tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="card side-card">
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
        <div className="card cta">
          <div>
            <h2>Want to talk?</h2>
            <p>Implementation work, integrations, or something you'd like built.</p>
          </div>
          <div className="cta-actions">
            <Link to="/contact" className="key key--blue">
              Send a message
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
