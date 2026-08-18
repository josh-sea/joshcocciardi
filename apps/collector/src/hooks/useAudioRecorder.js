import { useCallback, useRef, useState } from 'react';

// Minimal mic recorder built on MediaRecorder. Returns the recorded audio as a
// Blob for the AI layer to transcribe. In preview mode the blob isn't sent
// anywhere — the recorder is here so the voice UX feels real while you review.
export const useAudioRecorder = () => {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const start = useCallback(async () => {
    setError('');
    setBlob(null);
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access was blocked. Allow it in your browser settings, or type instead.');
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setSeconds(0);
    setError('');
  }, []);

  return { recording, blob, seconds, error, start, stop, reset, supported: typeof MediaRecorder !== 'undefined' };
};
