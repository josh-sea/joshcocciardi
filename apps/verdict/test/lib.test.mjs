// Unit tests for src/lib/verdict.js. The module has no imports, so it loads
// straight from source.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/lib/verdict.js', import.meta.url), 'utf8');
const v = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

const activity = {
  ratings: {
    bob: { rating: 'up', at: 3000 },
    carol: { rating: 'down', at: 2000 },
    dan: { rating: 'up', at: 1000 },
    erin: { rating: 'meh', at: 4000 },
  },
  watching: { bob: 100, fay: 200 },
};

test('tally leaves muted friends out of every count', () => {
  assert.deepEqual(v.tally(activity), { up: 2, meh: 1, down: 1, watching: 2, total: 4 });
  assert.deepEqual(v.tally(activity, { carol: true, bob: true }), { up: 1, meh: 1, down: 0, watching: 1, total: 2 });
  assert.deepEqual(v.tally(null), { up: 0, meh: 0, down: 0, watching: 0, total: 0 });
});

test('breakdown puts starred first, then newest, and hides muted', () => {
  const g = v.breakdown(activity, { starred: { dan: true }, muted: { carol: true } });
  assert.deepEqual(g.up.map((x) => x.uid), ['dan', 'bob']);
  assert.deepEqual(g.down, []);
  assert.deepEqual(g.meh.map((x) => x.uid), ['erin']);
});

test('watchingUids is newest first without muted', () => {
  assert.deepEqual(v.watchingUids(activity), ['fay', 'bob']);
  assert.deepEqual(v.watchingUids(activity, { fay: true }), ['bob']);
});

test('recScore weights starred friends double', () => {
  assert.deepEqual(v.recScore(activity), { score: 1, votes: 4 });
  assert.deepEqual(v.recScore(activity, { starred: { bob: true } }), { score: 2, votes: 4 });
  assert.deepEqual(v.recScore(activity, { muted: { carol: true } }), { score: 2, votes: 3 });
});

test('taste match', () => {
  const mine = { a: 'up', b: 'up', c: 'down', d: 'meh', e: 'up', x: 'up' };
  const theirs = { a: 'up', b: 'down', c: 'down', d: 'up', e: 'up', y: 'up' };
  const m = v.tasteMatch(mine, theirs);
  assert.equal(m.overlap, 5);
  assert.equal(m.agreeCount, 3);
  assert.equal(m.percent, Math.round((100 * 3.5) / 5));
  assert.deepEqual(m.disagree.map((x) => x.titleKey).sort(), ['b', 'd']);
  assert.equal(v.tasteMatch({ a: 'up' }, { a: 'up' }).percent, null, 'needs 5 in common');
});

test('nextHistory appends and caps at 20', () => {
  assert.deepEqual(v.nextHistory(null), []);
  const prev = { rating: 'up', note: 'n', tags: [], updatedAt: 5, history: [] };
  assert.deepEqual(v.nextHistory(prev), [{ rating: 'up', note: 'n', tags: [], at: 5 }]);
  const full = Array.from({ length: 20 }, (_, i) => ({ rating: 'meh', note: String(i), tags: [], at: i }));
  const next = v.nextHistory({ ...prev, history: full });
  assert.equal(next.length, 20);
  assert.equal(next[0].note, '1');
  assert.equal(next[19].note, 'n');
});

test('timeAgo', () => {
  const now = 1_000_000_000;
  assert.equal(v.timeAgo(now - 10_000, now), 'just now');
  assert.equal(v.timeAgo(now - 5 * 60_000, now), '5m');
  assert.equal(v.timeAgo(now - 3 * 3600_000, now), '3h');
  assert.equal(v.timeAgo(now - 2 * 86400_000, now), '2d');
  assert.equal(v.timeAgo({ seconds: (now - 86400_000 * 14) / 1000 }, now), '2w');
  assert.equal(v.timeAgo(null, now), '');
});

test('invite links', () => {
  assert.equal(v.parseInviteUrl('verdict://invite/ABCD2345'), 'ABCD2345');
  assert.equal(v.parseInviteUrl('verdict://invite/abcd-2345'), 'ABCD2345');
  assert.equal(v.parseInviteUrl('verdict://somewhere'), null);
  assert.equal(v.initials('Josh Cocciardi'), 'JC');
});
