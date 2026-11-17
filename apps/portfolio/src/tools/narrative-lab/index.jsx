import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AuthGate from "../../work/AuthGate";
import { signOutOfWork } from "../../work/auth";
import CSS from "./styles";
import Ingest from "./Ingest";
import Items from "./Items";
import ItemView from "./ItemView";
import { SourceView, SourcesList } from "./Sources";
import { NarrativeView, NarrativesList } from "./Narratives";
import Claims from "./Claims";
import Cascades from "./Cascades";
import Settings from "./Settings";
import { explain, status as fetchStatus, watch, watchAll } from "./store";
import { Lab } from "./ui";

// ---------------------------------------------------------------------------
// Narrative Lab: a private tool that ingests content into a knowledge base
// and reads it on five layers (context, reasoning, rhetoric, narrative,
// invariants), plus what each derivative did to its source. The pipeline
// runs in Cloud Functions (functions/narrative); this page submits content,
// shows the findings, and keeps Josh's own judgment (notes, verdicts).
//
// Private: unlisted in the tools index, behind the same Google allowlist as
// /work (src/work/access.js), and every nl_* collection is locked to that one
// account in firestore.rules. It reports techniques, never intent.
// ---------------------------------------------------------------------------

const NAV = [
  ["ingest", "Ingest"],
  ["items", "Items"],
  ["cascades", "Cascades"],
  ["sources", "Sources"],
  ["narratives", "Narratives"],
  ["claims", "Claims"],
  ["settings", "Settings"],
];
const PARENT = { item: "items", source: "sources", narrative: "narratives" };

const useNoIndex = () =>
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);

function Console({ user }) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "ingest";
  const id = params.get("id");
  const go = (v, extra = {}) => {
    setParams({ view: v, ...extra });
    window.scrollTo(0, 0);
  };

  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [narratives, setNarratives] = useState([]);
  const [claims, setClaims] = useState([]);
  const [edges, setEdges] = useState([]);
  const [server, setServer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onErr = (e) => setError(explain(e));
    const unsubs = [
      watch("items", setItems, onErr, { max: 1000 }),
      watchAll("sources", setSources, onErr),
      watch("narratives", setNarratives, onErr, { by: "lastSeen", max: 500 }),
      watch("claims", setClaims, onErr, { by: "lastSeen", max: 1000 }),
      watchAll("edges", setEdges, onErr),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const refreshStatus = () =>
    fetchStatus()
      .then(setServer)
      .catch((e) => setError(explain(e)));
  useEffect(() => {
    refreshStatus();
  }, []);

  const value = useMemo(() => {
    const itemsById = Object.fromEntries(items.map((x) => [x.id, x]));
    return {
      user,
      go,
      items,
      itemsById,
      sources,
      sourcesById: Object.fromEntries(sources.map((x) => [x.id, x])),
      narratives,
      narrativesById: Object.fromEntries(narratives.map((x) => [x.id, x])),
      claims,
      claimsById: Object.fromEntries(claims.map((x) => [x.id, x])),
      edges,
      server,
      library: server?.library || null,
      thresholds: server?.thresholds || { genreBaseline: 200, profileMin: 20 },
      refreshStatus,
      setError,
    };
    // go is stable enough for navigation; setParams identity changes with the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, items, sources, narratives, claims, edges, server]);

  const inFlight = items.filter((x) => x.status === "queued" || x.status === "running").length;
  const failed = items.filter((x) => x.status === "failed").length;
  const active = PARENT[view] || view;

  let page;
  if (view === "item" && id) page = <ItemView id={id} />;
  else if (view === "items") page = <Items />;
  else if (view === "source" && id) page = <SourceView id={id} />;
  else if (view === "sources") page = <SourcesList />;
  else if (view === "narrative" && id) page = <NarrativeView id={id} />;
  else if (view === "narratives") page = <NarrativesList />;
  else if (view === "claims") page = <Claims />;
  else if (view === "cascades") page = <Cascades rootId={id} />;
  else if (view === "settings") page = <Settings />;
  else page = <Ingest />;

  return (
    <Lab.Provider value={value}>
      <div className="nl-top">
        <div className="nl-topin">
          <div className="nl-brandrow">
            <div className="nl-brand">
              Narrative Lab <small>private</small>
            </div>
            <div className="nl-who">
              <span className="nl-email">{user.email}</span>
              <button type="button" className="nl-link" onClick={signOutOfWork}>
                Sign out
              </button>
            </div>
          </div>
          <nav className="nl-nav" aria-label="Sections">
            {NAV.map(([k, label]) => (
              <button key={k} type="button" className={active === k ? "on" : ""} onClick={() => go(k)}>
                {label}
                {k === "ingest" && inFlight + failed > 0 && <span className="nl-count">{inFlight + failed}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <main className="nl-page">
        {error && (
          <div className="nl-err nl-between">
            <span>{error}</span>
            <button type="button" className="nl-btn small" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {server && !server.keySet && view !== "settings" && (
          <div className="nl-note" style={{ marginBottom: 12 }}>
            No Anthropic API key is saved yet, so nothing will be analyzed.{" "}
            <button type="button" className="nl-link" onClick={() => go("settings")}>
              Add one in Settings
            </button>
            .
          </div>
        )}
        {page}
      </main>
    </Lab.Provider>
  );
}

export default function NarrativeLab() {
  useNoIndex();
  useEffect(() => {
    document.title = "Narrative Lab";
  }, []);
  return (
    <div className="nl">
      <style>{CSS}</style>
      <AuthGate title="Narrative Lab">{(user) => <Console user={user} />}</AuthGate>
    </div>
  );
}
