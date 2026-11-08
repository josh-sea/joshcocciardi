/* Craps, as a pure state machine. No DOM, no Firebase.
 *
 * Same shape as blackjack.js, so the same Host runs it on your phone for
 * practice or on the host's phone at a table with friends:
 *
 *   start(players, opts, ctx)   act(world, uid, msg, ctx)   tick(world, ctx)
 *
 * The table: one shooter rolls two dice. The first roll of a round is the
 * "come-out". A 4, 5, 6, 8, 9 or 10 on the come-out becomes the "point"
 * (the puck goes ON), and the round lasts until the shooter rolls the point
 * again (a win for the pass line) or a 7 ("seven-out": the pass line loses
 * and the dice move to the next player).
 *
 * Every bet is a key in seat.bets, with the money already taken from the
 * bank when it was placed:
 *
 *   pass, dp                     pass line, don't pass
 *   passOdds, dpOdds             odds behind them (true odds, no house edge)
 *   come, dc                     come / don't come, waiting for their first roll
 *   come4..come10, dc4..dc10     come / don't come bets that moved to a number
 *   comeOdds4.., dcOdds4..       odds on those
 *   place4..place10              place bets
 *   field                        one roll: 2, 3, 4, 9, 10, 11, 12
 *   hard4, hard6, hard8, hard10  the number rolled as a pair before a 7 or the easy way
 *   seven, anyCraps, yo, aces, aceDeuce, twelve   one-roll bets in the middle
 *
 * Winning bets are paid and stay up, the way a dealer leaves them, except
 * odds and come bets on a number, which come back to you with the win.
 */

export const POINTS = [4, 5, 6, 8, 9, 10];
export const WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
export const DEFAULT_RULES = { odds: '345', field12: 3, min: 5, max: 5000 };
export const ODDS_CHOICES = ['1', '2', '345', '5', '10'];
export const TIMES = { roll: 40000, tumble: 1100 };
export const MAX_SEATS = 8;

const money = (n) => Math.round(n * 100) / 100;
/* Casinos round a payout down to the cent (really to the chip). */
const pay = (n) => Math.floor(n * 100 + 1e-6) / 100;
const obj = (x) => (x && typeof x === 'object' ? x : {});
const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
const clean = (s, n = 16) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export function cleanRules(r = {}, base = DEFAULT_RULES) {
  const out = { ...base };
  if (ODDS_CHOICES.includes(String(r.odds))) out.odds = String(r.odds);
  if (Number(r.field12) === 2 || Number(r.field12) === 3) out.field12 = Number(r.field12);
  if ([1, 5, 10, 25, 100].includes(Number(r.min))) out.min = Number(r.min);
  return out;
}

/* ── what each bet pays, per $1 ──────────────────────────────────────── */

export const TRUE_ODDS = { 4: 2, 5: 1.5, 6: 1.2, 8: 1.2, 9: 1.5, 10: 2 };
export const LAY_ODDS = { 4: 0.5, 5: 2 / 3, 6: 5 / 6, 8: 5 / 6, 9: 2 / 3, 10: 0.5 };
export const PLACE_PAYS = { 4: 1.8, 5: 1.4, 6: 7 / 6, 8: 7 / 6, 9: 1.4, 10: 1.8 };
export const HARD_PAYS = { 4: 7, 6: 9, 8: 9, 10: 7 };
export const PROP_PAYS = { seven: 4, anyCraps: 7, yo: 15, aces: 30, aceDeuce: 15, twelve: 30 };

/* What the key is, as a family and a number: comeOdds6 → { base: 'comeOdds', n: 6 }. */
export function parseKey(key) {
  const m = /^([a-zA-Z]+?)(\d+)?$/.exec(String(key));
  if (!m) return { base: '', n: 0 };
  return { base: m[1], n: m[2] ? Number(m[2]) : 0 };
}

const NUMBERED = { come: POINTS, dc: POINTS, comeOdds: POINTS, dcOdds: POINTS, place: POINTS, hard: [4, 6, 8, 10] };
const SINGLE = ['pass', 'dp', 'passOdds', 'dpOdds', 'come', 'dc', 'field', 'seven', 'anyCraps', 'yo', 'aces', 'aceDeuce', 'twelve'];

export function validKey(key) {
  const { base, n } = parseKey(key);
  if (!n) return SINGLE.includes(base);
  return !!NUMBERED[base] && NUMBERED[base].includes(n);
}

/* The most odds you may take (or lay) behind a flat bet on point n. */
export function maxOdds(flat, n, rule = '345', lay = false) {
  if (!flat || !n) return 0;
  if (rule === '345') {
    // 3x on 4 and 10, 4x on 5 and 9, 5x on 6 and 8: each pays 6x the flat
    // bet when it wins. Laying, you may lay 6x the flat bet.
    if (lay) return money(flat * 6);
    return money(flat * ({ 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 })[n]);
  }
  const x = Number(rule) || 1;
  // Laying: enough to win x times the flat bet.
  return lay ? money(flat * x / LAY_ODDS[n]) : money(flat * x);
}

/* ── the rules of each bet ───────────────────────────────────────────── */

/* Can this bet go on (or more on it) right now? Returns a reason or null. */
export function betProblem(seat, key, amt, point, rules) {
  if (!validKey(key)) return 'Not a bet.';
  const { base, n } = parseKey(key);
  const b = seat.bets;
  const now = b[key] || 0;
  if (amt > seat.bank + 1e-9) return 'Not enough chips.';
  const total = now + amt;
  if ((base === 'pass' || base === 'dp') && point) return 'Line bets go on before the come-out roll.';
  if ((base === 'come' || base === 'dc') && !n && !point) return 'Come bets go on once there is a point. Before that, use the pass line.';
  if ((base === 'come' || base === 'dc') && n) return 'Come bets move to a number by themselves.';
  if (base === 'passOdds') {
    if (!point || !b.pass) return 'Odds go behind a pass line bet once there is a point.';
    if (total > maxOdds(b.pass, point, rules.odds) + 1e-9) return `Max odds here is $${maxOdds(b.pass, point, rules.odds)}.`;
  }
  if (base === 'dpOdds') {
    if (!point || !b.dp) return 'Lay odds go behind a don\'t pass bet once there is a point.';
    if (total > maxOdds(b.dp, point, rules.odds, true) + 1e-9) return `Max lay here is $${maxOdds(b.dp, point, rules.odds, true)}.`;
  }
  if (base === 'comeOdds') {
    if (!b[`come${n}`]) return `Odds go behind a come bet on the ${n}.`;
    if (total > maxOdds(b[`come${n}`], n, rules.odds) + 1e-9) return `Max odds here is $${maxOdds(b[`come${n}`], n, rules.odds)}.`;
  }
  if (base === 'dcOdds') {
    if (!b[`dc${n}`]) return `Lay odds go behind a don't come bet on the ${n}.`;
    if (total > maxOdds(b[`dc${n}`], n, rules.odds, true) + 1e-9) return `Max lay here is $${maxOdds(b[`dc${n}`], n, rules.odds, true)}.`;
  }
  const odds = base === 'passOdds' || base === 'dpOdds' || base === 'comeOdds' || base === 'dcOdds';
  if (!odds && total < rules.min && ['pass', 'dp', 'come', 'dc', 'place', 'field'].includes(base)) return `Table minimum is $${rules.min}.`;
  if (total > rules.max) return `Table maximum is $${rules.max}.`;
  return null;
}

/* Contract bets can't come down once a point is working for them. */
export function canTakeDown(key, point) {
  const { base, n } = parseKey(key);
  if ((base === 'pass' || base === 'dp') && point) return false;
  if ((base === 'come' || base === 'dc') && n) return false;
  return true;
}

/* Settle one roll against one seat's bets. Pure.
 *
 * Returns { bets, bank, lines } where lines say what happened to each bet:
 *   out: 'win' | 'lose' | 'push' | 'move' | 'back'
 * `profit` is what a win paid, `back` is money returned to the bank.
 */
export function settle(bets, bank, dice, point, rules = DEFAULT_RULES) {
  const [d1, d2] = dice;
  const t = d1 + d2;
  const hard = d1 === d2;
  const b = { ...bets };
  const lines = [];
  let cash = bank;
  const comeOut = !point;
  const newPoint = comeOut ? (POINTS.includes(t) ? t : 0) : (t === point || t === 7 ? 0 : point);

  const win = (key, ratio, comesDown) => {
    const amt = b[key];
    const profit = pay(amt * ratio);
    cash += profit;
    if (comesDown) { cash += amt; delete b[key]; }
    lines.push({ key, amt, out: 'win', profit, back: comesDown ? amt : 0 });
  };
  const lose = (key) => { lines.push({ key, amt: b[key], out: 'lose', profit: -b[key] }); delete b[key]; };
  const back = (key, why) => { cash += b[key]; lines.push({ key, amt: b[key], out: 'back', profit: 0, back: b[key], why }); delete b[key]; };

  for (const key of Object.keys(bets)) {
    if (!(b[key] > 0)) { delete b[key]; continue; }
    const { base, n } = parseKey(key);
    switch (base) {
      case 'pass':
        if (comeOut) { if (t === 7 || t === 11) win(key, 1); else if (t === 2 || t === 3 || t === 12) lose(key); }
        else if (t === point) win(key, 1); else if (t === 7) lose(key);
        break;
      case 'dp':
        if (comeOut) {
          if (t === 2 || t === 3) win(key, 1);
          else if (t === 12) lines.push({ key, amt: b[key], out: 'push', profit: 0 });
          else if (t === 7 || t === 11) lose(key);
        } else if (t === 7) win(key, 1); else if (t === point) lose(key);
        break;
      case 'passOdds':
        if (t === point) win(key, TRUE_ODDS[point], true); else if (t === 7) lose(key);
        break;
      case 'dpOdds':
        if (t === 7) win(key, LAY_ODDS[point], true); else if (t === point) lose(key);
        break;
      case 'come':
      case 'dc':
        if (!n) {
          const dont = base === 'dc';
          if (t === 7 || t === 11) { if (dont) lose(key); else win(key, 1); }
          else if (t === 2 || t === 3) { if (dont) win(key, 1); else lose(key); }
          else if (t === 12) { if (dont) lines.push({ key, amt: b[key], out: 'push', profit: 0 }); else lose(key); }
          else {
            const to = `${base}${t}`;
            b[to] = money((b[to] || 0) + b[key]);
            lines.push({ key, amt: b[key], out: 'move', profit: 0, to: t });
            delete b[key];
          }
        } else if (base === 'come') {
          if (t === n) win(key, 1, true);
          else if (t === 7) lose(key);
        } else {
          if (t === 7) win(key, 1, true);
          else if (t === n) lose(key);
        }
        break;
      case 'comeOdds':
        // Off on the come-out roll: a 7 or the number just gives it back.
        if (t === n) { if (comeOut) back(key, 'odds were off'); else win(key, TRUE_ODDS[n], true); }
        else if (t === 7) { if (comeOut) back(key, 'odds were off'); else lose(key); }
        break;
      case 'dcOdds':
        if (t === 7) win(key, LAY_ODDS[n], true); else if (t === n) lose(key);
        break;
      case 'place':
        if (comeOut) break; // off on the come-out
        if (t === n) win(key, PLACE_PAYS[n]); else if (t === 7) lose(key);
        break;
      case 'hard':
        if (comeOut) break; // off on the come-out
        if (t === n && hard) win(key, HARD_PAYS[n]);
        else if (t === 7 || t === n) lose(key);
        break;
      case 'field':
        if (t === 2) win(key, 2);
        else if (t === 12) win(key, rules.field12 || 3);
        else if ([3, 4, 9, 10, 11].includes(t)) win(key, 1);
        else lose(key);
        break;
      case 'seven': if (t === 7) win(key, PROP_PAYS.seven); else lose(key); break;
      case 'anyCraps': if (t === 2 || t === 3 || t === 12) win(key, PROP_PAYS.anyCraps); else lose(key); break;
      case 'yo': if (t === 11) win(key, PROP_PAYS.yo); else lose(key); break;
      case 'aces': if (t === 2) win(key, PROP_PAYS.aces); else lose(key); break;
      case 'aceDeuce': if (t === 3) win(key, PROP_PAYS.aceDeuce); else lose(key); break;
      case 'twelve': if (t === 12) win(key, PROP_PAYS.twelve); else lose(key); break;
      default: break;
    }
  }
  // Odds behind a line bet that just lost or won come down with it; and
  // with no point any more, a come bet waiting for its first roll returns.
  if (!newPoint) {
    for (const key of ['passOdds', 'dpOdds', 'come', 'dc']) if (b[key]) back(key, 'no point');
  }
  return { bets: b, bank: money(cash), lines, point: newPoint, total: t, hard };
}

/* ── the table ───────────────────────────────────────────────────────── */

function fix(pub) {
  pub.order = arr(pub.order);
  pub.seats = obj(pub.seats);
  for (const s of Object.values(pub.seats)) { s.bets = obj(s.bets); s.lines = arr(s.lines); }
  pub.history = arr(pub.history);
  pub.dice = arr(pub.dice);
  pub.rules = cleanRules(pub.rules);
  return pub;
}

export function start(players, opts = {}, ctx = {}) {
  const pub = {
    game: 'craps', phase: 'betting', rules: cleanRules(opts.rules), timed: !!opts.timed,
    order: [], seats: {}, point: 0, shooter: null, dice: [], history: [], rolls: 0,
    deadline: 0, wait: 0, say: null, streak: 0,
  };
  return { pub, vault: {}, fx: [] };
}

function onlineSet(ctx) { return new Set((ctx.players || []).map((p) => p.uid)); }

function nextShooter(pub, ctx, after) {
  const on = onlineSet(ctx);
  const n = pub.order.length;
  if (!n) return null;
  const from = Math.max(0, pub.order.indexOf(after));
  for (let i = 1; i <= n; i++) {
    const u = pub.order[(from + i) % n];
    if (on.has(u)) return u;
  }
  return pub.order[0];
}

export function act(world, uid, msg = {}, ctx = {}) {
  const pub = fix(world.pub);
  const seat = pub.seats[uid];
  const t = msg.t;
  const isHost = !ctx.hostUid || ctx.hostUid === uid;

  if (t === 'sit') {
    if (seat || pub.order.length >= MAX_SEATS) return world;
    const bank = Math.max(10, Math.min(1000000, Math.floor(Number(msg.bank) || 0))) || 1000;
    pub.seats[uid] = { name: clean(msg.name) || 'Player', bank, buyin: bank, bets: {}, lines: [], net: 0, won: 0 };
    pub.order.push(uid);
    if (!pub.shooter) pub.shooter = uid;
    if (pub.timed && !pub.deadline && pub.phase === 'betting') pub.deadline = (ctx.now || 0) + TIMES.roll;
    return world;
  }
  if (t === 'rules') {
    if (!isHost || pub.point || pub.phase !== 'betting') return world;
    pub.rules = cleanRules(msg.rules, pub.rules);
    return world;
  }
  if (!seat) return world;

  if (t === 'up') {
    // Your chips on the table come back with you.
    let back = 0;
    for (const [k, v] of Object.entries(seat.bets)) if (canTakeDown(k, pub.point)) back += v;
    seat.bank = money(seat.bank + back);
    pub.order = pub.order.filter((u) => u !== uid);
    delete pub.seats[uid];
    if (pub.shooter === uid) pub.shooter = nextShooter(pub, ctx, uid) || pub.order[0] || null;
    return world;
  }
  if (t === 'rebuy') {
    const amt = Math.floor(Number(msg.amt) || 0);
    if (amt > 0 && seat.bank + amt <= 1000000) { seat.bank = money(seat.bank + amt); seat.buyin = money(seat.buyin + amt); }
    return world;
  }
  if (pub.phase !== 'betting') return world;

  if (t === 'bet' || t === 'bets') {
    const list = t === 'bet' ? [[msg.key, msg.amt]] : arr(msg.list).map((x) => arr(x));
    for (const [key, raw] of list.slice(0, 20)) {
      const amt = money(Number(raw) || 0);
      if (!(amt > 0)) continue;
      if (betProblem(seat, key, amt, pub.point, pub.rules)) continue;
      seat.bets[key] = money((seat.bets[key] || 0) + amt);
      seat.bank = money(seat.bank - amt);
    }
    return world;
  }
  if (t === 'take') {
    const keys = msg.key === '*' ? Object.keys(seat.bets) : [msg.key];
    for (const key of keys) {
      if (!seat.bets[key] || !canTakeDown(key, pub.point)) continue;
      seat.bank = money(seat.bank + seat.bets[key]);
      delete seat.bets[key];
    }
    return world;
  }
  if (t === 'roll') {
    if (uid !== pub.shooter) return world;
    roll(world, ctx);
    return world;
  }
  return world;
}

