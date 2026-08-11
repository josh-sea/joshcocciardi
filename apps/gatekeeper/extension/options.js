/* Gatekeeper - options page */

const $ = (id) => document.getElementById(id);

const TEXT_FIELDS = ["apiKey", "fastModel", "deepModel", "kidName", "projectContext", "parentPin"];
const NUM_FIELDS = ["kidAge", "cacheTtlMinutes", "passMinutes", "retentionDays", "secondsPerToken", "maxTokens", "questCooldownMinutes", "graceSeconds", "dadMinutes"];
const BOOL_FIELDS = ["enabled", "checkAllNavigations", "forceSafeSearch", "logVisits", "autoArchive", "gamesEnabled", "requireSession"];
const LIST_FIELDS = ["allowlist", "denylist", "bypassHosts"];

let settings = {};
let events = [];

/* ---------- boot ---------- */

async function load() {
  const store = await chrome.storage.local.get(["settings", "pending", "passes", "sessionHistory", "session"]);
  settings = store.settings || {};

  TEXT_FIELDS.forEach((k) => ($(k).value = settings[k] ?? ""));
  NUM_FIELDS.forEach((k) => ($(k).value = settings[k] ?? 0));
  BOOL_FIELDS.forEach((k) => ($(k).checked = settings[k] !== false));
  LIST_FIELDS.forEach((k) => ($(k).value = (settings[k] || []).join("\n")));
  $("failMode").value = settings.failMode || "closed";

  renderPending(store.pending || []);
  renderPasses(store.passes || []);
  renderSessions(store.sessionHistory || [], store.session || null);
  await loadLog();

  gate();
}

function gate() {
  if (!settings.parentPin) {
    $("app").hidden = false;
    return;
  }
  $("gate").hidden = false;
  const attempt = () => {
    if ($("pin-input").value === settings.parentPin) {
      $("gate").hidden = true;
      $("app").hidden = false;
    } else {
      $("pin-err").textContent = "That PIN doesn't match.";
      $("pin-input").value = "";
    }
  };
  $("pin-go").addEventListener("click", attempt);
  $("pin-input").addEventListener("keydown", (e) => e.key === "Enter" && attempt());
  $("pin-input").focus();
}

async function save() {
  const next = { ...settings };
  TEXT_FIELDS.forEach((k) => (next[k] = $(k).value.trim()));
  NUM_FIELDS.forEach((k) => (next[k] = Number($(k).value) || 0));
  BOOL_FIELDS.forEach((k) => (next[k] = $(k).checked));
  LIST_FIELDS.forEach((k) => {
    next[k] = $(k).value.split("\n").map((s) => s.trim()).filter(Boolean);
  });
  next.failMode = $("failMode").value;

  await chrome.storage.local.set({ settings: next });
  settings = next;
  flash($("saved"), "Saved");
}

function flash(el, text) {
  el.textContent = text;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 1800);
}

/* ---------- log ---------- */

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

async function loadLog() {
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  const range = Number($("range").value);
  let days = logDays;
  if (range) {
    const cutoff = dayKey(Date.now() - (range - 1) * 86400000);
    days = logDays.filter((d) => d >= cutoff);
  }
  events = days.length
    ? await chrome.runtime.sendMessage({ type: "READ_LOG", days })
    : [];
  renderLog();
}

function visible() {
  const outcome = $("filter").value;
  const q = $("search").value.trim().toLowerCase();
  return events.filter((e) => {
    if (outcome && e.decision !== outcome) return false;
    if (!q) return true;
    return [e.target, e.title, e.appeal, e.reason, e.topic, e.host]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });
}

function renderSummary(rows) {
  const count = (d) => rows.filter((e) => e.decision === d).length;
  const sites = new Set(rows.filter((e) => e.host).map((e) => e.host)).size;
  const minutes = Math.round(rows.reduce((s, e) => s + (e.seconds || 0), 0) / 60);
  const stats = [
    { k: "Events", n: rows.length, cls: "" },
    { k: "Sites", n: sites, cls: "" },
    { k: "Minutes", n: minutes, cls: "" },
    { k: "Allowed", n: count("allow"), cls: "allow" },
    { k: "Stopped", n: count("ask"), cls: "ask" },
    { k: "Blocked", n: count("block") + count("deny"), cls: "block" }
  ];
  $("summary").innerHTML = stats
    .map((s) => `<div class="stat ${s.cls}"><div class="n">${s.n}</div><div class="k">${s.k}</div></div>`)
    .join("");
}

