/* ------------------------------------------------------------------ */
/*  Mise: Firestore persistence                                        */
/*                                                                     */
/*  mise_implementations/{implId}                                      */
/*    ownerUid, name, client, tree, layout, createdAt, updatedAt       */
/*    (layout: depthWindow, view, focusId, theme)                       */
/*  mise_implementations/{implId}/events/{eventId}                     */
/*    nodeId, nodeName, type, at, actor                                */
/*  mise_implementations/{implId}/details/{nodeId}                     */
/*    notes, links, comments, attachments (see details.js)             */
/*  Storage: mise/{ownerUid}/{implId}/{nodeId}/{fileId}-{name}         */
/*                                                                     */
/*  One document per implementation, not one per node: these trees run */
/*  to the low hundreds of nodes and are always read whole. The event  */
/*  ledger is append-only and nothing reads it yet — it is what makes  */
/*  empirical cycle times possible once a few implementations close.   */
/* ------------------------------------------------------------------ */

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { detailId, readDetails, safeFileName } from "./details";
import { db, storage } from "./firebase";
import { DEFAULT_THEME, isTheme } from "./themes";
import { sanitize } from "./tree";

const COL = "mise_implementations";
const implCol = () => collection(db, COL);
const implDoc = (id) => doc(db, COL, id);
const eventsCol = (id) => collection(db, COL, id, "events");
const detailsCol = (id) => collection(db, COL, id, "details");
const detailsDoc = (id, nodeId) => doc(db, COL, id, "details", nodeId);

export const DEFAULT_LAYOUT = { depthWindow: 4, view: "chart", focusId: null, theme: DEFAULT_THEME };

const readLayout = (raw) => ({
  depthWindow: [3, 4, 5].includes(raw?.depthWindow) ? raw.depthWindow : DEFAULT_LAYOUT.depthWindow,
  view: raw?.view === "plan" ? "plan" : "chart",
  focusId: typeof raw?.focusId === "string" ? raw.focusId : null,
  theme: isTheme(raw?.theme) ? raw.theme : DEFAULT_THEME,
});

const shape = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name || "Untitled implementation",
    client: d.client || "",
    ownerUid: d.ownerUid,
    tree: d.tree ? sanitize(d.tree) : null,
    layout: readLayout(d.layout),
    createdAt: d.createdAt?.toDate?.() || null,
    updatedAt: d.updatedAt?.toDate?.() || null,
  };
};

/* Live list of the signed-in user's implementations. Sorted here rather than
   in the query so the collection needs no composite index. */
export const watchImplementations = (ownerUid, cb, onError) =>
  onSnapshot(
    query(implCol(), where("ownerUid", "==", ownerUid)),
    (snap) => {
      const rows = snap.docs.map(shape);
      rows.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
      cb(rows);
    },
    onError
  );

export const watchImplementation = (id, cb, onError) =>
  onSnapshot(
    implDoc(id),
    (snap) => cb(snap.exists() ? { ...shape(snap), fromCache: snap.metadata.hasPendingWrites } : null),
    onError
  );

