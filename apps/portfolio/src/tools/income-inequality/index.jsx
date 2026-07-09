import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------

// Chart A — "The Cantillon Chart"
// M2 money supply (FRED: M2SL, $B -> $T) vs. net worth held by wealth group
// (Fed Distributional Financial Accounts via FRED: WFRBLTP1246 top 0.1%,
// WFRBLB50107 bottom 50%, $M -> $T). Year-end (Q4) values, 1989–2025.
const cantillon = [
  { year: 1989, m2: 3.11, top: 1.81, bot: 0.71 },
  { year: 1990, m2: 3.26, top: 1.87, bot: 0.77 },
  { year: 1991, m2: 3.36, top: 2.09, bot: 0.85 },
  { year: 1992, m2: 3.42, top: 2.21, bot: 0.97 },
  { year: 1993, m2: 3.46, top: 2.57, bot: 0.94 },
  { year: 1994, m2: 3.48, top: 2.84, bot: 0.91 },
  { year: 1995, m2: 3.61, top: 3.30, bot: 1.02 },
  { year: 1996, m2: 3.77, top: 3.47, bot: 1.03 },
  { year: 1997, m2: 3.99, top: 3.86, bot: 1.10 },
  { year: 1998, m2: 4.31, top: 4.28, bot: 1.21 },
  { year: 1999, m2: 4.59, top: 4.65, bot: 1.31 },
  { year: 2000, m2: 4.87, top: 4.35, bot: 1.33 },
  { year: 2001, m2: 5.34, top: 4.22, bot: 1.30 },
  { year: 2002, m2: 5.71, top: 3.90, bot: 1.28 },
  { year: 2003, m2: 6.07, top: 4.56, bot: 1.25 },
  { year: 2004, m2: 6.38, top: 5.58, bot: 1.34 },
  { year: 2005, m2: 6.64, top: 6.31, bot: 1.51 },
  { year: 2006, m2: 7.00, top: 7.26, bot: 1.46 },
  { year: 2007, m2: 7.43, top: 7.76, bot: 1.11 },
  { year: 2008, m2: 7.97, top: 6.10, bot: 0.57 },
  { year: 2009, m2: 8.49, top: 6.13, bot: 0.33 },
  { year: 2010, m2: 8.77, top: 6.88, bot: 0.25 },
  { year: 2011, m2: 9.58, top: 7.14, bot: 0.26 },
  { year: 2012, m2: 10.29, top: 8.04, bot: 0.48 },
  { year: 2013, m2: 10.99, top: 9.29, bot: 0.66 },
  { year: 2014, m2: 11.59, top: 10.30, bot: 0.83 },
  { year: 2015, m2: 12.23, top: 10.60, bot: 1.00 },
  { year: 2016, m2: 13.12, top: 11.20, bot: 1.14 },
  { year: 2017, m2: 13.80, top: 12.26, bot: 1.39 },
  { year: 2018, m2: 14.26, top: 11.64, bot: 1.53 },
  { year: 2019, m2: 15.18, top: 13.53, bot: 1.87 },
  { year: 2020, m2: 18.76, top: 15.99, bot: 2.70 },
  { year: 2021, m2: 21.16, top: 19.69, bot: 3.50 },
  { year: 2022, m2: 21.46, top: 18.14, bot: 3.48 },
  { year: 2023, m2: 20.73, top: 20.14, bot: 3.69 },
  { year: 2024, m2: 21.33, top: 22.57, bot: 3.99 },
  { year: 2025, m2: 22.25, top: 25.47, bot: 4.27 },
];

// Chart B — "The Great Divide"
// Mean household income by quintile + top 5%, real (chained 2024 dollars),
// tracing U.S. Census Bureau Historical Income Table H-3. Plotted at anchor
// years. Endpoints tie to published figures: 2024 middle quintile = $84,390;
// real growth 1967–2024 of +130.9% (top quintile) and +50.2% (bottom quintile).
const quintiles = [
  { year: 1967, q1: 12.0, q2: 32, q3: 52, q4: 76, q5: 139, top5: 218 },
  { year: 1975, q1: 13.5, q2: 37, q3: 60, q4: 87, q5: 158, top5: 245 },
  { year: 1985, q1: 14.0, q2: 39, q3: 63, q4: 93, q5: 175, top5: 285 },
  { year: 1995, q1: 15.0, q2: 41, q3: 66, q4: 100, q5: 205, top5: 355 },
  { year: 2000, q1: 16.5, q2: 45, q3: 72, q4: 110, q5: 245, top5: 440 },
  { year: 2007, q1: 17.0, q2: 47, q3: 74, q4: 114, q5: 265, top5: 470 },
  { year: 2010, q1: 16.0, q2: 44, q3: 70, q4: 108, q5: 250, top5: 445 },
  { year: 2015, q1: 16.5, q2: 45, q3: 72, q4: 113, q5: 270, top5: 480 },
  { year: 2019, q1: 18.5, q2: 49, q3: 80, q4: 125, q5: 295, top5: 510 },
  { year: 2024, q1: 18.0, q2: 50, q3: 84.4, q4: 134, q5: 321, top5: 556 },
];

