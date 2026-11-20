import { call } from '../firebase';

const IMG = 'https://image.tmdb.org/t/p';
export const posterUrl = (path, size = 'w342') => (path ? `${IMG}/${size}${path}` : null);
export const backdropUrl = (path, size = 'w780') => (path ? `${IMG}/${size}${path}` : null);
export const logoUrl = (path) => (path ? `${IMG}/w92${path}` : null);

// Session cache so going back and forth doesn't call the function again.
const memo = new Map();
const cached = async (key, fn) => {
  if (memo.has(key)) return memo.get(key);
  const p = fn().catch((err) => {
    memo.delete(key);
    throw err;
  });
  memo.set(key, p);
  return p;
};

export const searchTitles = (query, page = 1) => call('verdictTmdb', { action: 'search', query, page });
export const trending = () => cached('trending', () => call('verdictTmdb', { action: 'trending' }).then((r) => r.results));
export const titleDetails = (mediaType, tmdbId) =>
  cached(`d:${mediaType}_${tmdbId}`, () => call('verdictTmdb', { action: 'details', mediaType, tmdbId }).then((r) => r.details));
export const titleProviders = (mediaType, tmdbId, region = 'US') =>
  cached(`p:${mediaType}_${tmdbId}:${region}`, () =>
    call('verdictTmdb', { action: 'providers', mediaType, tmdbId, region }).then((r) => r.providers));
export const providerList = (region = 'US') =>
  cached(`pl:${region}`, () => call('verdictTmdb', { action: 'providerList', region }).then((r) => r.providers));

// The small title snapshot stored on ratings, lists and feed items.
export const snapshotOf = (t) => ({ name: t.name || 'Untitled', year: t.year || null, posterPath: t.posterPath || null });
