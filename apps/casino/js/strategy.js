/* Basic strategy, and the count-based plays that change it. Pure.
 *
 * The chart is the standard one for 4 to 8 decks with the dealer peeking
 * for blackjack. It shifts with the table rules: whether the dealer hits
 * soft 17, whether you may double after a split, and whether late
 * surrender is offered. With one or two decks a handful of cells differ;
 * the odds panel (odds.js) works from the real shoe and shows them.
 *
 * Chart codes, as on a printed card:
 *   H hit · S stand · D double, else hit · Ds double, else stand
 *   P split · Ph split if you can double after, else hit
 *   R surrender, else hit · Rs surrender, else stand · Rp surrender, else split
 */
import { handValue, idx, trueCount } from './cards.js';

export const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
export const UP_LABEL = (u) => (u === 1 ? 'A' : String(u));
const col = (up) => (up === 1 ? 9 : up - 2);

const row = (s) => s.trim().split(/\s+/);

/* S17, DAS, late surrender. H17 differences are patched in below. */
const HARD = {
  5: row('H H H H H H H H H H'),
  6: row('H H H H H H H H H H'),
  7: row('H H H H H H H H H H'),
  8: row('H H H H H H H H H H'),
  9: row('H D D D D H H H H H'),
  10: row('D D D D D D D D H H'),
  11: row('D D D D D D D D D H'),
  12: row('H H S S S H H H H H'),
  13: row('S S S S S H H H H H'),
  14: row('S S S S S H H H H H'),
  15: row('S S S S S H H H R H'),
  16: row('S S S S S H H R R R'),
  17: row('S S S S S S S S S S'),
  18: row('S S S S S S S S S S'),
  19: row('S S S S S S S S S S'),
  20: row('S S S S S S S S S S'),
  21: row('S S S S S S S S S S'),
};

/* Keyed by the card next to the ace: A2 is soft 13. */
const SOFT = {
  2: row('H H H D D H H H H H'),
  3: row('H H H D D H H H H H'),
  4: row('H H D D D H H H H H'),
  5: row('H H D D D H H H H H'),
  6: row('H D D D D H H H H H'),
  7: row('S Ds Ds Ds Ds S S H H H'),
  8: row('S S S S S S S S S S'),
  9: row('S S S S S S S S S S'),
  10: row('S S S S S S S S S S'),
};

/* Keyed by the pair's card index, 1 for aces. */
const PAIRS = {
  1: row('P P P P P P P P P P'),
  2: row('Ph Ph P P P P H H H H'),
  3: row('Ph Ph P P P P H H H H'),
  4: row('H H H Ph Ph H H H H H'),
  5: row('D D D D D D D D H H'),
  6: row('Ph P P P P H H H H H'),
  7: row('P P P P P P H H H H'),
  8: row('P P P P P P P P P P'),
  9: row('P P P P P S P P S S'),
  10: row('S S S S S S S S S S'),
};

const H17_PATCH = [
  ['hard', 11, 1, 'D'],
  ['hard', 15, 1, 'R'],
  ['hard', 17, 1, 'Rs'],
  ['soft', 7, 2, 'Ds'],
  ['soft', 8, 6, 'Ds'],
  ['pair', 8, 1, 'Rp'],
];

/* The chart for a set of rules, as three tables of raw codes. */
export function chart(rules = {}) {
  const t = {
    hard: Object.fromEntries(Object.entries(HARD).map(([k, v]) => [k, v.slice()])),
    soft: Object.fromEntries(Object.entries(SOFT).map(([k, v]) => [k, v.slice()])),
    pair: Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [k, v.slice()])),
  };
  if (rules.h17) for (const [kind, key, up, code] of H17_PATCH) t[kind][key][col(up)] = code;
  return t;
}

/* Which cell of the chart a hand falls in. */
export function cellFor(cards, up, { canSplit = true } = {}) {
  const ids = cards.map(idx);
  const v = handValue(cards);
  if (canSplit && ids.length === 2 && ids[0] === ids[1]) return { kind: 'pair', key: ids[0], up };
  if (v.soft && v.total < 21) return { kind: 'soft', key: v.total - 11, up };
  return { kind: 'hard', key: Math.max(5, Math.min(21, v.total)), up };
}

export function cellName({ kind, key, up }) {
  const u = UP_LABEL(up);
  if (kind === 'pair') return `${key === 1 ? 'A' : key === 10 ? '10' : key},${key === 1 ? 'A' : key === 10 ? '10' : key} vs ${u}`;
  if (kind === 'soft') return `Soft ${key + 11} vs ${u}`;
  return `Hard ${key} vs ${u}`;
}

