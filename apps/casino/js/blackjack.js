/* Blackjack, as a pure state machine. No DOM, no Firebase.
 *
 * The same three functions run the practice table on your own phone and a
 * table with friends, where the host's phone runs them (host.js):
 *
 *   start(players, opts, ctx)     a new table
 *   act(world, uid, msg, ctx)     someone did something
 *   tick(world, ctx)              time passed
 *
 * A world is { pub, vault, fx }. `pub` is the table everyone sees; `vault`
 * is the shoe and the dealer's hole card, which only the host may read.
 * ctx is { now, rand, players: [{ uid }] online now, hostUid }.
 *
 * Phases: betting → (insurance, when the dealer shows an ace) → play →
 * dealer → betting. The last round's cards and results stay on the table
 * through the next betting phase, the way a real table looks until the
 * next deal.
 *
 * Money is play money, kept to the cent: a 3:2 blackjack on a $5 bet
 * pays $7.50.
 */
import { buildShoe, idx, handValue } from './cards.js';

export const DEFAULT_RULES = { decks: 6, h17: false, bj: 1.5, das: true, surrender: true, min: 5, max: 5000, pen: 0.75 };
export const DECK_CHOICES = [1, 2, 4, 6, 8];
export const MAX_SEATS = 5;
export const MAX_HANDS = 4;
export const BANK_CHOICES = [100, 500, 1000, 5000];
export const MAX_BANK = 1000000;

/* Only used at a table with friends. Practice waits for you. */
export const TIMES = { bet: 20000, insurance: 12000, turn: 30000, step: 650, reveal: 450 };

const money = (n) => Math.round(n * 100) / 100;
const obj = (x) => (x && typeof x === 'object' ? x : {});
const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
const clean = (s, n = 16) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export function cleanRules(r = {}, base = DEFAULT_RULES) {
  const out = { ...base };
  if (DECK_CHOICES.includes(Number(r.decks))) out.decks = Number(r.decks);
  if (typeof r.h17 === 'boolean') out.h17 = r.h17;
  if (Number(r.bj) === 1.5 || Number(r.bj) === 1.2) out.bj = Number(r.bj);
  if (typeof r.das === 'boolean') out.das = r.das;
  if (typeof r.surrender === 'boolean') out.surrender = r.surrender;
  const min = Number(r.min);
  if ([1, 5, 10, 25, 100].includes(min)) out.min = min;
  return out;
}

export const cleanBank = (n) => Math.max(10, Math.min(MAX_BANK, Math.floor(Number(n) || 0))) || 1000;

/* Firebase drops empty arrays and objects; put them back. */
function fix(pub) {
  pub.order = arr(pub.order);
  pub.seats = obj(pub.seats);
  for (const s of Object.values(pub.seats)) {
    s.hands = arr(s.hands);
    for (const h of s.hands) h.cards = arr(h.cards);
  }
  pub.dealer = obj(pub.dealer);
  pub.dealer.cards = arr(pub.dealer.cards);
  pub.shoe = obj(pub.shoe);
  pub.shoe.seen = arr(pub.shoe.seen);
  while (pub.shoe.seen.length < 11) pub.shoe.seen.push(0);
  pub.rules = cleanRules(pub.rules);
  return pub;
}

function newShoe(world, rand) {
  const { pub } = world;
  const shoe = buildShoe(pub.rules.decks, rand);
  shoe.pop(); // the burn card, face down
  world.vault.shoe = shoe;
  const size = pub.rules.decks * 52;
  pub.shoe = { left: shoe.length, size, cut: Math.round(size * (1 - pub.rules.pen)), seen: new Array(11).fill(0), shuffles: (pub.shoe.shuffles || 0) + 1 };
}

function draw(world, rand, visible = true) {
  const { pub, vault } = world;
  vault.shoe = arr(vault.shoe);
  if (!vault.shoe.length) newShoe(world, rand);
  const c = vault.shoe.pop();
  pub.shoe.left = vault.shoe.length;
  if (visible) pub.shoe.seen[idx(c)]++;
  return c;
}

