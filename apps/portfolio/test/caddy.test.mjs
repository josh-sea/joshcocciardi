/**
 * Golf Caddy: distance model, geometry and the recommendation engine.
 *
 * Dependency-free and offline — the elevation lookup is driven with a stub.
 * From apps/portfolio:  node test/caddy.test.mjs
 */

import {
  CLUB_CATALOG, STARTER_BAG, effectiveHandicap, baselineCarry,
  playingDistance, rankedBag, recordShot, rollingAverage, lifetimeAverage, believableShot,
  measuredFromShots, bagWithMeasured,
} from "../public/projects/swing-coach/golf/caddy/js/clubs.js";
import {
  distance, bearing, destination, pathLength, pointAlongPath,
  yards, metres, feet, elevations, elevationAdjustmentYards,
} from "../public/projects/swing-coach/golf/caddy/js/geo.js";
import { recommend, shotsToGreen, estimatedHoleYards, remainingYards } from "../public/projects/swing-coach/golf/caddy/js/caddy.js";

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const bagOf = (ids) => ids.map((id) => ({ ...CLUB_CATALOG.find((c) => c.id === id), inBag: true }));

/* ---------------------------------------------------------------- */
console.log("\n── how far a player hits it ──");

check("a scratch player lands at the low-handicap column", baselineCarry("7i", 5) === 164);
check("a 15 handicap lands on its own column", baselineCarry("7i", 15) === 154);
check("a 25 handicap lands on its own column", baselineCarry("7i", 25) === 132);
check("halfway between columns interpolates", near(baselineCarry("7i", 10), 159, 1), `${baselineCarry("7i", 10)}`);
check("a putter has no carry number", baselineCarry("putter", 15) === null);

const monotonic = (h) => {
  const ids = ["driver", "3w", "3h", "4i", "5i", "6i", "7i", "8i", "9i", "pw", "gw", "sw", "lw"];
  const d = ids.map((id) => baselineCarry(id, h));
  return d.every((v, i) => i === 0 || v <= d[i - 1]);
};
check("the bag steps down club by club at 5", monotonic(5));
check("…at 15", monotonic(15));
check("…at 25", monotonic(25));
check("…and at 35, past the end of the table", monotonic(35));

console.log("\n── skill level to a handicap ──");
check("a beginner shooting 110 lands near a 32 handicap",
  near(effectiveHandicap({ skill: "beginner", avgScore: 110 }), 32.3, 0.5),
  effectiveHandicap({ skill: "beginner", avgScore: 110 }).toFixed(1));
check("a beginner with no score given gets a default", effectiveHandicap({ skill: "beginner" }) === 28);
check("an intermediate uses the handicap they entered", effectiveHandicap({ skill: "intermediate", handicap: 12 }) === 12);
check("a pro's plus handicap is allowed", effectiveHandicap({ skill: "pro", handicap: -2 }) === -2);
check("a daft handicap is clamped", effectiveHandicap({ skill: "intermediate", handicap: 99 }) === 32);

console.log("\n── the beginner discount Josh asked about ──");
const h15 = 15, hBeg = effectiveHandicap({ skill: "beginner", avgScore: 110 });
for (const id of ["driver", "7i", "pw"]) {
  const pct = Math.round((baselineCarry(id, hBeg) / baselineCarry(id, h15)) * 100);
  console.log(`    ${id.padEnd(7)} ${String(baselineCarry(id, hBeg)).padStart(3)}y vs ${baselineCarry(id, h15)}y for a 15 handicap  =  ${pct}%`);
}
const driverPct = baselineCarry("driver", hBeg) / baselineCarry("driver", h15);
const pwPct = baselineCarry("pw", hBeg) / baselineCarry("pw", h15);
check("a beginner's driver is near the 75% Josh guessed", near(driverPct, 0.75, 0.06), `${Math.round(driverPct * 100)}%`);
check("but wedges fall off much harder, so one flat percentage would be wrong", pwPct < driverPct - 0.12,
  `driver ${Math.round(driverPct * 100)}% vs wedge ${Math.round(pwPct * 100)}%`);

