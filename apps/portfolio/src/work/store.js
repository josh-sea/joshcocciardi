import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Per-user document store for /work pages: one doc per (page, user), at
// work_private/{uid}__{pageKey}.
//
// The payload is stored as a JSON *string* rather than a nested map on
// purpose. Firestore stops at 20 levels of map/array nesting, and a tree like
// the intake questionnaire costs four levels per question depth
// (nodes[] → node{} → options[] → option{}), so a deeply nested branch would
// fail at write time. A string has no such ceiling — only the 1MB document
// limit, which this data is nowhere near.
const docRef = (uid, pageKey) => doc(db, "work_private", `${uid}__${pageKey}`);

export const loadPage = async (uid, pageKey) => {
  const snap = await getDoc(docRef(uid, pageKey));
  if (!snap.exists()) return null;
  const raw = snap.data()?.payload;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[work] stored payload was not valid JSON; ignoring it.", e);
    return null;
  }
};

export const savePage = (uid, pageKey, value) =>
  setDoc(docRef(uid, pageKey), {
    ownerUid: uid,
    pageKey,
    payload: JSON.stringify(value),
    updatedAt: serverTimestamp(),
  });