export function start(players, opts = {}, ctx = {}) {
  const pub = {
    game: 'blackjack', phase: 'betting', round: 0,
    rules: cleanRules(opts.rules), timed: !!opts.timed,
    order: [], seats: {}, dealer: { cards: [] }, turn: null,
    shoe: { shuffles: 0, seen: [] }, deadline: 0, wait: 0, say: null,
  };
  const world = { pub, vault: {}, fx: [] };
  newShoe(world, ctx.rand || Math.random);
  return world;
}

/* ── what a hand may do ──────────────────────────────────────────────── */

export function moves(pub, uid) {
  const none = { hit: false, stand: false, double: false, split: false, surrender: false };
  if (!pub || pub.phase !== 'play' || !pub.turn || pub.turn.uid !== uid) return none;
  const seat = pub.seats[uid];
  const hand = seat && seat.hands[pub.turn.h];
  if (!hand || hand.done) return none;
  const v = handValue(hand.cards);
  const two = hand.cards.length === 2;
  const ids = hand.cards.map(idx);
  return {
    hit: v.total < 21,
    stand: true,
    double: two && seat.bank >= hand.bet && (!hand.split || pub.rules.das) && v.total < 21,
    split: two && ids[0] === ids[1] && seat.hands.length < MAX_HANDS && seat.bank >= hand.bet && !hand.aces,
    surrender: !!pub.rules.surrender && two && seat.hands.length === 1 && !hand.split,
  };
}

export const inRound = (seat) => !!seat && seat.hands.length > 0 && seat.hands[0].bet > 0;

const naturalOf = (hand) => !hand.split && hand.cards.length === 2 && handValue(hand.cards).bj;

/* ── the round ───────────────────────────────────────────────────────── */

function onlineSet(ctx) { return new Set((ctx.players || []).map((p) => p.uid)); }

function say(pub, text, now) { pub.say = { text, at: now || 0 }; }

function maybeDeal(world, ctx, force = false) {
  const { pub } = world;
  const on = onlineSet(ctx);
  const here = pub.order.filter((u) => on.has(u));
  const playing = here.filter((u) => pub.seats[u].ready && pub.seats[u].bet > 0);
  if (!playing.length) { if (force) pub.deadline = 0; return; }
  if (force || here.every((u) => pub.seats[u].ready)) deal(world, ctx, playing);
  else if (pub.timed && !pub.deadline) pub.deadline = ctx.now + TIMES.bet;
}

function deal(world, ctx, playing) {
  const { pub, vault } = world;
  const rand = ctx.rand || Math.random;
  if (arr(vault.shoe).length <= pub.shoe.cut) { newShoe(world, rand); say(pub, 'Shuffling a new shoe', ctx.now); }
  else pub.say = null;
  pub.round++;
  pub.deadline = 0;
  for (const u of pub.order) {
    const s = pub.seats[u];
    s.ready = false;
    s.ins = null;
    s.last = null;
    if (playing.includes(u)) {
      s.bank = money(s.bank - s.bet);
      s.hands = [{ cards: [], bet: s.bet, done: false }];
      s.played = (s.played || 0) + 1;
    } else s.hands = [];
  }
  pub.dealer = { cards: [] };
  for (let pass = 0; pass < 2; pass++) {
    for (const u of playing) pub.seats[u].hands[0].cards.push(draw(world, rand));
    if (pass === 0) pub.dealer.cards.push(draw(world, rand));
    else { vault.hole = draw(world, rand, false); pub.dealer.cards.push('??'); }
  }
  const up = idx(pub.dealer.cards[0]);
  if (up === 1) {
    pub.phase = 'insurance';
    pub.deadline = pub.timed ? ctx.now + TIMES.insurance : 0;
    return;
  }
  peek(world, ctx);
}

/* With an ace or ten showing, the dealer checks the hole card before
 * anyone plays, so you never double or split into a dealer blackjack.
 */
