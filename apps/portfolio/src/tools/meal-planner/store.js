/* ------------------------------------------------------------------ */
/*  Family Meal Planner: Firestore persistence                         */
/*                                                                     */
/*  mealplan_households/{hid}                                          */
/*    name, ownerUid, memberEmails[], people[{key, name, active}],     */
/*    sections{section: {mode, people[]}}, createdAt, updatedAt        */
/*  mealplan_households/{hid}/recipes/{id}                             */
/*    name, link, ingredients, made, lastMade, ratings{person: r},     */
/*    createdBy, createdAt, updatedAt                                  */
/*  mealplan_households/{hid}/days/{YYYY-MM-DD}                        */
/*    date, breakfast{person: slot}, lunch{person: slot},              */
/*    snack{person: slot}, dinner{all: slot}, dessert{all: slot},      */
/*    mods{section: text}                                              */
/*    (a slot is { items[], eaten } or { none }; `all` is the shared   */
/*    Everyone slot; see plan.js)                                      */
/*  mealplan_households/{hid}/inventory/{id}                           */
/*    name, addedAt, usedAt, onList, inCart, createdAt, createdBy      */
/*                                                                     */
/*  A household, not a user, owns the data: Josh and Ashley plan the  */
/*  same week from two accounts. Membership is by verified email       */
/*  (memberEmails, lowercased), which is what lets one person add the  */
/*  other before that person has ever signed in.                       */
/*                                                                     */
/*  Every query filters on one field only, so nothing here needs a     */
/*  composite index. Sorting happens client-side.                      */
/* ------------------------------------------------------------------ */

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { addDays, matchNames } from "./plan";

const COL = "mealplan_households";
const hhCol = () => collection(db, COL);
const hhDoc = (hid) => doc(db, COL, hid);
const sub = (hid, name) => collection(db, COL, hid, name);

export const normEmail = (e) => String(e || "").trim().toLowerCase();

const when = (ts) => ts?.toDate?.() || null;

/* ---------------------------- households --------------------------- */

const shapeHousehold = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name || "Our kitchen",
    ownerUid: d.ownerUid,
    memberEmails: Array.isArray(d.memberEmails) ? d.memberEmails : [],
    // Raw; kitchenConfig() in plan.js fills in defaults. Kitchens started
    // before these were editable have neither field.
    people: d.people,
    sections: d.sections,
    createdAt: when(d.createdAt),
    // True while a just-created household exists only locally. Its
    // subcollections can't be read until the server has it, because the
    // rules check membership against the stored document.
    pending: snap.metadata.hasPendingWrites,
  };
};

// Every household this email belongs to, oldest first, so the one a family
// started with stays the default even if someone else adds them to another.
export const watchHouseholds = (email, cb, onError) =>
  onSnapshot(
    query(hhCol(), where("memberEmails", "array-contains", normEmail(email))),
    { includeMetadataChanges: true },
    (snap) => {
      const rows = snap.docs.map(shapeHousehold);
      rows.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      cb(rows);
    },
    onError
  );

