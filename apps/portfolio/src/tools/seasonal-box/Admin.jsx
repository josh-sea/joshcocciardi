import React, { useEffect, useMemo, useState } from "react";
import { DEFAULT_AGENTS, DEFAULT_TIMELINE, ORGS } from "./seed";
import { ago, monthKey, usd } from "./pipeline";
import { addMissingAgents, addNote, checkKey, deleteNote, saveApiKey, saveKit, saveSettings, saveTier, updateNote, watch } from "./store";
import { Field, explain, useAction, useHQ } from "./ui";

// Taste notes, the ledger, and settings (spec 8.1 items 10-12).

// ── Taste notes ─────────────────────────────────────────────────────────────

const scopeLabel = (n, { agentById, seasonById }) => {
  if (n.scope === "global") return "Everyone";
  if (n.scope === "org") return `${ORGS.find((o) => o.id === n.scopeId)?.name || n.scopeId} org`;
  if (n.scope === "agent") return agentById[n.scopeId]?.name || n.scopeId;
  if (n.scope === "season") return seasonById[n.scopeId]?.name || "Season";
  return n.scope;
};

const NoteRow = ({ n }) => {
  const hq = useHQ();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  const act = useAction();
  return (
    <div className="sb-list-item">
      <div style={{ minWidth: 0, flex: 1 }}>
        {editing ? (
          <input className="sb-input" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <div>
            {n.pinned ? "📌 " : ""}
            {n.text}
          </div>
        )}
        <div className="sb-small sb-faint">
          {scopeLabel(n, hq)} · {ago(n.createdAt)}
          {n.source?.proposalId ? " · from an approval" : ""}
        </div>
      </div>
      <div className="sb-row" style={{ flexShrink: 0 }}>
        {editing ? (
          <button className="sb-btn sm" type="button" disabled={act.busy} onClick={() => act.run(async () => { await updateNote(n.id, { text }); setEditing(false); })}>
            Save
          </button>
        ) : (
          <button className="sb-link" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button className="sb-link" type="button" onClick={() => act.run(() => updateNote(n.id, { pinned: !n.pinned }))}>
          {n.pinned ? "Unpin" : "Pin"}
        </button>
        <button className="sb-link" type="button" style={{ color: "var(--red)" }} onClick={() => window.confirm("Delete this note?") && act.run(() => deleteNote(n.id))}>
          Delete
        </button>
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

export function Notes() {
  const { notes, agents, seasons } = useHQ();
  const [scope, setScope] = useState("global");
  const [scopeId, setScopeId] = useState("");
  const [text, setText] = useState("");
  const act = useAction();
  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const ids = scope === "org" ? ORGS.map((o) => [o.id, o.name]) : scope === "agent" ? agents.map((a) => [a.id, a.name]) : scope === "season" ? seasons.map((s) => [s.id, s.name]) : [];
  const add = () =>
    act.run(async () => {
      await addNote({ scope, scopeId: scope === "global" ? null : scopeId || ids[0]?.[0], text });
      setText("");
    });
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Taste notes</h1>
          <div className="sb-sub">Standing preferences every matching agent reads at the start of each run. Pinned notes go first.</div>
        </div>
      </div>
      <div className="sb-card">
        <div className="sb-row">
          <select className="sb-input" style={{ width: "auto" }} value={scope} onChange={(e) => { setScope(e.target.value); setScopeId(""); }}>
            <option value="global">Everyone</option>
            <option value="org">An org</option>
            <option value="agent">An agent</option>
            <option value="season">A season</option>
          </select>
          {ids.length > 0 && (
            <select className="sb-input" style={{ width: "auto" }} value={scopeId || ids[0][0]} onChange={(e) => setScopeId(e.target.value)}>
              {ids.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <input className="sb-input" style={{ flex: 1, minWidth: 200 }} placeholder="e.g. No glitter, ever." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && add()} />
          <button className="sb-btn" type="button" disabled={!text.trim() || act.busy} onClick={add}>
            Add
          </button>
        </div>
        {act.error && <div className="sb-err">{act.error}</div>}
      </div>
      <div className="sb-card">
        {sorted.length ? sorted.map((n) => <NoteRow key={n.id} n={n} />) : <div className="sb-empty">No notes yet. Comments you leave on approvals can become notes.</div>}
      </div>
    </div>
  );
}

// ── Ledger ──────────────────────────────────────────────────────────────────

export function Ledger() {
  const { agentById, seasonById, agents, seasons, settings, counters } = useHQ();
  const [entries, setEntries] = useState([]);
  const [err, setErr] = useState(null);
  const [cat, setCat] = useState("all");
  const [agent, setAgent] = useState("all");
  const [season, setSeason] = useState("all");
  useEffect(() => watch("ledger", setEntries, (e) => setErr(explain(e)), { orderBy: "timestamp", limit: 500 }), []);
  const shown = useMemo(
    () => entries.filter((e) => (cat === "all" || e.category === cat) && (agent === "all" || e.agentId === agent) && (season === "all" || e.seasonId === season)),
    [entries, cat, agent, season]
  );
  const total = shown.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const month = counters[`ai-month-${monthKey()}`]?.amount || 0;
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Ledger</h1>
          <div className="sb-sub">Every model call and every dollar spent, written by the server as it happens.</div>
        </div>
        <div className="sb-small sb-muted">
          AI this month <b className="mono">{usd(month)}</b> of {usd(settings?.budgets?.aiMonthlyUsd, { cents: false })}
        </div>
      </div>
      {err && <div className="sb-err">{err}</div>}
      <div className="sb-row" style={{ marginBottom: 12 }}>
        <select className="sb-input" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          <option value="ai">AI</option>
          <option value="operating">Operating</option>
        </select>
        <select className="sb-input" style={{ width: "auto" }} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="sb-input" style={{ width: "auto" }} value={season} onChange={(e) => setSeason(e.target.value)}>
          <option value="all">All seasons</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="sb-small">
          {shown.length} entries · <b className="mono">{usd(total)}</b>
        </span>
      </div>
      <div className="sb-card">
        <div className="sb-tablewrap">
          <table className="sb-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Category</th>
                <th>Agent</th>
                <th>Season</th>
                <th>What</th>
                <th className="num">Tokens in/out</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="sb-faint">{ago(e.timestamp)}</td>
                  <td>
                    <span className={`sb-chip ${e.category === "ai" ? "pine" : "clay"}`}>{e.category}</span>
                  </td>
                  <td>{agentById[e.agentId]?.name || e.agentId || "—"}</td>
                  <td>{seasonById[e.seasonId]?.name || "—"}</td>
                  <td className="sb-small">
                    {e.model ? <span className="mono">{e.model}</span> : null} {e.note}
                  </td>
                  <td className="num sb-small">
                    {e.usage ? `${e.usage.input + e.usage.cacheRead}/${e.usage.output}` : "—"}
                    {e.usage?.cacheRead ? <div className="sb-faint">{Math.round((e.usage.cacheRead / Math.max(1, e.usage.input + e.usage.cacheRead)) * 100)}% cached</div> : null}
                  </td>
                  <td className="num mono">{usd(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <div className="sb-empty">Nothing recorded yet.</div>}
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

const ApiKey = () => {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null);
  const act = useAction();
  const save = () =>
    act.run(async () => {
      await saveApiKey(value);
      setValue("");
      setStatus(await checkKey());
    });
  const test = () => act.run(async () => setStatus(await checkKey()));
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h2>Anthropic API key</h2>
      </div>
      <div className="sb-small sb-muted" style={{ marginBottom: 8 }}>
        Stored server-side and never readable back by any browser, this one included. The agents use it from Cloud Functions. Set a spend limit on the key in the
        Anthropic console as a second line of defense behind the budgets below.
      </div>
      <div className="sb-row">
        <input className="sb-input" style={{ flex: 1, minWidth: 220 }} type="password" autoComplete="off" placeholder="sk-ant-…" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="sb-btn" type="button" disabled={!value.trim() || act.busy} onClick={save}>
          Save key
        </button>
        <button className="sb-btn ghost" type="button" disabled={act.busy} onClick={test}>
          Test saved key
        </button>
      </div>
      {status && <div className={status.ok ? "sb-ok" : "sb-err"}>{status.message}</div>}
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const General = () => {
  const { settings } = useHQ();
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const act = useAction();
  useEffect(() => setS(settings), [settings]);
  if (!s) return null;
  const set = (patch) => {
    setS({ ...s, ...patch });
    setSaved(false);
  };
  const setBudget = (k, v) => set({ budgets: { ...s.budgets, [k]: num(v) } });
  const timeline = s.timeline || DEFAULT_TIMELINE;
  const save = () =>
    act.run(async () => {
      const { createdAt, updatedAt, id, ...rest } = s;
      await saveSettings(rest);
      setSaved(true);
    });
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h2>Business rules</h2>
      </div>
      <div className="sb-cols2">
        <Field label="Base location">
          <input className="sb-input" value={s.baseLocation || ""} onChange={(e) => set({ baseLocation: e.target.value })} />
        </Field>
        <Field label="Sourcing radius (miles)">
          <input className="sb-input" type="number" min="1" value={s.sourcingRadiusMiles ?? ""} onChange={(e) => set({ sourcingRadiusMiles: num(e.target.value) })} />
        </Field>
        <Field label="Yellow becomes red above ($)" hint="Any money-moving action above this needs a detailed review.">
          <input className="sb-input" type="number" min="0" value={s.thresholds?.yellowToRedUsd ?? ""} onChange={(e) => set({ thresholds: { ...s.thresholds, yellowToRedUsd: num(e.target.value) } })} />
        </Field>
        <Field label="Deadline warning window (days)">
          <input className="sb-input" type="number" min="1" value={s.warnDays ?? 7} onChange={(e) => set({ warnDays: num(e.target.value) })} />
        </Field>
        <Field label="AI spend cap per month ($)">
          <input className="sb-input" type="number" min="0" value={s.budgets?.aiMonthlyUsd ?? ""} onChange={(e) => setBudget("aiMonthlyUsd", e.target.value)} />
        </Field>
        <Field label="Operating spend cap per season ($)">
          <input className="sb-input" type="number" min="0" value={s.budgets?.operatingPerSeasonUsd ?? ""} onChange={(e) => setBudget("operatingPerSeasonUsd", e.target.value)} />
        </Field>
        <Field label="Default per-run cap ($)">
          <input className="sb-input" type="number" min="0" step="0.5" value={s.budgets?.defaultPerRunUsd ?? ""} onChange={(e) => setBudget("defaultPerRunUsd", e.target.value)} />
        </Field>
        <Field label="Default per-agent daily cap ($)">
          <input className="sb-input" type="number" min="0" step="0.5" value={s.budgets?.defaultPerDayUsd ?? ""} onChange={(e) => setBudget("defaultPerDayUsd", e.target.value)} />
        </Field>
      </div>
      <label className="sb-check">
        <input type="checkbox" checked={s.autoStartAgents !== false} onChange={(e) => set({ autoStartAgents: e.target.checked })} /> Start each stage's agents automatically when a season enters it
      </label>

      <div className="sb-label" style={{ marginTop: 12 }}>
        Timeline (weeks from ship date)
      </div>
      <div className="sb-cols3">
        {timeline.map((m, i) => (
          <Field key={m.key} label={m.label}>
            <input
              className="sb-input"
              type="number"
              value={m.weeks}
              onChange={(e) => set({ timeline: timeline.map((x, j) => (j === i ? { ...x, weeks: Number(e.target.value) } : x)) })}
            />
          </Field>
        ))}
      </div>
      <div className="sb-small sb-faint" style={{ marginBottom: 10 }}>
        Applies to seasons created after the change. Existing seasons keep their dates.
      </div>
      <div className="sb-row">
        <button className="sb-btn" type="button" disabled={act.busy} onClick={save}>
          Save settings
        </button>
        {saved && <span className="sb-small" style={{ color: "var(--green)" }}>Saved</span>}
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

const Catalog = () => {
  const { kits, tiers } = useHQ();
  const act = useAction();
  const baseKits = kits.filter((k) => !k.seasonId);
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h2>Kits and tiers</h2>
      </div>
      <div className="sb-label">Room kits</div>
      {baseKits.map((k) => (
        <div key={k.id} className="sb-list-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{k.name}</b> {k.phase ? <span className="sb-chip">phase {k.phase}</span> : null}
            <input className="sb-input" style={{ marginTop: 4 }} defaultValue={k.contents} onBlur={(e) => e.target.value !== k.contents && act.run(() => saveKit(k.id, { contents: e.target.value }))} />
          </div>
          <label className="sb-check" style={{ margin: 0 }}>
            <input type="checkbox" checked={!!k.active} onChange={(e) => act.run(() => saveKit(k.id, { active: e.target.checked }))} /> Active
          </label>
        </div>
      ))}
      <div className="sb-label" style={{ marginTop: 14 }}>
        Tiers and prices
      </div>
      <div className="sb-tablewrap">
        <table className="sb-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="num">Kits</th>
              <th>Per season ($)</th>
              <th>Annual prepay ($)</th>
            </tr>
          </thead>
          <tbody>
            {[...tiers].sort((a, b) => (a.kitSlots || 0) - (b.kitSlots || 0)).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="num">{t.kitSlots}</td>
                <td>
                  <input className="sb-input" type="number" min="0" placeholder="TBD" defaultValue={t.priceSeason ?? ""} onBlur={(e) => act.run(() => saveTier(t.id, { priceSeason: num(e.target.value) }))} />
                </td>
                <td>
                  <input className="sb-input" type="number" min="0" placeholder="TBD" defaultValue={t.priceAnnual ?? ""} onBlur={(e) => act.run(() => saveTier(t.id, { priceAnnual: num(e.target.value) }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sb-small sb-faint">Leave prices blank until the Analyst's cost model and maker quotes are in; the Box Curator proposes prices when none are set.</div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

const Integrations = () => {
  const { agents } = useHQ();
  const act = useAction();
  const [added, setAdded] = useState(null);
  const missing = DEFAULT_AGENTS.filter((a) => !agents.some((x) => x.id === a.id));
  const rows = [
    ["Claude API", "Connected through the key above", true],
    ["Gmail (business mailbox)", "Not connected. Approved emails land in “To do by hand”.", false],
    ["Stripe (billing, checkout, portal, tax)", "Not connected. Storefront and subscribers come with it.", false],
    ["Shippo or EasyPost", "Not connected. Label purchases are done by hand.", false],
    ["Marketing email service", "Not connected. Campaign sends are done by hand.", false],
    ["Browser service (Cloud Run)", "Not deployed. Agents read pages with web fetch instead.", false],
  ];
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h2>Integrations</h2>
      </div>
      {rows.map(([name, note, ok]) => (
        <div key={name} className="sb-list-item">
          <div>
            <b>{name}</b>
            <div className="sb-small sb-muted">{note}</div>
          </div>
          <span className={`sb-chip ${ok ? "green" : ""}`}>{ok ? "on" : "off"}</span>
        </div>
      ))}
      {missing.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button className="sb-btn ghost sm" type="button" disabled={act.busy} onClick={() => act.run(async () => setAdded(await addMissingAgents(agents.map((a) => a.id))))}>
            Add {missing.length} missing default agent{missing.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {added != null && <div className="sb-ok">Added {added}.</div>}
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

export function Settings() {
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Settings</h1>
          <div className="sb-sub">The key, the rules every agent is held to, and what is connected.</div>
        </div>
      </div>
      <ApiKey />
      <General />
      <Catalog />
      <Integrations />
    </div>
  );
}
