/**
 * Swing Coach — the camera, the clip reader, the drawing and the voice.
 *
 * One sport per page. `initSwingCoach({ mount, sport })` paints its own markup
 * into `mount` and wires it up, so each sport page is a thin shell. The
 * geometry it reports on lives in swing-engine.mjs.
 */

import {
  FilesetResolver,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

import {
  L, BONES, JOINTS, cfg, TARGETS, CHECKS, WASM_BASE, MODELS,
  readFrame, buildSeries, findPhases, buildReport,
  clamp, fmt, len3, sub3,
} from "./swing-engine.mjs";

const COPY = {
  baseball: {
    kicker: "Baseball",
    tagline: "Point a camera at a swing and it reads your body position, then tells you what to fix. Everything runs on this device. No video leaves your phone.",
    sideA: "Righty", sideB: "Lefty",
    faceHint: "Face on: the camera sees the front of the body, roughly where a pitcher stands. Stand back far enough that the whole body, head to feet, stays in frame through the finish.",
    lineHint: "Down the line: the camera looks along the line of the swing, from behind or in front. Posture and coil read well from here. Stance width, head drift and the finish need a face-on camera instead.",
    clipHint: "Pick a video of one swing. A few seconds is plenty, and slow motion reads best.",
    empty: "Take a swing and the breakdown lands here: stance, knee bend, posture, how far the head travels, whether the hips lead the hands, and how you finish.",
  },
  golf: {
    kicker: "Golf",
    tagline: "Point a camera at your swing and it reads your body position, then tells you what to fix. Everything runs on this device. No video leaves your phone.",
    sideA: "Right-handed", sideB: "Left-handed",
    faceHint: "Face on: the camera sees the front of the body, square to your target line. Stand back far enough that the whole body, head to feet, stays in frame through the finish.",
    lineHint: "Down the line: the camera sits behind you looking along the target line. Posture and coil read well from here. Stance width, head drift and the finish need a face-on camera instead.",
    clipHint: "Pick a video of one swing. A few seconds is plenty, and slow motion reads best.",
    empty: "Take a swing and the breakdown lands here: stance, knee bend, posture, how far the head travels, whether the hips lead the hands, and how you finish.",
  },
};

function markup(sport) {
  const c = COPY[sport];
  return `
  <header>
    <a class="crumb" href="${sport === "golf" ? "../" : "../"}">&larr; ${sport === "golf" ? "Golf" : "Swing Coach"}</a>
    <div class="masthead">
      <div>
        <h1>Swing<em>${c.kicker}</em></h1>
        <p class="tagline">${c.tagline}</p>
      </div>
      <button class="iconbtn" id="voiceBtn" aria-pressed="true" title="Coach's voice" aria-label="Toggle the coach's voice">
        <svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>
        <svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>
      </button>
    </div>
  </header>

  <section class="panel">
    <h2>Set it up</h2>
    <div class="field">
      <label for="modeSeg">How are we watching</label>
      <div class="seg" id="modeSeg" role="group" aria-label="Mode">
        <button data-mode="live" aria-pressed="true">Live coach<small>camera + voice</small></button>
        <button data-mode="clip" aria-pressed="false">Analyze a clip<small>upload a video</small></button>
      </div>
    </div>
    <div class="field">
      <label for="handSeg">Which side</label>
      <div class="seg" id="handSeg" role="group" aria-label="Handedness">
        <button data-hand="right" aria-pressed="true">${c.sideA}</button>
        <button data-hand="left" aria-pressed="false">${c.sideB}</button>
      </div>
    </div>
    <div class="field">
      <label for="viewSeg">Where the camera sits</label>
      <div class="seg" id="viewSeg" role="group" aria-label="Camera angle">
        <button data-view="face" aria-pressed="true">Face on<small>looking at the chest</small></button>
        <button data-view="line" aria-pressed="false">Down the line<small>behind or in front</small></button>
      </div>
    </div>
    <p class="hint" id="viewHint">${c.faceHint}</p>
  </section>

  <div class="stage" id="stage">
    <video id="video" playsinline muted preload="auto"></video>
    <canvas id="canvas"></canvas>
    <div class="stage-empty" id="stageEmpty">
      <strong>Nothing to watch yet</strong>
      <span id="stageEmptyText">Hit <b>Start camera</b> and stand back until your whole body fits in the frame.</span>
    </div>
    <div class="pill" id="pill" hidden><span class="dot" id="pillDot"></span><span id="pillText">Idle</span></div>
    <div class="fps" id="fpsBadge" hidden>&ndash;&ndash; fps</div>
    <div class="cue" id="cueBox"><span id="cueKicker">Coach</span><em id="cueText" style="font-style:normal"></em></div>
  </div>

  <div class="actions" id="liveActions">
    <button class="btn primary" id="startBtn">Start camera</button>
    <button class="btn" id="stopBtn" disabled>Stop</button>
    <button class="btn ghost" id="flipBtn">Flip camera</button>
  </div>

  <div class="actions" id="clipActions" hidden>
    <span class="filewrap">
      <input type="file" id="fileInput" accept="video/*" aria-label="Choose a swing video">
      <span class="btn primary">Choose a video</span>
    </span>
    <button class="btn" id="analyzeBtn" disabled>Analyze swing</button>
  </div>

  <div class="progress" id="progress"><i id="progressBar"></i></div>

  <div class="timeline" id="timeline">
    <input type="range" id="scrub" min="0" max="100" value="0" step="1" aria-label="Scrub through the swing">
    <div class="phases" id="phases"></div>
  </div>

  <section class="panel">
    <h2 id="reportTitle">The read</h2>
    <div class="scoreline" id="scoreline" hidden></div>
    <div class="cards" id="cards"><p class="empty-note" id="emptyNote">${c.empty}</p></div>
  </section>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

export function initSwingCoach({ mount, sport }) {
  const c = COPY[sport];
  cfg.sport = sport;
  mount.innerHTML = markup(sport);

/* =====
   Page wiring
   ================================================================== */

const $ = (id) => mount.querySelector(`#${id}`);
const el = {
  stage: $("stage"), video: $("video"), canvas: $("canvas"),
  stageEmpty: $("stageEmpty"), stageEmptyText: $("stageEmptyText"),
  pill: $("pill"), pillDot: $("pillDot"), pillText: $("pillText"), fps: $("fpsBadge"),
  cueBox: $("cueBox"), cueText: $("cueText"), cueKicker: $("cueKicker"),
  liveActions: $("liveActions"), clipActions: $("clipActions"),
  startBtn: $("startBtn"), stopBtn: $("stopBtn"), flipBtn: $("flipBtn"),
  fileInput: $("fileInput"), analyzeBtn: $("analyzeBtn"),
  progress: $("progress"), progressBar: $("progressBar"),
  timeline: $("timeline"), scrub: $("scrub"), phases: $("phases"),
  scoreline: $("scoreline"), cards: $("cards"), emptyNote: $("emptyNote"),
  reportTitle: $("reportTitle"), viewHint: $("viewHint"),
  voiceBtn: $("voiceBtn"), toast: $("toast"),
};
const ctx = el.canvas.getContext("2d");

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 5200);
}

