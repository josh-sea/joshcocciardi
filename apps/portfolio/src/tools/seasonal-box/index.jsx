import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AuthGate from "../../work/AuthGate";
import { signOutOfWork } from "../../work/auth";
import CSS from "./styles";
import CommandCenter from "./CommandCenter";
import { AgentPage, AgentsList } from "./Agents";
import { BriefPage, SeasonPage, SeasonsList } from "./Seasons";
import Makers from "./Makers";
import RunView from "./RunView";
import { Ledger, Notes, Settings } from "./Admin";
import { ensureSeeded, heartbeat, watch, watchDoc } from "./store";
import { HQ, explain } from "./ui";

// ---------------------------------------------------------------------------
// Seasonal Box HQ: the private admin console for the seasonal home box.
//
// Ten agents research, source, curate, market, and run operations on their
// own Cloud Functions runtime; this page is where Josh approves what they
// propose, watches them work, and tunes them. Private: unlisted in the tools
// index, behind the same Google allowlist as /work (src/work/access.js), and
// every sbox_* collection is locked to that one account in firestore.rules.
// ---------------------------------------------------------------------------

const NAV = [
  ["command", "Command"],
  ["seasons", "Seasons"],
  ["agents", "Agents"],
  ["makers", "Makers"],
  ["notes", "Taste notes"],
  ["ledger", "Ledger"],
  ["settings", "Settings"],
];

// Detail views highlight the nav item they belong to.
const PARENT = { season: "seasons", brief: "seasons", agent: "agents", run: "agents" };

const useNoIndex = () =>
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

function Console({ user }) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "command";
  const id = params.get("id");
  const go = (v, extra = {}) => {
    setParams({ view: v, ...extra });
    window.scrollTo(0, 0);
  };

  const [settings, setSettings] = useState(null);
  const [agents, setAgents] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [runs, setRuns] = useState([]);
  const [briefs, setBriefs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [makers, setMakers] = useState([]);
  const [kits, setKits] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [counterList, setCounterList] = useState([]);
  const [keyState, setKeyState] = useState(undefined); // undefined unknown, true/false after heartbeat
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const beat = useRef(false);

  useEffect(() => {
    let unsubs = [];
    let live = true;
    const onErr = (e) => setError(explain(e));
    ensureSeeded()
      .catch(onErr)
      .finally(() => {
        if (!live) return;
        unsubs = [
          watchDoc("settings", "global", setSettings, onErr),
          watch("agents", setAgents, onErr),
          watch("seasons", setSeasons, onErr),
          watch("proposals", setProposals, onErr, { orderBy: "createdAt", limit: 300 }),
          watch("runs", setRuns, onErr, { orderBy: "createdAt", limit: 100 }),
          watch("briefs", setBriefs, onErr, { orderBy: "createdAt", limit: 300 }),
          watch("notes", setNotes, onErr),
          watch("makers", setMakers, onErr),
          watch("kits", setKits, onErr),
          watch("tiers", setTiers, onErr),
          watch("counters", setCounterList, onErr),
        ];
        setReady(true);
      });
    return () => {
      live = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  // Once per page load: move any season whose criteria are met, and ask for a
  // fresh Daily Briefing if the last one is stale. This is the heartbeat (see
  // functions/seasonalbox/index.js for why it isn't a cron).
  useEffect(() => {
    if (!ready || beat.current) return;
    beat.current = true;
    heartbeat()
      .then((r) => setKeyState(!!r?.keySet))
      .catch((e) => {
        console.warn("[seasonal-box] heartbeat failed:", e?.message);
      });
  }, [ready]);

  const value = useMemo(
    () => ({
      user,
      settings,
      agents,
      seasons,
      proposals,
      runs,
      briefs,
      notes,
      makers,
      kits,
      tiers,
      counters: byId(counterList),
      agentById: byId(agents),
      seasonById: byId(seasons),
      runById: byId(runs),
      briefById: byId(briefs),
      keyState,
      go,
    }),
    // go is stable enough for consumers; it only closes over setParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, settings, agents, seasons, proposals, runs, briefs, notes, makers, kits, tiers, counterList, keyState]
  );

  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const liveRuns = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const active = PARENT[view] || view;

  let page;
  if (view === "seasons") page = <SeasonsList />;
  else if (view === "season") page = <SeasonPage id={id} />;
  else if (view === "brief") page = <BriefPage id={id} />;
  else if (view === "agents") page = <AgentsList />;
  else if (view === "agent") page = <AgentPage id={id} />;
  else if (view === "run") page = <RunView runId={id} />;
  else if (view === "makers") page = <Makers />;
  else if (view === "notes") page = <Notes />;
  else if (view === "ledger") page = <Ledger />;
  else if (view === "settings") page = <Settings />;
  else page = <CommandCenter />;

  return (
    <HQ.Provider value={value}>
      <div className="sb">
        <style>{CSS}</style>
        <header className="sb-top">
          <div className="sb-topin">
            <div className="sb-brandrow">
              <div className="sb-brand">
                Seasonal Box <small>HQ</small>
              </div>
              <div className="sb-who">
                {liveRuns > 0 && (
                  <span className="sb-row" style={{ gap: 6, flexShrink: 0, flexWrap: "nowrap" }}>
                    <span className="sb-dot live" /> {liveRuns} working
                  </span>
                )}
                <span className="sb-email">{user.email}</span>
                <button className="sb-link" type="button" onClick={signOutOfWork}>
                  Sign out
                </button>
              </div>
            </div>
            <nav className="sb-nav" aria-label="Sections">
              {NAV.map(([k, label]) => (
                <button key={k} type="button" className={active === k ? "on" : ""} onClick={() => go(k)}>
                  {label}
                  {k === "command" && pendingCount > 0 && <span className="sb-badge">{pendingCount}</span>}
                </button>
              ))}
            </nav>
          </div>
        </header>
        <main className="sb-page">
          {error && <div className="sb-err">{error}</div>}
          {!ready || !settings ? <div className="sb-empty">Loading HQ…</div> : page}
        </main>
      </div>
    </HQ.Provider>
  );
}

export default function SeasonalBoxHQ() {
  useNoIndex();
  return <AuthGate title="Seasonal Box HQ">{(user) => <Console user={user} />}</AuthGate>;
}
