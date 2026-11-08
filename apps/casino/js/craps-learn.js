/* Learn craps (the tutorial) and the payouts drill. Each mounts into its
 * own <section>; app.js shows them and records results.
 */
import { esc, money, sound, buzz } from './ui.js';
import { LESSONS, explain } from './craps-lessons.js';
import { WAYS, TRUE_ODDS, LAY_ODDS, POINTS, betName, parseKey } from './craps.js';
import { payoutQuestion, payRatio } from './craps-odds.js';
import { dieHtml } from './craps-view.js';

const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const roll2 = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];

/* ── the live demos ──────────────────────────────────────────────────── */

function tallyDemo(el) {
  const counts = new Array(13).fill(0);
  let n = 0, dice = [3, 4];
  const draw = () => {
    const max = Math.max(1, ...counts);
    el.innerHTML = `<div class="demo">
      <div class="dice">${dieHtml(dice[0])}${dieHtml(dice[1])}</div>
      <div class="tally">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((t) => `<div class="col${t === 7 ? ' seven' : ''}">
        <div class="track"><span class="tb" style="height:${(counts[t] / max * 100).toFixed(1)}%"></span>${n ? `<span class="exp" style="bottom:${Math.min(100, WAYS[t] / 36 * n / max * 100).toFixed(1)}%"></span>` : ''}</div>
        <b>${t}</b><small>${WAYS[t]}</small></div>`).join('')}</div>
      <p class="small muted center">${n ? `${n} rolls. Bars are what came up; the lines are what 36 ways predicts.` : 'The small numbers are how many of the 36 ways make each total.'}</p>
      <div class="row center"><button class="btn" data-r="1">Roll once</button><button class="btn gold" data-r="100">Roll 100</button><button class="btn ghost" data-r="1000">1,000</button></div></div>`;
  };
  el.onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const k = Number(b.dataset.r);
    for (let i = 0; i < k; i++) { dice = roll2(); counts[dice[0] + dice[1]]++; n++; }
    sound('card');
    draw();
  };
  draw();
}

/* A pass line (or don't pass) bet played out roll by roll. */
function lineDemo(el, { dont = false, odds = false } = {}) {
  let point = 0, done = false, log = [], bank = 100, oddsOn = 0, dice = null;
  const bet = 10;
  const draw = () => {
    el.innerHTML = `<div class="demo">
      <div class="dicebar mini"><div class="dice">${dice ? dieHtml(dice[0], 'land') + dieHtml(dice[1], 'land') : dieHtml(6) + dieHtml(1)}</div>
        <span class="puck ${point ? 'on' : 'off'}">${point ? `ON ${point}` : 'OFF'}</span></div>
      <p class="center">Your bet: <b>${money(bet)} on ${dont ? 'don\'t pass' : 'the pass line'}</b>${oddsOn ? ` + <b>${money(oddsOn)} ${dont ? 'lay odds' : 'odds'}</b>` : ''} · bank ${money(bank)}</p>
      <ol class="demo-log">${log.map((l) => `<li>${l}</li>`).join('')}</ol>
      <div class="row center">
        ${done ? '<button class="btn gold" data-again>Play another round</button>' : '<button class="btn gold" data-roll>🎲 Roll</button>'}
        ${odds && point && !oddsOn && !done ? `<button class="btn" data-odds>${dont ? 'Lay' : 'Take'} ${money(dont ? 20 : 20)} odds</button>` : ''}
      </div></div>`;
  };
  const say = (html) => log.push(html);
  el.onclick = (e) => {
    if (e.target.closest('[data-again]')) { point = 0; done = false; log = []; oddsOn = 0; dice = null; draw(); return; }
    if (e.target.closest('[data-odds]')) {
      oddsOn = 20;
      const pays = dont ? 20 * LAY_ODDS[point] : 20 * TRUE_ODDS[point];
      say(`You ${dont ? 'lay' : 'take'} $20 odds. If you win, it pays <b>${money(pays)}</b>: ${dont ? 'less than you risked, because the 7 is more likely than the point' : 'exactly the true chance, so no house edge'}.`);
      draw();
      return;
    }
    if (!e.target.closest('[data-roll]')) return;
    dice = roll2();
    const t = dice[0] + dice[1];
    sound('card');
    const before = point;
    let event = '';
    if (!point) {
      if (t === 7 || t === 11) event = 'natural';
      else if (t === 2 || t === 3 || t === 12) event = 'craps';
      else { event = 'point'; point = t; }
    } else if (t === point) { event = 'hit'; point = 0; }
    else if (t === 7) { event = 'sevenout'; point = 0; }
    let line = esc(explain({ total: t, hard: dice[0] === dice[1], before, after: point, event }));
    let result = null;
    if (event === 'natural') result = dont ? -1 : 1;
    if (event === 'craps') result = dont ? (t === 12 ? 0 : 1) : -1;
    if (event === 'hit') result = dont ? -1 : 1;
    if (event === 'sevenout') result = dont ? 1 : -1;
    if (result !== null) {
      let delta = result * bet;
      if (oddsOn) delta += result > 0 ? (dont ? oddsOn * LAY_ODDS[before] : oddsOn * TRUE_ODDS[before]) : -oddsOn;
      bank += delta;
      done = true;
      line += ` <b class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? `You win ${money(delta)}` : delta < 0 ? `You lose ${money(-delta)}` : 'A tie: your bet stays'}.</b>`;
      sound(delta > 0 ? 'win' : delta < 0 ? 'lose' : 'chip');
    } else if (event === 'point') {
      line += odds ? ' Now is when you can take odds.' : '';
    }
    say(line);
    draw();
  };
  draw();
}

