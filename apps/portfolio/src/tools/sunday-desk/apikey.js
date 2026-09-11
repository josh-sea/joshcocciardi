/* The Anthropic key, on this device only.
 *
 * Deliberately never written to Firestore. A fantasy cookie in a database is a
 * nuisance if it leaks; a billable API key is somebody's money, and this site
 * has no business being custodian of it. The cost of that choice is real and
 * should be said plainly in the UI: a phone needs its own key entered, because
 * there is nothing to sync.
 */

const KEY = "sd.anthropicKey.v1";

export const readKey = () => {
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch (e) {
    return null;
  }
};

export const writeKey = (value) => {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
};

/* Anthropic keys start sk-ant-. Checking the shape here turns a confusing 401
   several seconds later into an immediate, obvious message. */
export const looksLikeKey = (v) => typeof v === "string" && /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v.trim());

export const maskKey = (v) => {
  if (!v) return "not set";
  const s = String(v);
  return `${s.slice(0, 11)}…${s.slice(-4)}`;
};
