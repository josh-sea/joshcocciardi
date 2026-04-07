import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import useCamera from '../../hooks/useCamera';
import useFirebaseStorage from '../../hooks/useFirebaseStorage';
import { createVideo } from '../../services/firestore.service';
import LoadingSpinner from '../Layout/LoadingSpinner';

const CameraCapture = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProject } = useProject();
  const { stream, error, isLoading, videoRef, startCamera, stopCamera, switchCamera } = useCamera();
  const { uploading, uploadProgress, upload } = useFirebaseStorage();

  const [duration, setDuration] = useState(2);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0); // 0–100
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const progressIntervalRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (currentProject) {
      setDuration(currentProject.videoDuration || 2);
    }
  }, [currentProject]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      clearInterval(progressIntervalRef.current);
      clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Keep the video element's srcObject in sync with the stream state.
  // useCamera sets srcObject during startCamera(), but if the video element
  // isn't mounted yet (or re-mounts), we need to re-attach here.
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showToast = (type, message) => {
    setToast({ type, message });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const startRecording = () => {
    if (!stream || isRecording) return;

    chunksRef.current = [];

    // Pick the best supported MIME type
    const supportedTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    let options = {};
    let mimeType = 'video/webm';
    for (const type of supportedTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        options = { mimeType: type };
        break;
      }
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setRecordProgress(0);
        clearInterval(progressIntervalRef.current);

        // For 1-3s clips, skip MP4 conversion — upload WebM directly.
        // WebM is tiny at this duration and plays fine in all modern browsers.
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (!currentProject || !user) {
          showToast('error', 'No project selected');
          return;
        }

        try {
          const videoId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const storagePath = `users/${user.uid}/projects/${currentProject.id}/videos/${videoId}.${extension}`;

          const downloadURL = await upload(blob, storagePath);

          await createVideo({
            projectId: currentProject.id,
            userId: user.uid,
            storagePath,
            downloadUrl: downloadURL,
            duration,
            status: 'pending',
            capturedAt: new Date(),
          });

          showToast('success', `${duration}s clip saved ✓`);
        } catch (err) {
          console.error('Error saving video:', err);
          showToast('error', 'Failed to save — try again');
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // collect data every 100ms
      setIsRecording(true);
      setRecordProgress(0);

      // Smooth progress bar
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / (duration * 1000)) * 100, 100);
        setRecordProgress(pct);
      }, 50);

      // Auto-stop after duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, duration * 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      showToast('error', 'Could not start recording');
    }
  };

  // ── No project ──────────────────────────────────────────────────────────────
  if (!currentProject) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">Please select a project first</p>
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

  // ── Camera loading / error ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="xl" message="Starting camera..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-xl mb-4">Camera Error: {error}</p>
          <button onClick={startCamera} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col">

      {/* Live camera feed — always visible, fills screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* ── Recording progress bar (top edge) ── */}
      {isRecording && (
        <div className="absolute top-0 left-0 right-0 h-1.5 z-20 bg-black/30">
          <div
            className="h-full bg-red-500"
            style={{ width: `${recordProgress}%`, transition: 'width 50ms linear' }}
          />
        </div>
      )}

      {/* ── REC badge ── */}
      {isRecording && (
        <div className="absolute top-4 left-4 z-20 flex items-center space-x-1.5 bg-black/50 rounded-full px-3 py-1">
          <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white text-sm font-semibold tracking-wide">REC</span>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={`absolute top-6 left-1/2 -translate-x-1/2 z-30 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg whitespace-nowrap ${
            toast.type === 'success'
              ? 'bg-green-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ── Uploading overlay ── */}
      {uploading && (
        <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="text-white mt-4 font-medium">Uploading…</p>
          <div className="w-48 bg-gray-700 rounded-full h-2 mt-3">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm mt-1">{Math.round(uploadProgress)}%</p>
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-28 px-6">

        {/* Duration selector */}
        <div className="flex justify-center mb-6">
          <div className="flex bg-black/50 rounded-full p-1 space-x-1">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => !isRecording && setDuration(s)}
                disabled={isRecording}
                className={`w-12 h-8 rounded-full text-sm font-semibold transition-all ${
                  duration === s
                    ? 'bg-white text-black'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        {/* Capture button row */}
        <div className="flex items-center justify-center relative">
          {/* Switch camera — left */}
          <button
            onClick={switchCamera}
            disabled={isRecording}
            className="absolute left-0 p-3 bg-black/50 rounded-full text-white disabled:opacity-40 transition-opacity"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Record button */}
          <button
            onClick={startRecording}
            disabled={isRecording || uploading}
            className={`w-20 h-20 rounded-full border-4 transition-all active:scale-95 disabled:opacity-60 ${
              isRecording
                ? 'border-red-400 bg-red-600 scale-95'
                : 'border-white bg-red-500 hover:bg-red-600'
            }`}
          >
            <span className="sr-only">Record</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;
