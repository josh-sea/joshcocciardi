import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  authMessage,
  redirectSettled,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOutEverywhere,
  signUpWithEmail,
  watchAuth,
} from "../../lib/auth";
import Setup from "./Setup";
import { readDeviceCreds, writeDeviceCreds } from "./creds";
import { clearCreds, saveCreds, saveLeague, watchConnection } from "./store";
import {
  EspnError,
  currentWeek,
  fetchAvailable,
  fetchLeagueSnapshot,
  fullName,
  injuryLabel,
  posName,
  shapeMatchup,
  shapeTeams,
  teamAbbrev,
  testConnection,
  weekPoints,
} from "./espn";
import css from "./styles";

// ---------------------------------------------------------------------------
// Sunday Desk — the in-season half of the fantasy tools.
//
// Draft Night ends when the draft does. This is the rest of the year: what the
// matchup looks like, who is actually on the roster, and who is worth claiming.
//
// Everything here needs the league, and a private ESPN league can only be read
// server-side (see functions/espn.js for why), so the whole tool is gated on a
// working connection rather than pretending to work without one.
// ---------------------------------------------------------------------------

const TABS = [
  ["matchup", "Matchup"],
  ["team", "My Team"],
  ["wire", "Waiver Wire"],
  ["standings", "Standings"],
  ["setup", "Setup"],
];

const SLOT_FILTERS = [
  ["All", null],
  ["QB", [0]],
  ["RB", [2]],
  ["WR", [4]],
  ["TE", [6]],
  ["D/ST", [16]],
  ["K", [17]],
];

const num = (v, digits = 1) => (typeof v === "number" ? v.toFixed(digits) : "—");

