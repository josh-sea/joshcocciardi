import React, { useEffect, useMemo, useState } from "react";
import { explain, updateSource } from "./store";
import { fmtDate } from "./format";
import { Empty, Fid, ItemLink, StatusChip, Tile, titleOf, useLab } from "./ui";

/* People and outlets. A profile is computed for every source but only shown
   from the minimum item count up, with the count always visible: a profile of
   a real person is a claim about them. */

export function SourcesList() {
  const { sources, go, thresholds } = useLab();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const rows = useMemo(
    () =>
      sources
        .filter((s) => (!kind || s.kind === kind) && (!q.trim() || s.name?.toLowerCase().includes(q.trim().toLowerCase())))
        .sort((a, b) => (b.itemsCount || 0) - (a.itemsCount || 0) || String(a.name).localeCompare(String(b.name))),
    [sources, q, kind]
  );
  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Sources</h1>
          <div className="nl-sub">
            People and outlets, created as items come in. Profiles appear at {thresholds.profileMin} scored items; below that the numbers are too thin to
            describe anyone.
          </div>
        </div>
      </div>
      <div className="nl-card">
        <div className="nl-row" style={{ marginBottom: 10 }}>
          <input style={{ maxWidth: 260 }} placeholder="Search sources" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ maxWidth: 160 }} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">People and outlets</option>
            <option value="individual">People</option>
            <option value="outlet">Outlets</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty>No sources yet.</Empty>
        ) : (
          <div className="nl-scroll">
            <table className="nl-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th className="num">Items</th>
                  <th className="num">Median density</th>
                  <th className="num">Median fidelity</th>
                  <th>Usual role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const p = s.profile || {};
                  return (
                    <tr key={s.id} className="click" onClick={() => go("source", { id: s.id })}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="nl-soft">{s.kind === "individual" ? "Person" : "Outlet"}</td>
                      <td className="num">{s.itemsCount || 0}</td>
                      <td className="num">{p.shown && typeof p.densityMedian === "number" ? p.densityMedian : <span className="nl-faint">–</span>}</td>
                      <td className="num">{p.shown ? <Fid n={p.fidelityMedian} /> : <span className="nl-faint">–</span>}</td>
                      <td className="nl-soft">{p.shown ? p.usualRole || "" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function SourceView({ id }) {
  const { sourcesById, items, library, go, thresholds, setError } = useLab();
  const s = sourcesById[id];
  const mine = useMemo(() => items.filter((it) => it.sourceId === id || it.outletId === id), [items, id]);
  const [notes, setNotes] = useState(s?.notes || "");
  const [aff, setAff] = useState({ name: "", cite: "" });
  useEffect(() => setNotes(s?.notes || ""), [s?.notes]);
  if (!s) return <Empty>That source isn't in the knowledge base.</Empty>;
  const p = s.profile || {};
  const tech = Object.fromEntries((library?.techniques || []).map((t) => [t.id, t.name]));
  const trans = Object.fromEntries((library?.transformations || []).map((t) => [t.id, t.name]));
  const act = (patch) => updateSource(id, patch).catch((e) => setError(explain(e)));
  const remaining = Math.max(0, thresholds.profileMin - (s.itemsCount || 0));

  return (
    <>
      <button type="button" className="nl-back" onClick={() => go("sources")}>
        ← Sources
      </button>
      <div className="nl-head">
        <div>
          <h1>{s.name}</h1>
          <div className="nl-sub">
            {s.kind === "individual" ? "Person" : "Outlet"}
            {(s.hosts || []).length > 0 && ` · ${s.hosts.join(", ")}`} · {s.itemsCount || 0} scored item(s)
          </div>
        </div>
      </div>

      {p.shown ? (
        <div className="nl-tiles" style={{ marginBottom: 14 }}>
          <Tile k="Median density" v={typeof p.densityMedian === "number" ? p.densityMedian : "–"} unit="per 1k words" note={`Over ${p.items} items`} />
          <Tile k="Median fidelity" v={typeof p.fidelityMedian === "number" ? p.fidelityMedian : "–"} unit={typeof p.fidelityMedian === "number" ? "/100" : ""} note={`Over ${p.fidelityItems} derivative items`} />
          <Tile k="Usual role" v={p.usualRole || "–"} note={Object.entries(p.roles || {}).map(([k, v]) => `${k} ${v}`).join(", ")} />
          <Tile k="Active" v={p.firstSeen ? fmtDate(p.firstSeen) : "–"} note={p.lastSeen ? `to ${fmtDate(p.lastSeen)}` : ""} />
        </div>
      ) : (
        <div className="nl-note" style={{ marginBottom: 14 }}>
          No profile yet: {remaining} more scored item{remaining === 1 ? "" : "s"} needed. The items are listed below.
        </div>
      )}

      <div className="nl-two">
        <div className="nl-card">
          <h2>Items</h2>
          {mine.length === 0 ? (
            <Empty>No items.</Empty>
          ) : (
            <table className="nl-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Density</th>
                  <th className="num">Fidelity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <ItemLink id={it.id}>{titleOf(it)}</ItemLink>
                      <div className="nl-faint nl-small">
                        {it.context?.genre} · {fmtDate(it.context?.publishedAt || it.createdAt)}
                      </div>
                    </td>
                    <td className="num">{typeof it.scores?.densityRaw === "number" ? it.scores.densityRaw : "–"}</td>
                    <td className="num">
                      <Fid n={it.scores?.fidelity} />
                    </td>
                    <td>
                      <StatusChip item={it} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.shown && (
            <div className="nl-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
              <div>
                <h3>Most frequent techniques</h3>
                {(p.topTechniques || []).map((t) => (
                  <div key={t.id} className="nl-small">
                    {tech[t.id] || t.id} <span className="nl-faint">× {t.count}</span>
                  </div>
                ))}
              </div>
              <div>
                <h3>Most frequent transformations</h3>
                {(p.topTransformations || []).map((t) => (
                  <div key={t.id} className="nl-small">
                    {t.id} {trans[t.id]} <span className="nl-faint">× {t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="nl-card">
            <h2>Affiliations and funding</h2>
            <div className="nl-faint nl-small" style={{ marginBottom: 8 }}>
              Disclosed sponsors, employers, or funding. Each needs a citation.
            </div>
            {(s.affiliations || []).map((a, i) => (
              <div key={i} className="nl-between nl-small" style={{ padding: "4px 0" }}>
                <span>
                  {a.name}{" "}
                  {a.cite && (
                    <a href={a.cite} target="_blank" rel="noreferrer noopener">
                      source
                    </a>
                  )}
                </span>
                <button type="button" className="nl-link" onClick={() => act({ affiliations: s.affiliations.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <div className="nl-row" style={{ marginTop: 8 }}>
              <input placeholder="Name" value={aff.name} onChange={(e) => setAff({ ...aff, name: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <input placeholder="Citation link" value={aff.cite} onChange={(e) => setAff({ ...aff, cite: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <button
                type="button"
                className="nl-btn small"
                disabled={!aff.name.trim() || !/^https?:\/\//.test(aff.cite.trim())}
                onClick={() => {
                  act({ affiliations: [...(s.affiliations || []), { name: aff.name.trim(), cite: aff.cite.trim() }] });
                  setAff({ name: "", cite: "" });
                }}
              >
                Add
              </button>
            </div>
          </div>
          <div className="nl-card">
            <h2>Notes</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 90 }} placeholder="Background, standing narratives, corrections history." />
            <div className="nl-between" style={{ marginTop: 6 }}>
              <select style={{ width: "auto" }} value={s.kind} onChange={(e) => act({ kind: e.target.value })} aria-label="Kind">
                <option value="individual">Person</option>
                <option value="outlet">Outlet</option>
              </select>
              <button type="button" className="nl-btn small" disabled={notes === (s.notes || "")} onClick={() => act({ notes })}>
                Save notes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
