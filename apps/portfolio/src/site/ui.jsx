import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { isExternal, isSpaRoute } from "./data";

/* Small inline icon set, so the chrome doesn't depend on an icon font. */
const paths = {
  arrow: "M7 17 17 7M9 7h8v8",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35",
  chevron: "m6 9 6 6 6-6",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M5 12.5 10 17 19 7",
  phone:
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z",
  play: "M8 5v14l11-7z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
};

export const Icon = ({ name, size = 16, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    <path d={paths[name]} />
  </svg>
);

/* One link component for three kinds of destination:
   - routes in this SPA        → client-side <Link>
   - static apps under /projects/* → full page load
   - other domains             → new tab                                    */
export const SmartLink = ({ to, children, ...rest }) => {
  if (isExternal(to)) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  if (isSpaRoute(to)) {
    return (
      <Link to={to} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} {...rest}>
      {children}
    </a>
  );
};

export const usePageTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · Josh Cocciardi` : "Josh Cocciardi";
  }, [title]);
};
