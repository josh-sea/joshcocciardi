/* ------------------------------------------------------------------ */
/*  Mise: Firestore persistence                                        */
/*                                                                     */
/*  mise_implementations/{implId}                                      */
/*    ownerUid, name, client, tree, layout, createdAt, updatedAt       */
/*  mise_implementations/{implId}/events/{eventId}                     */
/*    nodeId, nodeName, type, at, actor                                */
/*                                                                     */
/*  One document per implementation, not one per node: these trees run */
/*  to the low hundreds of nodes and are always read whole. The event  */
/*  ledger is append-only and nothing reads it yet — it is what makes  */
/*  empirical cycle times possible once a few implementations close.   */
/* ------------------------------------------------------------------ */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { sanitize } from "./tree";

const COL = "mise_implementations";
const implCol = () => collection(db, COL);
const implDoc = (id) => doc(db, COL, id);
const eventsCol = (id) => collection(db, COL, id, "events");

export const DEFAULT_LAYOUT = { depthWindow: 4, view: "chart", focusId: null };

const readLayout = (raw) => ({
  depthWindow: [3, 4, 5].includes(raw?.depthWindow) ? raw.depthWindow : DEFAULT_LAYOUT.depthWindow,
  view: raw?.view === "plan" ? "plan" : "chart",
  focusId: typeof raw?.focusId === "string" ? raw.focusId : null,
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

export const createImplementation = async (ownerUid, { name, client, tree }) => {
  const ref = await addDoc(implCol(), {
    ownerUid,
    name,
    client: client || "",
    tree: sanitize(tree),
    layout: DEFAULT_LAYOUT,
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
  const events = await getDocs(eventsCol(id));
  const docs = events.docs;
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
