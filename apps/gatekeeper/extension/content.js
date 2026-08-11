/* Gatekeeper - content script
 * Hides page content at document_start, asks the worker for a verdict,
 * then reveals, or shows the appeal panel in a shadow root.
 */

(() => {
  if (window.top !== window.self) return;
  if (!/^https?:$/.test(location.protocol)) return;

  const HIDE_ID = "gk-hide-style";
  const FAILSAFE_MS = 8000;
  let settings = null;
  let host = null;
  let root = null;
  const approved = new Set();

  /* ---------- page hiding ---------- */

  function hidePage() {
    if (document.getElementById(HIDE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_ID;
    style.textContent = "html > body { visibility: hidden !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function revealPage() {
    document.getElementById(HIDE_ID)?.remove();
  }

  hidePage();
  setTimeout(revealPage, FAILSAFE_MS);

  /* ---------- search engines ---------- */

  const ENGINES = [
    { test: (u) => /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/search"), param: "q", name: "Google", safe: ["safe", "active"] },
    { test: (u) => /(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith("/search"), param: "q", name: "Bing", safe: ["adlt", "strict"] },
    { test: (u) => /(^|\.)duckduckgo\.com$/.test(u.hostname), param: "q", name: "DuckDuckGo", safe: ["kp", "1"] },
    { test: (u) => /(^|\.)youtube\.com$/.test(u.hostname) && u.pathname.startsWith("/results"), param: "search_query", name: "YouTube", safe: null }
  ];

  function detectSearch(u) {
    for (const e of ENGINES) {
      if (e.test(u)) {
        const q = u.searchParams.get(e.param);
        if (q && q.trim()) return { ...e, query: q };
      }
    }
    return null;
  }

  function enforceSafeSearch(engine, u) {
    if (!settings?.forceSafeSearch || !engine.safe) return false;
    const [k, v] = engine.safe;
    if (u.searchParams.get(k) === v) return false;
    u.searchParams.set(k, v);
    location.replace(u.toString());
    return true;
  }

  /* ---------- messaging ---------- */

  function ask(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) =>
          resolve(res || { decision: "allow", reason: "", source: "no-response" })
        );
      } catch {
        resolve({ decision: "allow", reason: "", source: "no-response" });
      }
    });
  }

  /* ---------- UI ---------- */

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }

.wrap {
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; place-items: center;
  background: #0B0F13;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #E7EEF5;
  padding: 24px;
  animation: fade .18s ease-out;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }

.panel {
  width: min(520px, 100%);
  background: #151C24;
  border: 1px solid #24313D;
  border-radius: 14px;
  padding: 30px 30px 26px;
}

