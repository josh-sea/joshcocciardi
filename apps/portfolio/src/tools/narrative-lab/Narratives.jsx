import React, { useEffect, useMemo, useState } from "react";
import { explain, updateNarrative } from "./store";
import { fmtDate, millis, tally } from "./format";
import { Empty, Fid, ItemLink, PressureBars, SourceLink, titleOf, useLab } from "./ui";

/* Recurring storylines. A narrative page shows its cast as each item played
   it, how it moved from source to source over time, and which shared
   structures it leans on on average. */

export function NarrativesList() {
  const { narratives, go } = useLab();
  const [q, setQ] = useState("");
  const rows = narratives.filter((n) => !q.trim() || `${n.name} ${n.summary}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Narratives</h1>
          <div className="nl-sub">Storylines the pipeline has filed items under. Rename one when its name is unclear; the pipeline matches by meaning, not by name.</div>
        </div>
      </div>
      <div className="nl-card">
        <input style={{ maxWidth: 280, marginBottom: 10 }} placeholder="Search narratives" value={q} onChange={(e) => setQ(e.target.value)} />
        {rows.length === 0 ? (
          <Empty>No narratives yet.</Empty>
        ) : (
          <table className="nl-table">
            <thead>
              <tr>
                <th>Narrative</th>
                <th className="num">Items</th>
                <th className="num">Sources</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="click" onClick={() => go("narrative", { id: n.id })}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{n.name}</div>
                    <div className="nl-faint nl-small">{n.summary}</div>
                  </td>
                  <td className="num">{n.itemCount || 0}</td>
                  <td className="num">{n.sourceCount || 0}</td>
                  <td className="nl-soft nl-small">{fmtDate(n.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function NarrativeView({ id }) {
  const { narrativesById, items, library, go, setError } = useLab();
  const n = narrativesById[id];
  const [edit, setEdit] = useState(null);
  useEffect(() => setEdit(null), [id]);
  const mine = useMemo(
    () =>
      items
        .filter((it) => (it.narrativeIds || []).includes(id))
        .sort((a, b) => (Date.parse(a.context?.publishedAt || "") || millis(a.createdAt) || 0) - (Date.parse(b.context?.publishedAt || "") || millis(b.createdAt) || 0)),
    [items, id]
  );
  if (!n) return <Empty>That narrative isn't in the knowledge base.</Empty>;
  const entry = (it) => (it.narratives || []).find((x) => x.id === id) || {};
  const roles = tally(mine, (it) => entry(it).role);
  const cast = ["hero", "villain", "victim", "arbiter"].map((r) => [r, tally(mine, (it) => entry(it)[r])]);
  const save = () =>
    updateNarrative(id, { name: edit.name.trim(), summary: edit.summary.trim(), notes: edit.notes })
      .then(() => setEdit(null))
      .catch((e) => setError(explain(e)));

  return (
    <>
      <button type="button" className="nl-back" onClick={() => go("narratives")}>
        ← Narratives
      </button>
      <div className="nl-head">
        <div style={{ maxWidth: 760 }}>
          {edit ? (
            <>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ fontSize: 20, fontWeight: 600 }} />
              <textarea value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} style={{ marginTop: 6, minHeight: 70 }} />
              <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Notes" style={{ marginTop: 6, minHeight: 60 }} />
              <div className="nl-row" style={{ marginTop: 6 }}>
                <button type="button" className="nl-btn small primary" disabled={!edit.name.trim()} onClick={save}>
                  Save
                </button>
                <button type="button" className="nl-btn small" onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h1>{n.name}</h1>
              <div className="nl-sub">{n.summary}</div>
              {n.impliedAction && <div className="nl-small nl-soft" style={{ marginTop: 4 }}>Implied action: {n.impliedAction}</div>}
              {n.notes && <div className="nl-small" style={{ marginTop: 6 }}>{n.notes}</div>}
            </>
          )}
        </div>
        {!edit && (
          <button type="button" className="nl-btn small" onClick={() => setEdit({ name: n.name || "", summary: n.summary || "", notes: n.notes || "" })}>
            Edit
          </button>
        )}
      </div>
      <div className="nl-two">
        <div className="nl-card">
          <h2>Timeline</h2>
          {mine.length === 0 ? (
            <Empty>No items yet.</Empty>
          ) : (
            <table className="nl-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>Role</th>
                  <th className="num">Hop</th>
                  <th className="num">Fidelity</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((it) => (
                  <tr key={it.id}>
                    <td className="nl-soft nl-small" style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(it.context?.publishedAt || it.createdAt)}
                    </td>
                    <td>
                      <ItemLink id={it.id}>{titleOf(it)}</ItemLink>
                      <div className="nl-faint nl-small">
                        <SourceLink id={it.sourceId}>{it.sourceName}</SourceLink>
                      </div>
                    </td>
                    <td className="nl-soft">{entry(it).role}</td>
                    <td className="num">{typeof it.hop === "number" ? it.hop : "–"}</td>
                    <td className="num">
                      <Fid n={it.scores?.fidelity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <div className="nl-card">
            <h2>Cast across items</h2>
            {cast.map(([r, counts]) =>
              Object.keys(counts).length ? (
                <div key={r} className="nl-small" style={{ marginBottom: 6 }}>
                  <strong style={{ textTransform: "capitalize" }}>{r === "arbiter" ? "Arbiter of truth" : r}</strong>:{" "}
                  {Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([who, k]) => `${who}${k > 1 ? ` (${k})` : ""}`)
                    .join("; ")}
                </div>
              ) : null
            )}
            <h3>Roles</h3>
            <div className="nl-small nl-soft">
              {Object.entries(roles)
                .map(([r, k]) => `${r} ${k}`)
                .join(", ") || "–"}
            </div>
          </div>
          {n.meanPressure && (
            <div className="nl-card">
              <h2>Mean pressure</h2>
              <PressureBars pressure={{ scores: Object.fromEntries(Object.entries(n.meanPressure).map(([k, v]) => [k, Math.round(v)])) }} library={library} />
              <div className="nl-faint nl-tiny" style={{ marginTop: 6 }}>
                Averages over {n.itemCount || 0} items: {Object.entries(n.meanPressure).map(([k, v]) => `${k} ${v}`).join(", ")}.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
