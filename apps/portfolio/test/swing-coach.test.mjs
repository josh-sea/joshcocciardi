/**
 * Swing Coach: geometry tests.
 *
 * The page is one static file with its analysis engine inlined, so this
 * suite pulls the engine straight out of the shipped HTML and drives it with
 * synthetic swings built from angles. That way the thing under test is
 * literally the thing that gets deployed — it cannot drift from a copy.
 *
 * Dependency-free. From apps/portfolio:  node test/swing-coach.test.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PAGE = new URL("../public/projects/swing-coach/index.html", import.meta.url);

/* ---- lift the engine out of the page ---- */

const html = fs.readFileSync(PAGE, "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!script) throw new Error("no module script found in the swing coach page");

const afterImport = script[1].split('vision_bundle.mjs";')[1];
if (!afterImport) throw new Error("the MediaPipe import line moved; update this test");

const engine = afterImport.split("/* ==================================================================\n   Page wiring")[0];
if (engine.length < 2000) throw new Error("the engine section came out suspiciously small");

const tmp = path.join(os.tmpdir(), `swing-engine-${process.pid}.mjs`);
fs.writeFileSync(tmp, engine + "\nexport { L, cfg, readFrame, buildSeries, findPhases, buildReport };\n");
process.on("exit", () => { try { fs.unlinkSync(tmp); } catch {} });

const { L, cfg, readFrame, buildSeries, findPhases, buildReport } =
  await import(`file://${tmp}`);

/* ---- a swing, built from angles rather than pixels ---- */

const RAD = Math.PI / 180;
const logistic = (x) => 1 / (1 + Math.exp(-x));
/** Ease from a to b, fastest at tc. Differentiating it gives a clean peak. */
const ramp = (t, tc, w, a, b) => a + (b - a) * logistic((t - tc) / w);

const VW = 720, VH = 1280;

const DEFAULTS = {
  hipPeak: 1.500,   // hips reach top speed here
  shPeak: 1.555,    // shoulders 55 ms later, which is the order we want
  coil: -38,        // shoulder turn away from the target during the load
  lean: 14,         // forward hinge at the hips
  stance: 0.44,     // metres between the ankles, against 0.40 of shoulder
  handsUp: 0.05,
  frontStraight: true,
  drift: 0.03,      // metres the head travels
};

function bodyAt(t, o) {
  const hipYaw  = ramp(t, 1.00, 0.09, 0, -12) + ramp(t, o.hipPeak, 0.045, 0, 67);
  const shYaw   = ramp(t, 1.00, 0.09, 0, o.coil) + ramp(t, o.shPeak, 0.050, 0, 78);
  const handAng = ramp(t, 1.00, 0.09, 0, -50) + ramp(t, 1.600, 0.050, 0, 150);
  const frontOff = ramp(t, 1.52, 0.05, 0.14, o.frontStraight ? 0.005 : 0.13);
  const headDx  = ramp(t, 1.55, 0.08, 0, o.drift);

  const pt = (x, y, z) => ({ x, y, z });
  const pair = (halfW, yaw, y) => [
    pt(-halfW * Math.cos(yaw * RAD), y, -halfW * Math.sin(yaw * RAD)),
    pt( halfW * Math.cos(yaw * RAD), y,  halfW * Math.sin(yaw * RAD)),
  ];

  const [hipL, hipR] = pair(0.16, hipYaw, 0);
  const shY = -0.45 * Math.cos(o.lean * RAD);
  const shPush = 0.45 * Math.sin(o.lean * RAD);
  const [shL0, shR0] = pair(0.20, shYaw, shY);
  const shL = pt(shL0.x, shL0.y, shL0.z + shPush);
  const shR = pt(shR0.x, shR0.y, shR0.z + shPush);

  const half = o.stance / 2;
  const ankL = pt(-half, 0.85, 0), ankR = pt(half, 0.85, 0);
  const kneeL = pt((hipL.x + ankL.x) / 2 - frontOff, 0.42, 0);
  const kneeR = pt((hipR.x + ankR.x) / 2 + 0.14, 0.42, 0);

  const r = 0.34;
  const hand = pt(r * Math.cos(handAng * RAD), shY + o.handsUp, r * Math.sin(handAng * RAD) + shPush);
  const wrL = pt(hand.x - 0.02, hand.y, hand.z);
  const wrR = pt(hand.x + 0.02, hand.y, hand.z);
  const elL = pt((shL.x + wrL.x) / 2 - 0.06, (shL.y + wrL.y) / 2, (shL.z + wrL.z) / 2);
  const elR = pt((shR.x + wrR.x) / 2 + 0.06, (shR.y + wrR.y) / 2, (shR.z + wrR.z) / 2);
  const nose = pt(0.02 + headDx, shY - 0.23, shPush);

  const wl = [];
  const put = (i, p) => { wl[i] = p; };
  put(L.NOSE, nose); put(L.SH_L, shL); put(L.SH_R, shR);
  put(L.EL_L, elL); put(L.EL_R, elR); put(L.WR_L, wrL); put(L.WR_R, wrR);
  put(L.HIP_L, hipL); put(L.HIP_R, hipR);
  put(L.KNEE_L, kneeL); put(L.KNEE_R, kneeR);
  put(L.ANK_L, ankL); put(L.ANK_R, ankR);
  put(L.HEEL_L, ankL); put(L.HEEL_R, ankR); put(L.TOE_L, ankL); put(L.TOE_R, ankR);
  for (let i = 0; i <= 32; i++) if (!wl[i]) wl[i] = pt(0, 0, 0);

  // Orthographic projection, which is all the frame-space checks need.
  const lm = wl.map((p) => ({ x: 0.5 + p.x / 2.0, y: 0.5 + (p.y + 0.2) / 2.0, z: p.z, visibility: 0.95 }));
  return { lm, wl };
}

function run(fps = 30, over = {}, seconds = 3) {
  const o = { ...DEFAULTS, ...over };
  const frames = [];
  for (let i = 0; i <= Math.round(seconds * fps); i++) {
    const t = i / fps;
    const { lm, wl } = bodyAt(t, o);
    frames.push(readFrame(lm, wl, t, VW, VH));
  }
  const series = buildSeries(frames);
  const phases = series && findPhases(series);
  return { series, phases, report: series && phases ? buildReport(series, phases) : null };
}

/* ---- harness ---- */

let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const byId = (report) => Object.fromEntries(report.cards.map((c) => [c.id, c]));

/* ---- cases ---- */

console.log("\n── a good right-handed swing, face on, 30 fps ──");
cfg.sport = "baseball"; cfg.hand = "right"; cfg.view = "face";
let { series, phases, report } = run(30);
const at = (i) => series.t[i].toFixed(3);
console.log(`    setup ${at(phases.setupStart)}–${at(phases.setupEnd)} · coil ${at(phases.load)} · launch ${at(phases.launch)} · contact ${at(phases.contact)} · finish ${at(phases.finish)}`);

check("contact lands within a frame of the modelled 1.60s", Math.abs(series.t[phases.contact] - 1.60) < 0.05, `${at(phases.contact)}s`);
check("the phases come out in order",
  phases.setupEnd < phases.launch && phases.launch < phases.contact && phases.contact < phases.finish);
check("all ten face-on checks graded", report.cards.length === 10, `${report.cards.length}`);
check("nothing sits out from a face-on camera", report.skipped.length === 0);
let g = byId(report);
check("stance reads good", g.stance.status === "good", g.stance.value);
check("knee bend reads good", g.knees.status === "good", g.knees.value);
check("a 14° hinge reads good for baseball", g.posture.status === "good", g.posture.value);
check("the coil is seen", g.separation.status === "good", g.separation.value);
check("the hips read as leading", g.sequence.status === "good", g.sequence.value);
check("the front leg reads as posting up", g.frontLeg.status === "good", g.frontLeg.value);
check("a quiet head reads good", g.head.status === "good", g.head.value);
check("no check came back unknown", report.cards.every((c) => c.status !== "unknown"));

console.log("\n── shoulders fire before the hips ──");
({ report } = run(30, { hipPeak: 1.575, shPeak: 1.500 }));
g = byId(report);
check("the sequence is flagged", g.sequence.status === "fix", g.sequence.value);
check("the cue says to start with the hips", /hips/i.test(g.sequence.cue));

console.log("\n── no coil, feet way too wide, head flying, front leg collapsing ──");
({ report } = run(30, { coil: -6, stance: 0.95, drift: 0.30, frontStraight: false }));
g = byId(report);
check("no coil is caught", g.separation.status !== "good", g.separation.value);
check("a 2.4x stance is caught", g.stance.status === "fix", g.stance.value);
check("30 cm of head drift is caught", g.head.status !== "good", g.head.value);
check("a collapsing front leg is caught", g.frontLeg.status !== "good", g.frontLeg.value);

console.log("\n── standing bolt upright ──");
({ report } = run(30, { lean: 1 }));
g = byId(report);
check("no hinge is caught", g.posture.status === "fix", g.posture.value);
check("the cue says to hinge", /hinge/i.test(g.posture.cue));

console.log("\n── camera down the line ──");
cfg.view = "line";
({ report } = run(30));
check("the four view-dependent checks sit out", report.skipped.length === 4, report.skipped.join(", "));
check("stance, head and finish are among them",
  ["Stance width", "Head movement", "Finish"].every((n) => report.skipped.includes(n)));
check("the rest still grade", report.cards.length === 6, `${report.cards.length}`);

console.log("\n── golf ──");
cfg.view = "face"; cfg.sport = "golf";
({ report } = run(30, { lean: 32 }));
g = byId(report);
check("hand position and back elbow are switched off for golf", !g.hands && !g.backElbow);
check("and are not reported as sitting out either", !report.skipped.includes("Hand position"));
check("a 32° hinge is right for golf", g.posture.status === "good", g.posture.value);
check("golf asks for more coil than baseball", g.separation.status !== "good", g.separation.value);
cfg.sport = "baseball";

console.log("\n── a lefty ──");
cfg.hand = "left";
({ report } = run(30, { frontStraight: false }));
check("the lefty's front leg is the right one, so the other leg straightening is ignored",
  byId(report).frontLeg.status !== "good", byId(report).frontLeg.value);
cfg.hand = "right";

console.log("\n── nothing to read ──");
const still = [];
for (let i = 0; i <= 90; i++) {
  const { lm, wl } = bodyAt(0.5, DEFAULTS);
  still.push(readFrame(lm, wl, i / 30, VW, VH));
}
check("a clip of somebody standing still reports no swing", findPhases(buildSeries(still)) === null);
check("under six usable frames gives up rather than guessing", buildSeries(still.slice(0, 5)) === null);

console.log("\n── slow motion buys timing resolution ──");
const gapMs = (r) => Number((byId(r.report).sequence.value.match(/(\d+)/) || [])[1]);
const slow = run(120), fast = run(30);
console.log(`    30 fps reads a ${gapMs(fast)} ms hip-to-shoulder gap, 120 fps reads ${gapMs(slow)} ms (modelled: 55 ms)`);
check("120 fps lands closer to the truth", Math.abs(gapMs(slow) - 55) <= Math.abs(gapMs(fast) - 55));

console.log(`\n${failed === 0 ? "Swing Coach: all checks passed" : `Swing Coach: ${failed} check(s) failed`}\n`);
process.exit(failed ? 1 : 0);