function setPill(text, kind) {
  el.pill.hidden = false;
  el.pillText.textContent = text;
  el.pillDot.className = `dot ${kind || ""}`;
}

let cueTimer = 0;
function showCue(text, kicker = "Coach") {
  el.cueKicker.textContent = kicker;
  el.cueText.textContent = text;
  el.cueBox.classList.add("show");
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => el.cueBox.classList.remove("show"), 6000);
}

/* ---------------- the voice ---------------- */

const speech = {
  last: 0,
  saidAt: new Map(),
  voice: null,
  pick() {
    if (this.voice || !window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    this.voice =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /Samantha|Google US|Aria|Jenny/i.test(v.name)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0] || null;
  },
};
if (window.speechSynthesis) {
  speechSynthesis.addEventListener?.("voiceschanged", () => speech.pick());
  speech.pick();
}

function say(text, { force = false } = {}) {
  showCue(text);
  if (!cfg.voice || !window.speechSynthesis) return;
  if (force) speechSynthesis.cancel();
  speech.pick();
  const u = new SpeechSynthesisUtterance(text);
  if (speech.voice) u.voice = speech.voice;
  u.rate = 1.02;
  u.pitch = 1;
  try { speechSynthesis.speak(u); } catch { /* some browsers refuse before a gesture */ }
}

/**
 * The coach does not chatter. One cue at a time, a few seconds apart, and
 * never the same note twice inside half a minute.
 */
