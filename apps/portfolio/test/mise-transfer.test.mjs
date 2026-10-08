// Pure-helper tests for Mise's JSON import and export: a plan survives a round
// trip, hand-written files are read forgivingly, and files the tool couldn't
// save are refused with a message instead of failing at write time. No
// dependencies and no emulator:
//
//   cd apps/portfolio
//   node test/mise-transfer.test.mjs

import { EXAMPLE, parseImport, planFilename, serializePlan, serializePlans } from "../src/tools/mise/transfer.js";
import { THEMES, THEME_CSS, isTheme } from "../src/tools/mise/themes.js";
import { cleanUrl, detailSummary, isEmptyDetails, linkLabel, readDetails, safeFileName } from "../src/tools/mise/details.js";
import { MAX_DEPTH, casapTemplate, heightOf, leavesOf } from "../src/tools/mise/tree.js";

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
    console.log("  PASS", label);
  } else {
    fail++;
    console.log("  FAIL", label, "\n    got ", a, "\n    want", b);
  }
};
const throws = (label, fn, match) => {
  try {
    fn();
    fail++;
    console.log("  FAIL", label, "\n    did not throw");
  } catch (e) {
    eq(label, match.test(e.message), true);
  }
};

// Drop ids so trees from different sides of a round trip can be compared.
const bare = (x) => ({ name: x.name, owner: x.owner, done: x.done, children: x.children.map(bare) });

console.log("round trip:");
const impl = { name: "Sunrise CU go-live", client: "Sunrise", layout: { theme: "terminal" }, tree: casapTemplate() };
const [back] = parseImport(serializePlan(impl));
eq("name, client, and theme come back", [back.name, back.client, back.theme], ["Sunrise CU go-live", "Sunrise", "terminal"]);
eq("the tree comes back step for step", bare(back.tree), bare(impl.tree));
eq("ids are regenerated, so re-importing never collides", back.tree.id === impl.tree.id, false);
eq("done counts survive", leavesOf(back.tree).filter((l) => l.done).length, leavesOf(impl.tree).filter((l) => l.done).length);
const two = parseImport(serializePlans([impl, { ...impl, name: "Second" }, { name: "No tree", tree: null }]));
eq("a bundle round-trips every plan with a tree", two.map((p) => p.name), ["Sunrise CU go-live", "Second"]);
eq("the example in the import panel imports", parseImport(EXAMPLE)[0].name, "Kitchen remodel");

console.log("\nforgiving reads:");
const [bareTree] = parseImport(JSON.stringify({ name: "Ship it", children: [{ title: "Write it" }, { name: "Test it", steps: [{ name: "Unit" }] }] }));
eq("a bare tree is a plan named for its outcome", bareTree.name, "Ship it");
eq("title and steps are accepted as name and children", bare(bareTree.tree).children.map((c) => [c.name, c.children.length]), [["Write it", 0], ["Test it", 1]]);
const [owners] = parseImport(JSON.stringify({ name: "o", children: ["Client", "3rd", "vendor", "us", "nonsense", null].map((owner) => ({ name: "x", owner })) }));
eq("owner spellings map onto us / them / third", owners.tree.children.map((c) => c.owner), ["them", "third", "third", "us", "us", "us"]);
const [doneish] = parseImport(JSON.stringify({ name: "d", children: [{ name: "a", status: "Complete" }, { name: "b", done: "yes" }, { name: "c", done: true, children: [{ name: "c1" }] }] }));
eq("status: complete reads as done, a truthy string does not", doneish.tree.children.slice(0, 2).map((c) => c.done), [true, false]);
eq("merge blocks never carry done", doneish.tree.children[2].done, false);
eq("an unknown theme is dropped", parseImport(JSON.stringify({ name: "t", theme: "plaid", tree: { name: "x", children: [] } }))[0].theme, null);
eq("a plain array of plans imports", parseImport(JSON.stringify([{ name: "a", children: [] }, { name: "b", children: [] }])).length, 2);

