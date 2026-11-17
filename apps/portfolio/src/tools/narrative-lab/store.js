// Firestore access for Narrative Lab. Every collection is nl_*; the rules in
// the repo-root firestore.rules admit one verified account, and keep the
// capture, findings, scores, edges, spend, and log server-written. The
// browser submits items, retries them, and records Josh's own judgment
// (notes, affiliations, verdicts, narrative names).

import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

const c = (name) => collection(db, `nl_${name}`);
const d = (name, id) => doc(db, `nl_${name}`, id);
const rows = (snap) => snap.docs.map((x) => ({ id: x.id, ...x.data() }));

/* Live list of a collection, newest first by `field`. Single-field ordering
   only, so no composite index is ever needed (CI doesn't deploy indexes). */
export const watch = (name, cb, onErr, { by = "createdAt", max = 500 } = {}) =>
  onSnapshot(query(c(name), orderBy(by, "desc"), limit(max)), (s) => cb(rows(s)), onErr);

export const watchAll = (name, cb, onErr) => onSnapshot(c(name), (s) => cb(rows(s)), onErr);

export const readRaw = async (id) => {
  const s = await getDoc(d("raw", id));
  return s.exists() ? s.data() : null;
};

// ── Submitting ──────────────────────────────────────────────────────────────

const clean = (v) => (typeof v === "string" ? v.trim() : v);

/* Queues one item at capture. Only non-empty fields go in `input`; the rules
   allow nothing else on create. */
export const submitItem = async (input) => {
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const x = clean(v);
    if (Array.isArray(x) ? x.length : x) out[k] = x;
  }
  const ref = await addDoc(c("items"), { status: "queued", stage: "capture", input: out, createdAt: serverTimestamp() });
  return ref.id;
};

export const retryItem = (id) => updateDoc(d("items", id), { status: "queued", retryRequestedAt: serverTimestamp() });
export const setItemNotes = (id, notes) => updateDoc(d("items", id), { notes });
export const setArchived = (id, archived) => updateDoc(d("items", id), { archived });

// ── Josh's judgment ─────────────────────────────────────────────────────────

export const updateSource = (id, patch) => updateDoc(d("sources", id), patch);
export const updateNarrative = (id, patch) => updateDoc(d("narratives", id), patch);
export const updateClaim = (id, patch) => updateDoc(d("claims", id), patch);

// ── Settings and the key ────────────────────────────────────────────────────

export const saveSettings = (settings) => setDoc(d("settings", "global"), { ...settings, updatedAt: serverTimestamp() });
export const saveApiKey = (apiKey) => setDoc(d("secrets", "anthropic"), { apiKey: apiKey.trim(), updatedAt: serverTimestamp() });

const call = (name) => async (data) => (await httpsCallable(functions, name)(data || {})).data;
export const status = call("nlStatus");
export const checkKey = call("nlCheckKey");
export const rescore = (itemId, from) => call("nlRescore")({ itemId, from });
export const deleteItem = (itemId) => call("nlDeleteItem")({ itemId });

/* A plain-language reason for a failed Firestore or callable request. */
export const explain = (e) => {
  const code = e && e.code ? String(e.code).replace(/^functions\//, "") : "";
  if (code === "permission-denied") return "This account isn't allowed to do that.";
  if (code === "unavailable") return "Can't reach Firebase right now. Check the connection and try again.";
  if (code === "not-found" && /function/i.test(e.message || "")) return "The Narrative Lab functions aren't deployed yet.";
  return (e && e.message) || String(e);
};