function coachSay(id, text, { gap = 4500, repeat = 30000 } = {}) {
  const now = performance.now();
  if (now - speech.last < gap) return false;
  if (now - (speech.saidAt.get(id) ?? -Infinity) < repeat) return false;
  speech.last = now;
  speech.saidAt.set(id, now);
  say(text);
  return true;
}

/* ---------------- report rendering ---------------- */

function renderReport(report, series, phases) {
  const { cards, skipped } = report;
  el.emptyNote?.remove();
  el.cards.innerHTML = "";

  const peak = phases ? series.handSpeed[phases.contact] : NaN;
  const swingMs = phases ? Math.round((series.t[phases.contact] - series.t[phases.launch]) * 1000) : NaN;
  const frameMs = series ? Math.round(((series.t[series.t.length - 1] - series.t[0]) / (series.t.length - 1)) * 1000) : NaN;
  const graded = cards.filter((c) => c.status === "good" || c.status === "fix" || c.status === "bad");
  const clean = graded.filter((c) => c.status === "good").length;

  el.scoreline.hidden = false;
  el.scoreline.innerHTML = `
    <div class="stat"><b>${clean}<span style="font-size:16px;color:var(--text-dim)">/${graded.length}</span></b><span>Checks clean</span></div>
    <div class="stat"><b>${fmt(peak, 1)}</b><span>Peak hand speed m/s</span></div>
    <div class="stat"><b>${fmt(swingMs)}</b><span>Swing time ms</span></div>
    <div class="stat"><b>${fmt(frameMs)}</b><span>Frame gap ms</span></div>
  `;

  const order = { bad: 0, fix: 1, unknown: 2, good: 3 };
  for (const c of [...cards].sort((a, b) => order[a.status] - order[b.status])) {
    const node = document.createElement("div");
    node.className = `card ${c.status}`;
    node.innerHTML = `
      <div class="card-top"><h3></h3><span class="val"></span></div>
      <p class="cue"></p>
      <p class="detail"></p>
    `;
    node.querySelector("h3").textContent = c.label;
    node.querySelector(".val").textContent = c.value;
    node.querySelector(".cue").textContent = c.cue;
    node.querySelector(".detail").textContent = c.detail;
    el.cards.appendChild(node);
  }

  if (skipped.length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    const other = cfg.view === "face" ? "from down the line" : "from face on";
    note.textContent = `Sat out this time because they need a camera ${other}: ${skipped.join(", ")}.`;
    el.cards.appendChild(note);
  }
  return cards;
}

/** The one or two things worth saying out loud after a swing. */
function speakVerdict(cards) {
  const problems = cards
    .filter((c) => c.status === "bad" || c.status === "fix")
    .sort((a, b) => (a.status === "bad" ? -1 : 1) - (b.status === "bad" ? -1 : 1));
  if (!problems.length) {
    say("That one was clean. Nothing to fix. Do it again.", { force: true });
    return;
  }
  const lines = problems.slice(0, 2).map((p) => p.cue);
  say(lines.join(" "), { force: true });
}

/* ==================================================================
   The model
   ================================================================== */

let fileset = null;
let landmarker = null;
let landmarkerKind = ""; // "<model>:<runningMode>"

async function getLandmarker(model, runningMode) {
  const kind = `${model}:${runningMode}`;
  if (landmarker && landmarkerKind === kind) return landmarker;

  setPill("Loading the pose model…", "busy");
  if (!fileset) fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  if (landmarker) { try { landmarker.close(); } catch {} landmarker = null; }

  const options = {
    baseOptions: { modelAssetPath: MODELS[model], delegate: "GPU" },
    runningMode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  };
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, options);
  } catch {
    // Plenty of phones and locked-down browsers have no usable WebGL here.
    options.baseOptions.delegate = "CPU";
    landmarker = await PoseLandmarker.createFromOptions(fileset, options);
  }
  landmarkerKind = kind;
  return landmarker;
}

/* ==================================================================
   Drawing
   ================================================================== */

let handTrace = [];

function sizeCanvas(w, h) {
  const scale = Math.min(1, 960 / Math.max(w, h));
  el.canvas.width = Math.round(w * scale);
  el.canvas.height = Math.round(h * scale);
  el.stage.style.aspectRatio = `${w} / ${h}`;
}

