// Client-side image downscaling so full-res phone photos (an iPhone shot is
// easily 5–12 MB) fit under the Storage rules' 5 MB image cap — without anyone
// touching their camera settings. We decode the file, scale the longest edge
// down, and re-encode as JPEG, dropping quality progressively until it's
// comfortably under the cap. EXIF orientation is respected so portrait photos
// don't come out sideways.

const DEFAULTS = {
  maxDimension: 1600, // longest edge, px — plenty for a card/memorabilia photo
  quality: 0.82,
  maxBytes: 4.5 * 1024 * 1024, // stay safely under the 5 MB rule
};

const loadBitmap = async (file) => {
  // createImageBitmap with imageOrientation:'from-image' both decodes and
  // applies EXIF rotation. Fall back to an <img> if it's unavailable.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
};

const sizeOf = (bitmap) => ({
  width: bitmap.width || bitmap.naturalWidth,
  height: bitmap.height || bitmap.naturalHeight,
});

const toBlob = (canvas, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export const compressImage = async (file, options = {}) => {
  const { maxDimension, quality, maxBytes } = { ...DEFAULTS, ...options };

  // Non-images (or already tiny files) pass through untouched.
  if (!file.type?.startsWith('image/')) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file; // couldn't decode — let the upload attempt the original
  }

  const { width, height } = sizeOf(bitmap);
  if (!width || !height) return file;

  // Progressive attempts: shrink and lower quality until under the cap.
  const attempts = [
    { scale: 1, q: quality },
    { scale: 1, q: 0.7 },
    { scale: 0.8, q: 0.7 },
    { scale: 0.65, q: 0.6 },
    { scale: 0.5, q: 0.55 },
  ];

  const longest = Math.max(width, height);
  let best = null;

  for (const { scale, q } of attempts) {
    const factor = Math.min(1, (maxDimension * scale) / longest);
    const w = Math.max(1, Math.round(width * factor));
    const h = Math.max(1, Math.round(height * factor));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await toBlob(canvas, q);
    if (!blob) continue;
    best = blob;
    if (blob.size <= maxBytes) break;
  }

  if (bitmap.close) bitmap.close();
  if (!best) return file;

  // If re-encoding somehow produced something bigger than the original
  // (rare, e.g. a small PNG), keep whichever is smaller.
  if (best.size >= file.size && file.size <= maxBytes) return file;

  const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
  return new File([best], name, { type: 'image/jpeg', lastModified: Date.now() });
};