console.log("\n── which number the caddy plans with ──");
let club = { ...CLUB_CATALOG.find((c) => c.id === "7i"), inBag: true };
check("with nothing logged it uses the estimate", playingDistance(club, 25).source === "estimate");
club = recordShot(club, 120);
club = recordShot(club, 130);
check("two shots is not enough to trust", playingDistance(club, 25).source === "estimate");
club = recordShot(club, 125);
check("three shots and it switches to what it measured", playingDistance(club, 25).source === "measured");
check("and that number is the average of them", playingDistance(club, 25).yards === 125, `${playingDistance(club, 25).yards}`);
check("lifetime and rolling agree while there are only three", lifetimeAverage(club) === rollingAverage(club));
for (const y of [140, 145, 150]) club = recordShot(club, y);
check("rolling five tracks recent form", rollingAverage(club) === 138, `${rollingAverage(club)}`);
check("lifetime averages everything", lifetimeAverage(club) === 135, `${lifetimeAverage(club)}`);
check("rolling can be asked for explicitly", playingDistance(club, 25, { prefer: "rolling" }).yards === 138);
club.carryOverride = 142;
check("a number you typed in beats both", playingDistance(club, 25).source === "yours" && playingDistance(club, 25).yards === 142);

console.log("\n── refusing to learn from a bad mark ──");
check("a normal shot is believed", believableShot(150, 155).ok);
check("so is a poor one, because that is still what the club did", believableShot(95, 155).ok);
check("a wild overshoot is not — that is a mismark", !believableShot(165, 88).ok);
check("and it says why", /well past anything this club does/.test(believableShot(165, 88).why));
check("a duff far too short to be a swing is not", !believableShot(20, 155).ok);
check("with its own reason", /far too short/.test(believableShot(20, 155).why));
// Lopsided on purpose: you can chunk a club to a third of its distance, you
// cannot swing it half again further, so a long outlier is a measurement bug.
check("a chunk down to 40% still counts, because that is a real golf shot", believableShot(155 * 0.4, 155).ok);
check("a career strike 45% long still counts", believableShot(155 * 1.45, 155).ok);
check("but 70% long is rejected as a bad mark", !believableShot(155 * 1.7, 155).ok);
check("with no expectation yet, anything is believed", believableShot(150, null).ok);
check("a zero distance never is", !believableShot(0, 150).ok);

const teach = (club, y) => {
  const expected = playingDistance(club, 25).yards;
  return believableShot(y, expected).ok ? recordShot(club, y) : club;
};
let nine = { ...CLUB_CATALOG.find((c) => c.id === "9i"), inBag: true };
for (const y of [118, 124, 121]) nine = recordShot(nine, y);
const before = lifetimeAverage(nine);
check("three real shots give a 121 yard average", before === 121, `${before}`);
check("a 230 yard mark is thrown out", lifetimeAverage(teach(nine, 230)) === before,
  `${lifetimeAverage(teach(nine, 230))}`);
check("the untouched 88 yard estimate case the browser test hit is caught too",
  !believableShot(165, playingDistance({ ...CLUB_CATALOG.find((c) => c.id === "9i") }, 32).yards).ok);
// Worth being explicit about what this does NOT catch: a mismark only a third
// long sits inside what a swing can plausibly do, so the guard lets it by and
// the averaging has to absorb it.
check("a mismark only 36% long is deliberately let through", believableShot(165, before).ok);
check("and the average absorbs rather than ignores it", lifetimeAverage(teach(nine, 165)) > before,
  `${before} → ${lifetimeAverage(teach(nine, 165))}`);

console.log("\n── geometry ──");
const a = { lat: 41.0534, lng: -73.5387 };
check("a degree of latitude is about 111 km", near(distance(a, { ...a, lat: a.lat + 1 }), 111195, 400),
  `${Math.round(distance(a, { ...a, lat: a.lat + 1 }))} m`);
