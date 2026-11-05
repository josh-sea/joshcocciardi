import React from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "./ui";

const NotFound = () => {
  usePageTitle("Not found");
  return (
    <div className="nf">
      <h1>404</h1>
      <p>There's nothing at this address.</p>
      <Link to="/" className="key key--accent">
        Take me home
      </Link>{" "}
      <Link to="/projects" className="key">
        Browse projects
      </Link>
    </div>
  );
};

export default NotFound;
