// Pure logic: counts, breakdowns, taste match, recommendation scores and
// small formatting helpers. No imports, so the tests can load it directly.

const toMillis = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
};

// Counts for one title from a viewer's activity doc, with muted friends
// removed. Muted friends don't count anywhere the viewer looks.
export function tally(activity, muted = {}) {
  const out = { up: 0, meh: 0, down: 0, watching: 0, total: 0 };
  if (!activity) return out;
  for (const [uid, r] of Object.entries(activity.ratings || {})) {
    if (muted[uid]) continue;
    if (out[r.rating] !== undefined) {
      out[r.rating]++;
      out.total++;
    }
  }
  for (const uid of Object.keys(activity.watching || {})) if (!muted[uid]) out.watching++;
  return out;
}

// Who said what, grouped by verdict. Starred friends first, then newest.
export function breakdown(activity, { muted = {}, starred = {} } = {}) {
  const groups = { up: [], meh: [], down: [] };
  for (const [uid, r] of Object.entries((activity && activity.ratings) || {})) {
    if (muted[uid] || !groups[r.rating]) continue;
    groups[r.rating].push({ uid, ...r, starred: Boolean(starred[uid]), atMs: toMillis(r.at) });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => (b.starred - a.starred) || (b.atMs - a.atMs));
  }
  return groups;
}

export function watchingUids(activity, muted = {}) {
  return Object.entries((activity && activity.watching) || {})
    .filter(([uid]) => !muted[uid])
    .sort((a, b) => toMillis(b[1]) - toMillis(a[1]))
    .map(([uid]) => uid);
}

// Score for "Friends recommend": up minus down, starred votes count double.
export function recScore(activity, { muted = {}, starred = {} } = {}) {
  let score = 0;
  let votes = 0;
  for (const [uid, r] of Object.entries((activity && activity.ratings) || {})) {
    if (muted[uid]) continue;
    const w = starred[uid] ? 2 : 1;
    if (r.rating === 'up') score += w;
    else if (r.rating === 'down') score -= w;
    votes++;
  }
  return { score, votes };
}

// Taste match between two people. `mine` and `theirs` map titleKey → rating.
// Same verdict = 1, a step apart (meh vs up/down) = 0.5, opposite = 0.
export const MATCH_MIN_OVERLAP = 5;
export function tasteMatch(mine = {}, theirs = {}) {
  const agree = [];
  const disagree = [];
  let sum = 0;
  for (const [key, a] of Object.entries(mine)) {
    const b = theirs[key];
    if (!b) continue;
    let s;
    if (a === b) s = 1;
    else if (a === 'meh' || b === 'meh') s = 0.5;
    else s = 0;
    sum += s;
    (s === 1 ? agree : disagree).push({ titleKey: key, mine: a, theirs: b, score: s });
  }
  const overlap = agree.length + disagree.length;
  return {
    overlap,
    agreeCount: agree.length,
    percent: overlap >= MATCH_MIN_OVERLAP ? Math.round((100 * sum) / overlap) : null,
    agree,
    disagree,
  };
}

// The next history array when a rating changes: the previous version is
// appended, and at 20 the oldest drops off (the security rules check this).
export const HISTORY_MAX = 20;
export function nextHistory(prev) {
  if (!prev) return [];
  const entry = { rating: prev.rating, note: prev.note || '', tags: prev.tags || [], at: prev.updatedAt };
  const old = prev.history || [];
  return old.length >= HISTORY_MAX ? [...old.slice(1), entry] : [...old, entry];
}

export function timeAgo(t, now = Date.now()) {
  const ms = toMillis(t);
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.round(d / 7);
  if (d < 60) return `${w}w`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(d / 365)}y`;
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

export const titleKeyOf = (mediaType, tmdbId) => `${mediaType}_${tmdbId}`;

export function parseInviteUrl(url) {
  const m = /invite\/([A-Za-z0-9-]{8,9})/.exec(String(url || ''));
  return m ? m[1].replace(/-/g, '').toUpperCase() : null;
}

export const toMs = toMillis;

// "5m ago", or "just now".
export function ago(t, now = Date.now()) {
  const s = timeAgo(t, now);
  return s && s !== 'just now' ? `${s} ago` : s;
}
