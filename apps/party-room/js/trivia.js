/* Trivia: the same question on every phone, points for right and for fast.
 *
 * The right answer lives in the vault, which only the host can read, and
 * reaches the room only at the reveal. Answer times are measured on the
 * host's clock when the answer arrives, so nobody's phone gets to say how
 * quick it was.
 */
import { TRIVIA, TRIVIA_CATEGORIES } from './decks.js';
import { shuffle, obj } from './room.js';

export const INTRO_MS = 3000;
export const QUESTION_MS = 15000;
export const REVEAL_MS = 5000;
export const COUNTS = [5, 10, 15];

export function questionPool(category) {
  const out = [];
  TRIVIA.forEach((q, i) => { if (!category || category === 'mixed' || q[0] === category) out.push(i); });
  return out;
}

/* 100 for being right, plus up to 100 more for being quick about it. */
export function pointsFor(ms) {
  const left = Math.max(0, Math.min(1, 1 - ms / QUESTION_MS));
  return 100 + Math.round(100 * left);
}

export function start(players, opts = {}, ctx) {
  const category = TRIVIA_CATEGORIES[opts.category] ? opts.category : 'mixed';
  const pool = questionPool(category);
  const count = Math.min(COUNTS.includes(opts.count) ? opts.count : 10, pool.length);
  const scores = {};
  players.forEach((p) => { scores[p.uid] = 0; });
  return {
    pub: { game: 'trivia', phase: 'intro', n: 0, total: count, category, deadline: ctx.now + INTRO_MS, scores },
    vault: { order: shuffle(pool, ctx.rand).slice(0, count), answer: null, picks: {} },
    secret: {},
  };
}

function ask(w, i, ctx) {
  const [cat, text, right, ...wrong] = TRIVIA[w.vault.order[i]];
  const options = shuffle([right, ...wrong], ctx.rand);
  w.vault.answer = options.indexOf(right);
  w.vault.picks = {};
  w.pub.phase = 'question';
  w.pub.n = i;
  w.pub.q = { cat, text, options };
  w.pub.answered = {};
  w.pub.startedAt = ctx.now;
  w.pub.deadline = ctx.now + QUESTION_MS;
  delete w.pub.last;
}

function reveal(w, ctx) {
  const picks = {}, gained = {};
  for (const [uid, p] of Object.entries(obj(w.vault.picks))) {
    picks[uid] = p.pick;
    if (p.pick === w.vault.answer) {
      gained[uid] = pointsFor(p.ms);
      w.pub.scores[uid] = (w.pub.scores[uid] || 0) + gained[uid];
    }
  }
  w.pub.last = { answer: w.vault.answer, picks, gained };
  w.pub.phase = 'reveal';
  w.pub.deadline = ctx.now + REVEAL_MS;
}

export function act(w, uid, msg, ctx) {
  if (msg.t !== 'answer' || w.pub.phase !== 'question') return w;
  const pick = msg.pick;
  if (!Number.isInteger(pick) || pick < 0 || pick >= w.pub.q.options.length) return w;
  if (ctx.now > w.pub.deadline) return w;
  w.vault.picks = obj(w.vault.picks);
  if (w.vault.picks[uid]) return w; // first answer stands
  w.vault.picks[uid] = { pick, ms: ctx.now - w.pub.startedAt };
  w.pub.answered = { ...obj(w.pub.answered), [uid]: true };
  if (!(uid in w.pub.scores)) w.pub.scores[uid] = 0;
  return w;
}

export function tick(w, ctx) {
  const p = w.pub;
  if (p.phase === 'intro' && ctx.now >= p.deadline) ask(w, 0, ctx);
  else if (p.phase === 'question') {
    const everyone = ctx.players.length > 0 && ctx.players.every((pl) => obj(p.answered)[pl.uid]);
    if (everyone || ctx.now >= p.deadline) reveal(w, ctx);
  } else if (p.phase === 'reveal' && ctx.now >= p.deadline) {
    if (p.n + 1 < p.total) ask(w, p.n + 1, ctx);
    else { p.phase = 'over'; delete p.deadline; }
  }
  return w;
}
