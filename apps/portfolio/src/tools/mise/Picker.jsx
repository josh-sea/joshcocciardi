import React, { useRef, useState } from "react";
import AccountBar from "./AccountBar";
import ThemePicker from "./ThemePicker";
import { themeClass } from "./themes";
import { getDetails } from "./store";
import { EXAMPLE, downloadJson, parseImport, serializePlans } from "./transfer";
import { COMPLETE_COLOR, OWNERS, OWNER_ORDER, TEMPLATES, countAll, leavesOf } from "./tree";

/* The same owner-mix rule the chart uses, drawn as a full-width bar so the
   list reads like a shelf of charts. */
function PlanBar({ tree }) {
  if (!tree) return null;
  const leaves = leavesOf(tree);
  const done = leaves.filter((l) => l.done).length;
  const open = leaves.filter((l) => !l.done);
  const mix = OWNER_ORDER.map((k) => ({ k, n: open.filter((l) => l.owner === k).length })).filter(
    (m) => m.n
  );
  return (
    <div className="planbar">
      {done > 0 && <div style={{ flexGrow: done, background: COMPLETE_COLOR }} />}
      {mix.map((m) => (
        <div key={m.k} style={{ flexGrow: m.n, background: OWNERS[m.k].color }} />
      ))}
    </div>
  );
}

