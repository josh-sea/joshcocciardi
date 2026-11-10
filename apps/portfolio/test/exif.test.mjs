/* Where Am I — reading a photo's own coordinates.
 *
 * Byte parsing, so the tests build real JPEG headers rather than mocking the
 * parser's own view of them. Two failure modes are worth more than the rest:
 *
 *   a wrong answer beats no answer, badly. Missing the S/W reference puts a
 *   Florida photo in Asia, and a false "Exif" match inside image data gives
 *   a plausible coordinate from noise. Both have to come back null.
 *
 *   it has to be null-safe on everything. iOS strips GPS from file-input
 *   uploads, HEIC keeps its metadata somewhere else entirely, screenshots
 *   never had any. Null is the common case, not the error case.
 */

import assert from 'node:assert/strict';
import { gpsFromJpeg } from '../../disney-trivia/js/exif.js';

let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} (${a} vs ${b})`); checks++; };

/* Build a JPEG carrying one GPS IFD. Real structure: SOI, an APP1 holding
 * "Exif\0\0" then a TIFF header, IFD0 with a GPS pointer, and a GPS IFD
 * whose coordinates sit outside the entries because three rationals are 24
 * bytes and only 4 fit in line.
 */
function jpegWith({ lat = [28, 25, 9.5], lng = [81, 34, 52.0], latRef = 'N', lngRef = 'W',
                    little = true, omit = [], extra = {} } = {}) {
  const tiff = [];
  const u8 = (v) => tiff.push(v & 0xff);
  const u16 = (v) => (little ? (u8(v), u8(v >> 8)) : (u8(v >> 8), u8(v)));
  const u32 = (v) => (little
    ? (u8(v), u8(v >> 8), u8(v >> 16), u8(v >> 24))
    : (u8(v >> 24), u8(v >> 16), u8(v >> 8), u8(v)));

  // TIFF header: byte order, 42, offset to IFD0.
  if (little) { u8(0x49); u8(0x49); } else { u8(0x4d); u8(0x4d); }
  u16(0x002a);
  u32(8);

  // IFD0: one entry, the GPS pointer.
  u16(1);
  u16(0x8825); u16(4); u32(1); u32(26);   // GPS IFD begins at 26
  u32(0);                                  // no next IFD

  // GPS IFD. Entry count, then entries, then the out-of-line rationals.
  const tags = [];
  if (!omit.includes('latRef')) tags.push({ tag: 1, type: 2, count: 2, ascii: latRef });
  if (!omit.includes('lat')) tags.push({ tag: 2, type: 5, count: 3, data: lat });
  if (!omit.includes('lngRef')) tags.push({ tag: 3, type: 2, count: 2, ascii: lngRef });
  if (!omit.includes('lng')) tags.push({ tag: 4, type: 5, count: 3, data: lng });
  for (const [tag, spec] of Object.entries(extra)) tags.push({ tag: Number(tag), ...spec });

  const entriesAt = 26;
  const dataAt = entriesAt + 2 + tags.length * 12 + 4;
  let cursor = dataAt;
  const blobs = [];
  u16(tags.length);
  for (const t of tags) {
    u16(t.tag); u16(t.type); u32(t.count);
    if (t.data) {
      u32(cursor);
      blobs.push(t.data);
      cursor += t.data.length * 8;
    } else {
      /* An ASCII value is raw bytes, left-justified in the four-byte field,
       * whatever the TIFF's byte order says. Byte order governs numbers, not
       * a string. Writing it as an integer puts 'N' in the last byte on a
       * big-endian file, which is how this fixture was wrong before the
       * parser was.
       */
      u8(t.ascii.charCodeAt(0)); u8(0); u8(0); u8(0);
    }
  }
  u32(0);
  for (const parts of blobs) {
    // Each part as a rational, with enough denominator to carry the decimal.
    for (const v of parts) { u32(Math.round(v * 1000)); u32(1000); }
  }

  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];   // "Exif\0\0" + TIFF
  const size = payload.length + 2;
  return new Uint8Array([
    0xff, 0xd8,                      // SOI
    0xff, 0xe1, size >> 8, size & 0xff,
    ...payload,
    0xff, 0xda, 0x00, 0x02,          // start of scan: nothing after this matters
  ]).buffer;
}

/* ── the happy path ────────────────────────────────────────────────────── */

{
  const p = gpsFromJpeg(jpegWith());
  ok(p, 'a JPEG with GPS gives a point');
  near(p.lat, 28.4193, 0.0005, 'latitude from degrees, minutes and seconds');
  near(p.lng, -81.5811, 0.0005, 'longitude, negative because the reference is West');
}

// The hemisphere references are the difference between Florida and Asia.
near(gpsFromJpeg(jpegWith({ lngRef: 'E' })).lng, 81.5811, 0.0005, 'East is positive');
near(gpsFromJpeg(jpegWith({ latRef: 'S' })).lat, -28.4193, 0.0005, 'South is negative');

// Big-endian TIFF is just as legal as little, and plenty of cameras write it.
{
  const p = gpsFromJpeg(jpegWith({ little: false }));
  ok(p, 'a big-endian TIFF reads too');
  near(p.lat, 28.4193, 0.0005, 'with the same coordinates');
  near(p.lng, -81.5811, 0.0005, 'both of them');
}

/* ── everything that has to be null ────────────────────────────────────── */

is(gpsFromJpeg(new Uint8Array([]).buffer), null, 'no bytes, no point');
is(gpsFromJpeg(new Uint8Array([1, 2, 3, 4, 5, 6]).buffer), null, 'not a JPEG, no point');
is(gpsFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), null, 'a JPEG with no Exif at all');
is(gpsFromJpeg(jpegWith({ omit: ['lat'] })), null, 'no latitude tag, no point');
is(gpsFromJpeg(jpegWith({ omit: ['lng'] })), null, 'no longitude tag either');

/* A missing hemisphere is a failure, not an assumed North. Guessing would
 * put this photo in Asia and the game would judge against it quite happily.
 */
is(gpsFromJpeg(jpegWith({ omit: ['lngRef'] })), null, 'a missing West reference is refused, not assumed');
is(gpsFromJpeg(jpegWith({ omit: ['latRef'] })), null, 'and so is a missing North one');
is(gpsFromJpeg(jpegWith({ latRef: 'Q' })), null, 'a reference that is not a hemisphere is refused');

// A zero denominator is a corrupt rational, not a zero coordinate.
is(gpsFromJpeg(jpegWith({ lat: [28, 25, 9.5], extra: {} , })) === null, false, 'control: the fixture parses');
{
  // Build one by hand with a zero denominator in the seconds.
  const buf = new Uint8Array(jpegWith());
  // The last rational's denominator is the final four bytes before the SOS
  // marker; zero it.
  const end = buf.length - 4;
  buf[end - 4] = 0; buf[end - 3] = 0; buf[end - 2] = 0; buf[end - 1] = 0;
  is(gpsFromJpeg(buf.buffer), null, 'a zero denominator is corrupt, not a zero');
}

// Truncation anywhere must not throw. A photo cut off mid-upload is a real
// thing and it has to read as "no location".
for (const cut of [8, 14, 20, 30, 44, 60]) {
  const whole = new Uint8Array(jpegWith());
  const part = whole.slice(0, Math.min(cut, whole.length));
  let threw = false;
  try { gpsFromJpeg(part.buffer); } catch { threw = true; }
  ok(!threw, `a file truncated at ${cut} bytes does not throw`);
}

/* A false "Exif" inside image data must not be mistaken for a header. The
 * marker chain is walked rather than the bytes searched precisely so that a
 * coordinate cannot be invented out of pixel noise.
 */
{
  const fake = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xda, 0x00, 0x02,                        // start of scan: image data follows
    0x45, 0x78, 0x69, 0x66, 0, 0,                  // "Exif\0\0" in the pixels
    0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0,
  ]);
  is(gpsFromJpeg(fake.buffer), null, 'the word Exif inside image data is not a header');
}

/* The two guards that stop a coordinate being invented out of bytes that are
 * not metadata. Both need a fixture that would actually parse without them,
 * or they pass for the wrong reason: a file of obvious rubbish fails the
 * marker chain a step later anyway.
 */
{
  // A real Exif block, but sitting after the start of scan, so it is image
  // data that happens to look like metadata. Without the stop-at-SOS rule
  // this parses and returns a coordinate from pixels.
  const real = new Uint8Array(jpegWith());
  const planted = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, ...real.slice(2)]);
  is(gpsFromJpeg(planted.buffer), null,
    'an Exif block inside image data is not read, so pixels cannot invent a location');
  // The same bytes, without the start of scan in front, do parse: otherwise
  // the assertion above would hold for some unrelated reason.
  ok(gpsFromJpeg(real.buffer), 'control: the same block before the scan does parse');
}
{
  // Not a JPEG, but carrying a valid APP1 Exif block where one would be.
  const notJpeg = new Uint8Array(jpegWith());
  notJpeg[0] = 0x89; notJpeg[1] = 0x50;        // a PNG's first two bytes
  is(gpsFromJpeg(notJpeg.buffer), null,
    'a file that is not a JPEG is refused even when it carries an Exif block');
}

// A latitude past the poles is a parse that went wrong, whatever it says.
is(gpsFromJpeg(jpegWith({ lat: [120, 0, 0] })), null, 'a latitude beyond the pole is refused');

console.log(`exif: ${checks} assertions passed`);
process.exit(0);