function peek(world, ctx) {
  const { pub, vault } = world;
  const up = idx(pub.dealer.cards[0]);
  if ((up === 1 || up === 10) && handValue([pub.dealer.cards[0], vault.hole]).bj) {
    pub.dealer.bj = true;
    toDealer(world, ctx);
    return;
  }
  if (up === 1 || up === 10) say(pub, 'Dealer checked: no blackjack', ctx.now);
  for (const u of pub.order) {
    const s = pub.seats[u];
    if (inRound(s) && naturalOf(s.hands[0])) s.hands[0].done = true;
  }
  pub.phase = 'play';
  pub.turn = null;
  advance(world, ctx);
}

/* Move the turn to the next hand that still has a decision. A split hand
 * gets its second card when its turn comes, as at a real table.
 */
function advance(world, ctx) {
  const { pub } = world;
  const rand = ctx.rand || Math.random;
  const startSeat = pub.turn ? pub.order.indexOf(pub.turn.uid) : 0;
  for (let si = Math.max(0, startSeat); si < pub.order.length; si++) {
    const u = pub.order[si];
    const s = pub.seats[u];
    if (!inRound(s)) continue;
    for (let h = 0; h < s.hands.length; h++) {
      const hand = s.hands[h];
      if (hand.done) continue;
      if (hand.cards.length === 1) hand.cards.push(draw(world, rand));
      if (handValue(hand.cards).total >= 21) { hand.done = true; continue; }
      pub.turn = { uid: u, h };
      pub.deadline = pub.timed ? ctx.now + TIMES.turn : 0;
      return;
    }
  }
  toDealer(world, ctx);
}

function toDealer(world, ctx) {
  const { pub } = world;
  pub.phase = 'dealer';
  pub.turn = null;
  pub.deadline = 0;
  pub.wait = ctx.now + TIMES.reveal;
}

/* Is any hand still waiting on the dealer's total? */
function liveHands(pub) {
  for (const u of pub.order) {
    const s = pub.seats[u];
    if (!inRound(s)) continue;
    for (const h of s.hands) {
      if (h.res === 'surrender') continue;
      const v = handValue(h.cards);
      if (v.bust || naturalOf(h)) continue;
      return true;
    }
  }
  return false;
}

export function dealerShouldHit(cards, h17) {
  const v = handValue(cards);
  return v.total < 17 || (v.total === 17 && v.soft && h17);
}

function dealerStep(world, ctx) {
  const { pub, vault } = world;
  const cards = pub.dealer.cards;
  if (cards[1] === '??') {
    cards[1] = vault.hole;
    pub.shoe.seen[idx(vault.hole)]++;
    vault.hole = null;
    pub.wait = ctx.now + TIMES.step;
    return;
  }
  if (!pub.dealer.bj && liveHands(pub) && dealerShouldHit(cards, pub.rules.h17)) {
    cards.push(draw(world, ctx.rand || Math.random));
    pub.wait = ctx.now + TIMES.step;
    return;
  }
  settle(world, ctx);
}

/* Pay everyone, then open betting for the next round. */
function settle(world, ctx) {
  const { pub } = world;
  const dv = handValue(pub.dealer.cards);
  const dbj = !!pub.dealer.bj;
  const pay = pub.rules.bj;
  for (const u of pub.order) {
    const s = pub.seats[u];
    if (!inRound(s)) continue;
    let net = 0;
    for (const h of s.hands) {
      const v = handValue(h.cards);
      let back = 0;
      if (h.res === 'surrender') back = h.bet / 2;
      else if (naturalOf(h)) { back = dbj ? h.bet : h.bet + h.bet * pay; h.res = dbj ? 'push' : 'bj'; }
      else if (v.bust) { back = 0; h.res = 'bust'; }
      else if (dbj) { back = 0; h.res = 'lose'; }
      else if (dv.bust || v.total > dv.total) { back = 2 * h.bet; h.res = 'win'; }
      else if (v.total === dv.total) { back = h.bet; h.res = 'push'; }
      else { back = 0; h.res = 'lose'; }
      h.net = money(back - h.bet);
      h.done = true;
      s.bank = money(s.bank + back);
      net += back - h.bet;
    }
    if (s.ins) {
      if (dbj) { s.bank = money(s.bank + s.ins * 3); net += s.ins * 2; }
      else net -= s.ins;
    }
    s.last = money(net);
    s.won = money((s.won || 0) + net);
    // Keep the same bet up for next time, if it is still affordable.
    if (s.bet > s.bank) s.bet = s.bank >= pub.rules.min ? Math.floor(s.bank) : 0;
  }
  for (const u of pub.order.slice()) {
    if (pub.seats[u].leaving) removeSeat(pub, u);
  }
  pub.phase = 'betting';
  pub.turn = null;
  pub.deadline = 0;
  pub.wait = 0;
  pub.dealer.total = dv.total;
}

