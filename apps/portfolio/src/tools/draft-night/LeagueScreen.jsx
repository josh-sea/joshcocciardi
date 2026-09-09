import React, { useState } from "react";
import {
  PRESETS,
  configFromPreset,
  normalizeConfig,
  pickNumbers,
  roundCount,
  scoringLabel,
  starterCount,
  treeFits,
} from "./league";
import {
  authMessage,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "./auth";

const PPR_CHOICES = [
  [0, "Standard"],
  [0.5, "Half PPR"],
  [1, "Full PPR"],
];

const SLOT_FIELDS = [
  ["QB", "QB"],
  ["RB", "RB"],
  ["WR", "WR"],
  ["TE", "TE"],
  ["FLEX", "FLEX"],
  ["DST", "D/ST"],
  ["K", "K"],
  ["BN", "Bench"],
];

/* Sign in. Google first because that's what everyone taps; email exists so a
   friend without a Google account isn't locked out. */
const SignIn = ({ onDone }) => {
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (onDone) onDone();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "reset") {
      return run(async () => {
        await resetPassword(email.trim());
        setNotice("Password reset sent. Check your email, then sign in.");
        setMode("in");
      });
    }
    if (mode === "up") return run(() => signUpWithEmail(email.trim(), password));
    return run(() => signInWithEmail(email.trim(), password));
  };

  return (
    <div className="note key">
      <h3>Sign in to save your draft</h3>
      <p style={{ marginBottom: 12 }}>
        Without an account the tool works exactly the same, it just keeps your draft in this
        browser only. Signing in syncs it, and lets you keep more than one league.
      </p>
      <button className="bigbtn" type="button" disabled={busy} onClick={() => run(signInWithGoogle)}>
        Continue with Google
      </button>
      <div className="orrule">or</div>
      <form onSubmit={submit}>
        <label className="field">
          <span className="flabel">Email</span>
          <input
            className="tinput"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "reset" && (
          <label className="field">
            <span className="flabel">Password</span>
            <input
              className="tinput"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button className="bigbtn ghost" type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "up" ? "Create account" : mode === "reset" ? "Send reset email" : "Sign in"}
        </button>
      </form>
      {error && <div className="err">{error}</div>}
      {notice && <div className="ok">{notice}</div>}
      <div className="linkrow">
        {mode === "in" ? (
          <>
            <button className="linkish" type="button" onClick={() => setMode("up")}>
              Create an account
            </button>
            <button className="linkish" type="button" onClick={() => setMode("reset")}>
              Forgot password
            </button>
          </>
        ) : (
          <button className="linkish" type="button" onClick={() => setMode("in")}>
            ◂ Back to sign in
          </button>
        )}
      </div>
    </div>
  );
};

/* Create or edit a league. Presets fill the form; every field stays editable
   afterwards, so "ESPN default but I'm at slot 7" is two taps. */
