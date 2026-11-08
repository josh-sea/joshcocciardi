/* Cards, shoes and hand totals. Pure: no DOM, no Firebase.
 *
 * A card is two characters, rank then suit: "As", "Td", "9h". Tens, jacks,
 * queens and kings are all worth 10 and are counted together everywhere
 * (index 10), aces are index 1. A "composition" is an array of 11 counts,
 * index 1 to 10, of the cards still to come.
 */

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_LABEL = { A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K' };

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const isRed = (c) => c[1] === 'h' || c[1] === 'd';
export const label = (c) => RANK_LABEL[c[0]] || c[0];

/* 1 for an ace, 10 for any ten-card, the pip otherwise. */
export function idx(c) {
  const r = c[0];
  if (r === 'A') return 1;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

/* What a list of card indexes adds up to. An ace counts 11 when that
 * doesn't bust the hand, and the hand is then "soft".
 */
export function totalOf(ids) {
  let sum = 0, ace = false;
  for (const v of ids) { sum += v; if (v === 1) ace = true; }
  const soft = ace && sum + 10 <= 21;
  return { total: soft ? sum + 10 : sum, soft, hard: sum };
}

export function handValue(cards) {
  const list = (cards || []).filter((c) => c && c !== '??');
  const t = totalOf(list.map(idx));
  return { ...t, bust: t.total > 21, bj: list.length === 2 && t.total === 21, n: list.length };
}

/* "Soft 18", "16", "Bust", "Blackjack". `fromSplit` hands can make 21 in
 * two cards but that is not a blackjack.
 */
export function describe(cards, fromSplit = false) {
  const v = handValue(cards);
  if (!v.n) return '';
  if (v.bust) return 'Bust';
  if (v.bj && !fromSplit) return 'Blackjack';
  if (v.soft && v.total < 21) return `Soft ${v.total}`;
  return String(v.total);
}

export function freshDeck() {
  const out = [];
  for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildShoe(decks, rand = Math.random) {
  let all = [];
  for (let d = 0; d < decks; d++) all = all.concat(freshDeck());
  return shuffle(all, rand);
}

/* Composition of a full shoe: four of each rank per deck, sixteen tens. */
export function fullComp(decks) {
  const c = new Array(11).fill(0);
  for (let i = 1; i <= 9; i++) c[i] = 4 * decks;
  c[10] = 16 * decks;
  return c;
}

/* What is left in the shoe from what has been seen. Never below zero, so a
 * miscount on a page that reloaded mid-round can't make a negative chance.
 */
export function compLeft(decks, seen) {
  const c = fullComp(decks);
  for (let i = 1; i <= 10; i++) c[i] = Math.max(0, c[i] - ((seen && seen[i]) || 0));
  return c;
}

export const compSize = (comp) => comp.reduce((a, b) => a + (b || 0), 0);

/* Hi-Lo: small cards out are good for the player, big cards out are bad. */
export function hiLo(c) {
  const v = typeof c === 'number' ? c : idx(c);
  if (v >= 2 && v <= 6) return 1;
  if (v === 1 || v === 10) return -1;
  return 0;
}

export function runningCount(seen) {
  let rc = 0;
  for (let i = 1; i <= 10; i++) rc += hiLo(i) * ((seen && seen[i]) || 0);
  return rc;
}

/* Running count over decks still to be dealt, to the nearest half deck the
 * way people estimate it from the discard tray. Rounded toward zero to one
 * decimal for display; strategy uses the floor, as most players are taught.
 */
export function trueCount(rc, cardsLeft) {
  const decks = Math.max(0.5, Math.round((cardsLeft / 52) * 2) / 2);
  return rc / decks;
}

export const decksLeft = (cardsLeft) => Math.max(0.5, Math.round((cardsLeft / 52) * 2) / 2);

/* A random card of a given index, for drills that need a face to show. */
export function cardFor(v, rand = Math.random) {
  const suit = SUITS[Math.floor(rand() * 4)];
  if (v === 1) return 'A' + suit;
  if (v === 10) return ['T', 'J', 'Q', 'K'][Math.floor(rand() * 4)] + suit;
  return String(v) + suit;
}