function when(ts) {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dur(s) {
  if (!s) return "";
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h " + (m % 60) + "m";
}

function renderLog() {
  const rows = visible();
  renderSummary(rows);
  const el = $("log");
  if (!rows.length) {
    el.innerHTML = '<p class="empty">Nothing matches.</p>';
    return;
  }
  el.innerHTML =
    "<table><tr><th>When</th><th>Call</th><th>Time</th><th>What</th><th>Notes</th></tr>" +
    rows.slice(0, 400).map((e) => {
      const target = e.kind === "search" ? `search: ${e.target}` : e.title || e.target;
      const notes = [e.appeal ? `He said: "${e.appeal}"` : "", e.reason || ""].filter(Boolean).join(" / ");
      return `<tr>
        <td class="t">${when(e.ts)}</td>
        <td><span class="tag ${e.decision}">${e.decision}</span></td>
        <td class="secs">${dur(e.seconds)}</td>
        <td class="tgt" title="${escapeHtml(e.target)}">${escapeHtml(String(target).slice(0, 150))}</td>
        <td>${escapeHtml(notes)}</td>
      </tr>`;
    }).join("") +
    "</table>" +
    (rows.length > 400 ? `<p class="empty">Showing the newest 400 of ${rows.length}. Export for the rest.</p>` : "");
}

/* ---------- export ---------- */

function download(text, mime, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const CSV_COLS = ["ts", "kind", "decision", "source", "host", "target", "title", "seconds", "topic", "appeal", "reason", "from", "engine"];

function toCsv(rows) {
  const cell = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = ["time", ...CSV_COLS.slice(1)].join(",");
  const body = rows.map((e) =>
    [new Date(e.ts).toISOString(), ...CSV_COLS.slice(1).map((c) => e[c])].map(cell).join(",")
  );
  return [header, ...body].join("\n");
}

function stamp() {
  return dayKey(Date.now());
}

/* ---------- pending and passes ---------- */

function renderPending(pending) {
  const el = $("pending");
  if (!pending.length) {
    el.innerHTML = '<p class="empty">Nothing waiting.</p>';
    return;
  }
  el.innerHTML = pending.map((p) => `
    <div class="card" data-id="${p.id}">
      <div class="who">${when(p.ts)} &middot; ${p.appeal ? escapeHtml(p.appeal) : "No reason given."}</div>
      <div class="what">${escapeHtml(p.target)}</div>
      <div class="row">
        <button class="primary" data-act="approve">Allow this site</button>
        <button class="quiet" data-act="deny">Add to blocked</button>
        <button class="quiet" data-act="dismiss">Dismiss</button>
      </div>
    </div>`).join("");
}

function renderPasses(passes) {
  const live = passes.filter((p) => p.expiresAt > Date.now());
  const el = $("passes");
  if (!live.length) {
    el.innerHTML = '<p class="empty">No active passes.</p>';
    return;
  }
  el.innerHTML = "<table><tr><th>Topic</th><th>Expires</th><th></th></tr>" +
    live.map((p) => `<tr><td>${escapeHtml(p.topic)}</td><td class="t">${when(p.expiresAt)}</td>
      <td><button class="quiet" data-pass="${escapeHtml(p.topic)}">Revoke</button></td></tr>`).join("") +
    "</table>";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- events ---------- */

$("save").addEventListener("click", save);

$("clear-cache").addEventListener("click", async () => {
  await chrome.storage.local.set({ cache: {} });
  flash($("saved"), "Cleared");
});

$("range").addEventListener("change", loadLog);
$("filter").addEventListener("change", renderLog);
$("search").addEventListener("input", renderLog);

$("export-json").addEventListener("click", () => {
  const rows = visible();
  download(
    JSON.stringify({ exportedAt: new Date().toISOString(), kid: settings.kidName, events: rows }, null, 2),
    "application/json",
    `gatekeeper-${stamp()}.json`
  );
  flash($("log-msg"), `${rows.length} exported`);
});

$("export-csv").addEventListener("click", () => {
  const rows = visible();
  download(toCsv(rows), "text/csv", `gatekeeper-${stamp()}.csv`);
  flash($("log-msg"), `${rows.length} exported`);
});

$("archive").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "ARCHIVE_NOW" });
  flash($("log-msg"), res?.ok ? `${res.count} saved` : res?.reason || "Failed");
});

