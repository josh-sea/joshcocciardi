/* The odds drawer: swipes in from the right edge (or the Odds tab), out
 * with a swipe back. Three tabs:
 *
 *   Odds   what every move is worth right now, from the cards left in the
 *          shoe; your chance to bust; where the dealer ends up
 *   Chart  the basic strategy chart for this table, your hand lit up
 *   Count  the Hi-Lo count, what is left in the shoe, and a count quiz
 *
 * On a wide screen it can stay pinned open beside the table.
 */
import { esc, pct, evWords, signed } from './ui.js';
import { chart, UPS, UP_LABEL, ACTION_NAME, INSURANCE_INDEX } from './strategy.js';
import { dealerOdds, moveEVs, nextCard, standOdds, insuranceOdds, houseEdge } from './odds.js';
import { fullComp, totalOf, compSize, decksLeft } from './cards.js';

const ORDER = ['H', 'S', 'D', 'P', 'R'];
const CODE_CLASS = { H: 'h', S: 's', D: 'd', Ds: 'd', P: 'p', Ph: 'p', R: 'r', Rs: 'r', Rp: 'r' };

function bar(p, cls = '') {
  return `<span class="pbar ${cls}"><i style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%"></i></span>`;
}

function dealerTable(d, { title = 'Where the dealer ends up', showBj = false } = {}) {
  const rows = [['17', d[17]], ['18', d[18]], ['19', d[19]], ['20', d[20]], ['21', d[21]], ['Bust', d.bust]];
  if (showBj) rows.push(['Blackjack', d.bj]);
  return `<h4>${title}</h4><table class="odds-t">${rows.map(([k, p]) => `
    <tr class="${k === 'Bust' ? 'bust' : ''}"><th>${k}</th><td>${bar(p, k === 'Bust' ? 'good' : '')}</td><td class="num">${pct(p, 1)}</td></tr>`).join('')}</table>`;
}

function evTable(evs, can, chartMove, ids) {
  const keys = ORDER.filter((k) => evs[k] !== undefined && (k !== 'P' || (ids.length === 2 && ids[0] === ids[1])));
  const allowed = keys.filter((k) => can[k]);
  const best = allowed.reduce((a, k) => (a === null || evs[k] > evs[a] ? k : a), null);
  // Doubles and splits risk two bets, so the scale runs from -2 to +2.
  const lo = -2, hi = 2;
  return `<table class="ev-t">${keys.map((k) => {
    const ev = evs[k];
    const e = Math.max(lo, Math.min(hi, ev));
    const left = ((Math.min(e, 0) - lo) / (hi - lo)) * 100, width = (Math.abs(e) / (hi - lo)) * 100;
    const tags = [k === best ? '<em class="tag best">best now</em>' : '', k === chartMove ? '<em class="tag chart">chart</em>' : ''].join('');
    return `<tr class="${can[k] ? '' : 'off'}">
      <th>${ACTION_NAME[k]}</th>
      <td class="evbar"><span><i class="${ev >= 0 ? 'pos' : 'neg'}" style="left:${left.toFixed(1)}%;width:${Math.max(0.6, width).toFixed(1)}%"></i><b></b></span></td>
      <td class="num">${signed(ev)}</td>
      <td class="tags">${tags}${can[k] ? '' : '<em class="tag">not now</em>'}</td></tr>`;
  }).join('')}</table>
  ${best ? `<p class="small">${esc(ACTION_NAME[best])} ${evWords(evs[best])} on average${best === 'D' ? ' (on the doubled bet, counted in original bets)' : ''}.</p>` : ''}`;
}

