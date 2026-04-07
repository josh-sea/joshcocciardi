import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { getPendingVideos, updateVideoStatus } from '../../services/firestore.service';
import SwipeCards from './SwipeCards';
import LoadingSpinner from '../Layout/LoadingSpinner';

const ReviewQueue = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPendingVideos();
  }, [currentProject]);

  const loadPendingVideos = async () => {
    if (!currentProject || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const pendingVideos = await getPendingVideos(currentProject.id);
      setVideos(pendingVideos);
    } catch (err) {
      console.error('Error loading pending videos:', err);
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const handleKeep = async (video) => {
    try {
      await updateVideoStatus(video.id, 'kept', new Date());
      // Video will be removed from the view by SwipeCards component
    } catch (error) {
      console.error('Error keeping video:', error);
      throw error;
    }
  };

  const handleToss = async (video) => {
    try {
      await updateVideoStatus(video.id, 'tossed', new Date());
      // Video will be removed from the view by SwipeCards component
    } catch (error) {
      console.error('Error tossing video:', error);
      throw error;
    }
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <p className="text-gray-700 text-xl mb-4">Please select a project first</p>
          <button
            onClick={() => navigate('/projects')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <LoadingSpinner size="xl" message="Loading videos..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">{error}</p>
          <button
            onClick={loadPendingVideos}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="text-6xl mb-4">📹</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Videos to Review</h2>
          <p className="text-gray-600 mb-6">Capture some moments to get started</p>
          <button
            onClick={() => navigate('/camera')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go to Camera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SwipeCards 
        videos={videos} 
        onKeep={handleKeep} 
        onToss={handleToss} 
      />
    </div>
  );
};

export default ReviewQueue;