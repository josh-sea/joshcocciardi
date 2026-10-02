// Pure-helper tests for Seasonal Box HQ: season dates and milestone risk,
// inbox ordering, the seed agents' internal consistency, and that the
// client's copy of the stage machine and action registry matches the one the
// Cloud Functions enforce. No dependencies and no emulator:
//
//   cd apps/portfolio
//   node test/seasonal-box.test.mjs

import { createRequire } from "module";
import {
  addDays,
  daysBetween,
  lockDateFor,
  milestoneStatus,
  milestonesFor,
  nextMilestone,
  parseDay,
  seasonTimeline,
  sortInbox,
  suggestSeasonName,
  usd,
} from "../src/tools/seasonal-box/pipeline.js";
import { ACTIONS, BRIEF_LABELS, DEFAULT_AGENTS, DEFAULT_SETTINGS, DEFAULT_TIMELINE, ORGS, READ_SCOPES, STAGES, TOOL_NAMES } from "../src/tools/seasonal-box/seed.js";

const require = createRequire(import.meta.url);
const server = require("../../../functions/seasonalbox/config.js");

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const ok = (label, cond) => eq(label, !!cond, true);

console.log("dates:");
eq("addDays crosses a month", addDays("2027-01-30", 3), "2027-02-02");
eq("addDays crosses a year backwards", addDays("2027-01-03", -7), "2026-12-27");
eq("addDays across the March DST change", addDays("2027-03-10", 7), "2027-03-17");
eq("addDays across the November DST change", addDays("2027-11-03", 7), "2027-11-10");
eq("daysBetween", daysBetween("2027-03-01", "2027-03-15"), 14);
eq("daysBetween negative", daysBetween("2027-03-15", "2027-03-01"), -14);
eq("parseDay rejects junk", parseDay("March 3"), null);
eq("addDays on junk", addDays("nope", 3), null);

console.log("timeline:");
const ship = "2027-11-15";
const ms = milestonesFor(ship, DEFAULT_TIMELINE);
eq("Trend Brief due 22 weeks before ship", ms.find((m) => m.key === "trendDue").date, "2027-06-14");
eq("lock 5 weeks before ship", lockDateFor(ship, DEFAULT_TIMELINE), "2027-10-11");
eq("retro 6 weeks after ship", ms.find((m) => m.key === "retro").date, "2027-12-27");
eq("ship milestone is the ship date", ms.find((m) => m.key === "ship").date, ship);
ok("milestones are in date order", ms.every((m, i) => i === 0 || m.date >= ms[i - 1].date));
ok("every milestone's stage is reachable", DEFAULT_TIMELINE.every((m) => m.reach >= 2 && m.reach <= 12));

console.log("milestone status:");
const m = { reach: 3, date: "2027-06-14" };
eq("met once the season reaches the stage", milestoneStatus(m, 3, false, "2027-07-01"), "done");
eq("overdue past the date", milestoneStatus(m, 2, false, "2027-06-15"), "overdue");
eq("at risk inside the window", milestoneStatus(m, 2, false, "2027-06-10", 7), "at-risk");
eq("at risk on the day itself", milestoneStatus(m, 2, false, "2027-06-14", 7), "at-risk");
eq("upcoming outside the window", milestoneStatus(m, 2, false, "2027-05-01", 7), "upcoming");
eq("everything done on a complete season", milestoneStatus(m, 1, true, "2030-01-01"), "done");

const season = { shipDate: ship, lockDate: "2027-10-01", stage: 2, status: "active" };
const tl = seasonTimeline(season, DEFAULT_TIMELINE, "2027-06-10", 7);
eq("an explicit lock date wins over the computed one", tl.find((x) => x.key === "lock").date, "2027-10-01");
eq("next milestone is the first unmet one", nextMilestone(season, DEFAULT_TIMELINE, "2027-06-10", 7).key, "trendDue");
eq("no ship date, no timeline", seasonTimeline({ stage: 1 }, DEFAULT_TIMELINE, "2027-01-01", 7), []);