export default function SundayDesk() {
  const [user, setUser] = useState(undefined);
  // Returning from a Google redirect, "no user yet" and "signed out" look the
  // same until getRedirectResult settles. Waiting stops the sign-in screen
  // flashing up over a session that is about to arrive.
  const [redirectDone, setRedirectDone] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authNotice, setAuthNotice] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authMode, setAuthMode] = useState("in"); // in | up | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("matchup");
  const [connection, setConnection] = useState(undefined);
  const [deviceCreds, setDeviceCreds] = useState(() => readDeviceCreds());
  const [syncCreds, setSyncCreds] = useState(true);

  const [league, setLeague] = useState(null);
  const [week, setWeek] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testState, setTestState] = useState(null);

  const [wire, setWire] = useState(null);
  const [wireSlot, setWireSlot] = useState(null);
  const [wireLoading, setWireLoading] = useState(false);

  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#0C1A13";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    redirectSettled.finally(() => {
      if (alive) setRedirectDone(true);
    });
    const stop = watchAuth((u) => setUser(u || null));
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setConnection(null);
      return undefined;
    }
    return watchConnection(
      user.uid,
      (c) => setConnection(c),
      (e) => {
        console.error("[sunday-desk] connection read failed:", e);
        setConnection(null);
      }
    );
  }, [user]);

  // Credentials travel with the request only when they aren't already stored
  // server-side for this user.
  const inlineCreds = connection?.hasStoredCreds ? undefined : deviceCreds || undefined;
  const ready = Boolean(connection?.leagueId && (connection?.hasStoredCreds || deviceCreds));

  const load = useCallback(
    async (targetWeek) => {
      if (!ready) return;
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchLeagueSnapshot({
          leagueId: connection.leagueId,
          season: connection.season,
          week: targetWeek,
          creds: inlineCreds,
        });
        setLeague(data);
        setWeek((w) => targetWeek || w || currentWeek(data));
      } catch (e) {
        setLoadError(e instanceof EspnError ? e : new EspnError("other", String(e.message || e)));
      } finally {
        setLoading(false);
      }
    },
    [ready, connection, inlineCreds]
  );

  useEffect(() => {
    if (ready && !league) load(undefined);
  }, [ready, league, load]);

  const teams = useMemo(() => shapeTeams(league), [league]);
  const myTeamId = Number(connection?.teamId) || null;
  const myTeam = useMemo(() => teams.find((t) => t.id === myTeamId) || null, [teams, myTeamId]);
  const activeWeek = week || (league ? currentWeek(league) : 1);
  const matchup = useMemo(
    () => (league && myTeamId ? shapeMatchup(league, activeWeek, myTeamId) : null),
    [league, myTeamId, activeWeek]
  );

  const loadWire = useCallback(
    async (slotIds) => {
      if (!ready) return;
      setWireLoading(true);
      try {
        const data = await fetchAvailable({
          leagueId: connection.leagueId,
          season: connection.season,
          week: activeWeek,
          slotIds,
          creds: inlineCreds,
        });
        setWire(data?.players || []);
      } catch (e) {
        setLoadError(e instanceof EspnError ? e : new EspnError("other", String(e.message || e)));
      } finally {
        setWireLoading(false);
      }
    },
    [ready, connection, inlineCreds, activeWeek]
  );

  useEffect(() => {
    if (tab === "wire" && ready && wire === null && !wireLoading) loadWire(wireSlot);
  }, [tab, ready, wire, wireLoading, wireSlot, loadWire]);

  // ---- setup actions -----------------------------------------------------
  const handleSaveLeague = async (payload) => {
    setBusy(true);
    try {
      await saveLeague(user.uid, payload);
      setLeague(null);
      setWire(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCreds = async (creds) => {
    setBusy(true);
    setTestState(null);
    try {
      if (syncCreds) {
        await saveCreds(user.uid, creds);
        writeDeviceCreds(null);
        setDeviceCreds(null);
      } else {
        writeDeviceCreds(creds);
        setDeviceCreds(creds);
      }
      setLeague(null);
      setWire(null);
    } finally {
      setBusy(false);
    }
  };

  const handleClearCreds = async () => {
    if (!window.confirm("Remove the saved ESPN cookies? The league ids stay.")) return;
    setBusy(true);
    try {
      await clearCreds(user.uid);
      writeDeviceCreds(null);
      setDeviceCreds(null);
      setLeague(null);
      setTestState(null);
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setTestState(null);
    try {
      const data = await testConnection({
        leagueId: connection?.leagueId,
        season: connection?.season,
        creds: inlineCreds,
      });
      const name = data?.settings?.name || "your league";
      setTestState({ ok: true, message: `Connected. ESPN returned “${name}”.` });
      setLeague(null);
    } catch (e) {
      setTestState({ ok: false, message: e.message });
    } finally {
      setBusy(false);
    }
  };

  // ---- rows --------------------------------------------------------------
  const PlayerRow = ({ entry, showSlot = true }) => {
    const p = entry.player;
    if (!p) return null;
    const pts = weekPoints(p, activeWeek);
    const inj = injuryLabel(p.injuryStatus);
    return (
      <div className={"prow" + (entry.bench ? " bench" : "")}>
        {showSlot && <div className="slot">{entry.slot}</div>}
        <div className="pinfo">
          <div className="pname">
            {fullName(p)}
            {inj && <span className="inj"> {inj}</span>}
          </div>
          <div className="pmeta">
            {posName(p.defaultPositionId)} · {teamAbbrev(p.proTeamId)}
          </div>
        </div>
        <div className="pts">
          <div className="actual">{num(pts.actual)}</div>
          <div className="proj">proj {num(pts.projected)}</div>
        </div>
      </div>
    );
  };

  // ---- screens -----------------------------------------------------------
  const connectionGate = (
    <section>
      <div className="card">
        <h3>Connect your ESPN league</h3>
        <p className="muted">
          A private ESPN league can't be read from a browser alone: ESPN's cookies don't travel
          cross-site, and pages aren't allowed to attach them by hand. So this tool reads the league
          through a function on this site, using two cookies you paste once. Open <b>Setup</b> to do
          that.
        </p>
        <button className="btn" type="button" onClick={() => setTab("setup")}>
          Go to Setup
        </button>
      </div>
    </section>
  );

  const errorPanel = loadError && (
    <div className={"card " + (loadError.kind === "auth" ? "bad" : "")}>
      <h3>{loadError.kind === "auth" ? "ESPN rejected the cookies" : "Couldn't load the league"}</h3>
      <p className="muted">{loadError.message}</p>
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => load(activeWeek)}>
          Try again
        </button>
        <button className="btn" type="button" onClick={() => setTab("setup")}>
          Open Setup
        </button>
      </div>
    </div>
  );

  const weekBar = league && (
    <div className="weekbar">
      <button className="wbtn" type="button" onClick={() => load(Math.max(1, activeWeek - 1))}>
        ◂
      </button>
      <b>Week {activeWeek}</b>
      <button className="wbtn" type="button" onClick={() => load(Math.min(18, activeWeek + 1))}>
        ▸
      </button>
      <span className="grow" />
      <button className="wbtn" type="button" onClick={() => load(activeWeek)} disabled={loading}>
        {loading ? "refreshing…" : "refresh"}
      </button>
    </div>
  );

  const matchupTab = (
    <section>
      {weekBar}
      {!matchup ? (
        <p className="muted pad">
          {league
            ? myTeamId
              ? `No matchup found for week ${activeWeek}.`
              : "Set your team ID in Setup so I know which side is yours."
            : "Loading…"}
        </p>
      ) : (
        (() => {
          const meTeam = teams.find((t) => t.id === matchup.me?.teamId);
          const themTeam = teams.find((t) => t.id === matchup.them?.teamId);
          const meStarters = (meTeam?.roster || []).filter((e) => !e.bench);
          const themStarters = (themTeam?.roster || []).filter((e) => !e.bench);
          const projTotal = (roster) =>
            roster.reduce((n, e) => n + (weekPoints(e.player, activeWeek).projected || 0), 0);
          return (
            <>
              <div className="score">
                <div className="side">
                  <div className="tname">{meTeam?.name || "You"}</div>
                  <div className="tpts">{num(matchup.me?.totalPoints)}</div>
                  <div className="tproj">proj {num(projTotal(meStarters))}</div>
                </div>
                <div className="vs">vs</div>
                <div className="side">
                  <div className="tname">{themTeam?.name || "Opponent"}</div>
                  <div className="tpts">{num(matchup.them?.totalPoints)}</div>
                  <div className="tproj">proj {num(projTotal(themStarters))}</div>
                </div>
              </div>
              <h4 className="sub">Your starters</h4>
              {meStarters.map((e, i) => (
                <PlayerRow key={`me${i}`} entry={e} />
              ))}
              <h4 className="sub">Their starters</h4>
              {themStarters.map((e, i) => (
                <PlayerRow key={`them${i}`} entry={e} />
              ))}
            </>
          );
        })()
      )}
    </section>
  );

  const teamTab = (
    <section>
      {weekBar}
      {!myTeam ? (
        <p className="muted pad">
          {league ? "Set your team ID in Setup." : "Loading…"}
        </p>
      ) : (
        <>
          <div className="card tight">
            <h3>{myTeam.name}</h3>
            <p className="muted">
              {myTeam.wins}-{myTeam.losses}
              {myTeam.ties ? `-${myTeam.ties}` : ""} · {num(myTeam.pointsFor)} for ·{" "}
              {num(myTeam.pointsAgainst)} against
            </p>
          </div>
          <h4 className="sub">Starters</h4>
          {myTeam.roster.filter((e) => !e.bench).map((e, i) => (
            <PlayerRow key={`s${i}`} entry={e} />
          ))}
          <h4 className="sub">Bench</h4>
          {myTeam.roster.filter((e) => e.bench).map((e, i) => (
            <PlayerRow key={`b${i}`} entry={e} />
          ))}
        </>
      )}
    </section>
  );

  const wireTab = (
    <section>
      <div className="chips">
        {SLOT_FILTERS.map(([label, slots]) => (
          <button
            key={label}
            type="button"
            aria-pressed={JSON.stringify(slots) === JSON.stringify(wireSlot)}
            onClick={() => {
              setWireSlot(slots);
              setWire(null);
              loadWire(slots);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted pad">
        Free agents and waiver claims, most-rostered first. Roster percentage is ESPN-wide, so a
        high number on someone still available here means the league is asleep on him.
      </p>
      {wireLoading && <p className="muted pad">Loading the wire…</p>}
      {(wire || []).map((row, i) => {
        const p = row.player || row;
        const pts = weekPoints(p, activeWeek);
        const owned = p.ownership?.percentOwned;
        const change = p.ownership?.percentChange;
        return (
          <div className="prow" key={p.id || i}>
            <div className="pinfo">
              <div className="pname">
                {fullName(p)}
                {injuryLabel(p.injuryStatus) && (
                  <span className="inj"> {injuryLabel(p.injuryStatus)}</span>
                )}
              </div>
              <div className="pmeta">
                {posName(p.defaultPositionId)} · {teamAbbrev(p.proTeamId)}
                {typeof owned === "number" && ` · ${owned.toFixed(0)}% rostered`}
                {typeof change === "number" && change !== 0 && (
                  <span className={change > 0 ? "up" : "down"}>
                    {" "}
                    {change > 0 ? "▲" : "▼"}
                    {Math.abs(change).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <div className="pts">
              <div className="proj">proj {num(pts.projected)}</div>
            </div>
          </div>
        );
      })}
      {wire && wire.length === 0 && !wireLoading && (
        <p className="muted pad">Nothing came back for that filter.</p>
      )}
    </section>
  );

  const standingsTab = (
    <section>
      {[...teams]
        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
        .map((t, i) => (
          <div className={"prow" + (t.id === myTeamId ? " mine" : "")} key={t.id}>
            <div className="slot">{i + 1}</div>
            <div className="pinfo">
              <div className="pname">{t.name}</div>
              <div className="pmeta">
                {t.wins}-{t.losses}
                {t.ties ? `-${t.ties}` : ""} · {num(t.pointsFor)} PF · {num(t.pointsAgainst)} PA
              </div>
            </div>
          </div>
        ))}
      {teams.length === 0 && <p className="muted pad">Loading…</p>}
    </section>
  );

  // ---- shell -------------------------------------------------------------
  const runAuth = async (fn) => {
    setSigningIn(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      await fn();
    } catch (e) {
      setAuthError(authMessage(e));
    } finally {
      setSigningIn(false);
    }
  };

  if (user === undefined || (!user && !redirectDone)) {
    return (
      <div className="sd">
        <style>{css}</style>
        <div className="wrap">
          <p className="muted pad">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="sd">
        <style>{css}</style>
        <div className="wrap">
          <header>
            <h1>Sunday Desk</h1>
            <p className="muted">Matchups, rosters and the waiver wire for your ESPN league.</p>
          </header>
          <div className="card">
            <h3>Sign in first</h3>
            <p className="muted">
              Your league connection is stored against your account, so this needs a sign-in before
              anything else.
            </p>
            <button
              className="btn"
              type="button"
              disabled={signingIn}
              onClick={() =>
                runAuth(async () => {
                  await signInWithGoogle();
                })
              }
            >
              {signingIn ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="orrule">or use an email and password</div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (authMode === "reset") {
                  return runAuth(async () => {
                    await resetPassword(email.trim());
                    setAuthNotice("Reset sent. Check your email, then sign in.");
                    setAuthMode("in");
                  });
                }
                if (authMode === "up") {
                  return runAuth(() => signUpWithEmail(email.trim(), password));
                }
                return runAuth(() => signInWithEmail(email.trim(), password));
              }}
            >
              <label className="field">
                <span className="flabel">Email</span>
                <input
                  className="input"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {authMode !== "reset" && (
                <label className="field">
                  <span className="flabel">Password</span>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authMode === "up" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <button className="btn ghost" type="submit" disabled={signingIn}>
                {authMode === "up" ? "Create account" : authMode === "reset" ? "Send reset email" : "Sign in"}
              </button>
            </form>

            {authError && <div className="err">{authError}</div>}
            {authNotice && <div className="ok">{authNotice}</div>}

            <div className="row" style={{ marginTop: 12 }}>
              {authMode === "in" ? (
                <>
                  <button className="linkish" type="button" onClick={() => setAuthMode("up")}>
                    Create an account
                  </button>
                  <button className="linkish" type="button" onClick={() => setAuthMode("reset")}>
                    Forgot password
                  </button>
                </>
              ) : (
                <button className="linkish" type="button" onClick={() => setAuthMode("in")}>
                  ◂ Back to sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sd">
      <style>{css}</style>
      <div className="wrap">
        <header>
          <div>
            <h1>Sunday Desk</h1>
            <p className="muted">
              {connection?.leagueId ? `League ${connection.leagueId} · ${connection.season}` : "No league connected"}
            </p>
          </div>
          <button className="linkish" type="button" onClick={() => signOutEverywhere()}>
            sign out
          </button>
        </header>
      </div>

      <nav role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="wrap">
        {errorPanel}
        {tab === "setup" ? (
          <Setup
            connection={connection}
            deviceCreds={deviceCreds}
            syncCreds={syncCreds}
            onSyncChange={setSyncCreds}
            onSaveLeague={handleSaveLeague}
            onSaveCreds={handleSaveCreds}
            onClearCreds={handleClearCreds}
            onTest={handleTest}
            testState={testState}
            busy={busy}
          />
        ) : !ready ? (
          connectionGate
        ) : tab === "matchup" ? (
          matchupTab
        ) : tab === "team" ? (
          teamTab
        ) : tab === "wire" ? (
          wireTab
        ) : (
          standingsTab
        )}
        <footer>
          Reads your ESPN league through a function on this site, because browsers can't attach
          ESPN's cookies to a cross-site request. Nothing is written back to ESPN.
        </footer>
      </div>
    </div>
  );
}
