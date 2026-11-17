// Pure display helpers for Narrative Lab. No React, no Firebase, so
// test/narrative-lab.test.mjs can run them under plain Node.

export const STAGES = ["capture", "extract", "blind", "resolve", "relate", "narrate", "writeback"];

export const STAGE_TEXT = {
  capture: "Capturing",
  extract: "Extracting claims",
  blind: "Blind pass",
  resolve: "Filing",
  relate: "Comparing to source",
  narrate: "Narrative pass",
  writeback: "Scoring",
  done: "Done",
};

export const LAYER_TEXT = { 1: "Context", 2: "Reasoning", 3: "Rhetoric", 4: "Narrative", 5: "Invariants" };

/* 0..1 progress through the pipeline, for the in-flight list. */
export const progress = (item) => {
  if (!item) return 0;
  if (item.status === "done") return 1;
  const i = STAGES.indexOf(item.stage);
  return i < 0 ? 0 : (i + (item.status === "running" ? 0.5 : 0)) / STAGES.length;
};

export const statusLine = (item) => {
  if (!item) return "";
  if (item.status === "done") return "Done";
  if (item.status === "failed") return `Failed at ${STAGE_TEXT[item.failedStage || item.stage] || item.stage}`;
  const t = STAGE_TEXT[item.stage] || item.stage;
  return item.status === "running" ? `${t}…` : `Queued: ${t.toLowerCase()}`;
};

/* A running item whose lease has expired has stopped checking in. */
export const isStalled = (item, now = Date.now()) => item && item.status === "running" && item.claim && item.claim.until < now;

/* Splits text into runs where the set of covering spans is constant, so
   overlapping findings can each be highlighted and clicked. Spans outside the
   text or with no length are ignored. */
export const segments = (text, spans) => {
  const t = String(text || "");
  const valid = (spans || []).filter((s) => Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start && s.start >= 0 && s.end <= t.length);
  const cuts = new Set([0, t.length]);
  for (const s of valid) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const ids = valid.filter((s) => s.start <= start && s.end >= end).map((s) => s.id);
    const prev = out[out.length - 1];
    if (prev && prev.ids.join() === ids.join()) {
      prev.text += t.slice(start, end);
      prev.end = end;
    } else {
      out.push({ text: t.slice(start, end), start, end, ids });
    }
  }
  return out;
};

/* The text around a span, for showing a quote in context. */
export const around = (text, start, end, pad = 160) => {
  const t = String(text || "");
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const a = Math.max(0, start - pad);
  const b = Math.min(t.length, end + pad);
  return { before: (a > 0 ? "…" : "") + t.slice(a, start), quote: t.slice(start, end), after: t.slice(end, b) + (b < t.length ? "…" : "") };
};

export const millis = (ts) => {
  if (!ts) return null;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const p = Date.parse(ts);
  return Number.isFinite(p) ? p : null;
};

export const fmtDate = (ts) => {
  const m = millis(ts);
  if (m === null) return "";
  return new Date(m).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmtUsd = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return "<$0.01";
  return `$${v.toFixed(2)}`;
};

/* The density figure as shown: the percentile when the genre has a baseline,
   otherwise the raw rate, labeled uncalibrated with how far along it is. */
export const densityDisplay = (scores, baselineMin = 200) => {
  if (!scores || typeof scores.densityRaw !== "number") return { big: "–", unit: "", note: "Too short to rate" };
  if (typeof scores.densityPct === "number") {
    return { big: String(scores.densityPct), unit: "/100", note: `${scores.densityRaw} per 1,000 words, against ${scores.densityBaseline} ${scores.densityGenre} items` };
  }
  return {
    big: String(scores.densityRaw),
    unit: "per 1k words",
    note: `Uncalibrated: ${scores.densityBaseline || 0} of ${baselineMin} ${scores.densityGenre || ""} items needed for a 0 to 100 score`.replace(/\s+/g, " "),
  };
};

export const fidelityTone = (n) => (typeof n !== "number" ? "" : n >= 80 ? "good" : n >= 50 ? "mid" : "low");

export const tally = (list, key) => {
  const out = {};
  for (const x of list || []) {
    const k = typeof key === "function" ? key(x) : x[key];
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
};

/* Builds the derivation tree below a primary item from the edge list: each
   node is { item, edge, children }. Cycles and repeats are cut. */
export const cascadeTree = (rootId, edges, itemsById, maxDepth = 8) => {
  const byFrom = {};
  for (const e of edges || []) if (e.from) (byFrom[e.from] = byFrom[e.from] || []).push(e);
  const seen = new Set([rootId]);
  const build = (id, edge, depth) => {
    const children = [];
    if (depth < maxDepth) {
      for (const e of byFrom[id] || []) {
        if (seen.has(e.to) || !itemsById[e.to]) continue;
        seen.add(e.to);
        children.push(build(e.to, e, depth + 1));
      }
    }
    children.sort((a, b) => (millis(a.item.createdAt) || 0) - (millis(b.item.createdAt) || 0));
    return { item: itemsById[id], edge, children, depth };
  };
  return itemsById[rootId] ? build(rootId, null, 0) : null;
};

/* Flattens a tree into rows with depth, and sums per hop. */
export const cascadeStats = (tree) => {
  const rows = [];
  const hops = {};
  const walk = (n) => {
    rows.push(n);
    if (n.depth > 0) {
      const h = (hops[n.depth] = hops[n.depth] || { count: 0, fidelity: [] });
      h.count++;
      if (n.edge && typeof n.edge.fidelity === "number") h.fidelity.push(n.edge.fidelity);
    }
    n.children.forEach(walk);
  };
  if (tree) walk(tree);
  const perHop = Object.entries(hops).map(([depth, h]) => ({
    depth: Number(depth),
    count: h.count,
    meanFidelity: h.fidelity.length ? Math.round(h.fidelity.reduce((a, b) => a + b, 0) / h.fidelity.length) : null,
  }));
  return { rows, perHop, size: rows.length - 1, depth: perHop.length };
};
