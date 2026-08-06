import React, { Suspense, useEffect } from "react";
import { useParams } from "react-router-dom";
import AuthGate from "./AuthGate";
import workPages from "./registry";

// Renders a private /work page full-bleed behind the sign-in gate.
//
// Two independent noindex signals cover this route: the X-Robots-Tag header on
// /work/** in firebase.json (which a crawler sees without running any JS) and
// the meta tag below (which covers anything that renders the SPA first). The
// header is the one that actually matters; the tag is belt and braces.
const useNoIndex = () => {
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, []);
};

const notice = (heading, body) => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f1115",
      color: "#e6e8ee",
      fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
      textAlign: "center",
      padding: 24,
    }}
  >
    <div>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{heading}</h1>
      <p style={{ marginTop: 8, fontSize: 13, color: "#8f9bb3" }}>{body}</p>
    </div>
  </div>
);

const WorkPage = () => {
  const { slug } = useParams();
  const page = workPages.find((p) => p.slug === slug);

  useNoIndex();

  useEffect(() => {
    const prev = document.title;
    document.title = page ? `${page.title} — private` : "Not found";
    return () => {
      document.title = prev;
    };
  }, [page]);

  // Same copy whether the slug is unknown or the visitor is unauthenticated —
  // an unknown /work URL shouldn't confirm or deny that a page exists there.
  if (!page) return notice("Not found", "There's nothing at this address.");

  const Page = page.component;
  return (
    <AuthGate title={page.title}>
      {(user) => (
        <Suspense fallback={notice("Loading…", page.title)}>
          <Page user={user} pageKey={page.pageKey} />
        </Suspense>
      )}
    </AuthGate>
  );
};

export default WorkPage;
