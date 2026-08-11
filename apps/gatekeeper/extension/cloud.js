/* Gatekeeper extension — cloud client.
 *
 * Loaded into the background service worker with importScripts(), so it runs
 * in the classic (non-module) worker scope and exposes a single global:
 * `Cloud`. It is the extension's only link to the parent's account.
 *
 * The extension is NOT a Firebase-auth client. Pairing exchanges a one-time
 * code (shown in the parent web app) for a per-device bearer token, stored in
 * chrome.storage.local. Every call carries that token. The server holds the
 * Anthropic key, so screening runs through /screen and the key never lives in
 * this browser.
 *
 * State (chrome.storage.local key "cloud"):
 *   { householdId, deviceId, deviceToken, kidName, projectContext,
 *     lastVerdictTs }
 */
const Cloud = (() => {
  const API_BASE = "https://us-central1-josh-cocciardi.cloudfunctions.net/gatekeeperApi";
  let state = null;

  async function load() {
    if (state) return state;
    const { cloud } = await chrome.storage.local.get("cloud");
    state = cloud || {};
    return state;
  }
  async function save(patch) {
    state = { ...(await load()), ...patch };
    await chrome.storage.local.set({ cloud: state });
    return state;
  }
  async function clear() {
    state = {};
    await chrome.storage.local.remove("cloud");
  }

  async function isPaired() {
    const s = await load();
    return !!(s.deviceToken);
  }

  function apiBase() { return (state && state.apiBase) || API_BASE; }

  async function req(path, { method = "GET", body, auth = true } = {}) {
    const s = await load();
    const headers = { "content-type": "application/json" };
    if (auth) headers["Authorization"] = "Bearer " + s.deviceToken;
    const res = await fetch(apiBase() + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.code = data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    load,
    isPaired,
    async state() { return await load(); },

    // Redeem a pairing code from the parent app.
    async pair(code, label) {
      const data = await req("/pair", {
        method: "POST", auth: false,
        body: { code: String(code).trim().toUpperCase(), label },
      });
      await save({
        householdId: data.householdId,
        deviceId: data.deviceId,
        deviceToken: data.deviceToken,
        kidName: data.kidName || "",
        projectContext: data.projectContext || "",
        lastVerdictTs: Date.now(),
      });
      return data;
    },

    async unpair() {
      try { await req("/unpair", { method: "POST" }); } catch {}
      await clear();
    },

    // Proxy a Claude call through the server-held key. Throws with
    // err.code === 'no_key' when the parent hasn't set one, so the caller can
    // fall back to a local key if it has one.
    async screen({ model, system, userText, maxTokens }) {
      const data = await req("/screen", {
        method: "POST",
        body: { model, system, userText, maxTokens },
      });
      return data.text;
    },

    // Fire-and-forget mirrors — never block the gate on the network.
    mirrorEvent(evt) {
      req("/event", { method: "POST", body: { event: evt } }).catch(() => {});
    },
    mirrorSession(session) {
      req("/session", { method: "POST", body: session }).catch(() => {});
    },

    // A request the parent must rule on. Returns { requestId }.
    async createRequest(payload) {
      return await req("/request", { method: "POST", body: payload });
    },

    // Poll for parent decisions since we last checked. Returns [] on failure.
    async pollVerdicts() {
      try {
        const s = await load();
        const since = s.lastVerdictTs || 0;
        const data = await req(`/verdicts?since=${since}`);
        if (data.newest && data.newest > since) await save({ lastVerdictTs: data.newest });
        return data.verdicts || [];
      } catch {
        return [];
      }
    },
  };
})();
