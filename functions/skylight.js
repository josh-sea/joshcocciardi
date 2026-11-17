// ---------------------------------------------------------------------------
// Skylight calendar read proxy for Daybook (/projects/daybook).
//
// Skylight's API does not allow cross-site requests from joshcocciardi.com,
// and its token must not live in a public page or in the repo. So the signed
// in Daybook user saves their token once, here, and asks this function for a
// date range; it attaches the token server-side and hands back the JSON.
//
// Like espnFantasy it is deliberately not a general proxy:
//   - onCall, so Firebase verifies the caller before we run.
//   - Fixed host and path; only a numeric frame id and checked dates go in.
//   - The token is stored in daybook_skylight/{uid}, a collection the
//     Firestore rules close to every client, and is never logged or returned.
// ---------------------------------------------------------------------------

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const lib = require('./skylight-lib');

const COL = 'daybook_skylight';
const doc = (uid) => getFirestore().collection(COL).doc(uid);

const bad = (e) => {
  if (e instanceof lib.BadInput) throw new HttpsError('invalid-argument', e.message);
  throw e;
};

const fetchEvents = async (auth, frame, dateMin, dateMax, tz) => {
  let url;
  try { url = lib.eventsUrl({ frame, dateMin, dateMax, tz }); } catch (e) { bad(e); }
  let upstream;
  try {
    upstream = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' }, redirect: 'error' });
  } catch (e) {
    console.error('skylight fetch failed', e.message);
    throw new HttpsError('unavailable', 'Could not reach Skylight.');
  }
  if (upstream.status === 401 || upstream.status === 403) throw new HttpsError('permission-denied', 'skylight_auth_failed');
  if (upstream.status === 404) throw new HttpsError('not-found', 'frame_not_found');
  if (!upstream.ok) {
    console.error('skylight status', upstream.status);
    throw new HttpsError('internal', `Skylight returned ${upstream.status}.`);
  }
  return upstream.json();
};

exports.daybookSkylight = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to sync with Skylight.');
  const uid = request.auth.uid;
  const data = request.data || {};

  switch (data.action) {
    case 'status': {
      const snap = await doc(uid).get();
      if (!snap.exists) return { connected: false };
      const d = snap.data();
      return { connected: true, frame: d.frame, tz: d.tz, hint: d.hint, savedAt: d.savedAt?.toMillis?.() || null };
    }

    case 'connect': {
      let auth, frame, tz;
      try { auth = lib.authHeader(data.token); frame = lib.frameId(data.frame); tz = lib.timezone(data.tz); } catch (e) { bad(e); }
      // Prove the token works before saving it: ask for one day.
      const today = new Date().toISOString().slice(0, 10);
      await fetchEvents(auth, frame, today, today, tz);
      await doc(uid).set({ auth, frame, tz, hint: lib.hint(auth), savedAt: FieldValue.serverTimestamp() });
      return { connected: true, frame, tz, hint: lib.hint(auth) };
    }

    case 'disconnect':
      await doc(uid).delete();
      return { connected: false };

    case 'events': {
      const snap = await doc(uid).get();
      if (!snap.exists) throw new HttpsError('failed-precondition', 'not_connected');
      const d = snap.data();
      const body = await fetchEvents(d.auth, d.frame, data.dateMin, data.dateMax, d.tz);
      return { data: body };
    }

    default:
      throw new HttpsError('invalid-argument', 'Unknown action.');
  }
});
