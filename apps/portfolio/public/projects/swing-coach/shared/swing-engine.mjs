/**
 * Swing Coach — the analysis engine.
 *
 * A pose model finds 33 body landmarks per frame. Everything in this file is
 * geometry on top of that: joint angles, how far the head travels, how fast
 * the hands move, and when the hips and shoulders each hit their peak turn.
 * No DOM, no camera, no model loading — all of that lives in swing-coach.mjs,
 * which keeps this half testable in plain node.
 */



/* ==================================================================
   Swing Coach
   ------------------------------------------------------------------
   A pose model finds 33 body landmarks per frame. Everything below
   that line is geometry: joint angles, how far the head travels, how
   fast the hands move, and when the hips and shoulders each hit their
   peak turn. No bat, no ball, no club — the model cannot see them.
   ================================================================== */

const WASM_BASE  = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker";
const MODELS = {
  lite: `${MODEL_BASE}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  full: `${MODEL_BASE}/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
};

// BlazePose landmark indices
const L = {
  NOSE: 0,
  SH_L: 11, SH_R: 12, EL_L: 13, EL_R: 14, WR_L: 15, WR_R: 16,
  HIP_L: 23, HIP_R: 24, KNEE_L: 25, KNEE_R: 26, ANK_L: 27, ANK_R: 28,
  HEEL_L: 29, HEEL_R: 30, TOE_L: 31, TOE_R: 32,
};
const BONES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [27,29],[29,31],[27,31],[28,30],[30,32],[28,32],
];
const JOINTS = [0,11,12,13,14,15,16,23,24,25,26,27,28];

/* ---------------- small math ---------------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = 180 / Math.PI;

const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len3 = (v) => Math.hypot(v.x, v.y, v.z);
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

/** Interior angle at b, in degrees. */
function angle3(a, b, c) {
  const u = sub3(a, b), v = sub3(c, b);
  const d = len3(u) * len3(v);
  if (d < 1e-6) return NaN;
  return Math.acos(clamp(dot3(u, v) / d, -1, 1)) * DEG;
}

/** Rotation of a left→right body line about the vertical axis, in degrees.
 *  0 means the line is square to the camera; it swings as the body turns. */
function lineYaw(pL, pR) {
  return Math.atan2(pR.z - pL.z, pR.x - pL.x) * DEG;
}

/** Undo the ±180° wrap so a turn reads as one continuous number. */
function unwrap(series) {
  const out = series.slice();
  for (let i = 1; i < out.length; i++) {
    if (!Number.isFinite(out[i]) || !Number.isFinite(out[i - 1])) continue;
    let d = out[i] - out[i - 1];
    while (d > 180) { out[i] -= 360; d -= 360; }
    while (d < -180) { out[i] += 360; d += 360; }
  }
  return out;
}

/** Moving average that steps over gaps rather than poisoning them. */
function smooth(series, half = 1) {
  return series.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = i - half; k <= i + half; k++) {
      const v = series[k];
      if (Number.isFinite(v)) { sum += v; n++; }
    }
    return n ? sum / n : NaN;
  });
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "--");

/* ---------------- configuration ---------------- */

const cfg = {
  mode: "live",      // live | clip
  sport: "baseball", // baseball | golf
  hand: "right",     // which way they swing
  view: "face",      // face | line
  mirror: true,      // front camera shows a mirror image
  voice: true,
};

/** Front side of the body. A righty hits and swings over a left front leg. */
const frontIsLeft = () => cfg.hand === "right";

/* ---------------- per-frame read ---------------- */

/**
 * Turn one set of landmarks into the handful of numbers the checks care about.
 * `wl` is in metres with the hip centre at the origin, so lengths and angles
 * mean the same thing whatever the camera distance. `lm` is in frame space and
 * is what we use for anything measured against the picture, like head drift.
 */
