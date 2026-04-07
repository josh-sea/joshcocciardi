import React, { useState, useRef } from 'react';

const VideoThumbnail = ({ video, onClick, showActions = false, onRestore, onDelete, gallery }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  const toggleMute = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative group">
      <div 
        className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden cursor-pointer"
        onClick={onClick}
      >
        <video
          ref={videoRef}
          src={video.downloadUrl}
          className="w-full h-full object-cover"
          playsInline
          loop
          onMouseEnter={(e) => {
            e.currentTarget.muted = true; // muted for hover autoplay policy
            e.currentTarget.play().catch(() => {});
            setIsPlaying(true);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
            setIsPlaying(false);
            setIsMuted(true);
          }}
        />
        
        {/* Play icon overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
        )}

        {/* Mute/Unmute toggle — visible while playing */}
        {isPlaying && (
          <button
            onClick={toggleMute}
            className="absolute bottom-2 right-2 z-10 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
        )}

        {/* Status badge */}
        {video.status && (
          <div className="absolute top-2 right-2">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              video.status === 'kept' 
                ? 'bg-green-500 text-white' 
                : video.status === 'tossed'
                ? 'bg-red-500 text-white'
                : 'bg-gray-500 text-white'
            }`}>
              {video.status}
            </span>
          </div>
        )}
      </div>

      {/* Video info */}
      <div className="mt-2">
        <p className="text-sm text-gray-600">{formatDate(video.capturedAt)}</p>
        <p className="text-xs text-gray-500">{video.duration}s</p>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="mt-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore(video);
              }}
              className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              {gallery === 'kept' ? 'Toss' : 'Restore'}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Are you sure you want to delete this video?')) {
                  onDelete(video);
                }
              }}
              className="flex-1 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoThumbnail;