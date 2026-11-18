// Pure-helper tests for Narrative Lab's browser side: highlight segments over
// overlapping spans, cascade trees and per-hop fidelity, the density display
// rule (percentile only with a baseline), and the Markdown vault export and
// its zip writer (checked by reading the archive back, and with `unzip -t`
// when it is installed). No dependencies, no emulator:
//
//   cd apps/portfolio
//   node test/narrative-lab.test.mjs

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { around, cascadeRootOf, cascadeStats, cascadeTree, densityDisplay, isStalled, progress, segments, statusLine, timelineLayout } from "../src/tools/narrative-lab/format.js";
import { crc32, pageNames, toVault, zip } from "../src/tools/narrative-lab/vault.js";

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const ok = (label, cond) => eq(label, !!cond, true);

console.log("segments:");
const text = "abcdefghij";
const segs = segments(text, [
  { id: "f1", start: 2, end: 6 },
  { id: "f2", start: 4, end: 8 },
  { id: "bad", start: 9, end: 40 },
  { id: "empty", start: 3, end: 3 },
]);
eq("overlap splits into runs", segs.map((s) => [s.text, s.ids]), [["ab", []], ["cd", ["f1"]], ["ef", ["f1", "f2"]], ["gh", ["f2"]], ["ij", []]]);
eq("segments rebuild the text", segs.map((s) => s.text).join(""), text);
eq("no spans is one run", segments("hello", []).map((s) => s.text), ["hello"]);
eq("adjacent identical runs merge", segments("abcdef", [{ id: "a", start: 0, end: 3 }, { id: "a2", start: 3, end: 3 }]).length, 2);
eq("around a quote", around("0123456789", 4, 6, 2), { before: "…23", quote: "45", after: "67…" });
eq("around with no span", around("x", null, null), null);

console.log("status:");
eq("progress done", progress({ status: "done" }), 1);
eq("progress mid-stage", progress({ status: "running", stage: "blind" }), 2.5 / 7);
eq("failed line names the stage", statusLine({ status: "failed", failedStage: "relate", stage: "relate" }), "Failed at Comparing to source");
eq("stalled", [isStalled({ status: "running", claim: { until: 5 } }, 10), isStalled({ status: "running", claim: { until: 50 } }, 10)], [true, false]);

console.log("density display:");
eq("percentile when calibrated", densityDisplay({ densityRaw: 6.2, densityPct: 81, densityBaseline: 240, densityGenre: "opinion" }).big, "81");
const un = densityDisplay({ densityRaw: 6.2, densityPct: null, densityBaseline: 12, densityGenre: "news" });
eq("raw rate when not", [un.big, un.unit], ["6.2", "per 1k words"]);
ok("says how far from calibrated", un.note.includes("12 of 200 news"));
eq("too short", densityDisplay({ densityRaw: null }).big, "–");

console.log("cascades:");
const items = Object.fromEntries(["P", "A", "B", "C", "X"].map((id, i) => [id, { id, createdAt: i }]));
const edges = [
  { from: "P", to: "A", fidelity: 90 },
  { from: "P", to: "B", fidelity: 70 },
  { from: "A", to: "C", fidelity: 40 },
  { from: "C", to: "P", fidelity: 10 }, // a cycle must not loop
  { from: null, to: "X" },
];
const tree = cascadeTree("P", edges, items);
const st = cascadeStats(tree);
eq("tree order and depth", st.rows.map((r) => [r.item.id, r.depth]), [["P", 0], ["A", 1], ["C", 2], ["B", 1]]);
eq("per-hop fidelity", st.perHop, [{ depth: 1, count: 2, meanFidelity: 80 }, { depth: 2, count: 1, meanFidelity: 40 }]);
eq("size and depth", [st.size, st.depth], [3, 2]);
eq("unknown root", cascadeTree("nope", edges, items), null);

console.log("timeline:");
eq("cascade root of a leaf", cascadeRootOf("C", edges), "P");
eq("an item with no upstream is its own root", cascadeRootOf("B", [{ from: "B", to: "Z" }]), "B");
const tl = timelineLayout(
  [
    { id: "p", publishedAt: "2026-11-01", hop: 0 },
    { id: "a", publishedAt: "2026-11-03", hop: 1 },
    { id: "b", publishedAt: "2026-11-03", hop: 1 },
    { id: "c", publishedAt: "2026-11-11", hop: 2 },
    { id: "u", hop: 1 },
  ],
  { width: 1000, left: 100, right: 20 }
);
eq("earliest at the left edge", tl.nodes.p.x, 100);
ok("later is further right", tl.nodes.c.x > tl.nodes.a.x);
eq("same day, same lane: stacked rows, same x", [tl.nodes.a.x === tl.nodes.b.x, tl.nodes.a.row, tl.nodes.b.row], [true, 0, 1]);
ok("undated sits right of every dated item", tl.nodes.u.x > tl.nodes.c.x && tl.nodes.u.x <= 980);
eq("one lane per hop, in order", tl.lanes.map((l) => l.hop), [0, 1, 2]);
ok("lanes do not overlap", tl.lanes.every((l, i) => i === 0 || l.y >= tl.lanes[i - 1].y + tl.lanes[i - 1].h));
ok("every node inside its lane", Object.values(tl.nodes).every((n) => { const ln = tl.lanes.find((l) => l.hop === n.hop); return n.y > ln.y && n.y < ln.y + ln.h; }));
ok("ticks span the dated range", tl.ticks[0].x === 100 && tl.ticks[tl.ticks.length - 1].x === Math.max(tl.nodes.c.x));
eq("undated count reported", tl.undated, 1);
const one = timelineLayout([{ id: "x", publishedAt: "2026-11-01", hop: 0 }], { width: 600, left: 100, right: 0 });
eq("a single dated item is centred in the dated span", [one.nodes.x.x, one.ticks.length], [350, 1]);