console.log("\nrefusals:");
throws("not JSON", () => parseImport("{nope"), /valid JSON/);
throws("nothing to chart", () => parseImport(JSON.stringify({ name: "x" })), /nothing to chart/);
throws("an empty bundle", () => parseImport(JSON.stringify({ plans: [] })), /no plans/);
throws("a step that isn't an object", () => parseImport(JSON.stringify({ name: "x", children: ["oops"] })), /isn't an object/);
const nest = (n) => (n === 1 ? { name: `L${n}` } : { name: `L${n}`, children: [nest(n - 1)] });
eq(`exactly ${MAX_DEPTH} levels imports`, heightOf(parseImport(JSON.stringify(nest(MAX_DEPTH)))[0].tree), MAX_DEPTH);
throws(`${MAX_DEPTH + 1} levels is refused`, () => parseImport(JSON.stringify(nest(MAX_DEPTH + 1))), /nests deeper/);
throws("a runaway file is refused", () => parseImport(JSON.stringify({ name: "x", children: Array.from({ length: 2001 }, () => ({ name: "s" })) })), /more than 2000/);

console.log("\nfiles and themes:");
eq("filenames are slugged", planFilename("Sunrise CU: go-live!"), "sunrise-cu-go-live.mise.json");
eq("an empty name still makes a file", planFilename("  "), "plan.mise.json");
eq("every theme has a css block", THEMES.every((t) => THEME_CSS.includes(`.t-${t.key}{`)), true);
eq("no theme is missing a token", /undefined/.test(THEME_CSS), false);
eq("isTheme", [isTheme("pine"), isTheme("terminal"), isTheme("nope"), isTheme(undefined)], [true, true, false, false]);

console.log("\nstep details:");
eq("bare domains get https", cleanUrl("dmv.ny.gov/change-address"), "https://dmv.ny.gov/change-address");
eq("javascript: links are refused", cleanUrl("javascript:alert(1)"), "");
eq("data: links are refused", cleanUrl("data:text/html,hi"), "");
eq("mailto and tel are kept", [cleanUrl("mailto:a@b.com"), cleanUrl("tel:9149953070")], ["mailto:a@b.com", "tel:9149953070"]);
eq("words aren't links", [cleanUrl("call the clerk"), cleanUrl("clerk")], ["", ""]);
eq("labels fall back to host and path", linkLabel({ url: "https://www.irs.gov/forms/8822" }), "irs.gov/forms/8822");
eq("summary", detailSummary({ notes: "x", links: [{}, {}], attachments: [{}], comments: [] }), "note · 2 links · 1 file");
eq("whitespace notes are empty", isEmptyDetails({ notes: "  ", links: [], comments: [], attachments: [] }), true);
eq("readDetails drops unsafe links and empty comments", (() => {
  const d = readDetails({ links: [{ url: "javascript:x" }, { url: "ok.com" }], comments: [{ text: " " }, { text: "hi", at: 5 }] });
  return [d.links.map((l) => l.url), d.comments.map((c) => c.text)];
})(), [["https://ok.com/"], ["hi"]]);
eq("attachments without a stored path are dropped", readDetails({ attachments: [{ name: "x", url: "u" }] }).attachments.length, 0);
eq("file names are path-safe", safeFileName("../scan #1?.pdf"), "..-scan -1-.pdf");

console.log("\ndetails in json:");
const tree = { id: "r", name: "Root", owner: "us", done: false, children: [{ id: "a", name: "A", owner: "them", done: false, children: [] }] };
const details = {
  r: { notes: "", links: [], comments: [], attachments: [] },
  a: {
    notes: "Conf #123",
    links: [{ id: "l", url: "https://dmv.ny.gov/", label: "DMV" }],
    comments: [{ id: "c", text: "Called them", by: "u", name: "Josh", at: Date.parse("2026-10-08T12:00:00Z") }],
    attachments: [{ id: "f", name: "scan.pdf", path: "mise/u/i/a/f-scan.pdf", url: "https://secret-token", size: 1, type: "application/pdf", at: 1 }],
  },
};
const json = serializePlan({ name: "P", layout: {}, tree, details });
eq("uploaded files never reach the export", json.includes("secret-token"), false);
const [p2] = parseImport(json);
const d2 = p2.details[p2.tree.children[0].id];
eq("notes, links, and comments round-trip", [d2.notes, d2.links[0].url, d2.links[0].label, d2.comments[0].text, d2.comments[0].at], ["Conf #123", "https://dmv.ny.gov/", "DMV", "Called them", Date.parse("2026-10-08T12:00:00Z")]);
eq("steps without details carry none", Object.keys(p2.details).length, 1);
const [loose] = parseImport(JSON.stringify({ name: "L", children: [{ name: "s", note: "n", links: ["irs.gov", "javascript:x"], comments: ["first"] }] }));
const ld = Object.values(loose.details)[0];
eq("plain-string links and comments import; unsafe links don't", [ld.notes, ld.links.map((l) => l.url), ld.comments.map((c) => c.text)], ["n", ["https://irs.gov/"], ["first"]]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
