import React, { createContext, useContext, useMemo } from "react";
import { densityDisplay, fidelityTone, isStalled, segments, statusLine } from "./format";

// Live data and navigation, provided once by index.jsx so no page opens its
// own copy of a listener.
export const Lab = createContext(null);
export const useLab = () => useContext(Lab);

export const layerClass = (layer) => (layer ? `l${layer}` : "");

export const LayerChip = ({ layer }) => {
  const text = { 2: "L2 Reasoning", 3: "L3 Rhetoric", 4: "L4 Narrative", 5: "L5 Invariant" }[layer] || `L${layer}`;
  return <span className={`nl-chip ${layerClass(layer)}`}>{text}</span>;
};

export const ConfChip = ({ c }) => <span className="nl-chip">{c}</span>;

export const StatusChip = ({ item }) => {
  if (!item) return null;
  if (item.status === "done") return <span className="nl-chip good">Done</span>;
  if (item.status === "failed") return <span className="nl-chip low">{statusLine(item)}</span>;
  if (isStalled(item)) return <span className="nl-chip mid">Stalled</span>;
  return (
    <span className="nl-chip live">
      <span className={`nl-dot ${item.status === "running" ? "pulse" : ""}`} />
      {statusLine(item)}
    </span>
  );
};

export const EdgeChip = ({ edge }) => {
  if (!edge) return null;
  const tone = { done: "good", waiting: "mid", missing: "low", unrelated: "", pending: "live" }[edge.status] || "";
  const text = { done: "Compared", waiting: "Waiting on source", missing: "Not ingested", unrelated: "Unrelated", pending: "Queued" }[edge.status] || edge.status;
  return <span className={`nl-chip ${tone}`}>{text}</span>;
};

export const Tile = ({ k, v, unit, note, tone }) => (
  <div className={`nl-tile ${tone || ""}`}>
    <div className="k">{k}</div>
    <div className="v">
      {v}
      {unit && <small>{unit}</small>}
    </div>
    {note && <div className="n">{note}</div>}
  </div>
);

export const DensityTile = ({ scores }) => {
  const { thresholds } = useLab();
  const d = densityDisplay(scores, thresholds?.genreBaseline);
  return <Tile k="Technique density" v={d.big} unit={d.unit} note={d.note} />;
};

export const FidelityTile = ({ scores }) => {
  const f = scores && scores.fidelity;
  if (typeof f !== "number") return <Tile k="Fidelity" v="–" note="No stored source to compare against" />;
  return <Tile k="Fidelity" v={f} unit="/100" tone={fidelityTone(f)} note={`Across ${scores.fidelityEdges} upstream ${scores.fidelityEdges === 1 ? "source" : "sources"}`} />;
};

export const Fid = ({ n }) => (typeof n === "number" ? <span className={`nl-chip ${fidelityTone(n)}`}>{n}</span> : <span className="nl-faint">–</span>);

/* Five invariants, 0 to 3 each, as segmented bars. */
export const PressureBars = ({ pressure, library }) => {
  const names = Object.fromEntries((library?.invariants || []).map((i) => [i.id, i.name]));
  const scores = pressure?.scores || {};
  return (
    <div className="nl-bars">
      {Object.keys(names).map((id) => (
        <div className="nl-bar" key={id} title={pressure?.rationale?.[id] || ""}>
          <span>{names[id]}</span>
          <span className="track" aria-label={`${names[id]} ${scores[id] || 0} of 3`}>
            {[1, 2, 3].map((n) => (
              <i key={n} className={(scores[id] || 0) >= n ? "on" : ""} />
            ))}
          </span>
          <span className="num">{scores[id] || 0}</span>
        </div>
      ))}
    </div>
  );
};

/* The text with every span highlighted. Overlaps split into segments; a
   segment covered by more than one span gets a heavier underline. Clicking
   selects the innermost span. */
export const Highlighted = ({ text, spans, selected, onSelect }) => {
  const byId = useMemo(() => Object.fromEntries(spans.map((s) => [s.id, s])), [spans]);
  const segs = useMemo(() => segments(text, spans), [text, spans]);
  return (
    <div className="nl-text">
      {segs.map((s) => {
        if (!s.ids.length) return <React.Fragment key={s.start}>{s.text}</React.Fragment>;
        const covering = s.ids.map((id) => byId[id]).sort((a, b) => a.end - a.start - (b.end - b.start));
        const top = covering[0];
        const cls = [top.cls, covering.length > 1 ? "multi" : "", s.ids.includes(selected) ? "sel" : ""].join(" ");
        return (
          <mark
            key={s.start}
            className={cls}
            title={covering.map((c) => c.label).join(" · ")}
            onClick={() => onSelect && onSelect(s.ids.includes(selected) && covering.length > 1 ? covering[(covering.findIndex((c) => c.id === selected) + 1) % covering.length].id : top.id)}
          >
            {s.text}
          </mark>
        );
      })}
    </div>
  );
};

export const Field = ({ label, children, hint }) => (
  <label className="nl-field">
    <span>{label}</span>
    {children}
    {hint && <div className="nl-faint nl-tiny" style={{ marginTop: 3 }}>{hint}</div>}
  </label>
);

export const Empty = ({ children }) => <div className="nl-empty">{children}</div>;

export const ItemLink = ({ id, children }) => {
  const { go } = useLab();
  return (
    <button type="button" className="nl-link" onClick={() => go("item", { id })}>
      {children}
    </button>
  );
};

export const SourceLink = ({ id, children }) => {
  const { go } = useLab();
  if (!id) return <span>{children}</span>;
  return (
    <button type="button" className="nl-link" onClick={() => go("source", { id })}>
      {children}
    </button>
  );
};

export const titleOf = (item) => (item && (item.context?.title || item.title || item.input?.url || "Untitled")) || "Untitled";
