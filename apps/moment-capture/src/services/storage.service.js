import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';
import { storage } from './firebase';

// Upload video with progress tracking
export const uploadVideo = (file, storagePath, onProgress) => {
  const storageRef = ref(storage, storagePath);
  
  // Set metadata with proper content type
  const metadata = {
    contentType: file.type || 'video/webm',
    customMetadata: {
      uploadedAt: new Date().toISOString()
    }
  };
  
  const uploadTask = uploadBytesResumable(storageRef, file, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(progress);
        }
      },
      (error) => {
        console.error('Upload error:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            storagePath,
            downloadURL,
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};

// Get download URL for a video
export const getVideoURL = async (storagePath) => {
  try {
    const storageRef = ref(storage, storagePath);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (error) {
    console.error('Get video URL error:', error);
    throw error;
  }
};

// Delete video from storage
export const deleteVideo = async (storagePath) => {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Delete video error:', error);
    throw error;
  }
};

// List all videos in a project
export const listProjectVideos = async (userId, projectId) => {
  try {
    const listRef = ref(storage, `users/${userId}/projects/${projectId}/videos`);
    const result = await listAll(listRef);
    
    const videos = await Promise.all(
      result.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          path: itemRef.fullPath,
          url,
          name: itemRef.name,
        };
      })
    );
    
    return videos;
  } catch (error) {
    console.error('List videos error:', error);
    throw error;
  }
};

// Upload thumbnail (optional)
export const uploadThumbnail = async (file, userId, projectId, videoId) => {
  try {
    const storagePath = `users/${userId}/projects/${projectId}/thumbnails/${videoId}.jpg`;
    const storageRef = ref(storage, storagePath);
    
    await uploadBytesResumable(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    
    return {
      storagePath,
      downloadURL,
    };
  } catch (error) {
    console.error('Upload thumbnail error:', error);
    throw error;
  }
};