function oddsTab(s) {
  const out = [];
  const rules = s.rules;
  if (s.phase === 'insurance' && s.up === 1) {
    const ins = insuranceOdds(s.comp);
    const d = dealerOdds(1, s.comp, { h17: rules.h17, peeked: false });
    out.push(`<h3>Insurance</h3>
      <p>Insurance is a side bet of half your bet that the dealer has a ten underneath. It pays 2 to 1.</p>
      <table class="odds-t"><tr><th>Ten underneath</th><td>${bar(ins.tenChance)}</td><td class="num">${pct(ins.tenChance, 1)}</td></tr>
      <tr><th>Break-even</th><td>${bar(1 / 3, 'mark')}</td><td class="num">33.3%</td></tr></table>
      <p class="verdict ${ins.ev > 0 ? 'yes' : 'no'}">${ins.ev > 0 ? 'Worth taking right now' : 'Not worth it'}: it ${evWords(ins.ev)} insured.</p>
      <p class="small muted">Basic strategy never takes it. Counters take it at a true count of +${INSURANCE_INDEX} or more, when tens are rich enough.</p>`);
    out.push(dealerTable(d, { title: 'Dealer, before checking', showBj: true }));
    return out.join('');
  }
  if (s.hand && s.up) {
    const ids = s.hand.cards.map((c) => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0])));
    const t = totalOf(ids);
    const evs = moveEVs(ids, s.up, s.comp, rules);
    const d = dealerOdds(s.up, s.comp, { h17: rules.h17, peeked: true });
    const st = standOdds(t.total, d);
    const nx = nextCard(ids, s.comp);
    const can = { H: s.can.hit, S: s.can.stand, D: s.can.double, P: s.can.split, R: s.can.surrender };
    out.push(`<h3>${t.soft && t.total < 21 ? 'Soft ' : ''}${t.total} against a dealer ${UP_LABEL(s.up)}</h3>
      <h4>What each move is worth</h4>${evTable(evs, can, s.advice ? s.advice.action : null, ids)}`);
    out.push(`<div class="two">
      <div><h4>If you stand</h4><table class="odds-t">
        <tr><th>Win</th><td>${bar(st.win, 'good')}</td><td class="num">${pct(st.win)}</td></tr>
        <tr><th>Push</th><td>${bar(st.push)}</td><td class="num">${pct(st.push)}</td></tr>
        <tr><th>Lose</th><td>${bar(st.lose, 'bad')}</td><td class="num">${pct(st.lose)}</td></tr></table></div>
      <div><h4>If you take a card</h4><table class="odds-t">
        <tr class="bust"><th>Bust</th><td>${bar(nx.bust, 'bad')}</td><td class="num">${pct(nx.bust)}</td></tr>
        ${Object.entries(nx.totals).filter(([k]) => Number(k) >= 17).sort((a, b) => a[0] - b[0]).map(([k, p]) => `<tr><th>${k}</th><td>${bar(p)}</td><td class="num">${pct(p)}</td></tr>`).join('')}
        <tr><th>Under 17</th><td>${bar(Object.entries(nx.totals).filter(([k]) => Number(k) < 17).reduce((a, [, p]) => a + p, 0))}</td><td class="num">${pct(Object.entries(nx.totals).filter(([k]) => Number(k) < 17).reduce((a, [, p]) => a + p, 0))}</td></tr>
      </table></div></div>`);
    out.push(dealerTable(d, { title: `Dealer ${UP_LABEL(s.up)} finishes on` }));
    out.push('<p class="small muted">From the cards still in this shoe. When this disagrees with the chart, the shoe has drifted from normal; the count tab says which way.</p>');
    return out.join('');
  }
  if (s.up && s.phase !== 'betting') {
    out.push(dealerTable(dealerOdds(s.up, s.comp, { h17: rules.h17, peeked: s.phase !== 'insurance' }), { title: `Dealer ${UP_LABEL(s.up)} finishes on` }));
  }
  // Between hands: the table itself.
  const fresh = fullComp(rules.decks);
  const edge = houseEdge(rules);
  out.push(`<h3>This table</h3>
    <p>${rules.decks} deck${rules.decks > 1 ? 's' : ''} · dealer ${rules.h17 ? 'hits' : 'stands on'} soft 17 · blackjack pays ${rules.bj === 1.5 ? '3 to 2' : '6 to 5'} · ${rules.das ? 'double after split' : 'no double after split'} · ${rules.surrender ? 'late surrender' : 'no surrender'}</p>
    <p>With perfect basic strategy the house keeps about <b>${edge.toFixed(2)}%</b> of what you bet, ${Math.round(edge * 100) / 100 <= 0.5 ? 'a good game' : edge > 1.2 ? 'a poor game: 6 to 5 blackjack costs more than every other rule put together' : 'an average game'}.</p>`);
  if (s.showCount) {
    const player = -edge + 0.5 * Math.floor(s.tc);
    out.push(`<p>At a true count of ${signed(s.tc, 1)} your edge is roughly <b>${signed(player, 1)}%</b> (each +1 of true count is worth about half a percent). ${player > 0 ? 'Counters raise their bet here.' : 'Counters bet the minimum here.'}</p>`);
  }
  out.push(`<h4>How often each dealer card busts</h4><table class="odds-t bust-by">${UPS.map((u) => {
    const p = dealerOdds(u, fresh, { h17: rules.h17, peeked: false }).bust;
    return `<tr class="${u === s.up ? 'hl' : ''}"><th>${UP_LABEL(u)}</th><td>${bar(p, 'good')}</td><td class="num">${pct(p)}</td></tr>`;
  }).join('')}</table>
  <p class="small muted">2 to 6 are the bust cards: the dealer must draw to 17 and often goes over. That is why you stand on a stiff hand against them.</p>`);
  return out.join('');
}

function chartTab(s) {
  const t = chart(s.rules);
  const hl = s.advice && s.advice.cell;
  const head = `<tr><th></th>${UPS.map((u) => `<th class="${hl && hl.up === u ? 'hlc' : ''}">${UP_LABEL(u)}</th>`).join('')}</tr>`;
  const section = (kind, title, keys, labelFor) => `<h4>${title}</h4><div class="chart-wrap"><table class="chart">${head}${keys.map((k) => `
    <tr><th class="${hl && hl.kind === kind && hl.key === k ? 'hlc' : ''}">${labelFor(k)}</th>${UPS.map((u, i) => {
      const code = t[kind][k][i];
      const on = hl && hl.kind === kind && hl.key === k && hl.up === u;
      return `<td class="c-${CODE_CLASS[code]}${on ? ' on' : ''}">${code}</td>`;
    }).join('')}</tr>`).join('')}</table></div>`;
  const hard = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  return `${hl ? `<p class="small">Your hand: <b>${esc(s.advice.name)}</b> → ${esc(s.advice.code)}</p>` : ''}
    ${section('hard', 'Hard totals', hard, (k) => (k === 8 ? '5–8' : k === 17 ? '17+' : String(k)))}
    ${section('soft', 'Soft totals', [2, 3, 4, 5, 6, 7, 8, 9], (k) => `A,${k}`)}
    ${section('pair', 'Pairs', [1, 10, 9, 8, 7, 6, 5, 4, 3, 2], (k) => (k === 1 ? 'A,A' : k === 10 ? '10,10' : `${k},${k}`))}
    <p class="legend"><span class="c-h">H</span> Hit <span class="c-s">S</span> Stand <span class="c-d">D</span> Double (Ds: else stand) <span class="c-p">P</span> Split (Ph: only with double after split) <span class="c-r">R</span> Surrender (Rs: else stand, Rp: else split)</p>
    <p class="small muted">For ${s.rules.decks >= 4 ? 'this shoe' : '4 to 8 decks; with ' + s.rules.decks + ' deck' + (s.rules.decks > 1 ? 's' : '') + ' a few close cells differ, and the Odds tab shows them'}. Dealer ${s.rules.h17 ? 'hits' : 'stands on'} soft 17.</p>`;
}