/* ── the tutorial ────────────────────────────────────────────────────── */

export function learnScreen(el, { onBack, onPractice, progress }) {
  let i = 0, picked = null;

  function lessonList() {
    const done = progress.get();
    el.innerHTML = `<header class="bar"><button class="ghost" data-back>← Back</button><b>Learn craps</b><span></span></header>
      <div class="learn">
        <p>Nine short lessons, about ten minutes. Real dice to roll as you go, and a question at the end of each.</p>
        <ol class="lessons">${LESSONS.map((l, k) => `<li><button class="lesson-btn" data-go="${k}"><span class="tick">${done[l.id] ? '✅' : k + 1}</span>${esc(l.title)}</button></li>`).join('')}</ol>
        <button class="btn big gold" data-go="${Math.max(0, LESSONS.findIndex((l) => !done[l.id]))}">${Object.keys(done).length ? 'Keep going' : 'Start'}</button>
        <button class="btn big" data-practice>Skip to a practice table</button>
      </div>`;
  }

  function lesson() {
    const l = LESSONS[i];
    picked = null;
    el.innerHTML = `<header class="bar"><button class="ghost" data-list>← Lessons</button><b>${i + 1} of ${LESSONS.length}</b><span></span></header>
      <div class="learn">
        <div class="progress"><i style="width:${((i + 1) / LESSONS.length * 100).toFixed(0)}%"></i></div>
        <h2>${esc(l.title)}</h2>
        ${l.body.map((p) => `<p>${md(p)}</p>`).join('')}
        <div data-demo></div>
        ${l.quiz ? `<div class="quiz-card"><h4>Quick check</h4><p>${esc(l.quiz.q)}</p>
          <div class="answers">${l.quiz.options.map((o, k) => `<button class="btn ans" data-ans="${k}">${esc(o)}</button>`).join('')}</div>
          <p data-why></p></div>` : ''}
        <div class="row lesson-nav">
          ${i > 0 ? '<button class="btn ghost" data-prev>Back</button>' : ''}
          ${i < LESSONS.length - 1 ? `<button class="btn gold wide" data-next ${l.quiz ? 'disabled' : ''}>Next: ${esc(LESSONS[i + 1].title)}</button>` : '<button class="btn gold wide" data-practice>Practice with the narrator on</button>'}
        </div>
      </div>`;
    const demo = el.querySelector('[data-demo]');
    if (l.demo === 'tally') tallyDemo(demo);
    else if (l.demo === 'line') lineDemo(demo);
    else if (l.demo === 'odds') lineDemo(demo, { odds: true });
    else if (l.demo === 'dont') lineDemo(demo, { dont: true, odds: true });
    if (!l.quiz) progress.mark(l.id);
    window.scrollTo(0, 0);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) onBack();
    else if (b.hasAttribute('data-list')) lessonList();
    else if (b.dataset.go !== undefined) { i = Number(b.dataset.go); lesson(); }
    else if (b.hasAttribute('data-next')) { i = Math.min(LESSONS.length - 1, i + 1); lesson(); }
    else if (b.hasAttribute('data-prev')) { i = Math.max(0, i - 1); lesson(); }
    else if (b.hasAttribute('data-practice')) onPractice();
    else if (b.dataset.ans !== undefined && picked === null) {
      const l = LESSONS[i];
      picked = Number(b.dataset.ans);
      const right = picked === l.quiz.answer;
      el.querySelectorAll('[data-ans]').forEach((x) => {
        const k = Number(x.dataset.ans);
        x.classList.toggle('right', k === l.quiz.answer);
        x.classList.toggle('wrong', k === picked && !right);
        x.disabled = true;
      });
      el.querySelector('[data-why]').innerHTML = `${right ? '✅ Right.' : '❌ Not quite.'} ${esc(l.quiz.why)}`;
      sound(right ? 'good' : 'bad');
      if (!right) buzz(40);
      progress.mark(l.id);
      const next = el.querySelector('[data-next]');
      if (next) next.disabled = false;
    }
  });

  return { start(at = null) { if (at === null) lessonList(); else { i = at; lesson(); } } };
}

