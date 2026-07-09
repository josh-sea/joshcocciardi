import React, { Suspense, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import tools from "./registry";

// Renders a registered tool full-bleed (no portfolio nav/container) so each
// tool controls its own page styling.
const ToolPage = () => {
  const { slug } = useParams();
  const tool = tools.find((t) => t.slug === slug);

  useEffect(() => {
    const prev = document.title;
    if (tool) document.title = `${tool.title} — Josh Cocciardi`;
    return () => {
      document.title = prev;
    };
  }, [tool]);

  if (!tool) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ marginBottom: 8 }}>Tool not found</h1>
        <p style={{ color: "#666" }}>
          No tool is registered at <code>/tools/{slug}</code>.
        </p>
        <Link to="/tools">See all tools</Link>
      </div>
    );
  }

  const Tool = tool.component;
  return (
    <Suspense
      fallback={
        <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#666" }}>
          Loading {tool.title}…
        </div>
      }
    >
      <Tool />
    </Suspense>
  );
};

export default ToolPage;
