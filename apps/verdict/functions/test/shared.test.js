const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../shared');

test('usernames', () => {
  assert.equal(s.normalizeUsername(' @Josh.C '), 'josh.c');
  assert.equal(s.usernameProblem('josh'), null);
  assert.match(s.usernameProblem('jo'), /at least 3/);
  assert.match(s.usernameProblem('a'.repeat(21)), /at most 20/);
  assert.match(s.usernameProblem('jo sh'), /letters, numbers/);
  assert.match(s.usernameProblem('.josh'), /start or end/);
  assert.match(s.usernameProblem('jo..sh'), /two dots/);
  assert.match(s.usernameProblem('admin'), /reserved/);
});

test('keys', () => {
  assert.equal(s.pairId('b', 'a'), 'a__b');
  assert.equal(s.pairId('a', 'b'), 'a__b');
  assert.equal(s.titleKeyOf('tv', 1396), 'tv_1396');
  assert.deepEqual(s.parseTitleKey('movie_603'), { mediaType: 'movie', tmdbId: 603 });
  assert.equal(s.parseTitleKey('person_1'), null);
});

test('invite codes avoid look-alike characters', () => {
  for (let i = 0; i < 200; i++) {
    const c = s.makeInviteCode();
    assert.match(c, s.INVITE_RE);
    assert.doesNotMatch(c, /[01OI]/);
  }
  assert.equal(s.normalizeInviteCode(' abcd-efgh '), 'ABCDEFGH');
});

test('trimResult drops people and keeps movies and shows', () => {
  assert.equal(s.trimResult({ id: 1, media_type: 'person', name: 'X' }), null);
  const m = s.trimResult({ id: 603, media_type: 'movie', title: 'The Matrix', release_date: '1999-03-31', poster_path: '/p.jpg' });
  assert.deepEqual(
    { key: m.titleKey, name: m.name, year: m.year, poster: m.posterPath },
    { key: 'movie_603', name: 'The Matrix', year: 1999, poster: '/p.jpg' },
  );
  assert.equal(s.trimResult({ id: 5, name: 'Show', first_air_date: '' }, 'tv').year, null);
});

test('trimDetails for a show', () => {
  const d = s.trimDetails({
    id: 136315, name: 'The Bear', first_air_date: '2022-06-23', number_of_seasons: 3, episode_run_time: [30],
    genres: [{ name: 'Drama' }], credits: { cast: [{ name: 'Jeremy Allen White', character: 'Carmy' }] },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc' }] },
  }, 'tv');
  assert.equal(d.seasons, 3);
  assert.equal(d.runtime, 30);
  assert.equal(d.trailerKey, 'abc');
  assert.deepEqual(d.genres, ['Drama']);
  assert.equal(d.cast[0].character, 'Carmy');
});

test('providers', () => {
  const p = s.trimProviders({ link: 'L', flatrate: [{ provider_id: 2, provider_name: 'B', display_priority: 2 }, { provider_id: 1, provider_name: 'A', display_priority: 1 }] });
  assert.deepEqual(p.flatrate.map((x) => x.name), ['A', 'B']);
  assert.deepEqual(s.trimProviders(undefined).flatrate, []);
  const merged = s.mergeProviderLists(
    [{ provider_id: 8, provider_name: 'Netflix', display_priorities: { US: 1 } }],
    [{ provider_id: 8, provider_name: 'Netflix', display_priorities: { US: 0 } }, { provider_id: 15, provider_name: 'Hulu', display_priorities: { US: 3 } }],
  );
  assert.deepEqual(merged.map((x) => [x.id, x.priority]), [[8, 0], [15, 3]]);
});

test('activity counts', () => {
  assert.deepEqual(
    s.activityCounts({ a: { rating: 'up' }, b: { rating: 'up' }, c: { rating: 'down' } }, { a: 1 }),
    { upCount: 2, mehCount: 0, downCount: 1, watchingCount: 1 },
  );
});
