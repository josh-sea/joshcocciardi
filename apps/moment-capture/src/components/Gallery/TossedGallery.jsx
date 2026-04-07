import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { getTossedVideos, updateVideoStatus, deleteVideo } from '../../services/firestore.service';
import { deleteVideo as deleteVideoStorage } from '../../services/storage.service';
import VideoThumbnail from './VideoThumbnail';
import LoadingSpinner from '../Layout/LoadingSpinner';

const TossedGallery = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    loadTossedVideos();
  }, [currentProject]);

  const loadTossedVideos = async () => {
    if (!currentProject || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const tossedVideos = await getTossedVideos(currentProject.id);
      setVideos(tossedVideos);
    } catch (err) {
      console.error('Error loading tossed videos:', err);
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (video) => {
    try {
      await updateVideoStatus(video.id, 'kept', new Date());
      setVideos(videos.filter(v => v.id !== video.id));
      setSelectedVideo(null);
    } catch (error) {
      console.error('Error restoring video:', error);
      alert('Failed to restore video');
    }
  };

  const handleDelete = async (video) => {
    try {
      // Delete from storage
      await deleteVideoStorage(video.storagePath);
      // Delete from Firestore
      await deleteVideo(video.id);
      setVideos(videos.filter(v => v.id !== video.id));
      setSelectedVideo(null);
    } catch (error) {
      console.error('Error deleting video:', error);
      alert('Failed to delete video');
    }
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="xl" message="Loading tossed videos..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">{error}</p>
          <button
            onClick={loadTossedVideos}
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🗑️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Tossed Videos</h2>
          <p className="text-gray-600">Videos you toss will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Tossed Videos</h1>
          <p className="text-gray-600 mt-2">{videos.length} video{videos.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Grid of videos */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {videos.map((video) => (
            <VideoThumbnail
              key={video.id}
              video={video}
              onClick={() => setSelectedVideo(video)}
              showActions={true}
              gallery={'tossed'}
              onRestore={() => handleRestore(video)}
              onDelete={() => handleDelete(video)}
            />
          ))}
        </div>
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div 
            className="relative max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <video
              src={selectedVideo.downloadUrl}
              controls
              autoPlay
              loop
              className="w-full rounded-lg"
            />
            <div className="mt-4 flex justify-center space-x-4">
              <button
                onClick={() => handleRestore(selectedVideo)}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Restore to Kept
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Permanently delete this video? This cannot be undone.')) {
                    handleDelete(selectedVideo);
                  }
                }}
                className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TossedGallery;