function readFrame(lm, wl, t, videoW, videoH) {
  const vis = (i) => (lm[i]?.visibility ?? 0);
  const px = (i) => ({ x: lm[i].x * videoW, y: lm[i].y * videoH });

  const core = [L.SH_L, L.SH_R, L.HIP_L, L.HIP_R];
  const legs = [L.KNEE_L, L.KNEE_R, L.ANK_L, L.ANK_R];
  const coreOk = core.every((i) => vis(i) > 0.5);
  const legsOk = legs.every((i) => vis(i) > 0.4);
  if (!coreOk) return { t, ok: false, legsOk: false };

  const shMid = mid(wl[L.SH_L], wl[L.SH_R]);
  const hipMid = mid(wl[L.HIP_L], wl[L.HIP_R]);
  const wrMid = mid(wl[L.WR_L], wl[L.WR_R]);

  const shoulderW = len3(sub3(wl[L.SH_L], wl[L.SH_R]));
  const stanceW = legsOk
    ? Math.hypot(wl[L.ANK_L].x - wl[L.ANK_R].x, wl[L.ANK_L].z - wl[L.ANK_R].z)
    : NaN;

  // Torso length in pixels: a body-sized ruler that survives any camera angle.
  const shPx = { x: (lm[L.SH_L].x + lm[L.SH_R].x) / 2 * videoW, y: (lm[L.SH_L].y + lm[L.SH_R].y) / 2 * videoH };
  const hipPx = { x: (lm[L.HIP_L].x + lm[L.HIP_R].x) / 2 * videoW, y: (lm[L.HIP_L].y + lm[L.HIP_R].y) / 2 * videoH };
  const torsoPx = Math.hypot(shPx.x - hipPx.x, shPx.y - hipPx.y);

  const front = frontIsLeft()
    ? { hip: L.HIP_L, knee: L.KNEE_L, ank: L.ANK_L, el: L.EL_L, sh: L.SH_L, wr: L.WR_L }
    : { hip: L.HIP_R, knee: L.KNEE_R, ank: L.ANK_R, el: L.EL_R, sh: L.SH_R, wr: L.WR_R };
  const back = frontIsLeft()
    ? { hip: L.HIP_R, knee: L.KNEE_R, ank: L.ANK_R, el: L.EL_R, sh: L.SH_R, wr: L.WR_R }
    : { hip: L.HIP_L, knee: L.KNEE_L, ank: L.ANK_L, el: L.EL_L, sh: L.SH_L, wr: L.WR_L };

  // Spine lean away from vertical. World y points down, so "up" is (0,-1,0).
  const spine = sub3(shMid, hipMid);
  const spineLen = len3(spine);
  const spineTilt = spineLen > 1e-6
    ? Math.acos(clamp(dot3(spine, { x: 0, y: -1, z: 0 }) / spineLen, -1, 1)) * DEG
    : NaN;

  return {
    t,
    ok: true,
    legsOk,
    shoulderW,
    torsoPx,
    stanceRatio: shoulderW > 1e-6 ? stanceW / shoulderW : NaN,
    frontKnee: legsOk ? angle3(wl[front.hip], wl[front.knee], wl[front.ank]) : NaN,
    backKnee: legsOk ? angle3(wl[back.hip], wl[back.knee], wl[back.ank]) : NaN,
    backElbow: vis(back.el) > 0.4 ? angle3(wl[back.sh], wl[back.el], wl[back.wr]) : NaN,
    spineTilt,
    shoulderYaw: lineYaw(wl[L.SH_L], wl[L.SH_R]),
    hipYaw: lineYaw(wl[L.HIP_L], wl[L.HIP_R]),
    handsVsShoulders: shMid.y - wrMid.y, // metres; positive means hands are up
    hands: { x: wrMid.x, y: wrMid.y, z: wrMid.z },
    // Head measured against the back foot, so a shaky camera or a stride
    // does not read as head movement.
    headPx: vis(L.NOSE) > 0.4 && legsOk ? px(L.NOSE).x - px(back.ank).x : NaN,
    balancePx: legsOk && vis(L.NOSE) > 0.4
      ? px(L.NOSE).x - (px(L.ANK_L).x + px(L.ANK_R).x) / 2
      : NaN,
  };
}

/**
 * Second pass over a run of frames: smooth the noisy per-frame numbers and
 * work out how fast things are turning and moving.
 */