$("clear-log").addEventListener("click", async () => {
  if (!confirm("Erase the whole activity history? Exports you've already saved are unaffected.")) return;
  const { logDays = [] } = await chrome.storage.local.get("logDays");
  await chrome.storage.local.remove(logDays.map((d) => "log:" + d));
  await chrome.storage.local.set({ logDays: [] });
  events = [];
  renderLog();
  flash($("log-msg"), "Erased");
});

$("pending").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest(".card");
  const id = card.dataset.id;
  const store = await chrome.storage.local.get(["pending", "settings"]);
  const pending = store.pending || [];
  const item = pending.find((p) => p.id === id);
  const next = { ...(store.settings || {}) };

  if (item && btn.dataset.act !== "dismiss") {
    let hostname = item.target;
    try { hostname = new URL(item.target).hostname.replace(/^www\./, ""); } catch {}
    const list = btn.dataset.act === "approve" ? "allowlist" : "denylist";
    next[list] = [...new Set([...(next[list] || []), hostname])];
    await chrome.storage.local.set({ settings: next });
    settings = next;
    LIST_FIELDS.forEach((k) => ($(k).value = (settings[k] || []).join("\n")));
  }

  const remaining = pending.filter((p) => p.id !== id);
  await chrome.storage.local.set({ pending: remaining });
  renderPending(remaining);
});

$("passes").addEventListener("click", async (e) => {
  const topic = e.target.closest("[data-pass]")?.dataset.pass;
  if (!topic) return;
  const { passes = [] } = await chrome.storage.local.get("passes");
  const remaining = passes.filter((p) => p.topic !== topic);
  await chrome.storage.local.set({ passes: remaining });
  renderPasses(remaining);
});

function renderSessions(history, current) {
  const el = document.getElementById("session-history");
  const rows = [];
  if (current) rows.push({ goal: current.goal, startedAt: current.startedAt, active: true });
  for (const h of history) rows.push(h);
  if (!rows.length) { el.innerHTML = '<p class="empty">No sessions yet.</p>'; return; }
  el.innerHTML =
    "<table><tr><th>Goal</th><th>Started</th><th></th></tr>" +
    rows.slice(0, 60).map((r) =>
      `<tr><td>${escapeHtml(r.goal)}</td><td class="t">${when(r.startedAt)}</td>
       <td>${r.active ? '<span class="tag allow">active</span>' : ""}</td></tr>`
    ).join("") + "</table>";
}

document.getElementById("clear-sessions").addEventListener("click", async () => {
  if (!confirm("Clear the session goal history? The active session is kept.")) return;
  await chrome.storage.local.set({ sessionHistory: [] });
  const { session } = await chrome.storage.local.get("session");
  renderSessions([], session || null);
});

/* ---------- account pairing ---------- */

async function refreshAccount() {
  const s = await chrome.runtime.sendMessage({ type: "CLOUD_STATE" });
  const paired = s && s.paired;
  $("account-unpaired").hidden = !!paired;
  $("account-paired").hidden = !paired;
  if (paired) {
    $("acct-hid").textContent = s.householdId || "";
    if (s.kidName) $("acct-kid").textContent = s.kidName;
    else $("acct-kid-wrap").hidden = true;
  }
}

$("pair-go").addEventListener("click", async () => {
  const code = $("pairCode").value.trim().toUpperCase();
  $("pair-err").textContent = "";
  if (code.length < 6) { $("pair-err").textContent = "Enter the six-character code."; return; }
  $("pair-go").disabled = true;
  const res = await chrome.runtime.sendMessage({ type: "PAIR", code, label: "Kid’s browser" });
  $("pair-go").disabled = false;
  if (res && res.ok) {
    $("pairCode").value = "";
    await refreshAccount();
    flash($("saved"), "Connected");
  } else {
    const map = {
      invalid_code: "That code isn't valid.",
      expired_code: "That code expired — generate a fresh one.",
      bad_token: "Pairing failed. Try a new code.",
    };
    $("pair-err").textContent = map[res && res.error] || ("Could not connect: " + (res && res.error || "unknown"));
  }
});

$("unpair-go").addEventListener("click", async () => {
  if (!confirm("Disconnect this browser from the account? Activity will stop syncing and the local API key (if any) is used again.")) return;
  await chrome.runtime.sendMessage({ type: "UNPAIR" });
  await refreshAccount();
});

refreshAccount();
load();
