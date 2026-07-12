import React, { useState, useEffect, useMemo } from "react";

// ---------------------------------------------------------------
// PHYSICS: projectile motion with air drag for a baseball
// ---------------------------------------------------------------
const MPH_TO_MS = 0.44704;
const M_TO_FT = 3.28084;
const BALL_MASS = 0.145; // kg
const BALL_RADIUS = 0.0366; // m
const AIR_RHO = 1.225;
const CD = 0.35;
const AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const DRAG_K = (0.5 * AIR_RHO * CD * AREA) / BALL_MASS;

// Returns { distFt, hangTime, peakFt }
function flightModel(evMph, laDeg) {
  const v0 = evMph * MPH_TO_MS;
  const la = (laDeg * Math.PI) / 180;
  let vx = v0 * Math.cos(la);
  let vy = v0 * Math.sin(la);
  let x = 0;
  let y = 0.9; // ~3ft contact height
  let t = 0;
  let peak = y;
  const dt = 0.01;
  while (y > 0 && t < 15) {
    const v = Math.sqrt(vx * vx + vy * vy);
    const ax = -DRAG_K * v * vx;
    const ay = -9.81 - DRAG_K * v * vy;
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
    if (y > peak) peak = y;
    t += dt;
  }
  return { distFt: x * M_TO_FT, hangTime: t, peakFt: peak * M_TO_FT };
}

// Precompute a flight lookup so heat map + sim are fast
const flightCache = new Map();
function flight(evMph, laDeg) {
  const key = `${Math.round(evMph)}_${Math.round(laDeg)}`;
  if (!flightCache.has(key)) flightCache.set(key, flightModel(evMph, laDeg));
  return flightCache.get(key);
}

// ---------------------------------------------------------------
// FIELD: Little League (60ft bases, ~200ft fence)
// Fielders in polar coords: [distance ft, spray angle deg]
// spray: -45 = 3B line, 0 = center, +45 = 1B line
// ---------------------------------------------------------------
const FENCE = 200;
const FIELDERS = [
  { name: "P", d: 46, a: 0, range: 8, reach: 10 },
  { name: "3B", d: 68, a: -32, range: 14, reach: 12 },
  { name: "SS", d: 75, a: -14, range: 17, reach: 12 },
  { name: "2B", d: 75, a: 14, range: 17, reach: 12 },
  { name: "1B", d: 68, a: 32, range: 12, reach: 12 },
  { name: "LF", d: 145, a: -25, range: 32, reach: 45 },
  { name: "CF", d: 155, a: 0, range: 36, reach: 45 },
  { name: "RF", d: 145, a: 25, range: 32, reach: 45 },
];

function polarToXY(d, aDeg) {
  const a = ((aDeg + 90) * Math.PI) / 180; // rotate so 0 = straight up
  return { x: d * Math.cos(a) * -1, y: d * Math.sin(a) };
}

// Simulate one batted ball -> outcome. jitter = fielder positioning luck (ft)
function simOutcome(evMph, laDeg, sprayDeg, rng, jitter = 6) {
  const f = flight(evMph, laDeg);
  if (laDeg >= 12 && f.distFt >= FENCE) return { hit: 1, type: "HR", land: f.distFt };

  // effective fielder positions with random shading (this is the "luck")
  const positioned = FIELDERS.map((fd) => ({
    ...fd,
    d: fd.d + (rng() - 0.5) * 2 * jitter,
    a: fd.a + (rng() - 0.5) * 2 * (jitter * 0.6),
  }));

  if (laDeg < 8) {
    // GROUND BALL: does it pass within an infielder's lateral range?
    const speedFactor = Math.min(1, evMph / 70); // harder = tougher to field
    for (const fd of positioned.filter((p) => p.d < 100)) {
      if (f.distFt + 40 < fd.d) continue; // dies before reaching fielder depth
      const angDiff = Math.abs(sprayDeg - fd.a);
      const lateralFt = (angDiff * Math.PI / 180) * fd.d;
      const effRange = fd.range * (1 - 0.45 * speedFactor);
      if (lateralFt < effRange) return { hit: 0, type: "GB out", land: fd.d };
    }
    return { hit: 1, type: "GB hit", land: Math.max(f.distFt, 95) };
  }

  // AIR BALL: can anyone get under it? range grows with hang time
  const landXY = { d: f.distFt, a: sprayDeg };
  let caught = false;
  for (const fd of positioned) {
    const p1 = polarToXY(landXY.d, landXY.a);
    const p2 = polarToXY(fd.d, fd.a);
    const gap = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const runSpeed = fd.d > 100 ? 16 : 13; // ft/s youth
    const coverage = fd.reach + runSpeed * Math.max(0, f.hangTime - 0.9);
    if (gap < coverage) { caught = true; break; }
  }
  if (caught) return { hit: 0, type: laDeg > 32 ? "Pop out" : laDeg > 15 ? "Fly out" : "Line out", land: f.distFt };
  return { hit: 1, type: laDeg <= 15 ? "Line drive hit" : "Fly ball hit", land: f.distFt };
}