function paint(lm, { headRefX = null, hot = false } = {}) {
  const W = el.canvas.width, H = el.canvas.height;
  ctx.clearRect(0, 0, W, H);
  try { ctx.drawImage(el.video, 0, 0, W, H); } catch { /* frame not ready */ }
  if (!lm) return;

  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });

  if (headRefX != null) {
    ctx.save();
    ctx.setLineDash([6, 7]);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headRefX * W, 0);
    ctx.lineTo(headRefX * W, H);
    ctx.stroke();
    ctx.restore();
  }

  if (handTrace.length > 1) {
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < handTrace.length; i++) {
      const a = handTrace[i - 1], b = handTrace[i];
      ctx.strokeStyle = `rgba(255,107,61,${(i / handTrace.length) * 0.85})`;
      ctx.lineWidth = 2 + (i / handTrace.length) * 5;
      ctx.beginPath();
      ctx.moveTo(a.x * W, a.y * H);
      ctx.lineTo(b.x * W, b.y * H);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.5, W / 260);
  ctx.strokeStyle = hot ? "rgba(255,107,61,0.95)" : "rgba(244,247,245,0.85)";
  for (const [a, b] of BONES) {
    if ((lm[a]?.visibility ?? 0) < 0.35 || (lm[b]?.visibility ?? 0) < 0.35) continue;
    const p = P(a), q = P(b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }

  ctx.fillStyle = hot ? "#FFD8C8" : "#4ADE80";
  const r = Math.max(3, W / 210);
  for (const i of JOINTS) {
    if ((lm[i]?.visibility ?? 0) < 0.35) continue;
    const p = P(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ==================================================================
   Live coaching
   ================================================================== */

const live = {
  stream: null,
  facing: "environment",
  running: false,
  buffer: [],
  state: "idle",      // idle | set | swinging
  stillSince: 0,
  swingStart: 0,
  quietSince: 0,
  setupHeadX: null,
  lastVideoTime: -1,
  frames: 0,
  fpsAt: 0,
  fps: 0,
};

const SWING_ON = 3.2;   // m/s of hand speed that counts as a swing starting
const SWING_OFF = 1.1;  // and the speed it has to fall back under to end
const STILL = 0.7;      // below this the body is considered set

function liveHandSpeed() {
  const b = live.buffer;
  if (b.length < 3) return 0;
  const [a, c] = [b[b.length - 3], b[b.length - 1]];
  const dt = c.t - a.t;
  if (dt <= 0) return 0;
  return len3(sub3(c.hands, a.hands)) / dt;
}

function runSetupCoaching() {
  const recent = live.buffer.filter((f) => f.t >= live.buffer[live.buffer.length - 1].t - 0.8);
  const series = buildSeries(recent);
  if (!series) return;
  const fakePhases = { setupStart: 0, setupEnd: series.frames.length - 1 };
  const T = TARGETS[cfg.sport];

  // Setup checks only: the ones that read a still body.
  const ids = ["stance", "knees", "posture", "hands", "backElbow"];
  const problems = [];
  for (const check of CHECKS) {
    if (!ids.includes(check.id)) continue;
    if (!check.views.includes(cfg.view)) continue;
    let out = null;
    try { out = check.run(series, fakePhases, T); } catch { out = null; }
    if (out && (out.status === "fix" || out.status === "bad")) problems.push({ ...out, id: check.id });
  }
  if (!problems.length) {
    coachSay("set", "You are set. Take your swing.", { repeat: 45000 });
    return;
  }
  const worst = problems[0];
  coachSay(worst.id, worst.cue);
}

function finishLiveSwing() {
  const end = live.buffer[live.buffer.length - 1].t;
  const window = live.buffer.filter((f) => f.t >= live.swingStart - 1.4 && f.t <= end);
  const series = buildSeries(window);
  const phases = series && findPhases(series);
  if (!series || !phases) {
    setPill("Missed that one", "");
    return;
  }
  const report = buildReport(series, phases);
  const cards = renderReport(report, series, phases);
  el.reportTitle.textContent = "The read · last swing";
  speakVerdict(cards);
}

function updateLiveState(frame) {
  const speed = liveHandSpeed();
  const now = frame.t;

  if (live.state !== "swinging") {
    if (speed > SWING_ON) {
      live.state = "swinging";
      live.swingStart = now;
      live.quietSince = 0;
      handTrace = [];
      setPill("Swing", "live");
      return speed;
    }
    if (speed < STILL) {
      if (!live.stillSince) live.stillSince = now;
      if (now - live.stillSince > 0.9 && live.state !== "set") {
        live.state = "set";
        live.setupHeadX = live.lastNoseX;
        setPill("Set", "ready");
      }
      if (live.state === "set") runSetupCoaching();
    } else {
      live.stillSince = 0;
      if (live.state === "set") { live.state = "idle"; setPill("Moving", ""); }
    }
    return speed;
  }

  // Mid-swing: wait for the hands to settle, then read the whole thing back.
  if (speed < SWING_OFF) {
    if (!live.quietSince) live.quietSince = now;
    if (now - live.quietSince > 0.45) {
      live.state = "idle";
      live.stillSince = 0;
      live.quietSince = 0;
      setPill("Reading the swing…", "busy");
      finishLiveSwing();
      setPill("Ready", "ready");
    }
  } else {
    live.quietSince = 0;
  }
  return speed;
}

function liveLoop() {
  if (!live.running) return;
  const v = el.video;
  if (v.readyState >= 2 && v.currentTime !== live.lastVideoTime) {
    live.lastVideoTime = v.currentTime;
    let result = null;
    try { result = landmarker.detectForVideo(v, performance.now()); } catch { result = null; }

    const lm = result?.landmarks?.[0];
    const wl = result?.worldLandmarks?.[0];
    let speed = 0;

    if (lm && wl) {
      live.lastNoseX = lm[L.NOSE].x;
      const frame = readFrame(lm, wl, performance.now() / 1000, v.videoWidth, v.videoHeight);
      if (frame.ok) {
        live.buffer.push(frame);
        const cutoff = frame.t - 6;
        while (live.buffer.length && live.buffer[0].t < cutoff) live.buffer.shift();
        speed = updateLiveState(frame);
      }
      const wrist = { x: (lm[L.WR_L].x + lm[L.WR_R].x) / 2, y: (lm[L.WR_L].y + lm[L.WR_R].y) / 2 };
      handTrace.push(wrist);
      if (handTrace.length > 26) handTrace.shift();
    } else {
      handTrace = [];
    }

    paint(lm, {
      headRefX: live.state === "set" || live.state === "swinging" ? live.setupHeadX : null,
      hot: live.state === "swinging",
    });

    live.frames++;
    const now = performance.now();
    if (now - live.fpsAt > 500) {
      live.fps = Math.round((live.frames * 1000) / (now - live.fpsAt));
      live.frames = 0;
      live.fpsAt = now;
    }
    el.fps.textContent = `${live.fps} fps · hands ${speed.toFixed(1)} m/s`;
  }
  requestAnimationFrame(liveLoop);
}

async function startCamera() {
  if (live.running) return;
  el.startBtn.disabled = true;
  try {
    // Touching the speech engine inside the tap is what unlocks it on iOS.
    if (cfg.voice && window.speechSynthesis) {
      try { speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); } catch {}
    }
    setPill("Asking for the camera…", "busy");
    live.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: live.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    cfg.mirror = live.facing === "user";
    el.stage.classList.toggle("mirror", cfg.mirror);

    // Clear any clip still attached, or the element may keep playing that
    // instead of the live stream.
    el.video.removeAttribute("src");
    el.video.load();
    el.video.srcObject = live.stream;
    el.video.muted = true;
    await el.video.play();
    await new Promise((res) => {
      if (el.video.videoWidth) return res();
      el.video.addEventListener("loadedmetadata", res, { once: true });
    });
    sizeCanvas(el.video.videoWidth, el.video.videoHeight);
    el.stageEmpty.hidden = true;
    el.fps.hidden = false;

    await getLandmarker("lite", "VIDEO");
    live.running = true;
    live.state = "idle";
    live.buffer = [];
    live.lastVideoTime = -1;
    live.fpsAt = performance.now();
    setPill("Ready", "ready");
    el.stopBtn.disabled = false;
    say("Camera is on. Get in your stance and hold still for a second.");
    liveLoop();
  } catch (err) {
    el.startBtn.disabled = false;
    setPill("Camera blocked", "");
    toast(
      err?.name === "NotAllowedError"
        ? "The browser blocked the camera. Allow camera access for this site and try again."
        : `Could not start the camera: ${err?.message || err}`
    );
  }
}

function stopCamera() {
  live.running = false;
  live.stream?.getTracks().forEach((t) => t.stop());
  live.stream = null;
  el.video.srcObject = null;
  el.startBtn.disabled = false;
  el.stopBtn.disabled = true;
  el.fps.hidden = true;
  handTrace = [];
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  el.stageEmpty.hidden = false;
  setPill("Stopped", "");
  window.speechSynthesis?.cancel();
}

/* ==================================================================
   Clip analysis
   ================================================================== */

const clip = {
  url: null,
  frames: [],   // { t, lm, metrics }
  series: null,
  phases: null,
};

function seekTo(v, time) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; v.removeEventListener("seeked", finish); resolve(); } };
    v.addEventListener("seeked", finish);
    // Safari occasionally swallows the event on a frame it considers a no-op.
    setTimeout(finish, 400);
    v.currentTime = time;
  });
}