function buildSeries(frames) {
  const good = frames.filter((f) => f.ok);
  if (good.length < 6) return null;

  const t = good.map((f) => f.t);
  const shoulderYaw = smooth(unwrap(good.map((f) => f.shoulderYaw)), 1);
  const hipYaw = smooth(unwrap(good.map((f) => f.hipYaw)), 1);
  const separation = shoulderYaw.map((s, i) => s - hipYaw[i]);

  // Hand speed relative to the hips, which is what a swing actually is.
  const handSpeed = good.map((f, i) => {
    if (i === 0) return 0;
    const dt = t[i] - t[i - 1];
    if (dt <= 0) return NaN;
    return len3(sub3(f.hands, good[i - 1].hands)) / dt;
  });
  handSpeed[0] = handSpeed[1] ?? 0;

  const rate = (series) => series.map((_, i) => {
    if (i === 0 || i === series.length - 1) return NaN;
    const dt = t[i + 1] - t[i - 1];
    if (dt <= 0) return NaN;
    return Math.abs(series[i + 1] - series[i - 1]) / dt; // deg/s
  });

  return {
    frames: good,
    t,
    shoulderYaw,
    hipYaw,
    separation,
    handSpeed: smooth(handSpeed, 1),
    hipRate: smooth(rate(hipYaw), 1),
    shoulderRate: smooth(rate(shoulderYaw), 1),
  };
}

/** argmax that ignores gaps, restricted to [lo, hi]. */
function peakIndex(series, lo = 0, hi = series.length - 1) {
  let best = -1, bestV = -Infinity;
  for (let i = Math.max(0, lo); i <= Math.min(series.length - 1, hi); i++) {
    if (Number.isFinite(series[i]) && series[i] > bestV) { bestV = series[i]; best = i; }
  }
  return best;
}

/**
 * Split a run of frames into setup, launch, contact and finish using hand
 * speed alone. Contact is the fastest the hands ever move; launch is the last
 * quiet moment before that; setup is the second or so before launch.
 */
function findPhases(series) {
  const { handSpeed, t } = series;
  const contact = peakIndex(handSpeed);
  if (contact < 2) return null;
  const peak = handSpeed[contact];
  if (!Number.isFinite(peak) || peak < 1.2) return null; // nobody swung

  const quiet = peak * 0.18;
  let launch = contact;
  while (launch > 0 && handSpeed[launch] > quiet) launch--;

  let finish = contact;
  while (finish < handSpeed.length - 1 && handSpeed[finish] > quiet) finish++;

  // Setup: the calm stretch ending just before the hands get going.
  const setupEnd = Math.max(0, launch - 1);
  let setupStart = setupEnd;
  while (setupStart > 0 && t[setupEnd] - t[setupStart] < 0.7) setupStart--;

  // How turned he already is before anything happens. Taken from the earliest
  // readable frames rather than the stretch just before launch, because a load
  // almost always lands inside that last second and would contaminate it.
  let earlyEnd = 0;
  while (earlyEnd < t.length - 1 && t[earlyEnd] - t[0] < 0.3) earlyEnd++;
  const startSep = median(series.separation.slice(0, earlyEnd + 1));

  // How much he winds up: the range the shoulders travel against the hips
  // between the first frame we can read and the moment the hands go. A range
  // rather than a difference from some "setup" value, so it does not matter
  // when during the window he actually loads.
  let coilMin = Infinity, coilMax = -Infinity;
  let load = -1, loadDev = -Infinity;
  for (let i = 0; i <= launch; i++) {
    const v = series.separation[i];
    if (!Number.isFinite(v)) continue;
    if (v < coilMin) coilMin = v;
    if (v > coilMax) coilMax = v;
    const dev = Math.abs(v - startSep);
    if (dev > loadDev) { loadDev = dev; load = i; }
  }
  const coilRange = coilMax >= coilMin ? coilMax - coilMin : NaN;
  if (load < 0) load = setupEnd;

  return { setupStart, setupEnd, launch, load, contact, finish, peak, startSep, coilRange };
}

/** A representative value for a metric across the setup window. */
function setupValue(series, phases, pick) {
  const { setupStart, setupEnd } = phases;
  const vals = [];
  for (let i = setupStart; i <= setupEnd; i++) {
    const v = pick(series.frames[i], i);
    if (Number.isFinite(v)) vals.push(v);
  }
  return median(vals);
}

