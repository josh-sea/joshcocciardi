/* The craps table on screen, and its odds drawer.
 *
 * The layout is stacked for a phone rather than drawn like the real felt:
 * dice and the puck on top, then the numbers (place bets, and your come
 * bets once they move), come and don't come, the field, the pass line and
 * don't pass with their odds, and the middle of the table folded away at
 * the bottom. Every spot carries its house edge, coloured from green (no
 * edge) to red (sucker bet).
 *
 * app.js owns the table (send, the room, the host); this module turns
 * taps into messages and the table into pixels.
 */
import { $, esc, money, toast, sound, buzz, setHtml, pct, diceClick, crowdSound, speak } from './ui.js';
import { POINTS, WAYS, parseKey, betName, betProblem, canTakeDown, maxOdds, TRUE_ODDS, LAY_ODDS, PLACE_PAYS, HARD_PAYS, PROP_PAYS, MAX_SEATS } from './craps.js';
import { houseEdge, edgeClass, EDGE_WORD, eventual, nextRoll, advice, presetBets, PRESETS, edgeTable, beforeSeven, P } from './craps-odds.js';
import { explain } from './craps-lessons.js';
import { dealerCall, crowd, beforeRoll, onBet, CROWD } from './craps-voice.js';
import { seeded } from './lobby.js';

export const CHIPS = [1, 5, 25, 100, 500];
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