function NewPlan({ onCreate, onCancel, busy, defaultTheme }) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].key);
  const [theme, setTheme] = useState(defaultTheme);

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const chosen = TEMPLATES.find((t) => t.key === template) || TEMPLATES[0];
    onCreate({
      name: name.trim() || "New implementation",
      client: client.trim(),
      tree: chosen.build(),
      theme,
    });
  };

  return (
    <form className="sheet" style={{ maxWidth: "none", marginTop: 18 }} onSubmit={submit}>
      <div className="h1" style={{ fontSize: 18 }}>
        New implementation
      </div>

      <label className="field">
        <span className="flabel">Name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunrise CU go-live"
          autoFocus
        />
      </label>

      <label className="field">
        <span className="flabel">Client</span>
        <input
          className="input"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Optional"
        />
      </label>

      <div className="field">
        <span className="flabel">Start from</span>
        <div className="tmpl">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tmplbtn${template === t.key ? " on" : ""}`}
              onClick={() => setTemplate(t.key)}
            >
              <div className="tmplname">{t.name}</div>
              <div className="tmplblurb">{t.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="flabel">Theme</span>
        <ThemePicker value={theme} onChange={setTheme} />
      </div>

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

/* Paste JSON or pick a .json file. Files are read into the same box so what
   is about to be imported is always visible and editable first. */
function ImportPlan({ onImport, onCancel }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const readFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setText(await f.text());
      setErr(null);
    } catch (x) {
      setErr(`Couldn't read ${f.name}: ${x.message}`);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    let plans;
    try {
      plans = parseImport(text);
    } catch (x) {
      setErr(x.message);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onImport(plans);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  return (
    <form className="sheet" style={{ maxWidth: "none", marginTop: 18 }} onSubmit={submit}>
      <div className="h1" style={{ fontSize: 18 }}>
        Import from JSON
      </div>
      <div className="sub" style={{ marginTop: 6, lineHeight: 1.6 }}>
        one plan, a bare tree, or {"{ \"plans\": [ … ] }"} · steps are{" "}
        {"{ name, owner, done, notes, links, comments, children }"} · owner is us, them, or third · up to 9
        levels deep
      </div>

      <label className="field">
        <span className="flabel">JSON</span>
        <textarea
          className="area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          autoFocus
        />
      </label>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="act" type="button" onClick={() => fileRef.current?.click()}>
          choose file…
        </button>
        <button className="act" type="button" onClick={() => setText(EXAMPLE)}>
          use example
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={readFile}
        />
      </div>

      {err && <div className="err">{err}</div>}

      <button className="btn" type="submit" disabled={busy || !text.trim()}>
        {busy ? "Importing…" : "Import"}
      </button>
      <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

export default function Picker({
  user,
  rows,
  loading,
  error,
  onOpen,
  onCreate,
  onImport,
  onDelete,
  onSignOut,
  shelfTheme,
  onShelfTheme,
}) {
  const [panel, setPanel] = useState(null); // null | "new" | "import"
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const creating = panel === "new";
  const setCreating = (on) => setPanel(on ? "new" : null);

  const create = async (payload) => {
    setBusy(true);
    try {
      await onCreate(payload);
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (plans) => {
    const n = await onImport(plans);
    setPanel(null);
    setNote(n > 1 ? `Imported ${n} plans.` : null);
  };

  const [exporting, setExporting] = useState(false);
  const exportAll = async () => {
    setExporting(true);
    try {
      const withDetails = await Promise.all(
        rows.map(async (r) => ({ ...r, details: await getDetails(r.id).catch(() => ({})) }))
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`mise-plans-${stamp}.json`, serializePlans(withDetails));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="word">Mise</span>
          <span className="sub">everything flows right</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <ThemePicker value={shelfTheme} onChange={onShelfTheme} />
            <AccountBar user={user} onSignOut={onSignOut} />
          </div>
        </div>
      </div>

      <div className="picker">
        <div className="pickhead">
          <span className="h1">Implementations</span>
          <span className="sub">
            {loading ? "loading…" : `${rows.length} plan${rows.length === 1 ? "" : "s"}`}
          </span>
          {!panel && (
            <div className="row" style={{ marginLeft: "auto" }}>
              {rows.length > 0 && (
                <button
                  className="act"
                  onClick={exportAll}
                  disabled={exporting}
                  title="Download every plan as one JSON file"
                >
                  {exporting ? "exporting…" : "export all ↓"}
                </button>
              )}
              <button className="act" onClick={() => setPanel("import")}>
                import ↑
              </button>
              <button className="act solid" onClick={() => setCreating(true)}>
                ＋ new
              </button>
            </div>
          )}
        </div>

        {error && <div className="err">{error}</div>}
        {note && <div className="ok">{note}</div>}

        {creating && (
          <NewPlan
            onCreate={create}
            onCancel={() => setCreating(false)}
            busy={busy}
            defaultTheme={shelfTheme}
          />
        )}
        {panel === "import" && <ImportPlan onImport={runImport} onCancel={() => setPanel(null)} />}

        {!loading && rows.length === 0 && !panel && (
          <div className="empty" style={{ marginTop: 18 }}>
            <div className="planname">No plans yet</div>
            <div className="sub" style={{ marginTop: 6 }}>
              Start from the Casap structure, a blank outcome, or a JSON file.
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
              <button className="act solid" onClick={() => setCreating(true)}>
                ＋ new implementation
              </button>
              <button className="act" onClick={() => setPanel("import")}>
                import JSON ↑
              </button>
            </div>
          </div>
        )}

        <div className="plans">
          {rows.map((r) => {
            const leaves = r.tree ? leavesOf(r.tree) : [];
            const done = leaves.filter((l) => l.done).length;
            return (
              <div className={`planitem ${themeClass(r.layout.theme)}`} key={r.id}>
                <button className="planopen" onClick={() => onOpen(r.id)}>
                  <div className="planname">{r.name}</div>
                  <div className="sub" style={{ marginTop: 3 }}>
                    {r.client ? `${r.client} · ` : ""}
                    {done}/{leaves.length} end steps · {r.tree ? countAll(r.tree) : 0} tasks
                    {r.updatedAt ? ` · updated ${r.updatedAt.toLocaleDateString()}` : ""}
                  </div>
                  <PlanBar tree={r.tree} />
                </button>
                <button
                  className="planrm"
                  title={`Delete ${r.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${r.name}"? This can't be undone.`)) onDelete(r.id);
                  }}
                >
                  delete
                </button>
              </div>
            );
          })}
        </div>

        <div className="hint" style={{ padding: "26px 0 0" }}>
          each plan is one convergence chart · the bar is one segment per end step, dark for closed and
          owner color for what is still open · each card wears its plan's theme
        </div>
      </div>
    </>
  );
}
