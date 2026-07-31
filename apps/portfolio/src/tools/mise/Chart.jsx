import React, { useEffect, useRef } from "react";
import { COMPLETE_COLOR, OWNERS, OWNER_ORDER, countAll, leavesOf } from "./tree";

/* Left edge of every block: the open leaves beneath it, split by owner. A
   mostly-ochre stripe means the block is waiting on the client. Solid pine
   means everything underneath is closed. */
function OwnerStripe({ node }) {
  const leaves = leavesOf(node);
  const open = leaves.filter((l) => !l.done);
  if (open.length === 0) {
    return (
      <div className="stripe">
        <div style={{ flex: 1, background: COMPLETE_COLOR }} />
      </div>
    );
  }
  const mix = OWNER_ORDER.map((k) => ({ k, n: open.filter((l) => l.owner === k).length })).filter(
    (m) => m.n
  );
  return (
    <div className="stripe">
      {mix.map((m) => (
        <div key={m.k} style={{ flexGrow: m.n, background: OWNERS[m.k].color }} />
      ))}
    </div>
  );
}

/* One tick per end step underneath, in document order, so a merge block shows
   which parts are done rather than just how many. Past ~40 leaves the ticks go
   sub-pixel, so fall back to a two-part bar. */
function Track({ node }) {
  const leaves = leavesOf(node);
  if (leaves.length > 40) {
    const pct = (leaves.filter((l) => l.done).length / leaves.length) * 100;
    return (
      <div className="track">
        <div className="tick on" style={{ flexGrow: pct }} />
        <div className="tick" style={{ flexGrow: 100 - pct }} />
      </div>
    );
  }
  return (
    <div className="track">
      {leaves.map((l) => (
        <div key={l.id} className={`tick${l.done ? " on" : ""}`} />
      ))}
    </div>
  );
}

export function Cell({ item, depthWindow, selected, editing, onSelect, onCommit }) {
  const { node: x, depth, rowStart, rowSpan, stretch, truncated } = item;
  const inputRef = useRef(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const colFromRight = depthWindow - depth;
  const gridColumn = stretch ? `1 / ${colFromRight + 1}` : `${colFromRight} / span 1`;

  const leaves = leavesOf(x);
  const done = leaves.filter((l) => l.done).length;
  const isLeaf = x.children.length === 0;

  return (
    <button
      className={`cell d${Math.min(depth, 3)}${selected ? " sel" : ""}${
        isLeaf && x.done ? " isdone" : ""
      }`}
      style={{ gridColumn, gridRow: `${rowStart + 1} / span ${rowSpan}` }}
      onClick={() => !editing && onSelect(x.id)}
    >
      <OwnerStripe node={x} />
      {editing ? (
        <input
          ref={inputRef}
          className="edit"
          defaultValue={x.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onCommit(x.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit(x.id, e.target.value);
            if (e.key === "Escape") onCommit(x.id, x.name);
          }}
        />
      ) : (
        <div className="lab">{x.name}</div>
      )}
      <div className="meta">
        {isLeaf
          ? `${OWNERS[x.owner].label}${x.done ? " · done" : ""}`
          : `${done}/${leaves.length} end steps`}
      </div>
      {truncated && <div className="badge">+{countAll(x)}</div>}
      <Track node={x} />
    </button>
  );
}

/* Flat outline of the full subtree under the current outcome, no depth cap. */
export function PlanView({ root }) {
  const rows = [];
  const walk = (x, prefix, depth) => {
    rows.push({ x, wbs: prefix, depth });
    x.children.forEach((c, i) => walk(c, prefix ? `${prefix}.${i + 1}` : `${i + 1}`, depth + 1));
  };
  walk(root, "", 0);
  const leaves = leavesOf(root);
  const done = leaves.filter((l) => l.done).length;

  return (
    <div className="plan">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'IBM Plex Sans Condensed',sans-serif", fontSize: 21, fontWeight: 600 }}>
          {root.name}
        </div>
        <div className="sub">
          {done}/{leaves.length} end steps · {countAll(root)} tasks total
        </div>
      </div>
      {rows.slice(1).map(({ x, wbs, depth }) => {
        const ls = leavesOf(x);
        const d = ls.filter((l) => l.done).length;
        const isLeaf = x.children.length === 0;
        return (
          <div className="prow" key={x.id} style={{ paddingLeft: (depth - 1) * 16 }}>
            <span className="wbs">{wbs}</span>
            <span className="swatch" style={{ background: OWNERS[x.owner].color, opacity: isLeaf ? 1 : 0 }} />
            <span className="pname" style={{ opacity: isLeaf && x.done ? 0.45 : 1 }}>
              {x.name}
            </span>
            <span className="pmeta">
              {isLeaf ? (x.done ? "done" : OWNERS[x.owner].label) : `${d}/${ls.length}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
