/* Device-only credential storage.
 *
 * The alternative to syncing the ESPN cookies through Firestore: keep them in
 * this browser and send them with each request instead. Nothing is stored
 * server-side, at the cost of re-entering them on every device — which on iOS
 * is a real cost, because Safari gives you no way to read a cookie.
 */

const KEY = "sd.espnCreds.v1";

export const readDeviceCreds = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.espnS2 && parsed.swid ? { espnS2: parsed.espnS2, swid: parsed.swid } : null;
  } catch (e) {
    return null;
  }
};

export const writeDeviceCreds = (creds) => {
  try {
    if (creds) window.localStorage.setItem(KEY, JSON.stringify(creds));
    else window.localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
};

/* Never show a session cookie in full on a screen someone might be sharing. */
export const maskCred = (value) => {
  if (!value) return "not set";
  const s = String(value);
  if (s.length <= 12) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
};
