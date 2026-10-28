/* Quick Sketch: one person draws, everyone else races to guess.
 *
 * The drawer picks one of three words (one easy, one medium, one hard). The
 * word goes to the drawer's private slot and the host's vault, never into
 * the room, so the only way to know it is to be drawing or to have guessed
 * it. Guesses go to the host, which says "so close" privately rather than
 * putting a near miss on everyone's screen as a free hint.
 *
 * The drawing itself does not pass through the host: the drawer writes
 * strokes straight to the room, because a sketch that lags behind the pen
 * by a host round trip is no fun to watch.
 */
import { SKETCH_WORDS } from './decks.js';
import { shuffle, obj, arr } from './room.js';

export const CHOOSE_MS = 15000;
export const DRAW_MS = 80000;
export const REVEAL_MS = 6000;
export const FEED_MAX = 40;
export const DRAWER_POINTS = 40;

/* ── guessing ────────────────────────────────────────────────────────────── */

export function normaliseGuess(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/^(a|an|the)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function isRight(guess, word) {
  const g = normaliseGuess(guess), w = normaliseGuess(word);
  if (!g) return false;
  return g === w || g === w + 's' || g + 's' === w || g === w + 'es';
}

export function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/* One letter out on a short word, two on a long one. Three-letter words
 * are never "close": "cat" is one letter from "bat", "hat" and "car".
 */
export function isClose(guess, word) {
  const g = normaliseGuess(guess), w = normaliseGuess(word);
  if (w.length < 4 || !g || isRight(guess, word)) return false;
  return distance(g, w) <= (w.length >= 8 ? 2 : 1);
}

/* Letters become blanks; spaces and hyphens stay, so "ice cream" shows as
 * two words.
 */
export function mask(word, shown = []) {
  const set = new Set(shown);
  return [...word].map((c, i) => (/[a-z0-9]/i.test(c) && !set.has(i) ? '_' : c)).join('');
}

/* Hints: one letter at 40% of the time, another at 70%. Never enough to
 * give a short word away.
 */
export function hintsDue(elapsedFrac, word) {
  const letters = [...word].filter((c) => /[a-z0-9]/i.test(c)).length;
  const max = letters >= 7 ? 2 : letters >= 4 ? 1 : 0;
  const due = elapsedFrac >= 0.7 ? 2 : elapsedFrac >= 0.4 ? 1 : 0;
  return Math.min(max, due);
}

export function guessPoints(ms) {
  const left = Math.max(0, Math.min(1, 1 - ms / DRAW_MS));
  return 50 + Math.round(150 * left);
}

export function choicesFrom(used, rand) {
  const u = new Set(used);
  return ['easy', 'medium', 'hard'].map((tier) => {
    const fresh = SKETCH_WORDS[tier].filter((wd) => !u.has(wd));
    const pool = fresh.length ? fresh : SKETCH_WORDS[tier];
    return pool[Math.floor(rand() * pool.length)];
  });
}

/* ── the game ────────────────────────────────────────────────────────────── */

export function start(players, opts = {}, ctx) {
  const rounds = [1, 2, 3].includes(opts.rounds) ? opts.rounds : 1;
  const queue = [];
  for (let r = 0; r < rounds; r++) players.forEach((p) => queue.push(p.uid));
  const scores = {};
  players.forEach((p) => { scores[p.uid] = 0; });
  const w = {
    pub: { game: 'sketch', rounds, scores, feed: [] },
    vault: { queue, used: [] },
    secret: {},
    fx: [],
  };
  beginTurn(w, 0, ctx);
  return w;
}

function beginTurn(w, turn, ctx) {
  const drawer = w.vault.queue[turn];
  const choices = choicesFrom(w.vault.used, ctx.rand);
  for (const k of Object.keys(w.secret)) w.secret[k] = null;
  w.secret[drawer] = { choices };
  Object.assign(w.vault, { choices, word: null, shown: [] });
  Object.assign(w.pub, {
    phase: 'choosing', turn, turns: w.vault.queue.length, drawer,
    deadline: ctx.now + CHOOSE_MS, solved: {}, hint: null, feed: [],
  });
  delete w.pub.word;
  delete w.pub.startedAt;
  w.fx = [...arr(w.fx), { type: 'clear-strokes' }];
}

function choose(w, i, ctx) {
  const word = w.vault.choices[i];
  w.vault.word = word;
  w.vault.used = [...arr(w.vault.used), word];
  w.vault.letters = shuffle([...word].map((c, j) => (/[a-z0-9]/i.test(c) ? j : -1)).filter((j) => j >= 0), ctx.rand);
  w.vault.shown = [];
  w.secret[w.pub.drawer] = { word };
  Object.assign(w.pub, {
    phase: 'drawing', hint: mask(word), startedAt: ctx.now, deadline: ctx.now + DRAW_MS,
  });
}

function feed(w, item) {
  w.pub.feed = [...arr(w.pub.feed), item].slice(-FEED_MAX);
}

function reveal(w, ctx) {
  w.pub.phase = 'reveal';
  w.pub.word = w.vault.word;
  w.pub.hint = w.vault.word;
  w.pub.deadline = ctx.now + REVEAL_MS;
}

export function act(w, uid, msg, ctx) {
  const p = w.pub;
  w.fx = arr(w.fx);
  if (msg.t === 'choose' && p.phase === 'choosing' && uid === p.drawer) {
    if (Number.isInteger(msg.i) && msg.i >= 0 && msg.i < w.vault.choices.length) choose(w, msg.i, ctx);
    return w;
  }
  if (msg.t !== 'guess' || p.phase !== 'drawing' || uid === p.drawer) return w;
  if (obj(p.solved)[uid]) return w;
  const text = String(msg.text || '').slice(0, 40).trim();
  if (!text) return w;
  if (!(uid in p.scores)) p.scores[uid] = 0;
  if (isRight(text, w.vault.word)) {
    const order = Object.keys(obj(p.solved)).length + 1;
    const pts = guessPoints(ctx.now - p.startedAt);
    p.solved = { ...obj(p.solved), [uid]: order };
    p.scores[uid] += pts;
    p.scores[p.drawer] = (p.scores[p.drawer] || 0) + DRAWER_POINTS;
    w.secret[uid] = { word: w.vault.word };
    feed(w, { k: 'got', who: uid });
    w.fx.push({ type: 'note', uid, text: `You got it! +${pts}` });
  } else if (isClose(text, w.vault.word)) {
    w.fx.push({ type: 'note', uid, text: `"${text}" is so close!` });
  } else {
    feed(w, { k: 'guess', who: uid, text });
  }
  return w;
}

export function tick(w, ctx) {
  const p = w.pub;
  w.fx = arr(w.fx);
  const here = new Set(ctx.players.map((pl) => pl.uid));
  // Someone who arrives mid-game gets a turn at the end.
  const queue = arr(w.vault.queue);
  for (const pl of ctx.players) {
    if (!(pl.uid in p.scores)) {
      p.scores[pl.uid] = 0;
      if (!queue.slice(p.turn + 1).includes(pl.uid)) queue.push(pl.uid);
    }
  }
  w.vault.queue = queue;
  p.turns = queue.length;

  if (p.phase === 'choosing') {
    if (!here.has(p.drawer)) reveal(w, ctx);
    else if (ctx.now >= p.deadline) choose(w, 0, ctx);
  } else if (p.phase === 'drawing') {
    const guessers = ctx.players.filter((pl) => pl.uid !== p.drawer);
    const allIn = guessers.length > 0 && guessers.every((pl) => obj(p.solved)[pl.uid]);
    if (allIn || ctx.now >= p.deadline || !here.has(p.drawer)) reveal(w, ctx);
    else {
      const due = hintsDue((ctx.now - p.startedAt) / DRAW_MS, w.vault.word);
      const shown = arr(w.vault.shown);
      if (shown.length < due) {
        w.vault.shown = arr(w.vault.letters).slice(0, due);
        p.hint = mask(w.vault.word, w.vault.shown);
      }
    }
  } else if (p.phase === 'reveal' && ctx.now >= p.deadline) {
    let next = p.turn + 1;
    while (next < queue.length && !here.has(queue[next])) next++;
    if (next < queue.length) beginTurn(w, next, ctx);
    else { p.phase = 'over'; delete p.deadline; }
  }
  return w;
}