check("the same point is zero away", distance(a, a) === 0);
check("due north reads as a bearing of 0", near(bearing(a, { ...a, lat: a.lat + 0.01 }), 0, 0.1));
check("due east reads as 90", near(bearing(a, { ...a, lng: a.lng + 0.01 }), 90, 0.1));
const out = destination(a, 45, 200);
check("walking 200 m and measuring back gives 200 m", near(distance(a, out), 200, 0.5), `${distance(a, out).toFixed(2)} m`);
check("and the bearing survives the round trip", near(bearing(a, out), 45, 0.1));

const dogleg = [a, destination(a, 0, 180), destination(destination(a, 0, 180), 70, 140)];
check("a dogleg measures the sum of its legs, not the straight line",
  near(pathLength(dogleg), 320, 0.5) && distance(dogleg[0], dogleg[2]) < 300,
  `path ${Math.round(pathLength(dogleg))} m vs straight ${Math.round(distance(dogleg[0], dogleg[2]))} m`);
check("walking halfway along a dogleg lands on the first leg", pointAlongPath(dogleg, 90).segment === 0);
check("walking past the corner lands on the second", pointAlongPath(dogleg, 250).segment === 1);
check("walking past the end stops at the end", near(distance(pointAlongPath(dogleg, 9999), dogleg[2]), 0, 0.5));
check("walking zero stays put", near(distance(pointAlongPath(dogleg, 0), a), 0, 0.01));

check("yards and metres round-trip", near(yards(metres(150)), 150, 1e-9));
check("a metre is about 3.28 feet", near(feet(1), 3.2808, 0.001));
check("the one-to-one rule turns 9 m of climb into about 10 yards", near(elevationAdjustmentYards(9), 9.84, 0.01));

console.log("\n── elevation lookup ──");
const stubFetch = async (url) => ({
  ok: true,
  json: async () => ({ elevation: url.split("latitude=")[1].split("&")[0].split(",").map((_, i) => 10 + i * 5) }),
});
const el = await elevations([a, out], { fetchImpl: stubFetch });
check("both points come back in one call", el.length === 2 && el[0] === 10 && el[1] === 15);
let threw = false;
try { await elevations([a], { fetchImpl: async () => ({ ok: false, status: 503 }) }); } catch { threw = true; }
check("a failed lookup throws rather than inventing a height", threw);

console.log("\n── the caddy's plan ──");
const bag = bagOf(STARTER_BAG);
const beginner = { bag, handicap: hBeg, skill: "beginner" };

check("a par 3 is one shot to the green", shotsToGreen(3, 1) === 1);
check("a par 4 gives you two", shotsToGreen(4, 1) === 2);
check("a par 5 gives you three", shotsToGreen(5, 1) === 3);
check("and they count down as you play", shotsToGreen(5, 3) === 1);

let r = recommend({ ...beginner, yardsToTarget: 140, par: 3, shotNumber: 1 });
console.log(`    par 3, 140y:  ${r.clubLabel} (${r.clubYards}y) — ${r.intent}`);
check("a par 3 goes straight at the flag", r.intent === "green");
check("and picks a club near the distance", near(r.clubYards, 140, 25), `${r.clubYards}y`);

r = recommend({ ...beginner, yardsToTarget: 480, par: 5, shotNumber: 1 });
console.log(`    par 5, 480y:  ${r.clubLabel} (${r.clubYards}y) — ${r.intent}`);
check("a long par 5 lays up rather than going for it", r.intent === "layup");
check("the strategy says what it leaves behind", /leaves roughly/.test(r.strategy));

r = recommend({ ...beginner, yardsToTarget: 300, par: 4, shotNumber: 2 });
console.log(`    par 4, 300y left on the second: ${r.clubLabel} — reach? ${r.canReach}`);
check("it admits when the green is out of range", r.canReach === false);
check("and says so plainly instead of promising the green", /cannot reach/.test(r.strategy));