async function loadClip(file) {
  stopCamera();
  if (clip.url) URL.revokeObjectURL(clip.url);
  clip.url = URL.createObjectURL(file);
  clip.frames = [];
  clip.series = null;
  clip.phases = null;
  el.timeline.classList.remove("show");

  const v = el.video;
  v.srcObject = null;
  v.src = clip.url;
  v.muted = true;
  await new Promise((resolve, reject) => {
    v.addEventListener("loadedmetadata", resolve, { once: true });
    v.addEventListener("error", () => reject(new Error("that file would not open")), { once: true });
  });

  sizeCanvas(v.videoWidth, v.videoHeight);
  await seekTo(v, Math.min(0.05, v.duration / 2));
  paint(null);
  el.stageEmpty.hidden = true;
  el.analyzeBtn.disabled = false;
  setPill(`${v.duration.toFixed(1)}s clip loaded`, "ready");
}

async function analyzeClip() {
  const v = el.video;
  if (!clip.url || !v.duration) return;
  el.analyzeBtn.disabled = true;
  el.progress.classList.add("show");
  el.fps.hidden = true;
  setPill("Reading the clip…", "busy");

  try {
    const model = await getLandmarker("full", "VIDEO");
    const duration = Math.min(v.duration, 12);
    const steps = clamp(Math.round(duration * 60), 24, 420);
    const dt = duration / steps;

    clip.frames = [];
    let stamp = 0;
    for (let i = 0; i <= steps; i++) {
      const time = i * dt;
      await seekTo(v, Math.min(time, v.duration - 0.001));
      stamp = Math.max(stamp + 1, Math.round(v.currentTime * 1000));
      let result = null;
      try { result = model.detectForVideo(v, stamp); } catch { result = null; }
      const lm = result?.landmarks?.[0];
      const wl = result?.worldLandmarks?.[0];
      if (lm && wl) {
        const metrics = readFrame(lm, wl, v.currentTime, v.videoWidth, v.videoHeight);
        if (metrics.ok) clip.frames.push({ t: v.currentTime, lm, metrics });
      }
      el.progressBar.style.width = `${Math.round((i / steps) * 100)}%`;
      if (i % 4 === 0) await new Promise((r) => requestAnimationFrame(r));
    }

    if (clip.frames.length < 12) {
      setPill("Could not find a body", "");
      toast("The model could not find a body in enough of that clip. Try better light, and make sure the whole body stays in frame.");
      return;
    }

    clip.series = buildSeries(clip.frames.map((f) => f.metrics));
    clip.phases = clip.series && findPhases(clip.series);
    if (!clip.series || !clip.phases) {
      setPill("No swing found", "");
      toast("No swing found in that clip. Trim it down so it starts in your stance and ends after the follow-through.");
      return;
    }

    const report = buildReport(clip.series, clip.phases);
    const cards = renderReport(report, clip.series, clip.phases);
    el.reportTitle.textContent = "The read · uploaded clip";
    buildTimeline();
    speakVerdict(cards);
    setPill(`${clip.frames.length} frames read`, "ready");
  } catch (err) {
    setPill("Analysis failed", "");
    toast(`Something broke while reading that clip: ${err?.message || err}`);
  } finally {
    el.progress.classList.remove("show");
    el.progressBar.style.width = "0%";
    el.analyzeBtn.disabled = false;
  }
}

