/* ------------------------------------------------------------------ */
/*  Family Meal Planner: Firestore persistence                         */
/*                                                                     */
/*  mealplan_households/{hid}                                          */
/*    name, ownerUid, memberEmails[], createdAt, updatedAt             */
/*  mealplan_households/{hid}/recipes/{id}                             */
/*    name, link, ingredients, made, lastMade, ratings{person: r},     */
/*    createdBy, createdAt, updatedAt                                  */
/*  mealplan_households/{hid}/days/{YYYY-MM-DD}                        */
/*    date, breakfast{person: entry}, lunch{person: entry},            */
/*    snacks[2], dinner, dinnerMod, dessert, updatedAt                 */
/*  mealplan_households/{hid}/inventory/{id}                           */
/*    name, createdAt, createdBy                                       */
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
import { addDays, isPick } from "./plan";

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

export const createHousehold = async (user, { name, otherEmails }) => {
  const me = normEmail(user.email);
  const ref = await addDoc(hhCol(), {
    name: String(name || "").trim() || "Our kitchen",
    ownerUid: user.uid,
    memberEmails: cleanEmails([me, ...(otherEmails || [])]),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

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

export const cleanPick = (p) => (isPick(p) ? { kind: p.kind, id: p.id || null, name: p.name } : null);

/* ----------------------------- inventory --------------------------- */

const shapeItem = (snap) => {
  const d = snap.data({ serverTimestamps: "estimate" });
  return { id: snap.id, name: d.name || "", createdAt: when(d.createdAt) };
};

export const watchInventory = (hid, cb, onError) =>
  onSnapshot(
    sub(hid, "inventory"),
    (snap) => {
      const rows = snap.docs.map(shapeItem);
      rows.sort(
        (a, b) =>
          (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      cb(rows);
    },
    onError
  );

// One batch for the whole list, so a dictated grocery run lands all at once
// with a single shared timestamp.
export const addItems = async (hid, uid, names) => {
  const batch = writeBatch(db);
  names.forEach((name) => {
    batch.set(doc(sub(hid, "inventory")), { name, createdAt: serverTimestamp(), createdBy: uid });
  });
  await batch.commit();
  return names.length;
};

// Returns the new row's id so a slot can point at it straight away.
export const addItem = async (hid, uid, name) => {
  const ref = doc(sub(hid, "inventory"));
  await setDoc(ref, { name, createdAt: serverTimestamp(), createdBy: uid });
  return ref.id;
};

export const deleteItem = (hid, id) => deleteDoc(doc(sub(hid, "inventory"), id));
