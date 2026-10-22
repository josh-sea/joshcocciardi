// ---------------------------------------------------------------------------
// My Reading Buddy: hands a book's photos and recordings to its own shelf.
//
// Saving a book as a video draws its pages into a canvas and mixes its
// recordings through Web Audio, and both need the bytes, not just a URL a
// tag can display. A browser can only read those bytes from Cloud Storage if
// the bucket has a CORS policy, which isn't part of `firebase deploy` and
// this bucket doesn't have. So the app reads them through this function
// instead, at /api/readingbuddy/file on the site's own domain (a Hosting
// rewrite), where no cross-origin rules apply.
//
// It is deliberately narrow:
//   - Only paths shaped like readingbuddy/{shelfId}/{bookId}/{file}, with
//     ids and the file name limited to safe characters, so nothing outside
//     the app's folder can be named.
//   - The caller's Firebase ID token must verify and carry a verified email.
//   - That email must be on the shelf's member list. This is stricter than
//     the Storage rules, which can't see Firestore and so only check sign-in
//     plus the unguessable path.
//   - GET only, nothing cached by shared caches, and no CORS: the app calls
//     it same-origin, so no other site's page can read the response.
// ---------------------------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const SHELVES = 'readingbuddy_shelves';
const ID = '[A-Za-z0-9_-]{1,64}';
const FILE = '[A-Za-z0-9][A-Za-z0-9._-]{0,99}';
const PATH_RE = new RegExp(`^readingbuddy/(${ID})/(${ID})/(${FILE})$`);
const TYPES = /^(image|audio)\//;

// readingbuddy/{shelfId}/{bookId}/{file} → { shelfId, bookId, file }, or
// null for anything else (other folders, "..", extra segments, odd bytes).
const parsePath = (path) => {
  if (typeof path !== 'string' || path.includes('..')) return null;
  const m = PATH_RE.exec(path);
  return m ? { shelfId: m[1], bookId: m[2], file: m[3] } : null;
};

const bearer = (req) => {
  const h = req.get('Authorization') || '';
  const m = /^Bearer (.+)$/.exec(h);
  return m ? m[1] : null;
};

const fail = (res, status, error) => res.status(status).json({ error });

exports.parsePath = parsePath;

exports.readingBuddyFile = onRequest({ memory: '256MiB', timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');

  const where = parsePath(req.query.path);
  if (!where) return fail(res, 400, 'bad_path');

  const token = bearer(req);
  if (!token) return fail(res, 401, 'no_token');
  let user;
  try {
    user = await getAuth().verifyIdToken(token);
  } catch (e) {
    return fail(res, 401, 'bad_token');
  }
  const email = String(user.email || '').toLowerCase();
  if (!email || user.email_verified !== true) return fail(res, 403, 'unverified');

  const shelf = await getFirestore().collection(SHELVES).doc(where.shelfId).get();
  const members = shelf.exists ? shelf.get('memberEmails') : null;
  // Same answer for "no such shelf" and "not yours", so ids can't be probed.
  if (!Array.isArray(members) || !members.includes(email)) return fail(res, 403, 'not_a_member');

  const file = getStorage().bucket().file(req.query.path);
  let meta;
  try {
    [meta] = await file.getMetadata();
  } catch (e) {
    return fail(res, e.code === 404 ? 404 : 502, e.code === 404 ? 'not_found' : 'storage_error');
  }
  const type = meta.contentType || 'application/octet-stream';
  if (!TYPES.test(type)) return fail(res, 415, 'not_media');

  res.set('Content-Type', type);
  if (meta.size) res.set('Content-Length', String(meta.size));
  // Files never change in place (a new take gets a new name), so the
  // browser may keep them; "private" keeps them out of shared caches.
  res.set('Cache-Control', 'private, max-age=86400');
  file
    .createReadStream()
    .on('error', (e) => {
      console.error('[readingBuddyFile] stream failed', where, e.message);
      if (!res.headersSent) fail(res, 502, 'storage_error');
      else res.end();
    })
    .pipe(res);
  return undefined;
});