function roll(world, ctx) {
  const { pub } = world;
  const rand = ctx.rand || Math.random;
  const forced = ctx.dice;
  pub.dice = forced || [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
  pub.phase = 'rolling';
  pub.wait = (ctx.now || 0) + TIMES.tumble;
  pub.deadline = 0;
}

/* The dice have landed: settle every seat. */
function land(world, ctx) {
  const { pub } = world;
  const [d1, d2] = pub.dice;
  const t = d1 + d2;
  const before = pub.point;
  let after = before;
  for (const u of pub.order) {
    const s = pub.seats[u];
    const r = settle(s.bets, s.bank, pub.dice, before, pub.rules);
    s.net = money(r.lines.reduce((a, l) => a + (l.profit || 0), 0));
    s.bets = r.bets;
    s.bank = r.bank;
    s.lines = r.lines;
    s.won = money((s.won || 0) + s.net);
    after = r.point;
  }
  if (!pub.order.length) after = before ? (t === before || t === 7 ? 0 : before) : (POINTS.includes(t) ? t : 0);
  pub.rolls = (pub.rolls || 0) + 1;
  pub.history = [{ d: [d1, d2], p: before }, ...pub.history].slice(0, 24);
  pub.lastPoint = before;
  let event = '';
  if (!before) {
    if (t === 7 || t === 11) event = 'natural';
    else if (t === 2 || t === 3 || t === 12) event = 'craps';
    else event = 'point';
  } else if (t === before) event = 'hit';
  else if (t === 7) event = 'sevenout';
  pub.event = event;
  pub.point = after;
  if (event === 'hit') pub.streak = (pub.streak || 0) + 1;
  if (event === 'sevenout') {
    pub.streak = 0;
    const was = pub.shooter;
    pub.shooter = nextShooter(pub, ctx, was);
  }
  pub.phase = 'betting';
  pub.wait = 0;
  pub.deadline = pub.timed ? (ctx.now || 0) + TIMES.roll : 0;
}

export function tick(world, ctx = {}) {
  const pub = fix(world.pub);
  const now = ctx.now || 0;
  if (pub.phase === 'rolling') {
    if (now >= (pub.wait || 0)) land(world, ctx);
    return world;
  }
  const on = onlineSet(ctx);
  if (pub.shooter && !on.has(pub.shooter) && pub.order.some((u) => on.has(u))) {
    pub.shooter = nextShooter(pub, ctx, pub.shooter);
  }
  if (!pub.shooter && pub.order.length) pub.shooter = pub.order[0];
  if (pub.timed && pub.deadline && now >= pub.deadline && pub.shooter) {
    pub.say = { text: 'The shooter took too long: dice rolled for them', at: now };
    roll(world, ctx);
  }
  return world;
}

export { fix as normalise };

/* ── words for the views ─────────────────────────────────────────────── */

export function betName(key) {
  const { base, n } = parseKey(key);
  const names = {
    pass: 'Pass line', dp: 'Don\'t pass', passOdds: 'Pass odds', dpOdds: 'Lay odds (don\'t pass)',
    come: 'Come', dc: 'Don\'t come', field: 'Field', seven: 'Any 7', anyCraps: 'Any craps', yo: 'Yo (11)',
    aces: 'Aces (2)', aceDeuce: 'Ace-deuce (3)', twelve: 'Twelve',
  };
  if (!n) return names[base] || key;
  if (base === 'come') return `Come on ${n}`;
  if (base === 'dc') return `Don't come on ${n}`;
  if (base === 'comeOdds') return `Odds on come ${n}`;
  if (base === 'dcOdds') return `Lay odds on don't come ${n}`;
  if (base === 'place') return `Place ${n}`;
  if (base === 'hard') return `Hard ${n}`;
  return key;
}