// ---------------------------------------------------------------
// DATA + MODEL: simulate league, fit logistic regression in-browser
// ---------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function features(ev, la) {
  const e = (ev - 55) / 15, l = (la - 15) / 18;
  return [1, e, l, l * l, e * l, e * e];
}
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
function predict(w, ev, la) {
  const f = features(ev, la);
  let z = 0;
  for (let i = 0; i < w.length; i++) z += w[i] * f[i];
  return sigmoid(z);
}

function buildLeague() {
  const rng = mulberry32(42);
  const balls = [];
  for (let i = 0; i < 2000; i++) {
    const ev = Math.min(82, Math.max(28, 52 + gauss(rng) * 11));
    const la = Math.min(55, Math.max(-15, 11 + gauss(rng) * 16));
    const spray = Math.max(-43, Math.min(43, gauss(rng) * 19));
    const out = simOutcome(ev, la, spray, rng);
    balls.push({ ev, la, spray, hit: out.hit, type: out.type });
  }
  // logistic regression, gradient descent
  const w = new Array(6).fill(0);
  const lr = 0.25;
  for (let epoch = 0; epoch < 400; epoch++) {
    const grad = new Array(6).fill(0);
    for (const b of balls) {
      const f = features(b.ev, b.la);
      let z = 0;
      for (let i = 0; i < 6; i++) z += w[i] * f[i];
      const err = sigmoid(z) - b.hit;
      for (let i = 0; i < 6; i++) grad[i] += err * f[i];
    }
    for (let i = 0; i < 6; i++) w[i] -= (lr * grad[i]) / balls.length;
  }
  return { balls, w };
}

// Player archetypes -> sampled seasons
const PLAYER_DEFS = [
  { name: "Cam “Barrels” R.", desc: "Hard contact, line drives, keeps finding gloves", evMu: 63, evSd: 6, laMu: 13, laSd: 8, sprayMu: -8, spraySd: 10, jitter: 3, seed: 7, note: "unlucky" },
  { name: "Bo “Bloops” M.", desc: "Soft contact, weird angles, everything drops in", evMu: 44, evSd: 6, laMu: 22, laSd: 14, sprayMu: 12, spraySd: 18, jitter: 14, seed: 21, note: "lucky" },
  { name: "Tony “Rollover” P.", desc: "Decent bat speed but always early, pulls grounders to short", evMu: 56, evSd: 7, laMu: 3, laSd: 7, sprayMu: -22, spraySd: 7, jitter: 6, seed: 99, note: "pattern" },
];

function samplePlayer(def, w) {
  const rng = mulberry32(def.seed);
  const balls = [];
  for (let i = 0; i < 70; i++) {
    const ev = Math.min(82, Math.max(28, def.evMu + gauss(rng) * def.evSd));
    const la = Math.min(55, Math.max(-15, def.laMu + gauss(rng) * def.laSd));
    const spray = Math.max(-43, Math.min(43, def.sprayMu + gauss(rng) * def.spraySd));
    const out = simOutcome(ev, la, spray, rng, def.jitter);
    balls.push({ ev, la, spray, hit: out.hit, xh: predict(w, ev, la) });
  }
  const actual = balls.reduce((s, b) => s + b.hit, 0) / balls.length;
  const expected = balls.reduce((s, b) => s + b.xh, 0) / balls.length;
  return { ...def, balls, actual, expected, luck: actual - expected };
}

