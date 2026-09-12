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

/* Non-secret facts about whatever is sitting in the input box. On a phone the
   field is a row of identical dots, so when a key is refused there is no way
   to tell a paste that never landed from autofill getting there first from
   something invisible riding along. Length, the leading characters and the
   count of stripped characters separate those cases, and none of them give
   away the key itself. */
export const describeKey = (v) => {
  const raw = typeof v === "string" ? v : "";
  const clean = cleanKey(raw);
  return { length: clean.length, prefix: clean.slice(0, 7), stripped: raw.length - clean.length };
};

/* What this checks, and deliberately does not.
 *
 * This is a HINT, not a gate. Nothing in the UI may refuse to save a key
 * because this returned false.
 *
 * Two earlier versions of this function each blocked saving on a guess about
 * the key format — first a character class for the body, then the prefix —
 * and each one rejected a real key with no way past it. A check that runs
 * here cannot know more about a key than the server that issued it, so it has
 * no business having a veto. Anthropic's 401 is the authority; this only
 * decides whether to show a gentle "that looks unusual" note. */
export const looksLikeKey = (v) => /^sk-ant-.{16,}$/.test(cleanKey(v));

export const maskKey = (v) => {
  if (!v) return "not set";
  const s = String(v);
  return `${s.slice(0, 11)}…${s.slice(-4)}`;
};
