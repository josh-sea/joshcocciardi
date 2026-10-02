import React, { useMemo, useState } from "react";
import BriefView from "./BriefView";
import { ApprovalInbox } from "./Approvals";
import { RunNow } from "./Agents";
import { STAGES } from "./seed";
import { ago, lockDateFor, milestonesFor, parseDay, parseJson, seasonTimeline, stageInfo, suggestSeasonName, today, toMillis, usd } from "./pipeline";
import { createRun, createSeason, moveStage, updateSeason } from "./store";
import { BriefStatus, Field, Modal, RunStatus, briefLabel, useAction, useHQ } from "./ui";

// Seasons (spec 6, 8.1 item 2). The season is the core object: everything an
// agent produces hangs off one, and several run at once at different stages.

export const StageBar = ({ stage, complete }) => (
  <div className="sb-stages" aria-label={`Stage ${stage} of 11`}>
    {STAGES.map((s) => (
      <div key={s.n} className={`sb-stage ${complete || s.n < stage ? "done" : s.n === stage ? "cur" : ""}`} title={s.name} />
    ))}
  </div>
);

const MS_TEXT = { done: "done", "at-risk": "at risk", overdue: "overdue", upcoming: "" };

export const Timeline = ({ season }) => {
  const { settings } = useHQ();
  const rows = seasonTimeline(season, settings?.timeline, today(), settings?.warnDays ?? 7);
  return (
    <div>
      {rows.map((m) => (
        <div className="sb-ms" key={m.key}>
          <span>{m.label}</span>
          <span className={`st-${m.status}`}>
            {m.date}
            {m.status !== "done" && m.daysLeft != null ? ` · ${m.daysLeft >= 0 ? `${m.daysLeft}d` : `${-m.daysLeft}d late`}` : ""}
            {MS_TEXT[m.status] ? ` · ${MS_TEXT[m.status]}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
};

const NewSeason = ({ onClose }) => {
  const { settings, go } = useHQ();
  const [shipDate, setShipDate] = useState("");
  const [name, setName] = useState("");
  const [lockDate, setLockDate] = useState("");
  const [forecast, setForecast] = useState("");
  const act = useAction();
  const computedLock = shipDate ? lockDateFor(shipDate, settings?.timeline) : "";
  const create = () =>
    act.run(async () => {
      if (!parseDay(shipDate)) throw new Error("Pick a ship date.");
      const id = await createSeason({
        name: name.trim() || suggestSeasonName(shipDate),
        year: parseDay(shipDate).getUTCFullYear(),
        shipDate,
        lockDate: lockDate || computedLock,
        forecast: forecast ? { subscribers: Number(forecast), buffer: 0.15, safetyStock: 0.05 } : null,
        milestones: Object.fromEntries(milestonesFor(shipDate, settings?.timeline).map((m) => [m.key, m.date])),
      });
      onClose();
      go("season", { id });
    });
  return (
    <Modal title="New season" onClose={onClose}>
      <Field label="Ship date" hint="Every milestone is counted back from this.">
        <input className="sb-input" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
      </Field>
      <Field label="Name">
        <input className="sb-input" value={name} placeholder={suggestSeasonName(shipDate) || "Spring 2027"} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Lock date" hint={computedLock ? `Default ${computedLock} (ship minus 5 weeks).` : "Defaults to ship minus 5 weeks."}>
        <input className="sb-input" type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
      </Field>
      <Field label="Forecast subscribers" hint="Procurement sizes orders from this until the lock date freezes real counts.">
        <input className="sb-input" type="number" min="0" value={forecast} onChange={(e) => setForecast(e.target.value)} />
      </Field>
      {shipDate && (
        <div className="sb-small sb-muted" style={{ marginBottom: 10 }}>
          Trend Brief due {milestonesFor(shipDate, settings?.timeline)[0]?.date}. Creating the season moves it straight to Trend Research and starts the Trend Researcher
          {settings?.autoStartAgents === false ? " (autostart is off in Settings, so start it by hand)" : ""}.
        </div>
      )}
      <button className="sb-btn clay" type="button" disabled={act.busy} onClick={create}>
        Create season
      </button>
      {act.error && <div className="sb-err">{act.error}</div>}
    </Modal>
  );
};

export function SeasonsList() {
  const { seasons, settings, go } = useHQ();
  const [adding, setAdding] = useState(false);
  const sorted = [...seasons].sort((a, b) => String(a.shipDate).localeCompare(String(b.shipDate)));
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Seasons</h1>
          <div className="sb-sub">Each season moves through 11 stages, counted back from its ship date.</div>
        </div>
        <button className="sb-btn clay" type="button" onClick={() => setAdding(true)}>
          New season
        </button>
      </div>
      {!sorted.length && <div className="sb-empty">No seasons yet. Create one with its ship date to start the Trend Researcher.</div>}
      {sorted.map((s) => {
        const next = seasonTimeline(s, settings?.timeline, today(), settings?.warnDays ?? 7).find((m) => m.status !== "done");
        return (
          <div className="sb-card sb-clickable" key={s.id} onClick={() => go("season", { id: s.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("season", { id: s.id })}>
            <div className="sb-between">
              <h2 style={{ fontSize: 20 }}>{s.name}</h2>
              <span className="sb-small sb-muted">ships {s.shipDate}</span>
            </div>
            <div style={{ margin: "10px 0 6px" }}>
              <StageBar stage={Number(s.stage) || 1} complete={s.status === "complete"} />
            </div>
            <div className="sb-between sb-small">
              <span>
                <b>{s.status === "complete" ? "Complete" : `${s.stage}. ${stageInfo(s.stage).name}`}</b>
                {s.blocker && s.status !== "complete" ? <span className="sb-muted"> · {s.blocker}</span> : ""}
              </span>
              {next && (
                <span className={`st-${next.status}`} style={{ color: next.status === "overdue" ? "var(--red)" : next.status === "at-risk" ? "var(--yellow)" : "var(--soft)" }}>
                  Next: {next.label} {next.date}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {adding && <NewSeason onClose={() => setAdding(false)} />}
    </div>
  );
}

const FLAGS = [
  ["ordersPlaced", "Orders placed (outside the system)", 5],
  ["inventoryReceived", "Inventory received and checked", 9],
  ["allShipped", "All boxes shipped", 10],
];

export function SeasonPage({ id }) {
  const { seasonById, briefs, runs, proposals, agentById, counters, go } = useHQ();
  const season = seasonById[id];
  const [runFor, setRunFor] = useState(null);
  const act = useAction();
  const mine = useMemo(() => briefs.filter((b) => b.seasonId === id), [briefs, id]);
  if (!season) return <div className="sb-empty">Season not found.</div>;
  const stage = Number(season.stage) || 1;
  const pending = proposals.filter((p) => p.seasonId === id && p.status === "pending");
  const seasonRuns = runs.filter((r) => r.seasonId === id);
  const byType = {};
  for (const b of [...mine].sort((a, b2) => toMillis(b2.createdAt) - toMillis(a.createdAt))) (byType[b.type] = byType[b.type] || []).push(b);
  const owner = stageInfo(stage).owner;

  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <button className="sb-link" type="button" onClick={() => go("seasons")}>
            ← Seasons
          </button>
          <h1 style={{ marginTop: 6 }}>{season.name}</h1>
          <div className="sb-sub">
            Ships {season.shipDate} · locks {season.lockDate}
            {season.forecast?.subscribers ? ` · forecast ${season.forecast.subscribers} subscribers` : ""}
            {` · operating spend ${usd(counters[`season-${id}-operating`]?.amount || 0)}`}
          </div>
        </div>
      </div>

      <div className="sb-card">
        <div className="sb-between" style={{ marginBottom: 10 }}>
          <h2>{season.status === "complete" ? "Season complete" : `Stage ${stage}: ${stageInfo(stage).name}`}</h2>
          <div className="sb-row">
            <button className="sb-btn ghost sm" type="button" disabled={stage <= 1 || act.busy} onClick={() => act.run(() => moveStage(season, stage - 1))}>
              ← Back a stage
            </button>
            <button
              className="sb-btn ghost sm"
              type="button"
              disabled={stage >= 11 || act.busy}
              onClick={() => window.confirm(`Skip past "${stageInfo(stage).name}" without its exit criteria?`) && act.run(() => moveStage(season, stage + 1))}
            >
              Force forward →
            </button>
          </div>
        </div>
        {season.blocker && season.status !== "complete" && <div className="sb-banner" style={{ marginBottom: 10 }}>Waiting on: {season.blocker}</div>}
        <div className="sb-stagelist">
          {STAGES.map((s) => (
            <div key={s.n} className={`sb-stagecell ${season.status === "complete" || s.n < stage ? "done" : s.n === stage ? "cur" : ""}`}>
              <b>{s.n}</b>
              {s.name}
            </div>
          ))}
        </div>
        <div className="sb-row" style={{ marginTop: 12 }}>
          <label className="sb-check" title="When on, the season moves forward by itself as soon as a stage's exit criteria are met">
            <input type="checkbox" checked={!season.hold} onChange={(e) => act.run(() => updateSeason(id, { hold: !e.target.checked }))} /> Auto-advance
          </label>
          {FLAGS.map(([k, label, from]) => (
            <label className="sb-check" key={k} title={`Exit criterion for stage ${from}`}>
              <input type="checkbox" checked={!!season.flags?.[k]} onChange={(e) => act.run(() => updateSeason(id, { [`flags.${k}`]: e.target.checked }))} /> {label}
            </label>
          ))}
        </div>
        {owner && agentById[owner] && season.status !== "complete" && (
          <button className="sb-btn sm" type="button" onClick={() => setRunFor(agentById[owner])}>
            Run {agentById[owner].name} for this stage
          </button>
        )}
        {act.error && <div className="sb-err">{act.error}</div>}
      </div>

      <div className="sb-grid">
        <div>
          {pending.length > 0 && (
            <div className="sb-card">
              <div className="sb-cardhead">
                <h2>Waiting on you</h2>
              </div>
              <ApprovalInbox proposals={pending} />
            </div>
          )}
          <div className="sb-card">
            <div className="sb-cardhead">
              <h2>Briefs</h2>
            </div>
            {!mine.length && <div className="sb-empty">No briefs yet for this season.</div>}
            {Object.entries(byType).map(([type, list]) => (
              <div key={type} className="sb-list-item sb-clickable" onClick={() => go("brief", { id: list[0].id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("brief", { id: list[0].id })}>
                <div>
                  <b>{briefLabel(type)}</b> <span className="sb-small sb-muted">v{list[0].version} · {list[0].title}</span>
                  {list.length > 1 && <div className="sb-small sb-faint">{list.length} versions</div>}
                </div>
                <BriefStatus status={list[0].status} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="sb-card">
            <div className="sb-cardhead">
              <h3>Timeline</h3>
            </div>
            <Timeline season={season} />
          </div>
          <div className="sb-card">
            <div className="sb-cardhead">
              <h3>Agent runs</h3>
            </div>
            {seasonRuns.length ? (
              seasonRuns.slice(0, 12).map((r) => (
                <div key={r.id} className="sb-list-item sb-clickable" onClick={() => go("run", { id: r.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("run", { id: r.id })}>
                  <span className="sb-small">
                    {agentById[r.agentId]?.name || r.agentId} <span className="sb-faint">{ago(r.createdAt)}</span>
                  </span>
                  <RunStatus status={r.status} />
                </div>
              ))
            ) : (
              <div className="sb-small sb-faint">None yet.</div>
            )}
          </div>
        </div>
      </div>
      {runFor && (
        <Modal title={`Run ${runFor.name}`} onClose={() => setRunFor(null)}>
          <RunNow agent={runFor} defaultSeasonId={id} />
        </Modal>
      )}
    </div>
  );
}

/* One brief, its versions, and how it was decided. */
export function BriefPage({ id }) {
  const { briefById, briefs, agentById, seasonById, proposals, go } = useHQ();
  const brief = briefById[id];
  const [showOriginal, setShowOriginal] = useState(false);
  const act = useAction();
  const [feedback, setFeedback] = useState("");
  if (!brief) return <div className="sb-empty">Brief not found.</div>;
  const versions = briefs.filter((b) => b.type === brief.type && b.seasonId === brief.seasonId).sort((a, b) => (b.version || 0) - (a.version || 0));
  const proposal = proposals.find((p) => p.briefId === id);
  const content = parseJson(showOriginal && brief.originalContentJson ? brief.originalContentJson : brief.contentJson, {});
  const rerun = () =>
    act.run(async () => {
      const runId = await createRun({
        agentId: brief.agentId,
        seasonId: brief.seasonId || null,
        instructions: "Redo your brief, addressing Josh's feedback on the previous version.",
        feedback: { previousBriefId: id, comment: feedback || brief.decisionComment || "Try again." },
        trigger: { type: "rerun", by: "josh" },
      });
      go("run", { id: runId });
    });
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <button className="sb-link" type="button" onClick={() => (brief.seasonId ? go("season", { id: brief.seasonId }) : go("command"))}>
            ← {seasonById[brief.seasonId]?.name || "Command"}
          </button>
          <h1 style={{ marginTop: 6 }}>{brief.title}</h1>
          <div className="sb-sub">
            {briefLabel(brief.type)} v{brief.version} · {agentById[brief.agentId]?.name || brief.agentId} · {ago(brief.createdAt)}
          </div>
        </div>
        <div className="sb-row">
          <BriefStatus status={brief.status} />
          {brief.runId && (
            <button className="sb-btn ghost sm" type="button" onClick={() => go("run", { id: brief.runId })}>
              See the run
            </button>
          )}
        </div>
      </div>
      {proposal?.status === "pending" && (
        <div className="sb-card">
          <ApprovalInbox proposals={[proposal]} />
        </div>
      )}
      <div className="sb-card">
        <div className="sb-pre" style={{ marginBottom: 12 }}>
          {brief.summary}
        </div>
        {brief.decisionComment && <div className="sb-banner">Your note: {brief.decisionComment}</div>}
        {brief.originalContentJson && (
          <label className="sb-check">
            <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} /> Show the agent's original (you edited this brief before approving)
          </label>
        )}
        <BriefView type={brief.type} content={content} />
      </div>
      <div className="sb-cols2">
        <div className="sb-card">
          <div className="sb-cardhead">
            <h3>Rerun with notes</h3>
          </div>
          <textarea className="sb-input" rows={3} value={feedback} placeholder="What should change?" onChange={(e) => setFeedback(e.target.value)} />
          <button className="sb-btn sm" type="button" style={{ marginTop: 8 }} disabled={act.busy} onClick={rerun}>
            Rerun {agentById[brief.agentId]?.name || "agent"}
          </button>
          {act.error && <div className="sb-err">{act.error}</div>}
        </div>
        <div className="sb-card">
          <div className="sb-cardhead">
            <h3>Versions</h3>
          </div>
          {versions.map((v) => (
            <div key={v.id} className={`sb-list-item ${v.id === id ? "" : "sb-clickable"}`} onClick={() => v.id !== id && go("brief", { id: v.id })}>
              <span className="sb-small">
                v{v.version} · {ago(v.createdAt)}
              </span>
              <BriefStatus status={v.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
