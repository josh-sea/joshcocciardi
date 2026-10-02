// Firestore access for Seasonal Box HQ. Every collection is sbox_*; the rules
// in the repo-root firestore.rules admit one verified account, and keep the
// ledger, step logs, run progress, and execution results server-written.

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
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref as storageRef } from "firebase/storage";
import app, { db, functions } from "../../lib/firebase";
import { DEFAULT_AGENTS, DEFAULT_KITS, DEFAULT_SETTINGS, DEFAULT_TIERS } from "./seed";

const c = (name) => collection(db, `sbox_${name}`);
const d = (name, id) => doc(db, `sbox_${name}`, id);

const rows = (snap) => snap.docs.map((x) => ({ id: x.id, ...x.data() }));

/* Live list of a collection. `opts.where` is [field, value] (equality only,
   so no composite index is ever needed: CI doesn't deploy indexes). */
export const watch = (name, cb, onErr, opts = {}) => {
  const parts = [];
  if (opts.where) parts.push(where(opts.where[0], "==", opts.where[1]));
  if (opts.orderBy) parts.push(orderBy(opts.orderBy, opts.dir || "desc"));
  if (opts.limit) parts.push(limit(opts.limit));
  return onSnapshot(query(c(name), ...parts), (s) => cb(rows(s)), onErr);
};

export const watchDoc = (name, id, cb, onErr) => onSnapshot(d(name, id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), onErr);

export const watchSteps = (runId, cb, onErr) =>
  onSnapshot(query(collection(db, "sbox_runs", runId, "steps"), orderBy("n", "asc")), (s) => cb(rows(s)), onErr);

// ── First open ──────────────────────────────────────────────────────────────

/* Seeds settings, agents, kits, and tiers once. Agents already present are
   left alone, so a redeploy never overwrites edits made in the UI. */
export const ensureSeeded = async () => {
  const settings = await getDoc(d("settings", "global"));
  if (settings.exists()) return false;
  const batch = writeBatch(db);
  batch.set(d("settings", "global"), { ...DEFAULT_SETTINGS, createdAt: serverTimestamp() });
  for (const a of DEFAULT_AGENTS) batch.set(d("agents", a.id), { ...a, createdAt: serverTimestamp() });
  for (const k of DEFAULT_KITS) batch.set(d("kits", k.id), k);
  for (const t of DEFAULT_TIERS) batch.set(d("tiers", t.id), t);
  await batch.commit();
  return true;
};

/* Adds any default agent that's missing (a new agent shipped after the
   first seed) without touching existing ones. */
export const addMissingAgents = async (existingIds) => {
  const missing = DEFAULT_AGENTS.filter((a) => !existingIds.includes(a.id));
  if (!missing.length) return 0;
  const batch = writeBatch(db);
  for (const a of missing) batch.set(d("agents", a.id), { ...a, createdAt: serverTimestamp() });
  await batch.commit();
  return missing.length;
};

// ── Settings, agents, catalog ───────────────────────────────────────────────

export const saveSettings = (patch) => setDoc(d("settings", "global"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });

export const saveAgent = (id, patch) => updateDoc(d("agents", id), { ...patch, updatedAt: serverTimestamp() });

export const resetAgent = (id) => {
  const def = DEFAULT_AGENTS.find((a) => a.id === id);
  if (!def) return Promise.resolve();
  return setDoc(d("agents", id), { ...def, updatedAt: serverTimestamp() });
};

export const saveTier = (id, patch) => setDoc(d("tiers", id), patch, { merge: true });
export const saveKit = (id, patch) => setDoc(d("kits", id), patch, { merge: true });

/* Write-only: the rules let this browser set the key but never read it. */
export const saveApiKey = (apiKey) => setDoc(d("secrets", "anthropic"), { apiKey: apiKey.trim(), updatedAt: serverTimestamp() });

// ── Seasons ─────────────────────────────────────────────────────────────────