r = recommend({ ...beginner, yardsToTarget: 100, par: 4, shotNumber: 3 });
check("a short one in close goes at the flag", r.intent === "green");
check("a beginner is told to keep it simple", /straight/.test(r.aim));
r = recommend({ ...beginner, skill: "pro", handicap: 2, yardsToTarget: 100, par: 4, shotNumber: 3 });
check("a better player gets different advice", !/Nothing clever/.test(r.aim));

console.log("\n── reachable means go at it, whatever par says ──");
// The browser run caught this: 110 yards left on a par 4, counted as shot one,
// had the caddy splitting the par budget in two and laying up to 43 yards with
// a sand wedge. Par decides nothing if the green is already in range.
r = recommend({ ...beginner, yardsToTarget: 110, par: 4, shotNumber: 1 });
console.log(`    par 4, 110y on the tee: ${r.clubLabel} (${r.clubYards}y) — ${r.intent}`);
check("it goes at the green rather than laying up", r.intent === "green");
check("and picks a club that covers the distance, not a wedge", near(r.clubYards, 110, 20), `${r.clubYards}y`);
check("the club is not the shortest in the bag", r.club.id !== "sw" && r.club.id !== "lw", r.clubLabel);

r = recommend({ ...beginner, yardsToTarget: 150, par: 5, shotNumber: 1 });
check("a reachable par 5 second shot goes at it too", r.intent === "green", `${r.clubLabel}`);

r = recommend({ ...beginner, yardsToTarget: 420, par: 4, shotNumber: 1 });
console.log(`    par 4, 420y on the tee: ${r.clubLabel} — ${r.intent}, leaves a ${r.shotsRemaining}-shot plan`);
check("a par 4 out of range still lays up", r.intent === "layup");
check("and names the approach club it is setting up", /close to a full/.test(r.strategy), r.strategy.slice(0, 80));

r = recommend({ ...beginner, yardsToTarget: 600, par: 5, shotNumber: 1 });
check("a monster par 5 counts the shots it still needs", /more shots to cover it/.test(r.strategy), r.strategy.slice(-60));

check("the pick is never shorter than the shortest club", recommend({ ...beginner, yardsToTarget: 5, par: 3, shotNumber: 1 }).clubYards > 0);

console.log("\n── elevation changes the club ──");
const flat = recommend({ ...beginner, yardsToTarget: 150, par: 3, shotNumber: 1 });
const uphill = recommend({ ...beginner, yardsToTarget: 150, riseYards: 25, par: 3, shotNumber: 1 });
console.log(`    flat ${flat.playsLike}y → ${flat.clubLabel};  25y uphill ${uphill.playsLike}y → ${uphill.clubLabel}`);
check("uphill plays longer", uphill.playsLike === 175);
check("and that is explained in words", uphill.notes.some((n) => /above you/.test(n)));
check("it takes at least as much club", uphill.clubYards >= flat.clubYards);
const downhill = recommend({ ...beginner, yardsToTarget: 150, riseYards: -25, par: 3, shotNumber: 1 });
check("downhill plays shorter", downhill.playsLike === 125);
check("and says below rather than above", downhill.notes.some((n) => /below you/.test(n)));

console.log("\n── honesty about its own numbers ──");
r = recommend({ ...beginner, yardsToTarget: 150, par: 3, shotNumber: 1 });
check("it flags that a club distance is still a guess", r.notes.some((n) => /still an estimate/.test(n)));
const taught = bag.map((c) => (c.id === r.club.id ? [1, 2, 3, 4].reduce((k) => recordShot(k, r.clubYards), c) : c));
const r2 = recommend({ ...beginner, bag: taught, yardsToTarget: 150, par: 3, shotNumber: 1 });
check("once taught, it stops saying so", !r2.notes.some((n) => /still an estimate/.test(n)), r2.source);

