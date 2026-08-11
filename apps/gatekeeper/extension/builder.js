/* Gatekeeper - game builder
 *
 * Extension page (has chrome.*). Holds game code and storage, talks to the
 * background for AI edits, and drives the sandboxed iframe over postMessage.
 * The sandbox never sees the API key or any user data, only game code.
 *
 * Reliability: every new generation is tried in the sandbox; if it reports
 * an error or the frame goes silent (a runaway loop), we revert to the last
 * good version and, if needed, reload the iframe to kill the runaway.
 */

const $ = (id) => document.getElementById(id);
const frame = $("game");

const STARTER = `{
  meta: { name: "Runner" },
  world: { length: 3400, groundY: 280 },
  theme: { sky: "#0E1A24", ground: "#2C7A4B", player: "#F2B441" },
  player: { doubleJump: false, fly: false, dash: false, weapon: false, stompKill: true },
  platforms: [
    { x: 320, y: 220, w: 90, h: 16 },
    { x: 520, y: 180, w: 90, h: 16 },
    { x: 760, y: 220, w: 110, h: 16 },
    { x: 1050, y: 170, w: 90, h: 16 },
    { x: 1360, y: 210, w: 120, h: 16 },
    { x: 1720, y: 180, w: 100, h: 16 },
    { x: 2050, y: 220, w: 120, h: 16 },
    { x: 2420, y: 175, w: 100, h: 16 },
    { x: 2780, y: 215, w: 130, h: 16 }
  ],
  enemies: [
    { x: 560, y: 258, type: "walker", speed: 1.1 },
    { x: 1100, y: 258, type: "walker", speed: 1.3 },
    { x: 1780, y: 258, type: "walker", speed: 1.1 },
    { x: 2480, y: 258, type: "walker", speed: 1.4 }
  ],
  coins: [
    { x: 350, y: 195 }, { x: 555, y: 155 }, { x: 800, y: 195 },
    { x: 1090, y: 145 }, { x: 1400, y: 185 }, { x: 1760, y: 155 },
    { x: 2100, y: 195 }, { x: 2460, y: 150 }, { x: 2820, y: 190 }
  ],
  powerups: [
    { x: 780, y: 195, kind: "grow" },
    { x: 1720, y: 155, kind: "heart" }
  ],
  goal: { x: 3300 },
  knobs: [
    { id: "gravity", label: "Gravity", min: 0.2, max: 1.2, step: 0.05, value: 0.5 },
    { id: "jump", label: "Jump height", min: 6, max: 20, step: 1, value: 11 },
    { id: "speed", label: "Run speed", min: 1.5, max: 8, step: 0.5, value: 4 },
    { id: "hearts", label: "Hearts", min: 1, max: 9, step: 1, value: 3 }
  ]
}`;

const CHIPS = ["Let me fly", "Double jump", "Give me a laser", "Add power-ups", "Make me bigger", "Add more enemies", "Bouncier jumps", "Make it harder"];

let currentCode = STARTER;
let lastGoodCode = STARTER;
let history = [];
let knobValues = {};
let creationId = null;
let sandboxReady = false;
let isDad = false;

/* ---------- watchdog ---------- */
let lastTick = Date.now();
let pendingLoad = null; // { code, resolve }
setInterval(() => {
  if (sandboxReady && Date.now() - lastTick > 2600) {
    // the frame went silent: reload it and restore the last good code
    reloadFrame();
  }
}, 1000);

function reloadFrame() {
  sandboxReady = false;
  currentCode = lastGoodCode;
  frame.src = "sandbox.html";
  showMsg("bad", "That change froze the game, so I put it back the way it was.");
}

/* ---------- iframe bridge ---------- */

function send(msg) { frame.contentWindow.postMessage(msg, "*"); }

function loadCode(code, values) {
  return new Promise((resolve) => {
    pendingLoad = { resolve, timer: setTimeout(() => resolve({ ok: false, message: "The game took too long to load." }), 4000) };
    send({ type: "LOAD", code, knobValues: values || null });
  });
}

window.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "BOOT") {
    sandboxReady = true;
    lastTick = Date.now();
    // (re)load whatever code we currently hold
    loadCode(currentCode, knobValues);
    return;
  }
  if (m.type === "TICK") { lastTick = Date.now(); return; }
  if (m.type === "KNOBS") {
    renderKnobs(m.knobs, m.values);
    knobValues = { ...m.values };
    $("code").textContent = currentCode;
    return;
  }
  if (m.type === "READY") {
    if (pendingLoad) { clearTimeout(pendingLoad.timer); pendingLoad.resolve({ ok: true }); pendingLoad = null; }
    return;
  }
  if (m.type === "ERROR") {
    if (pendingLoad) { clearTimeout(pendingLoad.timer); pendingLoad.resolve({ ok: false, message: m.message }); pendingLoad = null; }
    else showMsg("bad", m.message);
    return;
  }
  if (m.type === "EVENT") {
    if (m.event === "win") $("stage-hud").textContent = "You reached the flag!";
    else if (m.event === "lose") $("stage-hud").textContent = "Out of hearts — press space to retry";
    else if (m.event === "start") $("stage-hud").textContent = "";
    return;
  }
});

/* ---------- apply a new version safely ---------- */

async function applyCode(newCode, { fromAI } = {}) {
  const prev = currentCode;
  const res = await loadCode(newCode, knobValues);
  if (res.ok) {
    if (fromAI) { history.push(prev); $("undo").disabled = history.length === 0; }
    currentCode = newCode;
    lastGoodCode = newCode;
    $("code").textContent = newCode;
    return true;
  }
  // revert
  await loadCode(prev, knobValues);
  currentCode = prev;
  showMsg("bad", "That one didn't work: " + (res.message || "unknown problem") + " I kept your game as it was.");
  return false;
}

