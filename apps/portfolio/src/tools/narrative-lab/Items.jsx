import React, { useMemo, useState } from "react";
import { fmtDate } from "./format";
import { Empty, Fid, StatusChip, titleOf, useLab } from "./ui";

/* Every item, filterable. Density shows the raw rate (per 1,000 words) so
   items from different genres can be read side by side; the percentile, when
   a genre has one, is on the item page. */
export default function Items() {
  const { items, go } = useLab();
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [state, setState] = useState("");
  const [sort, setSort] = useState("date");
  const [archived, setArchived] = useState(false);

  const genres = useMemo(() => [...new Set(items.map((x) => x.context?.genre).filter(Boolean))].sort(), [items]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = items.filter(
      (it) =>
        (archived || !it.archived) &&
        (!genre || it.context?.genre === genre) &&
        (!state || it.status === state) &&
        (!needle || `${titleOf(it)} ${it.sourceName || ""} ${it.context?.publisher || ""} ${it.context?.topic || ""}`.toLowerCase().includes(needle))
    );
    const num = (x) => (typeof x === "number" ? x : -1);
    if (sort === "density") out.sort((a, b) => num(b.scores?.densityRaw) - num(a.scores?.densityRaw));
    // Items with no fidelity (primary sources) sort after every scored one.
    const fid = (x) => (typeof x.scores?.fidelity === "number" ? x.scores.fidelity : 1000);
    if (sort === "fidelity") out.sort((a, b) => fid(a) - fid(b));
    if (sort === "pressure") out.sort((a, b) => num(b.scores?.pressurePeak) - num(a.scores?.pressurePeak));
    return out;
  }, [items, q, genre, state, sort, archived]);

  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Items</h1>
          <div className="nl-sub">
            {items.length} pieces of content. Density counts reasoning and rhetoric findings per 1,000 words; fidelity measures how faithfully a derivative
            carries its source. They are never combined.
          </div>
        </div>
      </div>
      <div className="nl-card">
        <div className="nl-row" style={{ marginBottom: 10 }}>
          <input style={{ maxWidth: 260 }} placeholder="Search title, source, topic" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ maxWidth: 160 }} value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select style={{ maxWidth: 150 }} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Any status</option>
            <option value="done">Done</option>
            <option value="running">Running</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
          <select style={{ maxWidth: 190 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date">Newest first</option>
            <option value="density">Highest density</option>
            <option value="fidelity">Lowest fidelity</option>
            <option value="pressure">Highest invariant pressure</option>
          </select>
          <label className="nl-small nl-soft" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty>{items.length ? "No items match." : "Nothing ingested yet."}</Empty>
        ) : (
          <div className="nl-scroll">
            <table className="nl-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Genre</th>
                  <th className="num">Density</th>
                  <th className="num">Fidelity</th>
                  <th className="num">Peak pressure</th>
                  <th className="num">Hop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id} className="click" onClick={() => go("item", { id: it.id })}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{titleOf(it)}</div>
                      <div className="nl-faint nl-small">
                        {[it.sourceName, it.context?.publisher !== it.sourceName ? it.context?.publisher : null, fmtDate(it.context?.publishedAt || it.createdAt)].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="nl-soft">{it.context?.genre || ""}</td>
                    <td className="num">{typeof it.scores?.densityRaw === "number" ? it.scores.densityRaw : "–"}</td>
                    <td className="num">
                      <Fid n={it.scores?.fidelity} />
                    </td>
                    <td className="num">{typeof it.scores?.pressurePeak === "number" ? `${it.scores.pressurePeak}/3` : "–"}</td>
                    <td className="num">{typeof it.hop === "number" ? it.hop : "–"}</td>
                    <td>
                      <StatusChip item={it} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
