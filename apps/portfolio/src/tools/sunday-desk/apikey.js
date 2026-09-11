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
    return cleanKey(window.localStorage.getItem(KEY)) || null;
  } catch (e) {
    return null;
  }
};

export const writeKey = (value) => {
  try {
    const v = cleanKey(value);
    if (v) window.localStorage.setItem(KEY, v);
    else window.localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
};

/* Copying a key out of a web page brings passengers: ordinary whitespace, the
   non-breaking spaces some pages use for layout, and zero-width characters
   that are completely invisible in a password input. Strip them everywhere in
   the string, not just at the ends — a single one in the middle is enough to
   make a header invalid and a key look wrong. */
const INVISIBLE = /[\s\u00A0\u200B-\u200D\u2060\uFEFF]/g;

export const cleanKey = (v) => (typeof v === "string" ? v.replace(INVISIBLE, "") : "");

/* What this checks, and deliberately does not.
 *
 * It asserts the `sk-ant-` prefix, which is documented and stable, and a
 * plausible length. It does NOT police which characters the rest of the key
 * may contain. An earlier version did, with a guessed character class, and it
 * rejected a real key — locking someone out of their own tool with no way
 * past the check. A local regex cannot know more about a key than the server
 * that issued it, so anything with the right prefix is allowed through and
 * Anthropic's 401 is the authority on whether it actually works. */
export const looksLikeKey = (v) => /^sk-ant-.{16,}$/.test(cleanKey(v));

export const maskKey = (v) => {
  if (!v) return "not set";
  const s = String(v);
  return `${s.slice(0, 11)}…${s.slice(-4)}`;
};
