import React, { useRef, useEffect, useState } from 'react';

const VideoCard = ({ video, style, isDragging, dragOffset, onSwipeLeft, onSwipeRight }) => {
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true; // start muted for autoplay policy
      videoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
      });
    }
    // Reset mute state on new video
    setIsMuted(true);
  }, [video]);

  const toggleMute = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const getSwipeIndicator = () => {
    if (!isDragging) return null;
    
    const threshold = 100;
    const opacity = Math.min(Math.abs(dragOffset) / threshold, 1);
    
    if (dragOffset > 50) {
      return (
        <div 
          className="absolute top-10 right-10 bg-green-500 text-white px-6 py-3 rounded-lg font-bold text-xl rotate-12"
          style={{ opacity }}
        >
          KEEP
        </div>
      );
    } else if (dragOffset < -50) {
      return (
        <div 
          className="absolute top-10 left-10 bg-red-500 text-white px-6 py-3 rounded-lg font-bold text-xl -rotate-12"
          style={{ opacity }}
        >
          TOSS
        </div>
      );
    }
    
    return null;
  };

  const getRotation = () => {
    if (!isDragging) return 0;
    return (dragOffset / 20);
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        ...style,
        transform: `translateX(${dragOffset}px) rotate(${getRotation()}deg)`,
        transition: isDragging ? 'none' : 'transform 0.3s ease-out'
      }}
    >
      <div className="relative w-full max-w-md h-[70vh] bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Video Player */}
        <video
          ref={videoRef}
          src={video.downloadUrl}
          loop
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Mute/Unmute Toggle */}
        <button
          onClick={toggleMute}
          className="absolute top-3 right-3 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
        
        {/* Swipe Indicators */}
        {getSwipeIndicator()}
        
        {/* Video Info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <p className="text-white text-sm">
            {new Date(video.capturedAt.toDate()).toLocaleDateString()}
          </p>
          <p className="text-gray-300 text-xs">
            {video.duration}s video
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;