/* The maths and the advice behind the craps table. Pure.
 *
 * Every number here is worked out from the 36 ways two dice can land, not
 * typed in, so the house edges on the layout, the drawer's chances and the
 * tutorial all agree with each other (and the tests check them against
 * the published figures).
 */
import { WAYS, POINTS, TRUE_ODDS, LAY_ODDS, PLACE_PAYS, HARD_PAYS, PROP_PAYS, parseKey, maxOdds, betName } from './craps.js';

export const P = WAYS.map((w) => w / 36);

/* Chance the number n is rolled before a 7. */
export const beforeSeven = (n) => WAYS[n] / (WAYS[n] + 6);

/* Pass line from the come-out: win on 7 or 11, or make the point. */
export const PASS_WIN = P[7] + P[11] + POINTS.reduce((a, n) => a + P[n] * beforeSeven(n), 0);
export const PASS_LOSE = 1 - PASS_WIN;

/* What a bet pays per $1 when it wins. */
export function payRatio(key, point = 0, rules = {}) {
  const { base, n } = parseKey(key);
  switch (base) {
    case 'pass': case 'dp': case 'come': case 'dc': return 1;
    case 'passOdds': return TRUE_ODDS[point] || 0;
    case 'dpOdds': return LAY_ODDS[point] || 0;
    case 'comeOdds': return TRUE_ODDS[n];
    case 'dcOdds': return LAY_ODDS[n];
    case 'place': return PLACE_PAYS[n];
    case 'hard': return HARD_PAYS[n];
    case 'field': return 1; // 2 and 12 pay more; see fieldEV
    default: return PROP_PAYS[base] || 0;
  }
}

/* How a bet ends, from the moment it is made with this point:
 * { win, lose, push } probabilities and its EV per $1.
 */
export function eventual(key, point = 0, rules = {}) {
  const { base, n } = parseKey(key);
  const one = (wins, ratio) => {
    const w = wins.reduce((a, t) => a + P[t], 0);
    return { win: w, lose: 1 - w, push: 0, ev: w * ratio - (1 - w) };
  };
  const vsSeven = (num, ratio, dont = false) => {
    const w = dont ? 1 - beforeSeven(num) : beforeSeven(num);
    return { win: w, lose: 1 - w, push: 0, ev: w * ratio - (1 - w) };
  };
  switch (base) {
    case 'pass':
      if (point) return vsSeven(point, 1);
      return { win: PASS_WIN, lose: PASS_LOSE, push: 0, ev: PASS_WIN - PASS_LOSE };
    case 'come':
      if (n) return vsSeven(n, 1);
      return { win: PASS_WIN, lose: PASS_LOSE, push: 0, ev: PASS_WIN - PASS_LOSE };
    case 'dp':
    case 'dc': {
      const num = base === 'dp' ? point : n;
      if (num) return vsSeven(num, 1, true);
      const push = P[12];
      const win = P[2] + P[3] + POINTS.reduce((a, x) => a + P[x] * (1 - beforeSeven(x)), 0);
      const lose = 1 - win - push;
      return { win, lose, push, ev: win - lose };
    }
    case 'passOdds': return vsSeven(point, TRUE_ODDS[point]);
    case 'dpOdds': return vsSeven(point, LAY_ODDS[point], true);
    case 'comeOdds': return vsSeven(n, TRUE_ODDS[n]);
    case 'dcOdds': return vsSeven(n, LAY_ODDS[n], true);
    case 'place': return vsSeven(n, PLACE_PAYS[n]);
    case 'hard': {
      const w = 1 / (1 + (WAYS[n] - 1) + 6);
      return { win: w, lose: 1 - w, push: 0, ev: w * HARD_PAYS[n] - (1 - w) };
    }
    case 'field': {
      const w = P[3] + P[4] + P[9] + P[10] + P[11];
      const big = P[2] * 2 + P[12] * (rules.field12 || 3);
      const win = w + P[2] + P[12];
      return { win, lose: 1 - win, push: 0, ev: w + big - (1 - win) };
    }
    case 'seven': return one([7], PROP_PAYS.seven);
    case 'anyCraps': return one([2, 3, 12], PROP_PAYS.anyCraps);
    case 'yo': return one([11], PROP_PAYS.yo);
    case 'aces': return one([2], PROP_PAYS.aces);
    case 'aceDeuce': return one([3], PROP_PAYS.aceDeuce);
    case 'twelve': return one([12], PROP_PAYS.twelve);
    default: return { win: 0, lose: 0, push: 0, ev: 0 };
  }
}

/* The house edge of a bet as it is usually quoted: what it keeps of each
 * dollar bet, in percent, made at the point it can first be made.
 */
export function houseEdge(key, rules = {}) {
  const { base } = parseKey(key);
  if (base === 'passOdds' || base === 'dpOdds' || base === 'comeOdds' || base === 'dcOdds') return 0;
  // A come bet on a number is still the come bet it was made as.
  if (base === 'come' || base === 'dc') return -eventual(base, 0, rules).ev * 100;
  return -eventual(key, 0, rules).ev * 100;
}

export function edgeClass(edge) {
  if (edge < 0.01) return 'free';
  if (edge <= 1.6) return 'good';
  if (edge <= 4.1) return 'ok';
  if (edge <= 7) return 'poor';
  return 'bad';
}

export const EDGE_WORD = { free: 'no edge', good: 'good bet', ok: 'so-so', poor: 'poor', bad: 'sucker bet' };

/* What can happen to a bet on the very next roll. */
export function nextRoll(key, point = 0, rules = {}) {
  const { base, n } = parseKey(key);
  const comeOut = !point;
  const sum = (ts) => ts.reduce((a, t) => a + P[t], 0);
  switch (base) {
    case 'pass': return comeOut ? { win: sum([7, 11]), lose: sum([2, 3, 12]) } : { win: P[point], lose: P[7] };
    case 'dp': return comeOut ? { win: sum([2, 3]), lose: sum([7, 11]), push: P[12] } : { win: P[7], lose: P[point] };
    case 'passOdds': return { win: P[point], lose: P[7] };
    case 'dpOdds': return { win: P[7], lose: P[point] };
    case 'come': return n ? { win: P[n], lose: P[7] } : { win: sum([7, 11]), lose: sum([2, 3, 12]) };
    case 'dc': return n ? { win: P[7], lose: P[n] } : { win: sum([2, 3]), lose: sum([7, 11]), push: P[12] };
    case 'comeOdds': return comeOut ? { win: 0, lose: 0 } : { win: P[n], lose: P[7] };
    case 'dcOdds': return { win: P[7], lose: P[n] };
    case 'place': return comeOut ? { win: 0, lose: 0 } : { win: P[n], lose: P[7] };
    case 'hard': return comeOut ? { win: 0, lose: 0 } : { win: 1 / 36, lose: P[7] + P[n] - 1 / 36 };
    default: { const e = eventual(key, point, rules); return { win: e.win, lose: e.lose }; }
  }
}

/* The bets every layout shows, in the order the drawer lists them. */
export const LAYOUT_KEYS = ['pass', 'dp', 'passOdds', 'come', 'dc', 'place6', 'place8', 'place5', 'place9', 'place4', 'place10', 'field', 'hard6', 'hard8', 'hard4', 'hard10', 'anyCraps', 'yo', 'aceDeuce', 'aces', 'twelve', 'seven'];

export function edgeTable(rules = {}) {
  return LAYOUT_KEYS.map((key) => {
    const e = key === 'passOdds' ? 0 : houseEdge(key, rules);
    return { key, name: key === 'passOdds' ? 'Odds (behind any line or come bet)' : betName(key), edge: e, cls: edgeClass(e) };
  });
}

/* ── advice ──────────────────────────────────────────────────────────── */

/* One-tap setups. Each returns the bets to add, as [key, amount]. */
export const PRESETS = {
  pass: { name: 'Pass line', blurb: 'The basic bet. 1.41% edge.' },
  odds: { name: 'Max odds', blurb: 'Back your line and come bets with free odds.' },
  come: { name: 'Come + odds', blurb: 'Another "pass line" mid-round. Up to three numbers working.' },
  six8: { name: 'Place 6 & 8', blurb: 'The best place bets, in $6 units so they pay evenly.' },
  dont: { name: 'Don\'t pass', blurb: 'Bet against the shooter. 1.36%, and lay odds once there\'s a point.' },
};

const unit6 = (min) => Math.ceil(min / 6) * 6;

export function presetBets(name, seat, point, rules) {
  const b = seat.bets || {};
  const out = [];
  const min = rules.min || 5;
  const add = (key, amt) => { if (amt > 0) out.push([key, Math.round(amt * 100) / 100]); };
  const oddsUp = () => {
    if (point && b.pass) add('passOdds', maxOdds(b.pass, point, rules.odds) - (b.passOdds || 0));
    if (point && b.dp) add('dpOdds', maxOdds(b.dp, point, rules.odds, true) - (b.dpOdds || 0));
    for (const n of POINTS) {
      if (b[`come${n}`]) add(`comeOdds${n}`, maxOdds(b[`come${n}`], n, rules.odds) - (b[`comeOdds${n}`] || 0));
      if (b[`dc${n}`]) add(`dcOdds${n}`, maxOdds(b[`dc${n}`], n, rules.odds, true) - (b[`dcOdds${n}`] || 0));
    }
  };
  if (name === 'pass' && !point && !b.pass) add('pass', min);
  if (name === 'dont' && !point && !b.dp) add('dp', min);
  if (name === 'odds') oddsUp();
  if (name === 'come' && point) {
    const working = POINTS.filter((n) => b[`come${n}`]).length;
    if (working < 2 && !b.come) add('come', min);
    oddsUp();
  }
  if (name === 'six8') {
    const u = unit6(min);
    if (!b.place6) add('place6', u);
    if (!b.place8) add('place8', u);
  }
  return out;
}

/* What to say about the bets on the table: the nudges a good dealer (or a
 * friend who knows) would give. Most important first.
 */
