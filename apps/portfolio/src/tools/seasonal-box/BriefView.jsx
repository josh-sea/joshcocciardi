import React from "react";
import { usd } from "./pipeline";
import { StoredImage } from "./ui";

// Renders a brief's structured content. Known types get a purpose-built view
// (the Trend Brief is a vision board, the Scout Report is its three parts);
// anything else falls back to a generic renderer that turns objects into
// key/value grids and arrays of records into tables, so a new brief type is
// readable on day one.

const isPlain = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const titleCase = (k) => String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const fmt = (k, v) => {
  if (v === null || v === undefined || v === "") return <span className="sb-faint">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && /usd|cost|price|total|amount/i.test(k)) return usd(v);
  if (typeof v === "string" && /^https?:\/\//.test(v)) {
    return (
      <a href={v} target="_blank" rel="noreferrer noopener">
        {v.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
      </a>
    );
  }
  return String(v);
};

export const Generic = ({ value, depth = 0 }) => {
  if (isPlain(value)) return <span className="sb-pre">{fmt("", value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="sb-faint">None</span>;
    if (value.every(isPlain)) {
      return value.every((v) => String(v).length < 60) ? (
        <div className="sb-taglist">
          {value.map((v, i) => (
            <span className="sb-chip" key={i}>
              {String(v)}
            </span>
          ))}
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {value.map((v, i) => (
            <li key={i} className="sb-pre">
              {String(v)}
            </li>
          ))}
        </ul>
      );
    }
    const objs = value.filter((v) => v && typeof v === "object" && !Array.isArray(v));
    const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))];
    const flat = objs.every((o) => Object.values(o).every((v) => isPlain(v) || (Array.isArray(v) && v.every(isPlain))));
    if (flat && keys.length <= 7) {
      return (
        <div className="sb-tablewrap">
          <table className="sb-table">
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k}>{titleCase(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {objs.map((o, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k} className={typeof o[k] === "number" ? "num" : ""}>
                      {Array.isArray(o[k]) ? o[k].join(", ") : fmt(k, o[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <div className="sb-stack">
        {objs.map((o, i) => (
          <div key={i} className="sb-card tight" style={{ marginBottom: 0, background: "#fff" }}>
            <Generic value={o} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="sb-kv">
      {Object.entries(value).map(([k, v]) => (
        <React.Fragment key={k}>
          <div>{titleCase(k)}</div>
          <div style={{ minWidth: 0 }}>{isPlain(v) ? fmt(k, v) : <Generic value={v} depth={depth + 1} />}</div>
        </React.Fragment>
      ))}
    </div>
  );
};

const Section = ({ label, children }) => (
  <div className="sb-section">
    <div className="sb-label">{label}</div>
    {children}
  </div>
);

// ── Trend Brief: the vision board ───────────────────────────────────────────

const Strength = ({ s }) => <span className={`sb-chip ${s === "high" ? "green" : s === "medium" ? "yellow" : ""}`}>{s || "?"} signal</span>;

/* Whether a swatch is pale enough that its hex label needs dark text. */
const isLight = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
};

const ThemeCard = ({ theme, index, picked, onToggle }) => {
  const palette = Array.isArray(theme.palette) ? theme.palette : [];
  const moods = (Array.isArray(theme.moodImages) ? theme.moodImages : []).slice(0, 3);
  return (
    <div className={`sb-theme ${picked ? "picked" : ""}`}>
      {palette.length > 0 && (
        <div className="sb-swatches">
          {palette.map((p, i) => (
            <div key={i} className={isLight(p.hex) ? "light" : ""} style={{ background: /^#[0-9a-f]{3,8}$/i.test(p.hex || "") ? p.hex : "#ccc" }} title={p.name}>
              <span>{p.hex}</span>
            </div>
          ))}
        </div>
      )}
      {moods.length > 0 && (
        <div className="sb-moods">
          {moods.map((m, i) => (
            <a key={i} href={m.sourceUrl || undefined} target="_blank" rel="noreferrer noopener" title={m.caption}>
              <StoredImage path={m.storagePath || m.url} alt={m.caption} />
            </a>
          ))}
        </div>
      )}
      <div className="sb-theme-body">
        <div className="sb-between">
          <h3>{theme.name}</h3>
          <Strength s={theme.signalStrength} />
        </div>
        <p className="sb-muted" style={{ margin: "4px 0 8px" }}>
          {theme.story}
        </p>
        {theme.scentNotes?.length > 0 && (
          <div className="sb-small">
            <b>Scent:</b> {theme.scentNotes.join(", ")}
          </div>
        )}
        {theme.categoriesByKit && (
          <div className="sb-small" style={{ marginTop: 6 }}>
            {Object.entries(theme.categoriesByKit).map(([kit, cats]) => (
              <div key={kit}>
                <b>{titleCase(kit)}:</b> {Array.isArray(cats) ? cats.join(", ") : String(cats)}
              </div>
            ))}
          </div>
        )}
        {theme.evidence?.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="sb-small sb-muted">Evidence ({theme.evidence.length})</summary>
            <ul className="sb-small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {theme.evidence.map((e, i) => (
                <li key={i}>
                  {e.signal} <span className="sb-faint">({e.strength})</span>{" "}
                  {e.source && /^https?:/.test(e.source) ? (
                    <a href={e.source} target="_blank" rel="noreferrer noopener">
                      source
                    </a>
                  ) : (
                    e.source
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {theme.risks?.length > 0 && (
          <div className="sb-small" style={{ marginTop: 6, color: "var(--clay)" }}>
            Risks: {theme.risks.join("; ")}
          </div>
        )}
        {onToggle && (
          <label className="sb-check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={!!picked} onChange={() => onToggle(index)} /> Use this theme
          </label>
        )}
      </div>
    </div>
  );
};

const TrendBrief = ({ c, selection, onSelect }) => {
  const themes = Array.isArray(c.themes) ? c.themes : [];
  const toggle = onSelect
    ? (i) => {
        const cur = new Set(selection || []);
        cur.has(i) ? cur.delete(i) : cur.add(i);
        onSelect([...cur].sort((a, b) => a - b));
      }
    : null;
  return (
    <div>
      {onSelect && <div className="sb-small sb-muted" style={{ marginBottom: 8 }}>Pick the themes to carry forward. None picked means all of them.</div>}
      <div className="sb-themes">
        {themes.map((t, i) => (
          <ThemeCard key={i} theme={t} index={i} picked={(selection || []).includes(i)} onToggle={toggle} />
        ))}
      </div>
      {c.recommendation && (
        <Section label="Recommendation">
          <div className="sb-pre">{c.recommendation}</div>
        </Section>
      )}
    </div>
  );
};

// ── Scout Report: given / found / recommendation ────────────────────────────

const ScoutReport = ({ c, selection, onSelect }) => {
  const found = Array.isArray(c.found) ? c.found : [];
  const slots = c.recommendation?.slots || [];
  const recommended = new Set(slots.flatMap((s) => [s.best, s.backup]).filter(Boolean));
  const sel = new Set(selection && selection.length ? selection : [...recommended]);
  const toggle = (name) => {
    const next = new Set(sel);
    next.has(name) ? next.delete(name) : next.add(name);
    onSelect([...next]);
  };
  return (
    <div>
      <Section label="1 · What I was given">
        {c.given?.themes && <div className="sb-small">Themes: {c.given.themes.join(", ")}</div>}
        {c.given?.slots && <Generic value={c.given.slots} />}
      </Section>
      <Section label={`2 · What I found (${found.length} makers)`}>
        <div className="sb-stack">
          {found.map((m, i) => {
            const name = m.makerName || m.name;
            return (
              <div key={i} className="sb-card tight" style={{ marginBottom: 0, background: "#fff" }}>
                <div className="sb-between">
                  <div>
                    <b>{name}</b>{" "}
                    <span className="sb-muted sb-small">
                      {m.location}
                      {m.distanceMiles != null ? ` · ${m.distanceMiles} mi` : ""}
                    </span>
                  </div>
                  {onSelect && (
                    <label className="sb-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={sel.has(name)} onChange={() => toggle(name)} /> Shortlist
                    </label>
                  )}
                </div>
                <div className="sb-small sb-muted" style={{ marginTop: 4 }}>
                  {[m.capacity && `Capacity: ${m.capacity}`, m.leadTime && `Lead time: ${m.leadTime}`, m.contact?.value && `Contact: ${m.contact.method} ${m.contact.value}`]
                    .filter(Boolean)
                    .join(" · ")}
                  {m.website && (
                    <>
                      {" · "}
                      <a href={m.website} target="_blank" rel="noreferrer noopener">
                        site
                      </a>
                    </>
                  )}
                </div>
                {Array.isArray(m.products) && m.products.length > 0 && (
                  <div className="sb-taglist">
                    {m.products.map((p, j) => (
                      <span className="sb-chip" key={j}>
                        {p.name}
                        {p.price != null ? ` · ${usd(p.price)}${p.priceIsEstimate ? " est." : ""}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {m.fitScores && (
                  <div className="sb-small sb-faint" style={{ marginTop: 4 }}>
                    Fit: {Object.entries(m.fitScores).map(([k, v]) => `${k} ${v}/10`).join(", ")}
                  </div>
                )}
                {m.notes && <div className="sb-small" style={{ marginTop: 4 }}>{m.notes}</div>}
              </div>
            );
          })}
        </div>
      </Section>
      <Section label="3 · My recommendation">
        {slots.length > 0 && <Generic value={slots} />}
        {c.recommendation?.gaps?.length > 0 && (
          <div className="sb-small" style={{ marginTop: 8, color: "var(--clay)" }}>
            Gaps: {c.recommendation.gaps.join("; ")}
          </div>
        )}
        {c.recommendation?.notes && <div className="sb-pre sb-small" style={{ marginTop: 6 }}>{c.recommendation.notes}</div>}
      </Section>
    </div>
  );
};

// ── Box Plan ────────────────────────────────────────────────────────────────

const BoxPlan = ({ c }) => (
  <div>
    {c.theme && <div className="sb-muted">Theme: {c.theme}</div>}
    <div className="sb-cols3" style={{ marginTop: 10 }}>
      {(c.kits || []).map((k, i) => (
        <div key={i} className="sb-card tight" style={{ marginBottom: 0, background: "#fff" }}>
          <div className="sb-between">
            <b>{titleCase(k.type)} kit</b>
            <span className="sb-chip pine">{usd(k.unitCost)}</span>
          </div>
          <ul className="sb-small" style={{ margin: "6px 0", paddingLeft: 18 }}>
            {(k.contents || []).map((x, j) => (
              <li key={j}>
                {x.qty > 1 ? `${x.qty}× ` : ""}
                {x.productName} <span className="sb-faint">({x.makerName}, {usd(x.unitCost)}{x.costIsEstimate ? " est." : ""})</span>
              </li>
            ))}
          </ul>
          {k.flatLay && <div className="sb-small sb-muted">{k.flatLay}</div>}
        </div>
      ))}
    </div>
    {c.tiers && (
      <Section label="Tiers">
        <div className="sb-tablewrap">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th className="num">Kits</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {c.tiers.map((t, i) => (
                <tr key={i}>
                  <td>{t.name}</td>
                  <td className="num">{t.kits}</td>
                  <td className="num">{usd(t.cost)}</td>
                  <td className="num">
                    {usd(t.price)}
                    {t.priceIsProposed ? " *" : ""}
                  </td>
                  <td className="num">{t.marginPct != null ? `${Math.round(t.marginPct)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {c.tiers.some((t) => t.priceIsProposed) && <div className="sb-small sb-faint">* proposed price, not yet set in Settings</div>}
      </Section>
    )}
    {c.makerSpotlights?.length > 0 && (
      <Section label="Maker spotlights">
        <div className="sb-cols2">
          {c.makerSpotlights.map((m, i) => (
            <div key={i} className="sb-small">
              <b>{m.makerName}</b>
              <div className="sb-pre">{m.copy}</div>
            </div>
          ))}
        </div>
      </Section>
    )}
    {c.insertCard && (
      <Section label="Insert card">
        <div className="sb-pre" style={{ fontFamily: "Fraunces, serif", fontSize: 15 }}>{c.insertCard}</div>
      </Section>
    )}
    {c.risks?.length > 0 && (
      <Section label="Risks">
        <Generic value={c.risks} />
      </Section>
    )}
  </div>
);

// ── Daily Briefing ──────────────────────────────────────────────────────────

const DailyBriefing = ({ c }) => (
  <div>
    {c.headline && <div style={{ fontFamily: "Fraunces, serif", fontSize: 17 }}>{c.headline}</div>}
    {c.needsJosh?.length > 0 && (
      <Section label="Needs you">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {c.needsJosh.map((n, i) => (
            <li key={i}>
              <b>{n.item}</b> {n.why && <span className="sb-muted">· {n.why}</span>} {n.deadline && <span className="sb-chip yellow">by {n.deadline}</span>}
            </li>
          ))}
        </ul>
      </Section>
    )}
    {c.deadlines?.length > 0 && (
      <Section label="Deadlines">
        <Generic value={c.deadlines} />
      </Section>
    )}
    {c.risks?.length > 0 && (
      <Section label="Risks">
        <Generic value={c.risks} />
      </Section>
    )}
    {c.changes?.length > 0 && (
      <Section label="Since last time">
        <Generic value={c.changes} />
      </Section>
    )}
    {c.spend && <div className="sb-small sb-muted" style={{ marginTop: 10 }}>AI spend this month: {usd(c.spend.aiThisMonthUsd)} {c.spend.note ? `· ${c.spend.note}` : ""}</div>}
  </div>
);

const VIEWS = { trend: TrendBrief, scout: ScoutReport, boxPlan: BoxPlan, dailyBriefing: DailyBriefing };

/* A brief that doesn't match its schema (a model is not a type checker) must
   still be readable, so a purpose-built view that throws falls back to the
   generic renderer instead of taking the page down. */
class Fallback extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Generic value={this.props.content} /> : this.props.children;
  }
}

/* `selection`/`onSelect` turn on the picking UI for brief types that support
   it (themes on a Trend Brief, makers on a Scout Report). */
export default function BriefView({ type, content, selection, onSelect }) {
  if (!content || typeof content !== "object") return <div className="sb-faint">This brief has no content.</div>;
  const View = VIEWS[type];
  if (!View) return <Generic value={content} />;
  return (
    <Fallback content={content}>
      <View c={content} selection={selection} onSelect={onSelect} />
    </Fallback>
  );
}

export const SELECTABLE = new Set(["trend", "scout"]);