function removeSeat(pub, uid) {
  pub.order = pub.order.filter((u) => u !== uid);
  delete pub.seats[uid];
}

function finishInsurance(world, ctx) {
  const { pub } = world;
  for (const u of pub.order) {
    const s = pub.seats[u];
    if (inRound(s) && s.ins === null) s.ins = 0;
  }
  pub.deadline = 0;
  peek(world, ctx);
}

function insuranceDone(pub, ctx) {
  const on = onlineSet(ctx);
  return pub.order.every((u) => !inRound(pub.seats[u]) || pub.seats[u].ins !== null || !on.has(u));
}

/* ── act and tick ────────────────────────────────────────────────────── */

export function act(world, uid, msg = {}, ctx = {}) {
  const pub = fix(world.pub);
  world.vault = obj(world.vault);
  const seat = pub.seats[uid];
  const t = msg.t;
  const isHost = !ctx.hostUid || ctx.hostUid === uid;

  if (t === 'sit') {
    if (seat || pub.order.length >= MAX_SEATS) return world;
    const bank = cleanBank(msg.bank);
    pub.seats[uid] = { name: clean(msg.name) || 'Player', bank, bet: Math.min(pub.rules.min * 2, bank), hands: [], ready: false, ins: null, buyin: bank, won: 0, played: 0 };
    pub.order.push(uid);
    return world;
  }
  if (!seat && t !== 'rules') return world;

  if (t === 'up') {
    if (inRound(seat) && pub.phase !== 'betting') seat.leaving = true;
    else removeSeat(pub, uid);
    if (pub.phase === 'betting') maybeDeal(world, ctx);
    return world;
  }

  if (t === 'rules') {
    if (!isHost || pub.phase !== 'betting') return world;
    const before = pub.rules;
    pub.rules = cleanRules(msg.rules, before);
    if (pub.rules.decks !== before.decks || pub.rules.pen !== before.pen) { newShoe(world, ctx.rand || Math.random); say(pub, 'New rules, new shoe', ctx.now); }
    for (const s of Object.values(pub.seats)) if (s.bet && s.bet < pub.rules.min) s.bet = Math.min(pub.rules.min, Math.floor(s.bank));
    return world;
  }

  if (t === 'shuffle') {
    if (!isHost || pub.phase !== 'betting') return world;
    newShoe(world, ctx.rand || Math.random);
    say(pub, 'Shuffling a new shoe', ctx.now);
    return world;
  }

  if (pub.phase === 'betting') {
    if (t === 'bet') {
      let amt = Math.floor(Number(msg.amt) || 0);
      amt = Math.max(0, Math.min(amt, Math.floor(seat.bank), pub.rules.max));
      if (amt && amt < pub.rules.min) amt = seat.bank >= pub.rules.min ? pub.rules.min : 0;
      seat.bet = amt;
      seat.ready = false;
      return world;
    }
    if (t === 'rebuy') {
      const amt = Math.floor(Number(msg.amt) || 0);
      if (amt <= 0 || seat.bank + amt > MAX_BANK) return world;
      seat.bank = money(seat.bank + amt);
      seat.buyin = money((seat.buyin || 0) + amt);
      return world;
    }
    if (t === 'ready' || t === 'deal') {
      if (seat.bet > seat.bank) seat.bet = Math.floor(seat.bank);
      seat.ready = true;
      maybeDeal(world, ctx);
      return world;
    }
    if (t === 'unready') { seat.ready = false; return world; }
    return world;
  }

  if (pub.phase === 'insurance' && t === 'ins') {
    if (!inRound(seat) || seat.ins !== null) return world;
    const cost = money(seat.hands[0].bet / 2);
    if (msg.take && seat.bank >= cost) { seat.ins = cost; seat.bank = money(seat.bank - cost); }
    else seat.ins = 0;
    if (insuranceDone(pub, ctx)) finishInsurance(world, ctx);
    return world;
  }

  if (pub.phase === 'play' && pub.turn && pub.turn.uid === uid) {
    const can = moves(pub, uid);
    const hand = seat.hands[pub.turn.h];
    const rand = ctx.rand || Math.random;
    if (t === 'hit' && can.hit) {
      hand.cards.push(draw(world, rand));
      if (handValue(hand.cards).total >= 21) { hand.done = true; advance(world, ctx); }
      else pub.deadline = pub.timed ? ctx.now + TIMES.turn : 0;
    } else if (t === 'stand' && can.stand) {
      hand.done = true;
      advance(world, ctx);
    } else if (t === 'double' && can.double) {
      seat.bank = money(seat.bank - hand.bet);
      hand.bet = money(hand.bet * 2);
      hand.dbl = true;
      hand.cards.push(draw(world, rand));
      hand.done = true;
      advance(world, ctx);
    } else if (t === 'split' && can.split) {
      seat.bank = money(seat.bank - hand.bet);
      const [a, b] = hand.cards;
      const aces = idx(a) === 1;
      const one = { cards: [a], bet: hand.bet, done: false, split: true, aces };
      const two = { cards: [b], bet: hand.bet, done: false, split: true, aces };
      seat.hands.splice(pub.turn.h, 1, one, two);
      if (aces) {
        // Split aces get one card each and no more.
        for (const h of [one, two]) { h.cards.push(draw(world, rand)); h.done = true; }
      } else {
        one.cards.push(draw(world, rand));
        if (handValue(one.cards).total >= 21) one.done = true;
      }
      advance(world, ctx);
    } else if (t === 'surr' && can.surrender) {
      hand.res = 'surrender';
      hand.done = true;
      advance(world, ctx);
    }
    return world;
  }
  return world;
}

export function tick(world, ctx = {}) {
  const pub = fix(world.pub);
  world.vault = obj(world.vault);
  const now = ctx.now || 0;
  const on = onlineSet(ctx);
  if (pub.phase === 'betting') {
    if (pub.timed && pub.deadline && now >= pub.deadline) maybeDeal(world, ctx, true);
    else if (pub.order.some((u) => pub.seats[u].ready)) maybeDeal(world, ctx);
  } else if (pub.phase === 'insurance') {
    if ((pub.timed && pub.deadline && now >= pub.deadline) || insuranceDone(pub, ctx)) finishInsurance(world, ctx);
  } else if (pub.phase === 'play') {
    const turn = pub.turn;
    const gone = turn && !on.has(turn.uid);
    const late = pub.timed && pub.deadline && now >= pub.deadline;
    if (turn && (gone || late)) {
      const hand = pub.seats[turn.uid] && pub.seats[turn.uid].hands[turn.h];
      if (hand) hand.done = true;
      say(pub, `${(pub.seats[turn.uid] || {}).name || 'Player'} ${gone ? 'stepped away' : 'ran out of time'}: stand`, now);
      advance(world, ctx);
    } else if (!turn) advance(world, ctx);
  } else if (pub.phase === 'dealer') {
    if (now >= (pub.wait || 0)) dealerStep(world, ctx);
  }
  return world;
}

/* ── for the views ───────────────────────────────────────────────────── */

export const RESULT_LABEL = { win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', bj: 'Blackjack!', surrender: 'Surrendered' };

/* The card the dealer shows, as an index, or 0 before the deal. */
export function upcard(pub) {
  const c = pub && pub.dealer && arr(pub.dealer.cards)[0];
  return c && c !== '??' ? idx(c) : 0;
}

export { fix as normalise };
