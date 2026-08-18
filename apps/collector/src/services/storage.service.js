import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';

// Item photos live under collector/{shopId}/... so both shop members can read
// them (the storage rules check shop membership). Files are namespaced by
// item id, with a random suffix so multiple photos on one item don't collide.
const photoPath = (shopId, itemId, file) => {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  return `collector/${shopId}/${itemId}/${Date.now()}-${rand}.${ext}`;
};

export const uploadItemPhoto = async (shopId, itemId, file) => {
  const path = photoPath(shopId, itemId, file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg',
  });
  const url = await getDownloadURL(storageRef);
  return { path, url };
};

export const deleteItemPhoto = async (path) => {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    // A missing file is fine — the goal is that it's gone.
    if (err?.code !== 'storage/object-not-found') throw err;
  }
};
