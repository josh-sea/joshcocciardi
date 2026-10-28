/* Trivia on screen. */
import { TRIVIA_CATEGORIES } from './decks.js';
import { QUESTION_MS, REVEAL_MS, INTRO_MS } from './trivia.js';
import { esc, sound, buzz, standingsHtml } from './ui.js';
import { obj } from './room.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export function mount(stage, api) {
  stage.innerHTML = '<div class="trivia"></div>';
  const el = stage.firstChild;
  let picked = null, askedN = -1, revealedN = -1, s = null;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || !s || s.pub.phase !== 'question' || picked !== null || obj(s.pub.answered)[s.me]) return;
    picked = Number(b.dataset.pick);
    sound('pop');
    buzz(15);
    api.send({ t: 'answer', pick: picked });
    update(s);
  });

  function update(next) {
    s = next;
    const p = s.pub, me = s.me;
    const cat = TRIVIA_CATEGORIES[p.category];
    const catName = cat ? `${cat.emoji} ${cat.name}` : '🎲 Everything';
    if (p.n !== askedN && p.phase === 'question') { askedN = p.n; picked = null; }

    if (p.phase === 'intro') {
      el.innerHTML = `<div class="panel center">
        <div class="kicker">${esc(catName)} · ${p.total} questions</div>
        <h2>Get ready!</h2><p>Same question on every phone. Faster right answers score more.</p>
        <div class="bigcount" data-deadline="${p.deadline}"></div>
        <div class="tbar" data-deadline="${p.deadline}" data-span="${INTRO_MS}"></div></div>`;
      return;
    }
    const q = p.q;
    const qCat = TRIVIA_CATEGORIES[q.cat];
    const head = `<div class="kicker">Question ${p.n + 1} of ${p.total}${qCat ? ` · ${qCat.emoji} ${esc(qCat.name)}` : ''}</div>`;
    const answeredCount = Object.keys(obj(p.answered)).length;
    const mine = picked !== null ? picked : null;
    const locked = mine !== null || obj(p.answered)[me];

    if (p.phase === 'question') {
      el.innerHTML = `${head}
        <h2 class="question">${esc(q.text)}</h2>
        <div class="tbar" data-deadline="${p.deadline}" data-span="${QUESTION_MS}"></div>
        <div class="options">${q.options.map((o, i) => `
          <button class="opt o${i}${mine === i ? ' chosen' : ''}" data-pick="${i}" ${locked ? 'disabled' : ''}>
            <span class="l">${LETTERS[i]}</span><span>${esc(o)}</span></button>`).join('')}
        </div>
        <p class="muted center">${locked ? 'Locked in. ' : ''}${answeredCount} of ${s.online.length} answered</p>`;
      return;
    }

    if (p.phase === 'reveal') {
      const last = obj(p.last), picks = obj(last.picks), gained = obj(last.gained);
      if (revealedN !== p.n) {
        revealedN = p.n;
        if (me in picks) { sound(gained[me] ? 'good' : 'bad'); buzz(gained[me] ? 40 : 80); }
      }
      const who = (i) => Object.entries(picks).filter(([, v]) => v === i).map(([u]) => esc(s.names[u] || '?'));
      const banner = gained[me] ? `<div class="banner good">Right! +${gained[me]}</div>`
        : me in picks ? '<div class="banner bad">Not this time</div>'
          : '<div class="banner">Too slow!</div>';
      el.innerHTML = `${head}
        <h2 class="question">${esc(q.text)}</h2>
        ${banner}
        <div class="options revealed">${q.options.map((o, i) => `
          <div class="opt o${i}${i === last.answer ? ' right' : picks[me] === i ? ' wrong' : ' dim'}">
            <span class="l">${i === last.answer ? '✓' : LETTERS[i]}</span><span>${esc(o)}</span>
            <small class="pickers">${who(i).join(', ')}</small></div>`).join('')}
        </div>
        <h3>Leaderboard</h3>
        ${standingsHtml(p.scores, s.names, me, { limit: 5 })}
        <div class="tbar" data-deadline="${p.deadline}" data-span="${REVEAL_MS}"></div>`;
    }
  }

  return { update, destroy() {} };
}