/* ── the payouts drill ───────────────────────────────────────────────── */

function workings(qn) {
  const { base, n } = parseKey(qn.key);
  const r = qn.roll === 2 ? 2 : qn.roll === 12 ? Math.round(qn.answer / qn.amt) : payRatio(qn.key);
  const names = { place: `Place ${n} pays`, comeOdds: `Odds on ${n} pay`, dcOdds: `Lay odds on ${n} pay`, hard: `Hard ${n} pays`, field: qn.roll === 2 ? 'The field pays 2 to 1 on a 2' : qn.roll === 12 ? `The field pays ${Math.round(qn.answer / qn.amt)} to 1 on a 12` : 'The field pays even money' };
  const frac = { 1.8: '9 to 5', 1.4: '7 to 5', 2: '2 to 1', 1.5: '3 to 2', 1.2: '6 to 5', 0.5: '1 to 2', 7: '7 to 1', 9: '9 to 1', 4: '4 to 1', 15: '15 to 1', 30: '30 to 1', 3: '3 to 1', 1: 'even money' };
  let f = frac[r];
  if (!f && Math.abs(r - 7 / 6) < 1e-9) f = '7 to 6';
  if (!f && Math.abs(r - 2 / 3) < 1e-9) f = '2 to 3';
  if (!f && Math.abs(r - 5 / 6) < 1e-9) f = '5 to 6';
  const [a, b] = (f || '1 to 1').split(' to ').map(Number);
  const lead = names[base] || `${betName(qn.key)} pays`;
  return `${lead} ${f}: ${money(qn.amt)} ÷ ${b || 1} × ${a || 1} = ${money(qn.answer)}${qn.answer % 1 ? ' (rounded down, which is why dealers like round units)' : ''}.`;
}

export function payoutDrill(el, { rules, onBack, onResult }) {
  let qn = null, answered = false, streak = 0, right = 0, n = 0;
  function next() {
    qn = payoutQuestion(Math.random, rules());
    answered = false;
    n++;
    draw();
  }
  function draw(pick = null) {
    const what = qn.key === 'field' ? `${money(qn.amt)} on the field, and a ${qn.roll} rolls.` : `${money(qn.amt)} on ${betName(qn.key).toLowerCase().replace('odds on come', 'odds on')}, and it wins.`;
    el.innerHTML = `<header class="bar"><button class="ghost" data-back>← Back</button><b>Craps payouts</b><span class="streak">🔥 ${streak}</span></header>
      <div class="drill">
        <p class="small muted">What does the dealer pay? The winnings only: your bet stays where it is.</p>
        <p class="big-q center">${esc(what)}</p>
        <div class="answers grid2">${qn.options.map((o) => `<button class="btn ans${answered ? (o === qn.answer ? ' right' : o === pick ? ' wrong' : '') : ''}" data-o="${o}" ${answered ? 'disabled' : ''}>${money(o)}</button>`).join('')}</div>
        <div class="feedback">${answered ? `<p>${pick === qn.answer ? '✅' : '❌'} ${esc(workings(qn))}</p><button class="btn big gold" data-next>Next <kbd>Space</kbd></button>` : `<p class="muted center">${n > 1 ? `${right} of ${n - 1} right` : ''}</p>`}</div>
        <details class="rules"><summary>Cheat sheet</summary>
          <p class="small">Place: 4/10 pay 9 to 5 · 5/9 pay 7 to 5 · 6/8 pay 7 to 6<br>Odds: 4/10 pay 2 to 1 · 5/9 pay 3 to 2 · 6/8 pay 6 to 5<br>Lay odds: 4/10 pay 1 to 2 · 5/9 pay 2 to 3 · 6/8 pay 5 to 6<br>Hard 4/10: 7 to 1 · hard 6/8: 9 to 1 · yo, ace-deuce: 15 to 1 · aces, twelve: 30 to 1 · any 7: 4 to 1 · any craps: 7 to 1</p></details>
      </div>`;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) onBack();
    else if (b.hasAttribute('data-next')) next();
    else if (b.dataset.o && !answered) {
      answered = true;
      const pick = Number(b.dataset.o);
      const ok = Math.abs(pick - qn.answer) < 0.001;
      if (ok) { streak++; right++; sound('good'); } else { streak = 0; sound('bad'); buzz(50); }
      onResult && onResult(ok, streak);
      draw(pick);
    }
  });
  return {
    start() { n = 0; right = 0; streak = 0; next(); },
    key(e) { if ((e.key === ' ' || e.key === 'Enter') && answered) { e.preventDefault(); next(); } },
  };
}

export { POINTS };
