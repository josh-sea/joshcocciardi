import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ========== PROJECT OPERATIONS ==========

// Create a new project
export const createProject = async (userId, projectData) => {
  try {
    const projectRef = doc(collection(db, 'projects'));
    const project = {
      userId,
      name: projectData.name,
      description: projectData.description || '',
      videoDuration: projectData.videoDuration || 2,
      videoCount: 0,
      keptCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(projectRef, project);
    return { id: projectRef.id, ...project };
  } catch (error) {
    console.error('Create project error:', error);
    throw error;
  }
};

// Get all projects for a user
export const getUserProjects = async (userId) => {
  try {
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const projects = [];
    querySnapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() });
    });
    
    return projects;
  } catch (error) {
    console.error('Get user projects error:', error);
    throw error;
  }
};

// Get a single project
export const getProject = async (projectId) => {
  try {
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    if (projectDoc.exists()) {
      return { id: projectDoc.id, ...projectDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Get project error:', error);
    throw error;
  }
};

// Update project
export const updateProject = async (projectId, updates) => {
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Update project error:', error);
    throw error;
  }
};

// Delete project and all associated videos
export const deleteProject = async (projectId) => {
  try {
    // Delete all videos in the project
    const videosQuery = query(
      collection(db, 'videos'),
      where('projectId', '==', projectId)
    );
    const videosSnapshot = await getDocs(videosQuery);
    
    const batch = writeBatch(db);
    videosSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete the project
    batch.delete(doc(db, 'projects', projectId));
    
    await batch.commit();
  } catch (error) {
    console.error('Delete project error:', error);
    throw error;
  }
};

// ========== VIDEO OPERATIONS ==========

// Create a new video
export const createVideo = async (videoData) => {
  try {
    const videoRef = doc(collection(db, 'videos'));
    const video = {
      projectId: videoData.projectId,
      userId: videoData.userId,
      storagePath: videoData.storagePath,
      downloadUrl: videoData.downloadUrl,
      thumbnailUrl: videoData.thumbnailUrl || null,
      duration: videoData.duration,
      status: 'pending',
      capturedAt: serverTimestamp(),
      reviewedAt: null,
      order: null,
    };
    
    await setDoc(videoRef, video);
    
    // Update project video count
    const projectRef = doc(db, 'projects', videoData.projectId);
    const projectDoc = await getDoc(projectRef);
    if (projectDoc.exists()) {
      const currentCount = projectDoc.data().videoCount || 0;
      await updateDoc(projectRef, {
        videoCount: currentCount + 1,
        updatedAt: serverTimestamp(),
      });
    }
    
    return { id: videoRef.id, ...video };
  } catch (error) {
    console.error('Create video error:', error);
    throw error;
  }
};

// Get videos by status for a project
export const getProjectVideos = async (projectId, status = null, limitCount = 100) => {
  try {
    let q;
    if (status) {
      q = query(
        collection(db, 'videos'),
        where('projectId', '==', projectId),
        where('status', '==', status),
        orderBy('capturedAt', 'desc'),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, 'videos'),
        where('projectId', '==', projectId),
        orderBy('capturedAt', 'desc'),
        limit(limitCount)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const videos = [];
    querySnapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    
    return videos;
  } catch (error) {
    console.error('Get project videos error:', error);
    throw error;
  }
};

// Get pending videos for review
export const getPendingVideos = async (projectId, limitCount = 20) => {
  return getProjectVideos(projectId, 'pending', limitCount);
};

// Get tossed videos
export const getTossedVideos = async (projectId, limitCount = 100) => {
  return getProjectVideos(projectId, 'tossed', limitCount);
};

// Update video status (keep/toss)
export const updateVideoStatus = async (videoId, status, order = null) => {
  try {
    const updates = {
      status,
      reviewedAt: serverTimestamp(),
    };
    
    if (order !== null) {
      updates.order = order;
    }
    
    await updateDoc(doc(db, 'videos', videoId), updates);
    
    // Update project kept count if keeping
    if (status === 'kept') {
      const videoDoc = await getDoc(doc(db, 'videos', videoId));
      if (videoDoc.exists()) {
        const projectId = videoDoc.data().projectId;
        const projectRef = doc(db, 'projects', projectId);
        const projectDoc = await getDoc(projectRef);
        if (projectDoc.exists()) {
          const currentCount = projectDoc.data().keptCount || 0;
          await updateDoc(projectRef, {
            keptCount: currentCount + 1,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  } catch (error) {
    console.error('Update video status error:', error);
    throw error;
  }
};

// Batch update video statuses
export const batchUpdateVideoStatuses = async (videoUpdates) => {
  try {
    const batch = writeBatch(db);
    
    videoUpdates.forEach(({ videoId, status, order }) => {
      const videoRef = doc(db, 'videos', videoId);
      const updates = {
        status,
        reviewedAt: serverTimestamp(),
      };
      if (order !== null) {
        updates.order = order;
      }
      batch.update(videoRef, updates);
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Batch update video statuses error:', error);
    throw error;
  }
};

// Delete video
export const deleteVideo = async (videoId) => {
  try {
    await deleteDoc(doc(db, 'videos', videoId));
  } catch (error) {
    console.error('Delete video error:', error);
    throw error;
  }
};

// Get kept videos in order
export const getKeptVideos = async (projectId) => {
  try {
    const q = query(
      collection(db, 'videos'),
      where('projectId', '==', projectId),
      where('status', '==', 'kept'),
      orderBy('order', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const videos = [];
    querySnapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    
    return videos;
  } catch (error) {
    console.error('Get kept videos error:', error);
    throw error;
  }
};

// Reorder kept videos
export const reorderKeptVideos = async (videoIds) => {
  try {
    const batch = writeBatch(db);
    
    videoIds.forEach((videoId, index) => {
      const videoRef = doc(db, 'videos', videoId);
      batch.update(videoRef, { order: index });
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Reorder kept videos error:', error);
    throw error;
  }
};