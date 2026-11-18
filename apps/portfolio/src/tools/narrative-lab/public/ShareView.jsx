import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CSS from "../styles";
import { densityDisplay, fidelityTone, fmtDate, timelineLayout } from "../format";
import { ConfChip, Fid, LayerChip, PressureBars, Tile } from "../ui";

// ---------------------------------------------------------------------------
// A shared Narrative Lab link (/lab/<token>). Read-only and public: no sign
// in, no Firestore. Everything comes from one call to nlPublic, which decides
// what the link's scope covers and strips anything private. Turning the link
// off in Narrative Lab makes the next load show "turned off".
// ---------------------------------------------------------------------------

const PUBLIC_CSS = `
.nlp-wrap{max-width:1120px;margin:0 auto;padding:28px max(16px, env(safe-area-inset-right, 0px)) 90px max(16px, env(safe-area-inset-left, 0px));}
.nlp-brand{font-family:'Inter',sans-serif;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);}
.nlp-note{font-size:13.5px;color:var(--soft);max-width:760px;margin-top:8px;}
.nlp-fig{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;overflow-x:auto;margin:16px 0;}
.nlp-fig svg{display:block;min-width:720px;width:100%;height:auto;}
.nlp-fig text{font-family:'Inter',sans-serif;fill:var(--ink);font-size:12px;}
.nlp-fig .lane{fill:var(--line2);}
.nlp-fig .lanelab{fill:var(--faint);font-size:11px;font-weight:600;letter-spacing:.05em;}
.nlp-fig .tick{stroke:var(--line);stroke-dasharray:3 4;}
.nlp-fig .ticklab{fill:var(--faint);font-size:11px;}
.nlp-fig .link{stroke:var(--faint);stroke-width:1.3;fill:none;}
.nlp-fig .node{cursor:pointer;}
.nlp-fig .node circle{stroke-width:2;}
.nlp-fig .node.good circle{fill:var(--good-soft);stroke:var(--good);}
.nlp-fig .node.mid circle{fill:var(--mid-soft);stroke:var(--mid);}
.nlp-fig .node.low circle{fill:var(--low-soft);stroke:var(--low);}
.nlp-fig .node.root circle{fill:var(--accent-soft);stroke:var(--accent);}
.nlp-fig .node.none circle{fill:var(--card);stroke:var(--faint);}
.nlp-fig .node.sel circle{stroke-width:3.5;}
.nlp-fig .node:focus{outline:none;}
.nlp-fig .node:focus-visible circle{stroke:var(--ink);stroke-width:3.5;}
.nlp-fig .node .fid{font-size:10.5px;font-weight:700;}
.nlp-fig .node .lab{font-size:12px;}
.nlp-fig .node .sub{font-size:10.5px;fill:var(--faint);}
.nlp-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--soft);margin-top:6px;}
.nlp-legend i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px;border:2px solid;}
.nlp-list button{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--line2);padding:8px 2px;}
.nlp-list button.on{background:var(--accent-soft);}
.nlp-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
`;

const useNoIndex = () =>
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex, nofollow, noarchive";
    document.head.appendChild(tag);
    return () => document.head.removeChild(tag);
  }, []);

