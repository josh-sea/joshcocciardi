// Pure-helper tests for the Family Meal Planner: the week math (Monday
// through Sunday, local calendar days), the inventory splitter, slots (item
// lists, old single-pick shapes, old two-slot snacks), and the inventory
// lifecycle. No dependencies and no emulator:
//
//   cd apps/portfolio
//   node test/meal-planner.test.mjs

import {
  addDays,
  ageLabel,
  dayProgress,
  findByName,
  inStock,
  isLegacyShared,
  itemState,
  kitchenConfig,
  laterKey,
  makePeople,
  matchNames,
  mondayOf,
  newPersonKey,
  normalizeLink,
  ratingSummary,
  readDay,
  readSlot,
  samePick,
  sectionSlots,
  shownSections,
  slotPath,
  slotState,
  sortItems,
  splitItems,
  weekDays,
  writeSlot,
} from "../src/tools/meal-planner/plan.js";

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

console.log("weeks:");
eq("a Tuesday belongs to the Monday before it", mondayOf("2026-09-22"), "2026-09-21");
eq("a Monday is its own week", mondayOf("2026-09-21"), "2026-09-21");
eq("a Sunday closes the week that started six days earlier", mondayOf("2026-09-27"), "2026-09-21");
eq("weeks cross month ends", mondayOf("2026-10-01"), "2026-09-28");
eq("weeks cross year ends", mondayOf("2027-01-01"), "2026-12-28");
eq("addDays steps across a DST change without slipping a day", addDays("2026-11-01", 1), "2026-11-02");
eq("seven days, Monday first, Sunday last", weekDays("2026-09-21").map((d) => `${d.name.slice(0, 3)} ${d.key}`), [
  "Mon 2026-09-21",
  "Tue 2026-09-22",
  "Wed 2026-09-23",
  "Thu 2026-09-24",
  "Fri 2026-09-25",
  "Sat 2026-09-26",
  "Sun 2026-09-27",
]);

console.log("\ninventory splitting:");
eq("commas", splitItems("milk, eggs, bread"), ["milk", "eggs", "bread"]);
eq("new lines and semicolons", splitItems("milk\neggs; bread\r\nbutter"), ["milk", "eggs", "bread", "butter"]);
eq("'and' is not a delimiter", splitItems("mac and cheese, salt and pepper chips"), ["mac and cheese", "salt and pepper chips"]);
eq("pasted bullets and numbers are trimmed", splitItems("- apples\n* pears\n• plums\n1. figs\n2) dates"), [
  "apples",
  "pears",
  "plums",
  "figs",
  "dates",
]);
eq("blank pieces and trailing periods drop", splitItems(" , milk,, eggs.  ,\n\n"), ["milk", "eggs"]);
eq("repeats in one entry collapse, first spelling wins", splitItems("Milk, milk, MILK, eggs"), ["Milk", "eggs"]);
eq("inner whitespace is tidied", splitItems("  greek   yogurt  "), ["greek yogurt"]);
eq("empty input is no items", splitItems(""), []);

console.log("\nslots:");
const pick = { kind: "recipe", id: "r1", name: "Pesto pasta" };
const fish = { kind: "inventory", id: "i1", name: "goldfish" };
const stick = { kind: "inventory", id: "i2", name: "meat stick" };
eq("absent entry is undecided", slotState(undefined), "undecided");
eq("a list with something in it is a meal", slotState({ items: [fish, stick] }), "meal");
eq("not needed", slotState({ none: true }), "none");
eq("an empty-named pick doesn't count", slotState({ items: [{ kind: "text", name: "" }] }), "undecided");
eq("old per-person { pick } reads as a one-item list", readSlot({ pick }).items, [pick]);
eq("old bare dinner pick reads as a one-item list", readSlot(pick).items, [pick]);
eq("old eaten flag on the pick carries over", readSlot({ pick: { ...pick, eaten: true } }).eaten, true);
eq("items win over a stale none", readSlot({ none: true, items: [fish] }), { items: [fish], none: false, eaten: false });
eq("writing items keeps eaten", writeSlot({ items: [fish, stick], eaten: true }), { items: [fish, stick], eaten: true });
eq("writing strips extra fields off picks", writeSlot({ items: [{ ...fish, eaten: true, junk: 1 }] }), { items: [fish] });
eq("writing none", writeSlot({ items: [], none: true }), { none: true });
eq("writing nothing deletes the slot", writeSlot({ items: [] }), null);
eq("text picks match by name, others by id", [samePick(pick, { ...pick, name: "renamed" }), samePick({ kind: "text", name: "Toast" }, { kind: "text", name: "toast" })], [true, true]);