export function advice(seat, point, rules) {
  const b = seat.bets || {};
  const tips = [];
  const has = (k) => (b[k] || 0) > 0;
  if (!point && !has('pass') && !has('dp')) tips.push({ kind: 'start', text: 'Come-out roll: put a bet on the pass line. Most of the table bets this way, and the house keeps only 1.41%.', preset: 'pass' });
  if (point && has('pass')) {
    const max = maxOdds(b.pass, point, rules.odds);
    if ((b.passOdds || 0) < max - 0.01) tips.push({ kind: 'odds', text: `Take odds behind your pass line (up to $${max}). Odds pay true odds, ${TRUE_ODDS[point] === 1.2 ? '6 to 5' : TRUE_ODDS[point] === 1.5 ? '3 to 2' : '2 to 1'} on the ${point}, so the house has no edge on them at all.`, preset: 'odds' });
  }
  if (point && has('dp')) {
    const max = maxOdds(b.dp, point, rules.odds, true);
    if ((b.dpOdds || 0) < max - 0.01) tips.push({ kind: 'odds', text: `You can lay odds behind don't pass (up to $${max}). No house edge, and the 7 is your friend.`, preset: 'odds' });
  }
  for (const n of POINTS) {
    if (has(`come${n}`) && (b[`comeOdds${n}`] || 0) < maxOdds(b[`come${n}`], n, rules.odds) - 0.01) {
      tips.push({ kind: 'odds', text: `Your come bet moved to the ${n}. Back it with odds too.`, preset: 'odds' });
      break;
    }
  }
  const bad = Object.keys(b).filter((k) => houseEdge(k, rules) > 4.1);
  if (bad.length) {
    const worst = bad.map((k) => ({ k, e: houseEdge(k, rules) })).sort((x, y) => y.e - x.e)[0];
    tips.push({ kind: 'warn', text: `${betName(worst.k)} keeps ${worst.e.toFixed(1)}% of every dollar. The pass line keeps 1.41% and odds keep nothing. Fun, but it is where the house makes its money.` });
  }
  for (const n of [6, 8]) {
    if (has(`place${n}`) && Math.abs(b[`place${n}`] / 6 - Math.round(b[`place${n}`] / 6)) > 1e-9) {
      tips.push({ kind: 'tip', text: `Place the ${n} in multiples of $6: it pays 7 to 6, so $${b[`place${n}`]} gets rounded down when it wins.` });
      break;
    }
  }
  return tips;
}

/* What a bet costs you on average over its life, in dollars. */
export const expectedCost = (key, amt, rules) => (amt * houseEdge(key, rules)) / 100;

/* ── the payout drill ────────────────────────────────────────────────── */

const DRILL = [
  ['place6', [6, 12, 18, 30, 60]], ['place8', [6, 12, 24, 30, 36]],
  ['place5', [5, 10, 15, 25, 50]], ['place9', [5, 10, 20, 25, 40]],
  ['place4', [5, 10, 15, 25, 50]], ['place10', [5, 10, 20, 25]],
  ['comeOdds4', [5, 10, 15, 20, 30]], ['comeOdds5', [10, 20, 30, 40]],
  ['comeOdds6', [5, 10, 15, 25, 50]], ['comeOdds9', [10, 20, 40]], ['comeOdds10', [5, 10, 15, 25]],
  ['dcOdds4', [10, 20, 30, 40]], ['dcOdds6', [6, 12, 24, 30]], ['dcOdds5', [9, 15, 30]],
  ['hard6', [1, 5, 10]], ['hard4', [1, 5, 10]], ['yo', [1, 5, 10]], ['seven', [5, 10, 25]], ['anyCraps', [1, 5, 10]],
  ['field', [5, 10, 25]],
];

export function payout(key, amt, rules = {}, roll = 0) {
  const { base } = parseKey(key);
  let r = payRatio(key, 0, rules);
  if (base === 'field' && roll === 2) r = 2;
  if (base === 'field' && roll === 12) r = rules.field12 || 3;
  return Math.floor(amt * r * 100 + 1e-6) / 100;
}

export function payoutQuestion(rand = Math.random, rules = {}) {
  const [key, amts] = DRILL[Math.floor(rand() * DRILL.length)];
  const amt = amts[Math.floor(rand() * amts.length)];
  let roll = 0;
  if (key === 'field') roll = [2, 3, 4, 9, 10, 11, 12][Math.floor(rand() * 7)];
  const answer = payout(key, amt, rules, roll);
  const wrong = new Set();
  const near = [answer + amt, Math.max(1, answer - amt), Math.round(answer * 1.2), Math.round(answer / 1.2), answer + 1, amt, answer * 2];
  for (const w of near) {
    const v = Math.round(w * 100) / 100;
    if (v > 0 && Math.abs(v - answer) > 0.001) wrong.add(v);
    if (wrong.size >= 3) break;
  }
  const options = [answer, ...wrong].slice(0, 4).sort((a, b) => a - b);
  return { key, amt, roll, answer, options };
}
