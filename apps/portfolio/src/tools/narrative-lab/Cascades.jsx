import React, { useMemo } from "react";
import { cascadeStats, cascadeTree, fmtDate } from "./format";
import { EdgeChip, Empty, Fid, ItemLink, SourceLink, titleOf, useLab } from "./ui";

/* A cascade is one primary source and everything derived from it. This is
   where the framework's first hypothesis is checked by eye: does fidelity
   fall as the hop count rises? */

export default function Cascades({ rootId }) {
  const { items, itemsById, edges, go } = useLab();

  const roots = useMemo(() => {
    const downstream = {};
    for (const e of edges) if (e.from && e.status !== "unrelated") downstream[e.from] = (downstream[e.from] || 0) + 1;
    const hasUp = new Set(edges.filter((e) => e.from && e.status !== "unrelated").map((e) => e.to));
    return items
      .filter((it) => downstream[it.id] && !hasUp.has(it.id))
      .map((it) => {
        const s = cascadeStats(cascadeTree(it.id, edges, itemsById));
        return { item: it, ...s };
      })
      .sort((a, b) => b.size - a.size);
  }, [items, itemsById, edges]);

  if (rootId) return <CascadeView rootId={rootId} />;

  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Cascades</h1>
          <div className="nl-sub">Each primary source with derivatives stored, and how faithfully its story survives each hop.</div>
        </div>
      </div>
      <div className="nl-card">
        {roots.length === 0 ? (
          <Empty>No cascades yet. Ingest a primary source, then content that draws on it.</Empty>
        ) : (
          <table className="nl-table">
            <thead>
              <tr>
                <th>Primary source</th>
                <th className="num">Derivatives</th>
                <th className="num">Depth</th>
                <th>Fidelity by hop</th>
              </tr>
            </thead>
            <tbody>
              {roots.map((r) => (
                <tr key={r.item.id} className="click" onClick={() => go("cascades", { id: r.item.id })}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{titleOf(r.item)}</div>
                    <div className="nl-faint nl-small">
                      {r.item.sourceName} · {fmtDate(r.item.context?.publishedAt || r.item.createdAt)}
                    </div>
                  </td>
                  <td className="num">{r.size}</td>
                  <td className="num">{r.depth}</td>
                  <td>
                    <span className="nl-row">
                      {r.perHop.map((h) => (
                        <span key={h.depth} className="nl-small">
                          {h.depth}: <Fid n={h.meanFidelity} />
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CascadeView({ rootId }) {
  const { itemsById, edges, go } = useLab();
  const tree = useMemo(() => cascadeTree(rootId, edges, itemsById), [rootId, edges, itemsById]);
  const stats = useMemo(() => cascadeStats(tree), [tree]);
  if (!tree) return <Empty>That item isn't in the knowledge base.</Empty>;

  return (
    <>
      <button type="button" className="nl-back" onClick={() => go("cascades")}>
        ← Cascades
      </button>
      <div className="nl-head">
        <div>
          <h1>{titleOf(tree.item)}</h1>
          <div className="nl-sub">
            {stats.size} derivative{stats.size === 1 ? "" : "s"} across {stats.depth} hop{stats.depth === 1 ? "" : "s"}.
          </div>
        </div>
      </div>
      <div className="nl-hops">
        {stats.perHop.map((h) => (
          <div key={h.depth} className="nl-hop">
            <div className="h">Hop {h.depth}</div>
            <div className="f">{typeof h.meanFidelity === "number" ? h.meanFidelity : "–"}</div>
            <div className="nl-tiny nl-faint">
              mean fidelity · {h.count} item{h.count === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
      <div className="nl-card nl-tree">
        {stats.rows.map((n) => (
          <div key={n.item.id} className="nl-node">
            <span className="rail">
              {Array.from({ length: n.depth }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <div style={{ minWidth: 0 }}>
              <ItemLink id={n.item.id}>{titleOf(n.item)}</ItemLink>
              <div className="nl-faint nl-small">
                <SourceLink id={n.item.sourceId}>{n.item.sourceName}</SourceLink> · {n.item.context?.genre} · {fmtDate(n.item.context?.publishedAt || n.item.createdAt)}
                {n.edge && ` · ${n.edge.relation}`}
                {n.edge && typeof n.edge.lagHours === "number" && ` · ${n.edge.lagHours}h after its source`}
              </div>
              {n.edge && (n.edge.transformations || []).length > 0 && (
                <div className="nl-tiny nl-soft">{[...new Set(n.edge.transformations.map((t) => t.id))].join(" ")}</div>
              )}
            </div>
            <span className="nl-row">
              {n.edge ? (
                <>
                  <EdgeChip edge={n.edge} />
                  <Fid n={n.edge.fidelity} />
                </>
              ) : (
                <span className="nl-chip">primary</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
