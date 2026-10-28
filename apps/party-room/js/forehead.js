/* Forehead: the word is on your forehead, everyone else gets you to say it.
 * Nod the phone down when you get it, tip it up to pass.
 *
 * It works two ways. On its own, one phone and a couch full of people, with
 * nothing to sign in to. In a room, the person whose turn it is holds their
 * phone up and every other phone shows the same word, so the people on the
 * other end of a video call can play along without squinting at a forehead.
 */
import { FOREHEAD_DECKS } from './decks.js';
import { shuffle, obj, arr } from './room.js';

export const TURN_MS = 60000;
export const COUNTDOWN_MS = 3000;
export const TURNOVER_MS = 8000;
// A mark that left the guesser's phone just before the buzzer still counts.
export const LATE_MS = 1500;

/* ── the tilt ────────────────────────────────────────────────────────────── */

/* How much the screen faces the ceiling, from 1 (lying face up) through 0
 * (upright, as on a forehead) to -1 (face down). It is the vertical part of
 * the screen's normal, cos(beta) * cos(gamma), which does not care whether
 * the phone is held in portrait or landscape.
 */
export function screenUp(beta, gamma) {
  const r = Math.PI / 180;
  return Math.cos((beta || 0) * r) * Math.cos((gamma || 0) * r);
}

export const TRIGGER = 0.6;
export const REARM = 0.35;

/* A latch: one tilt is one answer. It fires as the screen swings past
 * TRIGGER towards the floor (got it) or the ceiling (pass), and will not
 * fire again until the phone comes back upright.
 */
export function tiltLatch() {
  let armed = false; // not until the phone has been upright once
  return (up) => {
    if (!Number.isFinite(up)) return null;
    if (Math.abs(up) < REARM) { armed = true; return null; }
    if (!armed) return null;
    if (up <= -TRIGGER) { armed = false; return 'got'; }
    if (up >= TRIGGER) { armed = false; return 'pass'; }
    return null;
  };
}

export function deal(deckId, rand = Math.random) {
  const deck = FOREHEAD_DECKS[deckId] || FOREHEAD_DECKS.animals;
  return shuffle(deck.cards, rand);
}

/* ── in a room ───────────────────────────────────────────────────────────── */

export function start(players, opts = {}, ctx) {
  const deck = FOREHEAD_DECKS[opts.deck] ? opts.deck : 'animals';
  const scores = {};
  players.forEach((p) => { scores[p.uid] = 0; });
  const order = players.map((p) => p.uid);
  return {
    pub: { game: 'forehead', deck, phase: 'ready', turn: 0, turns: order.length, guesser: order[0], scores },
    vault: { order },
    secret: {},
  };
}

function nextTurn(w, ctx) {
  const here = new Set(ctx.players.map((pl) => pl.uid));
  const order = arr(w.vault.order);
  let next = w.pub.turn + 1;
  while (next < order.length && !here.has(order[next])) next++;
  if (next >= order.length) { w.pub.phase = 'over'; delete w.pub.deadline; return; }
  Object.assign(w.pub, { phase: 'ready', turn: next, guesser: order[next] });
  delete w.pub.cards;
  delete w.pub.results;
  delete w.pub.startsAt;
  delete w.pub.deadline;
}

export function act(w, uid, msg, ctx) {
  const p = w.pub;
  if (uid !== p.guesser) return w;
  if (msg.t === 'go' && p.phase === 'ready') {
    p.cards = deal(p.deck, ctx.rand);
    p.results = [];
    p.startsAt = ctx.now + COUNTDOWN_MS;
    p.deadline = p.startsAt + TURN_MS;
    p.phase = 'playing';
    return w;
  }
  if (msg.t === 'mark' && p.phase === 'playing') {
    const results = arr(p.results);
    if (msg.i !== results.length || msg.i >= arr(p.cards).length) return w; // a repeat, or out of order
    if (ctx.now > p.deadline + LATE_MS) return w;
    p.results = [...results, msg.ok ? 1 : 0];
    if (msg.ok) p.scores[uid] = (p.scores[uid] || 0) + 1;
    if (p.results.length >= arr(p.cards).length) { p.phase = 'turnover'; p.deadline = ctx.now + TURNOVER_MS; }
  }
  return w;
}

export function tick(w, ctx) {
  const p = w.pub;
  const here = new Set(ctx.players.map((pl) => pl.uid));
  const order = arr(w.vault.order);
  for (const pl of ctx.players) {
    if (!(pl.uid in p.scores)) {
      p.scores[pl.uid] = 0;
      if (!order.slice(p.turn + 1).includes(pl.uid)) order.push(pl.uid);
    }
  }
  w.vault.order = order;
  p.turns = order.length;
  if (p.phase === 'ready' && !here.has(p.guesser)) nextTurn(w, ctx);
  else if (p.phase === 'playing' && (ctx.now >= p.deadline + LATE_MS || !here.has(p.guesser))) {
    p.phase = 'turnover';
    p.deadline = ctx.now + TURNOVER_MS;
  } else if (p.phase === 'turnover' && ctx.now >= p.deadline) nextTurn(w, ctx);
  return w;
}

/* What the guesser's own phone shows, given how many cards it has marked.
 * The phone runs ahead of the room so a nod changes the card at once.
 */
export function currentCard(pub, marked) {
  const cards = arr(obj(pub).cards);
  return marked < cards.length ? cards[marked] : null;
}