export const createImplementation = async (ownerUid, { name, client, tree, theme }) => {
  const ref = await addDoc(implCol(), {
    ownerUid,
    name,
    client: client || "",
    tree: sanitize(tree),
    layout: readLayout({ ...DEFAULT_LAYOUT, theme }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const saveTree = (id, tree, layout) =>
  updateDoc(implDoc(id), {
    tree: sanitize(tree),
    layout: readLayout(layout),
    updatedAt: serverTimestamp(),
  });

export const saveLayout = (id, layout) =>
  updateDoc(implDoc(id), { layout: readLayout(layout), updatedAt: serverTimestamp() });

export const renameImplementation = (id, { name, client }) =>
  updateDoc(implDoc(id), { name, client: client || "", updatedAt: serverTimestamp() });

/* Firestore doesn't cascade, so clear the event ledger before dropping the
   parent — orphaned events would otherwise sit there unreachable (the rules
   resolve ownership through the parent doc, which would no longer exist). */
export const deleteImplementation = async (id) => {
  const [events, details] = await Promise.all([getDocs(eventsCol(id)), getDocs(detailsCol(id))]);
  details.docs.forEach((d) => readDetails(d.data()).attachments.forEach((a) => deleteFile(a.path)));
  const docs = [...events.docs, ...details.docs];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(implDoc(id));
};

/* Append-only ledger. `nodeId` is the join key back into the tree; `nodeName`
   is only a snapshot taken at the moment of the event, so a step renamed later
   keeps its old name here. Fire-and-forget: a dropped event must never block
   the edit the user just made, so failures are logged, not surfaced. */
export const logEvent = (id, actor, { nodeId, nodeName, type }) =>
  addDoc(eventsCol(id), { nodeId, nodeName, type, actor, at: serverTimestamp() }).catch((e) =>
    console.warn("[mise] event log:", e.message)
  );

/* ---------------------------- step details --------------------------- */

/* Every step's details for one plan, as { nodeId: details }. One listener
   per open plan: the docs are small, and the chart needs to know which
   cells have anything attached without opening each one. */
export const watchDetails = (id, cb, onError) =>
  onSnapshot(
    detailsCol(id),
    (snap) => {
      const out = {};
      snap.docs.forEach((d) => {
        out[d.id] = readDetails(d.data());
      });
      cb(out);
    },
    onError
  );

/* Merge a patch ({ notes } or { links } …) into one step's details. */
export const saveDetails = (id, nodeId, patch) =>
  setDoc(detailsDoc(id, nodeId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });

/* Append one item to a step's links, comments, or attachments. arrayUnion
   so two uploads finishing together can't drop each other. */
export const addDetail = (id, nodeId, field, item) =>
  setDoc(detailsDoc(id, nodeId), { [field]: arrayUnion(item), updatedAt: serverTimestamp() }, { merge: true });

/* Remove by id inside a transaction rather than with arrayRemove, which
   needs a byte-exact copy of the stored object. Deletes the stored file
   too when one is named. */
export const removeDetail = async (id, nodeId, field, item, filePath) => {
  const target = detailsDoc(id, nodeId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(target);
    if (!snap.exists()) return;
    const items = Array.isArray(snap.data()[field]) ? snap.data()[field] : [];
    tx.update(target, { [field]: items.filter((x) => x?.id !== item.id), updatedAt: serverTimestamp() });
  });
  if (filePath) await deleteFile(filePath);
};

/* Every step's details for one plan, read once, for exports. */
export const getDetails = async (id) => {
  const snap = await getDocs(detailsCol(id));
  const out = {};
  snap.docs.forEach((d) => {
    out[d.id] = readDetails(d.data());
  });
  return out;
};

/* Bulk write, for imports. Batches cap at 500 writes. */
export const writeDetails = async (id, byNode) => {
  const entries = Object.entries(byNode || {});
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    entries
      .slice(i, i + 400)
      .forEach(([nodeId, d]) => batch.set(detailsDoc(id, nodeId), { ...d, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
};

/* Drops the details (and any uploaded files) for steps that were deleted
   from the tree. Best-effort: a leftover doc is invisible and harmless. */
export const clearDetails = async (id, nodeIds, known) => {
  const ids = nodeIds.filter((n) => known[n]);
  ids.forEach((n) => known[n].attachments.forEach((a) => deleteFile(a.path)));
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((n) => batch.delete(detailsDoc(id, n)));
    await batch.commit().catch((e) => console.warn("[mise] clear details:", e.message));
  }
};

/* Uploads one file and returns its attachment record. The owner uid leads
   the path so storage.rules can check ownership without reading Firestore. */
export const uploadAttachment = (ownerUid, id, nodeId, file, onProgress) =>
  new Promise((resolve, reject) => {
    const fileId = detailId();
    const name = safeFileName(file.name);
    const path = `mise/${ownerUid}/${id}/${nodeId}/${fileId}-${name}`;
    const task = uploadBytesResumable(ref(storage, path), file, {
      contentType: file.type || "application/octet-stream",
      contentDisposition: `inline; filename="${name.replace(/"/g, "")}"`,
    });
    task.on(
      "state_changed",
      (s) => onProgress && s.totalBytes && onProgress(s.bytesTransferred / s.totalBytes),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ id: fileId, name, path, url, size: file.size, type: file.type || "", at: Date.now() });
        } catch (e) {
          reject(e);
        }
      }
    );
  });

export const deleteFile = (path) =>
  path
    ? deleteObject(ref(storage, path)).catch((e) => console.warn("[mise] couldn't delete", path, e?.code))
    : Promise.resolve();
