/* ------------------------------------------------------------------ */
/*  Family Meal Planner: JSON import and export                        */
/*                                                                     */
/*  The format is built to be pasted into a chat with Claude and back: */
/*  everything is by name rather than by id, dates are YYYY-MM-DD, and */
/*  the export carries a one-paragraph note on how to edit it.         */
/*                                                                     */
/*  Import is planned here and applied in store.js: planImport() turns */
/*  pasted JSON into a list of writes plus a summary to preview, with  */
/*  no Firebase in sight, so test/meal-planner.test.mjs covers it.     */
/* ------------------------------------------------------------------ */

import {
  RATINGS,
  SECTION_KINDS,
  addDays,
  findByName,
  fromKey,
  itemState,
  mondayOf,
  normalizeLink,
  readDay,
  recipeUses,
  slotState,
  toKey,
  weekDays,
  writeSlot,
} from "./plan.js";

export const FORMAT = "meal-planner/v1";

// The parts of a kitchen that travel, in the order they're shown.
export const PARTS = [
  { key: "plan", label: "Plan (one week)" },
  { key: "recipes", label: "Recipes" },
  { key: "inventory", label: "Inventory" },
  { key: "shopping", label: "Shopping list" },
];

export const HOW_TO =
  "Family Meal Planner data. Edit it and paste it back on the Data page to apply. Only the sections included (plan, recipes, inventory, shopping) are changed, and everything is matched by name, case-insensitively. " +
  "plan.days: one object per date (YYYY-MM-DD); each meal (breakfast, lunch, snack, dinner, dessert) is an object keyed by a person's name, or by \"everyone\" for a shared meal. " +
  "A slot is a list of item names (a name matching a recipe or inventory item links to it; anything else is typed in), \"skip\" for not needed, or { \"items\": [...], \"eaten\": true }. Leave a slot out for undecided. mods holds notes for shared meals. " +
  "recipes: name, source (link or empty), ingredients (text), usesInventory (inventory names), made, lastMade (date or null), ratings ({ person: \"up\" | \"neutral\" | \"down\" }). " +
  "inventory: what's in the house: name, added (date), used (date it ran out, or null). " +
  "shopping: the list: name, amount (how much to buy, optional), inCart.";

const isDateKey = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(fromKey(s).getTime());
const dateOrNull = (d) => (d instanceof Date && !isNaN(d.getTime()) ? toKey(d) : null);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const lower = (s) => str(s).toLowerCase();

/* ------------------------------ export ------------------------------ */

// A plan item as text, unless that would read back as something else (a
// typed-in "Tacos" in a kitchen that also has a Tacos recipe), in which case
// it says what it is.
const exportPick = (p, recipes, inventory) => {
  const asRecipe = findByName(recipes, p.name);
  const asItem = findByName(inventory, p.name);
  if (p.kind === "recipe") return p.name;
  if (p.kind === "inventory") return asRecipe ? { inventory: p.name } : p.name;
  return asRecipe || asItem ? { text: p.name } : p.name;
};

const exportSlot = (slot, recipes, inventory) => {
  const state = slotState(slot);
  if (state === "none") return "skip";
  if (state === "undecided") return undefined;
  const items = slot.items.map((p) => exportPick(p, recipes, inventory));
  return slot.eaten ? { items, eaten: true } : items;
};

const exportDay = (raw, key, dayName, config, recipes, inventory) => {
  const d = readDay(raw, config);
  const out = { date: key, day: dayName };
  const mods = {};
  config.sections.forEach((sec) => {
    const meal = {};
    if (sec.mode === "all") {
      const v = exportSlot(d[sec.key].shared, recipes, inventory);
      if (v !== undefined) meal.everyone = v;
      if (d.mods[sec.key]) mods[sec.key] = d.mods[sec.key];
    } else {
      sec.people.forEach((p) => {
        const v = exportSlot(d[sec.key].byPerson[p.key], recipes, inventory);
        if (v !== undefined) meal[p.name] = v;
      });
    }
    if (Object.keys(meal).length) out[sec.key] = meal;
  });
  if (Object.keys(mods).length) out.mods = mods;
  return out;
};

