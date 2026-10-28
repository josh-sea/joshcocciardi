/* Chips & Dip: two chips on the table ("Sticky", "Famous"), and everyone
 * except the judge plays the dip from their hand that goes best with both.
 * The judge sees the dips without names and picks a favorite. First to the
 * target wins.
 *
 * Hands are dealt by the host into each player's private slot, and the
 * dips go on the table shuffled and unnamed. Who played what is in the
 * vault until the judge has chosen.
 */
import { CHIPS, DIPS } from './decks.js';
import { shuffle, obj, arr } from './room.js';

export const HAND = 5;
export const PLAY_MS = 90000;
export const JUDGE_MS = 60000;
export const REVEAL_MS = 7000;
export const TARGETS = [3, 5, 7];

function draw(w, ctx, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!arr(w.vault.dips).length) w.vault.dips = shuffle(DIPS, ctx.rand);
    out.push(w.vault.dips.shift());
  }
  return out;
}

function drawChips(w, ctx) {
  if (arr(w.vault.chips).length < 2) w.vault.chips = shuffle(CHIPS, ctx.rand);
  return [w.vault.chips.shift(), w.vault.chips.shift()];
}

function topUp(w, uid, ctx) {
  const hand = arr(obj(w.vault.hands)[uid]);
  const full = [...hand, ...draw(w, ctx, Math.max(0, HAND - hand.length))];
  w.vault.hands = { ...obj(w.vault.hands), [uid]: full };
  w.secret[uid] = { hand: full };
}

export function start(players, opts = {}, ctx) {
  const target = TARGETS.includes(opts.target) ? opts.target : 5;
  const scores = {};
  players.forEach((p) => { scores[p.uid] = 0; });
  const w = {
    pub: { game: 'chips', target, round: 0, scores },
    vault: { dips: shuffle(DIPS, ctx.rand), chips: shuffle(CHIPS, ctx.rand), hands: {}, plays: {}, table: [] },
    secret: {},
  };
  players.forEach((p) => topUp(w, p.uid, ctx));
  newRound(w, players[0].uid, ctx);
  return w;
}

/* The judge's chair goes round in join order, skipping anyone who left. */
export function nextJudge(players, current) {
  if (!players.length) return current;
  const i = players.findIndex((p) => p.uid === current);
  return players[(i + 1) % players.length].uid;
}

function newRound(w, judge, ctx) {
  w.vault.plays = {};
  w.vault.table = [];
  Object.assign(w.pub, {
    phase: 'playing', round: (w.pub.round || 0) + 1, judge, chips: drawChips(w, ctx),
    played: {}, deadline: ctx.now + PLAY_MS,
  });
  delete w.pub.table;
  delete w.pub.winner;
  delete w.pub.reveal;
  delete w.pub.auto;
}

function toJudging(w, ctx) {
  const entries = shuffle(Object.entries(obj(w.vault.plays)), ctx.rand);
  if (!entries.length) { // nobody played: deal new chips and go again
    newRound(w, w.pub.judge, ctx);
    return;
  }
  w.vault.table = entries.map(([uid]) => uid);
  w.pub.table = entries.map(([, card]) => card);
  w.pub.phase = 'judging';
  w.pub.deadline = ctx.now + JUDGE_MS;
}

function pick(w, i, ctx, auto = false) {
  const winner = w.vault.table[i];
  w.pub.scores[winner] = (w.pub.scores[winner] || 0) + 1;
  w.pub.winner = { uid: winner, card: w.pub.table[i], i };
  w.pub.reveal = w.vault.table.map((uid, j) => ({ uid, card: w.pub.table[j] }));
  w.pub.phase = 'reveal';
  w.pub.deadline = ctx.now + REVEAL_MS;
  if (auto) w.pub.auto = true;
}

const players_ = (w, ctx) => ctx.players.filter((pl) => pl.uid !== w.pub.judge);

export function act(w, uid, msg, ctx) {
  const p = w.pub;
  if (msg.t === 'play' && p.phase === 'playing' && uid !== p.judge && !obj(p.played)[uid]) {
    const hand = arr(obj(w.vault.hands)[uid]);
    const i = msg.i;
    if (!Number.isInteger(i) || i < 0 || i >= hand.length) return w;
    const card = hand[i];
    const rest = hand.filter((_, j) => j !== i);
    w.vault.hands = { ...obj(w.vault.hands), [uid]: rest };
    w.vault.plays = { ...obj(w.vault.plays), [uid]: card };
    w.secret[uid] = { hand: rest, played: card };
    p.played = { ...obj(p.played), [uid]: true };
    const waiting = players_(w, ctx).filter((pl) => !p.played[pl.uid]);
    if (!waiting.length) toJudging(w, ctx);
    return w;
  }
  if (msg.t === 'pick' && p.phase === 'judging' && uid === p.judge) {
    if (Number.isInteger(msg.i) && msg.i >= 0 && msg.i < arr(p.table).length) pick(w, msg.i, ctx);
  }
  return w;
}

export function tick(w, ctx) {
  const p = w.pub;
  for (const pl of ctx.players) {
    if (!(pl.uid in p.scores)) p.scores[pl.uid] = 0;
    if (!obj(w.vault.hands)[pl.uid]) topUp(w, pl.uid, ctx);
  }
  const judgeHere = ctx.players.some((pl) => pl.uid === p.judge);
  if (p.phase === 'playing') {
    const waiting = players_(w, ctx).filter((pl) => !obj(p.played)[pl.uid]);
    const anyPlayed = Object.keys(obj(p.played)).length > 0;
    if (!judgeHere) newRound(w, nextJudge(ctx.players, p.judge), ctx);
    else if (ctx.now >= p.deadline || (!waiting.length && anyPlayed)) toJudging(w, ctx);
  } else if (p.phase === 'judging') {
    if (ctx.now >= p.deadline || !judgeHere) pick(w, Math.floor(ctx.rand() * arr(p.table).length), ctx, true);
  } else if (p.phase === 'reveal' && ctx.now >= p.deadline) {
    if (Object.values(p.scores).some((s) => s >= p.target)) { p.phase = 'over'; delete p.deadline; return w; }
    for (const pl of ctx.players) topUp(w, pl.uid, ctx);
    newRound(w, nextJudge(ctx.players, p.judge), ctx);
  }
  return w;
}