/* ---------- AI edit ---------- */

async function requestChange(text) {
  if (!text || text.trim().length < 2) return;
  $("send").disabled = true;
  showMsg("think", "Working on it...");
  const res = await chrome.runtime.sendMessage({ type: "BUILD_GAME", request: text.trim(), code: currentCode });
  $("send").disabled = false;

  if (!res || res.error) {
    showMsg("bad", res && res.error ? res.error : "Could not reach the game maker. Check the API key in settings.");
    return;
  }
  if (res.declined) {
    showMsg("think", res.note || "That one can't be done in this kind of game.");
    return;
  }
  const ok = await applyCode(res.code, { fromAI: true });
  if (ok) { showMsg("ok", res.note || "Done. Give it a try."); $("request").value = ""; }
}

/* ---------- knobs ---------- */

function renderKnobs(knobs, values) {
  $("knob-card").hidden = false;
  $("knobs").innerHTML = knobs.map((k) => {
    const v = values[k.id] ?? k.value;
    return `<div class="knob" data-id="${k.id}">
      <div class="top"><span>${k.label}</span><span class="val">${v}</span></div>
      <input type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${v}" />
    </div>`;
  }).join("");
  $("knobs").querySelectorAll(".knob").forEach((row) => {
    const id = row.dataset.id;
    const range = row.querySelector("input");
    range.addEventListener("input", () => {
      const val = Number(range.value);
      row.querySelector(".val").textContent = val;
      knobValues[id] = val;
      send({ type: "SET_KNOB", id, value: val });
    });
  });
}

/* ---------- save / load ---------- */

async function getCreations() {
  const { creations = [] } = await chrome.storage.local.get("creations");
  return creations;
}

async function saveCreation() {
  const name = $("game-name").value.trim() || "My Game";
  const creations = await getCreations();
  const now = Date.now();
  if (creationId) {
    const c = creations.find((c) => c.id === creationId);
    if (c) { c.name = name; c.code = lastGoodCode; c.knobValues = { ...knobValues }; c.updatedAt = now; }
  } else {
    creationId = "g" + now;
    creations.unshift({ id: creationId, name, code: lastGoodCode, knobValues: { ...knobValues }, createdAt: now, updatedAt: now });
  }
  await chrome.storage.local.set({ creations: creations.slice(0, 40) });
  showMsg("ok", `Saved "${name}". You can find it under My games.`);
  renderList(await getCreations());
}

async function renderList(creations) {
  const el = $("list");
  if (!creations.length) { el.innerHTML = ""; return; }
  el.innerHTML = creations.map((c) =>
    `<div class="listrow">
       <button class="btn" data-load="${c.id}" style="flex:1;text-align:left">${escapeHtml(c.name)}</button>
       ${isDad ? `<button class="btn del" data-del="${c.id}" title="Delete">✕</button>` : ""}
     </div>`
  ).join("");
  el.querySelectorAll("[data-load]").forEach((b) =>
    b.addEventListener("click", () => loadCreation(b.dataset.load)));
  el.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteCreation(b.dataset.del)));
}

async function deleteCreation(id) {
  const creations = await getCreations();
  const c = creations.find((c) => c.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.name}"? This can't be undone.`)) return;
  const remaining = creations.filter((c) => c.id !== id);
  await chrome.storage.local.set({ creations: remaining });
  if (creationId === id) { creationId = null; $("game-name").value = "My Game"; }
  renderList(remaining);
  showMsg("ok", `Deleted "${c.name}".`);
}

async function loadCreation(id) {
  const creations = await getCreations();
  const c = creations.find((c) => c.id === id);
  if (!c) return;
  creationId = c.id;
  $("game-name").value = c.name;
  knobValues = { ...(c.knobValues || {}) };
  history = []; $("undo").disabled = true;
  currentCode = c.code; lastGoodCode = c.code;
  await applyCode(c.code, {});
  showMsg("ok", `Loaded "${c.name}".`);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showMsg(kind, text) {
  const el = $("msg");
  el.hidden = false;
  el.className = "msg " + kind;
  el.textContent = text;
}

/* ---------- wire up ---------- */

$("chips").innerHTML = CHIPS.map((c) => `<button class="chip">${c}</button>`).join("");
$("chips").addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) { $("request").value = e.target.textContent; requestChange(e.target.textContent); }
});
$("send").addEventListener("click", () => requestChange($("request").value));
$("request").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) requestChange($("request").value);
});
$("save").addEventListener("click", saveCreation);
$("undo").addEventListener("click", async () => {
  if (!history.length) return;
  const prev = history.pop();
  $("undo").disabled = history.length === 0;
  currentCode = prev;
  await applyCode(prev, {});
  showMsg("ok", "Put it back one step.");
});
$("mine").addEventListener("click", async () => renderList(await getCreations()));
$("fresh").addEventListener("click", async () => {
  creationId = null; $("game-name").value = "My Game";
  knobValues = {}; history = []; $("undo").disabled = true;
  currentCode = STARTER; lastGoodCode = STARTER;
  await applyCode(STARTER, {});
  showMsg("ok", "Fresh game ready.");
});

(async () => {
  const dad = await chrome.runtime.sendMessage({ type: "CHECK_DAD" });
  isDad = !!(dad && dad.active);

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const list = await getCreations();
  renderList(list);
  if (id && list.find((c) => c.id === id)) {
    const c = list.find((c) => c.id === id);
    creationId = c.id; $("game-name").value = c.name;
    knobValues = { ...(c.knobValues || {}) };
    currentCode = c.code; lastGoodCode = c.code;
  }
  // sandbox will emit BOOT when ready, which triggers the initial load
})();
