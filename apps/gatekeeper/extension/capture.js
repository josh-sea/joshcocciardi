/* Gatekeeper - camera capture window
 * Live preview -> still -> send the photo plus a plain request to the
 * helper, so he can show what he means instead of describing it.
 */

const $ = (id) => document.getElementById(id);
let settings = {};
let stream = null;
let shotData = null; // base64 without prefix

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }

function searchUrl(q) {
  const u = new URL("https://www.google.com/search");
  u.searchParams.set("q", q);
  if (settings.forceSafeSearch !== false) u.searchParams.set("safe", "active");
  return u.toString();
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 }, audio: false });
    const v = $("video");
    v.srcObject = stream;
    await v.play().catch(() => {});
    $("snap").disabled = false;
  } catch (e) {
    $("frame-msg").hidden = false;
    $("frame-msg").textContent =
      "Couldn't open the camera. Allow camera access for the extension, then reopen this window. You can still type a request below.";
    $("send").disabled = false;
  }
}

function updateSend() {
  $("send").disabled = !(shotData || $("wanted").value.trim().length >= 3);
}

$("snap").addEventListener("click", () => {
  const v = $("video");
  const c = $("shot");
  const w = v.videoWidth || 640;
  const h = v.videoHeight || 480;
  // downscale so the payload stays small
  const scale = Math.min(1, 900 / Math.max(w, h));
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  shotData = c.toDataURL("image/jpeg", 0.7).split(",")[1];
  $("frame").classList.add("captured");
  $("snap").hidden = true;
  $("retake").hidden = false;
  updateSend();
  $("wanted").focus();
});

$("retake").addEventListener("click", () => {
  shotData = null;
  $("frame").classList.remove("captured");
  $("snap").hidden = false;
  $("retake").hidden = true;
  updateSend();
});

$("wanted").addEventListener("input", updateSend);

function skeletons(n) {
  $("results").innerHTML = '<h2>Working on it</h2><div class="rail">' + '<div class="skeleton"></div>'.repeat(n) + "</div>";
}

function showNote(text) {
  const el = $("note");
  el.hidden = !text;
  el.textContent = text || "";
}

function renderResults(data) {
  const searches = data.searches || [];
  const resources = data.resources || [];
  if (!searches.length && !resources.length) {
    $("results").innerHTML = '<p class="empty">No ideas came back. Try taking the picture again or adding a few words.</p>';
    return;
  }
  let html = "";
  if (searches.length) {
    html += '<h2>Searches to try</h2><div class="rail">' +
      searches.map((s, i) => `<button class="item" data-kind="search" data-i="${i}">
        <div class="label">${esc(s.q)}</div><div class="why">${esc(s.why)}</div></button>`).join("") + "</div>";
  }
  if (resources.length) {
    html += '<h2>Places to start</h2><div class="rail">' +
      resources.map((r, i) => `<button class="item" data-kind="resource" data-i="${i}">
        <div class="label">${esc(r.title)}</div><div class="why">${esc(r.why)}</div>
        <div class="host">${esc(hostOf(r.url))}</div></button>`).join("") + "</div>";
  }
  $("results").innerHTML = html;
  $("results").onclick = (e) => {
    const btn = e.target.closest(".item");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const url = btn.dataset.kind === "search" ? searchUrl(searches[i].q) : resources[i].url;
    chrome.tabs.create({ url });
  };
}

$("send").addEventListener("click", async () => {
  const wanted = $("wanted").value.trim();
  $("send").disabled = true;
  showNote("");
  skeletons(3);

  const msg = { type: "SUGGEST", wanted };
  if (shotData) msg.image = { data: shotData, mime: "image/jpeg" };

  const data = await chrome.runtime.sendMessage(msg);
  $("send").disabled = false;

  if (!data || data.error) {
    $("results").innerHTML = '<p class="empty">Could not reach the helper. Check the API key in parent settings.</p>';
    return;
  }
  if (data.ok === false) {
    showNote(data.note || "Not something I can help with.");
    $("results").innerHTML = "";
    return;
  }
  if (data.note) showNote(data.note);
  renderResults(data);
});

window.addEventListener("pagehide", () => {
  if (stream) stream.getTracks().forEach((t) => t.stop());
});

(async () => {
  settings = await chrome.runtime.sendMessage({ type: "SETTINGS" });
  startCamera();
})();