function countTab(s) {
  const left = s.cardsLeft;
  const dl = decksLeft(left);
  const fresh = fullComp(s.rules.decks);
  const size = compSize(fresh) || 1, now = compSize(s.comp) || 1;
  const rows = [[1, 'A'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10s']];
  const shown = s.showCount || s.peekCount;
  return `<div class="count-big ${shown ? '' : 'hidden-count'}">
      <div><span>Running</span><b>${shown ? signed(s.rc, 0).replace('.00', '') : '?'}</b></div>
      <div><span>True</span><b>${shown ? signed(s.tc, 1) : '?'}</b></div>
      <div><span>Decks left</span><b>${dl}</b></div></div>
    ${shown ? '' : '<p class="center"><button class="btn small" data-peek>Show the count</button> <button class="btn small gold" data-quiz>Quiz me</button></p>'}
    ${shown ? '<p class="center"><button class="btn small gold" data-quiz>Quiz me</button></p>' : ''}
    <div class="quiz" hidden><label>Running count? <input type="number" inputmode="numeric" step="1" data-quiz-in></label> <button class="btn small" data-quiz-go>Check</button><p data-quiz-out></p></div>
    <h4>Hi-Lo</h4>
    <p class="hilo"><span class="plus">2 3 4 5 6 → +1</span><span class="zero">7 8 9 → 0</span><span class="minus">10 J Q K A → −1</span></p>
    <p class="small">Add as cards show. Divide by decks left for the true count. A high count means the shoe is rich in tens and aces: more blackjacks, more dealer busts, better doubles.</p>
    <h4>Left in the shoe (vs. a fresh one)</h4>
    <table class="odds-t comp">${rows.map(([i, l]) => {
      const exp = fresh[i] / size, cur = (s.comp[i] || 0) / now;
      const diff = cur - exp;
      return `<tr><th>${l}</th><td>${bar(cur / (i === 10 ? 0.4 : 0.12))}</td><td class="num">${s.comp[i] || 0}</td><td class="num ${Math.abs(diff) < 0.004 ? '' : diff > 0 ? 'rich' : 'poor'}">${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)}</td></tr>`;
    }).join('')}</table>
    <p class="small muted">${left} cards left of ${s.rules.decks * 52}. The last column is how far each card is above or below its normal share, in points.</p>`;
}

export function mountDrawer(el, { onPeek, onQuiz } = {}) {
  let tab = 'odds', last = null, quizOpen = false;
  el.innerHTML = `<div class="drawer-head">
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="odds" class="on">Odds</button>
        <button role="tab" data-tab="chart">Chart</button>
        <button role="tab" data-tab="count">Count</button></div>
      <button class="pin" data-pin title="Keep open beside the table" aria-label="Pin open">📌</button>
      <button class="close" data-close aria-label="Close">✕</button></div>
    <div class="drawer-body"></div>`;
  const body = el.querySelector('.drawer-body');

  function render(s) {
    last = s || last;
    if (!last || !isOpen()) return;
    body.innerHTML = tab === 'odds' ? oddsTab(last) : tab === 'chart' ? chartTab(last) : countTab(last);
    if (tab === 'count' && quizOpen) body.querySelector('.quiz').hidden = false;
    if (tab === 'chart') {
      const on = body.querySelector('td.on');
      if (on) on.scrollIntoView({ block: 'center', inline: 'center' });
    }
  }
  const isOpen = () => document.body.classList.contains('drawer-open') || document.body.classList.contains('drawer-pinned');
  function open(t) {
    if (t) setTab(t, false);
    document.body.classList.add('drawer-open');
    el.setAttribute('aria-hidden', 'false');
    render();
  }
  function close() {
    document.body.classList.remove('drawer-open');
    if (!document.body.classList.contains('drawer-pinned')) el.setAttribute('aria-hidden', 'true');
  }
  function setTab(t, draw = true) {
    tab = t;
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (draw) render();
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) setTab(b.dataset.tab);
    else if (b.hasAttribute('data-close')) { document.body.classList.remove('drawer-pinned'); close(); }
    else if (b.hasAttribute('data-pin')) {
      const pinned = document.body.classList.toggle('drawer-pinned');
      try { localStorage.setItem('casino.pin', pinned ? '1' : '0'); } catch { /* fine */ }
      if (pinned) open(); else close();
    } else if (b.hasAttribute('data-peek')) { onPeek && onPeek(); }
    else if (b.hasAttribute('data-quiz')) {
      quizOpen = !quizOpen;
      const q = body.querySelector('.quiz');
      q.hidden = !quizOpen;
      if (quizOpen) q.querySelector('input').focus();
    } else if (b.hasAttribute('data-quiz-go')) {
      const v = Number(body.querySelector('[data-quiz-in]').value);
      const out = body.querySelector('[data-quiz-out]');
      const ok = v === last.rc;
      out.innerHTML = ok ? '✅ Right on.' : `❌ It's ${signed(last.rc, 0)}. You said ${signed(v, 0)}.`;
      onQuiz && onQuiz(ok);
    }
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-quiz-in]')) body.querySelector('[data-quiz-go]').click();
  });

  /* Swipe in from the right edge, swipe right on the drawer to close. */
  let sx = 0, sy = 0, from = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    from = el.contains(e.target) ? 'drawer' : (sx > window.innerWidth - 28 ? 'edge' : document.querySelector('#table:not([hidden]) .felt')?.contains(e.target) ? 'felt' : null);
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.8) { from = null; return; }
    if (dx < 0 && (from === 'edge' || from === 'felt') && !$tableHidden()) open();
    else if (dx > 0 && from === 'drawer') { document.body.classList.remove('drawer-pinned'); close(); }
    from = null;
  }, { passive: true });
  const $tableHidden = () => { const t = document.getElementById('table'); return !t || t.hidden; };

  try { if (localStorage.getItem('casino.pin') === '1' && window.matchMedia('(min-width: 1000px)').matches) document.body.classList.add('drawer-pinned'); } catch { /* fine */ }

  return { render, open, close, toggle: () => (document.body.classList.contains('drawer-open') ? close() : open()), setTab, isOpen };
}