// The kitchen as JSON. `parts` picks the sections; `days` is the chosen
// week's day docs keyed by date, starting at `weekStart` (a Monday).
export const exportData = ({ parts, kitchenName, config, recipes, inventory, days, weekStart, today }) => {
  const nameOf = Object.fromEntries(config.people.map((p) => [p.key, p.name]));
  const out = {
    format: FORMAT,
    howTo: HOW_TO,
    kitchen: kitchenName,
    exported: today,
    people: config.active.map((p) => p.name),
  };
  if (parts.includes("plan")) {
    out.plan = {
      weekStart,
      days: weekDays(weekStart).map((d) => exportDay(days[d.key], d.key, d.name, config, recipes, inventory)),
    };
  }
  if (parts.includes("recipes")) {
    out.recipes = [...recipes]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((r) => {
        const ratings = {};
        Object.entries(r.ratings || {}).forEach(([key, val]) => {
          if (nameOf[key] && RATINGS.includes(val)) ratings[nameOf[key]] = val;
        });
        return {
          name: r.name,
          source: r.link || "",
          ingredients: r.ingredients || "",
          usesInventory: recipeUses(r).map((u) => u.name),
          made: !!r.made,
          lastMade: r.lastMade || null,
          ratings,
        };
      });
  }
  if (parts.includes("inventory")) {
    out.inventory = inventory
      .filter((i) => itemState(i) !== "wanted")
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((i) => ({ name: i.name, added: dateOrNull(i.addedAt), used: dateOrNull(i.usedAt) }));
  }
  if (parts.includes("shopping")) {
    out.shopping = inventory
      .filter((i) => i.onList)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((i) => ({ name: i.name, amount: i.amount || "", inCart: !!i.inCart }));
  }
  return out;
};

/* ------------------------------ parsing ----------------------------- */

