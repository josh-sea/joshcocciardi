// Pure-helper tests for Mise's JSON import and export: a plan survives a round
// trip, hand-written files are read forgivingly, and files the tool couldn't
// save are refused with a message instead of failing at write time. No
// dependencies and no emulator:
//
//   cd apps/portfolio
//   node test/mise-transfer.test.mjs

import { EXAMPLE, parseImport, planFilename, serializePlan, serializePlans } from "../src/tools/mise/transfer.js";
import { THEMES, THEME_CSS, isTheme } from "../src/tools/mise/themes.js";
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
