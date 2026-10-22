/* ------------------------------------------------------------------ */
/*  My Reading Buddy: pure helpers                                     */
/*                                                                     */
/*  No Firebase and no React in here, so test/readingbuddy.test.mjs    */
/*  can import it straight into node.                                  */
/* ------------------------------------------------------------------ */

// Recording formats, best first. MP4/AAC comes first because it is the one
// every browser can play back: a book recorded on a laptop in Chrome still
// has to play on the kids' iPad. WebM/Opus is the fallback for browsers that
// can only record that.
export const AUDIO_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

// The first type the recorder supports, or "" to let the browser choose.
export const pickAudioType = (isSupported) => {
  if (typeof isSupported !== "function") return "";
  return AUDIO_TYPES.find((t) => {
    try {
      return isSupported(t);
    } catch (e) {
      return false;
    }
  }) || "";
};

// "audio/webm;codecs=opus" → "audio/webm". Storage keeps the bare type.
export const baseType = (type) => String(type || "").split(";")[0].trim().toLowerCase();

export const extFor = (type) => {
  const t = baseType(type);
  if (t === "audio/mp4" || t === "audio/aac" || t === "audio/x-m4a") return "m4a";
  if (t === "audio/webm") return "webm";
  if (t === "audio/ogg") return "ogg";
  if (t === "audio/mpeg") return "mp3";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  return "bin";
};

// 83 → "1:23"
export const clock = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Largest box with the spread's aspect ratio that fits the space given.
export const fitBox = (maxW, maxH, ratio) => {
  const r = ratio > 0 && Number.isFinite(ratio) ? ratio : 1.4;
  const W = Math.max(0, maxW);
  const H = Math.max(0, maxH);
  if (!W || !H) return { width: 0, height: 0 };
  const width = Math.min(W, H * r);
  return { width: Math.floor(width), height: Math.floor(width / r) };
};

// Scale an image so its long edge is at most `max`, never enlarging it.
export const shrinkTo = (w, h, max) => {
  const long = Math.max(w, h);
  if (!long || long <= max) return { w: Math.round(w), h: Math.round(h) };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
};

export const ratioOf = (page) => {
  const w = page?.image?.w;
  const h = page?.image?.h;
  return w > 0 && h > 0 ? w / h : 1.4;
};

export const hasAudio = (page) => !!page?.audio?.url;

// How far along the recording is: pages with a voice out of all pages.
export const recordedCount = (pages) => (pages || []).filter(hasAudio).length;

// Where the recorder should open: the first page with no voice yet, else
// the start.
export const firstUnrecorded = (pages) => {
  const i = (pages || []).findIndex((p) => !hasAudio(p));
  return i < 0 ? 0 : i;
};

// A book shows on the kids' shelf once it has at least one page.
export const isReadable = (book) => Array.isArray(book?.pages) && book.pages.length > 0;

export const coverOf = (book) => (isReadable(book) ? book.pages[0].image?.url || null : null);

// Move one page up (-1) or down (+1). Returns a new array, or the same one
// when the move would fall off either end.
export const movePage = (pages, id, delta) => {
  const i = pages.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= pages.length) return pages;
  const next = [...pages];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

export const removePage = (pages, id) => pages.filter((p) => p.id !== id);

export const setPageAudio = (pages, id, audio) => pages.map((p) => (p.id === id ? { ...p, audio } : p));

// Keep an index on the page after the pages change underneath it.
export const clampIndex = (i, length) => (length <= 0 ? 0 : Math.min(Math.max(0, i), length - 1));

// Which way a page turn goes, or 0 when there's nowhere to go.
export const turnDir = (from, to, length) => {
  if (to === from || to < 0 || to >= length) return 0;
  return to > from ? 1 : -1;
};

// Short random ids for pages and file names. Not secret on their own: the
// shelf and book ids in the storage path are Firestore auto-ids.
export const newId = () => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
};

// Files from a photo picker, in a predictable order. Pickers hand files back
// in the order they were tapped, which is usually page order already; scans
// saved as "page 2.jpg", "page 10.jpg" sort by their numbers when every file
// has one.
export const orderFiles = (files) => {
  const list = Array.from(files || []);
  const num = (f) => {
    const m = String(f.name || "").match(/(\d+)(?!.*\d)/);
    return m ? Number(m[1]) : null;
  };
  if (list.length > 1 && list.every((f) => num(f) !== null)) {
    return [...list].sort((a, b) => num(a) - num(b));
  }
  return list;
};

/* ------------------------------------------------------------------ */
/*  Video export                                                       */
/* ------------------------------------------------------------------ */

// Video formats, best first. MP4 (H.264 + AAC) is what a phone's Photos app
// saves and what any messaging app plays; Safari and current Chrome can
// record it. WebM is the fallback for browsers that can't.
export const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const pickVideoType = (isSupported) => {
  if (typeof isSupported !== "function") return "";
  return (
    VIDEO_TYPES.find((t) => {
      try {
        return isSupported(t);
      } catch (e) {
        return false;
      }
    }) || ""
  );
};

export const videoExt = (type) => (baseType(type) === "video/mp4" ? "mp4" : "webm");

// "Goodnight Moon - read by Bodhi.mp4", with characters phones and
// Windows refuse in file names taken out.
export const videoFileName = (book, type) => {
  const clean = (s) =>
    String(s || "")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const title = clean(book?.title) || "My book";
  const by = clean(book?.readBy);
  return `${by ? `${title} - read by ${by}` : title}.${videoExt(type)}`;
};

// How long each part of the video lasts, in seconds.
export const VIDEO_TIMING = {
  title: 2.5, // the cover card
  lead: 0.6, // a beat on each page before the voice starts
  tail: 0.8, // and after it ends, before the page turns
  silent: 3, // a page nobody recorded
  flip: 1.1, // one page turn
  end: 2.5, // "The End"
};

/* The whole video as a list of back-to-back segments:
     title → page 0 → flip 0→1 → page 1 → … → page n-1 → end
   `durations[i]` is page i's recording length in seconds, or 0/null for a
   page with no voice. Each page segment carries `voiceAt`, when its
   recording starts on the video clock. */
export const buildTimeline = (durations, timing = VIDEO_TIMING) => {
  const segs = [];
  let t = 0;
  const push = (seg) => {
    segs.push({ ...seg, start: t });
    t += seg.dur;
  };
  push({ kind: "title", dur: timing.title });
  durations.forEach((d, i) => {
    if (i > 0) push({ kind: "flip", from: i - 1, to: i, dur: timing.flip });
    const voice = d > 0 ? d : 0;
    const dur = voice ? timing.lead + voice + timing.tail : timing.silent;
    push({ kind: "page", index: i, dur, voiceAt: voice ? t + timing.lead : null, voice });
  });
  push({ kind: "end", dur: timing.end });
  return { segments: segs, total: t };
};

// The segment showing at time t, and how far through it (0..1).
export const segmentAt = (timeline, t) => {
  const { segments } = timeline;
  if (!segments.length) return null;
  let seg = segments[segments.length - 1];
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (t < s.start + s.dur) {
      seg = s;
      break;
    }
  }
  const p = seg.dur > 0 ? (t - seg.start) / seg.dur : 1;
  return { seg, p: Math.min(1, Math.max(0, p)) };
};

// Slow in, slow out, like a hand turning a page.
export const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/* The turning page drawn as vertical strips, for a 2D canvas that can't do
   3D transforms. The leaf is hinged at the spine (x = 0 here) and is `w`
   wide. At angle 0 it lies flat to the right; at π it lies flat to the
   left. Each strip at fraction u from the spine sits at x = u·w·cos θ and
   rises toward the viewer by z = u·w·sin θ, so with a camera `dist` away
   it is drawn scaled by dist / (dist − z): the lifted edge looks closer
   and taller, which is what reads as a page turning.

   Returns strips in source order with projected x (left edge), width and
   scale, plus which face is showing (front until the leaf passes upright). */
export const leafStrips = (theta, w, n = 40, dist = 3) => {
  const D = dist * w;
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const project = (u) => {
    const z = u * w * sn;
    const s = D / (D - z);
    return { x: u * w * c * s, s };
  };
  const strips = [];
  for (let k = 0; k < n; k += 1) {
    const a = project(k / n);
    const b = project((k + 1) / n);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    strips.push({ k, u0: k / n, u1: (k + 1) / n, x: left, width: right - left, scale: (a.s + b.s) / 2 });
  }
  return { strips, face: c >= 0 ? "front" : "back" };
};

// Largest rectangle of the given ratio centered in a W×H frame, leaving
// `pad` around it.
export const fitRect = (W, H, ratio, pad = 0) => {
  const box = fitBox(W - 2 * pad, H - 2 * pad, ratio);
  return { x: Math.round((W - box.width) / 2), y: Math.round((H - box.height) / 2), w: box.width, h: box.height };
};
