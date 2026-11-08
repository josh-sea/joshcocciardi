/* The odds panel's maths. Pure.
 *
 * Everything here works from a composition (cards.js): how many of each
 * card are still in the shoe. Each draw is taken from that mix without
 * removing it again, the usual "infinite deck from this shoe" model. It is
 * fast enough to run on every render, and within a fraction of a percent
 * of the exact numbers for a shoe with a deck or more left.
 *
 * Expected value (EV) is in bets: +0.10 means you win a tenth of your bet
 * on average, -1 means you lose all of it.
 */
import { totalOf } from './cards.js';

export function probs(comp) {
  const n = comp.reduce((a, b) => a + (b || 0), 0) || 1;
  const p = new Array(11).fill(0);
  for (let i = 1; i <= 10; i++) p[i] = (comp[i] || 0) / n;
  return p;
}

const val = (sum, ace) => (ace && sum + 10 <= 21 ? sum + 10 : sum);
const isSoft = (sum, ace) => ace && sum + 10 <= 21;

/* Where the dealer ends up from a hard sum and whether they hold an ace. */
function dealerFinish(sum, ace, p, h17, memo) {
  const k = sum * 2 + (ace ? 1 : 0);
  if (memo[k]) return memo[k];
  const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  const v = val(sum, ace);
  if (sum > 21) out.bust = 1;
  else if (v > 17 || (v === 17 && !(h17 && isSoft(sum, ace)))) out[v] = 1;
  else {
    for (let c = 1; c <= 10; c++) {
      if (!p[c]) continue;
      const sub = dealerFinish(sum + c, ace || c === 1, p, h17, memo);
      for (const key in out) out[key] += p[c] * sub[key];
    }
  }
  memo[k] = out;
  return out;
}

/* The dealer's final total from their upcard (1 for an ace).
 *
 * `peeked`: the dealer has checked for blackjack and doesn't have it, so
 * an ace can't be hiding a ten and a ten can't be hiding an ace. That is
 * what every decision after the deal is made against. Without it, `bj` is
 * the chance the dealer has blackjack.
 */
export function dealerOdds(up, comp, { h17 = false, peeked = true } = {}) {
  const p = probs(comp);
  const q = p.slice();
  if (peeked && (up === 1 || up === 10)) {
    q[up === 1 ? 10 : 1] = 0;
    const n = q.reduce((a, b) => a + b, 0) || 1;
    for (let i = 1; i <= 10; i++) q[i] /= n;
  }
  const memo = {};
  const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, bj: 0 };
  for (let c = 1; c <= 10; c++) {
    if (!q[c]) continue;
    if ((up === 1 && c === 10) || (up === 10 && c === 1)) { out.bj += q[c]; continue; }
    const sub = dealerFinish(up + c, up === 1 || c === 1, p, h17, memo);
    for (const key in sub) out[key] += q[c] * sub[key];
  }
  return out;
}

/* Standing on `total` against a finished dealer. */
export function standOdds(total, d) {
  if (total > 21) return { win: 0, push: 0, lose: 1, ev: -1 };
  let win = d.bust, push = 0, lose = d.bj || 0;
  for (let t = 17; t <= 21; t++) {
    if (t < total) win += d[t];
    else if (t === total) push += d[t];
    else lose += d[t];
  }
  return { win, push, lose, ev: win - lose };
}

/* EV of every move for a hand of card indexes against an upcard.
 *
 *   stand, hit, double, surrender, split (split only for a pair)
 *
 * After a hit you keep playing your best (hit or stand). Split is two
 * hands that each start with one card, may double if the rules allow it,
 * and are not split again; split aces get one card each. Those are small
 * simplifications that move split EVs by well under 1%.
 */
export function moveEVs(ids, up, comp, rules = {}) {
  const p = probs(comp);
  const d = dealerOdds(up, comp, { h17: !!rules.h17, peeked: true });
  const standCache = {};
  const stand = (t) => (standCache[t] !== undefined ? standCache[t] : (standCache[t] = standOdds(t, d).ev));
  const hitMemo = {};
  // Best of hit and stand from a hard sum, after at least one more card.
  const best = (sum, ace) => {
    if (sum > 21) return -1;
    return Math.max(stand(val(sum, ace)), hit(sum, ace));
  };
  const hit = (sum, ace) => {
    const k = sum * 2 + (ace ? 1 : 0);
    if (hitMemo[k] !== undefined) return hitMemo[k];
    let ev = 0;
    for (let c = 1; c <= 10; c++) if (p[c]) ev += p[c] * best(sum + c, ace || c === 1);
    hitMemo[k] = ev;
    return ev;
  };
  const dbl = (sum, ace) => {
    let ev = 0;
    for (let c = 1; c <= 10; c++) {
      if (!p[c]) continue;
      const s = sum + c;
      ev += p[c] * (s > 21 ? -1 : stand(val(s, ace || c === 1)));
    }
    return 2 * ev;
  };
  const { hard } = totalOf(ids);
  const ace = ids.includes(1);
  const out = {
    S: stand(val(hard, ace)),
    H: hit(hard, ace),
    D: dbl(hard, ace),
    R: -0.5,
  };
  if (ids.length === 2 && ids[0] === ids[1]) {
    const r = ids[0];
    let one = 0;
    for (let c = 1; c <= 10; c++) {
      if (!p[c]) continue;
      const sum = r + c, a = r === 1 || c === 1;
      if (r === 1) one += p[c] * stand(val(sum, a));
      else {
        let m = Math.max(stand(val(sum, a)), hit(sum, a));
        if (rules.das !== false) m = Math.max(m, dbl(sum, a));
        one += p[c] * m;
      }
    }
    out.P = 2 * one;
  }
  return out;
}

/* What one more card does to the hand: chance of each new total and of
 * busting. Totals are 4 to 21 plus 'bust'.
 */
export function nextCard(ids, comp) {
  const p = probs(comp);
  const { hard } = totalOf(ids);
  const ace = ids.includes(1);
  const out = { bust: 0, totals: {} };
  for (let c = 1; c <= 10; c++) {
    if (!p[c]) continue;
    const s = hard + c;
    if (s > 21) { out.bust += p[c]; continue; }
    const t = val(s, ace || c === 1);
    out.totals[t] = (out.totals[t] || 0) + p[c];
  }
  return out;
}

/* Insurance pays 2 to 1 and wins when the hole card is a ten, so it is
 * worth taking only when more than a third of the cards left are tens.
 */
export function insuranceOdds(comp) {
  const p = probs(comp);
  return { tenChance: p[10], ev: 3 * p[10] - 1, breakEven: 1 / 3 };
}

/* House edge of the rules as a rough sum of the usual adjustments, from a
 * baseline of a 6-deck S17 DAS shoe with no surrender (about 0.40%).
 * Positive is the house's edge. For the rules panel, not for play.
 */
export function houseEdge(rules = {}) {
  const decks = { 1: -0.48, 2: -0.19, 4: -0.06, 6: 0, 8: 0.02 };
  let e = 0.40 + (decks[rules.decks] ?? 0);
  if (rules.h17) e += 0.22;
  if (rules.das === false) e += 0.14;
  if (rules.surrender) e -= 0.08;
  if (rules.bj && rules.bj < 1.5) e += 1.39;
  return e;
}
