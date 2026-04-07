import React, { useState, useRef, useEffect } from 'react';
import { convertToMP4 } from '../../utils/videoProcessing';

const VideoRecorder = ({ stream, duration = 2, onRecordingComplete, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionError, setConversionError] = useState(null);
  const [previewMuted, setPreviewMuted] = useState(true);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const videoPreviewRef = useRef(null);

  const togglePreviewMute = () => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.muted = !videoPreviewRef.current.muted;
      setPreviewMuted(videoPreviewRef.current.muted);
    }
  };

  const startCountdown = () => {
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          startRecording();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    setConversionError(null);

    // Debug: log track info so we can confirm audio is in the stream
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`[VideoRecorder] Stream tracks — video: ${videoTracks.length}, audio: ${audioTracks.length}`);
    if (audioTracks.length === 0) {
      console.warn('[VideoRecorder] ⚠️ No audio tracks found! Check microphone permission and useCamera audio:true setting.');
    } else {
      console.log('[VideoRecorder] ✅ Audio track:', audioTracks[0].label, '| enabled:', audioTracks[0].enabled);
    }

    try {
      // Record as WebM with audio (best browser support) — will convert to MP4 after
      let mimeType = 'video/webm';
      let options = {};

      const supportedTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];

      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          options = { mimeType: type };
          console.log('Recording with MIME type:', type);
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const webmBlob = new Blob(chunksRef.current, { type: mimeType });
        setIsRecording(false);
        setIsConverting(true);
        setConversionProgress(0);

        try {
          console.log('Converting WebM to MP4...');
          const mp4Blob = await convertToMP4(webmBlob, (progress) => {
            setConversionProgress(progress);
          });

          const url = URL.createObjectURL(mp4Blob);
          setRecordedBlob(mp4Blob);
          setPreviewUrl(url);
        } catch (error) {
          console.error('MP4 conversion failed, falling back to WebM:', error);
          setConversionError('Conversion failed — using WebM format instead.');
          // Graceful fallback: use original WebM blob
          const url = URL.createObjectURL(webmBlob);
          setRecordedBlob(webmBlob);
          setPreviewUrl(url);
        } finally {
          setIsConverting(false);
          setConversionProgress(0);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);

      // Auto-stop after duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, duration * 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please try again.');
    }
  };

  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setRecordedBlob(null);
    setPreviewUrl(null);
    setCountdown(null);
    setConversionError(null);
  };

  const handleConfirm = () => {
    if (recordedBlob && onRecordingComplete) {
      onRecordingComplete(recordedBlob);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ── Converting overlay ──────────────────────────────────────────────────────
  if (isConverting) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 px-8">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl font-bold text-white mb-1">Converting to MP4…</p>
          <p className="text-sm text-gray-400">Optimising for playback & storage</p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Progress</span>
            <span>{conversionProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${conversionProgress}%` }}
            ></div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center">
          This usually takes a few seconds
        </p>
      </div>
    );
  }

  // ── Preview + confirm ───────────────────────────────────────────────────────
  if (recordedBlob && previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="relative w-full max-w-md">
          <video
            ref={videoPreviewRef}
            src={previewUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full rounded-lg shadow-lg"
          />
          {/* Format badge */}
          <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded">
            {recordedBlob.type === 'video/mp4' ? '✓ MP4' : 'WebM'}
          </span>
          {/* Mute/Unmute toggle */}
          <button
            onClick={togglePreviewMute}
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
            title={previewMuted ? 'Unmute preview' : 'Mute preview'}
          >
            {previewMuted ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
        </div>

        {conversionError && (
          <p className="text-yellow-400 text-xs mt-2 text-center">{conversionError}</p>
        )}

        <div className="flex space-x-4 mt-6">
          <button
            onClick={handleRetake}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Retake
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Use This
          </button>
        </div>
      </div>
    );
  }

  // ── Recording indicator ─────────────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-600 rounded-full animate-pulse mx-auto mb-4"></div>
          <p className="text-xl font-bold text-white">Recording…</p>
        </div>
      </div>
    );
  }

  // ── Countdown ───────────────────────────────────────────────────────────────
  if (countdown !== null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-9xl font-bold text-white animate-pulse">
          {countdown}
        </div>
      </div>
    );
  }

  // ── Start button ────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center h-full">
      <button
        onClick={startCountdown}
        className="px-8 py-4 bg-blue-600 text-white text-lg rounded-full font-medium hover:bg-blue-700 transition-colors shadow-lg"
      >
        Start Recording ({duration}s)
      </button>
    </div>
  );
};

export default VideoRecorder;