console.log("vault:");
const kb = {
  items: [
    {
      id: "item00001",
      createdAt: 0,
      status: "done",
      sourceId: "person-dana",
      narrativeIds: ["n1"],
      context: { title: "Remote work: the study", publishedAt: "2026-11-10", genre: "news", author: "Dana", publisher: "Example" },
      claims: [{ id: "c1", text: "Spending rose", claimId: "cl1" }],
      findings: [{ id: "f1", layer: 3, techniqueId: "loaded-language", confidence: "high", quote: "a fantasy", explanation: "Charged." }],
      pressure: { scores: { epistemic: 2, social: 0 }, support: { epistemic: ["f1"] } },
      scores: { densityRaw: 3.1, fidelity: null },
      questions: [{ findingId: "f1", question: "Who says so?" }],
      narratives: [{ id: "n1", role: "originator" }],
    },
    { id: "item00002", createdAt: 1, status: "done", context: { title: "Reaction video", publishedAt: "2026-11-12" }, scores: { fidelity: 33 } },
  ],
  sources: [{ id: "person-dana", name: "Dana", kind: "individual", itemsCount: 1, profile: { shown: false } }],
  narratives: [{ id: "n1", name: "Remote work revives towns", summary: "s", itemCount: 1 }],
  claims: [{ id: "cl1", text: "Spending rose", itemIds: ["item00001"], verdict: "unreviewed" }],
  edges: [{ from: "item00001", to: "item00002", relation: "reacts-to", status: "done", fidelity: 33, transformations: [{ id: "T2" }] }],
  library: { version: "0.1.0", techniques: [{ id: "loaded-language", name: "Loaded language" }], transformations: [{ id: "T2", name: "Certainty escalation" }] },
  exportedAt: "2026-11-17T00:00:00Z",
};
const files = toVault(kb);
const names = pageNames(kb);
const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
eq("page per item, source, narrative, claim, plus index", files.length, 6);
eq("item file name", names["item:item00001"], "items/2026-11-10-remote-work-the-study-item00");
const page = byPath[`${names["item:item00001"]}.md`];
ok("frontmatter first", page.startsWith("---\ntype: item\n"));
ok("source as a wiki link", page.includes(`source: "[[sources/person-dana]]"`));
ok("finding written with its technique name", page.includes("**f1** Layer 3, Loaded language (high)"));
ok("pressure with its support", page.includes("epistemic: 2/3 (supported by f1)"));
ok("claim linked", page.includes(`[[${names["claim:cl1"]}|Spending rose]]`));
ok("downstream linked", page.includes(`[[${names["item:item00002"]}`));
const deriv = byPath[`${names["item:item00002"]}.md`];
ok("upstream with fidelity and transformation", deriv.includes("fidelity 33") && deriv.includes("T2 Certainty escalation"));
ok("narrative timeline names the role", byPath[`${names["narrative:n1"]}.md`].includes("(originator)"));
ok("index counts", byPath["index.md"].includes("2 items, 1 sources, 1 narratives, 1 claims, 1 edges"));
ok("empty values are null in YAML", deriv.includes("author: null"));

console.log("zip:");
eq("crc32 of a known string", crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")).toString(16), "414fa339");
const archive = zip(files, new Date(2026, 10, 17, 12, 0, 0));
const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
eq("local header signature", view.getUint32(0, true), 0x04034b50);
const endAt = archive.length - 22;
eq("end record signature and count", [view.getUint32(endAt, true), view.getUint16(endAt + 10, true)], [0x06054b50, files.length]);
// Walk the local headers back out and compare names, sizes, and CRCs.
const dec = new TextDecoder();
let at = 0;
const back = [];
while (view.getUint32(at, true) === 0x04034b50) {
  const crc = view.getUint32(at + 14, true);
  const size = view.getUint32(at + 18, true);
  const nlen = view.getUint16(at + 26, true);
  const name = dec.decode(archive.subarray(at + 30, at + 30 + nlen));
  const data = archive.subarray(at + 30 + nlen, at + 30 + nlen + size);
  back.push({ name, ok: crc32(data) === crc, content: dec.decode(data) });
  at += 30 + nlen + size;
}
eq("every file reads back intact", back.map((b) => [b.name, b.ok]), files.map((f) => [f.path, true]));
eq("contents match", back.map((b) => b.content), files.map((f) => f.content));
let unzip = null;
try {
  execFileSync("unzip", ["-v"], { stdio: "ignore" });
  unzip = true;
} catch {
  unzip = false;
}
if (unzip) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nlvault-")), "v.zip");
  fs.writeFileSync(tmp, archive);
  let out = "";
  try {
    out = execFileSync("unzip", ["-t", tmp]).toString();
  } catch (e) {
    out = String(e.stdout || e.message);
  }
  ok("unzip -t accepts the archive", /No errors detected/.test(out));
} else {
  console.log("  (unzip not installed: skipped the external check)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
