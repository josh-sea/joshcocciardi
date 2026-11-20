// verdictTmdb: the only way the app talks to TMDB. The read token stays here
// (Firestore verdict_secrets/keys.tmdbReadToken, or TMDB_READ_TOKEN in the
// emulator), and details, providers, trending and the provider list are
// cached in verdict_titles so a popular title costs one TMDB call a week.

const { onCall } = require('firebase-functions/v2/https');
const { db, C, HttpsError, Timestamp, requireAuth } = require('./lib');
const { trimResult, trimDetails, trimProviders, mergeProviderLists, titleKeyOf, MEDIA_TYPES } = require('./shared');

const API = 'https://api.themoviedb.org/3';
const HOUR = 3600 * 1000;
const TTL = { details: 7 * 24 * HOUR, providers: 24 * HOUR, trending: 6 * HOUR, providerList: 7 * 24 * HOUR };

let cachedToken = null;
async function token() {
  if (cachedToken) return cachedToken;
  let fromDb = '';
  try {
    const snap = await db().doc(`${C.secrets}/keys`).get();
    fromDb = (snap.exists && String(snap.data().tmdbReadToken || '').trim()) || '';
  } catch (err) {
    console.error('Could not read verdict_secrets/keys', err.message);
  }
  cachedToken = fromDb || String(process.env.TMDB_READ_TOKEN || '').trim() || null;
  if (!cachedToken) throw new HttpsError('failed-precondition', 'TMDB is not set up yet.');
  return cachedToken;
}

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}`, Accept: 'application/json' } });
  if (res.status === 404) throw new HttpsError('not-found', 'That title is not on TMDB.');
  if (!res.ok) {
    console.error('TMDB error', res.status, path);
    throw new HttpsError('unavailable', 'TMDB did not answer. Try again in a moment.');
  }
  return res.json();
}

// Small in-memory limiter: 60 calls a minute per user per instance.
const hits = new Map();
function rateLimit(uid) {
  const now = Date.now();
  const rec = hits.get(uid) || { start: now, n: 0 };
  if (now - rec.start > 60000) { rec.start = now; rec.n = 0; }
  rec.n++;
  hits.set(uid, rec);
  if (rec.n > 60) throw new HttpsError('resource-exhausted', 'Slow down a little and try again.');
}

const fresh = (at, ttl) => at && Date.now() - at.toMillis() < ttl;

async function cached(docId, field, ttl, load) {
  const ref = db().doc(`${C.titles}/${docId}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (data[field] && fresh(data[`${field}FetchedAt`], ttl)) return data[field];
  const value = await load();
  await ref.set({ [field]: value, [`${field}FetchedAt`]: Timestamp.now() }, { merge: true });
  return value;
}

const checkTitle = (mediaType, tmdbId) => {
  const id = Number(tmdbId);
  if (!MEDIA_TYPES.includes(mediaType) || !Number.isInteger(id) || id <= 0) {
    throw new HttpsError('invalid-argument', 'Unknown title.');
  }
  return id;
};

const checkRegion = (r) => (/^[A-Z]{2}$/.test(String(r || 'US')) ? String(r || 'US') : 'US');

const actions = {
  async search({ query, page }) {
    const q = String(query || '').trim().slice(0, 100);
    if (q.length < 1) return { results: [], page: 1, totalPages: 0 };
    const p = Math.min(Math.max(Number(page) || 1, 1), 20);
    const data = await tmdb('/search/multi', { query: q, page: p, include_adult: false, language: 'en-US' });
    return {
      results: (data.results || []).map((r) => trimResult(r)).filter(Boolean),
      page: data.page || p,
      totalPages: data.total_pages || 0,
    };
  },

  async trending() {
    const results = await cached('_trending', 'trending', TTL.trending, async () => {
      const [a, b] = await Promise.all([
        tmdb('/trending/all/week', { language: 'en-US', page: 1 }),
        tmdb('/trending/all/week', { language: 'en-US', page: 2 }),
      ]);
      return [...(a.results || []), ...(b.results || [])].map((r) => trimResult(r)).filter(Boolean);
    });
    return { results };
  },

  async details({ mediaType, tmdbId }) {
    const id = checkTitle(mediaType, tmdbId);
    const details = await cached(titleKeyOf(mediaType, id), 'details', TTL.details, async () =>
      trimDetails(await tmdb(`/${mediaType}/${id}`, { append_to_response: 'credits,videos', language: 'en-US' }), mediaType),
    );
    return { details };
  },

  async providers({ mediaType, tmdbId, region }) {
    const id = checkTitle(mediaType, tmdbId);
    const reg = checkRegion(region);
    const all = await cached(titleKeyOf(mediaType, id), 'providers', TTL.providers, async () => {
      const data = await tmdb(`/${mediaType}/${id}/watch/providers`);
      // Keep just a few regions so the doc stays small.
      const out = {};
      for (const r of ['US', 'CA', 'GB']) out[r] = trimProviders((data.results || {})[r]);
      return out;
    });
    return { providers: all[reg] || trimProviders(null) };
  },

  async providerList({ region }) {
    const reg = checkRegion(region);
    const providers = await cached(`_providers_${reg}`, 'providerList', TTL.providerList, async () => {
      const [m, t] = await Promise.all([
        tmdb('/watch/providers/movie', { watch_region: reg, language: 'en-US' }),
        tmdb('/watch/providers/tv', { watch_region: reg, language: 'en-US' }),
      ]);
      return mergeProviderLists(m.results, t.results).slice(0, 60);
    });
    return { providers };
  },
};

exports.verdictTmdb = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireAuth(request);
  rateLimit(uid);
  const { action, ...params } = request.data || {};
  const fn = actions[action];
  if (!fn) throw new HttpsError('invalid-argument', 'Unknown action.');
  return fn(params);
});
