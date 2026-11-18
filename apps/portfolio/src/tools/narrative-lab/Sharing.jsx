import React, { useMemo, useState } from "react";
import { acceptSuggestion, createShare, deleteShare, dismissSuggestion, explain, restoreSuggestion, setShareRevoked, shareUrl, updateShare } from "./store";
import { cascadeRootOf, fmtDate } from "./format";
import { Empty, ItemLink, titleOf, useLab } from "./ui";

/* Share links and the suggestions they bring in. A link is a random token
   with a scope; turning it off kills it on the next load. */

const copy = async (text, done) => {
  try {
    await navigator.clipboard.writeText(text);
    done("Copied");
  } catch {
    done("Select the link and copy it");
  }
};

const SCOPE_TEXT = { cascade: "Cascade", item: "Item", lab: "Whole lab" };

export function LinkBox({ token }) {
  const [msg, setMsg] = useState("");
  const url = shareUrl(token);
  return (
    <div className="nl-row" style={{ marginTop: 6 }}>
      <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220 }} className="mono" aria-label="Share link" />
      <button type="button" className="nl-btn small" onClick={() => copy(url, setMsg)}>
        Copy
      </button>
      <a className="nl-btn small" href={url} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "none" }}>
        Open
      </a>
      {msg && <span className="nl-small nl-soft">{msg}</span>}
    </div>
  );
}

/* The Share control on an item page: share the cascade it belongs to, or
   just this item. */
export function ShareControl({ item }) {
  const { edges, itemsById, shares, setError } = useLab();
  const [open, setOpen] = useState(false);
  const rootId = cascadeRootOf(item.id, edges);
  const hasCascade = edges.some((e) => e.from && e.status !== "unrelated" && (e.from === item.id || e.to === item.id));
  const [scope, setScope] = useState(hasCascade ? "cascade" : "item");
  const [label, setLabel] = useState("");
  const [allow, setAllow] = useState(true);
  const [made, setMade] = useState(null);
  const target = scope === "cascade" ? rootId : item.id;
  const existing = shares.filter((s) => s.scope === scope && s.targetId === target && !s.revoked);

  const make = async () => {
    try {
      const token = await createShare({ scope, targetId: target, label: label || titleOf(itemsById[target]), allowSuggestions: allow });
      setMade(token);
    } catch (e) {
      setError(explain(e));
    }
  };

  if (!open) {
    return (
      <button type="button" className="nl-btn small" onClick={() => setOpen(true)} disabled={item.status !== "done"} title={item.status !== "done" ? "Share once it's scored" : ""}>
        Share…
      </button>
    );
  }
  return (
    <div className="nl-card" style={{ position: "absolute", right: 0, top: "100%", zIndex: 30, width: "min(440px, calc(100vw - 32px))", marginTop: 6, boxShadow: "0 8px 30px rgba(0,0,0,.12)" }}>
      <div className="nl-between">
        <h2 style={{ margin: 0 }}>Share a read-only link</h2>
        <button type="button" className="nl-link nl-small" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {made ? (
        <>
          <p className="nl-soft nl-small" style={{ margin: "8px 0 0" }}>Anyone with this link can view it. Turn it off any time under Sharing.</p>
          <LinkBox token={made} />
        </>
      ) : (
        <>
          <div className="nl-tabs" style={{ margin: "10px 0" }}>
            <button type="button" className={scope === "cascade" ? "on" : ""} disabled={!hasCascade} onClick={() => setScope("cascade")}>
              Its cascade
            </button>
            <button type="button" className={scope === "item" ? "on" : ""} onClick={() => setScope("item")}>
              Just this item
            </button>
          </div>
          <div className="nl-small nl-soft" style={{ marginBottom: 8 }}>
            {scope === "cascade" ? (
              <>From the primary source <strong>{titleOf(itemsById[rootId])}</strong> through everything derived from it.</>
            ) : (
              "This item's report, with its sources and derivatives listed by title only."
            )}
          </div>
          <label className="nl-field">
            <span>Title shown on the page</span>
            <input id="share-label" value={label} placeholder={titleOf(itemsById[target])} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="nl-small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input id="share-allow" type="checkbox" style={{ width: "auto" }} checked={allow} onChange={(e) => setAllow(e.target.checked)} />
            Let viewers suggest content (you approve each one)
          </label>
          {existing.length > 0 && <div className="nl-small nl-faint" style={{ marginBottom: 8 }}>{existing.length} live link(s) already share this. A new one gets its own token, so you can turn them off separately.</div>}
          <button type="button" className="nl-btn primary" onClick={make}>
            Create link
          </button>
        </>
      )}
    </div>
  );
}

