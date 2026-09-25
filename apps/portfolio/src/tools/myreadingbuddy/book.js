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
