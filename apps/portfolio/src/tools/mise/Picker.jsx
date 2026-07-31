import React, { useState } from "react";
import AccountBar from "./AccountBar";
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

function NewPlan({ onCreate, onCancel, busy }) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].key);

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const chosen = TEMPLATES.find((t) => t.key === template) || TEMPLATES[0];
    onCreate({
      name: name.trim() || "New implementation",
      client: client.trim(),
      tree: chosen.build(),
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

      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

export default function Picker({ user, rows, loading, error, onOpen, onCreate, onDelete, onSignOut }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async (payload) => {
    setBusy(true);
    try {
      await onCreate(payload);
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="word">Mise</span>
          <span className="sub">everything flows right</span>
          <div style={{ marginLeft: "auto" }}>
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
          {!creating && (
            <button
              className="act solid"
              style={{ marginLeft: "auto" }}
              onClick={() => setCreating(true)}
            >
              ＋ new
            </button>
          )}
        </div>

        {error && <div className="err">{error}</div>}

        {creating && <NewPlan onCreate={create} onCancel={() => setCreating(false)} busy={busy} />}

        {!loading && rows.length === 0 && !creating && (
          <div className="empty" style={{ marginTop: 18 }}>
            <div className="planname">No plans yet</div>
            <div className="sub" style={{ marginTop: 6 }}>
              Start from the Casap structure or a blank outcome.
            </div>
            <button className="act solid" style={{ marginTop: 14 }} onClick={() => setCreating(true)}>
              ＋ new implementation
            </button>
          </div>
        )}

        <div className="plans">
          {rows.map((r) => {
            const leaves = r.tree ? leavesOf(r.tree) : [];
            const done = leaves.filter((l) => l.done).length;
            return (
              <div className="planitem" key={r.id}>
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
          each plan is one convergence chart · the bar is one segment per end step, pine for closed and
          owner color for what is still open
        </div>
      </div>
    </>
  );
}
