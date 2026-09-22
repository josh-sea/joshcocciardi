/* ------------------------------------------------------------------ */
/*  Family Meal Planner: pure helpers                                  */
/*                                                                     */
/*  No Firebase and no React in here, so test/meal-planner.test.mjs    */
/*  can import it straight into node.                                  */
/* ------------------------------------------------------------------ */

// The household, in the order every per-person row renders.
export const PEOPLE = [
  { key: "josh", name: "Josh" },
  { key: "ashley", name: "Ashley" },
  { key: "cam", name: "Cam" },
  { key: "bodhi", name: "Bodhi" },
];

export const RATINGS = ["up", "neutral", "down"];

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* ------------------------------ dates ------------------------------ */

// Dates are stored as local YYYY-MM-DD strings, never as timestamps. A plan
// for "Tuesday" is a calendar day in this house, and a UTC instant would
// drift to Monday evening for anyone reading it west of Greenwich.
const pad = (n) => String(n).padStart(2, "0");

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = (now = new Date()) => toKey(now);

export const addDays = (key, n) => {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
};

// Weeks run Monday through Sunday.
export const mondayOf = (key) => {
  const d = fromKey(key);
  const offset = (d.getDay() + 6) % 7; // Sunday is 6 days after Monday
  d.setDate(d.getDate() - offset);
  return toKey(d);
};

export const weekDays = (monday) => DAY_NAMES.map((name, i) => ({ name, key: addDays(monday, i) }));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const shortDate = (key) => {
  const d = fromKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

export const weekLabel = (monday) => `${shortDate(monday)} to ${shortDate(addDays(monday, 6))}`;

// "today", "yesterday", "3 days ago", "5 weeks ago". Inventory rows use this
// against their creation time; it is the seed of later staleness logic.
export const ageLabel = (then, now = new Date()) => {
  if (!then) return "";
  const days = Math.floor((fromKey(toKey(now)) - fromKey(toKey(then))) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

/* --------------------------- inventory ----------------------------- */

// Splits typed or dictated input on explicit delimiters only: commas,
// semicolons, and line breaks. No guessing at where one food ends and the
// next begins, so "mac and cheese" stays one item. Bullets and list numbers
// that come along with a pasted list are trimmed off, and repeats within one
// entry collapse to the first spelling.
export const splitItems = (text) => {
  const seen = new Set();
  const out = [];
  String(text || "")
    .split(/[,;\n\r]+/)
    .map((s) =>
      s
        .replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\.$/, "")
    )
    .filter(Boolean)
    .forEach((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s);
    });
  return out;
};

/* ------------------------------ picks ------------------------------ */

// A pick is what fills a slot on the plan: { kind, id, name }.
//   kind "recipe"    → id is a recipe doc id
//   kind "inventory" → id is an inventory doc id
//   kind "text"      → typed in, no id
// The name is copied onto the plan so a slot still reads correctly after the
// recipe is renamed or the inventory row is eaten and deleted.
export const makePick = (kind, id, name) => ({ kind, id: id || null, name: String(name || "").trim() });

export const isPick = (p) =>
  !!p && typeof p === "object" && ["recipe", "inventory", "text"].includes(p.kind) && !!p.name;

// Per-person breakfast and lunch slots have three states. Undecided is the
// absence of an entry; the other two are stored.
export const slotState = (entry) => {
  if (entry && entry.none === true) return "none";
  if (entry && isPick(entry.pick)) return "meal";
  return "undecided";
};

// How much of a day is settled, for the dots on the week strip. A slot
// counts as settled when it holds a meal or is marked as not needed.
export const dayProgress = (day) => {
  const d = day || {};
  let done = 0;
  let total = 0;
  ["breakfast", "lunch"].forEach((meal) => {
    PEOPLE.forEach((p) => {
      total += 1;
      if (slotState(d[meal]?.[p.key]) !== "undecided") done += 1;
    });
  });
  [0, 1].forEach((i) => {
    total += 1;
    if (isPick(d.snacks?.[i])) done += 1;
  });
  ["dinner", "dessert"].forEach((k) => {
    total += 1;
    if (isPick(d[k])) done += 1;
  });
  return { done, total };
};

/* ----------------------------- recipes ----------------------------- */

export const isLink = (s) => /^https?:\/\/\S+$/i.test(String(s || "").trim());

// Accepts "example.com/pesto" as well as the full URL, since that's what a
// phone share sheet sometimes hands over.
export const normalizeLink = (s) => {
  const t = String(s || "").trim();
  if (!t) return "";
  if (isLink(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return "";
};

export const sourceLabel = (link) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch (e) {
    return link;
  }
};

// Thumbs tally for a recipe card: how many of the four have weighed in, and
// the net of ups minus downs.
export const ratingSummary = (ratings) => {
  const r = ratings || {};
  let up = 0;
  let down = 0;
  let rated = 0;
  PEOPLE.forEach((p) => {
    if (!RATINGS.includes(r[p.key])) return;
    rated += 1;
    if (r[p.key] === "up") up += 1;
    if (r[p.key] === "down") down += 1;
  });
  return { up, down, rated };
};
