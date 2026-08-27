import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadPageImage, deletePageImage } from './storage.service';

// A saved workbook page:
//   workbook_users/{adultUid}/kids/{kidId}/pages/{pageId}
// { title, blocks:[{kind, number, text}], imagePath, imageUrl, createdAt }
const pagesCol = (uid, kidId) =>
  collection(db, 'workbook_users', uid, 'kids', kidId, 'pages');

const pageRef = (uid, kidId, pageId) =>
  doc(db, 'workbook_users', uid, 'kids', kidId, 'pages', pageId);

export const listPages = async (uid, kidId) => {
  const snap = await getDocs(query(pagesCol(uid, kidId), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getPage = async (uid, kidId, pageId) => {
  const snap = await getDoc(pageRef(uid, kidId, pageId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Save a freshly-captured page: create the doc id first so we can namespace the
// image upload under it, upload the compressed original, then write the doc.
export const savePage = async (uid, kidId, { title, blocks, imageFile }) => {
  const ref = doc(pagesCol(uid, kidId));
  const pageId = ref.id;

  let image = { path: '', url: '' };
  if (imageFile) {
    image = await uploadPageImage(uid, kidId, pageId, imageFile);
  }

  await setDoc(ref, {
    title: title || 'Workbook page',
    blocks: blocks || [],
    imagePath: image.path,
    imageUrl: image.url,
    createdAt: serverTimestamp(),
  });

  return pageId;
};

export const deletePage = async (uid, kidId, page) => {
  if (page.imagePath) await deletePageImage(page.imagePath);
  await deleteDoc(pageRef(uid, kidId, page.id));
};
