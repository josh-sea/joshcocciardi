/* The blackjack table on screen: dealer, your seat, everyone else's, and
 * the buttons for whatever phase the table is in. Rendering only; app.js
 * owns what happens when a button is tapped.
 */
import { $, esc, money, cardHtml, sound, setHtml } from './ui.js';
import { describe, handValue } from './cards.js';
import { RESULT_LABEL, inRound, MAX_SEATS } from './blackjack.js';
import { ACTION_NAME } from './strategy.js';

export const CHIPS = [1, 5, 25, 100, 500, 1000];

/* Cards that are new since the last render deal in, one after another. */
const seenCards = new Map();
let seenRound = -1, holeWasDown = false;

function cardsHtml(key, cards, stagger, flipAt = -1) {
  const before = seenCards.get(key) || 0;
  seenCards.set(key, cards.length);
  return cards.map((c, i) => {
    if (i === flipAt && i < before) { stagger.sounds.push(0); return cardHtml(c, 'flip'); }
    if (i < before) return cardHtml(c);
    const delay = stagger.n++ * 140;
    stagger.sounds.push(delay);
    return cardHtml(c, 'deal').replace('<span class="card', `<span style="animation-delay:${delay}ms" class="card`);
  }).join('');
}

function chipStack(amount) {
  if (!amount) return '';
  let left = Math.floor(amount);
  const parts = [];
  for (const c of [...CHIPS].reverse()) {
    while (left >= c && parts.length < 6) { parts.push(c); left -= c; }
  }
  return `<span class="stack">${parts.reverse().map((c, i) => `<i class="chip c${c}" style="--i:${i}"></i>`).join('')}</span>`;
}

function handHtml(key, hand, { active, stagger, small }) {
  const v = handValue(hand.cards);
  const total = describe(hand.cards, hand.split);
  const res = hand.res && hand.net !== undefined ? `<span class="res r-${hand.res}">${RESULT_LABEL[hand.res]}${hand.net ? ` ${money(hand.net, { sign: true })}` : ''}</span>` : hand.res === 'surrender' ? '<span class="res r-surrender">Surrendered</span>' : '';
  return `<div class="hand${active ? ' active' : ''}${v.bust ? ' busted' : ''}${hand.res ? ` done-${hand.res}` : ''}${small ? ' small' : ''}">
    <div class="cards">${cardsHtml(key, hand.cards, stagger)}</div>
    <div class="hinfo">${total ? `<span class="total">${total}</span>` : ''}<span class="bet">${chipStack(hand.bet)}${money(hand.bet)}${hand.dbl ? ' ×2' : ''}</span>${res}</div>
  </div>`;
}

function seatStatus(pub, uid, s, online) {
  if (!online) return '<small class="away">away</small>';
  if (pub.phase === 'betting') return s.ready ? (s.bet ? `<small class="ok">✓ ${money(s.bet)}</small>` : '<small>sitting out</small>') : `<small class="muted">betting…</small>`;
  if (pub.phase === 'insurance' && inRound(s)) return s.ins === null ? '<small class="muted">deciding…</small>' : s.ins ? '<small>insured</small>' : '<small>no insurance</small>';
  if (pub.turn && pub.turn.uid === uid) return '<small class="turn">their turn</small>';
  return '';
}

export function renderTable(root, s) {
  const { pub, me } = s;
  if (pub.round !== seenRound) { seenCards.clear(); seenRound = pub.round; }
  const stagger = { n: 0, sounds: [] };
  const rules = pub.rules;

  // ── dealer ──
  const dCards = pub.dealer.cards || [];
  const holeDown = dCards[1] === '??';
  const flip = holeWasDown && !holeDown && dCards.length >= 2;
  holeWasDown = holeDown;
  const dv = handValue(dCards);
  let dTotal = '';
  if (dCards.length) dTotal = holeDown ? `Showing ${describe([dCards[0]])}` : describe(dCards);
  const dHtml = cardsHtml('d', dCards, stagger, flip ? 1 : -1);
  setHtml($('#dealer', root), `<div class="who">Dealer</div>
    <div class="cards">${dHtml || '<span class="card slot"></span><span class="card slot"></span>'}</div>
    ${dTotal ? `<div class="dtotal${dv.bust && !holeDown ? ' bust' : ''}${pub.dealer.bj && !holeDown ? ' bj' : ''}">${pub.dealer.bj && !holeDown ? 'Blackjack' : dTotal}</div>` : ''}`);

  setHtml($('#feltPrint', root), `<b>Blackjack pays ${rules.bj === 1.5 ? '3 to 2' : '6 to 5'}</b>
    <span>Dealer ${rules.h17 ? 'hits' : 'stands on'} soft 17 · Insurance 2 to 1</span>`);

  const left = pub.shoe.left || 0, size = pub.shoe.size || 1;
  setHtml($('#shoeMeter', root), `<span class="shoe" title="${left} cards left"><i style="height:${(left / size * 100).toFixed(0)}%"></i></span>
    <span class="cut" style="bottom:${((pub.shoe.cut || 0) / size * 100).toFixed(0)}%"></span>`);

  // ── other seats ──
  const onlineSet = new Set(s.online);
  const others = pub.order.filter((u) => u !== me);
  setHtml($('#others', root), others.map((u) => {
    const seat = pub.seats[u];
    const turn = pub.turn && pub.turn.uid === u;
    return `<div class="seat${turn ? ' turn' : ''}${onlineSet.has(u) ? '' : ' offline'}">
      <div class="sname">${esc(s.names[u] || seat.name)}${u === s.hostUid ? ' <span title="Host">👑</span>' : ''}</div>
      <div class="sbank">${money(seat.bank)}</div>
      ${seat.hands.map((h, i) => handHtml(`${u}:${i}`, h, { active: turn && pub.turn.h === i, stagger, small: true })).join('')}
      ${seatStatus(pub, u, seat, onlineSet.has(u))}
    </div>`;
  }).join(''));
  root.classList.toggle('multi', others.length > 0);

  // ── my seat ──
  const mine = pub.seats[me];
  const mineEl = $('#mine', root);
  if (!mine) {
    setHtml(mineEl, `<div class="watching">${pub.order.length >= MAX_SEATS ? 'The table is full (5 seats). You are watching; a seat opens when someone stands up.' : 'Taking a seat…'}</div>`);
  } else {
    const myTurn = pub.turn && pub.turn.uid === me;
    setHtml(mineEl, `<div class="hands n${mine.hands.length}">${mine.hands.length
      ? mine.hands.map((h, i) => handHtml(`${me}:${i}`, h, { active: myTurn && pub.turn.h === i, stagger })).join('')
      : `<div class="hand empty"><div class="cards"><span class="card slot"></span><span class="card slot"></span></div></div>`}</div>
      ${mine.last !== null && mine.last !== undefined && pub.phase === 'betting' ? `<div class="round-net ${mine.last > 0 ? 'up' : mine.last < 0 ? 'down' : ''}">${mine.last > 0 ? 'You won' : mine.last < 0 ? 'You lost' : 'Even'} ${mine.last ? money(Math.abs(mine.last)) : ''}${mine.ins && pub.dealer.bj ? ' (insurance paid)' : ''}</div>` : ''}`);
  }

  for (const d of stagger.sounds.slice(0, 8)) setTimeout(() => sound('card'), d);
  return stagger.n * 140;
}

/* ── controls ─────────────────────────────────────────────────────────── */

export function controlsHtml(s) {
  const { pub, me, can, pendingBet, hint } = s;
  const glow = (k) => (k === hint ? ' hinted' : '');
  const seat = pub.seats[me];
  const rules = pub.rules;
  if (!seat) {
    return pub.order.length < MAX_SEATS ? '<button class="btn big gold" data-act="sit">Take a seat</button>' : '';
  }
  if (pub.phase === 'betting') {
    const bet = pendingBet;
    const broke = seat.bank < rules.min;
    const chips = CHIPS.filter((c) => c <= Math.max(rules.max, 1000)).map((c) => `<button class="chip-btn c${c}" data-chip="${c}" ${c > seat.bank - bet ? 'disabled' : ''} aria-label="Add $${c}">${c >= 1000 ? `${c / 1000}K` : c}</button>`).join('');
    const multi = pub.order.length > 1 || s.multi;
    const deadline = pub.deadline ? `<span class="countdown" data-deadline="${pub.deadline}"></span>` : '';
    if (broke) {
      return `<p class="center">You're out of chips. ${s.multi ? 'Add more to keep playing.' : 'Add more, or start a new session from the menu.'}</p>
        <div class="row center">${[100, 500, 1000].map((n) => `<button class="btn gold" data-rebuy="${n}">Add ${money(n)}</button>`).join('')}</div>`;
    }
    return `<div class="betline"><span class="bank">Bank <b>${money(seat.bank - bet)}</b></span><span class="betamt">Bet <b>${money(bet)}</b></span>${deadline}</div>
      <div class="chips">${chips}</div>
      <div class="row">
        <button class="btn ghost" data-bet="clear" ${bet ? '' : 'disabled'}>Clear</button>
        <button class="btn ghost" data-bet="half" ${bet >= rules.min * 2 ? '' : 'disabled'}>½</button>
        <button class="btn ghost" data-bet="double" ${bet && bet * 2 <= seat.bank ? '' : 'disabled'}>2×</button>
        ${multi ? (seat.ready
          ? '<button class="btn wide" data-act="unready">Not ready</button>'
          : `<button class="btn wide gold" data-act="deal" ${bet && bet < rules.min ? 'disabled' : ''}>${bet ? 'Ready' : 'Sit out'}</button>`)
          : `<button class="btn wide gold" data-act="deal" ${bet >= rules.min ? '' : 'disabled'}>Deal</button>`}
      </div>
      <p class="small muted center">Table minimum ${money(rules.min)}${multi ? '. Deals when everyone is ready.' : '. Space or Enter to deal.'}</p>`;
  }
  if (pub.phase === 'insurance') {
    if (!inRound(seat)) return '<p class="center muted">Insurance…</p>';
    if (seat.ins !== null) return `<p class="center muted">Waiting for the others… <span class="countdown" data-deadline="${pub.deadline || ''}"></span></p>`;
    const cost = seat.hands[0].bet / 2;
    const bj = handValue(seat.hands[0].cards).bj;
    return `<p class="center">Dealer shows an ace. ${bj ? 'Take even money?' : `Insurance for ${money(cost)}?`} ${pub.deadline ? `<span class="countdown" data-deadline="${pub.deadline}"></span>` : ''}</p>
      <div class="row"><button class="btn wide${glow('N')}" data-act="ins-no" data-hint="N">No</button>
      <button class="btn wide${glow('I')}" data-act="ins-yes" data-hint="I" ${seat.bank >= cost ? '' : 'disabled'}>${bj ? 'Even money' : 'Insure'}</button></div>`;
  }
  if (pub.phase === 'play' && pub.turn && pub.turn.uid === me) {
    const b = (k, act, label, key) => `<button class="btn act a-${k}${glow(k)}" data-act="${act}" data-hint="${k}" ${can[act === 'surr' ? 'surrender' : act] ? '' : 'disabled'}><span>${label}</span><kbd>${key}</kbd></button>`;
    return `<div class="actions">
      ${b('H', 'hit', 'Hit', 'H')}${b('S', 'stand', 'Stand', 'S')}${b('D', 'double', 'Double', 'D')}${b('P', 'split', 'Split', 'P')}${rules.surrender ? b('R', 'surr', 'Surrender', 'R') : ''}
      </div>${pub.deadline ? `<p class="center small muted">Auto-stand in <span class="countdown" data-deadline="${pub.deadline}"></span>s</p>` : ''}`;
  }
  if (pub.phase === 'play' && pub.turn) {
    return `<p class="center muted">${esc(s.names[pub.turn.uid] || (pub.seats[pub.turn.uid] || {}).name || 'Someone')} is playing… ${pub.deadline ? `<span class="countdown" data-deadline="${pub.deadline}"></span>` : ''}</p>`;
  }
  if (pub.phase === 'dealer') return '<p class="center muted">Dealer plays…</p>';
  return '';
}

export function hintHtml(advice) {
  if (!advice) return '';
  const main = `💡 <b>${ACTION_NAME[advice.action]}</b> <span class="muted">· ${esc(advice.name)}</span>`;
  const dev = advice.dev ? `<div class="dev">🧮 Count says <b>${ACTION_NAME[advice.dev.action]}</b>: true count ${advice.dev.tc >= 0 ? '+' : ''}${advice.dev.tc.toFixed(1)}. ${esc(advice.dev.note)}.</div>` : '';
  return `<div class="hint">${main}${advice.whyText ? `<div class="why">${esc(advice.whyText)}</div>` : ''}${dev}</div>`;
}
