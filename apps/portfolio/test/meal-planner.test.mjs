// Pure-helper tests for the Family Meal Planner: the week math (Monday
// through Sunday, local calendar days), the inventory splitter, and the
// per-person slot states. No dependencies and no emulator:
//
//   cd apps/portfolio
//   node test/meal-planner.test.mjs

import {
  PEOPLE,
  addDays,
  ageLabel,
  dayProgress,
  mondayOf,
  normalizeLink,
  ratingSummary,
  slotState,
  splitItems,
  weekDays,
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
eq("absent entry is undecided", slotState(undefined), "undecided");
eq("a pick is a meal", slotState({ pick: { kind: "text", id: null, name: "Cereal" } }), "meal");
eq("none wins over a stale pick", slotState({ none: true, pick: { kind: "text", name: "x" } }), "none");
eq("an empty pick name is still undecided", slotState({ pick: { kind: "text", name: "" } }), "undecided");

const pick = { kind: "recipe", id: "r1", name: "Pesto pasta" };
const fullDay = {
  breakfast: Object.fromEntries(PEOPLE.map((p) => [p.key, { none: true }])),
  lunch: Object.fromEntries(PEOPLE.map((p) => [p.key, { pick }])),
  snacks: [pick, pick],
  dinner: pick,
  dessert: pick,
};
eq("an untouched day is 0 of 12", dayProgress(undefined), { done: 0, total: 12 });
eq("a fully settled day is 12 of 12", dayProgress(fullDay), { done: 12, total: 12 });
eq("one snack of two counts once", dayProgress({ snacks: [pick, null] }), { done: 1, total: 12 });

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
