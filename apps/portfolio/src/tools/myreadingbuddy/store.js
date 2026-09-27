/* ------------------------------------------------------------------ */
/*  My Reading Buddy: Firestore + Storage persistence                  */
/*                                                                     */
/*  readingbuddy_shelves/{sid}                                         */
/*    name, ownerUid, memberEmails[], createdAt, updatedAt             */
/*  readingbuddy_shelves/{sid}/books/{bid}                             */
/*    title, readBy, pages[], createdBy, createdAt, updatedAt          */
/*    a page is { id, image: {url, path, w, h},                        */
/*                audio: {url, path, type, secs} | null }              */
/*                                                                     */
/*  Storage: readingbuddy/{sid}/{bid}/{pageId}.jpg for the photo and   */
/*  readingbuddy/{sid}/{bid}/{pageId}-{stamp}.{ext} for the voice. A   */
/*  new take gets a new file name, so nobody's browser keeps playing   */
/*  a cached old take.                                                 */
/*                                                                     */
/*  A shelf, not a user, owns the books: one parent records while      */
/*  away and the kids listen at home on the other parent's login.      */
/*  Membership is by verified email (memberEmails, lowercased), the    */
/*  same model as the Meal Planner's households.                       */
/*                                                                     */
/*  Pages live in an array on the book so the order is the array       */
/*  order. Every change to it runs in a transaction against the        */
/*  stored array, so a recording saved from one phone can't undo a     */
/*  reorder made on another.                                           */
/* ------------------------------------------------------------------ */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { baseType, extFor, newId } from "./book";

const COL = "readingbuddy_shelves";
const shelfCol = () => collection(db, COL);
const shelfDoc = (sid) => doc(db, COL, sid);
const booksCol = (sid) => collection(db, COL, sid, "books");
const bookDoc = (sid, bid) => doc(db, COL, sid, "books", bid);

export const normEmail = (e) => String(e || "").trim().toLowerCase();

const when = (ts) => ts?.toDate?.() || null;

/* ------------------------------ shelves ---------------------------- */

const shapeShelf = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name || "Our bookshelf",
    ownerUid: d.ownerUid,
    memberEmails: Array.isArray(d.memberEmails) ? d.memberEmails : [],
    createdAt: when(d.createdAt),
    // True while a just-created shelf exists only locally. Its books can't
    // be read until the server has it, because the rules check membership
    // against the stored document.
    pending: snap.metadata.hasPendingWrites,
  };
};

// Every shelf this email is on, oldest first, so the first one a family
// started stays the default.
export const watchShelves = (email, cb, onError) =>
  onSnapshot(
    query(shelfCol(), where("memberEmails", "array-contains", normEmail(email))),
    { includeMetadataChanges: true },
    (snap) => {
      const rows = snap.docs.map(shapeShelf);
      rows.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      cb(rows);
    },
    onError
  );

const cleanEmails = (list) => [...new Set((list || []).map(normEmail).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

export const createShelf = async (user, { name, otherEmails }) => {
  const ref = await addDoc(shelfCol(), {
    name: String(name || "").trim() || "Our bookshelf",
    ownerUid: user.uid,
    memberEmails: cleanEmails([user.email, ...(otherEmails || [])]),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const renameShelf = (sid, name) => updateDoc(shelfDoc(sid), { name, updatedAt: serverTimestamp() });

// The rules refuse any list that drops the person saving it, so nobody can
// lock themselves out by accident.
export const saveMembers = (sid, emails) =>
  updateDoc(shelfDoc(sid), { memberEmails: cleanEmails(emails), updatedAt: serverTimestamp() });

/* ------------------------------- books ----------------------------- */

const shapeBook = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    title: d.title || "Untitled book",
    readBy: d.readBy || "",
    pages: Array.isArray(d.pages) ? d.pages : [],
    createdBy: d.createdBy,
    createdAt: when(d.createdAt),
    updatedAt: when(d.updatedAt),
  };
};

// Newest first, so the book just recorded is the first one on the shelf.
export const watchBooks = (sid, cb, onError) =>
  onSnapshot(
    booksCol(sid),
    (snap) => {
      const rows = snap.docs.map(shapeBook);
      // A book that was only just created has no server timestamp yet.
      const now = Date.now();
      rows.sort((a, b) => (b.createdAt?.getTime() ?? now) - (a.createdAt?.getTime() ?? now));
      cb(rows);
    },
    onError
  );

export const createBook = async (sid, uid, { title, readBy }) => {
  const ref = await addDoc(booksCol(sid), {
    title: String(title || "").trim() || "Untitled book",
    readBy: String(readBy || "").trim(),
    pages: [],
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const saveBook = (sid, bid, patch) => updateDoc(bookDoc(sid, bid), { ...patch, updatedAt: serverTimestamp() });

// Apply `fn` to the stored page list and write the result, atomically.
const mutatePages = (sid, bid, fn) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(bookDoc(sid, bid));
    if (!snap.exists()) throw new Error("That book was deleted.");
    const pages = Array.isArray(snap.data().pages) ? snap.data().pages : [];
    tx.update(bookDoc(sid, bid), { pages: fn(pages), updatedAt: serverTimestamp() });
  });

export const updatePages = mutatePages;

// Storage cleanup is best effort: a file that's already gone, or one that
// can't be deleted, shouldn't stop the page or book from going.
const dropFile = (path) =>
  path ? deleteObject(ref(storage, path)).catch((e) => console.warn("[readingbuddy] couldn't delete", path, e?.code)) : null;

const put = async (path, blob, contentType) => {
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType, cacheControl: "public, max-age=31536000" });
  return getDownloadURL(r);
};

// Add one photographed spread to the end of the book. `image` is the shrunk
// photo from media.js: { blob, w, h }.
export const addPage = async (sid, bid, image) => {
  const id = newId();
  const type = baseType(image.blob.type) || "image/jpeg";
  const path = `readingbuddy/${sid}/${bid}/${id}.${extFor(type)}`;
  const url = await put(path, image.blob, type);
  const page = { id, image: { url, path, w: image.w, h: image.h }, audio: null };
  await mutatePages(sid, bid, (pages) => [...pages, page]);
  return page;
};

// Save a take for one page, replacing (and then deleting) any earlier one.
export const saveRecording = async (sid, bid, pageId, blob, secs) => {
  const type = baseType(blob.type) || "audio/mp4";
  const path = `readingbuddy/${sid}/${bid}/${pageId}-${Date.now()}.${extFor(type)}`;
  const url = await put(path, blob, type);
  let old = null;
  await mutatePages(sid, bid, (pages) =>
    pages.map((p) => {
      if (p.id !== pageId) return p;
      old = p.audio?.path || null;
      return { ...p, audio: { url, path, type, secs: Math.round(secs * 10) / 10 } };
    })
  );
  if (old && old !== path) dropFile(old);
};

export const deletePage = async (sid, bid, pageId) => {
  let gone = null;
  await mutatePages(sid, bid, (pages) => {
    gone = pages.find((p) => p.id === pageId) || null;
    return pages.filter((p) => p.id !== pageId);
  });
  if (gone) {
    dropFile(gone.image?.path);
    dropFile(gone.audio?.path);
  }
};

export const deleteBook = async (sid, book) => {
  await deleteDoc(bookDoc(sid, book.id));
  await Promise.all(book.pages.flatMap((p) => [dropFile(p.image?.path), dropFile(p.audio?.path)]));
};
