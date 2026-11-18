// Firestore access for Narrative Lab. Every collection is nl_*; the rules in
// the repo-root firestore.rules admit one verified account, and keep the
// capture, findings, scores, edges, spend, and log server-written. The
// browser submits items, retries them, and records Josh's own judgment
// (notes, affiliations, verdicts, narrative names).

import {
  addDoc,
  collection,
  deleteDoc,
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

// ── Share links ─────────────────────────────────────────────────────────────

/* A random 27-character token (20 bytes, base64url). It is the share's
   document id and the only secret in the link, so it comes from the
   browser's cryptographic generator, never Math.random. */
export const newToken = () => {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const shareUrl = (token) => `${window.location.origin}/lab/${token}`;

export const createShare = async ({ scope, targetId = null, label, allowSuggestions = true, expiresAt = null }) => {
  const token = newToken();
  await setDoc(d("shares", token), {
    scope,
    targetId,
    label: (label || "").trim().slice(0, 160),
    allowSuggestions,
    expiresAt,
    revoked: false,
    views: 0,
    suggestions: 0,
    createdAt: serverTimestamp(),
  });
  return token;
};

export const updateShare = (token, patch) => updateDoc(d("shares", token), patch);
export const setShareRevoked = (token, revoked) => updateDoc(d("shares", token), { revoked, revokedAt: revoked ? serverTimestamp() : null });
export const deleteShare = (token) => deleteDoc(d("shares", token));

// ── Suggestions from viewers ────────────────────────────────────────────────

/* Accepting submits a normal item (it then runs the pipeline) and marks the
   suggestion with the new item's id. */
export const acceptSuggestion = async (s) => {
  const id = await submitItem({
    url: s.url,
    text: s.text,
    title: s.title,
    author: s.author,
    publisher: s.publisher,
    suggestionId: s.id,
  });
  await updateDoc(d("suggestions", s.id), { status: "accepted", itemId: id, decidedAt: serverTimestamp() });
  return id;
};

export const dismissSuggestion = (id) => updateDoc(d("suggestions", id), { status: "dismissed", decidedAt: serverTimestamp() });
export const restoreSuggestion = (id) => updateDoc(d("suggestions", id), { status: "pending", decidedAt: null });

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