// Accepts the JSON as pasted, including when it arrives wrapped in a
// ```json fence or with a sentence of chat around it, which is how it
// usually comes back from Claude.
export const parseImport = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "Paste some JSON first." };
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : raw;
  if (!fenced) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) body = body.slice(start, end + 1);
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    return { ok: false, error: `That isn't valid JSON: ${e.message}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Expected a JSON object with plan, recipes, inventory, or shopping." };
  }
  const found = PARTS.map((p) => p.key).filter((k) => k in data);
  if (!found.length) return { ok: false, error: "Nothing to import: no plan, recipes, inventory, or shopping section." };
  for (const k of ["recipes", "inventory", "shopping"]) {
    if (k in data && !Array.isArray(data[k])) return { ok: false, error: `"${k}" should be a list.` };
  }
  if ("plan" in data && !Array.isArray(data.plan?.days)) return { ok: false, error: '"plan" should have a "days" list.' };
  return { ok: true, data, parts: found };
};

/* ------------------------------ planning ---------------------------- */

const SECTION_ALIASES = { snacks: "snack", breakfasts: "breakfast", lunches: "lunch", dinners: "dinner", desserts: "dessert" };
const EVERYONE = new Set(["everyone", "all", "shared", "family"]);
const SKIP = new Set(["skip", "skipped", "none", "not needed", "no", "n/a"]);
const UNDECIDED = new Set(["", "undecided", "tbd", "?"]);

// Turns parsed import data into the writes that make the kitchen match it.
//   mode "merge"    add and update; nothing is removed
//   mode "replace"  also remove what isn't in an included section
// Returns { ops, summary, warnings }. Each op is
//   { op: "set" | "update" | "delete", col, id, data }
// where a new document's id is a placeholder "new:N", and any "new:N"
// string inside another op's data refers to that document.
//
// `currentDays` (day docs keyed by date) and `currentWeek` (its Monday) are
// the week already loaded on screen, if any: days in that week that would
// come out the same are skipped, so re-importing an untouched export reports
// no change.
export const planImport = (
  data,
  { mode = "merge", config, recipes, inventory, uid, today, now = new Date(), currentDays = null, currentWeek = null }
) => {
  const replace = mode === "replace";
  const warnings = [];
  const summary = {};
  const ops = [];
  let seq = 0;
  const newId = () => `new:${++seq}`;
  const parseDate = (v, label) => {
    if (v === null || v === undefined || v === false || v === "") return null;
    if (v === true) return fromKey(today);
    if (isDateKey(v)) return fromKey(v);
    warnings.push(`${label}: "${v}" isn't a YYYY-MM-DD date, so it was ignored.`);
    return undefined;
  };

  // Working copy of the inventory: every row, its fields as they'll end up,
  // and what changed.
  const items = inventory.map((i) => ({
    id: i.id,
    name: i.name,
    addedAt: i.addedAt || null,
    usedAt: i.usedAt || null,
    onList: !!i.onList,
    inCart: !!i.inCart,
    amount: i.amount || "",
    isNew: false,
    deleted: false,
    changed: new Set(),
  }));
  const live = () => items.filter((i) => !i.deleted);
  const findItem = (name) => findByName(live(), name);
  const setField = (item, field, value) => {
    const same =
      value instanceof Date || item[field] instanceof Date
        ? dateOrNull(value) === dateOrNull(item[field])
        : value === item[field];
    if (same) return;
    item[field] = value;
    item.changed.add(field);
  };
  const newItem = (name) => {
    const item = {
      id: newId(),
      name,
      addedAt: null,
      usedAt: null,
      onList: false,
      inCart: false,
      amount: "",
      isNew: true,
      deleted: false,
      changed: new Set(),
    };
    items.push(item);
    return item;
  };

  /* inventory: what's in the house */
  if (Array.isArray(data.inventory)) {
    const seen = new Set();
    let added = 0;
    data.inventory.forEach((entry, n) => {
      const e = typeof entry === "string" ? { name: entry } : entry || {};
      const name = str(e.name);
      if (!name) return warnings.push(`inventory #${n + 1} has no name, so it was skipped.`);
      let item = findItem(name);
      if (!item) {
        item = newItem(name);
        added += 1;
      }
      seen.add(item.id);
      const addedAt = "added" in e ? parseDate(e.added, `${name} added`) : undefined;
      if (addedAt) setField(item, "addedAt", addedAt);
      else if (!item.addedAt) setField(item, "addedAt", fromKey(today));
      if ("used" in e) {
        const usedAt = parseDate(e.used, `${name} used`);
        if (usedAt !== undefined) setField(item, "usedAt", usedAt);
      }
    });
    let removed = 0;
    if (replace) {
      live()
        .filter((i) => !seen.has(i.id) && i.addedAt && !i.isNew)
        .forEach((i) => {
          i.dropFromStock = true;
          removed += 1;
        });
    }
    summary.inventory = { added, updated: 0, removed };
    summary.inventory._seen = seen;
  }

  /* shopping: the list */
  const listAdded = new Set();
  if (Array.isArray(data.shopping)) {
    const seen = new Set();
    let added = 0;
    data.shopping.forEach((entry, n) => {
      const e = typeof entry === "string" ? { name: entry } : entry || {};
      const name = str(e.name);
      if (!name) return warnings.push(`shopping #${n + 1} has no name, so it was skipped.`);
      const item = findItem(name) || newItem(name);
      if (!item.onList) {
        added += 1;
        listAdded.add(item.id);
      }
      seen.add(item.id);
      setField(item, "onList", true);
      if ("amount" in e) setField(item, "amount", str(e.amount));
      if ("inCart" in e) setField(item, "inCart", e.inCart === true);
    });
    let removed = 0;
    if (replace) {
      live()
        .filter((i) => i.onList && !seen.has(i.id))
        .forEach((i) => {
          setField(i, "onList", false);
          setField(i, "inCart", false);
          setField(i, "amount", "");
          removed += 1;
        });
    }
    summary.shopping = { added, updated: 0, removed };
  }

  // Inventory rows left out under replace: gone, unless they're still on
  // the shopping list, in which case they stay as list-only items.
  items
    .filter((i) => i.dropFromStock)
    .forEach((i) => {
      if (i.onList) {
        setField(i, "addedAt", null);
        setField(i, "usedAt", null);
      } else {
        i.deleted = true;
      }
    });
  // A list-only row that's no longer on the list has nothing left to be.
  items
    .filter((i) => !i.deleted && !i.addedAt && !i.onList && !i.isNew && i.changed.has("onList"))
    .forEach((i) => (i.deleted = true));
  items.filter((i) => i.isNew && !i.addedAt && !i.onList).forEach((i) => (i.deleted = true));

  /* recipes */
  const book = recipes.map((r) => ({ ...r, isNew: false, deleted: false, patch: {} }));
  const liveRecipes = () => book.filter((r) => !r.deleted);
  const personKey = (name) => {
    const n = lower(name);
    const p = config.people.find((x) => lower(x.name) === n);
    return p ? p.key : null;
  };
  if (Array.isArray(data.recipes)) {
    const seen = new Set();
    let added = 0;
    data.recipes.forEach((entry, n) => {
      const e = typeof entry === "string" ? { name: entry } : entry || {};
      const name = str(e.name);
      if (!name) return warnings.push(`recipes #${n + 1} has no name, so it was skipped.`);
      let r = findByName(liveRecipes(), name);
      if (!r) {
        r = {
          id: newId(),
          name,
          link: "",
          ingredients: "",
          uses: [],
          made: false,
          lastMade: null,
          ratings: {},
          isNew: true,
          deleted: false,
          patch: {},
        };
        book.push(r);
        added += 1;
      }
      seen.add(r.id);
      const put = (field, value, same) => {
        if (same) return;
        r[field] = value;
        r.patch[field] = value;
      };
      if (name !== r.name && !r.isNew) put("name", name, false);
      if ("source" in e) {
        const link = normalizeLink(e.source);
        if (str(e.source) && !link) warnings.push(`${name}: "${e.source}" isn't a web link, so the source was left as is.`);
        else put("link", link, link === (r.link || ""));
      }
      if ("ingredients" in e) {
        const text = Array.isArray(e.ingredients) ? e.ingredients.map(str).filter(Boolean).join("\n") : str(e.ingredients);
        put("ingredients", text, text === (r.ingredients || ""));
      }
      if ("usesInventory" in e && Array.isArray(e.usesInventory)) {
        const uses = [];
        e.usesInventory.forEach((u) => {
          const item = findItem(str(u));
          if (!item || !item.addedAt) {
            warnings.push(`${name}: "${u}" isn't in inventory, so it wasn't linked.`);
          } else if (!uses.some((x) => x.id === item.id)) {
            uses.push({ id: item.id, name: item.name });
          }
        });
        put("uses", uses, JSON.stringify(uses) === JSON.stringify(recipeUses(r)));
      }
      if ("made" in e) put("made", e.made === true, (e.made === true) === !!r.made);
      if ("lastMade" in e) {
        const d = parseDate(e.lastMade, `${name} lastMade`);
        if (d !== undefined) {
          const key = d ? toKey(d) : null;
          put("lastMade", key, key === (r.lastMade || null));
        }
      }
      if (e.ratings && typeof e.ratings === "object") {
        Object.entries(e.ratings).forEach(([who, val]) => {
          const key = personKey(who);
          if (!key) return warnings.push(`${name}: nobody called "${who}" in this kitchen, so that rating was skipped.`);
          const v = val === null || val === "" ? null : lower(val);
          if (v !== null && !RATINGS.includes(v)) {
            return warnings.push(`${name}: rating "${val}" should be up, neutral, or down.`);
          }
          if ((r.ratings?.[key] || null) === v) return;
          r.ratings = { ...(r.ratings || {}), [key]: v };
          r.patch[`ratings.${key}`] = v;
        });
      }
    });
    let removed = 0;
    if (replace) {
      liveRecipes()
        .filter((r) => !seen.has(r.id) && !r.isNew)
        .forEach((r) => {
          r.deleted = true;
          removed += 1;
        });
    }
    summary.recipes = { added, updated: 0, removed };
  }

  /* plan */
  if (data.plan && Array.isArray(data.plan.days)) {
    const resolve = (v) => {
      if (v && typeof v === "object") {
        if (str(v.recipe)) {
          const r = findByName(liveRecipes(), v.recipe);
          if (r) return { kind: "recipe", id: r.id, name: r.name };
          warnings.push(`"${v.recipe}" isn't a recipe, so it was added as typed in.`);
          return { kind: "text", id: null, name: str(v.recipe) };
        }
        if (str(v.inventory)) {
          const i = findItem(v.inventory);
          if (i && i.addedAt) return { kind: "inventory", id: i.id, name: i.name };
          warnings.push(`"${v.inventory}" isn't in inventory, so it was added as typed in.`);
          return { kind: "text", id: null, name: str(v.inventory) };
        }
        if (str(v.text)) return { kind: "text", id: null, name: str(v.text) };
        return null;
      }
      const name = str(v);
      if (!name) return null;
      const r = findByName(liveRecipes(), name);
      if (r) return { kind: "recipe", id: r.id, name: r.name };
      const i = findItem(name);
      if (i && i.addedAt) return { kind: "inventory", id: i.id, name: i.name };
      return { kind: "text", id: null, name };
    };
    const parseSlot = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "string") {
        const t = lower(v);
        if (SKIP.has(t)) return { none: true };
        if (UNDECIDED.has(t)) return null;
        return { items: [resolve(v)].filter(Boolean) };
      }
      if (Array.isArray(v)) return { items: v.map(resolve).filter(Boolean) };
      if (typeof v === "object") {
        if (v.skip === true || v.none === true) return { none: true };
        if ("items" in v) {
          const list = Array.isArray(v.items) ? v.items : [v.items];
          return { items: list.map(resolve).filter(Boolean), eaten: v.eaten === true };
        }
        const one = resolve(v);
        return one ? { items: [one] } : null;
      }
      return null;
    };
    const looksLikeSlot = (v) =>
      typeof v === "string" ||
      Array.isArray(v) ||
      (v && typeof v === "object" && ("items" in v || "recipe" in v || "inventory" in v || "text" in v || "skip" in v));

    const dates = [];
    let unchanged = 0;
    const known = (date) => currentDays && currentWeek && mondayOf(date) === currentWeek;
    // Same meaning, compared the way it's exported: by name, per person.
    const sameDay = (date, doc) =>
      JSON.stringify(exportDay(currentDays[date], date, "", config, recipes, inventory)) ===
      JSON.stringify(exportDay(doc, date, "", config, liveRecipes(), live()));
    data.plan.days.forEach((day, n) => {
      if (!day || !isDateKey(day.date)) return warnings.push(`plan day #${n + 1} has no valid date, so it was skipped.`);
      const doc = { date: day.date, updatedAt: now };
      Object.entries(day).forEach(([field, value]) => {
        if (["date", "day", "mods"].includes(field)) return;
        const key = SECTION_ALIASES[lower(field)] || lower(field);
        const sec = config.sections.find((s) => s.key === key);
        if (!sec || !SECTION_KINDS.some((k) => k.key === key)) {
          return warnings.push(`${day.date}: "${field}" isn't a meal, so it was skipped.`);
        }
        const entries = looksLikeSlot(value) ? [["everyone", value]] : Object.entries(value || {});
        const meal = {};
        entries.forEach(([who, v]) => {
          const slot = parseSlot(v);
          const stored = slot ? writeSlot(slot) : null;
          if (EVERYONE.has(lower(who))) {
            if (sec.mode === "each") {
              warnings.push(`${day.date}: ${sec.label} is per person in this kitchen, so its "everyone" entry is saved but hidden until ${sec.label} is switched to Everyone in settings.`);
            }
            if (stored) meal.all = stored;
            return;
          }
          const key2 = personKey(who);
          if (!key2) return warnings.push(`${day.date}: nobody called "${who}" in this kitchen, so their ${sec.label.toLowerCase()} was skipped.`);
          if (sec.mode === "all") {
            warnings.push(`${day.date}: ${sec.label} is shared in this kitchen, so ${who}'s entry is saved but hidden until ${sec.label} is switched to Per person in settings.`);
          }
          if (stored) meal[key2] = stored;
        });
        if (Object.keys(meal).length) doc[key] = meal;
      });
      if (day.mods && typeof day.mods === "object") {
        const mods = {};
        Object.entries(day.mods).forEach(([field, text]) => {
          const key = SECTION_ALIASES[lower(field)] || lower(field);
          if (str(text) && SECTION_KINDS.some((k) => k.key === key)) mods[key] = str(text);
        });
        if (Object.keys(mods).length) doc.mods = mods;
      }
      dates.push(day.date);
      if (known(day.date) && sameDay(day.date, doc)) {
        unchanged += 1;
        return;
      }
      ops.push({ op: "set", col: "days", id: day.date, data: doc });
    });
    let cleared = 0;
    if (replace && dates.length) {
      const weeks = [...new Set(dates.map(mondayOf))];
      weeks.forEach((monday) => {
        for (let i = 0; i < 7; i += 1) {
          const key = addDays(monday, i);
          if (dates.includes(key)) continue;
          // Known to be empty already: nothing to clear.
          if (known(key) && !currentDays[key]) continue;
          ops.push({ op: "delete", col: "days", id: key });
          cleared += 1;
        }
      });
    }
    summary.plan = { days: dates.length - unchanged, cleared };
  }

  /* writes for inventory rows */
  items.forEach((i) => {
    if (i.deleted) {
      if (!i.isNew) ops.push({ op: "delete", col: "inventory", id: i.id });
      return;
    }
    if (i.isNew) {
      ops.push({
        op: "set",
        col: "inventory",
        id: i.id,
        data: {
          name: i.name,
          addedAt: i.addedAt,
          usedAt: i.usedAt,
          onList: i.onList,
          inCart: i.inCart,
          amount: i.amount || null,
          createdAt: now,
          createdBy: uid,
        },
      });
      return;
    }
    if (!i.changed.size) return;
    const patch = {};
    i.changed.forEach((f) => {
      patch[f] = f === "amount" ? i.amount || null : i[f];
    });
    ops.push({ op: "update", col: "inventory", id: i.id, data: patch });
    const stockFields = ["addedAt", "usedAt"].some((f) => i.changed.has(f));
    const listFields = ["onList", "inCart", "amount"].some((f) => i.changed.has(f));
    if (stockFields && summary.inventory && summary.inventory._seen.has(i.id)) summary.inventory.updated += 1;
    if (listFields && summary.shopping && i.onList && !listAdded.has(i.id)) summary.shopping.updated += 1;
  });
  if (summary.inventory) {
    delete summary.inventory._seen;
  }

  /* writes for recipes */
  book.forEach((r) => {
    if (r.deleted) {
      if (!r.isNew) ops.push({ op: "delete", col: "recipes", id: r.id });
      return;
    }
    if (r.isNew) {
      ops.push({
        op: "set",
        col: "recipes",
        id: r.id,
        data: {
          name: r.name,
          link: r.link || "",
          ingredients: r.ingredients || "",
          uses: r.uses || [],
          made: !!r.made,
          lastMade: r.lastMade || null,
          ratings: Object.fromEntries(Object.entries(r.ratings || {}).filter(([, v]) => v)),
          createdBy: uid,
          createdAt: now,
          updatedAt: now,
        },
      });
      return;
    }
    if (!Object.keys(r.patch).length) return;
    ops.push({ op: "update", col: "recipes", id: r.id, data: { ...r.patch, updatedAt: now } });
    if (summary.recipes) summary.recipes.updated += 1;
  });

  return { ops, summary, warnings };
};

// One line per section for the preview, e.g. "Recipes: 2 new, 1 updated".
export const describeSummary = (summary) => {
  const lines = [];
  const counts = (s) =>
    [
      s.added && `${s.added} new`,
      s.updated && `${s.updated} updated`,
      s.removed && `${s.removed} removed`,
    ].filter(Boolean).join(", ") || "no changes";
  if (summary.plan) {
    lines.push(
      summary.plan.days || summary.plan.cleared
        ? `Plan: ${summary.plan.days} day${summary.plan.days === 1 ? "" : "s"} changed${summary.plan.cleared ? `, ${summary.plan.cleared} cleared` : ""}`
        : "Plan: no changes"
    );
  }
  if (summary.recipes) lines.push(`Recipes: ${counts(summary.recipes)}`);
  if (summary.inventory) lines.push(`Inventory: ${counts(summary.inventory)}`);
  if (summary.shopping) lines.push(`Shopping list: ${counts(summary.shopping)}`);
  return lines;
};