/* ==================================================================
   The checks
   ------------------------------------------------------------------
   Each one returns a verdict, the number behind it, and a single line
   the coach can say out loud. Targets are coaching rules of thumb,
   not lab numbers, and several only mean anything from one camera
   angle — that is what `views` is for.
   ================================================================== */

const TARGETS = {
  baseball: {
    stance: [1.0, 1.6],
    knee: [140, 173],
    spine: [4, 28],
    hands: [-0.12, 0.14],
    backElbow: [65, 145],
    separation: 22,
    headDrift: 0.28,
    frontLegGain: 8,
    balance: 0.40,
  },
  golf: {
    stance: [1.05, 1.7],
    knee: [148, 177],
    spine: [22, 46],
    hands: null,
    backElbow: null,
    separation: 30,
    headDrift: 0.22,
    frontLegGain: 6,
    balance: 0.32,
  },
};

const band = (v, [lo, hi]) => (!Number.isFinite(v) ? "unknown" : v < lo || v > hi ? "fix" : "good");

const CHECKS = [
  {
    id: "stance",
    label: "Stance width",
    views: ["face"],
    run(s, p, T) {
      const v = setupValue(s, p, (f) => f.stanceRatio);
      if (!Number.isFinite(v)) return null;
      const status = band(v, T.stance);
      const cue = v < T.stance[0]
        ? "Widen your stance. Get your feet outside your shoulders so you have a base to turn against."
        : "Bring your feet in a little. You are spread too wide to rotate cleanly.";
      return {
        status,
        value: `${v.toFixed(2)}×`,
        detail: `Your feet are ${v.toFixed(2)} times your shoulder width apart. Target is ${T.stance[0].toFixed(1)} to ${T.stance[1].toFixed(1)}.`,
        cue: status === "good" ? "Base looks good." : cue,
      };
    },
  },
  {
    id: "knees",
    label: "Knee bend at setup",
    views: ["face", "line"],
    run(s, p, T) {
      const f = setupValue(s, p, (x) => x.frontKnee);
      const b = setupValue(s, p, (x) => x.backKnee);
      const v = median([f, b]);
      if (!Number.isFinite(v)) return null;
      const status = band(v, T.knee);
      const cue = v > T.knee[1]
        ? "Bend your knees. Sit into your legs a little instead of standing straight up."
        : "You are sitting a bit deep. Come up an inch so you can still move.";
      return {
        status,
        value: `${fmt(v)}°`,
        detail: `Average knee angle ${fmt(v)}°, where 180° is a locked-out leg. Target is ${T.knee[0]}° to ${T.knee[1]}°.`,
        cue: status === "good" ? "Legs are loaded nicely." : cue,
      };
    },
  },
  {
    id: "posture",
    label: "Spine angle",
    views: ["face", "line"],
    run(s, p, T) {
      const v = setupValue(s, p, (x) => x.spineTilt);
      if (!Number.isFinite(v)) return null;
      const status = band(v, T.spine);
      const cue = v > T.spine[1]
        ? "Stand taller. You are bent too far over, and that drops the shoulders through the turn."
        : "Hinge forward from the hips a touch. You are standing too upright to rotate around anything.";
      return {
        status,
        value: `${fmt(v)}°`,
        detail: `Your spine leans ${fmt(v)}° off vertical. Target is ${T.spine[0]}° to ${T.spine[1]}° for this swing.`,
        cue: status === "good" ? "Posture is right where it should be." : cue,
      };
    },
  },
  {
    id: "hands",
    label: "Hand position",
    views: ["face", "line"],
    run(s, p, T) {
      if (!T.hands) return null;
      const v = setupValue(s, p, (x) => x.handsVsShoulders);
      if (!Number.isFinite(v)) return null;
      const status = band(v, T.hands);
      const cm = Math.round(Math.abs(v) * 100);
      const cue = v < T.hands[0]
        ? "Get your hands up near your back shoulder. They are hanging too low to start."
        : "Drop your hands a little. They are up above your shoulder and that costs you the short path.";
      return {
        status,
        value: `${v >= 0 ? "+" : "−"}${cm} cm`,
        detail: `Your hands sit ${cm} cm ${v >= 0 ? "above" : "below"} your shoulder line. Want them within a hand's width of it.`,
        cue: status === "good" ? "Hands are set in a good spot." : cue,
      };
    },
  },
  {
    id: "backElbow",
    label: "Back elbow",
    views: ["face"],
    run(s, p, T) {
      if (!T.backElbow) return null;
      const v = setupValue(s, p, (x) => x.backElbow);
      if (!Number.isFinite(v)) return null;
      const status = band(v, T.backElbow);
      const cue = v > T.backElbow[1]
        ? "Keep a bend in your back arm. Straightening it early pushes the hands away from you."
        : "Your back arm is folded up tight. Give it a little room.";
      return {
        status,
        value: `${fmt(v)}°`,
        detail: `Back elbow at ${fmt(v)}°. Somewhere between ${T.backElbow[0]}° and ${T.backElbow[1]}° keeps the hands inside the ball.`,
        cue: status === "good" ? "Back arm has a good angle." : cue,
      };
    },
  },
  {
    id: "separation",
    label: "Coil",
    views: ["face", "line"],
    run(s, p, T) {
      const wound = p.coilRange;
      if (!Number.isFinite(wound)) return null;
      const preset = Math.abs(p.startSep);
      const status = wound >= T.separation ? "good" : wound >= T.separation * 0.6 ? "fix" : "bad";

      // Two opposite faults both land on a low number, and they need opposite
      // coaching. Somebody who sets up already turned has to start quieter,
      // not turn more — telling him to turn more makes it worse.
      const prewound = status !== "good" && Number.isFinite(preset) && preset >= T.separation * 0.6;

      if (prewound) {
        return {
          status,
          value: `${fmt(wound)}° added`,
          detail: `Your shoulders only turned ${fmt(wound)}° further against your hips during the load, but they were already ${fmt(preset)}° round on your hips in the stance. The stretch only counts if it is fresh: hold it from the moment you step in and the spring has gone by the time you swing. Want at least ${T.separation}° of turn made during the load.`,
          cue: "You are starting out already turned. Set up quieter, then make the turn as the pitch comes.",
        };
      }
      return {
        status,
        value: `${fmt(wound)}°`,
        detail: `Your shoulders turned ${fmt(wound)}° against your hips between your stance and the start of the swing. Want at least ${T.separation}°. This is the stretch that makes the swing, not arm strength.`,
        cue: status === "good"
          ? "Good coil. Your shoulders turned against your hips."
          : "Turn your shoulders back while your hips stay quiet. You need to stretch against yourself before you swing.",
      };
    },
  },
  {
    id: "sequence",
    label: "Hips before hands",
    views: ["face", "line"],
    run(s, p) {
      const lo = Math.max(0, p.launch - 2);
      const hi = Math.min(s.t.length - 1, p.contact + 2);
      const hipPeak = peakIndex(s.hipRate, lo, hi);
      const shPeak = peakIndex(s.shoulderRate, lo, hi);
      if (hipPeak < 0 || shPeak < 0) return null;

      const hipFirst = s.t[hipPeak] <= s.t[shPeak];
      const gapMs = Math.round(Math.abs(s.t[shPeak] - s.t[hipPeak]) * 1000);
      const handGapMs = Math.round((s.t[p.contact] - s.t[hipPeak]) * 1000);
      const frameMs = Math.round(((s.t[s.t.length - 1] - s.t[0]) / (s.t.length - 1)) * 1000);

      const status = hipFirst ? (gapMs >= frameMs ? "good" : "unknown") : "fix";
      return {
        status,
        value: hipFirst ? `hips +${gapMs} ms` : `shoulders first`,
        detail: hipFirst
          ? `Hips peaked ${gapMs} ms before the shoulders, and the hands topped out ${handGapMs} ms after the hips. That is the order you want. Your frames are ${frameMs} ms apart, so treat anything under that as a tie — shoot in slow motion if you want this number to mean something.`
          : `Your shoulders reached top speed ${gapMs} ms before your hips did. The swing is being pulled by the upper body instead of pushed from the ground.`,
        cue: hipFirst
          ? "Good order. Hips led, shoulders followed."
          : "Start the swing with your hips. Let the back foot turn first and the hands come last.",
      };
    },
  },
  {
    id: "head",
    label: "Head movement",
    views: ["face"],
    run(s, p, T) {
      const base = median(
        s.frames.slice(p.setupStart, p.setupEnd + 1).map((f) => f.headPx / f.torsoPx)
      );
      if (!Number.isFinite(base)) return null;
      let worst = 0;
      for (let i = p.launch; i <= p.contact; i++) {
        const f = s.frames[i];
        const d = Math.abs(f.headPx / f.torsoPx - base);
        if (Number.isFinite(d) && d > worst) worst = d;
      }
      const status = worst <= T.headDrift ? "good" : worst <= T.headDrift * 1.6 ? "fix" : "bad";
      const inches = Math.round(worst * 20); // a torso is roughly 20 inches
      return {
        status,
        value: `${worst.toFixed(2)} torso`,
        detail: `Your head moved about ${inches} inches from where it started before contact. Under ${T.headDrift.toFixed(2)} of a torso length keeps your eyes on the ball.`,
        cue: status === "good"
          ? "Head stayed quiet. That is why you saw it."
          : "Keep your head still. You are drifting out front and your eyes go with it.",
      };
    },
  },
  {
    id: "frontLeg",
    label: "Front leg through contact",
    views: ["face", "line"],
    run(s, p, T) {
      const atLaunch = s.frames[p.launch]?.frontKnee;
      const atContact = s.frames[p.contact]?.frontKnee;
      if (!Number.isFinite(atLaunch) || !Number.isFinite(atContact)) return null;
      const gain = atContact - atLaunch;
      const status = gain >= T.frontLegGain ? "good" : gain >= 0 ? "fix" : "bad";
      return {
        status,
        value: `${gain >= 0 ? "+" : ""}${fmt(gain)}°`,
        detail: `Your front knee went from ${fmt(atLaunch)}° to ${fmt(atContact)}° between the start of the swing and contact. It should straighten by at least ${T.frontLegGain}° as you post up and turn against it.`,
        cue: status === "good"
          ? "Front leg posted up well."
          : "Push into your front leg. Let it straighten as you turn so you have something to rotate around.",
      };
    },
  },
  {
    id: "balance",
    label: "Finish",
    views: ["face"],
    run(s, p, T) {
      const base = median(
        s.frames.slice(p.setupStart, p.setupEnd + 1).map((f) => f.balancePx / f.torsoPx)
      );
      const endFrames = s.frames.slice(p.finish, p.finish + 6);
      const end = median(endFrames.map((f) => f.balancePx / f.torsoPx));
      if (!Number.isFinite(base) || !Number.isFinite(end)) return null;
      const shift = Math.abs(end - base);
      const status = shift <= T.balance ? "good" : shift <= T.balance * 1.7 ? "fix" : "bad";
      return {
        status,
        value: `${shift.toFixed(2)} torso`,
        detail: `After the swing your weight ended ${shift.toFixed(2)} torso lengths off where you started. Staying inside ${T.balance.toFixed(2)} means you turned rather than fell.`,
        cue: status === "good"
          ? "Balanced finish. Hold that."
          : "Finish on balance. Try holding your pose for a beat after contact.",
      };
    },
  },
];

/** Checks a sport can switch off entirely, keyed to their target. */
const SPORT_GATED = { hands: "hands", backElbow: "backElbow" };

/** Run every check that this camera angle can honestly answer. */
function buildReport(series, phases) {
  const T = TARGETS[cfg.sport];
  const cards = [];
  const skipped = [];
  for (const check of CHECKS) {
    if (!check.views.includes(cfg.view)) {
      // Skip quietly if the sport turned this check off anyway.
      const gate = SPORT_GATED[check.id];
      if (!gate || T[gate] !== null) skipped.push(check.label);
      continue;
    }
    let out = null;
    try { out = check.run(series, phases, T); } catch { out = null; }
    if (out) cards.push({ ...out, id: check.id, label: check.label });
  }
  return { cards, skipped };
}


export {
  L, BONES, JOINTS, cfg, TARGETS, CHECKS, WASM_BASE, MODELS,
  readFrame, buildSeries, findPhases, buildReport, setupValue, peakIndex,
  angle3, lineYaw, median, smooth, unwrap, clamp, fmt, len3, sub3, mid,
};
