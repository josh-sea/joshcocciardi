import React, { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { PROFILE } from "./data";
import "./site.css";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/contact", label: "Contact" },
];

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const Layout = () => (
  <div className="site">
    <ScrollToTop />
    <header className="site-header">
      <div className="wrap">
        <Link to="/" className="brand">
          Josh<span className="brand-long"> Cocciardi</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `key key--small key--pill${isActive ? " on" : ""}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>

    <main className="site-main">
      <div className="wrap">
        <Outlet />
      </div>
    </main>

    <footer className="site-footer">
      <div className="wrap">
        <span>
          © {new Date().getFullYear()} {PROFILE.name}. No trackers on this site.
        </span>
        <div className="footer-links">
          <a className="key key--small" href={`mailto:${PROFILE.email}`}>
            Email
          </a>
          <a className="key key--small" href={PROFILE.linkedin} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
          <a className="key key--small" href={PROFILE.github} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
);

export default Layout;