export function dieHtml(n, cls = '') {
  return `<span class="die ${cls}" aria-label="${n || ''}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<i class="${(PIPS[n] || []).includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
}

const ratio = (r) => {
  const pairs = { 2: '2 to 1', 1.5: '3 to 2', 1.2: '6 to 5', 0.5: '1 to 2', 1.8: '9 to 5', 1.4: '7 to 5', 7: '7 to 1', 9: '9 to 1', 4: '4 to 1', 15: '15 to 1', 30: '30 to 1', 1: 'even' };
  for (const [k, v] of Object.entries(pairs)) if (Math.abs(Number(k) - r) < 1e-9) return v;
  if (Math.abs(r - 7 / 6) < 1e-9) return '7 to 6';
  if (Math.abs(r - 2 / 3) < 1e-9) return '2 to 3';
  if (Math.abs(r - 5 / 6) < 1e-9) return '5 to 6';
  return `${r}`;
};

function edgeBadge(key, rules) {
  const e = houseEdge(key, rules);
  const c = edgeClass(e);
  return `<em class="edge e-${c}" title="House edge ${e.toFixed(2)}%: ${EDGE_WORD[c]}">${e < 0.01 ? '0%' : `${e.toFixed(e < 10 ? 2 : 1)}%`}</em>`;
}

function chip(amt, cls = '') {
  return amt ? `<b class="mychip ${cls}">${money(amt)}</b>` : '';
}

export function mountCraps(root, drawerEl, hooks) {
  let chipVal = 5, takeDown = false, last = null, lastRolls = -1, tumble = 0, warned = new Set(), drawerTab = 'roll', narration = '';
  // The 3D table: 'off' until first needed, then 'loading', 'on' or 'failed'.
  let t3d = null, t3dState = 'off', thrownFor = -1, callTimer = 0;

  root.innerHTML = `<header class="bar">
      <button class="ghost" data-c="leave">← Lobby</button>
      <span class="ttitle" data-title></span>
      <span class="right"><span class="offline" data-live hidden>Reconnecting…</span><b class="tbank" data-bank></b>
        <button class="ghost icon" data-c="stats" aria-label="Stats">📈</button><button class="ghost icon" data-c="settings" aria-label="Settings">⚙️</button></span>
    </header>
    <div class="cfelt">
      <div class="dicebar">
        <div class="dice" data-dice>${dieHtml(0)}${dieHtml(0)}</div>
        <div class="puckbox"><span class="puck off" data-puck>OFF</span><small data-shooter></small></div>
      </div>
      <div class="history" data-history></div>
      <div class="stage-wrap">
        <div class="stage" data-stage></div>
        <div class="dealer-says" data-dealer hidden></div>
        <div class="bubbles" data-bubbles></div>
        <div class="chooser" data-chooser hidden></div>
        <p class="flick-hint" data-flick hidden>↑ Flick up to throw</p>
        <div class="stage-puck"><span class="puck off small2" data-puck3>OFF</span><small data-shooter3></small></div>
      </div>
      <div class="narr" data-narr aria-live="polite"></div>
      <div class="layout" data-layout></div>
    </div>
    <div class="coach" data-coach></div>
    <div class="ccontrols" data-controls></div>`;

  drawerEl.innerHTML = `<div class="drawer-head"><div class="tabs" role="tablist">
      <button data-dt="roll" class="on">Your bets</button><button data-dt="edges">Edges</button><button data-dt="dice">Dice</button></div>
      <button class="close" data-dclose aria-label="Close">✕</button></div><div class="drawer-body"></div>`;
  const dBody = drawerEl.querySelector('.drawer-body');

  const q = (sel) => root.querySelector(sel);

  /* ── the layout ── */

  function spot(key, label, sub, s, extra = '') {
    const { pub, me } = s;
    const mine = (pub.seats[me] && pub.seats[me].bets[key]) || 0;
    const others = pub.order.filter((u) => u !== me).reduce((a, u) => a + ((pub.seats[u].bets || {})[key] || 0), 0);
    const problem = pub.seats[me] && !takeDown ? betProblem(pub.seats[me], key, chipVal, pub.point, pub.rules) : null;
    const locked = mine && takeDown && !canTakeDown(key, pub.point);
    return `<button class="spot s-${parseKey(key).base}${mine ? ' has' : ''}${problem && !mine ? ' closed' : ''}${locked ? ' locked' : ''} ${extra}" data-spot="${key}">
      <span class="lbl">${label}</span>${sub ? `<small>${sub}</small>` : ''}${edgeBadge(key, pub.rules)}
      ${chip(mine)}${others ? `<i class="others" title="Others at the table">+${money(others)}</i>` : ''}</button>`;
  }

  function layoutHtml(s) {
    const { pub, me } = s;
    const r = pub.rules;
    const b = (pub.seats[me] && pub.seats[me].bets) || {};
    const nums = POINTS.map((n) => {
      const on = pub.point === n;
      const come = b[`come${n}`], dc = b[`dc${n}`];
      const sub = [];
      if (come) sub.push(`<span class="moved">Come ${money(come)}</span>${spot(`comeOdds${n}`, 'Odds', ratio(TRUE_ODDS[n]), s, 'mini')}`);
      if (dc) sub.push(`<span class="moved dark">Don't ${money(dc)}</span>${spot(`dcOdds${n}`, 'Lay', ratio(LAY_ODDS[n]), s, 'mini')}`);
      return `<div class="cnum${on ? ' point' : ''}">
        <div class="nhead"><b>${n === 6 ? 'SIX' : n === 9 ? 'NINE' : n}</b>${on ? '<span class="puck on small">ON</span>' : ''}</div>
        ${spot(`place${n}`, 'Place', ratio(PLACE_PAYS[n]), s)}
        ${sub.join('')}
      </div>`;
    }).join('');
    const odds = (key, flatKey, lay) => {
      if (!pub.point || !b[flatKey]) return '';
      const max = maxOdds(b[flatKey], pub.point, r.odds, lay);
      return spot(key, lay ? 'Lay odds' : 'Odds', `${ratio(lay ? LAY_ODDS[pub.point] : TRUE_ODDS[pub.point])} · max ${money(max)}`, s, 'odds');
    };
    const hard = [4, 6, 8, 10].map((n) => spot(`hard${n}`, `Hard ${n}`, `${n / 2}+${n / 2} · ${ratio(HARD_PAYS[n])}`, s, 'prop')).join('');
    const props = [
      ['seven', 'Any 7', ratio(PROP_PAYS.seven)], ['anyCraps', 'Any craps', `2, 3, 12 · ${ratio(PROP_PAYS.anyCraps)}`],
      ['yo', 'Yo (11)', ratio(PROP_PAYS.yo)], ['aceDeuce', 'Ace-deuce (3)', ratio(PROP_PAYS.aceDeuce)],
      ['aces', 'Aces (2)', ratio(PROP_PAYS.aces)], ['twelve', 'Twelve', ratio(PROP_PAYS.twelve)],
    ].map(([k, l, sub]) => spot(k, l, sub, s, 'prop')).join('');
    const propsOn = ['hard4', 'hard6', 'hard8', 'hard10', 'seven', 'anyCraps', 'yo', 'aceDeuce', 'aces', 'twelve'].some((k) => b[k]);
    return `<div class="nums">${nums}</div>
      <div class="row2">${spot('come', 'Come', pub.point ? 'like a new pass line' : 'after a point is set', s)}${spot('dc', 'Don\'t come', '', s)}</div>
      ${spot('field', 'Field', `2 3 4 9 10 11 12 · 2 pays 2×, 12 pays ${r.field12}×`, s, 'wide')}
      <div class="row2 line">${spot('pass', 'Pass line', pub.point ? 'with the shooter' : 'bet before the come-out', s)}${odds('passOdds', 'pass', false)}</div>
      <div class="row2 line">${spot('dp', 'Don\'t pass', 'bar 12', s)}${odds('dpOdds', 'dp', true)}</div>
      <details class="middle"${propsOn ? ' open' : ''}><summary>Middle of the table <em class="edge e-bad">9% to 17%</em></summary>
        <div class="props">${hard}${props}</div>
        <p class="small muted">Hardways and the one-roll bets pay big and keep a lot. Hardways are off on the come-out.</p></details>`;
  }

  function controlsHtml(s) {
    const { pub, me } = s;
    const seat = pub.seats[me];
    if (!seat) return pub.order.length < MAX_SEATS ? '<button class="btn big gold" data-c="sit">Take a spot at the rail</button>' : '<p class="center muted">The table is full. You are watching.</p>';
    const shooter = pub.shooter === me;
    const rolling = pub.phase === 'rolling';
    const onTable = Object.values(seat.bets).reduce((a, v) => a + v, 0);
    const broke = seat.bank < pub.rules.min && !onTable;
    return `<div class="chipsel">${CHIPS.map((c) => `<button class="chip-btn c${c}${chipVal === c ? ' sel' : ''}" data-chip="${c}" ${c > seat.bank && !takeDown ? 'disabled' : ''}>${c}</button>`).join('')}
        <button class="btn small ${takeDown ? 'gold' : 'ghost'}" data-c="take" aria-pressed="${takeDown}">${takeDown ? 'Tap a bet to take it down' : 'Take down'}</button></div>
      <div class="betline"><span>On the table <b>${money(onTable)}</b></span>${pub.deadline && !rolling ? `<span class="countdown" data-deadline="${pub.deadline}"></span>` : ''}</div>
      ${broke ? `<div class="row center">${[100, 500, 1000].map((n) => `<button class="btn gold" data-rebuy="${n}">Add ${money(n)}</button>`).join('')}</div>` : ''}
      ${shooter
        ? `<button class="btn big gold roll" data-c="roll" ${rolling ? 'disabled' : ''}>🎲 ${rolling ? 'Rolling…' : pub.point ? `Roll · point is ${pub.point}` : 'Roll the come-out'}<kbd>Space</kbd></button>`
        : `<p class="center muted">${esc(s.names[pub.shooter] || (pub.seats[pub.shooter] || {}).name || 'Someone')} has the dice${rolling ? '…' : ''}</p>`}`;
  }

  function coachHtml(s) {
    const { pub, me, settings } = s;
    const seat = pub.seats[me];
    if (!seat || !settings.hints) return '';
    const tips = advice(seat, pub.point, pub.rules).slice(0, 2);
    const presets = Object.entries(PRESETS).map(([k, p]) => {
      const bets = presetBets(k, seat, pub.point, pub.rules);
      const cost = bets.reduce((a, [, v]) => a + v, 0);
      return `<button class="preset" data-preset="${k}" ${bets.length && cost <= seat.bank && pub.phase === 'betting' ? '' : 'disabled'} title="${esc(p.blurb)}">${esc(p.name)}${bets.length ? ` <small>${money(cost)}</small>` : ''}</button>`;
    }).join('');
    return `${tips.map((t) => `<div class="hint ${t.kind === 'warn' ? 'warn' : ''}">${t.kind === 'warn' ? '⚠️' : '💡'} ${esc(t.text)}${t.preset ? ` <button class="btn tiny gold" data-preset="${t.preset}">Do it</button>` : ''}</div>`).join('')}
      <div class="presets"><span class="small muted">Smart bets</span>${presets}</div>`;
  }

  /* ── the drawer ── */

  function drawerHtml(s) {
    const { pub, me } = s;
    const r = pub.rules;
    if (drawerTab === 'edges') {
      return `<h3>House edge, bet by bet</h3><p class="small">What the house keeps of every dollar you bet, on average. Lower is better.</p>
        <table class="odds-t">${edgeTable(r).map((x) => `<tr><th>${esc(x.name)}</th><td><span class="pbar edgebar e-${x.cls}"><i style="width:${Math.min(100, x.edge / 17 * 100).toFixed(1)}%"></i></span></td><td class="num">${x.edge.toFixed(2)}%</td></tr>`).join('')}</table>
        <p class="small muted">Odds have no edge because they pay exactly what the risk is worth. They are the reason a pass line with full odds is the best way to play.</p>`;
    }
    if (drawerTab === 'dice') {
      const counts = new Array(13).fill(0);
      for (const h of pub.history) counts[h.d[0] + h.d[1]]++;
      const n = pub.history.length || 1;
      return `<h3>The 36 ways</h3><table class="odds-t">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => `<tr class="${t === 7 ? 'bust' : ''}${t === pub.point ? ' hl' : ''}"><th>${t}</th><td><span class="pbar${t === 7 ? ' bad' : ''}"><i style="width:${(WAYS[t] / 6 * 100).toFixed(0)}%"></i></span></td><td class="num">${WAYS[t]}/36</td><td class="num">${pct(P[t], 1)}</td></tr>`).join('')}</table>
        <h4>Point before a 7</h4><table class="odds-t">${[4, 5, 6].map((p) => `<tr class="${p === pub.point || 14 - p === pub.point ? 'hl' : ''}"><th>${p} or ${14 - p}</th><td><span class="pbar good"><i style="width:${(beforeSeven(p) * 100).toFixed(0)}%"></i></span></td><td class="num">${pct(beforeSeven(p))}</td><td class="num small">odds pay ${ratio(TRUE_ODDS[p])}</td></tr>`).join('')}</table>
        <p class="small muted">The odds bet pays exactly the inverse of these chances: that's what "true odds" means.</p>
        ${pub.history.length ? `<h4>Last ${pub.history.length} rolls here</h4><p>${pub.history.map((h) => h.d[0] + h.d[1]).join(' · ')}</p><p class="small muted">${counts[7]} sevens in ${n} rolls (${pct(counts[7] / n)}; 16.7% is average). Short runs wander a lot. The dice have no memory.</p>` : ''}`;
    }
    const seat = pub.seats[me];
    const keys = seat ? Object.keys(seat.bets) : [];
    const head = `<h3>${pub.point ? `Point is ${pub.point}` : 'Come-out roll'}</h3>
      <p class="small">${pub.point ? `The shooter needs ${pub.point === 8 ? 'an' : 'a'} ${pub.point} before a 7: ${pct(beforeSeven(pub.point))} of the time.` : '7 or 11 wins the pass line, 2, 3 or 12 loses, anything else becomes the point.'}</p>`;
    if (!keys.length) return `${head}<p class="muted">You have no bets down. Tap a spot on the layout, or a smart bet.</p>`;
    const rows = keys.map((k) => {
      const amt = seat.bets[k];
      const nx = nextRoll(k, pub.point, r);
      const { base, n } = parseKey(k);
      const ev = eventual(k, ['place', 'hard', 'come', 'dc', 'comeOdds', 'dcOdds'].includes(base) && n ? n : pub.point, r);
      const off = (nx.win + nx.lose) === 0;
      return `<tr><th>${esc(betName(k))}<br><small class="muted">${money(amt)}</small></th>
        <td class="num ${off ? '' : 'rich'}">${off ? 'off' : pct(nx.win)}</td><td class="num ${off ? '' : 'poor'}">${off ? '' : pct(nx.lose)}</td>
        <td class="num">${pct(ev.win)}</td><td class="num">${ev.ev >= 0 ? '+' : '−'}${money(Math.abs(ev.ev * amt))}</td></tr>`;
    }).join('');
    const cost = keys.reduce((a, k) => a + seat.bets[k] * houseEdge(k, r) / 100, 0);
    return `${head}<table class="odds-t bets-t"><tr><th></th><th class="num">Next roll<br>wins</th><th class="num">loses</th><th class="num">Wins in<br>the end</th><th class="num">Worth</th></tr>${rows}</table>
      <p class="small">Your bets cost about <b>${money(cost)}</b> in house edge, on average, by the time they're settled. "Worth" is what each bet is expected to win or lose from here.</p>
      <p class="small muted">A pass line looks bad once a point is set (the 7 is more likely than any point), but it was ahead on the come-out. Over a whole round it keeps 1.41%.</p>`;
  }

  function renderDrawer(s) {
    drawerEl.querySelectorAll('[data-dt]').forEach((b) => b.classList.toggle('on', b.dataset.dt === drawerTab));
    if (document.body.classList.contains('cdrawer-open')) setHtml(dBody, drawerHtml(s));
  }

  /* ── render ── */

  function render(s) {
    last = s;
    const { pub, me } = s;
    const seat = pub.seats[me];
    q('[data-title]').innerHTML = s.title;
    q('[data-bank]').textContent = seat ? money(seat.bank) : '';
    q('[data-live]').hidden = s.live !== false;

    // A new roll landed.
    if (pub.rolls !== lastRolls) {
      const first = lastRolls === -1;
      lastRolls = pub.rolls;
      if (!first && pub.dice.length) landed(s);
      else if (pub.dice.length) narration = '';
    }
    const rolling = pub.phase === 'rolling';
    const want3d = s.settings.table3d !== false;
    if (want3d && t3dState === 'off') load3d();
    const use3d = want3d && t3dState === 'on';
    root.classList.toggle('three', want3d && t3dState !== 'failed');
    if (use3d) {
      if (rolling && thrownFor !== pub.rolls) {
        thrownFor = pub.rolls;
        q('[data-chooser]').hidden = true;
        t3d.throwDice(pub.throw || {}, pub.dice);
        sound('card');
      }
      const others = {};
      for (const u of pub.order) {
        if (u === me) continue;
        for (const [k, v] of Object.entries((pub.seats[u] || {}).bets || {})) others[k] = (others[k] || 0) + v;
      }
      t3d.update({ bets: seat ? seat.bets : {}, others, point: pub.point, lines: seat ? seat.lines : [], rolls: pub.rolls, rules: pub.rules });
      const shooter = pub.shooter === me;
      q('[data-flick]').hidden = !(shooter && pub.phase === 'betting');
      const p3 = q('[data-puck3]');
      p3.textContent = pub.point ? `ON ${pub.point}` : 'OFF';
      p3.className = `puck small2 ${pub.point ? 'on' : 'off'}`;
      q('[data-shooter3]').textContent = shooter ? 'Your dice' : `${s.names[pub.shooter] || (pub.seats[pub.shooter] || {}).name || ''} shooting`;
    }
    if (rolling && !tumble && !use3d) {
      sound('card');
      tumble = setInterval(() => {
        const dice = q('[data-dice]');
        dice.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6), 'tumble') + dieHtml(1 + Math.floor(Math.random() * 6), 'tumble');
      }, 90);
    }
    if (!rolling && tumble) { clearInterval(tumble); tumble = 0; }
    if (!rolling) setHtml(q('[data-dice]'), pub.dice.length ? dieHtml(pub.dice[0], 'land') + dieHtml(pub.dice[1], 'land') : dieHtml(6) + dieHtml(1));

    const puck = q('[data-puck]');
    puck.textContent = pub.point ? `ON ${pub.point}` : 'OFF';
    puck.className = `puck ${pub.point ? 'on' : 'off'}`;
    q('[data-shooter]').textContent = pub.shooter === me ? 'You have the dice' : `${s.names[pub.shooter] || (pub.seats[pub.shooter] || {}).name || ''} shooting`;
    setHtml(q('[data-history]'), pub.history.slice(0, 14).map((h) => {
      const t = h.d[0] + h.d[1];
      const cls = t === 7 ? (h.p ? 'out' : 'nat') : h.p && t === h.p ? 'made' : !h.p && POINTS.includes(t) ? 'pt' : '';
      return `<span class="h ${cls}" title="${h.d[0]}+${h.d[1]}">${t}</span>`;
    }).join(''));
    setHtml(q('[data-narr]'), s.settings.narrate && narration ? narration : '');
    if (!use3d) setHtml(q('[data-layout]'), layoutHtml(s));
    setHtml(q('[data-coach]'), coachHtml(s));
    setHtml(q('[data-controls]'), controlsHtml(s));
    renderDrawer(s);
  }

  function landed(s) {
    const { pub, me } = s;
    const seat = pub.seats[me];
    const [d1, d2] = pub.dice;
    const total = d1 + d2;
    const story = explain({ total, hard: d1 === d2, before: pub.lastPoint || 0, after: pub.point, event: pub.event });
    let mine = '';
    if (seat && seat.lines.length) {
      const parts = seat.lines.filter((l) => l.out !== 'back' || l.why).map((l) => {
        if (l.out === 'win') return `<span class="up">${esc(betName(l.key))} +${money(l.profit)}</span>`;
        if (l.out === 'lose') return `<span class="down">${esc(betName(l.key))} −${money(l.amt)}</span>`;
        if (l.out === 'move') return `<span>Come bet moves to the ${l.to}</span>`;
        if (l.out === 'push') return `<span>${esc(betName(l.key))} ties</span>`;
        return `<span class="muted">${esc(betName(l.key))} returned (${esc(l.why)})</span>`;
      });
      mine = `<div class="mine-lines">${parts.join(' · ')}${seat.net ? ` <b class="${seat.net > 0 ? 'up' : 'down'}">= ${seat.net > 0 ? '+' : '−'}${money(Math.abs(seat.net))}</b>` : ''}</div>`;
      if (seat.net > 0) sound(pub.event === 'hit' ? 'bj' : 'win');
      else if (seat.net < 0) { sound('lose'); buzz(30); }
    }
    narration = `<div class="story">🎲 ${dieHtml(d1, 'tiny')}${dieHtml(d2, 'tiny')} ${esc(story)}</div>${mine}`;
    if (!s.settings.narrate && seat && seat.net) toast(`${total}: ${seat.net > 0 ? '+' : '−'}${money(Math.abs(seat.net))}`);
    hooks.onLanded && hooks.onLanded(pub, seat);

    // The stickman calls it and the rail reacts. Seeded by the throw, so
    // every phone at the table hears the same thing.
    const r = seeded(((pub.throw && pub.throw.s) || 1) + pub.rolls * 97);
    const info = { total, hard: d1 === d2, before: pub.lastPoint || 0, after: pub.point, event: pub.event, streak: pub.streak || 0 };
    showDealer(dealerCall(info, r), s);
    const names = [...CROWD, ...pub.order.filter((u) => u !== me).map((u) => s.names[u] || (pub.seats[u] || {}).name).filter(Boolean)];
    const c = crowd(info, r, names);
    c.lines.forEach((l, i) => setTimeout(() => bubble(l.who, l.text, i), 350 + i * 650));
    if (c.mood) setTimeout(() => crowdSound(c.mood), 150);
    clearTimeout(callTimer);
    callTimer = setTimeout(() => {
      const now = last && last.pub;
      if (!now || now.phase !== 'betting' || now.rolls !== pub.rolls) return;
      const shooterName = now.shooter === last.me ? 'you' : last.names[now.shooter] || (now.seats[now.shooter] || {}).name;
      showDealer(beforeRoll({ point: now.point, newShooter: pub.event === 'sevenout', shooterName }, r), last, { quiet: true });
    }, 4200);
  }

  /* ── the stickman and the rail ── */

  let dealerHide = 0;
  function showDealer(text, s, { quiet = false, speakIt = true } = {}) {
    const el = q('[data-dealer]');
    el.innerHTML = `<b>Stickman</b> ${esc(text)}`;
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(dealerHide);
    dealerHide = setTimeout(() => { el.hidden = true; }, quiet ? 4500 : 6000);
    if (speakIt && s && s.settings.voice !== false && s.settings.sound !== false) speak(text);
  }
  let side = 0;
  function bubble(who, text) {
    const layer = q('[data-bubbles]');
    const b = document.createElement('div');
    b.className = `crowd ${side++ % 2 ? 'right' : 'left'}`;
    b.style.top = `${18 + Math.random() * 40}%`;
    b.innerHTML = `<b>${esc(who)}</b>${esc(text)}`;
    layer.appendChild(b);
    setTimeout(() => b.remove(), 3200);
  }

  /* ── the 3D table ── */

  function webglOK() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }
  function load3d() {
    if (!webglOK()) { t3dState = 'failed'; return; }
    t3dState = 'loading';
    import('./craps-table3d.js')
      .then((m) => m.mountTable(q('[data-stage]'), { onTap: tap3d, onFlick: flick, onHit: (v) => diceClick(v) }))
      .then((t) => {
        t3d = t;
        t3dState = 'on';
        if (last && last.pub.dice.length) { t.showDiceAt(last.pub.dice); thrownFor = last.pub.phase === 'rolling' ? -1 : last.pub.rolls; }
        if (last) render(last);
      })
      .catch((e) => {
        console.warn('3D table', e);
        t3dState = 'failed';
        toast('The 3D table could not load here, so this is the classic layout.');
        if (last) render(last);
      });
  }

  function flick(th) {
    const s = last;
    if (!s) return;
    const { pub, me } = s;
    if (pub.shooter !== me) { toast(`${s.names[pub.shooter] || 'Someone else'} has the dice`); return; }
    if (pub.phase !== 'betting') return;
    hooks.send({ t: 'roll', throw: th });
  }

  function tap3d(key, x, y) {
    const s = last;
    if (!s) return;
    const { pub, me } = s;
    const seat = pub.seats[me];
    if (!seat) return;
    const ch = q('[data-chooser]');
    if (!/^num/.test(key)) { ch.hidden = true; placeBet(key); return; }
    const n = Number(key.slice(3));
    const b = seat.bets;
    const opts = [];
    if (takeDown) {
      for (const k of [`place${n}`, `comeOdds${n}`, `dcOdds${n}`]) if (b[k]) opts.push([k, `Take down ${betName(k).toLowerCase()} (${money(b[k])})`]);
      if (!opts.length) { toast(b[`come${n}`] || b[`dc${n}`] ? 'Come bets stay up until they win or lose.' : `Nothing of yours on the ${n}.`); return; }
    } else {
      opts.push([`place${n}`, `Place ${n} · ${money(chipVal)}`]);
      if (b[`come${n}`]) opts.push([`comeOdds${n}`, `Odds on your come ${n}`]);
      if (b[`dc${n}`]) opts.push([`dcOdds${n}`, `Lay odds on your don't come ${n}`]);
    }
    if (opts.length === 1) { ch.hidden = true; placeBet(opts[0][0]); return; }
    ch.innerHTML = opts.map(([k, l]) => `<button class="btn small" data-pick="${k}">${esc(l)}</button>`).join('') + '<button class="btn small ghost" data-pick="">Cancel</button>';
    const wrap = q('.stage-wrap').getBoundingClientRect();
    ch.style.left = `${Math.max(8, Math.min(wrap.width - 220, x - 110))}px`;
    ch.style.top = `${Math.max(8, y - 20)}px`;
    ch.hidden = false;
  }

  /* ── taps ── */

  function placeBet(key) {
    const s = last;
    if (!s) return;
    const { pub, me } = s;
    const seat = pub.seats[me];
    if (!seat) return;
    if (pub.phase !== 'betting') { toast('Wait for the dice to land'); return; }
    if (takeDown) {
      if (!seat.bets[key]) return;
      if (!canTakeDown(key, pub.point)) { toast(`${betName(key)} is a contract bet: it stays up until it wins or loses.`); return; }
      hooks.send({ t: 'take', key });
      return;
    }
    const problem = betProblem(seat, key, chipVal, pub.point, pub.rules);
    if (problem) {
      // A chip that would push odds over the max: fill to the max instead.
      const { base } = parseKey(key);
      if (/Odds$/.test(base) && /^Max/.test(problem)) {
        const fill = Number(problem.replace(/[^0-9.]/g, '')) - (seat.bets[key] || 0);
        if (fill > 0) { hooks.send({ t: 'bet', key, amt: Math.round(fill * 100) / 100 }); sound('chip'); toast(`Odds filled to the max`); return; }
      }
      toast(problem);
      return;
    }
    hooks.send({ t: 'bet', key, amt: chipVal });
    sound('chip');
    const quip = onBet(key);
    if (quip && Math.random() < 0.6) showDealer(quip, s, { quiet: true, speakIt: false });
    const e = houseEdge(key, pub.rules);
    if (s.settings.coach && e > 4.1 && !warned.has(key)) {
      warned.add(key);
      toast(`${betName(key)}: the house keeps ${e.toFixed(1)}%. Pass line keeps 1.41%.`, 4200);
    } else if (s.settings.coach && e === 0 && !warned.has('odds')) {
      warned.add('odds');
      toast('Odds: no house edge. Best bet on the table.', 3000);
    }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.spot) { placeBet(b.dataset.spot); return; }
    if (b.dataset.pick !== undefined) { q('[data-chooser]').hidden = true; if (b.dataset.pick) placeBet(b.dataset.pick); return; }
    if (b.dataset.chip) { chipVal = Number(b.dataset.chip); takeDown = false; sound('chip'); last && render(last); return; }
    if (b.dataset.rebuy) { hooks.send({ t: 'rebuy', amt: Number(b.dataset.rebuy) }); return; }
    if (b.dataset.preset) {
      const s = last;
      const bets = presetBets(b.dataset.preset, s.pub.seats[s.me], s.pub.point, s.pub.rules);
      if (bets.length) { hooks.send({ t: 'bets', list: bets }); sound('chip'); }
      return;
    }
    const c = b.dataset.c;
    if (c === 'roll') { hooks.send({ t: 'roll', throw: { a: Math.random() * 1.2 - 0.6, p: 0.75 + Math.random() * 0.35, s: Math.floor(Math.random() * 2 ** 30) + 1 } }); return; }
    if (c === 'take') { takeDown = !takeDown; last && render(last); return; }
    if (c === 'sit') { hooks.sit(); return; }
    if (c && hooks[c]) hooks[c]();
  });

  drawerEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dt) { drawerTab = b.dataset.dt; last && renderDrawer(last); }
    else if (b.hasAttribute('data-dclose')) close();
  });

  function open() { document.body.classList.add('cdrawer-open'); drawerEl.setAttribute('aria-hidden', 'false'); last && renderDrawer(last); }
  function close() { document.body.classList.remove('cdrawer-open'); drawerEl.setAttribute('aria-hidden', 'true'); }

  /* Swipe in from the right edge, swipe right on the drawer to close. */
  let sx = 0, sy = 0, from = null;
  document.addEventListener('touchstart', (e) => {
    if (root.hidden) { from = null; return; }
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    from = drawerEl.contains(e.target) ? 'drawer' : sx > window.innerWidth - 28 ? 'edge' : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.8) {
      if (dx < 0 && from === 'edge') open();
      else if (dx > 0 && from === 'drawer') close();
    }
    from = null;
  }, { passive: true });

  return {
    render,
    open, close,
    toggle() { if (document.body.classList.contains('cdrawer-open')) close(); else open(); },
    reset() {
      lastRolls = -1; narration = ''; warned = new Set(); clearInterval(tumble); tumble = 0; thrownFor = -1;
      // A fresh table gets a fresh 3D scene (the chips and puck start over).
      if (t3d) { t3d.dispose(); t3d = null; t3dState = 'off'; }
    },
    key(e) {
      if (!last) return;
      if (e.key === ' ' || e.key === 'Enter') {
        const roll = root.querySelector('[data-c="roll"]');
        if (roll && !roll.disabled) { e.preventDefault(); roll.click(); }
      } else if (e.key.toLowerCase() === 'o') this.toggle();
    },
  };
}