console.log("\nkitchen config:");
const legacyKitchen = kitchenConfig({});
eq("a kitchen from before people were editable keeps its four keys", legacyKitchen.active.map((p) => p.key), ["josh", "ashley", "cam", "bodhi"]);
eq(
  "and today's layout: three per-person meals, two shared",
  legacyKitchen.sections.map((s) => `${s.key}:${s.mode}`),
  ["breakfast:each", "lunch:each", "snack:each", "dinner:all", "dessert:all"]
);
const cousin = kitchenConfig({
  people: [
    { key: "pa", name: "Sam", active: true },
    { key: "pb", name: "Alex", active: true },
    { key: "pc", name: "Riley", active: false },
  ],
  sections: { breakfast: { mode: "all" }, snack: { mode: "each", people: ["pb", "pc"] }, dinner: { mode: "each", people: [] } },
});
eq("removed people keep their name but lose their rows", [cousin.people.length, cousin.active.map((p) => p.name)], [3, ["Sam", "Alex"]]);
eq("a section can be shared", cousin.sections[0].mode, "all");
eq("a per-person section lists only chosen, active people", cousin.sections[2].people.map((p) => p.name), ["Alex"]);
eq("a section with nobody chosen is hidden", shownSections(cousin).map((s) => s.key), ["breakfast", "lunch", "snack", "dessert"]);
eq("junk keys (and the reserved 'all') are dropped", kitchenConfig({ people: [{ key: "all", name: "x" }, { key: "a.b", name: "y" }, { key: "ok", name: "" }] }).people, [
  { key: "ok", name: "Someone", active: true },
]);
let seq = [0.1, 0.1, 0.5];
const fixed = () => seq.shift();
const k1 = newPersonKey([], () => 0.1);
eq("person keys are short and field-name safe", /^p[a-z0-9]{6}$/.test(k1), true);
eq("a key already taken is never reused", newPersonKey([k1], fixed) !== k1, true);
eq("makePeople gives everyone a distinct key", new Set(makePeople(["A", "B", "C"]).map((p) => p.key)).size, 3);

console.log("\ndays by mode:");
const ok = (d) => readDay(d, legacyKitchen);
eq("slots live at section.person or section.all", [slotPath("breakfast", "cam"), slotPath("dinner", null)], ["breakfast.cam", "dinner.all"]);
eq("old bare dinner slot reads as the shared slot", ok({ dinner: { items: [pick] } }).dinner.shared.items, [pick]);
eq("new dinner.all reads as the shared slot", ok({ dinner: { all: { items: [fish] } } }).dinner.shared.items, [fish]);
eq("old bare single-pick dessert still reads", ok({ dessert: pick }).dessert.shared.items, [pick]);
eq("old per-person { pick } reads", ok({ breakfast: { cam: { pick } } }).breakfast.byPerson.cam.items, [pick]);
eq("a shared and a per-person slot can sit in one section", ok({ lunch: { all: { items: [fish] }, cam: { items: [stick] } } }).lunch.shared.items, [fish]);
eq("old dinnerMod reads as dinner's mods", ok({ dinnerMod: "Cam: plain" }).mods.dinner, "Cam: plain");
eq("mods.dinner wins over the old field", ok({ dinnerMod: "old", mods: { dinner: "new" } }).mods.dinner, "new");
eq("isLegacyShared spots old bare slots only", [isLegacyShared({ items: [] }), isLegacyShared(pick), isLegacyShared({ all: {} }), isLegacyShared({ cam: {} })], [true, true, false, false]);
const shared = kitchenConfig({ sections: { breakfast: { mode: "all" } } });
eq("a shared breakfast is one row", sectionSlots(shared.sections[0], readDay({ breakfast: { all: { items: [pick] } } }, shared)).map((r) => [r.person, r.slot.items.length]), [[null, 1]]);

