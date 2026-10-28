/* Chips & Dip on screen. */
import { PLAY_MS, JUDGE_MS, REVEAL_MS } from './chips.js';
import { esc, sound, buzz, standingsHtml } from './ui.js';
import { obj, arr } from './room.js';

export function mount(stage, api) {
  stage.innerHTML = '<div class="chips"></div>';
  const el = stage.firstChild;
  let sel = null, round = -1, phase = null, s = null;

  el.addEventListener('click', (e) => {
    if (!s) return;
    const card = e.target.closest('[data-card]');
    if (card) { sel = Number(card.dataset.card); sound('pop'); update(s); return; }
    if (e.target.closest('[data-play]') && sel !== null) {
      const b = e.target.closest('[data-play]');
      b.disabled = true;
      api.send({ t: 'play', i: sel });
      buzz(20);
      sel = null;
      return;
    }
    if (e.target.closest('[data-pick]') && sel !== null) {
      e.target.closest('[data-pick]').disabled = true;
      api.send({ t: 'pick', i: sel });
      buzz(20);
      sel = null;
    }
  });

  function update(next) {
    s = next;
    const p = s.pub, me = s.me, judge = p.judge === me;
    if (p.round !== round || p.phase !== phase) {
      if (p.phase === 'reveal' && phase !== 'reveal') sound(p.winner && p.winner.uid === me ? 'good' : 'pop');
      round = p.round; phase = p.phase; sel = null;
    }
    const judgeName = esc(s.names[p.judge] || 'Someone');
    const chips = arr(p.chips);
    const top = `
      <div class="kicker">Round ${p.round} · first to ${p.target}</div>
      <div class="chip-pair"><span class="chip">${esc(chips[0])}</span><span class="plus">+</span><span class="chip">${esc(chips[1])}</span></div>
      <p class="center muted">${judge ? "You're the judge this round" : `${judgeName} is the judge`}</p>`;
    const secret = obj(s.secret), hand = arr(secret.hand);
    const others = s.online.filter((pl) => pl.uid !== p.judge);
    const inCount = others.filter((pl) => obj(p.played)[pl.uid]).length;

    let body = '';
    if (p.phase === 'playing') {
      const bar = `<div class="tbar" data-deadline="${p.deadline}" data-span="${PLAY_MS}"></div>`;
      if (judge) {
        const waiting = others.filter((pl) => !obj(p.played)[pl.uid]).map((pl) => esc(s.names[pl.uid]));
        body = `${bar}<div class="panel center"><h2>Sit tight, judge</h2>
          <p>${inCount} of ${others.length} dips are in.${waiting.length ? ` Waiting on ${waiting.join(', ')}.` : ''}</p>
          <p class="muted">When they're all in, pick the one that goes best with both chips. Funniest counts.</p></div>`;
      } else if (obj(p.played)[me]) {
        body = `${bar}<div class="panel center"><p>You played</p><div class="dip big">${esc(secret.played || '…')}</div>
          <p class="muted">${inCount} of ${others.length} in. Waiting for the rest.</p></div>`;
      } else {
        body = `${bar}<h3>Your dips: pick the one that goes with both</h3>
          <div class="hand">${hand.map((c, i) => `<button class="dip${sel === i ? ' sel' : ''}" data-card="${i}">${esc(c)}</button>`).join('')}</div>
          <button class="btn big yellow" data-play ${sel === null ? 'disabled' : ''}>Play this dip</button>`;
      }
    } else if (p.phase === 'judging') {
      const table = arr(p.table);
      const bar = `<div class="tbar" data-deadline="${p.deadline}" data-span="${JUDGE_MS}"></div>`;
      body = judge ? `${bar}<h3>Pick your favorite</h3>
          <div class="hand">${table.map((c, i) => `<button class="dip${sel === i ? ' sel' : ''}" data-card="${i}">${esc(c)}</button>`).join('')}</div>
          <button class="btn big yellow" data-pick ${sel === null ? 'disabled' : ''}>This one wins</button>`
        : `${bar}<h3>${judgeName} is choosing…</h3>
          <div class="hand">${table.map((c) => `<div class="dip">${esc(c)}</div>`).join('')}</div>`;
    } else if (p.phase === 'reveal') {
      const w = obj(p.winner), mine = w.uid === me;
      body = `<div class="panel center win">
          <div class="kicker">${mine ? 'You win the round!' : `${esc(s.names[w.uid] || 'Someone')} wins the round`}</div>
          <div class="dip big winner">${esc(w.card)}</div>
          ${p.auto ? '<p class="muted">The judge ran out of time, so the table picked one at random.</p>' : ''}
        </div>
        <ul class="reveal-list">${arr(p.reveal).filter((r) => r.uid !== w.uid).map((r) => `
          <li><span class="dip small">${esc(r.card)}</span><span>${esc(s.names[r.uid] || '?')}</span></li>`).join('')}</ul>
        <h3>Score</h3>${standingsHtml(p.scores, s.names, me)}
        <div class="tbar" data-deadline="${p.deadline}" data-span="${REVEAL_MS}"></div>`;
    }
    el.innerHTML = top + body;
  }

  return { update, destroy() {} };
}