.eyebrow {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: #7E92A6;
}
[data-state="ask"] .eyebrow { color: #F2B441; }
[data-state="block"] .eyebrow, [data-state="deny"] .eyebrow { color: #E5484D; }
[data-state="allow"] .eyebrow { color: #35D07F; }

/* signature: a continuity trace that only closes when the answer is yes */
.trace { display: block; width: 100%; height: 42px; margin: 18px 0 20px; overflow: visible; }
.seg { stroke: #2B3947; stroke-width: 2; fill: none; stroke-linecap: round; }
.node { fill: #2B3947; }
.node.end { fill: #3A4B5C; }
.bridge { stroke: #35D07F; stroke-width: 2; fill: none; stroke-dasharray: 44; stroke-dashoffset: 44; stroke-linecap: round; }
.pulse { fill: #7E92A6; opacity: 0; }
.gap { stroke: #E5484D; stroke-width: 2; stroke-linecap: round; opacity: 0; }

[data-state="checking"] .pulse { opacity: 1; animation: travel 1.15s cubic-bezier(.4,0,.6,1) infinite; }
@keyframes travel { 0% { cx: 10px; opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { cx: 138px; opacity: 0 } }
[data-state="allow"] .bridge { stroke-dashoffset: 0; transition: stroke-dashoffset .45s ease-out; }
[data-state="allow"] .seg { stroke: #35D07F; transition: stroke .45s ease-out; }
[data-state="allow"] .node { fill: #35D07F; }
[data-state="block"] .gap, [data-state="deny"] .gap { opacity: 1; }

h1 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; margin-bottom: 8px; }
.reason { font-size: 15px; line-height: 1.55; color: #B7C6D4; }
.target {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px; color: #7E92A6; margin-top: 14px;
  word-break: break-all; line-height: 1.5;
}

textarea {
  width: 100%; margin-top: 18px; min-height: 88px; resize: vertical;
  background: #0F151B; color: #E7EEF5;
  border: 1px solid #2B3947; border-radius: 9px;
  padding: 12px 13px; font: inherit; font-size: 15px; line-height: 1.5;
}
textarea::placeholder { color: #5D6E7F; }
textarea:focus { outline: 2px solid #F2B441; outline-offset: 1px; border-color: transparent; }

.row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
button {
  font: inherit; font-size: 14px; font-weight: 500;
  border-radius: 9px; padding: 11px 18px; cursor: pointer;
  border: 1px solid transparent; transition: background .12s, border-color .12s;
}
button:focus-visible { outline: 2px solid #F2B441; outline-offset: 2px; }
.primary { background: #F2B441; color: #14181C; }
.primary:hover { background: #FFC85C; }
.primary:disabled { background: #3A4B5C; color: #7E92A6; cursor: default; }
.quiet { background: transparent; color: #B7C6D4; border-color: #2B3947; }
.quiet:hover { background: #1B242D; }

.hint { font-size: 13px; color: #7E92A6; margin-top: 14px; line-height: 1.5; }

/* small chip for link checks */
.chip {
  position: fixed; left: 18px; bottom: 18px; z-index: 2147483647;
  display: flex; align-items: center; gap: 9px;
  background: #151C24; border: 1px solid #24313D; border-radius: 999px;
  padding: 9px 16px 9px 13px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #B7C6D4;
  animation: fade .15s ease-out;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: #F2B441; animation: blink .9s ease-in-out infinite; }
@keyframes blink { 0%,100% { opacity: .25 } 50% { opacity: 1 } }

@media (prefers-reduced-motion: reduce) {
  .wrap, .chip { animation: none; }
  .pulse, .dot { animation: none; opacity: 1; }
  [data-state="allow"] .bridge, [data-state="allow"] .seg { transition: none; }
}
`;

  const TRACE_SVG = `
<svg class="trace" viewBox="0 0 320 42" aria-hidden="true">
  <path class="seg" d="M10 21 H 138" />
  <path class="seg" d="M182 21 H 310" />
  <path class="bridge" d="M138 21 H 182" />
  <path class="gap" d="M152 12 L 168 30" />
  <path class="gap" d="M168 12 L 152 30" />
  <circle class="node end" cx="10" cy="21" r="4.5" />
  <circle class="node end" cx="310" cy="21" r="4.5" />
  <circle class="pulse" cx="10" cy="21" r="3.5" />
</svg>`;

  function ensureRoot() {
    if (root) return root;
    host = document.createElement("div");
    host.id = "gk-root";
    host.style.cssText = "all:initial;position:static;visibility:visible!important;";
    (document.documentElement || document.body).appendChild(host);
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    return root;
  }

  function clearUI() {
    if (!root) return;
    [...root.children].forEach((c) => {
      if (c.tagName !== "STYLE") c.remove();
    });
  }

  function showChip(label = "Checking") {
    const r = ensureRoot();
    clearUI();
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span class="dot"></span><span>${label}</span>`;
    r.appendChild(chip);
    return () => chip.remove();
  }

  const COPY = {
    checking: { eyebrow: "Checking", title: "One second" },
    ask: { eyebrow: "Open circuit", title: "Tell me why" },
    block: { eyebrow: "Blocked", title: "Not this one" },
    deny: { eyebrow: "Blocked", title: "Not this one" },
    escalate: { eyebrow: "Sent to your dad", title: "He'll get back to you" },
    allow: { eyebrow: "Clear", title: "Go ahead" },
    nosession: { eyebrow: "No session yet", title: "Start a session first" },
    offsession: { eyebrow: "Off today's session", title: "Not part of this session" }
  };

  /**
   * Renders the panel. onResolve(true) means "continue", onResolve(false) means "go back".
   */
  function showPanel(state, { reason, target, kind, pageContext, onResolve }) {
    const r = ensureRoot();
    clearUI();

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.dataset.state = state;

    const copy = COPY[state] || COPY.ask;
    const canAppeal = state === "ask";
    const canEscalate = state === "block" || state === "deny";
    const sessionNote = state === "nosession"
      ? `<p class="hint">Click the Gatekeeper puzzle icon up in the toolbar and have a grown-up start a session.</p>`
      : state === "offsession"
      ? `<p class="hint">This isn't part of what today's session is for. A grown-up can start a new session if you want to explore it.</p>`
      : "";

    wrap.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true">
        <div class="eyebrow">${copy.eyebrow}</div>
        ${TRACE_SVG}
        <h1>${copy.title}</h1>
        <p class="reason"></p>
        <div class="target"></div>
        ${canAppeal ? `<textarea placeholder="What are you trying to find out, and how does it connect to what you're working on?"></textarea>` : ""}
        <div class="row">
          ${canAppeal ? `<button class="primary" data-act="send" disabled>Send my reason</button>` : ""}
          ${canEscalate ? `<button class="primary" data-act="escalate">Ask my dad</button>` : ""}
          <button class="quiet" data-act="back">Go back</button>
        </div>
        ${canAppeal ? `<p class="hint">A real reason usually works. "I want to see how this thing I found relates to my circuit" beats "because I want to."</p>` : ""}
        ${sessionNote}
      </div>`;

    wrap.querySelector(".reason").textContent = reason || "";
    wrap.querySelector(".target").textContent =
      kind === "search" ? `search: ${target}` : target;

    const ta = wrap.querySelector("textarea");
    const send = wrap.querySelector('[data-act="send"]');
    if (ta && send) {
      ta.addEventListener("input", () => {
        send.disabled = ta.value.trim().length < 8;
      });
      setTimeout(() => ta.focus(), 40);
    }

    wrap.addEventListener("click", async (e) => {
      const act = e.target.closest?.("[data-act]")?.dataset.act;
      if (!act) return;

      if (act === "back") {
        onResolve(false);
        return;
      }

      if (act === "escalate") {
        await ask({ type: "ESCALATE", kind, value: target, reason: "" });
        showPanel("escalate", {
          reason: "I passed this along. He can approve it from his settings page.",
          target, kind, pageContext, onResolve
        });
        return;
      }

      if (act === "send") {
        const text = ta.value.trim();
        send.disabled = true;
        send.textContent = "Thinking";
        wrap.dataset.state = "checking";
        const res = await ask({ type: "APPEAL", kind, value: target, reason: text, pageContext });
        if (res.decision === "allow") {
          wrap.dataset.state = "allow";
          wrap.querySelector(".eyebrow").textContent = COPY.allow.eyebrow;
          wrap.querySelector("h1").textContent = COPY.allow.title;
          wrap.querySelector(".reason").textContent = res.reason || "";
          wrap.querySelector(".row").innerHTML = "";
          setTimeout(() => onResolve(true), 900);
        } else if (res.decision === "escalate") {
          showPanel("escalate", { reason: res.reason, target, kind, pageContext, onResolve });
        } else {
          showPanel("deny", { reason: res.reason, target, kind, pageContext, onResolve });
        }
      }
    });

    r.appendChild(wrap);
  }

  /* ---------- visit heartbeat ---------- */

  function startHeartbeat(eventId) {
    if (!eventId) return;
    let seconds = 0;
    let sent = -1;

    const tick = () => {
      if (document.visibilityState === "visible") seconds += 5;
      if (seconds - sent >= 30) {
        sent = seconds;
        ask({ type: "HEARTBEAT", id: eventId, seconds, title: document.title || "" });
      }
    };

    const timer = setInterval(tick, 5000);

    const flush = () => {
      clearInterval(timer);
      if (seconds !== sent) {
        ask({ type: "HEARTBEAT", id: eventId, seconds, title: document.title || "" });
      }
    };

    window.addEventListener("pagehide", flush, { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && seconds !== sent) {
        sent = seconds;
        ask({ type: "HEARTBEAT", id: eventId, seconds, title: document.title || "" });
      }
    });

    // Send the real title once the head has parsed.
    const titleTimer = setTimeout(() => {
      if (document.title) ask({ type: "HEARTBEAT", id: eventId, seconds, title: document.title });
    }, 1500);
    window.addEventListener("pagehide", () => clearTimeout(titleTimer), { once: true });
  }

  /* ---------- guards ---------- */

  function goBack() {
    if (history.length > 1) history.back();
    else location.replace("about:blank");
  }

  async function guardCurrentPage(kind, value, pageContext) {
    const stop = showChip();
    const verdict = await ask({ type: "EVALUATE", kind, value, pageContext });
    stop();

    if (verdict.decision === "allow") {
      revealPage();
      clearUI();
      startHeartbeat(verdict.eventId);
      return;
    }

    try { window.stop(); } catch {}

    showPanel(verdict.decision, {
      reason: verdict.reason,
      target: value,
      kind,
      pageContext,
      onResolve: (ok) => {
        if (ok) {
          clearUI();
          revealPage();
          location.reload();
        } else {
          goBack();
        }
      }
    });
  }

  function anchorFrom(event) {
    const path = event.composedPath ? event.composedPath() : [];
    for (const node of path) {
      if (node?.tagName === "A" && node.getAttribute("href")) return node;
    }
    return null;
  }

  function installClickGuard() {
    document.addEventListener(
      "click",
      (e) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = anchorFrom(e);
        if (!a) return;

        let dest;
        try { dest = new URL(a.href, location.href); } catch { return; }
        if (!/^https?:$/.test(dest.protocol)) return;
        if (dest.href.split("#")[0] === location.href.split("#")[0]) return;
        if (approved.has(dest.href)) return;

        e.preventDefault();
        e.stopPropagation();

        const newTab = a.target === "_blank";
        const linkText = (a.innerText || a.textContent || "").trim().slice(0, 120);
        let hideChip = () => {};
        const timer = setTimeout(() => { hideChip = showChip(); }, 180);

        ask({
          type: "EVALUATE",
          kind: "link",
          value: dest.href,
          pageContext: { linkText, fromUrl: location.href }
        }).then((verdict) => {
          clearTimeout(timer);
          hideChip();

          if (verdict.decision === "allow") {
            approved.add(dest.href);
            if (newTab) window.open(dest.href, "_blank");
            else location.href = dest.href;
            return;
          }

          showPanel(verdict.decision, {
            reason: verdict.reason,
            target: dest.href,
            kind: "link",
            pageContext: { linkText, fromUrl: location.href },
            onResolve: (ok) => {
              clearUI();
              if (ok) {
                approved.add(dest.href);
                if (newTab) window.open(dest.href, "_blank");
                else location.href = dest.href;
              }
            }
          });
        });
      },
      true
    );
  }

  /* ---------- init ---------- */

  (async () => {
    settings = await ask({ type: "SETTINGS" });

    if (!settings || settings.enabled === false) {
      revealPage();
      return;
    }

    if (settings.dadActive) {
      revealPage();
      return; // parent browsing: no gate, no click guard
    }

    const u = new URL(location.href);
    const engine = detectSearch(u);

    if (engine) {
      if (enforceSafeSearch(engine, u)) return;
      await guardCurrentPage("search", engine.query, { engine: engine.name });
    } else if (settings.checkAllNavigations) {
      await guardCurrentPage("page", location.href, {});
    } else {
      revealPage();
    }

    installClickGuard();
  })();
})();