const cleanEmails = (list) => [...new Set((list || []).map(normEmail).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

export const createHousehold = async (user, { name, otherEmails, people }) => {
  const me = normEmail(user.email);
  const ref = await addDoc(hhCol(), {
    name: String(name || "").trim() || "Our kitchen",
    ownerUid: user.uid,
    memberEmails: cleanEmails([me, ...(otherEmails || [])]),
    people,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

// Kitchen name, people, and how each section is laid out. Each is saved on
// its own so two people editing different settings don't undo each other.
export const saveKitchen = (hid, patch) => updateDoc(hhDoc(hid), { ...patch, updatedAt: serverTimestamp() });

// The rules refuse any list that drops the person saving it, so nobody can
// lock themselves out by accident.
export const saveMembers = (hid, emails) =>
  updateDoc(hhDoc(hid), { memberEmails: cleanEmails(emails), updatedAt: serverTimestamp() });

/* ------------------------------ recipes ---------------------------- */

const shapeRecipe = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name || "Untitled recipe",
    link: d.link || "",
    ingredients: d.ingredients || "",
    made: d.made === true,
    lastMade: typeof d.lastMade === "string" ? d.lastMade : null,
    ratings: d.ratings && typeof d.ratings === "object" ? d.ratings : {},
    createdAt: when(d.createdAt),
  };
};

export const watchRecipes = (hid, cb, onError) =>
  onSnapshot(
    sub(hid, "recipes"),
    (snap) => {
      const rows = snap.docs.map(shapeRecipe);
      rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      cb(rows);
    },
    onError
  );

export const addRecipe = async (hid, uid, { name, link, ingredients }) => {
  const ref = await addDoc(sub(hid, "recipes"), {
    name: String(name || "").trim(),
    link: link || "",
    ingredients: String(ingredients || "").trim(),
    made: false,
    lastMade: null,
    ratings: {},
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateRecipe = (hid, id, patch) =>
  updateDoc(doc(sub(hid, "recipes"), id), { ...patch, updatedAt: serverTimestamp() });

// One person's thumb. null clears it back to "hasn't weighed in", which is
// different from a neutral.
export const setRating = (hid, id, personKey, value) =>
  updateDoc(doc(sub(hid, "recipes"), id), {
    [`ratings.${personKey}`]: value || deleteField(),
    updatedAt: serverTimestamp(),
  });

export const deleteRecipe = (hid, id) => deleteDoc(doc(sub(hid, "recipes"), id));

/* ------------------------------- days ------------------------------ */

// The seven day documents for one week, keyed by date. Days nobody has
// touched simply don't exist yet and come back missing from the map.
export const watchWeek = (hid, monday, cb, onError) =>
  onSnapshot(
    query(sub(hid, "days"), where("date", ">=", monday), where("date", "<=", addDays(monday, 6))),
    (snap) => {
      const days = {};
      snap.docs.forEach((d) => {
        days[d.id] = d.data();
      });
      cb(days);
    },
    onError
  );

// Writes exactly one slot of one day. `path` is a dotted field path such as
// "breakfast.cam", "snacks", or "dinnerMod". mergeFields replaces that field
// whole (so switching Cam from a meal to "not needed" doesn't leave the old
// meal behind the way a deep merge would) and creates the day on first write.
export const saveSlot = (hid, dateKey, path, value) => {
  const data = { date: dateKey, updatedAt: serverTimestamp() };
  const parts = path.split(".");
  let cursor = data;
  parts.slice(0, -1).forEach((p) => {
    cursor[p] = {};
    cursor = cursor[p];
  });
  const empty = value === null || value === undefined || value === "";
  cursor[parts[parts.length - 1]] = empty ? deleteField() : value;
  return setDoc(doc(sub(hid, "days"), dateKey), data, { mergeFields: ["date", "updatedAt", path] });
};

// One section's mods note (dinner's "Cam: butter noodles instead of pesto").
// Dinner's used to live in `dinnerMod`; saving it here retires that field.
export const saveMod = (hid, dateKey, sectionKey, text) =>
  setDoc(
    doc(sub(hid, "days"), dateKey),
    {
      date: dateKey,
      updatedAt: serverTimestamp(),
      mods: { [sectionKey]: text || deleteField() },
      ...(sectionKey === "dinner" ? { dinnerMod: deleteField() } : {}),
    },
    { mergeFields: ["date", "updatedAt", `mods.${sectionKey}`, ...(sectionKey === "dinner" ? ["dinnerMod"] : [])] }
  );

// Snacks are saved as the whole per-person map at once, and the same write
// deletes the old two-slot `snacks` array. Writing one person at a time
// would leave that array behind, and clearing Cam's snack would then bring
// the old one back.
export const saveSnacks = (hid, dateKey, byPerson) => {
  const snack = {};
  Object.entries(byPerson).forEach(([who, v]) => {
    if (v) snack[who] = v;
  });
  return setDoc(
    doc(sub(hid, "days"), dateKey),
    { date: dateKey, updatedAt: serverTimestamp(), snack, snacks: deleteField() },
    { mergeFields: ["date", "updatedAt", "snack", "snacks"] }
  );
};

/* ----------------------------- inventory --------------------------- */

// Rows written before the shopping list existed only carry createdAt, which
// was their added date. Rows written since always carry addedAt, and a
// list-only item that has never been bought stores it as null, so the
// fallback applies only when the field is missing altogether.
const shapeItem = (snap) => {
  const d = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    name: d.name || "",
    addedAt: "addedAt" in d ? when(d.addedAt) : when(d.createdAt),
    usedAt: when(d.usedAt),
    onList: d.onList === true,
    inCart: d.inCart === true,
  };
};

export const watchInventory = (hid, cb, onError) =>
  onSnapshot(sub(hid, "inventory"), (snap) => cb(snap.docs.map(shapeItem)), onError);

const itemRef = (hid, id) => doc(sub(hid, "inventory"), id);

// Back in the house as of now: fresh date, not used, off the list.
const RESTOCK = () => ({ addedAt: serverTimestamp(), usedAt: null, onList: false, inCart: false });

// Puts names into stock in one batch, so a dictated grocery run lands at
// once. A name that already has a row (in stock, used up, or on the list)
// revives that row with a new date instead of adding a duplicate. `items` is
// the current inventory, used for that matching. Returns the row ids in the
// order of `names`.
export const stockItems = async (hid, uid, names, items) => {
  const batch = writeBatch(db);
  const ids = matchNames(names, items).map(({ name, existing }) => {
    if (existing) {
      batch.update(itemRef(hid, existing.id), RESTOCK());
      return existing.id;
    }
    const ref = doc(sub(hid, "inventory"));
    batch.set(ref, { name, ...RESTOCK(), createdAt: serverTimestamp(), createdBy: uid });
    return ref.id;
  });
  await batch.commit();
  return ids;
};

// Puts names on the shopping list. Known items are flagged; new ones become
// list-only rows that join the inventory the first time they're bought.
export const listItems = async (hid, uid, names, items) => {
  const batch = writeBatch(db);
  matchNames(names, items).forEach(({ name, existing }) => {
    if (existing) {
      batch.update(itemRef(hid, existing.id), { onList: true });
    } else {
      batch.set(doc(sub(hid, "inventory")), {
        name,
        addedAt: null,
        usedAt: null,
        onList: true,
        inCart: false,
        createdAt: serverTimestamp(),
        createdBy: uid,
      });
    }
  });
  await batch.commit();
};

// Strikes an item through (or brings it back if tapped again). Optionally
// puts it straight on the shopping list in the same write.
export const setUsed = (hid, id, used, { toList = false } = {}) =>
  updateDoc(itemRef(hid, id), {
    usedAt: used ? serverTimestamp() : null,
    ...(toList ? { onList: true } : {}),
  });

// Off the list. A list-only item that was never bought has nothing left to
// be, so its row goes too.
export const unlistItem = (hid, item) =>
  item.addedAt ? updateDoc(itemRef(hid, item.id), { onList: false, inCart: false }) : deleteDoc(itemRef(hid, item.id));

export const setInCart = (hid, id, inCart) => updateDoc(itemRef(hid, id), { inCart });

// Done shopping: everything checked off comes into stock dated now.
export const checkout = async (hid, ids) => {
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(itemRef(hid, id), RESTOCK()));
  await batch.commit();
  return ids.length;
};

export const deleteItem = (hid, id) => deleteDoc(itemRef(hid, id));
