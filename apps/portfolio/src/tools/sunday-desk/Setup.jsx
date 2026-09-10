import React, { useState } from "react";
import { maskCred } from "./creds";

/* Pull the ids straight out of a pasted ESPN team URL, e.g.
   fantasy.espn.com/football/team?leagueId=579622&teamId=5&seasonId=2026 */
export const parseEspnUrl = (raw) => {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (!/espn\.com$/.test(url.hostname.replace(/^.*?\./, "espn.com")) && !url.hostname.includes("espn.com")) {
      return null;
    }
    const q = url.searchParams;
    const leagueId = q.get("leagueId");
    if (!leagueId) return null;
    return {
      leagueId,
      teamId: q.get("teamId") || "",
      season: q.get("seasonId") || String(new Date().getFullYear()),
    };
  } catch (e) {
    return null;
  }
};

const Instructions = () => (
  <div className="howto">
    <h4>Getting the two cookies</h4>
    <p className="muted">
      You need them once. They last a long time, and you come back here to replace them only when
      the connection starts failing.
    </p>
    <ol>
      <li>
        On a <b>desktop or laptop</b>, sign in at <b>fantasy.espn.com</b>. This cannot be done from
        an iPhone or iPad, because Safari gives you no way to read a cookie. Do it once on a
        computer and, if you sync to your account below, your phone is covered too.
      </li>
      <li>
        Open developer tools: <b>F12</b>, or right-click anywhere and choose <b>Inspect</b>.
      </li>
      <li>
        Go to <b>Application</b> (Chrome and Edge) or <b>Storage</b> (Firefox and Safari), then open{" "}
        <b>Cookies → https://fantasy.espn.com</b>.
      </li>
      <li>
        Find <b>espn_s2</b>. It is very long and full of <code>%2F</code> escapes. Right-click the
        value and copy it rather than selecting it by hand, because the panel truncates what it
        shows and a half-copied value fails silently.
      </li>
      <li>
        Find <b>SWID</b>. It is short and looks like <code>{"{1E6CC139-...}"}</code>. Keep the curly
        braces.
      </li>
    </ol>
    <p className="warn">
      These are session cookies for your whole ESPN and Disney account, not scoped fantasy keys.
      Anyone holding them can act as you on ESPN. Paste them here and nowhere else, and never into
      a chat or an email.
    </p>
  </div>
);

export default function Setup({
  connection,
  deviceCreds,
  syncCreds,
  onSyncChange,
  onSaveLeague,
  onSaveCreds,
  onClearCreds,
  onTest,
  testState,
  busy,
}) {
  const [urlPaste, setUrlPaste] = useState("");
  const [leagueId, setLeagueId] = useState(connection?.leagueId || "");
  const [teamId, setTeamId] = useState(connection?.teamId || "");
  const [season, setSeason] = useState(connection?.season || new Date().getFullYear());
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [urlError, setUrlError] = useState(null);

  const applyUrl = () => {
    const parsed = parseEspnUrl(urlPaste);
    if (!parsed) {
      setUrlError("That doesn't look like an ESPN team URL with a leagueId in it.");
      return;
    }
    setUrlError(null);
    setLeagueId(parsed.leagueId);
    if (parsed.teamId) setTeamId(parsed.teamId);
    if (parsed.season) setSeason(parsed.season);
    setUrlPaste("");
  };

  const storedLabel = connection?.hasStoredCreds
    ? `synced to your account${connection.updatedAt ? `, updated ${connection.updatedAt.toLocaleDateString()}` : ""}`
    : deviceCreds
    ? `saved on this device only (${maskCred(deviceCreds.espnS2)})`
    : "not set";

  return (
    <section>
      <div className="card">
        <h3>1 · Which league</h3>
        <label className="field">
          <span className="flabel">Paste your ESPN team URL and I'll pull the ids out</span>
          <input
            className="input"
            type="text"
            value={urlPaste}
            placeholder="https://fantasy.espn.com/football/team?leagueId=…"
            onChange={(e) => setUrlPaste(e.target.value)}
          />
        </label>
        <button className="btn ghost" type="button" onClick={applyUrl} disabled={!urlPaste.trim()}>
          Read the URL
        </button>
        {urlError && <div className="err">{urlError}</div>}

        <div className="grid3">
          <label className="field">
            <span className="flabel">League ID</span>
            <input className="input" value={leagueId} onChange={(e) => setLeagueId(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span className="flabel">Your team ID</span>
            <input className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span className="flabel">Season</span>
            <input className="input" value={season} onChange={(e) => setSeason(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <button
          className="btn"
          type="button"
          disabled={busy || !leagueId}
          onClick={() => onSaveLeague({ leagueId, teamId, season })}
        >
          Save league
        </button>
      </div>

      <div className="card">
        <h3>2 · The two ESPN cookies</h3>
        <p className="muted">
          Currently <b>{storedLabel}</b>.
        </p>

        <label className="field">
          <span className="flabel">espn_s2</span>
          <textarea
            className="input mono"
            rows={3}
            value={espnS2}
            spellCheck="false"
            placeholder="Paste the whole value, %2F escapes and all"
            onChange={(e) => setEspnS2(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="flabel">SWID</span>
          <input
            className="input mono"
            value={swid}
            spellCheck="false"
            placeholder="{1E6CC139-…}"
            onChange={(e) => setSwid(e.target.value)}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={syncCreds} onChange={(e) => onSyncChange(e.target.checked)} />
          <span>
            <b>Sync these to my account</b> so my phone works too. Leave it off and they stay in
            this browser only, which means re-entering them on every device — and on an iPhone
            there is no way to get them in the first place.
          </span>
        </label>

        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={busy || !espnS2.trim() || !swid.trim()}
            onClick={() => {
              onSaveCreds({ espnS2: espnS2.trim(), swid: swid.trim() });
              setEspnS2("");
              setSwid("");
            }}
          >
            Save cookies
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={onTest}>
            Test connection
          </button>
          {(connection?.hasStoredCreds || deviceCreds) && (
            <button className="btn danger" type="button" disabled={busy} onClick={onClearCreds}>
              Remove cookies
            </button>
          )}
        </div>

        {testState && (
          <div className={testState.ok ? "ok" : "err"}>
            {testState.message}
          </div>
        )}
      </div>

      <div className="card">
        <Instructions />
      </div>
    </section>
  );
}