export const cellKey = (c) => `${c.kind}:${c.key}:${c.up}`;

export const ACTION_NAME = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender', I: 'Insurance', N: 'No insurance' };

/* Turn a chart code into the move you can actually make right now. */
export function resolve(code, { canDouble, canSplit, canSurrender, das }) {
  switch (code) {
    case 'D': return canDouble ? 'D' : 'H';
    case 'Ds': return canDouble ? 'D' : 'S';
    case 'P': return canSplit ? 'P' : null;
    case 'Ph': return canSplit && das ? 'P' : 'H';
    case 'R': return canSurrender ? 'R' : 'H';
    case 'Rs': return canSurrender ? 'R' : 'S';
    case 'Rp': return canSurrender ? 'R' : canSplit ? 'P' : null;
    default: return code;
  }
}

/* The basic-strategy move. `can` says what the table allows on this hand
 * right now. A pair you may not split again falls back to its total.
 */
export function basic(cards, up, rules = {}, can = {}) {
  const t = chart(rules);
  const opts = { canDouble: !!can.double, canSplit: !!can.split, canSurrender: !!can.surrender, das: rules.das !== false };
  let cell = cellFor(cards, up, { canSplit: opts.canSplit });
  let code = t[cell.kind][cell.key][col(up)];
  let action = resolve(code, opts);
  if (action === null) {
    cell = cellFor(cards, up, { canSplit: false });
    code = t[cell.kind][cell.key][col(up)];
    action = resolve(code, opts);
  }
  return { action, code, cell };
}

/* ── counting ────────────────────────────────────────────────────────────
 * The Illustrious 18 and the Fab 4 surrenders (Hi-Lo, multi-deck). Each
 * says: at this true count or above, play `then`; below it, the chart.
 * A few go the other way (`below: true`): hit when the count is under the
 * index, where the chart says stand.
 */
export const DEVIATIONS = [
  { kind: 'hard', key: 16, up: 10, at: 0, then: 'S', note: 'Stand 16 v 10 at 0 or higher' },
  { kind: 'hard', key: 15, up: 10, at: 4, then: 'S', note: 'Stand 15 v 10 at +4' },
  { kind: 'pair', key: 10, up: 5, at: 5, then: 'P', note: 'Split tens v 5 at +5' },
  { kind: 'pair', key: 10, up: 6, at: 4, then: 'P', note: 'Split tens v 6 at +4' },
  { kind: 'hard', key: 10, up: 10, at: 4, then: 'D', note: 'Double 10 v 10 at +4' },
  { kind: 'hard', key: 12, up: 3, at: 2, then: 'S', note: 'Stand 12 v 3 at +2' },
  { kind: 'hard', key: 12, up: 2, at: 3, then: 'S', note: 'Stand 12 v 2 at +3' },
  { kind: 'hard', key: 11, up: 1, at: 1, then: 'D', note: 'Double 11 v A at +1', s17: true },
  { kind: 'hard', key: 9, up: 2, at: 1, then: 'D', note: 'Double 9 v 2 at +1' },
  { kind: 'hard', key: 10, up: 1, at: 4, then: 'D', note: 'Double 10 v A at +4' },
  { kind: 'hard', key: 9, up: 7, at: 3, then: 'D', note: 'Double 9 v 7 at +3' },
  { kind: 'hard', key: 16, up: 9, at: 5, then: 'S', note: 'Stand 16 v 9 at +5' },
  { kind: 'hard', key: 13, up: 2, at: -1, then: 'H', below: true, note: 'Hit 13 v 2 below -1' },
  { kind: 'hard', key: 12, up: 4, at: 0, then: 'H', below: true, note: 'Hit 12 v 4 below 0' },
  { kind: 'hard', key: 12, up: 5, at: -2, then: 'H', below: true, note: 'Hit 12 v 5 below -2' },
  { kind: 'hard', key: 12, up: 6, at: -1, then: 'H', below: true, note: 'Hit 12 v 6 below -1' },
  { kind: 'hard', key: 13, up: 3, at: -2, then: 'H', below: true, note: 'Hit 13 v 3 below -2' },
  // Fab 4: only when surrender is on the table.
  { kind: 'hard', key: 14, up: 10, at: 3, then: 'R', surrender: true, note: 'Surrender 14 v 10 at +3' },
  { kind: 'hard', key: 15, up: 10, at: 0, then: 'R', surrender: true, note: 'Surrender 15 v 10 at 0 or higher' },
  { kind: 'hard', key: 15, up: 9, at: 2, then: 'R', surrender: true, note: 'Surrender 15 v 9 at +2' },
  { kind: 'hard', key: 15, up: 1, at: 1, then: 'R', surrender: true, note: 'Surrender 15 v A at +1', s17: true },
];

