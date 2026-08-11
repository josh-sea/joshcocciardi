/* Gatekeeper - game window
 *
 * One unlocked arcade session. A ticket (minted when a quest is answered)
 * is spent on load. Session policy: for the first `graceMs` he restarts or
 * switches games freely; once that passes, the current run plays out and
 * the session ends. The clock is only read at game-over, so a run in
 * progress is never cut off.
 *
 * Games are modules: { name, blurb, color, icon, start(onGameOver), onTap(x,y) }.
 * Adding another is a drop-in.
 */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let GRACE_MS = 120000;
let sessionStart = null;
let currentKey = null;
let current = null;
let DAD = false;
let W = canvas.width;
let H = canvas.height;

/* ---------- sound ---------- */
let audio = null;
function tone(freq, ms = 240, type = "sine", vol = 0.2) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + ms / 1000);
  } catch {}
}

/* ---------- high scores ---------- */
async function bestFor(game) {
  const { gameScores = {} } = await chrome.storage.local.get("gameScores");
  return gameScores[game] || 0;
}
async function saveBest(game, score) {
  const { gameScores = {} } = await chrome.storage.local.get("gameScores");
  if (score > (gameScores[game] || 0)) {
    gameScores[game] = score;
    await chrome.storage.local.set({ gameScores });
    return true;
  }
  return false;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= Signal ================= */
const Signal = (() => {
  const PADS = [
    { color: "#35D07F", lit: "#7CFFB8", freq: 329.63 },
    { color: "#F2B441", lit: "#FFD877", freq: 415.30 },
    { color: "#5AA9FF", lit: "#A8D4FF", freq: 493.88 },
    { color: "#E5484D", lit: "#FF8A8D", freq: 587.33 }
  ];
  let seq = [], idx = 0, accepting = false, round = 0, flash = -1, over = null;

  function boxes() {
    const size = Math.min(W, H), pad = size * 0.055, cell = (size - pad * 3) / 2;
    const ox = (W - (cell * 2 + pad)) / 2, oy = (H - (cell * 2 + pad)) / 2;
    return [
      { x: ox, y: oy, w: cell, h: cell }, { x: ox + cell + pad, y: oy, w: cell, h: cell },
      { x: ox, y: oy + cell + pad, w: cell, h: cell }, { x: ox + cell + pad, y: oy + cell + pad, w: cell, h: cell }
    ];
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    boxes().forEach((b, i) => {
      ctx.fillStyle = flash === i ? PADS[i].lit : PADS[i].color;
      roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill();
      if (flash !== i) { ctx.fillStyle = "rgba(11,15,19,.34)"; roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill(); }
    });
  }
  function lit(i, ms) {
    return new Promise((res) => {
      flash = i; tone(PADS[i].freq, ms); draw();
      setTimeout(() => { flash = -1; draw(); setTimeout(res, reduceMotion ? 40 : 130); }, ms);
    });
  }
  async function play() {
    accepting = false; await wait(reduceMotion ? 150 : 500);
    const speed = Math.max(200, 460 - round * 18);
    for (const i of seq) await lit(i, speed);
    idx = 0; accepting = true;
  }
  function next() { round += 1; seq.push(Math.floor(Math.random() * 4)); $("score").innerHTML = `Round <b>${round}</b>`; play(); }

  return {
    name: "Signal", blurb: "Repeat the pattern of lights", color: "#35D07F",
    icon: (c) => `<svg width="22" height="22" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2" fill="${c}"/><rect x="14" y="3" width="7" height="7" rx="2" fill="${c}" opacity=".4"/><rect x="3" y="14" width="7" height="7" rx="2" fill="${c}" opacity=".4"/><rect x="14" y="14" width="7" height="7" rx="2" fill="${c}"/></svg>`,
    start(onOver) { over = onOver; seq = []; round = 0; flash = -1; next(); },
    async onTap(px, py) {
      if (!accepting) return;
      const i = boxes().findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
      if (i < 0) return;
      await lit(i, 170);
      if (i === seq[idx]) {
        idx += 1;
        if (idx === seq.length) { accepting = false; await wait(reduceMotion ? 120 : 420); next(); }
      } else { accepting = false; tone(120, 500, "sawtooth"); over(round - 1); }
    }
  };
})();

/* ================= Circuit Dash ================= */
const Dash = (() => {
  let player, obstacles, score, speed, running, raf, over, spawnX, started;
  const R = 13;

  function reset() {
    player = { x: W * 0.28, y: H / 2, vy: 0 };
    obstacles = [];
    score = 0; speed = 2.6; running = true; started = false;
    spawnX = W + 40;
    for (let i = 0; i < 3; i++) addObstacle(W + 60 + i * (W * 0.52));
  }
  function addObstacle(x) {
    const margin = 70, gap = Math.max(120, 168 - score * 2);
    const gapY = margin + Math.random() * (H - margin * 2 - gap);
    obstacles.push({ x, gapY, gap, passed: false, band: Math.floor(Math.random() * 4) });
  }
  const G = 0.42, FLAP = -6.6;

  function step() {
    if (!running) return;
    if (started) {
      player.vy += G; player.y += player.vy;
    }
    if (started) {
      for (const o of obstacles) o.x -= speed;
      if (obstacles.length && obstacles[0].x < -50) obstacles.shift();
      const last = obstacles[obstacles.length - 1];
      if (last && last.x < W - W * 0.52) addObstacle(W + 40);
      for (const o of obstacles) {
        if (!o.passed && o.x + 26 < player.x) { o.passed = true; score += 1; speed += 0.05; tone(660, 90, "square", 0.12); $("score").innerHTML = `Score <b>${score}</b>`; }
      }
    }
    // collisions
    if (player.y + R > H || player.y - R < 0) return crash();
    for (const o of obstacles) {
      if (player.x + R > o.x && player.x - R < o.x + 26) {
        if (player.y - R < o.gapY || player.y + R > o.gapY + o.gap) return crash();
      }
    }
    draw();
    raf = requestAnimationFrame(step);
  }

  function crash() { running = false; cancelAnimationFrame(raf); tone(110, 520, "sawtooth"); draw(true); over(score); }

  function draw(dead) {
    ctx.fillStyle = "#070B0F"; ctx.fillRect(0, 0, W, H);
    // faint PCB traces
    ctx.strokeStyle = "rgba(53,208,127,.08)"; ctx.lineWidth = 2;
    for (let y = 40; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // obstacles as capacitor bars with a resistor-colored band
    const bands = ["#E5484D", "#F2B441", "#5AA9FF", "#35D07F"];
    for (const o of obstacles) {
      ctx.fillStyle = "#1C2A36";
      ctx.fillRect(o.x, 0, 26, o.gapY);
      ctx.fillRect(o.x, o.gapY + o.gap, 26, H - (o.gapY + o.gap));
      ctx.fillStyle = bands[o.band];
      ctx.fillRect(o.x, o.gapY - 8, 26, 6);
      ctx.fillRect(o.x, o.gapY + o.gap + 2, 26, 6);
    }
    // player electron
    ctx.save();
    ctx.shadowBlur = reduceMotion ? 0 : 16; ctx.shadowColor = "#5AA9FF";
    ctx.fillStyle = dead ? "#E5484D" : "#8FD0FF";
    ctx.beginPath(); ctx.arc(player.x, player.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0B0F13"; ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center"; ctx.fillText("e", player.x, player.y + 4);
    if (!started) {
      ctx.fillStyle = "rgba(231,238,245,.85)"; ctx.font = "500 15px system-ui"; ctx.textAlign = "center";
      ctx.fillText("Tap or press space to flow", W / 2, H * 0.28);
    }
  }

  return {
    name: "Circuit Dash", blurb: "Fly the electron through the gaps", color: "#5AA9FF",
    icon: (c) => `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 12h5l2-5 3 10 2-5h4" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    start(onOver) { over = onOver; reset(); $("score").innerHTML = `Score <b>0</b>`; draw(); raf = requestAnimationFrame(step); },
    onTap() { if (!running) return; if (!started) started = true; player.vy = FLAP; tone(440, 70, "square", 0.1); }
  };
})();

const GAMES = { signal: Signal, dash: Dash };
const ORDER = ["signal", "dash"];

function openBuilder(id) {
  const url = chrome.runtime.getURL("builder.html" + (id ? `?id=${id}` : ""));
  chrome.windows.create({ url, type: "popup", width: 1040, height: 680 });
  window.close();
}

/* ---------- shell ---------- */
function fitCanvas() {
  const stage = $("stage").getBoundingClientRect();
  const size = Math.min(stage.width, stage.height) - 20;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
}

function graceLeft() {
  if (DAD) return Infinity;
  return sessionStart ? Math.max(0, GRACE_MS - (Date.now() - sessionStart)) : GRACE_MS;
}
function fmt(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

async function showMenu() {
  const list = $("game-list");
  let html = ORDER.map((k) => {
    const g = GAMES[k];
    return `<button class="gamecard" data-key="${k}">
      <span class="icon" style="background:${g.color}22">${g.icon(g.color)}</span>
      <span><span class="t">${g.name}</span><span class="d">${g.blurb}</span></span>
    </button>`;
  }).join("");

  // his own creations
  const { creations = [] } = await chrome.storage.local.get("creations");
  if (creations.length) {
    html += creations.map((c, i) => `<button class="gamecard" data-creation="${i}">
      <span class="icon" style="background:#F2B44122">${GAMES.dash.icon("#F2B441")}</span>
      <span><span class="t">${(c.name || "Untitled game").slice(0, 30)}</span><span class="d">Open, play, and tweak</span></span>
    </button>`).join("");
  }

  // always offer the builder
  html += `<button class="gamecard" data-build="1">
    <span class="icon" style="background:#35D07F22"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 20h16M6 16l4-8 4 6 2-3 2 5" stroke="#35D07F" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <span><span class="t">Make a game</span><span class="d">${creations.length ? "Build a new one from scratch" : "Build your own side-scroller"}</span></span>
  </button>`;

  list.innerHTML = html;
  list.querySelectorAll(".gamecard[data-key]").forEach((b) =>
    b.addEventListener("click", () => beginPlay(b.dataset.key)));
  list.querySelectorAll(".gamecard[data-creation]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { creations = [] } = await chrome.storage.local.get("creations");
      const c = creations[Number(b.dataset.creation)];
      if (c) openBuilder(c.id);
    }));
  const buildTile = list.querySelector(".gamecard[data-build]");
  if (buildTile) buildTile.addEventListener("click", () => openBuilder());

  const clock = $("menu-clock");
  clock.textContent = DAD
    ? "Dad mode — play as long as you like."
    : sessionStart
    ? (graceLeft() > 0 ? `Free restarts for ${fmt(graceLeft())}` : "Last run, make it count")
    : "You've got a few minutes. Have fun.";
  $("over").hidden = true;
  $("menu").hidden = false;
}

async function beginPlay(key) {
  if (sessionStart === null) sessionStart = Date.now();
  currentKey = key;
  current = GAMES[key];
  $("title").textContent = current.name;
  const best = await bestFor(key);
  $("score").innerHTML = best ? `Best <b>${best}</b>` : "";
  $("menu").hidden = true;
  $("over").hidden = true;
  current.start(onGameOver);
}

async function onGameOver(score) {
  const isBest = await saveBest(currentKey, score);
  const best = await bestFor(currentKey);
  const left = graceLeft();

  $("over-eyebrow").textContent = isBest ? "New best" : "Nice run";
  $("final").textContent = score;

  const actions = $("over-actions");
  if (left > 0) {
    $("over-msg").textContent = DAD
      ? "Play again or pick another."
      : `Free restarts for ${fmt(left)}. Play again or switch it up.`;
    actions.innerHTML = `<button class="btn" id="again">Play again</button><button class="btn ghost" id="switch">Pick another</button>`;
    $("over").hidden = false;
    $("again").onclick = () => beginPlay(currentKey);
    $("switch").onclick = showMenu;
  } else {
    $("over-msg").textContent = isBest
      ? "That's your best yet. Go investigate to earn another go."
      : `Your best is ${best}. Earn another game by looking into your projects.`;
    actions.innerHTML = "";
    $("over").hidden = false;
  }
}

/* single input path -> current game */
canvas.addEventListener("pointerdown", (e) => {
  if (!current) return;
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  current.onTap((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && current) { e.preventDefault(); current.onTap(-1, -1); }
});

async function boot() {
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  const settings = await chrome.runtime.sendMessage({ type: "SETTINGS" });
  GRACE_MS = Math.max(0, (settings?.graceSeconds ?? 120)) * 1000;

  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "dad") {
    const dad = await chrome.runtime.sendMessage({ type: "CHECK_DAD" });
    if (dad && dad.active) { DAD = true; showMenu(); return; }
  }

  const ticket = await chrome.runtime.sendMessage({ type: "CONSUME_TICKET", game: "arcade" });
  if (!ticket || !ticket.ok) { $("locked").hidden = false; return; }

  showMenu();
}
boot();