console.log("\n── how long is the hole, without marking the flag ──");
check("a par 3 is about 160 off the whites", estimatedHoleYards(3, "white") === 152, `${estimatedHoleYards(3, "white")}`);
check("a par 4 off the blues is longer", estimatedHoleYards(4, "blue") > estimatedHoleYards(4, "white"));
check("the reds play shortest", estimatedHoleYards(5, "red") < estimatedHoleYards(5, "gold"));
check("the blacks play longest", estimatedHoleYards(5, "black") > estimatedHoleYards(5, "blue"));
check("an odd par falls back to a par 4", estimatedHoleYards(9, "white") === estimatedHoleYards(4, "white"));
check("an unknown tee just doesn't scale", estimatedHoleYards(4, "purple") === 380);
const card = [3, 4, 5].map((p) => estimatedHoleYards(p, "white"));
check("and the pars come out in order", card[0] < card[1] && card[1] < card[2], card.join(" / "));

console.log("\n── what's left to the green ──");
let rem = remainingYards({ par: 4, teeColor: "blue", progressYards: 0 });
check("off the tee it is the whole hole", rem.yards === estimatedHoleYards(4, "blue"), `${rem.yards}`);
check("and it says the number is an estimate", rem.source === "par" && /estimated/.test(rem.label));
rem = remainingYards({ par: 4, teeColor: "blue", progressYards: 200 });
check("after 200 yards of progress it is 200 shorter", rem.yards === estimatedHoleYards(4, "blue") - 200, `${rem.yards}`);
check("it never goes negative", remainingYards({ par: 3, teeColor: "red", progressYards: 999 }).yards === 0);
rem = remainingYards({ par: 4, teeColor: "blue", pinYards: 143, progressYards: 200 });
check("a dropped pin overrides the estimate entirely", rem.yards === 143 && rem.source === "pin", `${rem.yards} ${rem.source}`);
check("and says so", /flag you dropped/.test(rem.label));

console.log("\n── club averages rebuilt from the shot log ──");
const log = [
  { club: "7i", yards: 118 }, { club: "7i", yards: 124 }, { club: "7i", yards: 121 },
  { club: "driver", yards: 180 }, { club: "putter", yards: 4 },
  { club: "7i", yards: 400 },                      // a mismark
  { club: null, yards: 90 },                       // no club recorded
];
let stats = measuredFromShots(log, 25);
check("good shots are counted", stats["7i"].count === 3, `${stats["7i"].count}`);
check("the mismark is held back, not silently folded in", stats["7i"].rejected === 1);
check("the average is of the real ones", Math.round(stats["7i"].sum / stats["7i"].count) === 121);
check("putts never count", !stats.putter);
check("nor do shots with no club", Object.keys(stats).length === 2, Object.keys(stats).join(","));

// The whole point: change a shot's club afterwards and both move.
const edited = log.map((s, i) => (i === 1 ? { ...s, club: "8i" } : s));
stats = measuredFromShots(edited, 25);
check("re-assigning a shot takes it off the old club", stats["7i"].count === 2);
check("and puts it on the new one", stats["8i"].count === 1 && stats["8i"].sum === 124);
const deleted = log.filter((_, i) => i !== 0);
check("deleting a shot removes its yards for good", measuredFromShots(deleted, 25)["7i"].count === 2);

const rebuilt = bagWithMeasured(bagOf(["7i", "driver", "putter"]), log, 25);
check("the bag comes back with the log's numbers on it",
  rebuilt.find((c) => c.id === "7i").measured.count === 3);
check("and a club with no shots is left empty",
  rebuilt.find((c) => c.id === "putter").measured.count === 0);
check("the derived bag feeds straight into the distance model",
  playingDistance(rebuilt.find((c) => c.id === "7i"), 25).source === "measured");

console.log("\n── an empty bag ──");
const none = recommend({ yardsToTarget: 150, par: 4, shotNumber: 1, bag: [], handicap: 20 });
check("it asks you to add clubs instead of guessing", none.ok === false && /no clubs/.test(none.reason));

console.log(`\n${failed === 0 ? "Caddy: all checks passed" : `Caddy: ${failed} check(s) failed`}\n`);
process.exit(failed ? 1 : 0);
