/* Where Am I — pulling the coordinates out of a photo, where there are any.
 *
 * This is the "backlog" half of adding photos: a picture taken months ago
 * knows where it was taken, and asking the person to find it on a map again
 * is asking them to re-derive something the file already contains.
 *
 * It is best-effort by nature, and worth being honest about why:
 *
 *   iOS strips GPS from EXIF when a photo goes through a file input, and has
 *   since 16.4. iOS 17 added a control in the photo picker to allow it per
 *   share. So on an iPhone this usually returns nothing, and the live-GPS
 *   path is what actually works there.
 *
 *   Only JPEG is read here. An iPhone set to High Efficiency produces HEIC,
 *   whose metadata lives in a completely different container; the browser
 *   will still decode and display it, so the photo works, it just arrives
 *   without a location.
 *
 *   Plenty of images never had coordinates: screenshots, anything saved from
 *   a message, anything taken with location off.
 *
 * So every caller has to cope with null, and none of them should present
 * this as the way locations get set.
 *
 * Pure: takes bytes, returns a point or null. No DOM, no File, no network.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
const GPS_IFD = 0x8825;

// GPS IFD tags.
const LAT_REF = 1, LAT = 2, LNG_REF = 3, LNG = 4;

const RATIONAL = 5;
const ASCII = 2;

/* Find the Exif APP1 segment.
 *
 * Walking the marker chain rather than searching the bytes for "Exif",
 * because that string also occurs inside image data often enough to matter
 * and a false hit there reads as a garbage coordinate rather than as no
 * coordinate, which is the worse failure.
 */
function findExif(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return -1;
  let at = 2;
  while (at + 4 <= view.byteLength) {
    const marker = view.getUint16(at);
    if ((marker & 0xff00) !== 0xff00) return -1;      // out of step with the chain
    const size = view.getUint16(at + 2);
    if (size < 2) return -1;
    if (marker === APP1
      && at + 4 + 6 <= view.byteLength
      && view.getUint32(at + 4) === 0x45786966          // "Exif"
      && view.getUint16(at + 8) === 0x0000) {
      return at + 10;                                   // first byte of the TIFF header
    }
    // 0xFFDA is the start of scan: image data follows and there is no more
    // metadata to find.
    if (marker === 0xffda) return -1;
    at += 2 + size;
  }
  return -1;
}

const ratio = (view, at, little) => {
  const n = view.getUint32(at, little);
  const d = view.getUint32(at + 4, little);
  return d === 0 ? null : n / d;
};

/* Degrees, minutes and seconds to a decimal degree. Any of the three may be
 * fractional; a nonsense denominator anywhere makes the whole thing null
 * rather than a plausible wrong number.
 */
function dms(parts) {
  if (!parts || parts.length < 3 || parts.some((p) => p === null || !Number.isFinite(p))) return null;
  return parts[0] + parts[1] / 60 + parts[2] / 3600;
}

function readEntries(view, tiff, ifd, little) {
  const out = new Map();
  if (ifd + 2 > view.byteLength) return out;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > view.byteLength) break;
    out.set(view.getUint16(at, little), {
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      at: at + 8,
    });
  }
  return out;
}

/* A value of more than four bytes does not fit in the entry and is stored
 * elsewhere, with the entry holding an offset from the start of the TIFF
 * header. Three rationals are 24 bytes, so a coordinate is always out of
 * line; a single-character reference is one byte and always in line.
 */
const valueAt = (view, tiff, entry, little, width) =>
  (entry.count * width > 4 ? tiff + view.getUint32(entry.at, little) : entry.at);

export function gpsFromJpeg(buffer) {
  let view;
  try { view = new DataView(buffer); } catch { return null; }

  const tiff = findExif(view);
  if (tiff < 0 || tiff + 8 > view.byteLength) return null;

  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  const root = readEntries(view, tiff, ifd0, little);

  const pointer = root.get(GPS_IFD);
  if (!pointer) return null;
  const gps = readEntries(view, tiff, tiff + view.getUint32(pointer.at, little), little);

  const coord = (tag) => {
    const e = gps.get(tag);
    if (!e || e.type !== RATIONAL || e.count < 3) return null;
    const base = valueAt(view, tiff, e, little, 8);
    if (base + 24 > view.byteLength) return null;
    return dms([ratio(view, base, little), ratio(view, base + 8, little), ratio(view, base + 16, little)]);
  };

  const ref = (tag) => {
    const e = gps.get(tag);
    if (!e || e.type !== ASCII || e.count < 1) return '';
    const base = valueAt(view, tiff, e, little, 1);
    return base < view.byteLength ? String.fromCharCode(view.getUint8(base)).toUpperCase() : '';
  };

  const lat = coord(LAT);
  const lng = coord(LNG);
  if (lat === null || lng === null) return null;

  /* South and West are negative. Missing the reference entirely would put a
   * Florida photo in Asia, so an absent one is a failure rather than an
   * assumed northern hemisphere.
   */
  const latRef = ref(LAT_REF);
  const lngRef = ref(LNG_REF);
  /* Spelled out rather than `'NS'.includes(ref)`, which is true for the
   * empty string: a photo with no hemisphere tag at all then read as North
   * and East, putting this one 81 degrees the wrong way into China. A
   * confident wrong coordinate is far worse here than no coordinate.
   */
  if ((latRef !== 'N' && latRef !== 'S') || (lngRef !== 'E' && lngRef !== 'W')) return null;

  const out = {
    lat: latRef === 'S' ? -lat : lat,
    lng: lngRef === 'W' ? -lng : lng,
  };
  if (Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180) return null;
  return out;
}

/* The same thing from a File, which is what a file input hands over. Kept
 * beside the parser rather than in it so the parser stays testable on bytes.
 */
export async function gpsFromFile(file) {
  try {
    if (!file || !/jpe?g/i.test(file.type || '')) return null;
    // The metadata is at the front; there is no reason to read a 4MB photo
    // to find twenty bytes of it.
    const head = file.slice(0, 256 * 1024);
    return gpsFromJpeg(await head.arrayBuffer());
  } catch { return null; }
}
