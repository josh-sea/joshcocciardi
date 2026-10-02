import React, { useMemo, useState } from "react";
import BriefView, { SELECTABLE } from "./BriefView";
import { ACTIONS, ORGS } from "./seed";
import { ago, parseJson, sortInbox, usd } from "./pipeline";
import { addNote, createRun, decide, markManualDone } from "./store";
import { LevelChip, briefLabel, useAction, useHQ } from "./ui";

// The approval inbox (spec 7). One card per pending proposal: what the agent
// wants, at what level, with the full brief or drafted action inline, and
// Approve / Edit / Reject plus a comment. Yellow items can be approved in a
// batch. Any decision that carries a comment, an edit, or a rejection offers
// to save a one-line taste note, which every later run of that agent reads.

const pretty = (json) => {
  const v = parseJson(json, null);
  return v === null ? json || "" : JSON.stringify(v, null, 2);
};

/* Editable view of an action payload: string fields as text areas (an email
   body edits like an email), everything else as JSON. */
const PayloadEditor = ({ value, onChange }) => {
  const obj = parseJson(value, null);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return <textarea className="sb-input sb-code" rows={10} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const set = (k, v) => onChange(JSON.stringify({ ...obj, [k]: v }));
  return (
    <div>
      {Object.entries(obj).map(([k, v]) => (
        <label className="sb-field" key={k}>
          <span>{k}</span>
          {typeof v === "string" ? (
            <textarea className="sb-input" rows={k === "body" ? 9 : Math.min(4, Math.ceil(v.length / 70) || 1)} value={v} onChange={(e) => set(k, e.target.value)} />
          ) : (
            <textarea
              className="sb-input sb-code"
              rows={4}
              defaultValue={JSON.stringify(v, null, 2)}
              onBlur={(e) => {
                const parsed = parseJson(e.target.value, undefined);
                if (parsed !== undefined) set(k, parsed);
              }}
            />
          )}
        </label>
      ))}
    </div>
  );
};

const PayloadView = ({ json }) => {
  const obj = parseJson(json, null);
  if (!obj || typeof obj !== "object") return <pre className="sb-pre mono">{json}</pre>;
  return (
    <div className="sb-kv">
      {Object.entries(obj).map(([k, v]) => (
        <React.Fragment key={k}>
          <div>{k}</div>
          <div className="sb-pre">{typeof v === "string" ? v : JSON.stringify(v, null, 2)}</div>
        </React.Fragment>
      ))}
    </div>
  );
};

