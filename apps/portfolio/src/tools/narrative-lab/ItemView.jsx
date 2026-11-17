import React, { useEffect, useMemo, useState } from "react";
import { deleteItem, explain, readRaw, rescore, retryItem, setArchived, setItemNotes } from "./store";
import { fmtDate, fmtUsd, isStalled, progress, STAGE_TEXT } from "./format";
import { MissingIngest } from "./Ingest";
import {
  ConfChip,
  DensityTile,
  EdgeChip,
  Empty,
  Fid,
  FidelityTile,
  Highlighted,
  ItemLink,
  LayerChip,
  PressureBars,
  SourceLink,
  StatusChip,
  Tile,
  titleOf,
  useLab,
} from "./ui";

/* One item's report: the three outputs of the framework (findings,
   profile, questions), the text with every evidence span highlighted, and
   what this item did to each source it draws on. */

const NONE = []; // a stable empty list, so memoized views don't recompute every render

const RESCORE = [
  ["blind", "Reread from the blind pass"],
  ["relate", "Recompare with sources"],
  ["writeback", "Recompute scores only"],
  ["extract", "Start over from extraction"],
];

export default function ItemView({ id }) {
  const { itemsById, edges, library, go, setError, claimsById } = useLab();
  const item = itemsById[id];
  const [raw, setRaw] = useState(undefined);
  const [selected, setSelected] = useState(null);
  const [show, setShow] = useState({ 2: true, 3: true, 4: true, claims: false });

  useEffect(() => {
    let live = true;
    readRaw(id)
      .then((r) => live && setRaw(r))
      .catch(() => live && setRaw(null));
    return () => {
      live = false;
    };
  }, [id, item?.status === "done"]); // eslint-disable-line react-hooks/exhaustive-deps

  const tech = useMemo(() => Object.fromEntries((library?.techniques || []).map((t) => [t.id, t])), [library]);
  const bend = useMemo(() => Object.fromEntries((library?.maneuvers || []).map((t) => [t.id, t])), [library]);
  const trans = useMemo(() => Object.fromEntries((library?.transformations || []).map((t) => [t.id, t])), [library]);

  const findings = item?.findings || NONE;
  const maneuvers = item?.layer4?.maneuvers || NONE;
  const claims = item?.claims || NONE;
  const all = useMemo(() => {
    const out = {};
    for (const f of findings) out[f.id] = { kind: "finding", layer: f.layer, name: tech[f.techniqueId]?.name || f.techniqueId, ...f, question: tech[f.techniqueId]?.question };
    for (const m of maneuvers) out[m.id] = { kind: "maneuver", layer: 4, name: `BEND ${bend[m.maneuverId]?.name || m.maneuverId}`, ...m };
    for (const c of claims) out[c.id] = { kind: "claim", name: "Claim", ...c };
    return out;
  }, [findings, maneuvers, claims, tech, bend]);

  const spans = useMemo(() => {
    const out = [];
    for (const f of findings) if (show[f.layer]) out.push({ id: f.id, start: f.start, end: f.end, cls: `l${f.layer}`, label: all[f.id].name });
    for (const m of maneuvers) if (show[4] && Number.isInteger(m.start)) out.push({ id: m.id, start: m.start, end: m.end, cls: "l4", label: all[m.id].name });
    for (const c of claims) if (show.claims && Number.isInteger(c.start)) out.push({ id: c.id, start: c.start, end: c.end, cls: "cl", label: `Claim: ${c.text}` });
    return out;
  }, [findings, maneuvers, claims, show, all]);

  if (!item) return <Empty>That item isn't in the knowledge base.</Empty>;

  const c = item.context || {};
  const into = edges.filter((e) => e.to === id);
  const out = edges.filter((e) => e.from === id);
  const questionsFor = (fid) => (item.questions || []).filter((q) => q.findingId === fid);
  const sel = selected && all[selected];

  const act = (p) => p.catch((e) => setError(explain(e)));
  const onDelete = () => {
    if (!window.confirm("Delete this item, its capture, and the edges into it? Items derived from it keep their reference.")) return;
    act(deleteItem(id).then(() => go("items")));
  };

  return (
    <>
      <button type="button" className="nl-back" onClick={() => go("items")}>
        ← Items
      </button>
      <div className="nl-head">
        <div style={{ minWidth: 0 }}>
          <h1>{titleOf(item)}</h1>
          <div className="nl-sub nl-row">
            <SourceLink id={item.sourceId}>{item.sourceName || c.author || "Unknown source"}</SourceLink>
            {item.outletId && item.outletId !== item.sourceId && (
              <>
                · <SourceLink id={item.outletId}>{c.publisher}</SourceLink>
              </>
            )}
            {c.publishedAt && <>· {fmtDate(c.publishedAt)}</>}
            {c.genre && <span className="nl-chip">{c.genre}</span>}
            {c.format && <span className="nl-chip">{c.format}</span>}
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer noopener" className="nl-small">
                Original
              </a>
            )}
          </div>
        </div>
        <div className="nl-row">
          <StatusChip item={item} />
          {(item.status === "failed" || isStalled(item)) && (
            <button type="button" className="nl-btn small primary" onClick={() => act(retryItem(id))}>
              Retry
            </button>
          )}
          {item.status === "done" && (
            <select
              aria-label="Rescore"
              className="nl-btn small"
              style={{ width: "auto" }}
              value=""
              onChange={(e) => e.target.value && act(rescore(id, e.target.value))}
            >
              <option value="">Rescore…</option>
              {RESCORE.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="nl-btn small" onClick={() => act(setArchived(id, !item.archived))}>
            {item.archived ? "Unarchive" : "Archive"}
          </button>
          <button type="button" className="nl-btn small danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {item.status !== "done" && (
        <div className="nl-card" style={{ marginBottom: 12 }}>
          {item.status === "failed" ? (
            <div className="nl-err" style={{ margin: 0 }}>
              <strong>Stopped at {STAGE_TEXT[item.failedStage] || item.failedStage}.</strong> {item.error}
            </div>
          ) : (
            <>
              <div className="nl-soft">{STAGE_TEXT[item.stage] || item.stage}. The page updates as each stage lands.</div>
              <div className="nl-progress">
                <i style={{ width: `${Math.round(progress(item) * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}
      {item.capture?.truncated && <div className="nl-note" style={{ marginBottom: 12 }}>This text was longer than one capture holds, so only the first part was stored and analyzed.</div>}
      {item.capture?.fetchNote && <div className="nl-note nl-small" style={{ marginBottom: 12 }}>{item.capture.fetchNote}</div>}

      {item.status === "done" && (
        <div className="nl-tiles" style={{ marginBottom: 14 }}>
          <DensityTile scores={item.scores} />
          <FidelityTile scores={item.scores} />
          <Tile
            k="Direction"
            v={item.direction?.value ? item.direction.value[0].toUpperCase() + item.direction.value.slice(1) : "–"}
            note={item.direction?.value === "closing" ? "Closes options" : item.direction?.value === "opening" ? "Opens options" : "Neither clearly"}
            tone={item.direction?.value === "closing" ? "low" : item.direction?.value === "opening" ? "good" : ""}
          />
          <Tile k="Hop" v={typeof item.hop === "number" ? item.hop : "–"} note={item.hop === 0 ? "Primary in this knowledge base" : item.hop ? "From the nearest stored source" : "Source not analyzed yet"} />
        </div>
      )}

      <div className="nl-two">
        <div>
          <div className="nl-card">
            <div className="nl-between" style={{ marginBottom: 10 }}>
              <div className="nl-legend">
                {[
                  [2, "Reasoning", "var(--l2)"],
                  [3, "Rhetoric", "var(--l3)"],
                  [4, "Narrative", "var(--l4)"],
                ].map(([k, label, color]) => (
                  <label key={k} style={{ display: "inline-flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={show[k]} onChange={() => setShow({ ...show, [k]: !show[k] })} />
                    <i style={{ background: color }} />
                    {label} ({k === 4 ? maneuvers.length : findings.filter((f) => f.layer === k).length})
                  </label>
                ))}
                <label style={{ display: "inline-flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={show.claims} onChange={() => setShow({ ...show, claims: !show.claims })} />
                  Claims ({claims.length})
                </label>
              </div>
              <span className="nl-faint nl-small">{item.words ? `${item.words.toLocaleString()} words` : ""}</span>
            </div>
            {raw === undefined ? (
              <div className="nl-faint">Loading text…</div>
            ) : raw === null ? (
              <div className="nl-faint">The capture isn't stored yet.</div>
            ) : (
              <Highlighted text={raw.text} spans={spans} selected={selected} onSelect={setSelected} />
            )}
          </div>
        </div>

        <div style={{ position: "sticky", top: 96 }}>
          <div className="nl-card">
            {sel ? (
              <>
                <div className="nl-between">
                  <div className="nl-row">
                    {sel.layer && <LayerChip layer={sel.layer} />}
                    {sel.confidence && <ConfChip c={sel.confidence} />}
                  </div>
                  <button type="button" className="nl-link nl-small" onClick={() => setSelected(null)}>
                    Clear
                  </button>
                </div>
                <h3 style={{ marginTop: 8 }}>{sel.name}</h3>
                <div className="nl-soft">{sel.kind === "claim" ? sel.text : sel.explanation}</div>
                {sel.kind === "claim" && sel.claimId && claimsById[sel.claimId] && (
                  <div className="nl-small nl-faint" style={{ marginTop: 6 }}>
                    Made by {claimsById[sel.claimId].itemIds?.length || 1} item(s) · verdict {claimsById[sel.claimId].verdict}
                  </div>
                )}
                {sel.supportingFindingIds?.length > 0 && <div className="nl-small nl-faint" style={{ marginTop: 6 }}>Rests on {sel.supportingFindingIds.join(", ")}</div>}
                {[...questionsFor(sel.id).map((q) => q.question), ...(questionsFor(sel.id).length ? [] : sel.question ? [sel.question] : [])].map((q) => (
                  <div key={q} className="nl-q">
                    {q}
                  </div>
                ))}
              </>
            ) : (
              <div className="nl-soft nl-small">Select a highlight to see what it does and the question it raises.</div>
            )}
          </div>
          {item.pressure && (
            <div className="nl-card">
              <h2>Pressure profile</h2>
              <div className="nl-faint nl-small" style={{ marginBottom: 8 }}>
                Which shared structure the piece leans on, 0 to 3. Speculative: read the findings it rests on.
              </div>
              <PressureBars pressure={item.pressure} library={library} />
              {item.pressure.capped?.length > 0 && (
                <div className="nl-faint nl-tiny" style={{ marginTop: 8 }}>
                  Capped at 1 for lack of supporting findings: {item.pressure.capped.join(", ")}.
                </div>
              )}
              {item.direction?.rationale && <div className="nl-small nl-soft" style={{ marginTop: 8 }}>{item.direction.rationale}</div>}
            </div>
          )}
          {item.layer4 && (
            <div className="nl-card">
              <h2>Cast</h2>
              <dl className="nl-lib nl-small" style={{ margin: 0 }}>
                {["hero", "villain", "victim", "arbiter"].map((r) =>
                  item.layer4.cast?.[r] ? (
                    <React.Fragment key={r}>
                      <dt style={{ textTransform: "capitalize" }}>{r === "arbiter" ? "Arbiter of truth" : r}</dt>
                      <dd>{item.layer4.cast[r]}</dd>
                    </React.Fragment>
                  ) : null
                )}
                {item.layer4.inGroup?.length > 0 && (
                  <>
                    <dt>In-group</dt>
                    <dd>{item.layer4.inGroup.join(", ")}</dd>
                  </>
                )}
                {item.layer4.outGroup?.length > 0 && (
                  <>
                    <dt>Out-group</dt>
                    <dd>{item.layer4.outGroup.join(", ")}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      {(item.questions || []).length > 0 && (
        <div className="nl-card" style={{ marginTop: 14 }}>
          <h2>Questions that reopen the conversation</h2>
          {item.questions.map((q, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--line2)" }}>
              <span style={{ fontFamily: "Newsreader, serif", fontSize: 16.5 }}>{q.question}</span>
              {q.findingId && all[q.findingId] && (
                <button type="button" className="nl-link nl-small" style={{ marginLeft: 8 }} onClick={() => setSelected(q.findingId)}>
                  {all[q.findingId].name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="nl-card" style={{ marginTop: 14 }}>
        <h2>Upstream</h2>
        {into.length === 0 ? (
          <div className="nl-soft">No upstream found. This item is treated as a primary source in this knowledge base.</div>
        ) : (
          into.map((e) => <EdgeCard key={e.id} edge={e} trans={trans} side="to" />)
        )}
      </div>

      {out.length > 0 && (
        <div className="nl-card">
          <h2>Downstream</h2>
          {out.map((e) => (
            <div key={e.id} className="nl-between" style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
              <span>
                <ItemLink id={e.to}>{e.toTitle || titleOf(itemsById[e.to])}</ItemLink> <span className="nl-faint nl-small">{e.relation}</span>
              </span>
              <span className="nl-row">
                <EdgeChip edge={e} /> <Fid n={e.fidelity} />
              </span>
            </div>
          ))}
          <button type="button" className="nl-link nl-small" style={{ marginTop: 8 }} onClick={() => go("cascades", { id })}>
            See the whole cascade
          </button>
        </div>
      )}

      <div className="nl-card">
        <h2>Findings</h2>
        {findings.length + maneuvers.length === 0 ? (
          <div className="nl-soft">{item.status === "done" ? "No reasoning, rhetoric, or narrative findings." : "Not read yet."}</div>
        ) : (
          [...findings, ...maneuvers].map((f) => {
            const a = all[f.id];
            return (
              <div key={f.id} className={`nl-finding l${a.layer} ${selected === f.id ? "sel" : ""}`} onClick={() => setSelected(f.id)}>
                <div className="nl-row">
                  <span className="mono nl-faint">{f.id}</span>
                  <LayerChip layer={a.layer} />
                  <strong>{a.name}</strong>
                  <ConfChip c={f.confidence} />
                </div>
                <blockquote>{f.quote}</blockquote>
                <div className="nl-small nl-soft">{f.explanation}</div>
              </div>
            );
          })
        )}
        {(item.unlocatedFindings || []).length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="nl-small nl-soft">
              {item.unlocatedFindings.length} finding(s) left out of the scores because the quote wasn't found in the text
            </summary>
            {item.unlocatedFindings.map((f, i) => (
              <div key={i} className="nl-small" style={{ padding: "6px 0" }}>
                <strong>{tech[f.techniqueId]?.name || f.techniqueId}</strong>: "{f.quote}" <span className="nl-faint">{f.explanation}</span>
              </div>
            ))}
          </details>
        )}
      </div>

      <div className="nl-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", marginTop: 12 }}>
        <div className="nl-card" style={{ marginTop: 0 }}>
          <h2>Narratives</h2>
          {(item.narratives || []).length === 0 ? (
            <div className="nl-soft">None filed.</div>
          ) : (
            item.narratives.map((n) => (
              <div key={n.id} style={{ padding: "6px 0" }}>
                <button type="button" className="nl-link" onClick={() => go("narrative", { id: n.id })}>
                  {n.name}
                </button>{" "}
                <span className="nl-chip">{n.role}</span> {n.isNew && <span className="nl-chip live">new</span>}
              </div>
            ))
          )}
          <h3>Context packet</h3>
          <dl className="nl-lib nl-small" style={{ margin: 0 }}>
            <dt>Topic</dt>
            <dd>{c.topic || "–"}</dd>
            <dt>Summary</dt>
            <dd>{c.summary || "–"}</dd>
            {c.subjects?.length > 0 && (
              <>
                <dt>About</dt>
                <dd>{c.subjects.join(", ")}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="nl-card" style={{ marginTop: 0 }}>
          <h2>Claims</h2>
          {claims.length === 0 ? (
            <div className="nl-soft">None extracted.</div>
          ) : (
            claims.map((cl) => {
              const shared = claimsById[cl.claimId]?.itemIds?.length || 1;
              return (
                <div key={cl.id} className="nl-small" style={{ padding: "5px 0", borderBottom: "1px solid var(--line2)", cursor: Number.isInteger(cl.start) ? "pointer" : "default" }} onClick={() => {
                  if (!Number.isInteger(cl.start)) return;
                  setShow({ ...show, claims: true });
                  setSelected(cl.id);
                }}>
                  {cl.text} <span className="nl-faint">· {cl.kind}</span>
                  {shared > 1 && <span className="nl-chip live" style={{ marginLeft: 6 }}>in {shared} items</span>}
                </div>
              );
            })
          )}
        </div>
        <div className="nl-card" style={{ marginTop: 0 }}>
          <h2>Notes</h2>
          <NotesBox id={id} value={item.notes || ""} />
          <h3>Pipeline</h3>
          <div className="nl-small nl-soft">
            Cost {fmtUsd(item.cost)} · library {item.libraryVersion || "–"}
          </div>
          {Object.entries(item.steps || {}).map(([k, s]) => (
            <div key={k} className="nl-tiny nl-faint">
              {STAGE_TEXT[k] || k}: {(s.ms / 1000).toFixed(1)}s{s.cost ? ` · ${fmtUsd(s.cost)}` : ""}
              {s.model ? ` · ${s.model}` : ""}
              {s.error ? " · failed" : ""}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NotesBox({ id, value }) {
  const { setError } = useLab();
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setText(value);
    setSaved(true);
  }, [value]);
  return (
    <>
      <textarea
        value={text}
        style={{ minHeight: 80 }}
        placeholder="Your own read: what to check, what the scores miss."
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
      <div className="nl-between" style={{ marginTop: 6 }}>
        <span className="nl-faint nl-tiny">{saved ? "" : "Unsaved"}</span>
        <button type="button" className="nl-btn small" disabled={saved} onClick={() => setItemNotes(id, text).then(() => setSaved(true)).catch((e) => setError(explain(e)))}>
          Save
        </button>
      </div>
    </>
  );
}

/* One derivation edge: what the derivative did to this source. */
export function EdgeCard({ edge: e, trans }) {
  const { itemsById } = useLab();
  const [open, setOpen] = useState(e.status === "done");
  const fromTitle = e.fromTitle || titleOf(itemsById[e.from]) || e.ref?.title || e.ref?.url;
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)" }}>
      <div className="nl-between">
        <div>
          {e.from ? <ItemLink id={e.from}>{fromTitle}</ItemLink> : <strong>{fromTitle || "Unnamed reference"}</strong>}
          <span className="nl-faint nl-small">
            {" "}
            · {e.relation} · link {e.linkEvidence}
            {typeof e.lagHours === "number" ? ` · ${e.lagHours}h later` : ""}
          </span>
        </div>
        <span className="nl-row">
          <EdgeChip edge={e} />
          {typeof e.fidelity === "number" && (
            <span className="nl-small">
              fidelity <Fid n={e.fidelity} />
            </span>
          )}
          {e.status === "done" && (
            <button type="button" className="nl-link nl-small" onClick={() => setOpen(!open)}>
              {open ? "Hide" : "Show"}
            </button>
          )}
        </span>
      </div>
      {e.status === "missing" && e.ref?.url && <MissingIngest edge={e} />}
      {e.status === "waiting" && <div className="nl-small nl-faint">Compared once the source finishes its own pass.</div>}
      {open && e.status === "done" && (
        <div style={{ marginTop: 8 }}>
          {e.summary && <div className="nl-soft" style={{ marginBottom: 8 }}>{e.summary}</div>}
          {(e.transformations || []).length > 0 && (
            <div className="nl-row" style={{ marginBottom: 8 }}>
              {e.transformations.map((t, i) => {
                const d = trans[t.id] || {};
                const tone = d.direction === "improves" ? "good" : d.direction === "neutral" ? "" : t.severity >= 3 ? "low" : "mid";
                return (
                  <span key={i} className={`nl-chip ${tone}`} title={`${d.definition || ""} ${t.note || ""}`}>
                    {t.id} {d.name}
                  </span>
                );
              })}
            </div>
          )}
          {(e.carried || []).map((x, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div className="nl-row nl-small">
                <span className={`nl-chip ${x.status === "faithful" ? "good" : x.status === "distorted" ? (x.severity >= 3 ? "low" : "mid") : "low"}`}>{x.status}</span>
                {x.transformationIds?.map((t) => (
                  <span key={t} className="nl-chip">
                    {t} {trans[t]?.name}
                  </span>
                ))}
                <span className="nl-faint">materiality {x.materiality}</span>
              </div>
              <div className="nl-compare">
                <div>
                  <span className="lab">Derivative</span>
                  {x.derivativeQuote || "–"}
                </div>
                <div>
                  <span className="lab">Source</span>
                  {x.sourceQuote || <em className="nl-faint">Not in the source</em>}
                </div>
              </div>
              {x.note && <div className="nl-small nl-soft" style={{ marginTop: 4 }}>{x.note}</div>}
            </div>
          ))}
          {(e.dropped || []).length > 0 && (
            <>
              <h3>Dropped from the source</h3>
              {e.dropped.map((x, i) => (
                <div key={i} className="nl-small" style={{ padding: "4px 0" }}>
                  <span className="nl-chip">{x.kind}</span> "{x.sourceQuote}" <span className="nl-faint">{x.note}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
