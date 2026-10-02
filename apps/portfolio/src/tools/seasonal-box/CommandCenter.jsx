import React from "react";
import BriefView from "./BriefView";
import { ApprovalInbox, ManualQueue } from "./Approvals";
import { StageBar } from "./Seasons";
import { ago, monthKey, nextMilestone, parseJson, stageInfo, today, toMillis, usd } from "./pipeline";
import { createRun } from "./store";
import { Meter, RunStatus, useAction, useHQ } from "./ui";

// Command Center (spec 8.1 item 1): what's waiting on Josh, the Daily
// Briefing, where every season stands, spend against budget, and which
// agents are working right now.

const Briefing = () => {
  const { briefs, runs, agentById, go } = useHQ();
  const act = useAction();
  const latest = briefs.filter((b) => b.type === "dailyBriefing").sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))[0];
  const running = runs.find((r) => r.agentId === "orchestrator" && (r.status === "running" || r.status === "queued"));
  const orch = agentById.orchestrator;
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <div>
          <h2>Daily Briefing</h2>
          {latest && <div className="sb-small sb-faint">{ago(latest.createdAt)}</div>}
        </div>
        {running ? (
          <button className="sb-link" type="button" onClick={() => go("run", { id: running.id })}>
            <RunStatus status={running.status} />
          </button>
        ) : (
          orch && (
            <button className="sb-btn ghost sm" type="button" disabled={act.busy} onClick={() => act.run(() => createRun({ agentId: "orchestrator", instructions: "Write the Daily Briefing." }))}>
              Refresh
            </button>
          )
        )}
      </div>
      {latest ? <BriefView type="dailyBriefing" content={parseJson(latest.contentJson, {})} /> : <div className="sb-small sb-faint">No briefing yet. The Orchestrator writes one each day when you open HQ.</div>}
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

const Spend = () => {
  const { settings, counters, seasons } = useHQ();
  const month = counters[`ai-month-${monthKey()}`]?.amount || 0;
  const cap = Number(settings?.budgets?.aiMonthlyUsd) || 0;
  const opCap = Number(settings?.budgets?.operatingPerSeasonUsd) || 0;
  const live = seasons.filter((s) => s.status !== "complete" && s.status !== "archived");
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h3>Spend</h3>
      </div>
      <div className="sb-between">
        <span className="sb-small sb-muted">AI this month</span>
        <span className="sb-small mono">
          {usd(month)} / {usd(cap, { cents: false })}
        </span>
      </div>
      <Meter value={month} max={cap} />
      {live.map((s) => {
        const op = counters[`season-${s.id}-operating`]?.amount || 0;
        return (
          <div key={s.id} style={{ marginTop: 12 }}>
            <div className="sb-between">
              <span className="sb-small sb-muted">{s.name} operating</span>
              <span className="sb-small mono">
                {usd(op)} / {usd(opCap, { cents: false })}
              </span>
            </div>
            <Meter value={op} max={opCap} />
          </div>
        );
      })}
    </div>
  );
};

const Activity = () => {
  const { runs, agentById, seasonById, go } = useHQ();
  const active = runs.filter((r) => ["running", "queued", "budget_paused"].includes(r.status));
  const recent = runs.filter((r) => !active.includes(r)).slice(0, 5);
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h3>Agent activity</h3>
        <span className="sb-small sb-faint">{active.length ? `${active.length} live` : "all quiet"}</span>
      </div>
      {[...active, ...recent].map((r) => (
        <div key={r.id} className="sb-list-item sb-clickable" onClick={() => go("run", { id: r.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("run", { id: r.id })}>
          <div style={{ minWidth: 0 }}>
            <div className="sb-small">
              <b>{agentById[r.agentId]?.name || r.agentId}</b> <span className="sb-faint">{seasonById[r.seasonId]?.name || ""}</span>
            </div>
            <div className="sb-small sb-faint">
              {r.status === "running" ? `step ${(r.tick || 0) + 1}` : ago(r.endedAt || r.createdAt)} · {usd(r.cost)}
            </div>
          </div>
          <RunStatus status={r.status} />
        </div>
      ))}
      {!runs.length && <div className="sb-small sb-faint">No runs yet.</div>}
    </div>
  );
};

const Seasons = () => {
  const { seasons, settings, go } = useHQ();
  const live = seasons.filter((s) => s.status !== "complete" && s.status !== "archived").sort((a, b) => String(a.shipDate).localeCompare(String(b.shipDate)));
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h3>Seasons</h3>
        <button className="sb-link" type="button" onClick={() => go("seasons")}>
          All seasons
        </button>
      </div>
      {!live.length && (
        <div className="sb-small sb-faint">
          No active seasons.{" "}
          <button className="sb-link" type="button" onClick={() => go("seasons")}>
            Create one
          </button>
        </div>
      )}
      {live.map((s) => {
        const next = nextMilestone(s, settings?.timeline, today(), settings?.warnDays ?? 7);
        return (
          <div key={s.id} className="sb-clickable" style={{ padding: "8px 0" }} onClick={() => go("season", { id: s.id })} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go("season", { id: s.id })}>
            <div className="sb-between sb-small">
              <b>{s.name}</b>
              <span className="sb-muted">
                {s.stage}. {stageInfo(s.stage).name}
              </span>
            </div>
            <div style={{ margin: "6px 0" }}>
              <StageBar stage={Number(s.stage) || 1} />
            </div>
            {next && (
              <div className="sb-small" style={{ color: next.status === "overdue" ? "var(--red)" : next.status === "at-risk" ? "var(--yellow)" : "var(--soft)" }}>
                {next.label}: {next.date} ({next.daysLeft >= 0 ? `${next.daysLeft} days` : `${-next.daysLeft} days late`})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function CommandCenter() {
  const { proposals, keyState, go } = useHQ();
  const pending = proposals.filter((p) => p.status === "pending");
  return (
    <div>
      {keyState === false && (
        <div className="sb-banner">
          <span>No Anthropic API key is saved, so agents can't run yet.</span>
          <button className="sb-btn sm" type="button" onClick={() => go("settings")}>
            Add it in Settings
          </button>
        </div>
      )}
      <div className="sb-grid">
        <div>
          <div className="sb-card">
            <div className="sb-cardhead">
              <h2>Waiting on you</h2>
              <span className="sb-small sb-faint">
                {pending.filter((p) => p.level === "red").length} red · {pending.filter((p) => p.level === "yellow").length} yellow
              </span>
            </div>
            <ApprovalInbox proposals={pending} />
          </div>
          <ManualQueue proposals={proposals} />
        </div>
        <div>
          <Briefing />
          <Seasons />
          <Spend />
          <Activity />
        </div>
      </div>
    </div>
  );
}