// ---------------------------------------------------------------
// COLORS
// ---------------------------------------------------------------
const C = {
  bg: "#10251A",
  panel: "#183324",
  panel2: "#1F3E2C",
  line: "#2E5238",
  chalk: "#F1EBDC",
  dim: "#9DB5A4",
  dirt: "#C08552",
  amber: "#F2B33D",
  hit: "#F2B33D",
  out: "#5A7A64",
  red: "#D96A4E",
};

function probColor(p) {
  // out (deep green) -> hit (amber)
  const stops = [
    [0.0, [26, 54, 38]],
    [0.35, [58, 94, 66]],
    [0.6, [150, 128, 68]],
    [0.8, [216, 165, 66]],
    [1.0, [255, 204, 92]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (p >= t0 && p <= t1) {
      const t = (p - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(255,204,92)";
}

// ---------------------------------------------------------------
// FIELD SVG (top-down)
// ---------------------------------------------------------------
function FieldSVG({ landing, sprayDots, fielders = true, size = 340 }) {
  const scale = size / 460;
  const toSvg = (dFt, aDeg) => {
    const p = polarToXY(dFt, aDeg);
    return { x: size / 2 + p.x * scale * 2, y: size - 20 - p.y * scale * 2 };
  };
  const home = { x: size / 2, y: size - 20 };
  const fenceArc = [];
  for (let a = -45; a <= 45; a += 3) fenceArc.push(toSvg(FENCE, a));
  const fencePath = "M " + fenceArc.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
  const foulL = toSvg(FENCE, -45), foulR = toSvg(FENCE, 45);
  const infield = [];
  for (let a = -45; a <= 45; a += 5) infield.push(toSvg(95, a));
  const infieldPath = `M ${home.x} ${home.y} L ` + infield.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + " Z";
  const b1 = toSvg(60, 45), b2 = toSvg(84.85, 0), b3 = toSvg(60, -45);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <path d={`M ${home.x} ${home.y} L ${foulL.x} ${foulL.y} ${fencePath.slice(1)} L ${home.x} ${home.y} Z`} fill="#24462F" stroke="none" />
      <path d={infieldPath} fill={C.dirt} opacity="0.85" />
      <path d={fencePath} fill="none" stroke={C.chalk} strokeWidth="2.5" opacity="0.9" />
      <line x1={home.x} y1={home.y} x2={foulL.x} y2={foulL.y} stroke={C.chalk} strokeWidth="1.5" opacity="0.7" />
      <line x1={home.x} y1={home.y} x2={foulR.x} y2={foulR.y} stroke={C.chalk} strokeWidth="1.5" opacity="0.7" />
      <path d={`M ${home.x} ${home.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} L ${b3.x} ${b3.y} Z`} fill="none" stroke={C.chalk} strokeWidth="1.2" opacity="0.6" />
      {[b1, b2, b3].map((b, i) => <rect key={i} x={b.x - 3} y={b.y - 3} width="6" height="6" fill={C.chalk} transform={`rotate(45 ${b.x} ${b.y})`} />)}
      <rect x={home.x - 3} y={home.y - 3} width="6" height="6" fill={C.chalk} transform={`rotate(45 ${home.x} ${home.y})`} />
      {fielders && FIELDERS.map((f) => {
        const p = toSvg(f.d, f.a);
        return (
          <g key={f.name}>
            <circle cx={p.x} cy={p.y} r={f.range * scale * 2} fill={C.chalk} opacity="0.07" />
            <circle cx={p.x} cy={p.y} r="4" fill={C.chalk} opacity="0.85" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fill={C.chalk} fontSize="9" fontFamily="ui-monospace, monospace" opacity="0.8">{f.name}</text>
          </g>
        );
      })}
      {sprayDots && sprayDots.map((d, i) => {
        const land = flight(d.ev, d.la).distFt;
        const dist = d.la < 8 ? Math.min(Math.max(land, 30), 110) : Math.min(land, FENCE + 15);
        const p = toSvg(dist, d.spray);
        return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={d.hit ? C.hit : "none"} stroke={d.hit ? "none" : "#8FAE97"} strokeWidth="1.3" opacity={d.hit ? 0.95 : 0.65} />;
      })}
      {landing && (() => {
        const p = toSvg(Math.min(landing.dist, FENCE + 20), landing.spray);
        return (
          <g>
            <line x1={home.x} y1={home.y} x2={p.x} y2={p.y} stroke={landing.hit ? C.hit : C.red} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
            <circle cx={p.x} cy={p.y} r="7" fill={landing.hit ? C.hit : C.red} stroke={C.chalk} strokeWidth="1.5" />
          </g>
        );
      })()}
    </svg>
  );
}

// ---------------------------------------------------------------
// APP
// ---------------------------------------------------------------
export default function HitField() {
  const [tab, setTab] = useState("map");
  const [model, setModel] = useState(null);
  const [ev, setEv] = useState(58);
  const [la, setLa] = useState(14);
  const [spray, setSpray] = useState(-5);
  const [hoverCell, setHoverCell] = useState(null);
  const [playerIdx, setPlayerIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setModel(buildLeague()), 30);
    return () => clearTimeout(t);
  }, []);

  const players = useMemo(() => (model ? PLAYER_DEFS.map((d) => samplePlayer(d, model.w)) : []), [model]);

  const grid = useMemo(() => {
    if (!model) return null;
    const cells = [];
    for (let laV = 50; laV >= -10; laV -= 3) {
      const row = [];
      for (let evV = 30; evV <= 80; evV += 2.5) row.push({ ev: evV, la: laV, p: predict(model.w, evV, laV) });
      cells.push(row);
    }
    return cells;
  }, [model]);

  const simRng = useMemo(() => mulberry32(Math.floor(ev * 7 + la * 13 + spray * 3)), [ev, la, spray]);
  const currentSim = useMemo(() => {
    if (!model) return null;
    const f = flight(ev, la);
    const trials = [];
    const r = mulberry32(Math.floor(ev * 7 + la * 13 + spray * 3) + 1);
    let hits = 0;
    for (let i = 0; i < 200; i++) { const o = simOutcome(ev, la, spray, r); hits += o.hit; if (i === 0) trials.push(o); }
    const one = simOutcome(ev, la, spray, simRng);
    return { flight: f, xh: predict(model.w, ev, la), empHit: hits / 200, one };
  }, [ev, la, spray, model, simRng]);

  const S = {
    wrap: { minHeight: "100vh", background: C.bg, color: C.chalk, fontFamily: "'Avenir Next', 'Segoe UI', system-ui, sans-serif", padding: "20px 16px 48px" },
    mono: { fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" },
    panel: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 },
    label: { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim },
    big: { fontSize: 30, fontWeight: 700, fontFamily: "ui-monospace, Menlo, monospace" },
  };

  const Tab = ({ id, children }) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? C.amber : "transparent", color: tab === id ? "#1A2E20" : C.dim,
      border: `1px solid ${tab === id ? C.amber : C.line}`, borderRadius: 6, padding: "8px 14px",
      fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em",
    }}>{children}</button>
  );

  const Slider = ({ label, val, set, min, max, unit }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={S.label}>{label}</span>
        <span style={{ ...S.mono, fontSize: 14, color: C.amber }}>{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={val} onChange={(e) => set(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.amber }} />
    </div>
  );

  if (!model) return (
    <div style={{ ...S.wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ ...S.mono, fontSize: 14, color: C.dim }}>Simulating 2,000 batted balls…</div>
        <div style={{ ...S.mono, fontSize: 12, color: C.dim, marginTop: 6 }}>fitting logistic regression on EV × launch angle</div>
      </div>
    </div>
  );

  const leagueHitRate = model.balls.reduce((s, b) => s + b.hit, 0) / model.balls.length;
  const wLabels = ["bias", "EV", "LA", "LA²", "EV×LA", "EV²"];
  const P = players[playerIdx];

  return (
    <div style={S.wrap}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 6, ...S.label, color: C.amber }}>Little League · 46/60 field · simulated league of 2,000 batted balls</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>The Hit Field</h1>
        <p style={{ margin: "0 0 18px", color: C.dim, fontSize: 14, lineHeight: 1.5, maxWidth: 620 }}>
          A physics flight model decides where each ball lands. Fielders decide if it drops. A logistic regression trained on the results learns which exit velocity and launch angle combos become hits, and the gap between a player's actual results and the model's expectation is measurable luck.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <Tab id="map">Hit probability map</Tab>
          <Tab id="sim">Field simulator</Tab>
          <Tab id="luck">Player luck report</Tab>
        </div>

        {/* ------------------ TAB: HEAT MAP ------------------ */}
        {tab === "map" && (
          <div style={S.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <div style={S.label}>P(hit) learned from simulated league</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>League hit rate on contact: <span style={{ ...S.mono, color: C.amber }}>{(leagueHitRate * 100).toFixed(1)}%</span></div>
              </div>
              {hoverCell && (
                <div style={{ ...S.mono, fontSize: 13, textAlign: "right" }}>
                  <div style={{ color: C.dim }}>{hoverCell.ev} mph · {hoverCell.la}°</div>
                  <div style={{ color: C.amber, fontSize: 18, fontWeight: 700 }}>{(hoverCell.p * 100).toFixed(0)}% hit</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "2px 0", ...S.mono, fontSize: 10, color: C.dim, textAlign: "right" }}>
                <span>50°</span><span>30°</span><span>15°</span><span>0°</span><span>-10°</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "grid", gridTemplateRows: `repeat(${grid.length}, 1fr)`, gap: 1, borderRadius: 6, overflow: "hidden" }}>
                  {grid.map((row, ri) => (
                    <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(${row.length}, 1fr)`, gap: 1 }}>
                      {row.map((c, ci) => (
                        <div key={ci} onMouseEnter={() => setHoverCell(c)}
                          style={{ background: probColor(c.p), aspectRatio: "1.6", cursor: "crosshair", outline: hoverCell === c ? `2px solid ${C.chalk}` : "none" }} />
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", ...S.mono, fontSize: 10, color: C.dim, marginTop: 4 }}>
                  <span>30 mph</span><span>exit velocity</span><span>80 mph</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
              The bright band is the barrel zone: line drives around 8–20° become hits at almost any speed, and above ~55 mph the zone widens because grounders start beating infielders and flies start clearing them. The dark ceiling is the pop-up graveyard, where more velocity barely helps. This non-linear sweet spot is exactly why a plain linear coefficient on launch angle fails and why the model needs the LA² term.
            </div>
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
              <div style={S.label}>Learned regression weights (normalized features)</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
                {model.w.map((w, i) => (
                  <div key={i} style={{ ...S.mono, fontSize: 13 }}>
                    <span style={{ color: C.dim }}>{wLabels[i]}: </span>
                    <span style={{ color: w > 0 ? C.amber : C.red, fontWeight: 700 }}>{w >= 0 ? "+" : ""}{w.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>
                Read the signs: EV positive (harder is better), LA² strongly negative (extremes in either direction kill you), and the interaction term captures how velocity buys forgiveness on angle.
              </div>
            </div>
          </div>
        )}

        {/* ------------------ TAB: FIELD SIM ------------------ */}
        {tab === "sim" && currentSim && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, 1.2fr)", gap: 16 }}>
            <div style={S.panel}>
              <div style={{ ...S.label, marginBottom: 14 }}>Dial in the contact</div>
              <Slider label="Exit velocity" val={ev} set={setEv} min={30} max={80} unit=" mph" />
              <Slider label="Launch angle" val={la} set={setLa} min={-10} max={50} unit="°" />
              <Slider label="Spray angle" val={spray} set={setSpray} min={-40} max={40} unit="°" />
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><div style={S.label}>Carry</div><div style={{ ...S.big, fontSize: 22 }}>{currentSim.flight.distFt.toFixed(0)} ft</div></div>
                  <div><div style={S.label}>Hang time</div><div style={{ ...S.big, fontSize: 22 }}>{currentSim.flight.hangTime.toFixed(1)} s</div></div>
                  <div><div style={S.label}>Model xHit</div><div style={{ ...S.big, fontSize: 22, color: C.amber }}>{(currentSim.xh * 100).toFixed(0)}%</div></div>
                  <div><div style={S.label}>Sim (200 trials)</div><div style={{ ...S.big, fontSize: 22, color: C.amber }}>{(currentSim.empHit * 100).toFixed(0)}%</div></div>
                </div>
                <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: C.panel2, fontSize: 13 }}>
                  This roll of the dice: <span style={{ ...S.mono, fontWeight: 700, color: currentSim.one.hit ? C.amber : C.red }}>{currentSim.one.type}</span>
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
                  xHit is the regression's opinion from EV and angle alone. The 200-trial sim adds spray direction and fielder shading, so a gap between the two numbers means placement (not contact quality) is deciding this ball's fate.
                </div>
              </div>
            </div>
            <div style={{ ...S.panel, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <FieldSVG landing={{ dist: la < 8 ? Math.min(Math.max(currentSim.flight.distFt, 35), 110) : currentSim.flight.distFt, spray, hit: currentSim.one.hit }} />
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6, textAlign: "center" }}>
                Chalk circles show each fielder's standing range. Fences at {FENCE} ft.
              </div>
            </div>
          </div>
        )}

        {/* ------------------ TAB: LUCK ------------------ */}
        {tab === "luck" && P && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {players.map((p, i) => (
                <button key={p.name} onClick={() => setPlayerIdx(i)} style={{
                  background: playerIdx === i ? C.panel2 : "transparent", border: `1px solid ${playerIdx === i ? C.amber : C.line}`,
                  color: C.chalk, borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left", flex: "1 1 180px",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 1fr)", gap: 16 }}>
              <div style={S.panel}>
                <div style={{ ...S.label, marginBottom: 12 }}>{P.name} · 70 balls in play</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <div><div style={S.label}>Actual BABIP</div><div style={S.big}>{P.actual.toFixed(3).slice(1)}</div></div>
                  <div><div style={S.label}>Expected (model)</div><div style={{ ...S.big, color: C.amber }}>{P.expected.toFixed(3).slice(1)}</div></div>
                  <div><div style={S.label}>Luck gap</div><div style={{ ...S.big, color: P.luck < -0.02 ? C.red : P.luck > 0.02 ? C.amber : C.chalk }}>{P.luck >= 0 ? "+" : ""}{P.luck.toFixed(3)}</div></div>
                </div>
                {/* luck bar */}
                <div style={{ position: "relative", height: 26, background: C.panel2, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.dim }} />
                  <div style={{
                    position: "absolute", top: 4, bottom: 4, borderRadius: 4,
                    left: P.luck < 0 ? `${50 + P.luck * 180}%` : "50%",
                    width: `${Math.abs(P.luck) * 180}%`,
                    background: P.luck < 0 ? C.red : C.amber,
                  }} />
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
                  {P.note === "unlucky" && (<span>His contact profile says he should be hitting around <b style={{ color: C.amber }}>{P.expected.toFixed(3).slice(1)}</b> on balls in play, but gloves keep getting in the way. Nothing to fix in the swing. This regresses upward, so bat him like his expected number, not his actual one.</span>)}
                  {P.note === "lucky" && (<span>The results look fine, but the model sees soft contact that should only produce about <b style={{ color: C.amber }}>{P.expected.toFixed(3).slice(1)}</b>. He's living on bloopers finding grass. Expect the average to fall unless the exit velo comes up.</span>)}
                  {P.note === "pattern" && (<span>His gap is smaller, and that's the tell: he isn't unlucky, he's <i>predictable</i>. Look at the spray chart. Nearly everything is a pulled grounder into the shortstop's range, so the fielders don't need luck to find his baseballs. This is a timing fix, not a luck problem.</span>)}
                </div>
                {/* per-ball strip */}
                <div style={{ marginTop: 14 }}>
                  <div style={S.label}>Each ball: model xHit vs result</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
                    {P.balls.map((b, i) => (
                      <div key={i} title={`${b.ev.toFixed(0)} mph, ${b.la.toFixed(0)}° → xHit ${(b.xh * 100).toFixed(0)}%, ${b.hit ? "HIT" : "OUT"}`}
                        style={{
                          width: 12, height: 20, borderRadius: 2, background: probColor(b.xh),
                          borderBottom: `4px solid ${b.hit ? C.amber : "#33523E"}`, cursor: "help",
                        }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Bar color = model expectation. Bottom edge = what actually happened. Bright bars with dark edges are the robberies.</div>
                </div>
              </div>
              <div style={{ ...S.panel, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ ...S.label, alignSelf: "flex-start", marginBottom: 8 }}>Spray chart · filled = hit, hollow = out</div>
                <FieldSVG sprayDots={P.balls} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
