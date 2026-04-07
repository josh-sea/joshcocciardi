import { useState, useEffect, useRef } from 'react';

const useCamera = () => {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' or 'environment'
  const videoRef = useRef(null);

  const startCamera = async (mode = facingMode) => {
    setIsLoading(true);
    setError(null);

    try {
      // Stop existing stream if any
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Request camera access with audio
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      setStream(mediaStream);
      setFacingMode(mode);

      // Attach stream to video element if ref exists
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setIsLoading(false);
      return mediaStream;
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(err.message || 'Failed to access camera');
      setIsLoading(false);
      throw err;
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const switchCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    await startCamera(newMode);
  };

  const capturePhoto = () => {
    if (!videoRef.current) {
      throw new Error('Video element not available');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(videoRef.current, 0, 0);
    
    return canvas.toDataURL('image/jpeg');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return {
    stream,
    error,
    isLoading,
    facingMode,
    videoRef,
    startCamera,
    stopCamera,
    switchCamera,
    capturePhoto
  };
};

export default useCamera;
