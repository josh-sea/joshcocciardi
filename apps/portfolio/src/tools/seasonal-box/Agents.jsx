import React, { useMemo, useState } from "react";
import { ACTIONS, BRIEF_LABELS, ORGS, READ_SCOPES, TIER_LABELS, TOOL_NAMES } from "./seed";
import { ago, usd } from "./pipeline";
import { createRun, resetAgent, saveAgent } from "./store";
import { Field, RunStatus, useAction, useHQ } from "./ui";

// Orgs and agents (spec 8.1 items 3 and 4). The list groups agents by org with
// today's spend and recent output; an agent's page holds its config editor,
// Run now, run history, and the taste notes written for it.

const todaySpend = (counters, agentId) => counters[`agent-${agentId}-day-${new Date().toISOString().slice(0, 10)}`]?.amount || 0;

export function AgentsList() {
  const { agents, runs, counters, notes, go } = useHQ();
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Agents</h1>
          <div className="sb-sub">Ten agents in six orgs, each running on briefs and approvals.</div>
        </div>
      </div>
      {ORGS.map((org) => {
        const members = agents.filter((a) => a.org === org.id);
        if (!members.length) return null;
        const orgNotes = notes.filter((n) => n.scope === "org" && n.scopeId === org.id).length;
        return (
          <div className="sb-card" key={org.id}>
            <div className="sb-cardhead">
              <div>
                <h2>{org.name}</h2>
                <div className="sb-small sb-muted">{org.blurb}</div>
              </div>
              <span className="sb-small sb-faint">
                {orgNotes} org note{orgNotes === 1 ? "" : "s"} · {usd(members.reduce((s, a) => s + todaySpend(counters, a.id), 0))} today
              </span>
            </div>
            {members.map((a) => {
              const mine = runs.filter((r) => r.agentId === a.id);
              const active = mine.find((r) => r.status === "running" || r.status === "queued");
              const last = mine[0];
              return (
                <div key={a.id} className="sb-list-item sb-clickable" onClick={() => go("agent", { id: a.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("agent", { id: a.id })}>
                  <div style={{ minWidth: 0 }}>
                    <div className="sb-row">
                      <b>{a.name}</b>
                      {a.enabled === false && <span className="sb-chip">off</span>}
                      <span className="sb-chip">{TIER_LABELS[a.modelTier] || a.modelTier}</span>
                    </div>
                    <div className="sb-small sb-muted">{a.description}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {active ? <RunStatus status={active.status} /> : last ? <span className="sb-small sb-faint">last run {ago(last.createdAt)}</span> : <span className="sb-small sb-faint">never run</span>}
                    <div className="sb-small sb-faint mono">{usd(todaySpend(counters, a.id))} today</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* Run now, with a season and optional instructions. */
export const RunNow = ({ agent, defaultSeasonId }) => {
  const { seasons, go } = useHQ();
  const [seasonId, setSeasonId] = useState(defaultSeasonId || seasons.find((s) => s.status === "active")?.id || "");
  const [instructions, setInstructions] = useState("");
  const act = useAction();
  const start = () =>
    act.run(async () => {
      const id = await createRun({ agentId: agent.id, seasonId: seasonId || null, instructions });
      go("run", { id });
    });
  return (
    <div>
      <Field label="Season">
        <select className="sb-input" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">No season</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Instructions (optional)">
        <textarea className="sb-input" rows={3} value={instructions} placeholder="Anything specific for this run" onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <button className="sb-btn clay" type="button" disabled={act.busy || agent.enabled === false} onClick={start}>
        Run {agent.name} now
      </button>
      {agent.enabled === false && <div className="sb-small sb-faint" style={{ marginTop: 6 }}>Turn the agent on to run it.</div>}
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const Config = ({ agent }) => {
  const [draft, setDraft] = useState(agent);
  const [saved, setSaved] = useState(false);
  const act = useAction();
  const set = (patch) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(agent);
  const save = () =>
    act.run(async () => {
      const { id, createdAt, updatedAt, ...rest } = draft;
      await saveAgent(agent.id, rest);
      setSaved(true);
    });
  const proposable = Object.entries(ACTIONS).filter(([k]) => !["brief.approve", "budget.continue"].includes(k));

  return (
    <div>
      <div className="sb-cols2">
        <Field label="Name">
          <input className="sb-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="sb-input" value={draft.enabled === false ? "off" : "on"} onChange={(e) => set({ enabled: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Model tier" hint="Fable is reserved and not selectable in the MVP.">
          <select className="sb-input" value={draft.modelTier} onChange={(e) => set({ modelTier: e.target.value })}>
            {Object.entries(TIER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effort" hint="Ignored on Haiku. Heavy runs default to high.">
          <select className="sb-input" value={draft.effort || ""} onChange={(e) => set({ effort: e.target.value || null })}>
            <option value="">Default</option>
            {["low", "medium", "high", "xhigh"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Per-run cap ($)">
          <input className="sb-input" type="number" min="0" step="0.5" value={draft.budgets?.perRunUsd ?? ""} onChange={(e) => set({ budgets: { ...draft.budgets, perRunUsd: Number(e.target.value) } })} />
        </Field>
        <Field label="Per-day cap ($)">
          <input className="sb-input" type="number" min="0" step="0.5" value={draft.budgets?.perDayUsd ?? ""} onChange={(e) => set({ budgets: { ...draft.budgets, perDayUsd: Number(e.target.value) } })} />
        </Field>
        <Field label="Max steps per run">
          <input className="sb-input" type="number" min="2" max="80" value={draft.maxSteps ?? 24} onChange={(e) => set({ maxSteps: Number(e.target.value) })} />
        </Field>
        <Field label="Output brief approval">
          <select className="sb-input" value={draft.briefLevel || "yellow"} onChange={(e) => set({ briefLevel: e.target.value })}>
            <option value="green">Green · accept automatically</option>
            <option value="yellow">Yellow · one-tap approval</option>
            <option value="red">Red · detailed review</option>
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input className="sb-input" value={draft.description || ""} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <div className="sb-label">Tools</div>
      <div style={{ marginBottom: 10 }}>
        {TOOL_NAMES.map((t) => (
          <label className="sb-check" key={t}>
            <input type="checkbox" checked={(draft.tools || []).includes(t)} onChange={() => set({ tools: toggle(draft.tools || [], t) })} /> <code>{t}</code>
          </label>
        ))}
      </div>

      <div className="sb-label">Database read access</div>
      <div style={{ marginBottom: 10 }}>
        {READ_SCOPES.map((t) => (
          <label className="sb-check" key={t}>
            <input type="checkbox" checked={(draft.readScopes || []).includes(t)} onChange={() => set({ readScopes: toggle(draft.readScopes || [], t) })} /> {t}
          </label>
        ))}
      </div>

      <div className="sb-label">Briefs it works from</div>
      <div style={{ marginBottom: 10 }}>
        {Object.entries(BRIEF_LABELS).map(([k, v]) => (
          <label className="sb-check" key={k}>
            <input type="checkbox" checked={(draft.inputBriefTypes || []).includes(k)} onChange={() => set({ inputBriefTypes: toggle(draft.inputBriefTypes || [], k) })} /> {v}
          </label>
        ))}
      </div>

      <div className="sb-label">Actions it may propose, and their approval level</div>
      <div className="sb-small sb-faint" style={{ marginBottom: 6 }}>
        The autonomy dial. Actions that spend money can never be green, and purchase orders and refunds are always red, whatever is set here.
      </div>
      <div className="sb-tablewrap" style={{ marginBottom: 12 }}>
        <table className="sb-table">
          <tbody>
            {proposable.map(([k, def]) => {
              const allowed = (draft.actionTypes || []).includes(k);
              return (
                <tr key={k}>
                  <td>
                    <label className="sb-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={allowed} onChange={() => set({ actionTypes: toggle(draft.actionTypes || [], k) })} /> {def.label}
                    </label>
                  </td>
                  <td style={{ width: 170 }}>
                    <select
                      className="sb-input"
                      disabled={!allowed || def.alwaysRed}
                      value={def.alwaysRed ? "red" : draft.autonomy?.[k] || def.level}
                      onChange={(e) => set({ autonomy: { ...draft.autonomy, [k]: e.target.value } })}
                    >
                      {!def.money && <option value="green">Green</option>}
                      <option value="yellow">Yellow</option>
                      <option value="red">Red</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Field label="System prompt">
        <textarea className="sb-input" rows={14} value={draft.systemPrompt || ""} onChange={(e) => set({ systemPrompt: e.target.value })} />
      </Field>
      <Field label="Brief schema" hint="What the agent passes to submit_brief. Views for known brief types read these field names.">
        <textarea className="sb-input sb-code" rows={12} value={draft.outputSchema || ""} onChange={(e) => set({ outputSchema: e.target.value })} />
      </Field>

      <div className="sb-row">
        <button className="sb-btn" type="button" disabled={!dirty || act.busy} onClick={save}>
          Save changes
        </button>
        <button className="sb-btn ghost" type="button" disabled={!dirty} onClick={() => setDraft(agent)}>
          Discard
        </button>
        <button
          className="sb-link"
          type="button"
          onClick={() => {
            if (window.confirm(`Reset ${agent.name} to its shipped definition? Your edits to its config will be lost.`)) act.run(() => resetAgent(agent.id));
          }}
        >
          Reset to default
        </button>
        {saved && !dirty && <span className="sb-small" style={{ color: "var(--green)" }}>Saved</span>}
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

export function AgentPage({ id }) {
  const { agentById, runs, notes, seasonById, go } = useHQ();
  const agent = agentById[id];
  const [tab, setTab] = useState("runs");
  const mine = useMemo(() => runs.filter((r) => r.agentId === id), [runs, id]);
  if (!agent) return <div className="sb-empty">No agent with id "{id}".</div>;
  const myNotes = notes.filter((n) => n.scope === "agent" && n.scopeId === id);
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <button className="sb-link" type="button" onClick={() => go("agents")}>
            ← Agents
          </button>
          <h1 style={{ marginTop: 6 }}>{agent.name}</h1>
          <div className="sb-sub">{agent.description}</div>
        </div>
        <div className="sb-row">
          <span className="sb-chip">{TIER_LABELS[agent.modelTier]}</span>
          <span className="sb-chip">{BRIEF_LABELS[agent.briefType] || agent.briefType}</span>
        </div>
      </div>
      <div className="sb-grid">
        <div>
          <div className="sb-card">
            <div className="sb-nav" style={{ marginTop: 0, marginBottom: 12, borderBottom: "1px solid var(--line2)" }}>
              {[
                ["runs", `Runs (${mine.length})`],
                ["config", "Config"],
              ].map(([k, v]) => (
                <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {v}
                </button>
              ))}
            </div>
            {tab === "config" ? (
              <Config key={agent.updatedAt?.toMillis?.() || agent.id} agent={agent} />
            ) : mine.length ? (
              mine.map((r) => (
                <div key={r.id} className="sb-list-item sb-clickable" onClick={() => go("run", { id: r.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("run", { id: r.id })}>
                  <div style={{ minWidth: 0 }}>
                    <div className="sb-row">
                      <RunStatus status={r.status} />
                      <span className="sb-small">{seasonById[r.seasonId]?.name || "No season"}</span>
                      <span className="sb-small sb-faint">{r.trigger?.type}</span>
                    </div>
                    <div className="sb-small sb-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.error || r.instructions || "Standard job"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }} className="sb-small">
                    <div className="mono">{usd(r.cost)}</div>
                    <div className="sb-faint">
                      {r.steps || 0} steps · {ago(r.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sb-empty">No runs yet.</div>
            )}
          </div>
        </div>
        <div>
          <div className="sb-card">
            <div className="sb-cardhead">
              <h3>Run now</h3>
            </div>
            <RunNow agent={agent} />
          </div>
          <div className="sb-card">
            <div className="sb-cardhead">
              <h3>Taste notes for {agent.name}</h3>
              <button className="sb-link" type="button" onClick={() => go("notes")}>
                All notes
              </button>
            </div>
            {myNotes.length ? (
              <ul className="sb-small" style={{ margin: 0, paddingLeft: 18 }}>
                {myNotes.map((n) => (
                  <li key={n.id}>
                    {n.pinned ? "📌 " : ""}
                    {n.text}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sb-small sb-faint">None yet. Comments on approvals become notes here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
