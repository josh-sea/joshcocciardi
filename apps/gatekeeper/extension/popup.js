/* Gatekeeper - popup */

const $ = (id) => document.getElementById(id);
let settings = {};

function searchUrl(q) {
  const u = new URL("https://www.google.com/search");
  u.searchParams.set("q", q);
  if (settings.forceSafeSearch !== false) u.searchParams.set("safe", "active");
  return u.toString();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openTab(url) {
  chrome.tabs.create({ url });
  window.close();
}

/* ---------- side quest ---------- */

let quest = { attemptsLeft: 3 };

function launchGame() {
  chrome.windows.create({
    url: chrome.runtime.getURL("game.html"),
    type: "popup",
    width: 480,
    height: 680
  });
  window.close();
}

function openCamera() {
  chrome.windows.create({
    url: chrome.runtime.getURL("capture.html"),
    type: "popup",
    width: 480,
    height: 720
  });
  window.close();
}

function openBuilder() {
  chrome.windows.create({
    url: chrome.runtime.getURL("builder.html"),
    type: "popup",
    width: 1040,
    height: 680
  });
  window.close();
}

/* ---------- sessions ---------- */

function renderSessionGate(st, { asChange } = {}) {
  const el = $("session");
  if (!st.hasPin) {
    el.innerHTML = `<div class="sess-card">
      <div class="kicker">Session</div>
      <div class="head">Set a PIN first</div>
      <div class="body">Sessions need a grown-up PIN so a grown-up is the one who sets what each session is for.</div>
      <div class="muted">Open Parent settings below and add a PIN, then start a session here.</div>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="sess-card">
    <div class="kicker">${asChange ? "New session" : "Start a session"}</div>
    <div class="head">What are you working on?</div>
    <div class="body">A grown-up sets what this session is for. Gatekeeper keeps things pointed at it until a grown-up changes it.</div>
    <textarea id="sess-goal" placeholder="Like: learn how electric motors work for my project"></textarea>
    <input type="password" id="sess-pin" inputmode="numeric" autocomplete="off" placeholder="Grown-up PIN" />
    <div class="err" id="sess-err"></div>
    <button id="sess-start">Start session</button>
    ${asChange ? `<div class="muted"><button id="sess-cancel" style="background:none;border:none;color:var(--muted);font:inherit;cursor:pointer;padding:0">Keep the current session</button></div>` : ""}
  </div>`;

  const goal = $("sess-goal"), pin = $("sess-pin");
  const submit = async () => {
    const res = await chrome.runtime.sendMessage({ type: "START_SESSION", pin: pin.value, goal: goal.value });
    if (res.ok) location.reload();
    else { $("sess-err").textContent = res.reason || "That didn't work."; }
  };
  $("sess-start").addEventListener("click", submit);
  pin.addEventListener("keydown", (e) => e.key === "Enter" && submit());
  setTimeout(() => goal.focus(), 40);
  if (asChange) $("sess-cancel")?.addEventListener("click", () => renderSessionChip(st.session));
}

function renderSessionChip(session) {
  const el = $("session");
  if (!session) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="sess-chip">
    <span class="g"><span class="lab">This session</span><b>${esc(session.goal)}</b></span>
    <button id="sess-change">New session</button>
  </div>`;
  $("sess-change").addEventListener("click", async () => {
    const st = await chrome.runtime.sendMessage({ type: "SESSION_STATE" });
    renderSessionGate(st, { asChange: true });
  });
}

/* ---------- dad mode ---------- */

let dadTimer = null;

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function showDadBanner(until) {
  clearInterval(dadTimer);
  const banner = $("dad-banner");
  banner.hidden = false;
  const tick = () => {
    const left = until - Date.now();
    if (left <= 0) { clearInterval(dadTimer); banner.hidden = true; return; }
    $("dad-clock").textContent = fmtLeft(left);
  };
  tick();
  dadTimer = setInterval(tick, 1000);
}

function openDadGames() {
  chrome.windows.create({
    url: chrome.runtime.getURL("game.html?mode=dad"),
    type: "popup",
    width: 480,
    height: 680
  });
  window.close();
}

function wireDad(st) {
  if (st.dadActive && st.dadUntil) showDadBanner(st.dadUntil);

  $("dad-games").addEventListener("click", openDadGames);
  $("dad-build").addEventListener("click", openBuilder);
  $("dad-end").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "END_DAD" });
    $("dad-banner").hidden = true;
    clearInterval(dadTimer);
  });

  const overlay = $("dad-overlay");
  const pin = $("dad-pin");
  $("dad").addEventListener("click", () => {
    overlay.hidden = false;
    $("dad-err").textContent = "";
    pin.value = "";
    setTimeout(() => pin.focus(), 40);
  });
  $("dad-cancel").addEventListener("click", () => (overlay.hidden = true));

  const submit = async () => {
    const res = await chrome.runtime.sendMessage({ type: "START_DAD", pin: pin.value });
    if (res.ok) { overlay.hidden = true; showDadBanner(res.until); }
    else { $("dad-err").textContent = res.reason || "That didn't work."; pin.value = ""; pin.focus(); }
  };
  $("dad-go").addEventListener("click", submit);
  pin.addEventListener("keydown", (e) => e.key === "Enter" && submit());
}

function tries(n) {
  return `<div class="tries">${[0, 1, 2].map((i) => `<span class="dot ${i >= n ? "used" : ""}"></span>`).join("")}</div>`;
}

function renderQuestState(st) {
  const el = $("quest");

  if (!st.enabled) { el.innerHTML = ""; return; }

  if (st.questActive) {
    renderQuestion(st.question, st.sourceLabel, st.attemptsLeft);
    return;
  }

  if (st.cooldownMinutes > 0) {
    el.innerHTML = `<div class="quest">
      <div class="kicker">Side quest</div>
      <div class="head">Take a breather</div>
      <div class="body">Go read up on something, then come back in about ${st.cooldownMinutes} min for a new quest.</div>
    </div>`;
    return;
  }

  if (st.tokens > 0) {
    const cls = st.offer ? "quest big" : "quest";
    el.innerHTML = `<div class="${cls}">
      <div class="kicker">Side quest ready</div>
      <div class="head">${st.tokens > 1 ? st.tokens + " games unlocked" : "A game is waiting"}</div>
      <div class="body">Answer one question about something you looked at, and it's yours. Three tries.</div>
      <div class="row"><button class="primary" id="quest-start">Start the quest</button></div>
    </div>`;
    $("quest-start").addEventListener("click", startQuest);
    return;
  }

  // no tokens: show progress toward the next one
  const pct = Math.min(100, Math.round((st.readingBank / st.secondsPerToken) * 100));
  el.innerHTML = `<div class="quest">
    <div class="kicker">Side quest</div>
    <div class="head">Keep digging</div>
    <div class="body">Read and dig into your projects to unlock a game. A good appeal earns one too.</div>
    <div class="meter">${pct}% to your next game</div>
  </div>`;
}

async function startQuest() {
  $("quest").innerHTML = `<div class="quest"><div class="kicker">Side quest</div><div class="head">Cooking up a question...</div></div>`;
  const res = await chrome.runtime.sendMessage({ type: "START_QUEST" });
  if (res.error) {
    $("quest").innerHTML = `<div class="quest"><div class="kicker">Side quest</div><div class="body">${esc(res.error)}</div></div>`;
    return;
  }
  if (res.cooldown) {
    renderQuestState({ enabled: true, cooldownMinutes: res.cooldown });
    return;
  }
  renderQuestion(res.question, res.sourceLabel, res.attemptsLeft);
}

function renderQuestion(question, sourceLabel, attemptsLeft) {
  quest.attemptsLeft = attemptsLeft;
  $("quest").innerHTML = `<div class="quest big">
    <div class="kicker">Answer to play</div>
    <div class="q">${esc(question)}</div>
    ${sourceLabel ? `<div class="src">from ${esc(sourceLabel)}</div>` : ""}
    ${tries(3 - attemptsLeft)}
    <textarea id="answer" placeholder="Type what you think..."></textarea>
    <div class="hint" id="quest-hint" hidden></div>
    <div class="row">
      <button class="primary" id="answer-send" disabled>Check it</button>
    </div>
  </div>`;

  const ta = $("answer");
  const send = $("answer-send");
  ta.addEventListener("input", () => { send.disabled = ta.value.trim().length < 2; });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !send.disabled) send.click();
  });
  send.addEventListener("click", () => submitAnswer(ta.value.trim()));
  setTimeout(() => ta.focus(), 40);
}

async function submitAnswer(answer) {
  const send = $("answer-send");
  send.disabled = true;
  send.textContent = "Checking...";
  const res = await chrome.runtime.sendMessage({ type: "ANSWER_QUEST", answer });

  if (res.correct) {
    $("quest").innerHTML = `<div class="quest big">
      <div class="kicker">Unlocked</div>
      <div class="head">Nice. Loading your game...</div>
    </div>`;
    setTimeout(() => launchGame(), 700);
    return;
  }

  const hintEl = $("quest-hint");
  if (res.over) {
    $("quest").innerHTML = `<div class="quest">
      <div class="kicker">Out of tries</div>
      <div class="body">${esc(res.hint || "That one got away.")} Go dig into it a bit more and a fresh quest will show up in about ${res.cooldown || 10} min.</div>
    </div>`;
    return;
  }

  hintEl.hidden = false;
  hintEl.className = "hint wrong";
  hintEl.textContent = res.hint || "Not quite. Try again.";
  document.querySelector(".tries")?.replaceWith(elementFrom(tries(3 - res.attemptsLeft)));
  send.textContent = "Check it";
  const ta = $("answer");
  ta.value = "";
  ta.focus();
}

function elementFrom(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
}

function skeletons(n = 3) {
  $("results").innerHTML =
    '<h2>Working on it</h2><div class="rail">' +
    '<div class="skeleton"></div>'.repeat(n) +
    "</div>";
}

function renderResults(data) {
  const searches = data.searches || [];
  const resources = data.resources || [];

  if (!searches.length && !resources.length) {
    $("results").innerHTML = '<p class="empty">No ideas came back. Try asking for something more specific.</p>';
    return;
  }

  let html = "";

  if (searches.length) {
    html += "<h2>Searches to try</h2><div class=\"rail\">";
    html += searches.map((s, i) =>
      `<button class="item" data-kind="search" data-i="${i}">
         <div class="label">${esc(s.q)}</div>
         <div class="why">${esc(s.why)}</div>
       </button>`
    ).join("");
    html += "</div>";
  }

  if (resources.length) {
    html += "<h2>Places to start</h2><div class=\"rail\">";
    html += resources.map((r, i) =>
      `<button class="item" data-kind="resource" data-i="${i}">
         <div class="label">${esc(r.title)}</div>
         <div class="why">${esc(r.why)}</div>
         <div class="host">${esc(hostOf(r.url))}</div>
       </button>`
    ).join("");
    html += "</div>";
  }

  $("results").innerHTML = html;

  $("results").addEventListener("click", (e) => {
    const btn = e.target.closest(".item");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.kind === "search") openTab(searchUrl(searches[i].q));
    else openTab(resources[i].url);
  });
}

function showNote(text, bad = false) {
  const el = $("note");
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("bad", bad);
}

async function request({ wanted, force } = {}) {
  showNote("");
  skeletons(wanted ? 3 : 4);
  $("go").disabled = true;

  const data = await chrome.runtime.sendMessage({ type: "SUGGEST", wanted, force });

  $("go").disabled = false;

  if (!data || data.error) {
    $("results").innerHTML =
      '<p class="empty">Could not reach the helper. Check the API key in parent settings.</p>';
    return;
  }
  if (data.ok === false) {
    showNote(data.note || "Not something I can help with.", true);
    $("results").innerHTML = "";
    return;
  }
  if (data.note) showNote(data.note);
  renderResults(data);
}

async function init() {
  settings = await chrome.runtime.sendMessage({ type: "SETTINGS" });

  $("greeting").textContent = settings.kidName ? `Hey ${settings.kidName}` : "What's next";
  $("project").textContent = settings.projectContext || "";

  wireDad(settings);
  $("show").addEventListener("click", openCamera);
  $("make").addEventListener("click", openBuilder);
  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  // sessions gate the helper: no active session means an adult must start one
  const sess = await chrome.runtime.sendMessage({ type: "SESSION_STATE" });
  const helperEls = [$("quest"), document.querySelector(".ask"), $("show"), $("make"), $("results"), $("note")];
  const footerHelp = $("refresh");

  if (sess && sess.needsSession) {
    renderSessionGate(sess);
    helperEls.forEach((el) => el && (el.hidden = true));
    if (footerHelp) footerHelp.hidden = true;
    return; // nothing else loads until a session exists
  }

  if (sess && sess.session) renderSessionChip(sess.session);

  const { passes = [] } = await chrome.storage.local.get("passes");
  const live = passes.filter((p) => p.expiresAt > Date.now());
  if (live.length) {
    $("passes").innerHTML = live
      .map((p) => `<span class="pass">${esc(p.topic)} open</span>`)
      .join("");
  }

  chrome.runtime.sendMessage({ type: "QUEST_STATE" }).then((st) => {
    if (st) renderQuestState(st);
  });

  $("go").addEventListener("click", () => {
    const wanted = $("wanted").value.trim();
    if (wanted.length < 3) return;
    request({ wanted });
  });

  $("wanted").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("go").click();
  });

  $("refresh").addEventListener("click", () => {
    $("wanted").value = "";
    request({ force: true });
  });

  request();
}

init();