/* Offered after a decision with something to learn from. */
export const TastePrompt = ({ proposal, initial, onDone }) => {
  const { agentById } = useHQ();
  const agent = agentById[proposal.agentId];
  const [text, setText] = useState(initial || "");
  const [scope, setScope] = useState("agent");
  const act = useAction();
  const scopeId = scope === "agent" ? proposal.agentId : scope === "org" ? agent?.org : scope === "season" ? proposal.seasonId : null;
  const save = () =>
    act.run(async () => {
      await addNote({ scope, scopeId, text, source: { proposalId: proposal.id, runId: proposal.runId } });
      onDone();
    });
  return (
    <div className="sb-card tight" style={{ background: "var(--honey-soft)", borderColor: "#EBD79F" }}>
      <div className="sb-small sb-muted">Decided: {proposal.title}</div>
      <div className="sb-small" style={{ fontWeight: 600, margin: "4px 0 6px" }}>
        Teach the team? One line on why, and {agent?.name || "the agent"} will read it on every future run.
      </div>
      <input className="sb-input" value={text} placeholder="e.g. Avoid pumpkin spice; it reads dated for our customer." onChange={(e) => setText(e.target.value)} />
      <div className="sb-row" style={{ marginTop: 8 }}>
        <select className="sb-input" style={{ width: "auto" }} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="agent">This agent</option>
          {agent?.org && <option value="org">{ORGS.find((o) => o.id === agent.org)?.name || agent.org} org</option>}
          {proposal.seasonId && <option value="season">This season</option>}
          <option value="global">Everyone</option>
        </select>
        <button className="sb-btn sm" type="button" disabled={!text.trim() || act.busy} onClick={save}>
          Save note
        </button>
        <button className="sb-link" type="button" onClick={onDone}>
          Skip
        </button>
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
};

export function ApprovalCard({ proposal, selectable, selected, onSelect, defaultOpen, onDecided }) {
  const { agentById, seasonById, briefById } = useHQ();
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [selection, setSelection] = useState(null);
  const [draft, setDraft] = useState(null);
  const act = useAction();
  // The card unmounts once the proposal leaves the pending list, so the taste
  // note prompt is handed up to whoever renders the inbox.
  const setLearn = (initial) => onDecided && onDecided(proposal, initial);

  const agent = agentById[proposal.agentId];
  const season = seasonById[proposal.seasonId];
  const brief = proposal.briefId ? briefById[proposal.briefId] : null;
  const isBrief = proposal.actionType === "brief.approve";
  const def = ACTIONS[proposal.actionType] || {};
  const source = isBrief ? brief?.contentJson : proposal.payloadJson;
  const draftValue = draft ?? (isBrief ? pretty(source) : source || "{}");

  const submit = (status) =>
    act.run(async () => {
      const edited = editing && draftValue !== (isBrief ? pretty(source) : source);
      if (edited && parseJson(draftValue, undefined) === undefined) throw new Error("The edit isn't valid JSON yet.");
      await decide(proposal, {
        status,
        comment,
        selection: selection && selection.length ? selection : null,
        editedContentJson: isBrief && edited ? JSON.stringify(parseJson(draftValue)) : null,
        editedPayloadJson: !isBrief && edited ? draftValue : null,
      });
      if (comment.trim() || edited || status === "rejected") setLearn(comment.trim());
    });

  // Reject a brief and immediately rerun its agent with the comment as notes.
  const rejectAndRerun = () =>
    act.run(async () => {
      await decide(proposal, { status: "rejected", comment });
      await createRun({
        agentId: proposal.agentId,
        seasonId: proposal.seasonId || null,
        instructions: "Redo your brief, addressing Josh's feedback on the previous version.",
        feedback: { previousBriefId: proposal.briefId || null, comment: comment || "Rejected without a comment." },
        trigger: { type: "rerun", by: "josh", previousProposalId: proposal.id },
      });
      setLearn(comment.trim());
    });

  return (
    <div className={`sb-card sb-appr ${proposal.level}`}>
      <div className="sb-between" style={{ alignItems: "flex-start" }}>
        <div className="sb-row" style={{ alignItems: "flex-start", flexWrap: "nowrap", minWidth: 0 }}>
          {selectable && (
            <input type="checkbox" aria-label="Select for batch approval" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} style={{ marginTop: 4 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="sb-appr-title">{proposal.title}</div>
            <div className="sb-appr-meta">
              <span>{agent?.name || proposal.agentId}</span>
              {season && <span>{season.name}</span>}
              <span>{isBrief ? briefLabel(proposal.briefType) : def.label || proposal.actionType}</span>
              {proposal.amountUsd > 0 && <span>{usd(proposal.amountUsd)}</span>}
              {proposal.deadline && <span>due {String(proposal.deadline).slice(0, 10)}</span>}
              <span>{ago(proposal.createdAt)}</span>
            </div>
          </div>
        </div>
        <LevelChip level={proposal.level} />
      </div>

      <div className="sb-pre" style={{ marginTop: 8 }}>
        {proposal.summary}
      </div>

      <button className="sb-link" type="button" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>
        {open ? "Hide details" : isBrief ? "Open the brief" : "Show the full action"}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {editing ? (
            isBrief ? (
              <textarea className="sb-input sb-code" rows={18} value={draftValue} onChange={(e) => setDraft(e.target.value)} />
            ) : (
              <PayloadEditor value={draftValue} onChange={setDraft} />
            )
          ) : isBrief ? (
            brief ? (
              <BriefView
                type={brief.type}
                content={parseJson(brief.contentJson, {})}
                selection={selection || undefined}
                onSelect={SELECTABLE.has(brief.type) ? setSelection : undefined}
              />
            ) : (
              <div className="sb-faint">Loading brief…</div>
            )
          ) : (
            <PayloadView json={proposal.payloadJson} />
          )}
        </div>
      )}

      <input
        className="sb-input"
        style={{ marginTop: 10 }}
        placeholder={proposal.level === "red" ? "Comment (recommended for red items)" : "Comment (optional)"}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="sb-appr-actions">
        <button className="sb-btn" type="button" disabled={act.busy} onClick={() => submit("approved")}>
          {editing ? "Approve with edits" : "Approve"}
        </button>
        <button
          className="sb-btn ghost"
          type="button"
          disabled={act.busy}
          onClick={() => {
            setEditing(!editing);
            setOpen(true);
          }}
        >
          {editing ? "Stop editing" : "Edit"}
        </button>
        <button className="sb-btn danger" type="button" disabled={act.busy} onClick={() => submit("rejected")}>
          Reject
        </button>
        {isBrief && (
          <button className="sb-link" type="button" disabled={act.busy} onClick={rejectAndRerun} title="Reject, then rerun the agent with your comment as feedback">
            Reject and rerun with my notes
          </button>
        )}
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </div>
  );
}

export function ApprovalInbox({ proposals, empty = "Nothing is waiting on you." }) {
  const sorted = useMemo(() => sortInbox(proposals), [proposals]);
  const [picked, setPicked] = useState(() => new Set());
  const [learning, setLearning] = useState([]);
  const act = useAction();
  const onDecided = (proposal, initial) => setLearning((cur) => [...cur.filter((l) => l.proposal.id !== proposal.id), { proposal, initial }]);
  const prompts = learning.map((l) => (
    <TastePrompt key={l.proposal.id} proposal={l.proposal} initial={l.initial} onDone={() => setLearning((cur) => cur.filter((x) => x.proposal.id !== l.proposal.id))} />
  ));
  const yellow = sorted.filter((p) => p.level === "yellow");
  const pickedYellow = yellow.filter((p) => picked.has(p.id));

  const batch = () =>
    act.run(async () => {
      for (const p of pickedYellow) await decide(p, { status: "approved", comment: "Batch approved." });
      setPicked(new Set());
    });

  if (!sorted.length) {
    return (
      <div>
        {prompts}
        <div className="sb-empty">{empty}</div>
      </div>
    );
  }
  return (
    <div>
      {prompts}
      {yellow.length > 1 && (
        <div className="sb-between sb-small" style={{ marginBottom: 8 }}>
          <label className="sb-check" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={pickedYellow.length === yellow.length}
              onChange={(e) => setPicked(new Set(e.target.checked ? yellow.map((p) => p.id) : []))}
            />
            Select all yellow ({yellow.length})
          </label>
          <button className="sb-btn sm" type="button" disabled={!pickedYellow.length || act.busy} onClick={batch}>
            Approve {pickedYellow.length || ""} selected
          </button>
        </div>
      )}
      {act.error && <div className="sb-err">{act.error}</div>}
      {sorted.map((p) => (
        <ApprovalCard
          key={p.id}
          proposal={p}
          onDecided={onDecided}
          selectable={p.level === "yellow" && yellow.length > 1}
          selected={picked.has(p.id)}
          onSelect={(on) => {
            const next = new Set(picked);
            on ? next.add(p.id) : next.delete(p.id);
            setPicked(next);
          }}
        />
      ))}
    </div>
  );
}

/* Approved actions with no live integration yet: Josh does them by hand from
   the approved draft, then marks them done (with what they cost, for the
   ones that spend money, so the ledger stays complete). */
export function ManualQueue({ proposals }) {
  const items = proposals.filter((p) => p.execution?.status === "manual" && !p.manual?.done);
  if (!items.length) return null;
  return (
    <div className="sb-card">
      <div className="sb-cardhead">
        <h2>To do by hand</h2>
        <span className="sb-chip clay">{items.length}</span>
      </div>
      <div className="sb-small sb-muted" style={{ marginBottom: 8 }}>
        Approved, but these integrations aren't connected yet. Do each one from the draft, then mark it done.
      </div>
      {items.map((p) => (
        <ManualItem key={p.id} proposal={p} />
      ))}
    </div>
  );
}

const ManualItem = ({ proposal }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(proposal.amountUsd || "");
  const [note, setNote] = useState("");
  const act = useAction();
  const def = ACTIONS[proposal.actionType] || {};
  const payload = parseJson(proposal.decision?.editedPayloadJson, null) ? proposal.decision.editedPayloadJson : proposal.payloadJson;
  const copy = () => {
    const obj = parseJson(payload, {});
    const text = obj.body ? `${obj.subject ? `Subject: ${obj.subject}\n\n` : ""}${obj.body}` : JSON.stringify(obj, null, 2);
    navigator.clipboard?.writeText(text);
  };
  return (
    <div className="sb-list-item" style={{ display: "block" }}>
      <div className="sb-between">
        <div>
          <b>{proposal.title}</b> <span className="sb-faint sb-small">{def.label}</span>
        </div>
        <button className="sb-link" type="button" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Open"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <PayloadView json={payload} />
          <div className="sb-row" style={{ marginTop: 8 }}>
            <button className="sb-btn ghost sm" type="button" onClick={copy}>
              Copy
            </button>
            {def.money && (
              <input className="sb-input" style={{ width: 120 }} type="number" min="0" step="0.01" placeholder="Actual $" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
            <input className="sb-input" style={{ flex: 1, minWidth: 140 }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="sb-btn sm" type="button" disabled={act.busy} onClick={() => act.run(() => markManualDone(proposal, { amountUsd: def.money ? amount : 0, note }))}>
              Mark done
            </button>
          </div>
          {act.error && <div className="sb-err">{act.error}</div>}
        </div>
      )}
    </div>
  );
};
