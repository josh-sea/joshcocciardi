import React, { useState } from 'react';
import useSwipeGesture from '../../hooks/useSwipeGesture';
import VideoCard from './VideoCard';

const SwipeCards = ({ videos, onKeep, onToss }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [removing, setRemoving] = useState(false);

  const handleSwipeLeft = async () => {
    if (removing || currentIndex >= videos.length) return;
    
    setRemoving(true);
    const currentVideo = videos[currentIndex];
    
    try {
      await onToss(currentVideo);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setRemoving(false);
      }, 300);
    } catch (error) {
      console.error('Error tossing video:', error);
      setRemoving(false);
    }
  };

  const handleSwipeRight = async () => {
    if (removing || currentIndex >= videos.length) return;
    
    setRemoving(true);
    const currentVideo = videos[currentIndex];
    
    try {
      await onKeep(currentVideo);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setRemoving(false);
      }, 300);
    } catch (error) {
      console.error('Error keeping video:', error);
      setRemoving(false);
    }
  };

  const { isDragging, dragOffset, handlers } = useSwipeGesture(
    handleSwipeLeft,
    handleSwipeRight,
    100
  );

  if (videos.length === 0 || currentIndex >= videos.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">All Done!</h2>
          <p className="text-gray-600">No more videos to review</p>
        </div>
      </div>
    );
  }

  // Show up to 3 cards in the stack
  const visibleCards = videos.slice(currentIndex, currentIndex + 3);

  return (
    <div className="relative w-full h-full" {...handlers}>
      {/* Instructions */}
      <div className="absolute top-4 left-0 right-0 z-10 flex justify-center">
        <div className="bg-white/90 backdrop-blur rounded-full px-6 py-2 shadow-lg">
          <p className="text-sm text-gray-700">
            Swipe right to <span className="text-green-600 font-semibold">Keep</span>
            {' • '}
            Swipe left to <span className="text-red-600 font-semibold">Toss</span>
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="absolute top-16 left-0 right-0 z-10 px-4">
        <div className="bg-gray-200 rounded-full h-2 max-w-md mx-auto">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / videos.length) * 100}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-600 mt-2">
          {currentIndex + 1} / {videos.length}
        </p>
      </div>

      {/* Card Stack */}
      <div className="relative w-full h-full pt-24">
        {visibleCards.map((video, index) => {
          const isTopCard = index === 0;
          const scale = 1 - (index * 0.05);
          const yOffset = index * 10;
          const zIndex = visibleCards.length - index;

          return (
            <VideoCard
              key={video.id}
              video={video}
              style={{
                zIndex,
                transform: `scale(${scale}) translateY(${yOffset}px)`,
                opacity: isTopCard ? 1 : 0.8,
                pointerEvents: isTopCard ? 'auto' : 'none'
              }}
              isDragging={isTopCard ? isDragging : false}
              dragOffset={isTopCard ? dragOffset : 0}
            />
          );
        })}
      </div>

      {/* Button controls for desktop */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center space-x-4 z-20">
        <button
          onClick={handleSwipeLeft}
          disabled={removing}
          className="w-16 h-16 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50"
        >
          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          onClick={handleSwipeRight}
          disabled={removing}
          className="w-16 h-16 bg-green-500 text-white rounded-full shadow-lg hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50"
        >
          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default SwipeCards;