// Client-side image downscaling so full-res phone/tablet photos (an iPhone shot
// is easily 5–12 MB) fit under the Storage rules' 5 MB image cap — without
// anyone touching their camera settings. We decode, scale the longest edge
// down, and re-encode as JPEG, dropping quality progressively until it's
// comfortably under the cap. EXIF orientation is respected so portrait photos
// don't come out sideways. (Adapted from apps/collector/src/utils/image.js.)

const DEFAULTS = {
  maxDimension: 2000, // longest edge, px — workbook text needs a bit more detail than a card photo
  quality: 0.82,
  maxBytes: 4.5 * 1024 * 1024, // stay safely under the 5 MB rule
};

const loadBitmap = async (file) => {
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

  if (!file.type?.startsWith('image/')) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = sizeOf(bitmap);
  if (!width || !height) return file;

  const attempts = [
    { scale: 1, q: quality },
    { scale: 1, q: 0.72 },
    { scale: 0.85, q: 0.7 },
    { scale: 0.7, q: 0.62 },
    { scale: 0.55, q: 0.55 },
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
  if (best.size >= file.size && file.size <= maxBytes) return file;

  const name = `${(file.name || 'page').replace(/\.[^.]+$/, '')}.jpg`;
  return new File([best], name, { type: 'image/jpeg', lastModified: Date.now() });
};
