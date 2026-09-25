/* ------------------------------------------------------------------ */
/*  My Reading Buddy: photos in, voices in                             */
/* ------------------------------------------------------------------ */

import { pickAudioType, shrinkTo } from "./book";

// Phone photos run 4000px and several megabytes. A spread on an iPad
// screen never needs more than this, and a smaller file turns the page
// faster on a slow connection.
const MAX_EDGE = 2400;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read ${file.name || "that photo"}. Try a JPEG or PNG.`));
    };
    img.src = url;
  });

// Downscale a photo to a JPEG. Browsers apply the camera's EXIF rotation
// when drawing an <img>, so a sideways phone photo comes out upright.
export const shrinkImage = async (file) => {
  const { img, url } = await loadImage(file);
  try {
    const { w, h } = shrinkTo(img.naturalWidth, img.naturalHeight, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // a transparent PNG would otherwise go black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.86)
    );
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const canRecord = () =>
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

export const openMic = () =>
  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

export const closeMic = (stream) => stream?.getTracks().forEach((t) => t.stop());

// One take. start() begins recording; stop() resolves with the audio and
// how long it ran. Duration is measured here because some browsers write
// recordings whose own duration reads as Infinity until fully played.
export const startTake = (stream) => {
  const mimeType = pickAudioType((t) => window.MediaRecorder.isTypeSupported(t));
  const rec = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const began = performance.now();
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const done = new Promise((resolve, reject) => {
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || chunks[0]?.type || "audio/mp4";
      resolve({ blob: new Blob(chunks, { type }), secs: (performance.now() - began) / 1000 });
    };
    rec.onerror = (e) => reject(e.error || new Error("The recording stopped unexpectedly."));
  });
  // A timeslice makes the browser hand over data as it goes, so a long
  // reading doesn't sit in one buffer until the end.
  rec.start(1000);
  return {
    stop: () => {
      if (rec.state !== "inactive") rec.stop();
      return done;
    },
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
    },
  };
};

// Keep the screen awake while a story reads itself. Best effort: not every
// browser has it, and it's released whenever the tab is hidden.
export const keepAwake = async () => {
  try {
    return (await navigator.wakeLock?.request("screen")) || null;
  } catch (e) {
    return null;
  }
};