export const INSURANCE_INDEX = 3;

/* The count-adjusted move, or null when the count doesn't change anything.
 * Surrender deviations take priority on a hand where surrender is allowed,
 * which is how the Fab 4 are meant to be used.
 */
export function deviation(cards, up, tc, rules = {}, can = {}) {
  const cell = cellFor(cards, up, { canSplit: !!can.split });
  const chartMove = basic(cards, up, rules, can).action;
  const t = Math.floor(tc);
  const hits = DEVIATIONS.filter((d) => d.kind === cell.kind && d.key === cell.key && d.up === up
    && (!d.s17 || !rules.h17) && (!d.surrender || can.surrender)
    // Where the chart already surrenders, only a surrender index applies.
    && (chartMove !== 'R' || d.surrender));
  hits.sort((a, b) => (b.surrender ? 1 : 0) - (a.surrender ? 1 : 0));
  for (const d of hits) {
    const on = d.below ? t < d.at : t >= d.at;
    if (!on) continue;
    let action = d.then;
    if (action === 'D' && !can.double) action = 'H';
    if (action === 'P' && !can.split) continue;
    return { action, note: d.note, index: d.at };
  }
  // 15 v 10 with surrender and a negative count: the chart's surrender
  // becomes a hit (Fab 4).
  if (cell.kind === 'hard' && cell.key === 15 && up === 10 && can.surrender && t < 0) {
    return { action: 'H', note: 'Hit 15 v 10 below 0 (don\'t surrender)', index: 0 };
  }
  return null;
}

/* Everything a hint needs: the chart move and, if counting, the count move. */
export function advise(cards, up, rules, can, { seen = null, cardsLeft = 0, counting = false, rc = 0 } = {}) {
  const b = basic(cards, up, rules, can);
  const out = { ...b, name: cellName(b.cell), dev: null };
  if (counting && cardsLeft) {
    const tc = trueCount(rc, cardsLeft);
    const d = deviation(cards, up, tc, rules, can);
    if (d && d.action !== b.action) out.dev = { ...d, tc };
  }
  return out;
}

/* One sentence on why the chart says what it says. Not exhaustive, just
 * the reasons people are actually taught.
 */
export function why(cell, action) {
  const { kind, key, up } = cell;
  const weak = up >= 2 && up <= 6;
  if (kind === 'pair') {
    if (key === 1) return 'Always split aces: two hands starting at 11 beat one soft 12.';
    if (key === 8) return action === 'R' ? 'Against an ace that hits soft 17, 8,8 loses so often that giving up half is cheapest.' : 'Always split 8s: 16 is the worst total, while each 8 is a fresh start.';
    if (key === 10) return action === 'P' ? 'Only at a high count: the dealer\'s small card plus a ten-rich shoe makes two 10s worth more than 20.' : 'Never split 10s: 20 already wins most of the time.';
    if (key === 5) return 'Never split 5s: play them as a hard 10.';
    if (key === 9 && (up === 7 || up === 10 || up === 1)) return '18 already beats a dealer 17, and splitting into a 10 or ace is too risky.';
    if (action === 'P') return weak ? 'The dealer is likely to bust, so get more money out against a weak card.' : 'Each card on its own starts better than the pair\'s total does.';
    return 'The pair is worth more as a total than as two hands here.';
  }
  if (kind === 'soft') {
    const t = key + 11;
    if (action === 'D') return 'A soft hand can\'t bust on one card, and the dealer\'s weak card makes this a good time to put more out.';
    if (t <= 17) return 'Soft 17 or less never wins standing; take a free card, you can\'t bust.';
    if (t === 18 && action === 'H') return 'Soft 18 loses to a 9, 10 or ace more than it wins; one more card helps.';
    return 'A strong total. Keep it.';
  }
  if (action === 'R') return 'This hand wins less than a quarter of the time against this card, so giving up half the bet loses less.';
  if (action === 'D') return key === 11 ? '11 is the best hand to double: any ten makes 21.' : `A ${key} lands on 17 to 21 often, and the dealer card is weak enough to put twice the money out.`;
  if (key >= 17) return 'Stand on hard 17 or more: too many cards bust you.';
  if (key <= 11) return 'You can\'t bust with one card, so always take one.';
  if (action === 'S') return weak ? 'The dealer shows a bust card (2 to 6); let them take the risk.' : 'Standing loses, but hitting loses more.';
  return up >= 7 || up === 1 ? 'The dealer probably has 17 or better, so a stiff hand has to try to improve.' : 'Hitting 12 against a 2 or 3 busts less often than the dealer makes a hand.';
}