const readHash = () => {
  const h = (window.location.hash || "").replace(/^#/, "");
  return /^i-[A-Za-z0-9_-]+$/.test(h) ? h.slice(2) : null;
};

export default function ShareView() {
  useNoIndex();
  const { token } = useParams();
  const [state, setState] = useState({ status: "loading" });
  const [selected, setSelected] = useState(readHash());

  useEffect(() => {
    let live = true;
    fetch(`/api/narrative/share/${encodeURIComponent(token)}`, { headers: { accept: "application/json" } })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setState({ status: "error", code: r.status, message: body.error || "This link could not be opened." });
        else setState({ status: "ready", data: body });
      })
      .catch(() => live && setState({ status: "error", code: 0, message: "Couldn't reach the server. Check your connection and reload." }));
    return () => {
      live = false;
    };
  }, [token]);

  useEffect(() => {
    const on = () => setSelected(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const data = state.data;
  useEffect(() => {
    if (!data) return;
    const first = data.share.targetId || (data.items[0] && data.items[0].id);
    document.title = data.share.label || data.items.find((x) => x.id === first)?.title || "Narrative Lab";
    if (!selected && first) setSelected(first);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id) => {
    setSelected(id);
    try {
      window.history.replaceState(null, "", `#i-${id}`);
    } catch {
      window.location.hash = `i-${id}`;
    }
  };

  if (state.status !== "ready") {
    return (
      <div className="nl">
        <style>{CSS + PUBLIC_CSS}</style>
        <div className="nlp-wrap">
          <div className="nlp-brand">Narrative Lab</div>
          {state.status === "loading" ? (
            <p className="nl-soft" style={{ marginTop: 24 }}>Loading…</p>
          ) : (
            <div style={{ marginTop: 24, maxWidth: 560 }}>
              <h1 style={{ fontSize: 28 }}>{state.code === 410 ? "This link is turned off" : state.code === 404 ? "Link not found" : "Something went wrong"}</h1>
              <p className="nl-soft" style={{ marginTop: 8 }}>{state.message}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="nl">
      <style>{CSS + PUBLIC_CSS}</style>
      <Shared data={data} selected={selected} select={select} token={token} />
    </div>
  );
}

function Shared({ data, selected, select, token }) {
  const { share, items, edges, narratives, library } = data;
  const byId = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const root = share.targetId ? byId[share.targetId] : null;
  const item = byId[selected] && !byId[selected].neighborOnly ? byId[selected] : root && !root.neighborOnly ? root : items.find((x) => !x.neighborOnly);
  const title = share.label || (root ? root.title : "Narrative Lab");
  const scopeLine =
    share.scope === "cascade"
      ? `How one source traveled: ${items.length - 1} derivative${items.length === 2 ? "" : "s"} of ${root ? `"${root.title}"` : "a primary source"}.`
      : share.scope === "item"
      ? "One item, read on five layers, with what it changed about its sources."
      : `${items.length} items in this knowledge base.`;

  return (
    <div className="nlp-wrap">
      <div className="nlp-brand">Narrative Lab · shared view</div>
      <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", marginTop: 6, textWrap: "balance" }}>{title}</h1>
      <div className="nl-sub">{scopeLine}</div>
      <p className="nlp-note">
        This page describes techniques and how each piece changed what it drew on. It does not judge anyone's intent, and the same techniques show up in
        every kind of outlet. Quotes are short excerpts; follow the links to read each piece in full.
      </p>

      {share.scope !== "item" && items.length > 1 && <Timeline items={items} edges={edges} selected={item && item.id} select={select} rootId={share.targetId} />}

      <div className="nl-two" style={{ marginTop: 8 }}>
        <div style={{ minWidth: 0 }}>{item ? <ItemPanel item={item} edges={edges} byId={byId} library={library} narratives={narratives} select={select} /> : <div className="nl-card">Nothing has been scored here yet.</div>}</div>
        <div style={{ minWidth: 0 }}>
          {share.scope !== "item" && (
            <div className="nl-card nlp-list">
              <h2>Items</h2>
              {[...items]
                .filter((x) => !x.neighborOnly)
                .sort((a, b) => (a.hop ?? 0) - (b.hop ?? 0) || String(a.publishedAt).localeCompare(String(b.publishedAt)))
                .map((x) => (
                  <button key={x.id} type="button" className={item && x.id === item.id ? "on" : ""} onClick={() => select(x.id)}>
                    <div style={{ fontWeight: 600 }}>{x.title}</div>
                    <div className="nl-faint nl-small">
                      {[x.source, fmtDate(x.publishedAt), typeof x.hop === "number" ? `hop ${x.hop}` : null].filter(Boolean).join(" · ")}
                      {typeof x.scores?.fidelity === "number" && (
                        <>
                          {" · fidelity "}
                          <Fid n={x.scores.fidelity} />
                        </>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          )}
          {share.allowSuggestions && <SuggestForm token={token} />}
          <HowToRead library={library} />
        </div>
      </div>
      <footer className="nl-faint nl-small" style={{ marginTop: 40 }}>
        Narrative Lab, library {library?.version}. Shared by its owner; the link can be turned off at any time.
      </footer>
    </div>
  );
}

/* Time left to right, hop depth top to bottom, color by fidelity. */
function Timeline({ items, edges, selected, select, rootId }) {
  const L = useMemo(() => timelineLayout(items), [items]);
  const fmtTick = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const short = (s, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return (
    <figure style={{ margin: 0 }}>
      <div className="nlp-fig">
        <svg viewBox={`0 0 ${L.width} ${L.height}`} role="img" aria-label="Timeline of the items: time runs left to right, hops from the primary source run downward, and color shows how faithfully each item carried its source.">
          {L.lanes.map((ln) => (
            <g key={ln.hop}>
              <rect className="lane" x="8" y={ln.y} width={L.width - 16} height={ln.h} rx="8" opacity="0.6" />
              <text className="lanelab" x="18" y={ln.y + 18}>
                {ln.hop === 0 ? "SOURCE" : `HOP ${ln.hop}`}
              </text>
            </g>
          ))}
          {L.ticks.map((t, i) => (
            <g key={i}>
              <line className="tick" x1={t.x} x2={t.x} y1="22" y2={L.height - 26} />
              <text className="ticklab" x={t.x} y={L.height - 10} textAnchor="middle">
                {fmtTick(t.t)}
              </text>
            </g>
          ))}
          {edges.map((e) => {
            const a = L.nodes[e.from];
            const b = L.nodes[e.to];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            return <path key={e.id} className="link" d={`M${a.x} ${a.y} C${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`} />;
          })}
          {items.map((it) => {
            const p = L.nodes[it.id];
            if (!p) return null;
            const f = it.scores?.fidelity;
            const tone = it.id === rootId || (it.hop === 0 && typeof f !== "number") ? "root" : fidelityTone(f) || "none";
            // Labels near the right edge sit to the left of their dot.
            const flip = p.x > L.width * 0.7;
            const lx = flip ? -18 : 18;
            const anchor = flip ? "end" : "start";
            return (
              <g
                key={it.id}
                className={`node ${tone} ${it.id === selected ? "sel" : ""}`}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => !it.neighborOnly && select(it.id)}
                tabIndex={0}
                role="button"
                aria-label={`${it.title}${typeof f === "number" ? `, fidelity ${f}` : ""}`}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && !it.neighborOnly && select(it.id)}
              >
                <circle r="12" />
                <text className="fid" textAnchor="middle" y="4">
                  {typeof f === "number" ? f : ""}
                </text>
                <text className="lab" x={lx} y="-1" textAnchor={anchor}>
                  {short(it.title)}
                </text>
                <text className="sub" x={lx} y="13" textAnchor={anchor}>
                  {short(it.source || it.outlet || "", 26)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="nlp-legend">
        <span><i style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }} />Primary source</span>
        <span><i style={{ background: "var(--good-soft)", borderColor: "var(--good)" }} />Fidelity 80 or more</span>
        <span><i style={{ background: "var(--mid-soft)", borderColor: "var(--mid)" }} />50 to 79</span>
        <span><i style={{ background: "var(--low-soft)", borderColor: "var(--low)" }} />Under 50</span>
        {L.undated > 0 && <span>{L.undated} undated item{L.undated === 1 ? "" : "s"} at the right edge</span>}
      </div>
    </figure>
  );
}

function ItemPanel({ item, edges, byId, library, narratives, select }) {
  const tech = Object.fromEntries((library?.techniques || []).map((t) => [t.id, t]));
  const bend = Object.fromEntries((library?.maneuvers || []).map((t) => [t.id, t]));
  const trans = Object.fromEntries((library?.transformations || []).map((t) => [t.id, t]));
  const into = edges.filter((e) => e.to === item.id);
  const d = densityDisplay(item.scores);
  const narr = Object.fromEntries((narratives || []).map((n) => [n.id, n]));
  const nameOf = (f) => (f.layer === 4 ? `BEND ${bend[f.maneuverId]?.name || f.maneuverId}` : tech[f.techniqueId]?.name || f.techniqueId);
  return (
    <div className="nl-card" style={{ marginTop: 0 }}>
      <h2 style={{ fontSize: 22 }}>{item.title}</h2>
      <div className="nl-soft nl-small nl-row" style={{ marginBottom: 12 }}>
        {[item.source, item.outlet !== item.source ? item.outlet : null, fmtDate(item.publishedAt)].filter(Boolean).join(" · ")}
        {item.genre && <span className="nl-chip">{item.genre}</span>}
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer noopener">
            Read the original
          </a>
        )}
      </div>
      {item.summary && <p className="nl-soft" style={{ marginTop: 0 }}>{item.summary}</p>}
      <div className="nl-tiles" style={{ margin: "12px 0" }}>
        <Tile k="Technique density" v={d.big} unit={d.unit} note={d.note} />
        <Tile
          k="Fidelity"
          v={typeof item.scores?.fidelity === "number" ? item.scores.fidelity : "–"}
          unit={typeof item.scores?.fidelity === "number" ? "/100" : ""}
          tone={fidelityTone(item.scores?.fidelity)}
          note={typeof item.scores?.fidelity === "number" ? "How faithfully it carries its source" : "No stored source to compare"}
        />
        <Tile
          k="Direction"
          v={item.direction?.value ? item.direction.value[0].toUpperCase() + item.direction.value.slice(1) : "–"}
          note={item.direction?.value === "closing" ? "Closes options" : item.direction?.value === "opening" ? "Opens options" : ""}
          tone={item.direction?.value === "closing" ? "low" : item.direction?.value === "opening" ? "good" : ""}
        />
      </div>

      {into.length > 0 && (
        <>
          <h3>What it changed about its source</h3>
          {into.map((e) => (
            <div key={e.id} style={{ marginBottom: 12 }}>
              <div className="nl-small nl-soft">
                {e.relation} {byId[e.from] && !byId[e.from].neighborOnly ? (
                  <button type="button" className="nl-link" onClick={() => select(e.from)}>
                    {byId[e.from].title}
                  </button>
                ) : (
                  <strong>{byId[e.from]?.title || "a source"}</strong>
                )}
                {typeof e.lagHours === "number" && ` · ${e.lagHours}h later`}
                {typeof e.fidelity === "number" && (
                  <>
                    {" · fidelity "}
                    <Fid n={e.fidelity} />
                  </>
                )}
              </div>
              {e.summary && <p style={{ margin: "4px 0 6px" }}>{e.summary}</p>}
              <div className="nl-row" style={{ marginBottom: 6 }}>
                {e.transformations.map((t, i) => {
                  const def = trans[t.id] || {};
                  const tone = def.direction === "improves" ? "good" : def.direction === "neutral" ? "" : t.severity >= 3 ? "low" : "mid";
                  return (
                    <span key={i} className={`nl-chip ${tone}`} title={def.definition}>
                      {t.id} {def.name}
                    </span>
                  );
                })}
              </div>
              {e.carried
                .filter((x) => x.status !== "faithful")
                .map((x, i) => (
                  <div key={i} className="nl-compare" style={{ marginBottom: 6 }}>
                    <div>
                      <span className="lab">This piece ({x.status})</span>
                      {x.derivativeQuote || "–"}
                    </div>
                    <div>
                      <span className="lab">The source</span>
                      {x.sourceQuote || <em className="nl-faint">Not in the source</em>}
                    </div>
                  </div>
                ))}
              {e.dropped.length > 0 && (
                <div className="nl-small" style={{ marginTop: 4 }}>
                  <strong>Left out:</strong> {e.dropped.map((x) => `"${x.sourceQuote}"`).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {item.pressure && (
        <>
          <h3>Pressure profile</h3>
          <div className="nl-faint nl-small" style={{ marginBottom: 6 }}>
            Which shared structure the piece leans on, 0 to 3. The most speculative reading; check the findings it rests on.
          </div>
          <PressureBars pressure={item.pressure} library={library} />
        </>
      )}

      {(item.findings.length > 0 || item.maneuvers.length > 0) && (
        <>
          <h3>Findings</h3>
          {[...item.findings, ...item.maneuvers].map((f) => (
            <div key={f.id} className={`nl-finding l${f.layer}`} style={{ cursor: "default" }}>
              <div className="nl-row">
                <LayerChip layer={f.layer} />
                <strong>{nameOf(f)}</strong>
                <ConfChip c={f.confidence} />
              </div>
              <blockquote>{f.quote}</blockquote>
              <div className="nl-small nl-soft">{f.explanation}</div>
            </div>
          ))}
        </>
      )}

      {item.questions.length > 0 && (
        <>
          <h3>Questions worth asking</h3>
          {item.questions.map((q, i) => (
            <div key={i} style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: 16.5, padding: "4px 0" }}>
              {q.question}
            </div>
          ))}
        </>
      )}

      {item.narratives.length > 0 && (
        <>
          <h3>Narratives</h3>
          {item.narratives.map((n) => (
            <div key={n.id} className="nl-small" style={{ padding: "3px 0" }}>
              <strong>{n.name}</strong> <span className="nl-chip">{n.role}</span>
              {narr[n.id]?.summary && <div className="nl-soft">{narr[n.id].summary}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function HowToRead({ library }) {
  return (
    <div className="nl-card">
      <h2>How to read this</h2>
      <dl className="nl-lib nl-small" style={{ margin: 0 }}>
        <dt>Technique density</dt>
        <dd>Reasoning errors and persuasion techniques per 1,000 words, weighted by confidence. Each one is tied to a quoted passage.</dd>
        <dt>Fidelity</dt>
        <dd>How faithfully a piece carries the claims of the source it draws on, 0 to 100. Dropped caveats and distortions lower it; added context does not.</dd>
        <dt>Pressure profile</dt>
        <dd>
          Which of five shared structures the piece leans on: {(library?.invariants || []).map((i) => i.name.toLowerCase()).join(", ")}. A score above 1 must rest on quoted findings.
        </dd>
        <dt>Direction</dt>
        <dd>Whether a piece closes options ("nothing can be done") or opens them ("here is what to check").</dd>
      </dl>
    </div>
  );
}

function SuggestForm({ token }) {
  const blank = { url: "", text: "", title: "", author: "", publisher: "", note: "", name: "", contact: "", website: "" };
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState("link");
  const [status, setStatus] = useState({ state: "idle" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = mode === "link" ? /^https?:\/\/\S+\.\S+/.test(form.url.trim()) : form.text.trim().length >= 40;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || status.state === "sending") return;
    setStatus({ state: "sending" });
    try {
      const body = { ...form, ...(mode === "link" ? { text: "" } : {}) };
      const r = await fetch(`/api/narrative/share/${encodeURIComponent(token)}/suggest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) setStatus({ state: "error", message: out.error || "That didn't go through. Try again." });
      else {
        setStatus({ state: "sent" });
        setForm(blank);
      }
    } catch {
      setStatus({ state: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  };
  return (
    <form className="nl-card" onSubmit={submit}>
      <h2>Suggest something</h2>
      <div className="nl-soft nl-small" style={{ marginBottom: 10 }}>
        Know a piece that belongs here, such as the original source or another take on it? Send it in. The owner reviews every suggestion before anything is added.
      </div>
      <div className="nl-tabs" style={{ marginBottom: 10 }}>
        <button type="button" className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>
          Link
        </button>
        <button type="button" className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>
          Paste text
        </button>
      </div>
      {mode === "link" ? (
        <label className="nl-field">
          <span>Link</span>
          <input id="sg-url" type="url" placeholder="https://" value={form.url} onChange={set("url")} />
        </label>
      ) : (
        <label className="nl-field">
          <span>Text</span>
          <textarea id="sg-text" value={form.text} onChange={set("text")} placeholder="A post, transcript, or article" />
        </label>
      )}
      <div className="nl-fields">
        <label className="nl-field">
          <span>Title (optional)</span>
          <input id="sg-title" value={form.title} onChange={set("title")} />
        </label>
        <label className="nl-field">
          <span>Author (optional)</span>
          <input id="sg-author" value={form.author} onChange={set("author")} />
        </label>
      </div>
      <label className="nl-field">
        <span>Why it belongs here (optional)</span>
        <textarea id="sg-note" value={form.note} onChange={set("note")} style={{ minHeight: 60 }} />
      </label>
      <div className="nl-fields">
        <label className="nl-field">
          <span>Your name (optional)</span>
          <input id="sg-name" value={form.name} onChange={set("name")} />
        </label>
        <label className="nl-field">
          <span>How to reach you (optional)</span>
          <input id="sg-contact" value={form.contact} onChange={set("contact")} />
        </label>
      </div>
      <label className="nlp-hp" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </label>
      <div className="nl-between">
        <span className="nl-small" role="status">
          {status.state === "sent" && <span style={{ color: "var(--good)" }}>Sent. Thanks.</span>}
          {status.state === "error" && <span style={{ color: "var(--low)" }}>{status.message}</span>}
        </span>
        <button type="submit" className="nl-btn primary" disabled={!ready || status.state === "sending"}>
          {status.state === "sending" ? "Sending…" : "Send suggestion"}
        </button>
      </div>
    </form>
  );
}
