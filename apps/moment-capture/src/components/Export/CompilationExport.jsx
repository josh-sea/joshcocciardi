import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { getKeptVideos } from '../../services/firestore.service';
import LoadingSpinner from '../Layout/LoadingSpinner';

const CompilationExport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadKeptVideos();
  }, [currentProject]);

  const loadKeptVideos = async () => {
    if (!currentProject || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const keptVideos = await getKeptVideos(currentProject.id);
      setVideos(keptVideos);
    } catch (err) {
      console.error('Error loading kept videos:', err);
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = async (video) => {
    try {
      const response = await fetch(video.downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moment-${new Date(video.capturedAt.toDate()).toISOString()}.webm`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
      alert('Failed to download video');
    }
  };

  const downloadAll = async () => {
    setDownloading(true);
    for (const video of videos) {
      await downloadVideo(video);
      // Add delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setDownloading(false);
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
            onClick={loadKeptVideos}
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
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Videos to Export</h2>
          <p className="text-gray-600 mb-6">Keep some videos first</p>
          <button
            onClick={() => navigate('/review')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Review Videos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Export Videos</h1>
          <p className="text-gray-600 mt-2">
            {videos.length} kept video{videos.length !== 1 ? 's' : ''} ready to export
          </p>
        </div>

        {/* Export Options */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Download Options</h2>
          
          <div className="space-y-4">
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? 'Downloading...' : `Download All Videos (${videos.length})`}
            </button>

            <div className="text-center text-sm text-gray-500">
              <p>Videos will be downloaded individually as WebM files</p>
              <p className="mt-2">
                Total duration: ~{videos.reduce((sum, v) => sum + v.duration, 0)} seconds
              </p>
            </div>
          </div>
        </div>

        {/* Video List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Video List</h2>
            
            <div className="space-y-3">
              {videos.map((video, index) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-4">
                    <div className="text-gray-500 font-mono text-sm">
                      #{(index + 1).toString().padStart(2, '0')}
                    </div>
                    <video
                      src={video.downloadUrl}
                      className="w-24 h-16 object-cover rounded"
                      muted
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(video.capturedAt.toDate()).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      <p className="text-xs text-gray-500">{video.duration}s duration</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => downloadVideo(video)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                About Video Export
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  Videos are exported in WebM format. You can use video editing software to combine them into a single compilation.
                  Popular free options include: DaVinci Resolve, OpenShot, or Shotcut.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompilationExport;