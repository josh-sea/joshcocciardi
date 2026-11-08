/* Casino: blackjack and craps played through in node.
 *
 * The same engine runs the practice table on your phone and a table with
 * friends on the host's phone, so it is a pure state machine that can be
 * dealt from a rigged shoe here: blackjacks, dealer blackjacks with and
 * without insurance, splits (and split aces), doubles, surrender, busts,
 * a player who walks away mid-hand, timeouts, a new host picking the
 * table up after a database round trip, and the money adding up through
 * all of it.
 *
 * It also checks the hand-written basic strategy chart against the odds
 * engine, which works every cell out from scratch: two independent pieces
 * of code that have to agree.
 *
 * Run: node apps/portfolio/test/casino.test.mjs
 */
import { handValue, describe, fullComp, compLeft, runningCount, trueCount, hiLo, buildShoe, idx } from '../../casino/js/cards.js';
import { basic, chart, advise, deviation, UPS, cellFor, cellName, why } from '../../casino/js/strategy.js';
import { moveEVs, dealerOdds, standOdds, insuranceOdds, nextCard, houseEdge } from '../../casino/js/odds.js';
import * as bj from '../../casino/js/blackjack.js';
import { Host } from '../../casino/js/host.js';
import * as craps from '../../casino/js/craps.js';
import * as co from '../../casino/js/craps-odds.js';
import { LESSONS, explain } from '../../casino/js/craps-lessons.js';
import * as phys from '../../casino/js/dice-physics.js';
import * as voice from '../../casino/js/craps-voice.js';
import { emptyStats, loadStats, recordDecision, recordRound, leaks, accuracy } from '../../casino/js/stats.js';
import { strategyQuestion, gradeStrategy, countRun, cardsForCell, parseKey, trueCountQuestion } from '../../casino/js/drills.js';
import { makeCode, codeProblem, normaliseCode, CODE_ALPHABET, cleanName, pickHost, seeded } from '../../casino/js/lobby.js';

let failures = 0, passes = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// A write to the database and back: undefined keys and empty objects and
// arrays vanish.
const viaDb = (x) => {
  const s = JSON.stringify(x, (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return undefined;
    if (Array.isArray(v) && !v.length) return undefined;
    return v;
  });
  return s === undefined ? null : JSON.parse(s);
};

const card = (v) => (v === 1 ? 'As' : v === 10 ? 'Kd' : `${v}h`);

/* ── cards ─────────────────────────────────────────────────────────────── */
console.log('\ncards');
ok('A+K is blackjack', handValue(['As', 'Kd']).bj);
ok('A+6 is soft 17', handValue(['As', '6h']).total === 17 && handValue(['As', '6h']).soft);
ok('A+6+10 is hard 17', handValue(['As', '6h', 'Td']).total === 17 && !handValue(['As', '6h', 'Td']).soft);
ok('A+A+9 is soft 21', handValue(['As', 'Ad', '9c']).total === 21);
ok('K+Q+5 busts', handValue(['Ks', 'Qd', '5c']).bust);
ok('the hidden card does not count', handValue(['9s', '??']).total === 9);
ok('split 21 is not described as blackjack', describe(['As', 'Kd'], true) === '21' && describe(['As', 'Kd']) === 'Blackjack');
ok('6 decks is 312 cards', buildShoe(6, seeded(1)).length === 312);
ok('a full shoe has 96 tens in 6 decks', fullComp(6)[10] === 96 && fullComp(6)[1] === 24);
ok('Hi-Lo of a whole deck is zero', buildShoe(1, seeded(2)).reduce((a, c) => a + hiLo(c), 0) === 0);
const seen = new Array(11).fill(0); seen[5] = 3; seen[10] = 1;
ok('running count from seen cards', runningCount(seen) === 2);
ok('cards left never go below zero', compLeft(1, [0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0])[1] === 0);
ok('true count divides by decks left', trueCount(6, 156) === 2);

/* ── the chart against the odds engine ─────────────────────────────────── */
console.log('\nstrategy');
for (const h17 of [false, true]) {
  const rules = { decks: 6, h17, das: true, surrender: true };
  const comp = fullComp(6);
  const hands = [];
  for (let t = 5; t <= 20; t++) {
    let a = Math.min(10, t - 2), b = t - a;
    if (a === b) { a--; b++; }
    if (b >= 2 && a >= 2 && a <= 10) hands.push([a, b]);
  }
  for (let k = 2; k <= 9; k++) hands.push([1, k]);
  for (let k = 1; k <= 10; k++) hands.push([k, k]);
  const bad = [];
  for (const ids of hands) for (const up of UPS) {
    const cards = ids.map(card);
    const b = basic(cards, up, rules, { double: true, split: true, surrender: true });
    const c = comp.slice(); ids.forEach((v) => c[v]--); c[up]--;
    const ev = moveEVs(ids, up, c, rules);
    const keys = ['S', 'H', 'D', 'R'].concat(ev.P !== undefined ? ['P'] : []);
    const best = keys.reduce((a, k) => (ev[k] > ev[a] ? k : a), 'S');
    if (best !== b.action) bad.push(`${ids} v${up}: chart ${b.action}, odds ${best}`);
  }
  ok(`every cell of the ${h17 ? 'H17' : 'S17'} chart is the best move by the odds engine (${hands.length * 10} cells)`, !bad.length, bad.join('; '));
}
const S17 = { decks: 6, h17: false, das: true, surrender: true };
const all = { double: true, split: true, surrender: true };
ok('11 v 6: double', basic(['6h', '5s'], 6, S17, all).action === 'D');
ok('11 v 6 after a hit: hit', basic(['3h', '3s', '5d'], 6, S17, { split: false }).action === 'H');
ok('A,7 v 3 with three cards: stand (Ds falls back)', basic(['As', '3h', '4d'], 3, S17, {}).action === 'S');
ok('16 v 10: surrender when offered', basic(['Ts', '6h'], 10, S17, all).action === 'R');
ok('16 v 10: hit when not', basic(['Ts', '6h'], 10, S17, { double: true }).action === 'H');
ok('8,8 v A under H17 with surrender: surrender', basic(['8s', '8h'], 1, { ...S17, h17: true }, all).action === 'R');
ok('8,8 v A under S17: split', basic(['8s', '8h'], 1, S17, all).action === 'P');
ok('2,2 v 2 without DAS: hit', basic(['2s', '2h'], 2, { ...S17, das: false }, all).action === 'H');
ok('a pair you may not split again plays its total', basic(['8s', '8h'], 6, S17, { double: true }).action === 'S');
ok('5,5 is played as 10', basic(['5s', '5h'], 9, S17, all).action === 'D');
ok('H17: 11 v A doubles, S17 hits', basic(['6s', '5h'], 1, { ...S17, h17: true }, all).action === 'D' && basic(['6s', '5h'], 1, S17, all).action === 'H');
ok('cell names read naturally', cellName(cellFor(['As', '7h'], 9)) === 'Soft 18 vs 9' && cellName(cellFor(['Ts', 'Kh'], 1)) === '10,10 vs A');
ok('every chart move has a reason', UPS.every((u) => why(cellFor(['Ts', '6h'], u), 'H').length > 10));
ok('chart has 17 hard rows', Object.keys(chart({}).hard).length === 17);

const noSurr = { double: true, split: false, surrender: false };
ok('count: stand 16 v 10 at true 0', deviation(['Ts', '6h'], 10, 0.4, S17, noSurr)?.action === 'S');
ok('count: hit 16 v 10 below 0', deviation(['Ts', '6h'], 10, -1.2, S17, noSurr) === null);
ok('count: with surrender, 16 v 10 stays a surrender', deviation(['Ts', '6h'], 10, 3, S17, all) === null);
ok('count: surrender 14 v 10 at +3', deviation(['Ts', '4h'], 10, 3.1, S17, all)?.action === 'R');
ok('count: hit 15 v 10 below 0 instead of surrendering', deviation(['Ts', '5h'], 10, -1, S17, all)?.action === 'H');
ok('count: split tens v 6 at +4', deviation(['Ts', 'Kh'], 6, 4.2, S17, all)?.action === 'P');
ok('count: hit 12 v 4 below 0', deviation(['Ts', '2h'], 4, -0.5, S17, noSurr)?.action === 'H');
ok('count: 11 v A double index is S17 only', deviation(['6s', '5h'], 1, 2, { ...S17, h17: true }, all) === null);
const adv = advise(['Ts', '2h'], 3, S17, noSurr, { counting: true, rc: 6, cardsLeft: 156 });
ok('advise reports the count play next to the chart', adv.action === 'H' && adv.dev && adv.dev.action === 'S');

/* ── odds ──────────────────────────────────────────────────────────────── */
console.log('\nodds');
const six = fullComp(6);
const d6 = dealerOdds(6, six, { peeked: false });
ok('dealer 6 busts about 42%', d6.bust > 0.41 && d6.bust < 0.43, d6.bust.toFixed(4));
ok('dealer 10 busts about 23% once it has no blackjack', near(dealerOdds(10, six).bust, 0.23, 0.01));
ok('dealer outcomes add up to 1', near(Object.values(dealerOdds(1, six, { peeked: false })).reduce((a, b) => a + b, 0), 1));
ok('dealer ace has blackjack 4/13 of the time before peeking', near(dealerOdds(1, six, { peeked: false }).bj, 96 / 312, 1e-9));
ok('after peeking, no blackjack', dealerOdds(1, six).bj === 0);
ok('hitting soft 17 makes the dealer bust more', dealerOdds(1, six, { h17: true }).bust > dealerOdds(1, six).bust);
ok('stand odds add up', near(Object.values(standOdds(18, dealerOdds(9, six))).slice(0, 3).reduce((a, b) => a + b, 0), 1));
ok('hard 20 hits into a bust 92% of the time', near(nextCard([10, 10], six).bust, 1 - 24 / 312, 1e-9));
ok('insurance off the top is a loser', insuranceOdds(six).ev < 0 && near(insuranceOdds(six).ev, 3 * 96 / 312 - 1));
const tenRich = six.slice(); tenRich[5] = 0; tenRich[6] = 0;
ok('insurance pays in a ten-rich shoe', insuranceOdds(tenRich).ev > 0);
ok('house edge: 6 to 5 is a big hit', houseEdge({ ...S17, bj: 1.2 }) - houseEdge(S17) > 1.3);
const ev20 = moveEVs([10, 10], 6, six, S17);
ok('20 v 6: standing is worth about +0.70', near(ev20.S, 0.70, 0.03), ev20.S.toFixed(3));

/* ── the engine ────────────────────────────────────────────────────────── */
console.log('\nblackjack');
const ME = 'me', BO = 'bo', CAM = 'cam';
let clock = 1000;
const ctxFor = (uids, extra = {}) => ({ now: clock, rand: seeded(7), players: uids.map((uid) => ({ uid })), hostUid: uids[0], ...extra });

/* The next cards out of the shoe, in order. */
function rig(world, cards) {
  world.vault.shoe = buildShoe(6, seeded(3)).slice(0, 200).concat(cards.slice().reverse());
}
function table(uids, opts = {}) {
  const ctx = ctxFor(uids);
  let w = bj.start(uids, { rules: opts.rules || {}, timed: !!opts.timed }, ctx);
  for (const u of uids) w = bj.act(w, u, { t: 'sit', bank: 1000, name: u }, ctx);
  return w;
}
function runDealer(w, uids) {
  for (let i = 0; i < 20 && w.pub.phase === 'dealer'; i++) { clock += 1000; w = bj.tick(w, ctxFor(uids)); }
  return w;
}
const bank = (w, u) => w.pub.seats[u].bank;

// A plain win.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['Th', '9s', '9h', '7c', /* dealer draws */]);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('dealing takes the bet', bank(w, ME) === 990 && w.pub.phase === 'play');
  ok('the hole card is hidden on the table and kept in the vault', w.pub.dealer.cards[1] === '??' && w.vault.hole === '7c');
  ok('nobody but the turn may act', bj.act(JSON.parse(JSON.stringify(w)), BO, { t: 'hit' }, ctxFor([ME])).pub.seats[ME].hands[0].cards.length === 2);
  w = bj.act(w, ME, { t: 'stand' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  ok('dealer 9,7 must draw', w.pub.dealer.cards.length >= 3);
}

// Dealer stands on 17; player 19 wins and gets paid even money.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['Th', 'Ts', '9h', '7c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'stand' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  const h = w.pub.seats[ME].hands[0];
  ok('19 v dealer 17: win, paid 1 to 1', h.res === 'win' && bank(w, ME) === 1010 && w.pub.seats[ME].last === 10);
  ok('back to betting with the cards still showing', w.pub.phase === 'betting' && w.pub.dealer.cards.length === 2);
  ok('the bet stays up for next time', w.pub.seats[ME].bet === 10);
}

// Blackjack pays 3 to 2, and 6 to 5 when the table says so.
for (const [pay, want] of [[1.5, 1015], [1.2, 1012]]) {
  let w = table([ME], { rules: { bj: pay } });
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['As', '9s', 'Kh', '7c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok(`a natural is played out without asking (${pay === 1.5 ? '3:2' : '6:5'})`, w.pub.phase === 'dealer');
  w = runDealer(w, [ME]);
  ok(`blackjack pays ${pay === 1.5 ? '3 to 2' : '6 to 5'}`, bank(w, ME) === want && w.pub.seats[ME].hands[0].res === 'bj', String(bank(w, ME)));
  ok('the dealer does not draw against only a blackjack', w.pub.dealer.cards.length === 2);
}

// Dealer ace, insurance taken, dealer has it.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 20 }, ctxFor([ME]));
  rig(w, ['Th', 'As', '9h', 'Kc']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('an ace up asks about insurance', w.pub.phase === 'insurance');
  w = bj.act(w, ME, { t: 'ins', take: true }, ctxFor([ME]));
  ok('insurance costs half the bet', w.pub.seats[ME].ins === 10);
  w = runDealer(w, [ME]);
  ok('dealer blackjack: hand lost, insurance paid 2 to 1, net even', w.pub.seats[ME].hands[0].res === 'lose' && bank(w, ME) === 1000 && w.pub.seats[ME].last === 0);
}

// Insurance declined, dealer doesn't have it, game goes on.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 20 }, ctxFor([ME]));
  rig(w, ['Th', 'As', '9h', '6c', 'Kd']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'ins', take: false }, ctxFor([ME]));
  ok('no blackjack under the ace: play on', w.pub.phase === 'play' && w.pub.dealer.cards[1] === '??');
  w = bj.act(w, ME, { t: 'stand' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  ok('dealer A,6 stands on soft 17 (S17)', w.pub.dealer.cards.length === 2 && w.pub.seats[ME].hands[0].res === 'win');
}

// H17: the dealer hits soft 17.
{
  let w = table([ME], { rules: { h17: true } });
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['Th', '6s', '9h', 'Ac', '5d', '5c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'stand' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  ok('H17: dealer 6,A draws (to hard 17 here)', w.pub.dealer.cards.length === 4 && w.pub.seats[ME].hands[0].res === 'win');
}

// Dealer ten with an ace underneath: checked before anyone plays.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['5h', 'Ks', '6h', 'Ac']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('a ten up peeks straight away', w.pub.phase === 'dealer' && w.pub.dealer.bj);
  w = runDealer(w, [ME]);
  ok('you lose only your bet, no chance to double into it', bank(w, ME) === 990);
}

// Double down.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 25 }, ctxFor([ME]));
  rig(w, ['6h', '6s', '5c', 'Td', 'Kd', '9c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('11 may double', bj.moves(w.pub, ME).double);
  w = bj.act(w, ME, { t: 'double' }, ctxFor([ME]));
  ok('a double takes one card and doubles the bet', w.pub.seats[ME].hands[0].cards.length === 3 && w.pub.seats[ME].hands[0].bet === 50 && bank(w, ME) === 950);
  w = runDealer(w, [ME]);
  ok('21 on a double v dealer bust pays the doubled bet', bank(w, ME) === 1050 && w.pub.seats[ME].hands[0].res === 'win');
}

// Split, then double after split.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['8h', '6s', '8s', 'Tc', '3d', 'Kd', 'Ts', /* dealer */ '9h']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('a pair may split', bj.moves(w.pub, ME).split);
  w = bj.act(w, ME, { t: 'split' }, ctxFor([ME]));
  let s = w.pub.seats[ME];
  ok('split makes two hands, the first gets its card now', s.hands.length === 2 && s.hands[0].cards.length === 2 && s.hands[1].cards.length === 1 && bank(w, ME) === 980);
  ok('double after split is allowed', bj.moves(w.pub, ME).double);
  w = bj.act(w, ME, { t: 'double' }, ctxFor([ME]));
  s = w.pub.seats[ME];
  ok('the second hand gets its card when its turn comes', w.pub.turn.h === 1 && s.hands[1].cards.length === 2);
  ok('a split hand cannot surrender', !bj.moves(w.pub, ME).surrender);
  w = bj.act(w, ME, { t: 'stand' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  s = w.pub.seats[ME];
  ok('both split hands are settled', s.hands.every((h) => h.res), JSON.stringify(s.hands.map((h) => h.res)));
  const net = s.hands.reduce((a, h) => a + h.net, 0);
  ok('the bank moved by exactly the hands\' net', bank(w, ME) === 1000 + net && s.last === net);
}

// No DAS.
{
  let w = table([ME], { rules: { das: false } });
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['8h', '6s', '8s', 'Tc', '3d']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'split' }, ctxFor([ME]));
  ok('no double after split when the rules say so', !bj.moves(w.pub, ME).double);
}

// Split aces: one card each.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['Ah', '6s', 'As', 'Tc', 'Kd', '2d', 'Th']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'split' }, ctxFor([ME]));
  const s = w.pub.seats[ME];
  ok('split aces get one card each and are done', w.pub.phase === 'dealer' && s.hands.every((h) => h.cards.length === 2 && h.done));
  w = runDealer(w, [ME]);
  ok('A+K after a split is 21, paid even money, not 3:2', w.pub.seats[ME].hands[0].res === 'win' && w.pub.seats[ME].hands[0].net === 10);
}

// Splitting to four hands, no more.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['8h', '6s', '8s', 'Tc', '8d', '8c', '8h', '8s', '8d']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  for (let i = 0; i < 5; i++) w = bj.act(w, ME, { t: 'split' }, ctxFor([ME]));
  ok('at most four hands', w.pub.seats[ME].hands.length === 4 && !bj.moves(w.pub, ME).split);
}

// Surrender.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 20 }, ctxFor([ME]));
  rig(w, ['Th', 'Ts', '6h', '8c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'surr' }, ctxFor([ME]));
  w = runDealer(w, [ME]);
  ok('surrender gets half back', bank(w, ME) === 990 && w.pub.seats[ME].hands[0].net === -10);
  ok('the dealer does not draw for a surrendered hand', w.pub.dealer.cards.length === 2);
}
{
  let w = table([ME], { rules: { surrender: false } });
  w = bj.act(w, ME, { t: 'bet', amt: 20 }, ctxFor([ME]));
  rig(w, ['Th', 'Ts', '6h', '8c']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('no surrender at a table without it', !bj.moves(w.pub, ME).surrender);
}

// Busting.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  rig(w, ['Th', '6s', '6h', 'Tc', 'Kd']);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'hit' }, ctxFor([ME]));
  ok('a bust ends the hand', w.pub.phase === 'dealer');
  w = runDealer(w, [ME]);
  ok('busted: lose even though the dealer had 16', w.pub.seats[ME].hands[0].res === 'bust' && bank(w, ME) === 990 && w.pub.dealer.cards.length === 2);
}

// Bets are kept within the bank and the table limits.
{
  let w = table([ME]);
  w = bj.act(w, ME, { t: 'bet', amt: 5000 }, ctxFor([ME]));
  ok('a bet over your bank is capped at your bank', w.pub.seats[ME].bet === 1000);
  w = bj.act(w, ME, { t: 'bet', amt: 2 }, ctxFor([ME]));
  ok('a bet under the minimum is raised to it', w.pub.seats[ME].bet === 5);
  w = bj.act(w, ME, { t: 'bet', amt: -50 }, ctxFor([ME]));
  ok('a negative bet is no bet', w.pub.seats[ME].bet === 0);
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('no bet, no deal', w.pub.phase === 'betting');
  w = bj.act(w, ME, { t: 'rebuy', amt: 500 }, ctxFor([ME]));
  ok('adding chips', bank(w, ME) === 1500 && w.pub.seats[ME].buyin === 1500);
}

// Reshuffle at the cut card.
{
  let w = table([ME]);
  w.vault.shoe = w.vault.shoe.slice(0, w.pub.shoe.cut - 1);
  const shuffles = w.pub.shoe.shuffles;
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'deal' }, ctxFor([ME]));
  ok('past the cut card, a fresh shoe before the deal', w.pub.shoe.shuffles === shuffles + 1 && w.pub.shoe.left > 300);
  const shown = w.pub.shoe.seen.reduce((a, b) => a + b, 0);
  ok('only face-up cards are counted', shown === 3 || (w.pub.dealer.bj && shown === 4) || w.pub.phase === 'insurance' && shown === 3, String(shown));
}

// Three players: everyone ready deals; turns go in seat order.
{
  const U = [ME, BO, CAM];
  let w = table(U, { timed: true });
  for (const u of U) w = bj.act(w, u, { t: 'bet', amt: 10 }, ctxFor(U));
  w = bj.act(w, ME, { t: 'ready' }, ctxFor(U));
  ok('one ready starts the betting clock', w.pub.phase === 'betting' && w.pub.deadline === clock + bj.TIMES.bet);
  w = bj.act(w, BO, { t: 'ready' }, ctxFor(U));
  rig(w, ['Th', '9h', '8h', '7c', 'Ts', '9s', '8s', 'Tc']);
  w = bj.act(w, CAM, { t: 'ready' }, ctxFor(U));
  ok('everyone ready: deal', w.pub.phase === 'play' && w.pub.turn.uid === ME);
  w = bj.act(w, ME, { t: 'stand' }, ctxFor(U));
  ok('then the next seat', w.pub.turn.uid === BO);
  // Bo's phone dies.
  w = bj.tick(w, ctxFor([ME, CAM]));
  ok('a player who drops out stands', w.pub.turn.uid === CAM && w.pub.seats[BO].hands[0].done);
  clock += bj.TIMES.turn + 1;
  w = bj.tick(w, ctxFor([ME, CAM]));
  ok('the turn clock stands for you', w.pub.phase === 'dealer');
  w = runDealer(w, [ME, CAM]);
  ok('everyone is paid against dealer 17 (20 and 18 win, a timed-out 16 loses)', ['win', 'win', 'lose'].every((r, i) => w.pub.seats[U[i]].hands[0].res === r), U.map((u) => w.pub.seats[u].hands[0].res).join());
}

// Betting clock: only the ready play.
{
  const U = [ME, BO];
  let w = table(U, { timed: true });
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor(U));
  w = bj.act(w, ME, { t: 'ready' }, ctxFor(U));
  clock += bj.TIMES.bet + 1;
  w = bj.tick(w, ctxFor(U));
  ok('when the betting clock runs out, the ready players are dealt in', bj.inRound(w.pub.seats[ME]) && !bj.inRound(w.pub.seats[BO]));
}

// An offline player doesn't hold up the deal; seats cap at five.
{
  let w = table([ME, BO]);
  w = bj.act(w, ME, { t: 'bet', amt: 10 }, ctxFor([ME]));
  w = bj.act(w, ME, { t: 'ready' }, ctxFor([ME]));
  ok('a player who is away does not hold up the deal', w.pub.phase !== 'betting');
  let t5 = table(['a', 'b', 'c', 'd', 'e']);
  t5 = bj.act(t5, 'f', { t: 'sit', bank: 100 }, ctxFor(['a']));
  ok('five seats, then you watch', t5.pub.order.length === 5 && !t5.pub.seats.f);
  t5 = bj.act(t5, 'c', { t: 'up' }, ctxFor(['a']));
  t5 = bj.act(t5, 'f', { t: 'sit', bank: 100 }, ctxFor(['a']));
  ok('a seat opens when someone stands up', t5.pub.seats.f && !t5.pub.seats.c);
}

// Rules: only the host, only between hands.
{
  let w = table([ME, BO]);
  w = bj.act(w, BO, { t: 'rules', rules: { decks: 2 } }, ctxFor([ME, BO]));
  ok('only the host changes the rules', w.pub.rules.decks === 6);
  w = bj.act(w, ME, { t: 'rules', rules: { decks: 2, bj: 1.2, decks2: 'x' } }, ctxFor([ME, BO]));
  ok('new decks, new shoe', w.pub.rules.decks === 2 && w.pub.shoe.size === 104 && w.vault.shoe.length === 103);
  w = bj.act(w, ME, { t: 'rules', rules: { decks: 3 } }, ctxFor([ME, BO]));
  ok('nonsense rules are ignored', w.pub.rules.decks === 2);
}

// A new host picks the table up mid-hand from the database.
{
  const room = { game: null, vault: null, writeGame(p) { this.game = viaDb(p); return Promise.resolve(); }, writeVault(v) { this.vault = viaDb(v); return Promise.resolve(); } };
  const U = [ME, BO];
  const h1 = new Host(room, { players: () => U.map((uid) => ({ uid })), now: () => clock, rand: seeded(9), hostUid: ME });
  await h1.start({ rules: {}, timed: true });
  for (const u of U) await h1.act(u, { t: 'sit', bank: 500, name: u });
  for (const u of U) { await h1.act(u, { t: 'bet', amt: 10 }); await h1.act(u, { t: 'ready' }); }
  ok('host wrote a dealt table', room.game.phase === 'play' || room.game.phase === 'insurance' || room.game.phase === 'dealer');
  ok('the table never shows the hole card', !JSON.stringify(room.game).includes(room.vault.hole || 'zz'));
  const h2 = new Host(room, { players: () => [{ uid: BO }], now: () => clock, rand: seeded(10), hostUid: BO });
  ok('a new host resumes from the database copy', h2.resume(room.game, room.vault));
  for (let i = 0; i < 40 && room.game.phase !== 'betting'; i++) {
    clock += 31000;
    if (room.game.phase === 'insurance') await h2.act(BO, { t: 'ins', take: false });
    else if (room.game.phase === 'play' && room.game.turn.uid === BO) await h2.act(BO, { t: 'stand' });
    else await h2.tick();
  }
  ok('...and finishes the hand', room.game.phase === 'betting' && room.game.seats[BO].hands[0].res);
  const total = U.reduce((a, u) => a + room.game.seats[u].bank, 0);
  const nets = U.reduce((a, u) => a + room.game.seats[u].last, 0);
  ok('money adds up across the hand-over', near(total, 1000 + nets));
}

// A long soak: thousands of hands with random play, money always adds up.
{
  const U = [ME, BO, CAM];
  const rand = seeded(42);
  let w = table(U, { rules: { decks: 2 } });
  for (const u of U) w = bj.act(w, u, { t: 'rebuy', amt: 1000000 - 1000 }, ctxFor(U));
  let broken = '', rounds = 0;
  const acts = ['hit', 'stand', 'double', 'split', 'surr'];
  for (let step = 0; step < 60000 && rounds < 3000; step++) {
    const ctx = { ...ctxFor(U), rand };
    const before = U.reduce((a, u) => a + w.pub.seats[u].bank, 0);
    if (w.pub.phase === 'betting') {
      if (step && w.pub.seats[ME].hands.length) {
        const nets = U.reduce((a, u) => a + (bj.inRound(w.pub.seats[u]) ? w.pub.seats[u].last : 0), 0);
        if (!near(before, w.startTotal + nets, 0.001)) { broken = `round ${rounds}: ${before} vs ${w.startTotal + nets}`; break; }
      }
      w.startTotal = before;
      for (const u of U) { w = bj.act(w, u, { t: 'bet', amt: 5 + Math.floor(rand() * 50) }, ctx); w = bj.act(w, u, { t: 'ready' }, ctx); }
      w.startTotal = before;
      rounds++;
    } else if (w.pub.phase === 'insurance') {
      for (const u of U) w = bj.act(w, u, { t: 'ins', take: rand() < 0.3 }, ctx);
    } else if (w.pub.phase === 'play') {
      const keep = w.startTotal;
      w = bj.act(w, w.pub.turn.uid, { t: acts[Math.floor(rand() * acts.length)] }, ctx);
      w.startTotal = keep;
    } else { clock += 1000; const keep = w.startTotal; w = bj.tick(w, ctx); w.startTotal = keep; }
    const left = w.vault.shoe.length;
    if (left !== w.pub.shoe.left) { broken = 'shoe count drifted'; break; }
  }
  ok(`3,000 random rounds: the chips always add up`, !broken && rounds >= 3000, broken || String(rounds));
}

/* ── stats and drills ──────────────────────────────────────────────────── */
console.log('\nstats and drills');
const st = emptyStats();
recordDecision(st, { key: 'hard:16:10', name: 'Hard 16 vs 10', did: 'S', should: 'R', loss: 0.04 });
recordDecision(st, { key: 'hard:16:10', name: 'Hard 16 vs 10', did: 'R', should: 'R' });
recordDecision(st, { key: 'hard:12:3', name: 'Hard 12 vs 3', did: 'S', should: 'H', loss: 0.02, drill: true });
ok('accuracy counts table decisions only', accuracy(st) === 0.5 && st.decisions === 2);
ok('leaks lists missed cells', leaks(st).length === 2 && leaks(st)[0].miss === 1);
recordRound(st, { bank: 1015, last: 15, hands: [{ bet: 10, res: 'bj' }] });
ok('a round is recorded', st.hands === 1 && st.bjs === 1 && st.net === 15 && st.history[0] === 1015);
ok('stats survive an old or broken save', loadStats({ hands: 3 }).hands === 3 && loadStats('junk').hands === 0 && Array.isArray(loadStats({ cells: 4 }).mistakes));

const rand = seeded(5);
let drillOk = true;
for (let i = 0; i < 300; i++) {
  const q = strategyQuestion(rand);
  if (!q.cards || q.cards.length !== 2 || !q.up) { drillOk = false; break; }
  const g = gradeStrategy(q, 'H', S17);
  if (!g.should || !g.why || !Object.keys(g.evs).length) { drillOk = false; break; }
}
ok('300 drill questions are all well formed and gradeable', drillOk);
const focus = strategyQuestion(rand, { focus: 'soft:7:9' });
ok('a missed cell comes back as asked', focus.up === 9 && handValue(focus.cards).soft && handValue(focus.cards).total === 18);
ok('every hard cell from 8 to 17 can be dealt', [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].every((k) => cardsForCell(parseKey(`hard:${k}:5`), rand)));
const g = gradeStrategy({ cards: ['Ts', '6h'], up: 10 }, 'S', S17);
ok('the drill grades 16 v 10 stand as a miss with a small cost', !g.ok && g.should === 'R' && g.loss > 0 && g.loss < 0.1);
const run = countRun(52, rand);
ok('a whole-deck count run counts to zero', run.count === 0 && run.cards.length === 52);
ok('a count run of 20 counts right', (() => { const r = countRun(20, rand); return r.count === r.cards.reduce((a, c) => a + hiLo(c), 0); })());
ok('true count questions have whole answers', Array.from({ length: 50 }, () => trueCountQuestion(rand)).every((q) => Number.isInteger(q.answer)));

/* ── craps ───────────────────────────────────────────────────────────── */
console.log('\ncraps');
{
  const R = craps.DEFAULT_RULES;
  const S = (bets, dice, point = 0, bank = 1000) => craps.settle(bets, bank, dice, point, R);
  const line = (r, key) => r.lines.find((l) => l.key === key) || {};

  // The line on the come-out.
  ok('come-out 7: pass wins even money and stays up', (() => { const r = S({ pass: 10 }, [3, 4]); return line(r, 'pass').out === 'win' && r.bank === 1010 && r.bets.pass === 10; })());
  ok('come-out 11: pass wins, don\'t pass loses', (() => { const r = S({ pass: 10, dp: 10 }, [5, 6]); return line(r, 'pass').out === 'win' && line(r, 'dp').out === 'lose' && !r.bets.dp; })());
  ok('come-out 2 and 3: pass loses, don\'t pass wins', [[1, 1], [1, 2]].every((d) => { const r = S({ pass: 10, dp: 10 }, d); return line(r, 'pass').out === 'lose' && line(r, 'dp').out === 'win'; }));
  ok('come-out 12: pass loses, don\'t pass ties (bar 12)', (() => { const r = S({ pass: 10, dp: 10 }, [6, 6]); return line(r, 'pass').out === 'lose' && line(r, 'dp').out === 'push' && r.bets.dp === 10; })());
  ok('come-out 6 sets the point and settles nothing', (() => { const r = S({ pass: 10 }, [2, 4]); return r.point === 6 && !r.lines.length; })());

  // With a point.
  ok('point made: pass wins, odds win true odds and come down', (() => { const r = S({ pass: 10, passOdds: 25 }, [4, 2], 6); return line(r, 'passOdds').profit === 30 && r.bank === 1000 + 10 + 30 + 25 && !r.bets.passOdds && r.bets.pass === 10 && r.point === 0; })());
  ok('odds pay 2:1 on 4, 3:2 on 9', S({ passOdds: 10 }, [2, 2], 4).lines[0].profit === 20 && S({ passOdds: 10 }, [4, 5], 9).lines[0].profit === 15);
  ok('seven-out: pass and odds lose, don\'t pass and lay odds win', (() => { const r = S({ pass: 10, passOdds: 20, dp: 10, dpOdds: 12 }, [1, 6], 8); return line(r, 'pass').out === 'lose' && line(r, 'passOdds').out === 'lose' && line(r, 'dp').profit === 10 && line(r, 'dpOdds').profit === 10; })());
  ok('lay odds pay 1:2 on 4', S({ dpOdds: 20 }, [3, 4], 4).lines[0].profit === 10);
  ok('other numbers do nothing to the line', S({ pass: 10, passOdds: 10 }, [2, 3], 8).lines.length === 0);

  // Come bets.
  ok('a come bet moves to its number', (() => { const r = S({ come: 10 }, [4, 5], 6); return line(r, 'come').out === 'move' && r.bets.come9 === 10 && !r.bets.come; })());
  ok('a come bet wins on 11, loses on 3', S({ come: 10 }, [5, 6], 6).lines[0].out === 'win' && S({ come: 10 }, [1, 2], 6).lines[0].out === 'lose');
  ok('a come bet on 9 wins on 9 and comes down with its odds', (() => { const r = S({ come9: 10, comeOdds9: 20 }, [4, 5], 6); return r.bank === 1000 + 10 + 10 + 30 + 20 && !r.bets.come9 && !r.bets.comeOdds9; })());
  ok('come odds are off on the come-out: 7 loses the come bet, returns the odds', (() => { const r = S({ come9: 10, comeOdds9: 20 }, [3, 4], 0); return line(r, 'come9').out === 'lose' && line(r, 'comeOdds9').out === 'back' && r.bank === 1020; })());
  ok('...and its number on the come-out wins the come bet, returns the odds', (() => { const r = S({ come9: 10, comeOdds9: 20 }, [4, 5], 0); return line(r, 'come9').out === 'win' && line(r, 'comeOdds9').out === 'back' && r.bank === 1000 + 20 + 20; })());
  ok('don\'t come on 5 wins on a 7', (() => { const r = S({ dc5: 10, dcOdds5: 15 }, [3, 4], 8); return line(r, 'dc5').profit === 10 && line(r, 'dcOdds5').profit === 10; })());

  // Place, hardways, field, props.
  ok('place 6 pays 7:6 and stays up', (() => { const r = S({ place6: 12 }, [3, 3], 8); return line(r, 'place6').profit === 14 && r.bets.place6 === 12; })());
  ok('place 4 pays 9:5, place 5 pays 7:5', S({ place4: 10 }, [1, 3], 8).lines[0].profit === 18 && S({ place5: 10 }, [1, 4], 8).lines[0].profit === 14);
  ok('place bets are off on the come-out', S({ place6: 12 }, [3, 4], 0).lines.length === 0 && S({ place6: 12 }, [3, 3], 0).lines.length === 0);
  ok('a $5 place 6 is paid $5.83, rounded down', S({ place6: 5 }, [2, 4], 8).lines[0].profit === 5.83);
  ok('hard 8 pays 9:1 on 4+4, loses on 6+2', S({ hard8: 5 }, [4, 4], 6).lines[0].profit === 45 && S({ hard8: 5 }, [6, 2], 6).lines[0].out === 'lose');
  ok('hardways are off on the come-out', S({ hard8: 5 }, [3, 4], 0).lines.length === 0);
  ok('field: 2 pays double, 12 triple, 9 even, 7 loses', S({ field: 10 }, [1, 1]).lines[0].profit === 20 && S({ field: 10 }, [6, 6]).lines[0].profit === 30 && S({ field: 10 }, [4, 5]).lines[0].profit === 10 && S({ field: 10 }, [3, 4]).lines[0].out === 'lose');
  ok('one-roll bets win or lose on every roll', S({ seven: 5, yo: 5 }, [5, 6], 4).lines.every((l) => (l.key === 'yo' ? l.profit === 75 : l.out === 'lose')));
  ok('a fresh come bet wins on a 7 (its own come-out)', S({ come: 10 }, [3, 4], 6).lines.some((l) => l.key === 'come' && l.out === 'win'));

  // Bet rules.
  const seat = { bank: 1000, bets: { pass: 10 } };
  ok('pass line goes on only before the come-out', !!craps.betProblem(seat, 'pass', 10, 6, R) && !craps.betProblem({ bank: 1000, bets: {} }, 'pass', 10, 0, R));
  ok('3-4-5x odds: max $50 on 6 behind $10', craps.maxOdds(10, 6, '345') === 50 && craps.maxOdds(10, 4, '345') === 30 && !!craps.betProblem(seat, 'passOdds', 51, 6, R) && !craps.betProblem(seat, 'passOdds', 50, 6, R));
  ok('3-4-5x lay: 6x the flat bet', craps.maxOdds(10, 4, '345', true) === 60);
  ok('10x lay on 6: lay enough to win $100', craps.maxOdds(10, 6, '10', true) === 120);
  ok('come bets need a point', !!craps.betProblem({ bank: 100, bets: {} }, 'come', 10, 0, R));
  ok('table minimum on flat bets, not on odds', !!craps.betProblem({ bank: 100, bets: {} }, 'pass', 2, 0, R) && !craps.betProblem(seat, 'passOdds', 2, 6, R));
  ok('contract bets stay up once there is a point', !craps.canTakeDown('pass', 6) && craps.canTakeDown('pass', 0) && !craps.canTakeDown('come5', 6) && craps.canTakeDown('place6', 6));
  ok('nonsense bets are refused', !!craps.betProblem(seat, 'place7', 5, 6, R) && !!craps.betProblem(seat, 'hard5', 5, 6, R) && !craps.validKey('evil'));

  // A table: shooters, forced dice, timers.
  const U = ['ann', 'ben'];
  const ctx = (extra = {}) => ({ now: clock, rand: seeded(3), players: U.map((uid) => ({ uid })), hostUid: 'ann', ...extra });
  let w = craps.start(U, { timed: true }, ctx());
  for (const u of U) w = craps.act(w, u, { t: 'sit', bank: 500, name: u }, ctx());
  ok('first to sit shoots', w.pub.shooter === 'ann');
  w = craps.act(w, 'ann', { t: 'bet', key: 'pass', amt: 10 }, ctx());
  w = craps.act(w, 'ben', { t: 'bets', list: [['dp', 10], ['place6', 12]] }, ctx());
  ok('bets come out of the bank', w.pub.seats.ann.bank === 490 && w.pub.seats.ben.bank === 478);
  w = craps.act(w, 'ben', { t: 'roll' }, ctx());
  ok('only the shooter rolls', w.pub.phase === 'betting');
  w = craps.act(w, 'ann', { t: 'roll' }, ctx({ dice: [2, 2] }));
  ok('the dice tumble before they land', w.pub.phase === 'rolling');
  w = craps.act(w, 'ann', { t: 'bet', key: 'field', amt: 5 }, ctx());
  ok('no bets while the dice are in the air', !w.pub.seats.ann.bets.field);
  clock += craps.TIMES.tumble;
  w = craps.tick(w, ctx());
  ok('come-out 4 sets the point', w.pub.point === 4 && w.pub.event === 'point' && w.pub.phase === 'betting');
  w = craps.act(w, 'ann', { t: 'bet', key: 'passOdds', amt: 30 }, ctx());
  w = craps.act(w, 'ann', { t: 'take', key: 'pass' }, ctx());
  ok('odds go on; the pass line can\'t come off', w.pub.seats.ann.bets.passOdds === 30 && w.pub.seats.ann.bets.pass === 10);
  w = craps.act(w, 'ann', { t: 'roll' }, ctx({ dice: [3, 3] }));
  clock += craps.TIMES.tumble; w = craps.tick(w, ctx());
  ok('a 6 pays ben\'s place 6 and nothing else', w.pub.seats.ben.net === 14 && w.pub.seats.ann.lines.length === 0);
  w = craps.act(w, 'ann', { t: 'roll' }, ctx({ dice: [6, 1] }));
  clock += craps.TIMES.tumble; w = craps.tick(w, ctx());
  ok('seven-out: ann loses $40, ben wins on don\'t pass but loses the 6', w.pub.seats.ann.net === -40 && w.pub.seats.ben.net === 10 - 12 && w.pub.event === 'sevenout');
  ok('the dice pass to the next player', w.pub.shooter === 'ben' && w.pub.point === 0);
  clock += craps.TIMES.roll + 1;
  w = craps.tick(w, ctx());
  ok('a shooter who stalls has the dice rolled for them', w.pub.phase === 'rolling');
  clock += craps.TIMES.tumble; w = craps.tick(w, ctx());
  w = craps.tick(w, ctx({ players: [{ uid: 'ann' }] }));
  ok('a shooter who leaves passes the dice', w.pub.shooter === 'ann');

  // Through the database and a new host.
  const room = { game: null, vault: null, writeGame(p) { this.game = viaDb(p); return Promise.resolve(); }, writeVault(v) { this.vault = viaDb(v); return Promise.resolve(); } };
  const h = new Host(room, { players: () => [{ uid: 'ann' }], now: () => clock, rand: seeded(4), hostUid: 'ann' });
  await h.start({ game: 'craps' });
  await h.act('ann', { t: 'sit', bank: 100, name: 'Ann' });
  const h2 = new Host(room, { players: () => [{ uid: 'ann' }], now: () => clock, rand: seeded(5), hostUid: 'ann' });
  ok('a craps table resumes from the database', h2.resume(room.game, room.vault) && h2.engine === craps);
  await h2.act('ann', { t: 'bet', key: 'pass', amt: 10 });
  ok('...and takes bets', room.game.seats.ann.bets.pass === 10);

  // Soak: random bets and rolls, the money never leaks.
  const rand = seeded(77);
  let t = craps.start(['x'], {}, { now: 0 });
  t = craps.act(t, 'x', { t: 'sit', bank: 1000000 }, { players: [{ uid: 'x' }] });
  const keys = ['pass', 'dp', 'passOdds', 'dpOdds', 'come', 'dc', 'field', 'seven', 'anyCraps', 'yo', 'aces', 'aceDeuce', 'twelve',
    ...[4, 5, 6, 8, 9, 10].flatMap((n) => [`place${n}`, `comeOdds${n}`, `dcOdds${n}`]), 'hard4', 'hard6', 'hard8', 'hard10'];
  let leak = '';
  let net = 0;
  const start0 = 1000000;
  for (let i = 0; i < 20000 && !leak; i++) {
    const c = { now: i * 10000, rand, players: [{ uid: 'x' }] };
    for (let j = 0; j < 3; j++) t = craps.act(t, 'x', { t: 'bet', key: keys[Math.floor(rand() * keys.length)], amt: 5 + Math.floor(rand() * 30) }, c);
    if (rand() < 0.1) t = craps.act(t, 'x', { t: 'take', key: '*' }, c);
    t = craps.act(t, 'x', { t: 'roll' }, c);
    t = craps.tick(t, { ...c, now: c.now + 5000 });
    net += t.pub.seats.x.net;
    const s = t.pub.seats.x;
    const onTable = Object.values(s.bets).reduce((a, b) => a + b, 0);
    if (Math.abs(s.bank + onTable - (start0 + net)) > 0.01) leak = `roll ${i}: ${s.bank + onTable} vs ${start0 + net}`;
    if (Object.keys(s.bets).some((k) => !craps.validKey(k))) leak = 'bad key ' + Object.keys(s.bets);
  }
  ok('20,000 random rolls: bank plus chips on the table always equals buy-in plus winnings', !leak, leak);
}

console.log('\ncraps odds');
{
  const edge = (k, r) => co.houseEdge(k, r);
  const want = { pass: 1.41, dp: 1.36, come: 1.41, dc: 1.36, place6: 1.52, place5: 4.0, place4: 6.67, field: 2.78, hard6: 9.09, hard4: 11.11, seven: 16.67, anyCraps: 11.11, yo: 11.11, aces: 13.89, aceDeuce: 11.11, passOdds: 0, comeOdds5: 0 };
  const off = Object.entries(want).filter(([k, v]) => Math.abs(edge(k, { field12: 3 }) - v) > 0.006);
  ok('every house edge matches the published figure', !off.length, off.map(([k]) => `${k} ${edge(k, { field12: 3 }).toFixed(3)}`).join(', '));
  ok('field with a double 12 is 5.56%', Math.abs(edge('field', { field12: 2 }) - 5.56) < 0.006);
  ok('pass line wins 49.29% of the time', Math.abs(co.PASS_WIN - 0.4929) < 0.0001);
  ok('the 36 ways add up', co.P.reduce((a, b) => a + b, 0) > 0.9999999);
  ok('6 before 7 is 5/11', Math.abs(co.beforeSeven(6) - 5 / 11) < 1e-12);
  ok('advice: take odds when there is a point', co.advice({ bets: { pass: 10 } }, 6, craps.DEFAULT_RULES)[0].kind === 'odds');
  ok('advice: warns about any 7', co.advice({ bets: { pass: 10, passOdds: 50, seven: 5 } }, 6, craps.DEFAULT_RULES).some((x) => x.kind === 'warn'));
  ok('preset max odds fills to the limit', JSON.stringify(co.presetBets('odds', { bets: { pass: 10, come9: 5 } }, 6, craps.DEFAULT_RULES)) === JSON.stringify([['passOdds', 50], ['comeOdds9', 20]]));
  ok('preset 6 & 8 uses $6 units', JSON.stringify(co.presetBets('six8', { bets: {} }, 6, craps.DEFAULT_RULES)) === JSON.stringify([['place6', 6], ['place8', 6]]));
  const q = Array.from({ length: 200 }, () => co.payoutQuestion(seeded(8)));
  const rq = seeded(9);
  const qs = Array.from({ length: 300 }, () => co.payoutQuestion(rq, { field12: 3 }));
  ok('payout drill: four distinct options with the answer among them', qs.every((x) => x.options.length === 4 && new Set(x.options).size === 4 && x.options.includes(x.answer)) && q.length === 200);
  ok('payout of $30 on place 6 is $35', co.payout('place6', 30) === 35);
  ok('every lesson\'s quiz answer is one of its options', LESSONS.every((l) => !l.quiz || (l.quiz.answer >= 0 && l.quiz.answer < l.quiz.options.length)));
  ok('the narrator explains a seven-out', /seven-out/.test(explain({ total: 7, hard: false, before: 6, after: 0, event: 'sevenout' })));
}

/* ── the 3D table's dice, and the stickman ────────────────────────────── */
console.log('\ndice and voice');
{
  let bad = 0;
  for (let f = 0; f < 6; f++) for (let v = 1; v <= 6; v++) {
    const L = phys.faceLabels(f, v);
    if (L[f] !== v || new Set(L).size !== 6 || L[0] + L[1] !== 7 || L[2] + L[3] !== 7 || L[4] + L[5] !== 7) bad++;
  }
  ok('face labels put the engine\'s value on top, with opposite faces adding to 7', !bad);
  ok('an unrotated die has +y on top', phys.upFace({ x: 0, y: 0, z: 0, w: 1 }).face === 2);
  ok('a die rolled a quarter turn about x has +z on top', phys.upFace({ x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }).face === 4);
  const th = phys.cleanThrow({ a: 9, p: -3, s: 'x' }, seeded(2));
  ok('a throw from the wire is clamped', th.a === 1 && th.p === 0.5 && Number.isInteger(th.s) && th.s >= 1);
  let w = craps.start(['a'], {}, { now: 0 });
  w = craps.act(w, 'a', { t: 'sit', bank: 100 }, { players: [{ uid: 'a' }] });
  w = craps.act(w, 'a', { t: 'roll', throw: { a: 0.3, p: 1, s: 42 } }, { now: 0, rand: seeded(1), players: [{ uid: 'a' }] });
  ok('the shooter\'s flick goes on the table for every phone to replay', w.pub.throw.a === 0.3 && w.pub.throw.s === 42);

  // The physics itself needs cannon-es, which the browser loads from the
  // CDN. Run it when it is installed (npm i cannon-es), skip it otherwise.
  let CANNON = null;
  try { CANNON = await import(process.env.CANNON_ES || 'cannon-es'); } catch { /* not installed */ }
  if (CANNON) {
    let flat = 0, right = 0, longest = 0;
    for (let i = 0; i < 120; i++) {
      const v = [1 + (i % 6), 1 + ((i * 5) % 6)];
      const r = phys.simulate(CANNON, phys.cleanThrow({ a: (i % 7) / 3 - 1, p: 0.5 + (i % 5) * 0.18, s: 500 + i }), v);
      if (r.ok) flat++;
      if (r.labels[0][r.faces[0]] === v[0] && r.labels[1][r.faces[1]] === v[1]) right++;
      longest = Math.max(longest, r.frames.length);
    }
    ok('120 physical throws all settle flat on the table, past the middle', flat === 120, String(flat));
    ok('...and every one shows the engine\'s dice', right === 120);
    ok('...within the tumble time', longest / 60 * 1000 <= craps.TIMES.tumble, `${longest} frames`);
    const a = phys.simulate(CANNON, { a: 0.2, p: 1, s: 99 }, [3, 4]), b = phys.simulate(CANNON, { a: 0.2, p: 1, s: 99 }, [3, 4]);
    ok('the same throw rolls the same way on every phone', JSON.stringify(a.frames) === JSON.stringify(b.frames));
  } else console.log('  skip physics (cannon-es is not installed here)');

  const r = seeded(4);
  ok('the stickman calls a seven-out', /Seven out/.test(voice.dealerCall({ total: 7, before: 6, after: 0, event: 'sevenout' }, r)));
  ok('...a hard eight by name', /Hard eight/.test(voice.dealerCall({ total: 8, hard: true, before: 5, after: 5, event: '' }, r)));
  ok('...and the new point', /point is 9/.test(voice.dealerCall({ total: 9, before: 0, after: 9, event: 'point' }, r)));
  ok('the rail cheers a point and groans a seven-out', voice.crowd({ total: 6, before: 6, event: 'hit' }, r).mood === 'cheer' && voice.crowd({ total: 7, before: 6, event: 'sevenout' }, r).mood === 'groan');
  ok('every total has slang', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((t) => voice.SLANG[t] && voice.SLANG[t].length));
  ok('the same seed says the same thing', voice.dealerCall({ total: 5, before: 6, event: '' }, seeded(9)) === voice.dealerCall({ total: 5, before: 6, event: '' }, seeded(9)));
}

/* ── lobby ─────────────────────────────────────────────────────────────── */
console.log('\nlobby');
ok('codes use the safe alphabet', [...makeCode(seeded(1))].every((c) => CODE_ALPHABET.includes(c)));
ok('a 0 in a code is caught', /0/.test(codeProblem('AB0DE') || ''));
ok('codes are normalised', normaliseCode(' ab-cde ') === 'ABCDE' && !codeProblem('abcde'));
ok('names are cleaned', cleanName('  <Bo>  ') === 'Bo');
ok('the host stays while online', pickHost({ a: { online: true, joined: 2 }, b: { online: true, joined: 1 } }, 'a') === 'a');
ok('then the longest seated takes over', pickHost({ a: { online: false, joined: 0 }, b: { online: true, joined: 2 }, c: { online: true, joined: 1 } }, 'a') === 'c');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
