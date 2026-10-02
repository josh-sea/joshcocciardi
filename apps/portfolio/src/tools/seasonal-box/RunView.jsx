import React, { useEffect, useState } from "react";
import { ago, toMillis, usd } from "./pipeline";
import { cancelRun, resumeRun, watchSteps } from "./store";
import { RunStatus, explain, useAction, useHQ } from "./ui";

// One run, step by step (spec 4.2, 8.1 item 4). Every step shows the model it
// ran on, what it said, every tool it called with the result it got back,
// tokens (with cache hits), and its cost. Steps arrive live as the runner
// writes them, so "Running" here always means a real step is in flight.

const Step = ({ s }) => (
  <div className="sb-step">
    <div className="sb-step-head">
      <span>
        <b style={{ color: "var(--ink)" }}>Step {s.n + 1}</b> · {s.model} · {s.stopReason}
      </span>
      <span className="mono">
        {usd(s.cost)} · in {s.usage?.input || 0}
        {s.usage?.cacheRead ? ` (+${s.usage.cacheRead} cached)` : ""} · out {s.usage?.output || 0}
        {s.usage?.webSearches ? ` · ${s.usage.webSearches} searches` : ""}
      </span>
    </div>
    {s.text && (
      <div className="sb-pre" style={{ marginTop: 6 }}>
        {s.text}
      </div>
    )}
    {(s.serverCalls || []).map((c, i) => (
      <div className="sb-call" key={`s${i}`}>
        <b>{c.name}</b> <span className="sb-faint">{c.input}</span>
      </div>
    ))}
    {(s.toolCalls || []).map((c) => {
      const res = (s.toolResults || []).find((r) => r.id === c.id);
      return (
        <div className={`sb-call ${res?.isError ? "err" : ""}`} key={c.id}>
          <b>{c.name}</b> <span className="sb-faint mono">{c.input}</span>
          {res && (
            <details style={{ marginTop: 4 }}>
              <summary className="sb-small sb-muted">{res.isError ? "Error" : "Result"}</summary>
              <div className="sb-pre mono" style={{ marginTop: 4 }}>
                {res.content}
              </div>
            </details>
          )}
        </div>
      );
    })}
  </div>
);

export default function RunView({ runId }) {
  const { runById, agentById, seasonById, briefById, go } = useHQ();
  const run = runById[runId];
  const [steps, setSteps] = useState([]);
  const [err, setErr] = useState(null);
  const act = useAction();

  useEffect(() => watchSteps(runId, setSteps, (e) => setErr(explain(e))), [runId]);

  if (!run) return <div className="sb-empty">Run not found (it may be older than the 100 most recent).</div>;
  const agent = agentById[run.agentId];
  const season = seasonById[run.seasonId];
  const live = run.status === "running" || run.status === "queued";
  const stale = run.status === "running" && run.claim?.until && run.claim.until < Date.now();
  const duration = run.endedAt && run.startedAt ? Math.round((toMillis(run.endedAt) - toMillis(run.startedAt)) / 1000) : null;

  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <button className="sb-link" type="button" onClick={() => go("agent", { id: run.agentId })}>
            ← {agent?.name || run.agentId}
          </button>
          <h1 style={{ marginTop: 6 }}>Run {runId.slice(0, 6)}</h1>
          <div className="sb-sub">
            {season ? `${season.name} · ` : ""}
            {run.trigger?.type || "manual"} · started {ago(run.createdAt)}
            {duration != null ? ` · ${duration}s` : ""}
          </div>
        </div>
        <div className="sb-row">
          <RunStatus status={run.status} />
          <span className="sb-chip pine mono">{usd(run.cost)}</span>
          {live && (
            <button className="sb-btn danger sm" type="button" disabled={act.busy} onClick={() => act.run(() => cancelRun(runId))}>
              Cancel
            </button>
          )}
          {(run.status === "failed" || stale) && (
            <button className="sb-btn sm" type="button" disabled={act.busy} onClick={() => act.run(() => resumeRun(runId))}>
              Resume from step {(run.tick || 0) + 1}
            </button>
          )}
        </div>
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
      {err && <div className="sb-err">{err}</div>}
      {run.error && <div className="sb-err">{run.error}</div>}
      {run.pauseReason && run.status === "budget_paused" && (
        <div className="sb-banner">{run.pauseReason} A red approval to continue is in your inbox.</div>
      )}
      {stale && <div className="sb-banner">The current step has not checked in for a while (the function may have timed out). Resume picks it up again.</div>}

      <div className="sb-grid">
        <div>
          {steps.map((s) => (
            <Step key={s.id} s={s} />
          ))}
          {live && (
            <div className="sb-card tight sb-row">
              <span className="sb-dot live" /> {run.status === "queued" ? "Waiting for a worker…" : `Working on step ${(run.tick || 0) + 1}…`}
            </div>
          )}
          {!steps.length && !live && <div className="sb-empty">No steps recorded.</div>}
        </div>
        <div>
          <div className="sb-card">
            <div className="sb-label">Task</div>
            <div className="sb-pre">{run.instructions || "Standard job."}</div>
            {run.feedback && (
              <>
                <div className="sb-label" style={{ marginTop: 10 }}>
                  Feedback it was given
                </div>
                <div className="sb-pre">{run.feedback.comment}</div>
              </>
            )}
            {run.outputBriefId && (
              <button className="sb-btn sm" type="button" style={{ marginTop: 12 }} onClick={() => go("brief", { id: run.outputBriefId })}>
                Open {briefById[run.outputBriefId]?.title ? "the brief" : "brief"}
              </button>
            )}
          </div>
          <div className="sb-card">
            <div className="sb-label">Taste notes this run read ({(run.notesUsed || []).length})</div>
            {(run.notesUsed || []).length ? (
              <ul className="sb-small" style={{ margin: 0, paddingLeft: 18 }}>
                {run.notesUsed.map((n) => (
                  <li key={n.id}>
                    <span className="sb-faint">[{n.scope}]</span> {n.text}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sb-small sb-faint">None applied.</div>
            )}
          </div>
          {(run.notes || []).length > 0 && (
            <div className="sb-card">
              <div className="sb-label">Agent's working notes</div>
              <ul className="sb-small" style={{ margin: 0, paddingLeft: 18 }}>
                {run.notes.map((n, i) => (
                  <li key={i}>{n.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
