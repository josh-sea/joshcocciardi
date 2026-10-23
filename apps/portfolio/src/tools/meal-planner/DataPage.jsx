import React, { useEffect, useMemo, useState } from "react";
import { applyImport, watchWeek } from "./store";
import { PARTS, describeSummary, exportData, parseImport, planImport } from "./transfer";
import { addDays, mondayOf, todayKey, weekLabel } from "./plan";

/* Import and export as JSON, for a backup or for a round trip through a
   chat with Claude: copy the export, ask for changes, paste the answer
   back. Import shows exactly what it will change before anything is
   written. */
export default function DataPage({ hid, user, household, config, recipes, inventory, initialParts, onError, onClose }) {
  const today = todayKey();
  const [parts, setParts] = useState(initialParts);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [days, setDays] = useState({});
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState("merge");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setDays({});
    return watchWeek(hid, monday, setDays, onError);
  }, [hid, monday, onError]);

  const json = useMemo(
    () =>
      JSON.stringify(
        exportData({ parts, kitchenName: household.name, config, recipes, inventory, days, weekStart: monday, today }),
        null,
        2
      ),
    [parts, household.name, config, recipes, inventory, days, monday, today]
  );

  // Parsed and planned as it's pasted, so the preview is always current.
  const parsed = useMemo(() => (paste.trim() ? parseImport(paste) : null), [paste]);
  const plan = useMemo(
    () =>
      parsed?.ok
        ? planImport(parsed.data, {
            mode,
            config,
            recipes,
            inventory,
            uid: user.uid,
            today,
            currentDays: days,
            currentWeek: monday,
          })
        : null,
    [parsed, mode, config, recipes, inventory, user.uid, today, days, monday]
  );

  const toggle = (key) => setParts((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      onError(new Error("Couldn't copy. Select the text and copy it instead."));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-planner-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const apply = async () => {
    if (!plan || busy) return;
    if (
      mode === "replace" &&
      !window.confirm("Replace removes anything in the pasted sections that isn't in the JSON. Go ahead?")
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await applyImport(hid, plan.ops);
      setNotice(`Imported. ${describeSummary(plan.summary).join(". ")}.`);
      setPaste("");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const lines = plan ? describeSummary(plan.summary) : [];
  const shownWarnings = plan ? plan.warnings.slice(0, 8) : [];

  return (
    <div className="page narrow">
      <div className="pagehead">
        <h2 className="h2">Import and export</h2>
        <button className="btn small" type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <section className="card form">
        <h3 className="sechead">Export</h3>
        <div className="chipline" role="group" aria-label="What to export">
          {PARTS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`chipbtn toggle ${parts.includes(p.key) ? "on" : ""}`}
              aria-pressed={parts.includes(p.key)}
              onClick={() => toggle(p.key)}
            >
              {parts.includes(p.key) ? "✓ " : ""}
              {p.label}
            </button>
          ))}
        </div>
        {parts.includes("plan") && (
          <div className="weeknav" style={{ marginTop: 10, marginBottom: 0 }}>
            <button className="iconbtn" type="button" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>
              ‹
            </button>
            <div className="weeklabel">{weekLabel(monday)}</div>
            <button className="iconbtn" type="button" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>
              ›
            </button>
          </div>
        )}
        <textarea className="input mono" rows={10} readOnly value={json} aria-label="Exported JSON" onFocus={(e) => e.target.select()} />
        <div className="row gap" style={{ marginTop: 10 }}>
          <button className="btn small" type="button" onClick={copy} disabled={!parts.length}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button className="btn small ghost" type="button" onClick={download} disabled={!parts.length}>
            Download
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Paste it into a chat with Claude and ask for what you want changed ("plan dinners for next week from our
          recipes", "add what's missing for these meals to the list"). The JSON explains its own format, so Claude knows
          how to send it back. Then paste the answer below.
        </p>
      </section>

      <section className="card form">
        <h3 className="sechead">Import</h3>
        <textarea
          className="input mono"
          rows={8}
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setNotice(null);
          }}
          placeholder="Paste JSON here (a whole reply from Claude is fine)"
          aria-label="JSON to import"
        />
        <div className="field">
          <div className="seg" role="group" aria-label="Import mode">
            <button type="button" className={mode === "merge" ? "on" : ""} aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>
              Merge
            </button>
            <button
              type="button"
              className={mode === "replace" ? "on" : ""}
              aria-pressed={mode === "replace"}
              onClick={() => setMode("replace")}
            >
              Replace
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            {mode === "merge"
              ? "Merge adds and updates. Nothing is removed."
              : "Replace makes each pasted section match the JSON exactly, removing what's left out. Sections not in the JSON are untouched."}
          </div>
        </div>

        {parsed && !parsed.ok && <div className="err">{parsed.error}</div>}
        {plan && (
          <div className="preview">
            <div className="flabel">{plan.ops.length ? "This will change" : "Already up to date"}</div>
            {plan.ops.length > 0 && lines.filter((l) => !l.endsWith("no changes")).map((l) => <div key={l}>{l}</div>)}
            {shownWarnings.length > 0 && (
              <ul className="warnings">
                {shownWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {plan.warnings.length > shownWarnings.length && (
                  <li>…and {plan.warnings.length - shownWarnings.length} more.</li>
                )}
              </ul>
            )}
          </div>
        )}
        <button className="btn" type="button" disabled={!plan || !plan.ops.length || busy} onClick={apply}>
          {busy ? "Importing…" : "Import"}
        </button>
        {notice && <div className="ok">{notice}</div>}
      </section>
    </div>
  );
}
