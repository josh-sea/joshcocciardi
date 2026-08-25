import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

// Original page photos live under the adult who owns them so the storage rules
// can gate them by uid:  workbook/{adultUid}/{kidId}/{pageId}/original.jpg
export const uploadPageImage = async (uid, kidId, pageId, file) => {
  const path = `workbook/${uid}/${kidId}/${pageId}/original.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return { path, url };
};

export const deletePageImage = async (path) => {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err;
  }
};

// Word-audio clips live in ONE shared, cross-user cache:
//   workbook/audio/{slug}.mp3
// Any signed-in user can read them (so every kid benefits from words other kids
// have already heard) and write a new one on a cache miss.
export const uploadWordAudio = async (slug, blob, contentType = 'audio/mpeg') => {
  const path = `workbook/audio/${slug}.mp3`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  const url = await getDownloadURL(storageRef);
  return { path, url };
};
