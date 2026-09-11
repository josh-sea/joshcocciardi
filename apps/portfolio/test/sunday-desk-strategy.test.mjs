// Bye-week reporting, checked against the real 2026 NFL schedule and a real
// roster. ESPN's pro-schedule endpoint is public, so this test talks to it
// directly — if the league's byes move, the test moves with them.
//
//   node src/tools/sunday-desk/test/strategy.test.mjs

import { byeReport, injuryReport, injurySeverity, requiredStarters } from "../src/tools/sunday-desk/strategy.js";

const SEASON = 2026;
const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}?view=proTeamSchedules_wl`;

const res = await fetch(url);
const data = await res.json();
const byTeam = {};
const abbrev = {};
(data?.settings?.proTeams || []).forEach((t) => {
  if (t.byeWeek) byTeam[t.id] = t.byeWeek;
  abbrev[t.abbrev] = t.id;
});

const P = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DST: 16 };
const mk = (name, pos, team, slotId) => ({
  slotId,
  bench: slotId === 20,
  player: { id: name, fullName: name, defaultPositionId: P[pos], proTeamId: abbrev[team] },
});

// The real roster, as drafted.
const roster = [
  mk("Jaxson Dart", "QB", "NYG", 0),
  mk("Bijan Robinson", "RB", "ATL", 2),
  mk("Quinshon Judkins", "RB", "CLE", 2),
  mk("Chris Olave", "WR", "NO", 4),
  mk("Carnell Tate", "WR", "TEN", 4),
  mk("Trey McBride", "TE", "ARI", 6),
  mk("Cam Skattebo", "RB", "NYG", 23),
  mk("Steelers D/ST", "DST", "PIT", 16),
  mk("Cam Little", "K", "JAX", 17),
  mk("Jonathon Brooks", "RB", "CAR", 20),
  mk("Rico Dowdle", "RB", "PIT", 20),
  mk("Jordan Addison", "WR", "MIN", 20),
  mk("Matthew Golden", "WR", "GB", 20),
  mk("Tyler Allgeier", "RB", "ARI", 20),
];

let pass = 0, fail = 0;
const t = (label, cond, detail) => {
  if (cond) { console.log("  PASS", label); pass++; }
  else { console.log("  FAIL", label, detail !== undefined ? "→ " + JSON.stringify(detail) : ""); fail++; }
};

console.log("bye weeks from ESPN's live schedule:");
t("week 11 is the six-team week", [abbrev.ATL, abbrev.CLE, abbrev.GB, abbrev.LAR, abbrev.NE, abbrev.SEA].every((id) => byTeam[id] === 11));

const required = requiredStarters(null, roster);
console.log("\nrequired starters derived from the lineup:", JSON.stringify(required));
t("nine starters in total", Object.values(required).reduce((a, b) => a + b, 0) === 9, required);
t("two RB, two WR, one flex", required.RB === 2 && required.WR === 2 && required.FLEX === 1, required);

const weeks = byeReport({ roster, byeByProTeam: byTeam, required, fromWeek: 1 });
const at = (w) => weeks.find((x) => x.week === w);
console.log("\nbye report:");
weeks.forEach((w) =>
  console.log(`  week ${String(w.week).padStart(2)} [${w.severity}] ${w.off.length} off` +
    (w.shortfalls.length ? "  CANNOT FILL: " + w.shortfalls.map((s) => `${s.pos} ${s.have}/${s.need}`).join(", ") : ""))
);

console.log("\nassertions:");
t("week 8 is flagged (Dart, Olave and Skattebo all off)", at(8) && at(8).off.length === 3, at(8)?.off.map((e) => e.player.fullName));
t("week 8 leaves no quarterback", at(8)?.shortfalls.some((s) => s.pos === "QB"), at(8)?.shortfalls);
t("week 14 leaves no tight end", at(14)?.shortfalls.some((s) => s.pos === "TE"), at(14)?.shortfalls);
t("week 11 takes both starting RBs but the bench covers it",
  at(11) && at(11).off.length === 3 && !at(11).shortfalls.some((s) => s.pos === "RB"), at(11)?.shortfalls);
t("a week with nobody off is omitted entirely", !at(12) && !at(15));

console.log("\ninjury severity:");
t("OUT is out", injurySeverity("OUT") === "out");
t("INJURY_RESERVE is out", injurySeverity("INJURY_RESERVE") === "out");
t("QUESTIONABLE is a watch", injurySeverity("QUESTIONABLE") === "watch");
t("ACTIVE is neither", injurySeverity("ACTIVE") === null);

const hurt = [{ ...roster[1], player: { ...roster[1].player, injuryStatus: "OUT" } }];
const availablePool = [
  { player: { id: "a1", fullName: "Backup Falcon", defaultPositionId: P.RB, proTeamId: abbrev.ATL, stats: [{ scoringPeriodId: 1, statSourceId: 1, appliedTotal: 9 }] } },
  { player: { id: "a2", fullName: "Better Falcon", defaultPositionId: P.RB, proTeamId: abbrev.ATL, stats: [{ scoringPeriodId: 1, statSourceId: 1, appliedTotal: 14 }] } },
  { player: { id: "a3", fullName: "Wrong Team", defaultPositionId: P.RB, proTeamId: abbrev.SEA, stats: [] } },
  { player: { id: "a4", fullName: "Wrong Position", defaultPositionId: P.WR, proTeamId: abbrev.ATL, stats: [] } },
];
const inj = injuryReport({ roster: hurt, available: availablePool, week: 1 });
console.log("\nreplacement search:");
t("finds the injured starter", inj.length === 1 && inj[0].severity === "out");
t("keeps only same team and same position", inj[0].candidates.length === 2, inj[0].candidates.map((c) => c.fullName));
t("ranks the higher projection first", inj[0].candidates[0].fullName === "Better Falcon", inj[0].candidates.map((c) => c.fullName));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