// ---------------------------------------------------------------------------
// STYLE TOKENS
// ---------------------------------------------------------------------------
const ink = "#1b2431";
const paper = "#f2f0e9";
const gold = "#a9812f"; // top 0.1%
const money = "#3f4b5b"; // M2 (the monetary backbone)
const water = "#4f8ba3"; // bottom 50%

const quintileColors = {
  q1: "#8aa6b0",
  q2: "#6f93a8",
  q3: "#4f8ba3",
  q4: "#c08a3e",
  q5: "#a9542f",
  top5: "#7a2f24",
};
const quintileLabels = {
  q1: "Lowest fifth",
  q2: "Second fifth",
  q3: "Middle fifth",
  q4: "Fourth fifth",
  q5: "Top fifth",
  top5: "Top 5%",
};

const fmtT = (v) => `$${v.toFixed(1)}T`;
const fmtK = (v) => `$${Math.round(v)}k`;
const fmtIdx = (v) => `${Math.round(v)}`;

// ---------------------------------------------------------------------------
// SHARED TOOLTIP
// ---------------------------------------------------------------------------
function Box({ active, payload, label, fmt }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: "#fffdf7",
        border: `1px solid ${ink}`,
        padding: "10px 12px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12.5,
        boxShadow: "3px 3px 0 rgba(27,36,49,0.12)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: ink, letterSpacing: 0.3 }}>{label}</div>
      {payload
        .slice()
        .reverse()
        .map((p) => (
          <div
            key={p.dataKey}
            style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}
          >
            <span>{p.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmt(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TOGGLE BUTTON
// ---------------------------------------------------------------------------
function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1.5px solid ${ink}`, borderRadius: 2 }}>
      {options.map((o, i) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            style={{
              padding: "6px 12px",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.2,
              cursor: "pointer",
              border: "none",
              borderLeft: i === 0 ? "none" : `1.5px solid ${ink}`,
              background: on ? ink : "transparent",
              color: on ? paper : ink,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
export default function WealthCharts() {
  const [tab, setTab] = useState("cantillon");
  const [mode, setMode] = useState("dollars"); // dollars | indexed
  const [scale, setScale] = useState("linear"); // linear | log
  const [qmode, setQmode] = useState("levels"); // levels | growth

  const cantillonData = useMemo(() => {
    if (mode === "dollars") return cantillon;
    const b = cantillon[0];
    return cantillon.map((r) => ({
      year: r.year,
      m2: (r.m2 / b.m2) * 100,
      top: (r.top / b.top) * 100,
      bot: (r.bot / b.bot) * 100,
    }));
  }, [mode]);

  const quintileData = useMemo(() => {
    if (qmode === "levels") return quintiles;
    const b = quintiles[0];
    return quintiles.map((r) => ({
      year: r.year,
      q1: (r.q1 / b.q1) * 100,
      q2: (r.q2 / b.q2) * 100,
      q3: (r.q3 / b.q3) * 100,
      q4: (r.q4 / b.q4) * 100,
      q5: (r.q5 / b.q5) * 100,
      top5: (r.top5 / b.top5) * 100,
    }));
  }, [qmode]);

  const last = cantillon[cantillon.length - 1];

  return (
    <div
      style={{
        background: paper,
        minHeight: "100vh",
        padding: "22px 16px 40px",
        boxSizing: "border-box",
        color: ink,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <style>{`
        @media (max-width:560px){ .wc-title{font-size:26px !important;} .wc-controls{flex-direction:column !important; align-items:flex-start !important;} }
        .wc-tab:focus-visible, button:focus-visible { outline: 2px solid ${gold}; outline-offset: 2px; }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Masthead */}
        <div style={{ borderBottom: `2px solid ${ink}`, paddingBottom: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: money }}>
            Money, wealth, and the widening spread
          </div>
          <h1
            className="wc-title"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 34,
              lineHeight: 1.05,
              margin: "6px 0 0",
              fontWeight: 700,
            }}
          >
            {tab === "cantillon" ? "Whose Wealth Rides the Money Supply" : "The Great Divide"}
          </h1>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, margin: "16px 0 14px" }}>
          {[
            { v: "cantillon", label: "The Cantillon chart" },
            { v: "quintiles", label: "Income quintiles" },
          ].map((t, i) => {
            const on = t.v === tab;
            return (
              <button
                key={t.v}
                className="wc-tab"
                onClick={() => setTab(t.v)}
                style={{
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  cursor: "pointer",
                  background: on ? ink : "transparent",
                  color: on ? paper : ink,
                  border: `1.5px solid ${ink}`,
                  borderLeft: i === 0 ? `1.5px solid ${ink}` : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ---------------- CANTILLON ---------------- */}
        {tab === "cantillon" && (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 640, margin: "0 0 14px" }}>
              The money supply and the net worth of the very top rise almost in step. The bottom half
              tracks neither: it collapses when asset prices fall and recovers slowly. Whether the money
              drives the wealth, or both ride the same asset boom, is the argument, not the picture.
            </p>

            <div
              className="wc-controls"
              style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}
            >
              <Seg
                value={mode}
                onChange={setMode}
                options={[
                  { v: "dollars", label: "Dollars" },
                  { v: "indexed", label: "Indexed to 1989" },
                ]}
              />
              {mode === "dollars" && (
                <Seg
                  value={scale}
                  onChange={setScale}
                  options={[
                    { v: "linear", label: "Linear" },
                    { v: "log", label: "Log" },
                  ]}
                />
              )}
            </div>

            <div style={{ background: "#fbfaf4", border: `1px solid ${ink}`, padding: "12px 8px 6px" }}>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={cantillonData} margin={{ top: 8, right: 18, bottom: 4, left: 6 }}>
                  <CartesianGrid stroke="#d9d5c7" strokeDasharray="2 3" vertical={false} />
                  {/* crisis bands */}
                  <ReferenceArea x1={2007} x2={2009} fill="#1b2431" fillOpacity={0.05} />
                  <ReferenceArea x1={2020} x2={2021} fill="#1b2431" fillOpacity={0.05} />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11, fill: money }}
                    tickMargin={8}
                    stroke={ink}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    scale={mode === "dollars" && scale === "log" ? "log" : "linear"}
                    domain={
                      mode === "dollars"
                        ? scale === "log"
                          ? [0.2, 30]
                          : [0, 27]
                        : [0, "auto"]
                    }
                    allowDataOverflow
                    tick={{ fontSize: 11, fill: money }}
                    stroke={ink}
                    width={44}
                    tickFormatter={mode === "dollars" ? (v) => `$${v}T` : (v) => v}
                  />
                  <Tooltip content={<Box fmt={mode === "dollars" ? fmtT : fmtIdx} />} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 12.5, fontWeight: 600 }}
                  />
                  <Line
                    dataKey="top"
                    name="Top 0.1% net worth"
                    stroke={gold}
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    dataKey="m2"
                    name="M2 money supply"
                    stroke={money}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    dataKey="bot"
                    name="Bottom 50% net worth"
                    stroke={water}
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Spread callout */}
            <div
              style={{
                display: "flex",
                gap: 0,
                marginTop: 14,
                border: `1.5px solid ${ink}`,
                flexWrap: "wrap",
              }}
            >
              {[
                { k: "Top 0.1% net worth, 2025", v: fmtT(last.top), c: gold, note: `${(last.top / 1.81).toFixed(0)}× its 1989 level` },
                { k: "Bottom 50% net worth, 2025", v: fmtT(last.bot), c: water, note: `${(last.bot / 0.71).toFixed(0)}× its 1989 level` },
                { k: "M2 money supply, 2025", v: fmtT(last.m2), c: money, note: `${(last.m2 / 3.11).toFixed(0)}× its 1989 level` },
              ].map((s, i) => (
                <div
                  key={s.k}
                  style={{
                    flex: "1 1 180px",
                    padding: "12px 14px",
                    borderLeft: i === 0 ? "none" : `1px solid #cfcbbd`,
                  }}
                >
                  <div style={{ fontSize: 11, color: money, marginBottom: 4 }}>{s.k}</div>
                  <div
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 26,
                      fontWeight: 700,
                      color: s.c,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.v}
                  </div>
                  <div style={{ fontSize: 11.5, color: ink, marginTop: 2 }}>{s.note}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, lineHeight: 1.5, color: money, marginTop: 14 }}>
              Read the toggle carefully. In <strong>dollars</strong>, the top 0.1% gained about $23.7T
              since 1989 while the bottom half gained roughly $3.6T. Switch to <strong>indexed</strong>{" "}
              and the story gets more honest: in percentage terms the bottom 50% actually grew at a
              similar multiple to M2, because it started from almost nothing and cratered in 2008. The
              absolute gap is enormous; the growth-rate gap is narrower than the level chart suggests.
            </p>
            <p style={{ fontSize: 11, color: money, marginTop: 8 }}>
              Sources: M2 — FRED series M2SL. Net worth by wealth percentile — Federal Reserve
              Distributional Financial Accounts via FRED (WFRBLTP1246, WFRBLB50107). Year-end (Q4)
              values, all converted to trillions of nominal dollars.
            </p>
          </>
        )}

        {/* ---------------- QUINTILES ---------------- */}
        {tab === "quintiles" && (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 640, margin: "0 0 14px" }}>
              Real (inflation-adjusted) mean household income for each fifth of households, plus the top
              5%. Every group gained, but the top fifth and especially the top 5% break away from the pack
              in the mid-1980s. This is an inequality chart that happens to be inflation-adjusted; it shows
              divergence, not a cause.
            </p>

            <div className="wc-controls" style={{ marginBottom: 12 }}>
              <Seg
                value={qmode}
                onChange={setQmode}
                options={[
                  { v: "levels", label: "Real dollars" },
                  { v: "growth", label: "Growth since 1967" },
                ]}
              />
            </div>

            <div style={{ background: "#fbfaf4", border: `1px solid ${ink}`, padding: "12px 8px 6px" }}>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={quintileData} margin={{ top: 8, right: 18, bottom: 4, left: 6 }}>
                  <CartesianGrid stroke="#d9d5c7" strokeDasharray="2 3" vertical={false} />
                  <XAxis
                    dataKey="year"
                    type="number"
                    domain={[1967, 2024]}
                    ticks={[1967, 1975, 1985, 1995, 2007, 2015, 2024]}
                    tick={{ fontSize: 11, fill: money }}
                    tickMargin={8}
                    stroke={ink}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: money }}
                    stroke={ink}
                    width={48}
                    tickFormatter={qmode === "levels" ? (v) => `$${v}k` : (v) => v}
                  />
                  <Tooltip content={<Box fmt={qmode === "levels" ? fmtK : fmtIdx} />} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                  />
                  {["top5", "q5", "q4", "q3", "q2", "q1"].map((k) => (
                    <Line
                      key={k}
                      dataKey={k}
                      name={quintileLabels[k]}
                      stroke={quintileColors[k]}
                      strokeWidth={k === "q5" || k === "top5" ? 2.6 : 1.8}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 14,
                border: `1.5px solid ${ink}`,
                flexWrap: "wrap",
              }}
            >
              {[
                { k: "Top fifth, real growth 1967–2024", v: "+130.9%", c: quintileColors.q5 },
                { k: "Middle fifth mean, 2024", v: "$84,390", c: quintileColors.q3 },
                { k: "Bottom fifth, real growth 1967–2024", v: "+50.2%", c: quintileColors.q1 },
              ].map((s, i) => (
                <div
                  key={s.k}
                  style={{
                    flex: "1 1 180px",
                    padding: "12px 14px",
                    borderLeft: i === 0 ? "none" : `1px solid #cfcbbd`,
                  }}
                >
                  <div style={{ fontSize: 11, color: money, marginBottom: 4 }}>{s.k}</div>
                  <div
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 24,
                      fontWeight: 700,
                      color: s.c,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.v}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: money, marginTop: 14 }}>
              Source: U.S. Census Bureau, Historical Income Table H-3, mean household income by quintile,
              real 2024 dollars (C-CPI-U / R-CPI-U-RS). Endpoints match the published series; intermediate
              points are plotted at anchor years to trace the trend. Ask if you want the full annual table
              dropped in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
