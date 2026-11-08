/* The two trainers away from the table. Pure.
 *
 * Strategy drill: a hand and a dealer card, you pick the move, it says
 * whether the chart agrees and why, with what each move is worth. Cells
 * you miss come back a few questions later until you get them right.
 *
 * Count drill: cards go by one at a time, then you say the Hi-Lo running
 * count. Then, optionally, turn it into a true count.
 */
import { cardFor, hiLo, idx, fullComp } from './cards.js';
import { basic, cellFor, cellName, cellKey, why, UPS } from './strategy.js';
import { moveEVs } from './odds.js';

/* Hands worth asking about. Hard 5 to 8 and hard 18+ are always the same
 * answer, so they turn up rarely.
 */
const HARD_POOL = [8, 9, 10, 11, 12, 12, 13, 13, 14, 15, 15, 16, 16, 16, 17];
const SOFT_POOL = [2, 3, 4, 5, 6, 7, 7, 7, 8, 8, 9];
const PAIR_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10];

const pick = (a, rand) => a[Math.floor(rand() * a.length)];

/* Two cards that make a hard total without being a pair (or an ace). */
function hardCards(total, rand) {
  const options = [];
  for (let a = 2; a <= 10; a++) {
    const b = total - a;
    if (b >= 2 && b <= 10 && a !== b && a <= b) options.push([a, b]);
  }
  if (!options.length) return null;
  const [a, b] = pick(options, rand);
  return rand() < 0.5 ? [a, b] : [b, a];
}

/* The cards for a chart cell, for re-asking one you missed. */
export function cardsForCell(cell, rand = Math.random) {
  const { kind, key } = cell;
  let ids;
  if (kind === 'pair') ids = [key, key];
  else if (kind === 'soft') ids = rand() < 0.5 ? [1, key] : [key, 1];
  else ids = hardCards(key, rand);
  if (!ids) return null;
  return ids.map((v) => cardFor(v, rand));
}

export function parseKey(key) {
  const [kind, k, up] = String(key).split(':');
  return { kind, key: Number(k), up: Number(up) };
}

export function strategyQuestion(rand = Math.random, { only = null, focus = null } = {}) {
  if (focus) {
    const cell = parseKey(focus);
    const cards = cardsForCell(cell, rand);
    if (cards) return { cards, up: cell.up, upCard: cardFor(cell.up, rand) };
  }
  const roll = rand();
  const kind = only || (roll < 0.5 ? 'hard' : roll < 0.75 ? 'soft' : 'pair');
  let ids;
  if (kind === 'pair') { const v = pick(PAIR_POOL, rand); ids = [v, v]; }
  else if (kind === 'soft') { const v = pick(SOFT_POOL, rand); ids = rand() < 0.5 ? [1, v] : [v, 1]; }
  else ids = hardCards(pick(HARD_POOL, rand), rand);
  const up = pick(UPS, rand);
  return { cards: ids.map((v) => cardFor(v, rand)), up, upCard: cardFor(up, rand) };
}

/* All five moves are open in the drill, except surrender when the table
 * doesn't offer it.
 */
export function drillCan(rules) {
  return { double: true, split: true, surrender: !!rules.surrender };
}

export function gradeStrategy(q, answer, rules = {}) {
  const can = drillCan(rules);
  const b = basic(q.cards, q.up, rules, can);
  const cell = cellFor(q.cards, q.up, { canSplit: true });
  const comp = fullComp(rules.decks || 6);
  const ids = q.cards.map(idx);
  ids.forEach((v) => { comp[v]--; });
  comp[q.up]--;
  const evs = moveEVs(ids, q.up, comp, rules);
  if (!rules.surrender) delete evs.R;
  if (!(ids[0] === ids[1])) delete evs.P;
  const loss = evs[answer] !== undefined && evs[b.action] !== undefined ? Math.max(0, evs[b.action] - evs[answer]) : 0;
  return {
    ok: answer === b.action, should: b.action, code: b.code,
    key: cellKey(cell), name: cellName(cell), why: why(cell, b.action), evs, loss,
  };
}

/* ── count drill ─────────────────────────────────────────────────────── */

export const COUNT_LENGTHS = [10, 20, 30, 52];
export const COUNT_SPEEDS = [{ ms: 1200, name: 'Easy' }, { ms: 750, name: 'Table' }, { ms: 450, name: 'Fast' }];

/* A run of cards from a shuffled single deck, so the count of a full deck
 * comes out to zero as a check.
 */
export function countRun(n, rand = Math.random) {
  const all = [];
  for (let v = 1; v <= 13; v++) {
    for (let s = 0; s < 4; s++) all.push(Math.min(v, 10));
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const cards = all.slice(0, Math.min(n, 52)).map((v) => cardFor(v, rand));
  const count = cards.reduce((a, c) => a + hiLo(c), 0);
  return { cards, count };
}

/* A true-count question: a running count and how much of the shoe is left. */
export function trueCountQuestion(rand = Math.random) {
  const decks = pick([1, 1.5, 2, 2.5, 3, 4, 5], rand);
  const tc = pick([-3, -2, -1, 1, 2, 3, 4, 5], rand);
  const rc = Math.round(tc * decks);
  return { rc, decks, answer: Math.trunc(rc / decks) };
}
