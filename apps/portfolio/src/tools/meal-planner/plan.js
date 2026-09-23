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

// A pick is one thing in a slot on the plan: { kind, id, name }.
//   kind "recipe"    → id is a recipe doc id
//   kind "inventory" → id is an inventory doc id
//   kind "text"      → typed in, no id
// The name is copied onto the plan so a slot still reads correctly after the
// recipe is renamed or the inventory row is eaten and deleted.
export const makePick = (kind, id, name) => ({ kind, id: id || null, name: String(name || "").trim() });

export const isPick = (p) =>
  !!p && typeof p === "object" && ["recipe", "inventory", "text"].includes(p.kind) && !!p.name;

export const cleanPick = (p) => (isPick(p) ? { kind: p.kind, id: p.id || null, name: p.name } : null);

export const samePick = (a, b) =>
  !!a && !!b && a.kind === b.kind && (a.kind === "text" ? a.name.toLowerCase() === b.name.toLowerCase() : a.id === b.id);

/* ------------------------------ slots ------------------------------ */

// The plan's sections, in order. Breakfast, lunch, and snacks are one slot
// per person; dinner and dessert are one shared slot. `sources` says what a
// slot can hold, and `text` whether anything typed in is fine too.
export const SECTIONS = [
  { key: "breakfast", label: "Breakfast", perPerson: true, sources: ["recipe", "inventory"], text: true },
  { key: "lunch", label: "Lunch", perPerson: true, sources: ["recipe", "inventory"], text: true },
  { key: "snack", label: "Snacks", perPerson: true, sources: ["inventory"], text: false },
  { key: "dinner", label: "Dinner", perPerson: false, sources: ["recipe", "inventory"], text: false },
  { key: "dessert", label: "Dessert", perPerson: false, sources: ["recipe", "inventory"], text: false },
];

// A slot holds a list of picks, so a lunch can be goldfish and a meat stick
// and a dinner can be pizza and sausage. Stored as
//   { items: [pick, ...], eaten?: true }   something planned
//   { none: true }                          not needed
//   (absent)                                undecided
// Days saved before lists existed stored a single pick, either bare
// (dinner, dessert) or as { pick } (breakfast, lunch); both read as a
// one-item list.
export const readSlot = (v) => {
  const raw = v && typeof v === "object" ? v : {};
  let items = [];
  if (Array.isArray(raw.items)) items = raw.items.filter(isPick);
  else if (isPick(raw.pick)) items = [raw.pick];
  else if (isPick(raw)) items = [raw];
  const eaten = raw.eaten === true || raw.pick?.eaten === true;
  return { items, none: raw.none === true && !items.length, eaten: eaten && items.length > 0 };
};

export const slotState = (v) => {
  const s = v && Array.isArray(v.items) && "none" in v ? v : readSlot(v);
  if (s.none) return "none";
  return s.items.length ? "meal" : "undecided";
};

// The stored shape for a slot, or null for undecided (which deletes it).
export const writeSlot = ({ items = [], none = false, eaten = false }) => {
  const clean = items.map(cleanPick).filter(Boolean);
  if (clean.length) return { items: clean, ...(eaten ? { eaten: true } : {}) };
  return none ? { none: true } : null;
};

// Snacks used to be two shared slots in a `snacks` array. In practice the
// first was Cam's and the second Bodhi's, so that's where they land. Once a
// day's snacks are saved per person the old array is deleted, so this only
// ever reads days nobody has touched since.
const LEGACY_SNACK_OWNERS = ["cam", "bodhi"];

// A whole day, normalized: every section and person present, legacy shapes
// folded in.
export const readDay = (day) => {
  const d = day || {};
  const out = { dinnerMod: typeof d.dinnerMod === "string" ? d.dinnerMod : "" };
  SECTIONS.forEach((sec) => {
    if (!sec.perPerson) {
      out[sec.key] = readSlot(d[sec.key]);
      return;
    }
    out[sec.key] = {};
    PEOPLE.forEach((p) => {
      out[sec.key][p.key] = readSlot(d[sec.key]?.[p.key]);
    });
  });
  if (!d.snack && Array.isArray(d.snacks)) {
    LEGACY_SNACK_OWNERS.forEach((who, i) => {
      if (isPick(d.snacks[i])) out.snack[who] = readSlot(d.snacks[i]);
    });
  }
  return out;
};

// How much of a day is settled, for the counts on the week strip. A slot
// counts once it holds something or is marked not needed.
export const dayProgress = (day) => {
  const d = readDay(day);
  let done = 0;
  let total = 0;
  SECTIONS.forEach((sec) => {
    const slots = sec.perPerson ? PEOPLE.map((p) => d[sec.key][p.key]) : [d[sec.key]];
    slots.forEach((s) => {
      total += 1;
      if (slotState(s) !== "undecided") done += 1;
    });
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

// The later of two YYYY-MM-DD keys. Marking an old day as eaten shouldn't
// pull a recipe's last made date backwards.
export const laterKey = (a, b) => (!a ? b || null : !b ? a : a > b ? a : b);

/* ------------------------ inventory lifecycle ---------------------- */

// Every item keeps one row for good, and its state comes from three fields:
//   addedAt  when it last came into the house (null: never bought yet)
//   usedAt   when it ran out (null while there's some left)
//   onList   whether it's on the shopping list
// So "stock" is bought and not used up, "used" is struck through and waiting
// to be rebought or removed, and "wanted" is a list-only item nobody has
// bought yet. Buying something brings its row back to "stock" with a new
// date instead of adding a second row.
export const itemState = (item) => {
  if (!item || !item.addedAt) return "wanted";
  return item.usedAt ? "used" : "stock";
};

export const inStock = (item) => itemState(item) === "stock";

const nameKey = (s) => String(s || "").trim().toLowerCase();

export const findByName = (items, name) => (items || []).find((i) => nameKey(i.name) === nameKey(name)) || null;

// Pairs each incoming name with its existing row, if any, so adding "Milk"
// when a used-up "milk" row exists revives that row rather than duplicating it.
export const matchNames = (names, items) => names.map((name) => ({ name, existing: findByName(items, name) }));

const time = (d) => (d instanceof Date ? d.getTime() : 0);

// Inventory table order. Name sorts A to Z (or Z to A); added sorts newest
// first (or oldest first), with names breaking ties.
export const sortItems = (items, key = "name", dir = "asc") => {
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const out = [...(items || [])];
  if (key === "added") {
    out.sort((a, b) => time(b.addedAt) - time(a.addedAt) || byName(a, b));
  } else {
    out.sort(byName);
  }
  return dir === "desc" ? out.reverse() : out;
};
