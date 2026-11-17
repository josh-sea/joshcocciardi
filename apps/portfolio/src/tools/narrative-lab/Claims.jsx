import React, { useMemo, useState } from "react";
import { explain, updateClaim } from "./store";
import { Empty, ItemLink, titleOf, useLab } from "./ui";

/* Atomic claims, each linked to every item that makes it. The verdict is
   Josh's call, never the pipeline's: the tool measures how a claim travels,
   not whether it is true. */

const VERDICTS = ["unreviewed", "supported", "disputed", "false", "unverifiable"];
const TONE = { supported: "good", disputed: "mid", false: "low", unverifiable: "", unreviewed: "" };

export default function Claims() {
  const { claims, itemsById, setError } = useLab();
  const [q, setQ] = useState("");
  const [shared, setShared] = useState(true);
  const [verdict, setVerdict] = useState("");
  const rows = useMemo(
    () =>
      claims
        .filter((c) => (!shared || (c.itemIds || []).length > 1) && (!verdict || c.verdict === verdict) && (!q.trim() || `${c.text} ${(c.variants || []).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())))
        .sort((a, b) => (b.itemIds || []).length - (a.itemIds || []).length),
    [claims, q, shared, verdict]
  );
  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Claims</h1>
          <div className="nl-sub">Claims matched across items, so you can see who repeats what and how the wording drifts.</div>
        </div>
      </div>
      <div className="nl-card">
        <div className="nl-row" style={{ marginBottom: 10 }}>
          <input style={{ maxWidth: 280 }} placeholder="Search claims" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ maxWidth: 170 }} value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            <option value="">Any verdict</option>
            {VERDICTS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <label className="nl-small nl-soft" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={shared} onChange={(e) => setShared(e.target.checked)} /> Only claims made by more than one item
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty>{shared && claims.length ? "No claim is shared by two items yet. Untick the filter to see all." : "No claims yet."}</Empty>
        ) : (
          rows.map((c) => (
            <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)" }}>
              <div className="nl-between">
                <strong style={{ fontFamily: "Newsreader, serif", fontSize: 16.5 }}>{c.text}</strong>
                <span className="nl-row">
                  <span className={`nl-chip ${TONE[c.verdict] || ""}`}>{c.kind}</span>
                  <select
                    aria-label="Verdict"
                    style={{ width: "auto", padding: "3px 6px", fontSize: 12 }}
                    value={c.verdict || "unreviewed"}
                    onChange={(e) => updateClaim(c.id, { verdict: e.target.value }).catch((err) => setError(explain(err)))}
                  >
                    {VERDICTS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </span>
              </div>
              {(c.variants || []).length > 0 && (
                <div className="nl-small nl-soft" style={{ marginTop: 3 }}>
                  Also worded: {c.variants.slice(0, 4).map((v) => `"${v}"`).join(" · ")}
                </div>
              )}
              <div className="nl-small" style={{ marginTop: 4 }}>
                {(c.itemIds || []).map((id, i) => (
                  <span key={id}>
                    {i > 0 && " · "}
                    <ItemLink id={id}>{titleOf(itemsById[id])}</ItemLink>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