console.log("names and money:");
eq("November ships as Holiday", suggestSeasonName("2027-11-15"), "Holiday 2027");
eq("March ships as Spring", suggestSeasonName("2027-03-20"), "Spring 2027");
eq("August ships as Summer", suggestSeasonName("2027-08-01"), "Summer 2027");
eq("September ships as Fall", suggestSeasonName("2027-09-10"), "Fall 2027");
eq("January ships as Winter", suggestSeasonName("2028-01-10"), "Winter 2028");
eq("usd", usd(1234.5), "$1,234.50");
eq("usd keeps sub-cent costs visible", usd(0.0042), "$0.0042");
eq("usd whole dollars", usd(150, { cents: false }), "$150");

console.log("inbox order:");
const order = sortInbox([
  { id: "late-yellow", level: "yellow", deadline: "2027-06-20", createdAt: 1 },
  { id: "none-red", level: "red", createdAt: 1 },
  { id: "soon-yellow", level: "yellow", deadline: "2027-06-10", createdAt: 5 },
  { id: "soon-red", level: "red", deadline: "2027-06-10", createdAt: 9 },
  { id: "none-yellow-old", level: "yellow", createdAt: 0 },
]).map((p) => p.id);
eq("deadline first, then red before yellow, then oldest", order, ["soon-red", "soon-yellow", "late-yellow", "none-red", "none-yellow-old"]);

console.log("client and server agree:");
eq("stages match functions/seasonalbox/config.js", STAGES, server.STAGES);
eq("actions match functions/seasonalbox/config.js", ACTIONS, server.ACTIONS);
eq("default budgets match", DEFAULT_SETTINGS.budgets, server.DEFAULT_SETTINGS.budgets);
eq("default threshold matches", DEFAULT_SETTINGS.thresholds, server.DEFAULT_SETTINGS.thresholds);
eq("tiers route to the three spec models", server.TIERS, { light: "claude-haiku-4-5-20251001", standard: "claude-sonnet-5-5", heavy: "claude-opus-5-5" });
ok("no tier routes to Fable", !Object.values(server.TIERS).some((x) => x.includes("fable")));

console.log("seed agents:");
const ids = DEFAULT_AGENTS.map((a) => a.id);
eq("ten agents", ids.length, 10);
eq("ids are unique", new Set(ids).size, ids.length);
ok("every stage owner is an agent", STAGES.every((s) => ids.includes(s.owner)));
const orgIds = ORGS.map((o) => o.id);
for (const a of DEFAULT_AGENTS) {
  const where = `${a.id}:`;
  ok(`${where} org exists`, orgIds.includes(a.org));
  ok(`${where} tier is light, standard, or heavy`, ["light", "standard", "heavy"].includes(a.modelTier));
  ok(`${where} tools are all known`, a.tools.every((t) => TOOL_NAMES.includes(t)));
  ok(`${where} read scopes are all known`, a.readScopes.every((s) => READ_SCOPES.includes(s)));
  ok(`${where} brief type has a label`, !!BRIEF_LABELS[a.briefType]);
  ok(`${where} input briefs are known types`, a.inputBriefTypes.every((t) => !!BRIEF_LABELS[t]));
  ok(`${where} proposable actions exist and aren't internal-only`, a.actionTypes.every((t) => ACTIONS[t] && !["brief.approve", "budget.continue"].includes(t)));
  ok(`${where} propose_action iff it has actions`, a.tools.includes("propose_action") === a.actionTypes.length > 0);
  ok(`${where} no money action is green`, Object.entries(a.autonomy).every(([k, v]) => !(ACTIONS[k]?.money && v === "green")));
  ok(`${where} has a prompt and schema`, a.systemPrompt.length > 200 && a.outputSchema.length > 20);
  ok(`${where} budgets are positive`, a.budgets.perRunUsd > 0 && a.budgets.perDayUsd >= a.budgets.perRunUsd);
  ok(`${where} prompt has no em dashes`, !a.systemPrompt.includes("—"));
}
ok("only the Orchestrator's brief is auto-accepted", DEFAULT_AGENTS.filter((a) => a.briefLevel === "green").map((a) => a.id).join() === "orchestrator");
ok("Trend, Box Plan, Quote and Retro briefs are red", ["trend-researcher", "box-curator", "procurement", "analyst"].every((id) => DEFAULT_AGENTS.find((a) => a.id === id).briefLevel === "red"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