/* ---------------- scrubbing the result ---------------- */

/** Frame indices in clip.frames, not in the trimmed series. */
function seriesIndexToClipIndex(i) {
  const t = clip.series.t[i];
  let best = 0, bestD = Infinity;
  clip.frames.forEach((f, k) => {
    const d = Math.abs(f.t - t);
    if (d < bestD) { bestD = d; best = k; }
  });
  return best;
}

async function showClipFrame(index) {
  const frame = clip.frames[clamp(index, 0, clip.frames.length - 1)];
  if (!frame) return;
  await seekTo(el.video, frame.t);
  const k = clamp(index, 0, clip.frames.length - 1);
  handTrace = clip.frames
    .slice(Math.max(0, k - 24), k + 1)
    .map((f) => ({ x: (f.lm[L.WR_L].x + f.lm[L.WR_R].x) / 2, y: (f.lm[L.WR_L].y + f.lm[L.WR_R].y) / 2 }));
  const contactIdx = seriesIndexToClipIndex(clip.phases.contact);
  paint(frame.lm, { hot: Math.abs(k - contactIdx) <= 2 });
}

function buildTimeline() {
  el.timeline.classList.add("show");
  el.scrub.max = String(clip.frames.length - 1);
  el.scrub.value = String(seriesIndexToClipIndex(clip.phases.contact));

  const marks = [
    ["Setup", clip.phases.setupEnd],
    ["Coil", clip.phases.load],
    ["Launch", clip.phases.launch],
    ["Contact", clip.phases.contact],
    ["Finish", clip.phases.finish],
  ];
  el.phases.innerHTML = "";
  marks.forEach(([name, seriesIdx]) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.setAttribute("aria-pressed", name === "Contact" ? "true" : "false");
    b.addEventListener("click", () => {
      const idx = seriesIndexToClipIndex(seriesIdx);
      el.scrub.value = String(idx);
      [...el.phases.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      showClipFrame(idx);
    });
    el.phases.appendChild(b);
  });
  showClipFrame(Number(el.scrub.value));
}