const LeagueForm = ({ initial, initialName, initialPreset, onSave, onCancel, saveLabel }) => {
  const [name, setName] = useState(initialName || "");
  const [preset, setPreset] = useState(initialPreset || "josh");
  const [cfg, setCfg] = useState(() => normalizeConfig(initial || configFromPreset(initialPreset || "josh")));

  // Swapping presets renames the league too, unless the name was typed by
  // hand — otherwise you end up with an ESPN-default league still calling
  // itself by the preset it started from.
  const applyPreset = (key) => {
    setPreset(key);
    if (key !== "custom") setCfg(configFromPreset(key));
    const untouched = Object.values(PRESETS).some((p) => p.label === name.trim());
    if (!name.trim() || untouched) setName(PRESETS[key].label);
  };

  // Any hand edit means this is no longer the preset it started as.
  const patch = (next) => {
    setCfg((prev) => normalizeConfig({ ...prev, ...next }));
    setPreset("custom");
  };
  const patchSlot = (key, value) => {
    setCfg((prev) => normalizeConfig({ ...prev, slots: { ...prev.slots, [key]: value } }));
    setPreset("custom");
  };
  const patchScoring = (key, value) => {
    setCfg((prev) => normalizeConfig({ ...prev, scoring: { ...prev.scoring, [key]: value } }));
    setPreset("custom");
  };

  const rounds = roundCount(cfg);
  const picks = pickNumbers(cfg);

  return (
    <div className="note">
      <h3>{saveLabel === "Save changes" ? "League settings" : "New league"}</h3>

      <label className="field">
        <span className="flabel">League name</span>
        <input
          className="tinput"
          type="text"
          value={name}
          placeholder="Sunday nighters"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="flabel" style={{ marginTop: 12 }}>Start from</div>
      <div className="chips">
        {Object.entries(PRESETS).map(([key, p]) => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            onClick={() => applyPreset(key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 6 }}>{PRESETS[preset].blurb}</p>

      <div className="grid2" style={{ marginTop: 12 }}>
        <label className="field">
          <span className="flabel">Teams</span>
          <input
            className="tinput"
            type="number"
            min={4}
            max={16}
            value={cfg.teams}
            onChange={(e) => patch({ teams: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="flabel">Your draft slot</span>
          <input
            className="tinput"
            type="number"
            min={1}
            max={cfg.teams}
            value={cfg.seat}
            onChange={(e) => patch({ seat: e.target.value })}
          />
        </label>
      </div>

      <div className="flabel" style={{ marginTop: 12 }}>Roster</div>
      <div className="slotgrid">
        {SLOT_FIELDS.map(([key, label]) => (
          <label key={key} className="field">
            <span className="flabel">{label}</span>
            <input
              className="tinput"
              type="number"
              min={0}
              max={12}
              value={cfg.slots[key]}
              onChange={(e) => patchSlot(key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="flabel" style={{ marginTop: 12 }}>Scoring</div>
      <div className="chips">
        {PPR_CHOICES.map(([val, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={cfg.scoring.ppr === val}
            onClick={() => patchScoring("ppr", val)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={cfg.scoring.superflex}
          onClick={() => patchScoring("superflex", !cfg.scoring.superflex)}
        >
          Superflex
        </button>
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <label className="field">
          <span className="flabel">Points per pass TD</span>
          <input
            className="tinput"
            type="number"
            min={3}
            max={6}
            value={cfg.scoring.passTd}
            onChange={(e) => patchScoring("passTd", e.target.value)}
          />
        </label>
      </div>

      <p className="sub" style={{ marginTop: 12 }}>
        {starterCount(cfg)} starters and {cfg.slots.BN} bench means <b>{rounds} rounds</b>. Your picks:{" "}
        {picks.slice(0, 6).join(" · ")}
        {picks.length > 6 ? " …" : ""}
      </p>
      {!treeFits(cfg) && (
        <p className="sub" style={{ marginTop: 6, color: "var(--signal)" }}>
          The hand-written pick tree only covers a 10-team half-PPR draft from slot 2. This league
          gets the best-available engine on the Tree tab instead.
        </p>
      )}

      <div className="btnrow">
        <button
          className="bigbtn"
          type="button"
          onClick={() => onSave({ name: name.trim() || PRESETS[preset].label, preset, config: cfg })}
        >
          {saveLabel || "Create league"}
        </button>
        {onCancel && (
          <button className="bigbtn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

/* The whole account + league surface. Replaces the draft screen when open. */
export default function LeagueScreen({
  user,
  leagues,
  listLoading,
  listError,
  activeId,
  activeConfig,
  localHasDraft,
  onOpen,
  onCreate,
  onSaveSettings,
  onDelete,
  onSignOut,
  onClose,
  onImportLocal,
  onLocalChange,
  localLeague,
}) {
  const [mode, setMode] = useState(null); // null | "new" | "edit"
  const active = leagues.find((l) => l.id === activeId);

  return (
    <section>
      <div className="btnrow" style={{ marginBottom: 12 }}>
        <button className="bigbtn ghost" type="button" onClick={onClose}>
          ◂ Back to the draft
        </button>
      </div>

      {user === undefined && <p className="sub">Checking your session…</p>}

      {user === null && (
        <>
          <SignIn />
          <p className="sub" style={{ marginTop: 10 }}>
            You're drafting signed out right now. Everything works, and your picks are saved in this
            browser. Sign in and they move to your account, this browser's draft included.
          </p>
        </>
      )}

      {user && (
        <>
          <div className="whoami">
            <span className="avatar" aria-hidden="true">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                (user.displayName || user.email || "?").slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="whoname" title={user.email || ""}>
              {user.displayName || user.email}
            </span>
            <button className="linkish" type="button" onClick={onSignOut}>
              sign out
            </button>
          </div>

          {localHasDraft && (
            <div className="note good">
              <h3>There's a draft saved in this browser</h3>
              <p style={{ marginBottom: 10 }}>
                It isn't in your account yet. Import it and it becomes a league you can pick back up
                on any device.
              </p>
              <button className="bigbtn" type="button" onClick={onImportLocal}>
                Import this browser's draft
              </button>
            </div>
          )}

          {listError && (
            <div className="note warn">
              <h3>Couldn't load your leagues</h3>
              <p>{listError}</p>
            </div>
          )}

          {listLoading ? (
            <p className="sub">Loading your leagues…</p>
          ) : (
            <>
              <h2 style={{ margin: "16px 0 8px" }}>Your leagues</h2>
              {leagues.length === 0 && (
                <p className="sub">Nothing yet. Create one below and it syncs to your account.</p>
              )}
              {leagues.map((l) => (
                <div key={l.id} className={"leaguerow" + (l.id === activeId ? " on" : "")}>
                  <button className="leagueopen" type="button" onClick={() => onOpen(l.id)}>
                    <div className="nm">{l.name}</div>
                    <div className="meta">
                      {scoringLabel(l.config)} · slot {l.config.seat} · {l.mine.length}/
                      {roundCount(l.config)} picks in
                    </div>
                  </button>
                  <button
                    className="mineBtn"
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${l.name}" and its draft?`)) onDelete(l.id);
                    }}
                  >
                    DEL
                  </button>
                </div>
              ))}
            </>
          )}

          {mode === "new" && (
            <LeagueForm
              initialPreset="josh"
              onSave={(payload) => {
                onCreate(payload);
                setMode(null);
              }}
              onCancel={() => setMode(null)}
            />
          )}

          {mode === "edit" && active && (
            <LeagueForm
              initial={active.config}
              initialName={active.name}
              initialPreset={active.preset}
              saveLabel="Save changes"
              onSave={(payload) => {
                onSaveSettings(active.id, payload);
                setMode(null);
              }}
              onCancel={() => setMode(null)}
            />
          )}

          {mode === null && (
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="bigbtn" type="button" onClick={() => setMode("new")}>
                New league
              </button>
              {active && (
                <button className="bigbtn ghost" type="button" onClick={() => setMode("edit")}>
                  Edit “{active.name}”
                </button>
              )}
            </div>
          )}
        </>
      )}

      {user === null && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ margin: "0 0 8px" }}>This browser's league</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            {scoringLabel(activeConfig)} · slot {activeConfig.seat} · {roundCount(activeConfig)}{" "}
            rounds. Change it here and it applies to the draft saved in this browser. Sign in to keep
            more than one.
          </p>
          <LeagueForm
            initial={localLeague.config}
            initialName={localLeague.name}
            initialPreset={localLeague.preset}
            saveLabel="Save changes"
            onSave={(payload) => {
              onLocalChange({ name: payload.name, preset: payload.preset, config: payload.config });
              onClose();
            }}
          />
        </div>
      )}
    </section>
  );
}
