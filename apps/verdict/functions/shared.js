// Pure helpers shared by the Verdict functions. No Firebase imports here, so
// the tests can load this file on its own.

const RATINGS = ['up', 'meh', 'down'];
const LIST_STATUSES = ['want', 'watching', 'finished', 'abandoned'];
const MEDIA_TYPES = ['movie', 'tv'];

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const RESERVED = new Set([
  'admin', 'administrator', 'support', 'help', 'verdict', 'root', 'system',
  'moderator', 'mod', 'staff', 'official', 'null', 'undefined', 'me', 'you',
  'tmdb', 'justwatch', 'settings', 'invite',
]);

const normalizeUsername = (raw) => String(raw || '').trim().toLowerCase().replace(/^@/, '');

// Returns null when the username is fine, or a sentence saying what's wrong.
function usernameProblem(name) {
  if (!name) return 'Pick a username.';
  if (name.length < 3) return 'Usernames are at least 3 characters.';
  if (name.length > 20) return 'Usernames are at most 20 characters.';
  if (!USERNAME_RE.test(name)) return 'Use only letters, numbers, dots and underscores.';
  if (/^[._]|[._]$/.test(name)) return "Usernames can't start or end with a dot or underscore.";
  if (/\.\./.test(name)) return "Usernames can't have two dots in a row.";
  if (RESERVED.has(name)) return 'That username is reserved.';
  return null;
}

const cleanDisplayName = (raw) => String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);

const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const otherUid = (users, me) => (users[0] === me ? users[1] : users[0]);
const titleKeyOf = (mediaType, tmdbId) => `${mediaType}_${tmdbId}`;

function parseTitleKey(key) {
  const m = /^(movie|tv)_(\d+)$/.exec(String(key || ''));
  return m ? { mediaType: m[1], tmdbId: Number(m[2]) } : null;
}

// Invite codes avoid characters that are easy to misread: no 0/O, 1/I.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeInviteCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length)];
  return s;
}
const normalizeInviteCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const INVITE_RE = new RegExp(`^[${INVITE_ALPHABET}]{8}$`);

/* ── TMDB trimming ─────────────────────────────────────────────────────── */

const yearOf = (date) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

// A search or trending result, cut down to what a list row needs.
function trimResult(r, fallbackType) {
  const mediaType = r.media_type || fallbackType;
  if (!MEDIA_TYPES.includes(mediaType)) return null;
  return {
    tmdbId: r.id,
    mediaType,
    titleKey: titleKeyOf(mediaType, r.id),
    name: r.title || r.name || 'Untitled',
    year: yearOf(r.release_date || r.first_air_date),
    posterPath: r.poster_path || null,
    backdropPath: r.backdrop_path || null,
    overview: r.overview || '',
    popularity: r.popularity || 0,
  };
}

function trimDetails(d, mediaType) {
  const isTv = mediaType === 'tv';
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 8).map((c) => ({
    name: c.name,
    character: c.character || '',
    profilePath: c.profile_path || null,
  }));
  const trailer = ((d.videos && d.videos.results) || []).find(
    (v) => v.site === 'YouTube' && v.type === 'Trailer',
  );
  return {
    tmdbId: d.id,
    mediaType,
    titleKey: titleKeyOf(mediaType, d.id),
    name: d.title || d.name || 'Untitled',
    year: yearOf(isTv ? d.first_air_date : d.release_date),
    posterPath: d.poster_path || null,
    backdropPath: d.backdrop_path || null,
    overview: d.overview || '',
    tagline: d.tagline || '',
    genres: (d.genres || []).map((g) => g.name),
    runtime: isTv ? (d.episode_run_time && d.episode_run_time[0]) || null : d.runtime || null,
    seasons: isTv ? d.number_of_seasons || null : null,
    episodes: isTv ? d.number_of_episodes || null : null,
    status: d.status || '',
    cast,
    trailerKey: trailer ? trailer.key : null,
  };
}

function trimProviders(region) {
  if (!region) return { link: null, flatrate: [], rent: [], buy: [], free: [], ads: [] };
  const map = (list) =>
    (list || [])
      .slice()
      .sort((a, b) => (a.display_priority || 0) - (b.display_priority || 0))
      .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path || null }));
  return {
    link: region.link || null,
    flatrate: map(region.flatrate),
    rent: map(region.rent),
    buy: map(region.buy),
    free: map(region.free),
    ads: map(region.ads),
  };
}

// Movie and TV provider lists merged by id, ordered by US display priority.
function mergeProviderLists(movie, tv) {
  const byId = new Map();
  for (const p of [...(movie || []), ...(tv || [])]) {
    const prev = byId.get(p.provider_id);
    const prio = (p.display_priorities && p.display_priorities.US) ?? p.display_priority ?? 999;
    if (!prev || prio < prev.priority) {
      byId.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logoPath: p.logo_path || null, priority: prio });
    }
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

/* ── Friend activity ───────────────────────────────────────────────────── */

// Raw counts for a per-viewer activity doc (they ignore mute; the app
// recomputes with mute applied).
function activityCounts(ratings = {}, watching = {}) {
  let up = 0, meh = 0, down = 0;
  for (const r of Object.values(ratings)) {
    if (r.rating === 'up') up++;
    else if (r.rating === 'meh') meh++;
    else if (r.rating === 'down') down++;
  }
  return { upCount: up, mehCount: meh, downCount: down, watchingCount: Object.keys(watching).length };
}

module.exports = {
  RATINGS, LIST_STATUSES, MEDIA_TYPES,
  normalizeUsername, usernameProblem, cleanDisplayName,
  pairId, otherUid, titleKeyOf, parseTitleKey,
  makeInviteCode, normalizeInviteCode, INVITE_RE,
  trimResult, trimDetails, trimProviders, mergeProviderLists,
  activityCounts,
};
