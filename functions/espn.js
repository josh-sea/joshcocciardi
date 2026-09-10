// ---------------------------------------------------------------------------
// ESPN Fantasy read proxy.
//
// A browser cannot read a private ESPN league on its own. ESPN's cookies are
// set on espn.com with no SameSite attribute, so browsers treat them as Lax
// and never attach them to a cross-site fetch; and the Fetch spec forbids page
// JavaScript from setting a Cookie header, so pasted cookies can't be attached
// either. FantasyPros hits the same wall and ships a browser extension for it.
// This function is the other way out: the browser hands us the league to read,
// we attach the cookies server-side, and we hand back the JSON.
//
// It is deliberately NOT a general-purpose proxy:
//   - onCall, so Firebase verifies the caller's auth token before we run.
//   - The upstream URL is built from a fixed host and path template. Only
//     digits are interpolated, so there is no way to point it somewhere else.
//   - Views are checked against an allowlist.
//   - Cookie values are never logged, never returned, and never included in an
//     error message.
// ---------------------------------------------------------------------------

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const db = () => getFirestore();

const HOST = 'lm-api-reads.fantasy.espn.com';
const CRED_COL = 'draftnight_espn';

// Everything the client is allowed to ask ESPN for. Read-only views only.
const ALLOWED_VIEWS = new Set([
  'mTeam',
  'mRoster',
  'mMatchup',
  'mMatchupScore',
  'mBoxscore',
  'mSettings',
  'mStandings',
  'mSchedule',
  'mStatus',
  'mTransactions2',
  'kona_player_info',
  'players_wl',
  'proTeamSchedules_wl',
]);

const digits = (v, { min, max, label }) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpsError('invalid-argument', `${label} must be an integer between ${min} and ${max}.`);
  }
  return n;
};

/* SWID is stored as ESPN writes it, curly braces included. espn_s2 is long and
   URL-encoded; it is passed through byte for byte, because re-encoding it is
   the single most common way people break this. */
const cookieHeader = ({ espnS2, swid }) => `espn_s2=${espnS2}; SWID=${swid}`;

const readStoredCreds = async (uid) => {
  const snap = await db().collection(CRED_COL).doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  if (!d.espnS2 || !d.swid) return null;
  return { espnS2: d.espnS2, swid: d.swid };
};

exports.espnFantasy = onCall({ cors: true, memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before connecting a league.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};

  const leagueId = digits(data.leagueId, { min: 1, max: 999999999999, label: 'leagueId' });
  const season = digits(data.season, { min: 2015, max: 2100, label: 'season' });

  const views = Array.isArray(data.views) ? data.views : [];
  if (!views.length) throw new HttpsError('invalid-argument', 'At least one view is required.');
  if (views.length > 8) throw new HttpsError('invalid-argument', 'Too many views in one call.');
  for (const v of views) {
    if (!ALLOWED_VIEWS.has(v)) throw new HttpsError('invalid-argument', `View "${v}" is not allowed.`);
  }

  // Credentials come from the caller (device-only mode) or from their stored
  // settings (so a phone works without extracting cookies on iOS).
  const inline = data.creds && data.creds.espnS2 && data.creds.swid
    ? { espnS2: String(data.creds.espnS2), swid: String(data.creds.swid) }
    : null;
  const creds = inline || (await readStoredCreds(uid));
  if (!creds) {
    throw new HttpsError('failed-precondition', 'no_credentials');
  }

  // Fixed host, fixed path shape, digits only. Nothing the caller sends can
  // redirect this at another origin.
  const url = new URL(`https://${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`);
  views.forEach((v) => url.searchParams.append('view', v));
  if (data.scoringPeriodId !== undefined && data.scoringPeriodId !== null) {
    url.searchParams.set(
      'scoringPeriodId',
      String(digits(data.scoringPeriodId, { min: 0, max: 25, label: 'scoringPeriodId' }))
    );
  }

  const headers = { Cookie: cookieHeader(creds), Accept: 'application/json' };
  if (data.filter && typeof data.filter === 'object') {
    const encoded = JSON.stringify(data.filter);
    if (encoded.length > 4000) throw new HttpsError('invalid-argument', 'Filter is too large.');
    headers['x-fantasy-filter'] = encoded;
  }

  let upstream;
  try {
    upstream = await fetch(url.toString(), { headers, redirect: 'follow' });
  } catch (e) {
    // Note the failure without the URL's query or any header value.
    console.error('espnFantasy upstream fetch failed', e.message);
    throw new HttpsError('unavailable', 'Could not reach ESPN.');
  }

  if (upstream.status === 401 || upstream.status === 403) {
    // The single most common real-world outcome: the espn_s2 cookie aged out.
    throw new HttpsError('permission-denied', 'espn_auth_failed');
  }
  if (upstream.status === 404) {
    throw new HttpsError('not-found', 'league_not_found');
  }
  if (!upstream.ok) {
    console.error('espnFantasy upstream status', upstream.status, 'league', leagueId);
    throw new HttpsError('internal', `ESPN returned ${upstream.status}.`);
  }

  const body = await upstream.json();
  return { status: upstream.status, data: body };
});
