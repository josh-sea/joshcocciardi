const FN = "http://127.0.0.1:5001/josh-cocciardi/us-central1/espnFantasy";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const KEY = "fake-api-key";

// Mint a real emulator ID token so the callable's auth check is genuinely exercised.
const signUp = async (email) => {
  const r = await fetch(`${AUTH}/accounts:signUp?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("no token: " + JSON.stringify(j));
  return j.idToken;
};

const call = async (data, token) => {
  const r = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await r.json().catch(() => ({}));
  return { http: r.status, body };
};

let pass = 0, fail = 0;
const t = (label, cond, detail) => {
  if (cond) { console.log("  PASS", label); pass++; }
  else { console.log("  FAIL", label, "→", JSON.stringify(detail).slice(0, 220)); fail++; }
};

const token = await signUp(`fn${Date.now()}@example.com`);
const GOOD = { leagueId: 579622, season: 2026, views: ["mSettings"] };
const FAKE = { espnS2: "AEB" + "x".repeat(200), swid: "{11111111-2222-3333-4444-555555555555}" };

console.log("espnFantasy guards:");

let r = await call(GOOD, null);
t("rejects an unauthenticated caller", r.body?.error?.status === "UNAUTHENTICATED", r.body);

r = await call(GOOD, token);
t("rejects when no credentials are stored", String(r.body?.error?.message).includes("no_credentials"), r.body);

r = await call({ ...GOOD, views: ["mSettings", "evil_view"], creds: FAKE }, token);
t("rejects a view outside the allowlist", String(r.body?.error?.message).includes("not allowed"), r.body);

r = await call({ ...GOOD, leagueId: "579622/../../evil", creds: FAKE }, token);
t("rejects a non-numeric leagueId (no path traversal)", r.body?.error?.status === "INVALID_ARGUMENT", r.body);

r = await call({ ...GOOD, leagueId: "https://evil.example.com", creds: FAKE }, token);
t("rejects a URL as leagueId (no SSRF)", r.body?.error?.status === "INVALID_ARGUMENT", r.body);

r = await call({ ...GOOD, season: 1999, creds: FAKE }, token);
t("rejects an out-of-range season", r.body?.error?.status === "INVALID_ARGUMENT", r.body);

r = await call({ ...GOOD, views: [], creds: FAKE }, token);
t("rejects an empty view list", r.body?.error?.status === "INVALID_ARGUMENT", r.body);

r = await call({ ...GOOD, creds: FAKE, filter: { players: { note: "x".repeat(5000) } } }, token);
t("rejects an oversized filter", String(r.body?.error?.message).includes("too large"), r.body);

console.log("\nreal ESPN round trip:");
r = await call({ ...GOOD, creds: FAKE }, token);
t("bad cookies reach ESPN and come back as espn_auth_failed",
  String(r.body?.error?.message).includes("espn_auth_failed"), r.body);

r = await call({ leagueId: 999999999, season: 2026, views: ["mSettings"], creds: FAKE }, token);
t("a nonexistent league maps to league_not_found",
  String(r.body?.error?.message).includes("league_not_found"), r.body);

console.log("\nleak check:");
const leaked = JSON.stringify(r.body).includes(FAKE.espnS2.slice(0, 40));
t("no cookie value echoed back in any error", !leaked, r.body);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
