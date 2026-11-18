import React, { useMemo, useState } from "react";
import { explain, retryItem, submitItem } from "./store";
import { fmtDate, isStalled, progress } from "./format";
import { Empty, Field, ItemLink, StatusChip, titleOf, useLab } from "./ui";
import { SuggestionsCard } from "./Sharing";

/* Submitting content, and watching it go through the pipeline. A link is
   fetched by the pipeline; pasted text is used as is (the link, if given too,
   is kept for matching). "Derived from" links the new item to ones already
   stored, which is the strongest evidence of an edge. */

const GENRES = ["", "news", "analysis", "opinion", "advocacy", "satire", "social-post", "transcript", "press-release", "research"];
const FORMATS = ["", "article", "headline", "thread", "short-post", "video-transcript", "podcast-transcript", "newsletter", "report", "other"];

const blank = { url: "", text: "", title: "", author: "", publisher: "", publishedAt: "", genre: "", format: "" };

export default function Ingest() {
  const { items, go, setError, edges } = useLab();
  const [mode, setMode] = useState("link");
  const [form, setForm] = useState(blank);
  const [more, setMore] = useState(false);
  const [upstream, setUpstream] = useState([]);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const candidates = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((it) => !upstream.includes(it.id))
      .filter((it) => `${titleOf(it)} ${it.sourceName || ""} ${it.context?.publisher || ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [find, items, upstream]);

  const canSubmit = mode === "link" ? /^https?:\/\/\S+$/i.test(form.url.trim()) : form.text.trim().length >= 20;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const input = { ...form, upstreamIds: upstream };
      if (mode === "link") input.text = "";
      const id = await submitItem(input);
      setDone(id);
      setForm(blank);
      setUpstream([]);
      setFind("");
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const active = items.filter((x) => x.status === "queued" || x.status === "running");
  const failed = items.filter((x) => x.status === "failed");
  const recent = items.filter((x) => x.status === "done").slice(0, 6);
  // One row per cited source, however many stored items cite it.
  const missing = useMemo(() => {
    const groups = new Map();
    for (const e of edges) {
      if (e.status !== "missing") continue;
      const key = (e.ref?.url || e.ref?.title || e.id).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
      const g = groups.get(key) || { edge: e, citedBy: [] };
      g.citedBy.push(e.to);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.citedBy.length - a.citedBy.length).slice(0, 10);
  }, [edges]);

  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Ingest</h1>
          <div className="nl-sub">
            Add a piece of content. It is captured once, read blind for reasoning and rhetoric, filed against the sources, narratives, and claims already
            stored, compared with anything it derives from, then scored. Ingest primary sources first when you can.
          </div>
        </div>
      </div>

      <SuggestionsCard />
      <div className="nl-two" style={{ marginTop: 12 }}>
        <div>
          <form className="nl-card" onSubmit={submit}>
            <div className="nl-between" style={{ marginBottom: 12 }}>
              <div className="nl-tabs" role="tablist">
                <button type="button" className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>
                  Link
                </button>
                <button type="button" className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>
                  Paste text
                </button>
              </div>
              <button type="button" className="nl-link nl-small" onClick={() => setMore(!more)}>
                {more ? "Fewer details" : "Add details"}
              </button>
            </div>
            {mode === "link" ? (
              <Field label="Link" hint="Paywalled or script-only pages can't be read. Paste the text instead.">
                <input type="url" placeholder="https://" value={form.url} onChange={set("url")} autoFocus />
              </Field>
            ) : (
              <>
                <Field label="Text" hint="An article, a transcript, a thread, or a single post.">
                  <textarea value={form.text} onChange={set("text")} placeholder="Paste the full text here" style={{ minHeight: 200 }} />
                </Field>
                <Field label="Link (optional)" hint="Kept for matching this item to references from other content.">
                  <input type="url" placeholder="https://" value={form.url} onChange={set("url")} />
                </Field>
              </>
            )}
            {more && (
              <div className="nl-fields">
                <Field label="Title">
                  <input value={form.title} onChange={set("title")} />
                </Field>
                <Field label="Author or creator">
                  <input value={form.author} onChange={set("author")} />
                </Field>
                <Field label="Outlet or platform">
                  <input value={form.publisher} onChange={set("publisher")} />
                </Field>
                <Field label="Published">
                  <input type="date" value={form.publishedAt} onChange={set("publishedAt")} />
                </Field>
                <Field label="Genre">
                  <select value={form.genre} onChange={set("genre")}>
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {g || "Detect"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Format">
                  <select value={form.format} onChange={set("format")}>
                    {FORMATS.map((g) => (
                      <option key={g} value={g}>
                        {g || "Detect"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Derived from (optional)" hint="Stored items this content quotes, summarizes, or reacts to. Links in the text are found automatically.">
              <input placeholder="Search stored items" value={find} onChange={(e) => setFind(e.target.value)} />
            </Field>
            {candidates.length > 0 && (
              <div style={{ margin: "-4px 0 10px" }}>
                {candidates.map((it) => (
                  <div key={it.id} className="nl-between nl-small" style={{ padding: "4px 0" }}>
                    <span>
                      {titleOf(it)} <span className="nl-faint">· {it.sourceName || it.context?.publisher || ""}</span>
                    </span>
                    <button type="button" className="nl-btn small" onClick={() => setUpstream([...upstream, it.id])}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
            {upstream.length > 0 && (
              <div className="nl-row" style={{ marginBottom: 10 }}>
                {upstream.map((uid) => (
                  <span key={uid} className="nl-chip live">
                    {titleOf(items.find((x) => x.id === uid))}
                    <button type="button" className="nl-link" aria-label="Remove" onClick={() => setUpstream(upstream.filter((x) => x !== uid))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="nl-between">
              <span className="nl-faint nl-small">{done && <>Queued. <ItemLink id={done}>Open it</ItemLink></>}</span>
              <button type="submit" className="nl-btn primary" disabled={!canSubmit || busy}>
                {busy ? "Adding…" : "Add to the knowledge base"}
              </button>
            </div>
          </form>

          <div className="nl-card">
            <h2>In progress</h2>
            {active.length === 0 && failed.length === 0 ? (
              <Empty>Nothing in the pipeline.</Empty>
            ) : (
              [...failed, ...active].map((it) => (
                <div key={it.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line2)" }}>
                  <div className="nl-between">
                    <ItemLink id={it.id}>{titleOf(it)}</ItemLink>
                    <StatusChip item={it} />
                  </div>
                  {it.status === "failed" ? (
                    <div className="nl-between nl-small" style={{ marginTop: 4 }}>
                      <span className="nl-soft">{it.error}</span>
                      <button type="button" className="nl-btn small" onClick={() => retryItem(it.id).catch((e) => setError(explain(e)))}>
                        Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="nl-progress">
                        <i style={{ width: `${Math.round(progress(it) * 100)}%` }} />
                      </div>
                      {isStalled(it) && (
                        <div className="nl-between nl-small" style={{ marginTop: 4 }}>
                          <span className="nl-soft">This stage stopped checking in.</span>
                          <button type="button" className="nl-btn small" onClick={() => retryItem(it.id).catch((e) => setError(explain(e)))}>
                            Resume
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="nl-card">
            <h2>Recently scored</h2>
            {recent.length === 0 ? (
              <Empty>Nothing scored yet.</Empty>
            ) : (
              recent.map((it) => (
                <div key={it.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
                  <ItemLink id={it.id}>{titleOf(it)}</ItemLink>
                  <div className="nl-faint nl-small">
                    {it.sourceName} · {it.context?.genre} · {fmtDate(it.context?.publishedAt || it.createdAt)}
                  </div>
                </div>
              ))
            )}
            {recent.length > 0 && (
              <button type="button" className="nl-link nl-small" style={{ marginTop: 8 }} onClick={() => go("items")}>
                All items
              </button>
            )}
          </div>
          {missing.length > 0 && (
            <div className="nl-card">
              <h2>Sources not yet ingested</h2>
              <div className="nl-soft nl-small" style={{ marginBottom: 6 }}>
                Stored items cite these. Ingest them to measure fidelity.
              </div>
              {missing.map(({ edge: e, citedBy }) => (
                <div key={e.id} className="nl-small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line2)" }}>
                  <div>{e.ref?.title || e.ref?.url || "Untitled reference"}</div>
                  <div className="nl-faint">
                    {e.ref?.publisher ? `${e.ref.publisher} · ` : ""}cited by{" "}
                    {citedBy.length === 1 ? <ItemLink id={e.to}>{titleOf(items.find((x) => x.id === e.to))}</ItemLink> : `${citedBy.length} items`}
                  </div>
                  {e.ref?.url ? <MissingIngest edge={e} /> : <div className="nl-faint">No link given. Find it and ingest it with a link.</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* One click to capture a cited source; the new item fills in the edge. */
export function MissingIngest({ edge }) {
  const { setError } = useLab();
  const [state, setState] = useState("idle");
  const run = async () => {
    setState("busy");
    try {
      await submitItem({ url: edge.ref.url, title: edge.ref.title, publisher: edge.ref.publisher, author: edge.ref.author, resolvesEdge: edge.id });
      setState("queued");
    } catch (e) {
      setError(explain(e));
      setState("idle");
    }
  };
  if (state === "queued") return <span className="nl-faint">Queued</span>;
  return (
    <button type="button" className="nl-btn small" style={{ marginTop: 4 }} disabled={state === "busy"} onClick={run}>
      Ingest this source
    </button>
  );
}
