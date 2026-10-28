/* Word Race: eight letters round a wheel, ninety seconds, swipe out every
 * word you can. Longer words are worth far more, being first in the round
 * to find a five, six, seven or eight-letter word earns a bonus, and the
 * best score of the round wins it. Three rounds.
 *
 * The answers are worked out ahead of time (scripts/build-race.mjs), so
 * the host checks a word by looking it up in the puzzle rather than in a
 * dictionary. Everyone sees how many words each player has, and who got
 * each "first", but not the words themselves until the reveal.
 */
import { PUZZLES } from './race-puzzles.js';
import { shuffle, obj, arr } from './room.js';

export const INTRO_MS = 3000;
export const ROUND_MS = 90000;
export const REVEAL_MS = 15000;
export const LATE_MS = 1000;
export const ROUNDS = [3, 5];
export const MIN_LEN = 3;
export const LETTERS = 8;

/* So one six-letter word beats three threes, and the eight is the jackpot. */
export const POINTS = [0, 0, 0, 100, 200, 400, 700, 1100, 1600];
export const pointsFor = (w) => POINTS[Math.min(w.length, LETTERS)] || 0;

/* First in the round to find a word this long. */
export const FIRST_BONUS = { 5: 100, 6: 200, 7: 300, 8: 500 };

export const cleanWord = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '');

export function canMake(word, letters) {
  const pool = {};
  for (const c of letters) pool[c] = (pool[c] || 0) + 1;
  for (const c of word) { if (!pool[c]) return false; pool[c]--; }
  return true;
}

export function puzzle(i) {
  const [key, common, rare] = PUZZLES[i];
  return { key, common: common.split(' '), rare: rare ? rare.split(' ') : [] };
}

/* Why a word is refused before it ever leaves the phone. Only the host
 * knows the answers; these are the checks a phone can make on its own.
 */
export function localProblem(word, letters, found) {
  const w = cleanWord(word);
  if (w.length < MIN_LEN) return `Words need ${MIN_LEN} letters or more`;
  if (!canMake(w, letters)) return 'Not in the wheel';
  if (arr(found).includes(w)) return 'Already got that one';
  return null;
}

export function start(players, opts = {}, ctx) {
  const rounds = ROUNDS.includes(opts.rounds) ? opts.rounds : 3;
  const scores = {};
  players.forEach((p) => { scores[p.uid] = 0; });
  const w = {
    pub: { game: 'race', rounds, scores, wins: {} },
    vault: { order: shuffle(PUZZLES.map((_, i) => i), ctx.rand).slice(0, rounds), found: {} },
    secret: {},
  };
  intro(w, 0, ctx);
  return w;
}

function intro(w, i, ctx) {
  const p = puzzle(w.vault.order[i]);
  w.vault.found = {};
  w.vault.n = {};
  for (const k of Object.keys(w.secret)) w.secret[k] = null;
  Object.assign(w.pub, {
    phase: 'intro', round: i + 1, letters: shuffle([...p.key], ctx.rand).join(''),
    total: p.common.length, counts: {}, firsts: {}, deadline: ctx.now + INTRO_MS,
  });
  delete w.pub.reveal;
}

/* Round points: every word, plus any "first" bonuses. */
export function roundPoints(found, firsts) {
  const points = {};
  for (const [uid, list] of Object.entries(obj(found))) points[uid] = arr(list).reduce((n, word) => n + pointsFor(word), 0);
  for (const [len, uid] of Object.entries(obj(firsts))) points[uid] = (points[uid] || 0) + (FIRST_BONUS[len] || 0);
  return points;
}

function reveal(w, ctx) {
  const p = puzzle(w.vault.order[w.pub.round - 1]);
  const found = obj(w.vault.found);
  const by = {};
  for (const [uid, list] of Object.entries(found)) for (const word of arr(list)) (by[word] = by[word] || []).push(uid);
  const points = roundPoints(found, w.pub.firsts);
  for (const uid of Object.keys(w.pub.scores)) points[uid] = points[uid] || 0;
  const best = Math.max(0, ...Object.values(points));
  const winners = best > 0 ? Object.keys(points).filter((u) => points[u] === best) : [];
  for (const [uid, n] of Object.entries(points)) w.pub.scores[uid] = (w.pub.scores[uid] || 0) + n;
  w.pub.wins = { ...obj(w.pub.wins) };
  for (const uid of winners) w.pub.wins[uid] = (w.pub.wins[uid] || 0) + 1;
  w.pub.reveal = {
    points, winners,
    common: p.common.map((word) => ({ w: word, by: by[word] || [] })),
    rare: p.rare.filter((word) => by[word]).map((word) => ({ w: word, by: by[word] })),
  };
  w.pub.phase = 'reveal';
  w.pub.deadline = ctx.now + REVEAL_MS;
}

export function act(w, uid, msg, ctx) {
  const p = w.pub;
  if (msg.t !== 'word' || p.phase !== 'playing' || ctx.now > p.deadline + LATE_MS) return w;
  const word = cleanWord(msg.w).slice(0, LETTERS);
  const mine = arr(obj(w.vault.found)[uid]);
  const n = (obj(w.vault.n)[uid] || 0) + 1;
  w.vault.n = { ...obj(w.vault.n), [uid]: n };
  if (!(uid in p.scores)) p.scores[uid] = 0;
  let why = localProblem(word, p.letters, mine);
  if (!why) {
    const pz = puzzle(w.vault.order[p.round - 1]);
    if (!pz.common.includes(word) && !pz.rare.includes(word)) why = 'Not in our dictionary';
  }
  if (why) {
    w.secret[uid] = { found: mine, last: { w: word, ok: false, why, n } };
    return w;
  }
  const next = [...mine, word];
  let pts = pointsFor(word), first = false;
  const len = Math.min(word.length, LETTERS);
  if (FIRST_BONUS[len] && !obj(p.firsts)[len]) {
    p.firsts = { ...obj(p.firsts), [len]: uid };
    pts += FIRST_BONUS[len];
    first = true;
  }
  w.vault.found = { ...obj(w.vault.found), [uid]: next };
  w.secret[uid] = { found: next, last: { w: word, ok: true, pts, first, n } };
  p.counts = { ...obj(p.counts), [uid]: next.length };
  return w;
}

export function tick(w, ctx) {
  const p = w.pub;
  for (const pl of ctx.players) if (!(pl.uid in p.scores)) p.scores[pl.uid] = 0;
  if (p.phase === 'intro' && ctx.now >= p.deadline) {
    p.phase = 'playing';
    p.deadline = ctx.now + ROUND_MS;
  } else if (p.phase === 'playing' && ctx.now >= p.deadline + LATE_MS) {
    reveal(w, ctx);
  } else if (p.phase === 'reveal' && ctx.now >= p.deadline) {
    if (p.round < p.rounds) intro(w, p.round, ctx);
    else { p.phase = 'over'; delete p.deadline; }
  }
  return w;
}