el.scrub.addEventListener("input", () => {
  [...el.phases.children].forEach((c) => c.setAttribute("aria-pressed", "false"));
  showClipFrame(Number(el.scrub.value));
});

/* ==================================================================
   Controls
   ================================================================== */

function wireSegment(id, key, after) {
  const group = $(id);
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    [...group.children].forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    cfg[key] = btn.dataset[key];
    after?.();
  });
}

const VIEW_HINTS = { face: c.faceHint, line: c.lineHint };

wireSegment("handSeg", "hand");
wireSegment("viewSeg", "view", () => { el.viewHint.textContent = VIEW_HINTS[cfg.view]; });
wireSegment("modeSeg", "mode", () => {
  const liveMode = cfg.mode === "live";
  el.liveActions.hidden = !liveMode;
  el.clipActions.hidden = liveMode;
  el.stageEmptyText.innerHTML = liveMode
    ? "Hit <b>Start camera</b> and stand back until your whole body fits in the frame."
    : c.clipHint;
  if (liveMode) {
    el.timeline.classList.remove("show");
  } else {
    stopCamera();
  }
  el.stageEmpty.hidden = false;
  el.pill.hidden = true;
  el.fps.hidden = true;
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
});

el.voiceBtn.addEventListener("click", () => {
  cfg.voice = !cfg.voice;
  el.voiceBtn.setAttribute("aria-pressed", String(cfg.voice));
  if (!cfg.voice) window.speechSynthesis?.cancel();
});

el.startBtn.addEventListener("click", startCamera);
el.stopBtn.addEventListener("click", stopCamera);
el.flipBtn.addEventListener("click", async () => {
  live.facing = live.facing === "user" ? "environment" : "user";
  if (live.running) { stopCamera(); await startCamera(); }
  else toast(`Next start will use the ${live.facing === "user" ? "front" : "back"} camera.`);
});

el.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try { await loadClip(file); }
  catch (err) { toast(`Could not open that video: ${err?.message || err}`); }
});
el.analyzeBtn.addEventListener("click", analyzeClip);

window.addEventListener("pagehide", stopCamera);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) window.speechSynthesis?.cancel();
});

if (!navigator.mediaDevices?.getUserMedia) {
  el.startBtn.disabled = true;
  toast("This browser will not hand over a camera. Upload a clip instead.");
}

}