export function SuggestionsCard() {
  const { suggestions, go, setError } = useLab();
  const pending = suggestions.filter((s) => s.status === "pending");
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({});
  if (!pending.length) return null;
  const run = async (id, fn) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="nl-card" style={{ borderColor: "var(--accent)" }}>
      <h2>Suggested by viewers ({pending.length})</h2>
      <div className="nl-soft nl-small" style={{ marginBottom: 6 }}>
        Nothing is analyzed until you accept it.
      </div>
      {pending.map((s) => (
        <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)" }}>
          <div className="nl-between">
            <div style={{ minWidth: 0 }}>
              <strong>{s.title || s.url || `${(s.text || "").slice(0, 70)}…`}</strong>
              <div className="nl-faint nl-small">
                {[s.author, s.publisher, s.name ? `from ${s.name}` : "from an anonymous viewer", `via "${s.shareLabel || "a share link"}"`, fmtDate(s.createdAt)].filter(Boolean).join(" · ")}
              </div>
              {s.url && (
                <a className="nl-small" href={s.url} target="_blank" rel="noreferrer noopener" style={{ wordBreak: "break-all" }}>
                  {s.url}
                </a>
              )}
              {s.note && <div className="nl-small" style={{ marginTop: 4 }}>"{s.note}"</div>}
              {s.contact && <div className="nl-small nl-faint">Contact: {s.contact}</div>}
              {s.text && (
                <button type="button" className="nl-link nl-small" onClick={() => setOpen({ ...open, [s.id]: !open[s.id] })}>
                  {open[s.id] ? "Hide pasted text" : `Pasted text (${s.text.length.toLocaleString()} characters)`}
                </button>
              )}
              {open[s.id] && <div className="nl-small" style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", background: "var(--line2)", padding: 8, borderRadius: 8, marginTop: 4 }}>{s.text}</div>}
            </div>
            <div className="nl-row">
              <button type="button" className="nl-btn small primary" disabled={busy === s.id} onClick={() => run(s.id, async () => go("item", { id: await acceptSuggestion(s) }))}>
                Ingest
              </button>
              <button type="button" className="nl-btn small" disabled={busy === s.id} onClick={() => run(s.id, () => dismissSuggestion(s.id))}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Sharing() {
  const { shares, suggestions, itemsById, setError } = useLab();
  const [labLabel, setLabLabel] = useState("");
  const [labMade, setLabMade] = useState(null);
  const [showOff, setShowOff] = useState(false);
  const rows = useMemo(() => shares.filter((s) => showOff || !s.revoked), [shares, showOff]);
  const decided = suggestions.filter((s) => s.status !== "pending").slice(0, 30);
  const act = (p) => p.catch((e) => setError(explain(e)));

  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Sharing</h1>
          <div className="nl-sub">
            Read-only links to a cascade, an item, or the whole lab. Viewers see scores, findings, and short excerpts, never your notes, costs, original texts, or
            source profiles. Turning a link off takes effect on the next page load.
          </div>
        </div>
      </div>
      <div className="nl-card">
        <div className="nl-between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Links</h2>
          <label className="nl-small nl-soft" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show turned-off links
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty>No links yet. Open a scored item and press Share, or share the whole lab below.</Empty>
        ) : (
          <div className="nl-scroll">
            <table className="nl-table">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Scope</th>
                  <th className="num">Views</th>
                  <th>Last viewed</th>
                  <th className="num">Suggestions</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 600 }}>{s.label || "Untitled link"}</div>
                      {s.targetId && (
                        <div className="nl-small">
                          <ItemLink id={s.targetId}>{titleOf(itemsById[s.targetId])}</ItemLink>
                        </div>
                      )}
                      {!s.revoked && <LinkBox token={s.id} />}
                    </td>
                    <td className="nl-soft">{SCOPE_TEXT[s.scope]}</td>
                    <td className="num">{s.views || 0}</td>
                    <td className="nl-soft nl-small">{s.lastViewedAt ? fmtDate(s.lastViewedAt) : "Never"}</td>
                    <td className="num">
                      {s.suggestions || 0}
                      <div>
                        <label className="nl-tiny nl-soft" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          <input type="checkbox" style={{ width: "auto" }} checked={!!s.allowSuggestions} onChange={(e) => act(updateShare(s.id, { allowSuggestions: e.target.checked }))} />
                          taking
                        </label>
                      </div>
                    </td>
                    <td>{s.revoked ? <span className="nl-chip low">Off</span> : <span className="nl-chip good">Live</span>}</td>
                    <td>
                      <div className="nl-row">
                        <button type="button" className={`nl-btn small ${s.revoked ? "" : "danger"}`} onClick={() => act(setShareRevoked(s.id, !s.revoked))}>
                          {s.revoked ? "Turn on" : "Turn off"}
                        </button>
                        {s.revoked && (
                          <button type="button" className="nl-btn small" onClick={() => act(deleteShare(s.id))}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="nl-two">
        <div className="nl-card">
          <h2>Share the whole lab</h2>
          <div className="nl-soft nl-small" style={{ marginBottom: 8 }}>
            Every scored, unarchived item on one page with its timeline. Best once you have a few cascades worth showing.
          </div>
          {labMade ? (
            <LinkBox token={labMade} />
          ) : (
            <div className="nl-row">
              <input id="lab-label" placeholder="Title shown on the page" value={labLabel} onChange={(e) => setLabLabel(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button
                type="button"
                className="nl-btn primary"
                onClick={() => act(createShare({ scope: "lab", label: labLabel || "Narrative Lab", allowSuggestions: true }).then(setLabMade))}
              >
                Create link
              </button>
            </div>
          )}
        </div>
        <div className="nl-card" style={{ marginTop: 0 }}>
          <h2>Decided suggestions</h2>
          {decided.length === 0 ? (
            <div className="nl-soft nl-small">None yet. New suggestions appear at the top of Ingest.</div>
          ) : (
            decided.map((s) => (
              <div key={s.id} className="nl-between nl-small" style={{ padding: "5px 0", borderBottom: "1px solid var(--line2)" }}>
                <span style={{ minWidth: 0 }}>
                  {s.itemId ? <ItemLink id={s.itemId}>{s.title || s.url || "Pasted text"}</ItemLink> : s.title || s.url || "Pasted text"}
                  <span className="nl-faint"> · {s.status}</span>
                </span>
                {s.status === "dismissed" && (
                  <button type="button" className="nl-link" onClick={() => act(restoreSuggestion(s.id))}>
                    Restore
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