export const createSeason = async ({ name, year, shipDate, lockDate, forecast, milestones }) => {
  const ref = await addDoc(c("seasons"), {
    name,
    year,
    shipDate,
    lockDate,
    milestones,
    forecast: forecast || null,
    stage: 1,
    status: "active",
    flags: {},
    themeIds: [],
    history: [{ stage: 1, at: new Date().toISOString(), by: "josh" }],
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const updateSeason = (id, patch) => updateDoc(d("seasons", id), { ...patch, updatedAt: serverTimestamp() });

/* Manual stage moves are recorded in the season's history like automatic
   ones, so the stage tracker can show who moved it. */
export const moveStage = (season, to) =>
  updateDoc(d("seasons", season.id), {
    stage: to,
    // Going back pauses auto-advance, or the stage machine would move the
    // season straight forward again on criteria it already met.
    ...(to < (Number(season.stage) || 1) ? { hold: true } : {}),
    stageEnteredAt: serverTimestamp(),
    history: [...(season.history || []), { stage: to, at: new Date().toISOString(), by: "josh" }].slice(-40),
  });

// ── Runs ────────────────────────────────────────────────────────────────────

export const createRun = async ({ agentId, seasonId = null, instructions = "", feedback = null, trigger }) => {
  const ref = await addDoc(c("runs"), {
    agentId,
    seasonId,
    trigger: trigger || { type: "manual", by: "josh" },
    instructions,
    feedback,
    status: "queued",
    tick: 0,
    cost: 0,
    steps: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const cancelRun = (id) => updateDoc(d("runs", id), { status: "cancelled", endedAt: serverTimestamp() });

/* A failed run resumes from its last completed step: the steps are kept, so
   only the step that failed is redone. */
export const resumeRun = (id) => updateDoc(d("runs", id), { status: "queued", resumeRequestedAt: serverTimestamp(), error: null });

// ── Proposals ───────────────────────────────────────────────────────────────

export const decide = (proposal, { status, comment = "", selection = null, editedContentJson = null, editedPayloadJson = null }) =>
  updateDoc(d("proposals", proposal.id), {
    status,
    decidedAt: serverTimestamp(),
    decision: {
      by: "josh",
      at: new Date().toISOString(),
      comment: comment || null,
      selection,
      editedContentJson,
      editedPayloadJson,
    },
  });

export const markManualDone = (proposal, { amountUsd = 0, note = "" }) =>
  updateDoc(d("proposals", proposal.id), {
    manual: { done: true, amountUsd: Number(amountUsd) || 0, note: note || null, at: new Date().toISOString() },
  });

// ── Taste notes ─────────────────────────────────────────────────────────────

export const addNote = ({ scope, scopeId = null, text, source = null }) =>
  addDoc(c("notes"), { scope, scopeId, text: text.trim(), source, pinned: false, createdAt: serverTimestamp() });

export const updateNote = (id, patch) => updateDoc(d("notes", id), patch);
export const deleteNote = (id) => deleteDoc(d("notes", id));

// ── Makers and products ─────────────────────────────────────────────────────

export const saveMaker = (id, patch) =>
  id ? setDoc(d("makers", id), { ...patch, updatedAt: serverTimestamp() }, { merge: true }) : addDoc(c("makers"), { ...patch, status: patch.status || "prospect", createdAt: serverTimestamp() });

export const deleteMaker = (id) => deleteDoc(d("makers", id));

export const saveProduct = (id, patch) =>
  id ? setDoc(d("products", id), { ...patch, updatedAt: serverTimestamp() }, { merge: true }) : addDoc(c("products"), { ...patch, createdAt: serverTimestamp() });

export const deleteProduct = (id) => deleteDoc(d("products", id));

// ── Functions ───────────────────────────────────────────────────────────────

export const heartbeat = (opts = {}) => httpsCallable(functions, "sboxHeartbeat")(opts).then((r) => r.data);
export const checkKey = () => httpsCallable(functions, "sboxCheckKey")().then((r) => r.data);

// ── Storage (mood-board images saved by agents) ─────────────────────────────

const storage = getStorage(app);
const urlCache = new Map();

export const imageUrl = async (path) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (urlCache.has(path)) return urlCache.get(path);
  const p = getDownloadURL(storageRef(storage, path)).catch(() => null);
  urlCache.set(path, p);
  return p;
};