console.log("\nold snacks:");
const legacy = ok({ snacks: [fish, stick] });
eq("old Snack 1 lands on Cam", legacy.snack.byPerson.cam.items, [fish]);
eq("old Snack 2 lands on Bodhi", legacy.snack.byPerson.bodhi.items, [stick]);
eq("Josh and Ashley start undecided", [slotState(legacy.snack.byPerson.josh), slotState(legacy.snack.byPerson.ashley)], ["undecided", "undecided"]);
eq("once snacks are per person the old array is ignored", ok({ snack: { josh: { items: [fish] } }, snacks: [stick] }).snack.byPerson.cam.items, []);
eq("a kitchen without a Cam just doesn't map it", readDay({ snacks: [fish] }, cousin).snack.byPerson, { pb: { items: [], none: false, eaten: false } });

console.log("\nprogress:");
const all = (v) => Object.fromEntries(legacyKitchen.active.map((p) => [p.key, v]));
const fullDay = {
  breakfast: all({ none: true }),
  lunch: all({ items: [pick] }),
  snack: all({ items: [fish, stick] }),
  dinner: { items: [pick, fish] },
  dessert: pick,
};
eq("an untouched day is 0 of 14", dayProgress(undefined, legacyKitchen), { done: 0, total: 14 });
eq("a fully settled day is 14 of 14, old and new shapes mixed", dayProgress(fullDay, legacyKitchen), { done: 14, total: 14 });
eq("old two-slot snacks count toward Cam and Bodhi", dayProgress({ snacks: [fish, null] }, legacyKitchen), { done: 1, total: 14 });
eq("counts follow the kitchen: shared breakfast, 2 lunches, 1 snack, dessert", dayProgress({ breakfast: { all: { none: true } } }, cousin), { done: 1, total: 5 });

console.log("\nrecipes:");
eq("bare domains become links", normalizeLink("example.com/pesto"), "https://example.com/pesto");
eq("full links pass through", normalizeLink("https://a.co/x?y=1"), "https://a.co/x?y=1");
eq("prose is not a link", normalizeLink("grandma's card"), "");
eq(
  "ratings tally ignores junk values",
  ratingSummary({ josh: "up", ashley: "down", cam: "up", bodhi: "meh" }),
  { up: 2, down: 1, rated: 3 }
);

console.log("\nages:");
const now = new Date(2026, 8, 22, 9, 0);
eq("same day", ageLabel(new Date(2026, 8, 22, 0, 5), now), "today");
eq("late last night is yesterday", ageLabel(new Date(2026, 8, 21, 23, 55), now), "yesterday");
eq("days", ageLabel(new Date(2026, 8, 17), now), "5 days ago");
eq("weeks", ageLabel(new Date(2026, 7, 25), now), "4 weeks ago");

console.log("\ninventory lifecycle:");
const d = (day) => new Date(2026, 8, day);
const inv = [
  { id: "a", name: "milk", addedAt: d(20), usedAt: null },
  { id: "b", name: "Eggs", addedAt: d(22), usedAt: d(23) },
  { id: "c", name: "coffee", addedAt: null, usedAt: null, onList: true },
  { id: "d", name: "apples", addedAt: d(22), usedAt: null },
];
eq("bought and not used is in stock", itemState(inv[0]), "stock");
eq("struck through is used", itemState(inv[1]), "used");
eq("never bought is wanted", itemState(inv[2]), "wanted");
eq("only stock feeds the plan's pickers", inv.filter(inStock).map((i) => i.id), ["a", "d"]);
eq("names match case-insensitively", findByName(inv, "  EGGS ")?.id, "b");
eq(
  "adding revives existing rows instead of duplicating",
  matchNames(["Milk", "bread", "eggs"], inv).map((m) => [m.name, m.existing?.id || null]),
  [["Milk", "a"], ["bread", null], ["eggs", "b"]]
);
eq("A to Z", sortItems(inv).map((i) => i.name), ["apples", "coffee", "Eggs", "milk"]);
eq("Z to A", sortItems(inv, "name", "desc").map((i) => i.name), ["milk", "Eggs", "coffee", "apples"]);
eq("newest first, names break ties, never-bought last", sortItems(inv, "added").map((i) => i.id), ["d", "b", "a", "c"]);
eq("oldest first flips it", sortItems(inv, "added", "desc").map((i) => i.id), ["c", "a", "b", "d"]);

console.log("\nmade dates:");
eq("a later plan day moves last made forward", laterKey("2026-09-20", "2026-09-23"), "2026-09-23");
eq("an older plan day never moves it back", laterKey("2026-09-23", "2026-09-20"), "2026-09-23");
eq("first time made", laterKey(null, "2026-09-23"), "2026-09-23");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
