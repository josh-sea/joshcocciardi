/* The screens away from the table: the strategy drill, the count drill and
 * your stats. Each mounts into its <section> and calls back to app.js to
 * record results.
 */
import { esc, cardHtml, signed, money, pct, sparkline, sound, buzz } from './ui.js';
import { strategyQuestion, gradeStrategy, countRun, COUNT_LENGTHS, COUNT_SPEEDS, trueCountQuestion } from './drills.js';
import { ACTION_NAME, UP_LABEL } from './strategy.js';
import { accuracy, leaks } from './stats.js';

/* ── strategy drill ──────────────────────────────────────────────────── */

export function strategyDrill(el, { rules, onResult, onBack, focus = [] }) {
  let q = null, answered = false, streak = 0, n = 0, right = 0;
  let only = null;
  // Missed cells come back after a few questions until you get them.
  const queue = focus.map((key) => ({ key, due: 0 }));
  const rand = Math.random;

  function next() {
    answered = false;
    n++;
    const due = queue.find((x) => x.due <= n);
    q = strategyQuestion(rand, { only, focus: due ? due.key : null });
    q.focusKey = due ? due.key : null;
    draw();
  }

  function draw(result) {
    const r = rules();
    const keys = ['H', 'S', 'D', 'P'].concat(r.surrender ? ['R'] : []);
    el.innerHTML = `<header class="bar"><button class="ghost" data-back>← Back</button><b>Strategy drill</b>
      <span class="streak">🔥 ${streak}</span></header>
      <div class="drill">
        <div class="pills">${[[null, 'Everything'], ['hard', 'Hard'], ['soft', 'Soft'], ['pair', 'Pairs']].map(([k, l]) => `<button class="pill${only === k ? ' on' : ''}" data-only="${k || ''}">${l}</button>`).join('')}</div>
        <div class="felt mini">
          <div class="dealer"><div class="who">Dealer</div><div class="cards">${cardHtml(q.upCard)}${cardHtml('??')}</div></div>
          <div class="mine"><div class="hand"><div class="cards">${q.cards.map((c) => cardHtml(c)).join('')}</div></div></div>
        </div>
        ${queue.length ? `<p class="small center muted">${queue.length} hand${queue.length > 1 ? 's' : ''} you missed will come back${q.focusKey ? ' · this is one' : ''}</p>` : ''}
        <div class="actions">${keys.map((k) => `<button class="btn act a-${k}${result ? (k === result.should ? ' right' : k === result.answer && !result.ok ? ' wrong' : '') : ''}" data-ans="${k}" ${answered ? 'disabled' : ''}><span>${ACTION_NAME[k]}</span><kbd>${k}</kbd></button>`).join('')}</div>
        <div class="feedback">${result ? feedbackHtml(result) : `<p class="muted center">${n > 1 ? `${right} of ${n - 1} right` : 'What does the chart say?'}</p>`}</div>
        ${result ? '<button class="btn big gold" data-next>Next hand <kbd>Space</kbd></button>' : ''}
      </div>`;
  }

  function feedbackHtml(res) {
    const evRows = Object.entries(res.evs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="${k === res.should ? 'best' : ''}">${ACTION_NAME[k]} ${signed(v)}</span>`).join('');
    return `<div class="verdict ${res.ok ? 'yes' : 'no'}">${res.ok ? '✅ Right.' : `❌ The chart says <b>${ACTION_NAME[res.should]}</b>.`} <span class="muted">${esc(res.name)}</span></div>
      <p>${esc(res.why)}</p>
      <p class="evs small">${evRows}</p>
      ${res.ok ? '' : `<p class="small muted">${ACTION_NAME[res.answer]} costs about ${Math.round(res.loss * 100)}¢ per $1 bet here, compared to ${ACTION_NAME[res.should]}.</p>`}`;
  }

  function answer(k) {
    if (answered || !q) return;
    answered = true;
    const res = { ...gradeStrategy(q, k, rules()), answer: k };
    if (res.ok) { streak++; right++; sound('good'); } else { streak = 0; sound('bad'); buzz(60); }
    const i = queue.findIndex((x) => x.key === res.key);
    if (res.ok && i >= 0) queue.splice(i, 1);
    else if (!res.ok) {
      if (i >= 0) queue[i].due = n + 3;
      else queue.push({ key: res.key, due: n + 3 + Math.floor(Math.random() * 3) });
    }
    onResult && onResult(res, streak);
    draw(res);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) onBack();
    else if (b.dataset.ans) answer(b.dataset.ans);
    else if (b.hasAttribute('data-next')) next();
    else if (b.dataset.only !== undefined) { only = b.dataset.only || null; next(); }
  });

  return {
    start(newFocus) {
      if (newFocus) for (const key of newFocus) if (!queue.some((x) => x.key === key)) queue.push({ key, due: 0 });
      n = 0; right = 0; streak = 0;
      next();
    },
    key(e) {
      const k = e.key.toUpperCase();
      if ((k === ' ' || k === 'ENTER') && answered) { e.preventDefault(); next(); return; }
      if ('HSDPR'.includes(k) && k.length === 1) answer(k);
    },
  };
}

/* ── count drill ─────────────────────────────────────────────────────── */

export function countDrill(el, { onResult, onBack }) {
  let len = 20, speed = 1, run = null, timer = 0, mode = 'running', tq = null;

  function menu(msg = '') {
    clearInterval(timer);
    el.innerHTML = `<header class="bar"><button class="ghost" data-back>← Back</button><b>Count drill</b><span></span></header>
      <div class="drill">
        <div class="pills">${[['running', 'Running count'], ['true', 'True count']].map(([k, l]) => `<button class="pill${mode === k ? ' on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
        ${mode === 'running' ? `
        <p>Cards flash by one at a time. Keep the Hi-Lo count in your head, then say where it ended.</p>
        <p class="hilo"><span class="plus">2–6 +1</span><span class="zero">7–9 0</span><span class="minus">10–A −1</span></p>
        <h4>How many cards</h4><div class="pills">${COUNT_LENGTHS.map((n) => `<button class="pill${len === n ? ' on' : ''}" data-len="${n}">${n === 52 ? 'Whole deck' : n}</button>`).join('')}</div>
        <h4>Speed</h4><div class="pills">${COUNT_SPEEDS.map((s, i) => `<button class="pill${speed === i ? ' on' : ''}" data-speed="${i}">${s.name}</button>`).join('')}</div>
        ${msg}
        <button class="btn big gold" data-go>Start</button>
        <p class="small muted">A whole deck always counts back to 0, which is the classic way to check yourself.</p>`
        : `<p>Turn a running count into a true count: divide by the decks still to be dealt. Round toward zero.</p>${msg}<button class="btn big gold" data-tq>Ask me one</button>`}
      </div>`;
  }

  function go() {
    run = countRun(len);
    let i = 0;
    el.innerHTML = `<header class="bar"><button class="ghost" data-stop>✕ Stop</button><b>Count</b><span class="muted"><span data-i>0</span>/${run.cards.length}</span></header>
      <div class="drill"><div class="flash"></div></div>`;
    const flash = el.querySelector('.flash'), counter = el.querySelector('[data-i]');
    const step = () => {
      if (i >= run.cards.length) { clearInterval(timer); ask(); return; }
      flash.innerHTML = cardHtml(run.cards[i], 'big deal');
      counter.textContent = String(++i);
      sound('card');
    };
    step();
    timer = setInterval(step, COUNT_SPEEDS[speed].ms);
  }

  function ask() {
    el.querySelector('.drill').innerHTML = `<p class="center">What's the running count?</p>
      <div class="row center"><button class="btn" data-adj="-1">−</button><input class="count-in" type="number" inputmode="numeric" value="0" step="1"><button class="btn" data-adj="1">+</button></div>
      <button class="btn big gold" data-check>Check</button>`;
    el.querySelector('.count-in').focus();
  }

  function check() {
    const v = Number(el.querySelector('.count-in').value);
    const ok = v === run.count;
    sound(ok ? 'good' : 'bad');
    onResult && onResult(ok);
    menu(`<div class="verdict ${ok ? 'yes' : 'no'}">${ok ? `✅ Right: ${signed(run.count, 0)}.` : `❌ It was ${signed(run.count, 0)}; you said ${signed(v, 0)}.`}</div>
      <div class="review">${run.cards.map((c) => cardHtml(c, 'tiny')).join('')}</div>`);
  }

  function trueQ(result = '') {
    tq = trueCountQuestion();
    el.querySelector('.drill').innerHTML = `${result}<p class="center big-q">Running count <b>${signed(tq.rc, 0)}</b> with <b>${tq.decks}</b> deck${tq.decks === 1 ? '' : 's'} left.</p>
      <p class="center">True count?</p>
      <div class="row center"><input class="count-in" type="number" inputmode="numeric" step="1"><button class="btn gold" data-tcheck>Check</button></div>`;
    el.querySelector('.count-in').focus();
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) { clearInterval(timer); onBack(); }
    else if (b.hasAttribute('data-stop')) menu();
    else if (b.dataset.len) { len = Number(b.dataset.len); menu(); }
    else if (b.dataset.speed) { speed = Number(b.dataset.speed); menu(); }
    else if (b.dataset.mode) { mode = b.dataset.mode; menu(); }
    else if (b.hasAttribute('data-go')) go();
    else if (b.hasAttribute('data-check')) check();
    else if (b.hasAttribute('data-tq')) trueQ();
    else if (b.hasAttribute('data-tcheck')) {
      const v = Number(el.querySelector('.count-in').value);
      const ok = v === tq.answer;
      sound(ok ? 'good' : 'bad');
      onResult && onResult(ok);
      trueQ(`<div class="verdict ${ok ? 'yes' : 'no'}">${ok ? '✅ Right.' : '❌ Not quite.'} ${signed(tq.rc, 0)} ÷ ${tq.decks} = ${(tq.rc / tq.decks).toFixed(2)}, so ${signed(tq.answer, 0)}.</div>`);
    } else if (b.dataset.adj) {
      const inp = el.querySelector('.count-in');
      inp.value = String((Number(inp.value) || 0) + Number(b.dataset.adj));
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const c = el.querySelector('[data-check]') || el.querySelector('[data-tcheck]');
    if (c) c.click();
  });

  return { start: () => menu(), stop: () => clearInterval(timer) };
}

/* ── stats ───────────────────────────────────────────────────────────── */

function block(title, s, startBank) {
  const acc = accuracy(s);
  const w = s.wins, l = s.losses, p = s.pushes, n = s.hands || 1;
  return `<div class="card stats-card"><h3>${title}</h3>
    <div class="kpis">
      <div><span>Hands</span><b>${s.hands}</b></div>
      <div><span>Net</span><b class="${s.net > 0 ? 'up' : s.net < 0 ? 'down' : ''}">${money(s.net, { sign: true })}</b></div>
      <div><span>Chart accuracy</span><b>${acc === null ? '–' : pct(acc)}</b></div>
      <div><span>Cost of mistakes</span><b>${s.evLost ? `${s.evLost.toFixed(2)} bets` : '–'}</b></div>
    </div>
    <p class="wlp"><span class="w" style="flex:${w || 0.001}">${w} won</span><span class="p" style="flex:${p || 0.001}">${p} push</span><span class="l" style="flex:${l || 0.001}">${l} lost</span></p>
    <p class="small muted">${s.bjs} blackjacks (${pct(s.bjs / n, 1)}; about 4.8% is normal) · ${s.busts} busts · ${Math.round(s.doubles)} doubles · ${Math.round(s.splits)} splits · ${s.surrenders} surrenders · ${money(s.wagered)} wagered</p>
    ${s.history.length ? `<h4>Bankroll</h4>${sparkline(s.history, { start: startBank })}` : ''}
  </div>`;
}

export function statsScreen(el, { get, onBack, onDrill, onReset }) {
  function draw() {
    const { session, life, startBank } = get();
    const lk = leaks(life);
    el.innerHTML = `<header class="bar"><button class="ghost" data-back>← Back</button><b>Your stats</b><span></span></header>
      <div class="stats">
        ${block('This session', session, startBank)}
        <div class="card"><h3>Your leaks</h3>
          ${lk.length ? `<p class="small muted">The chart cells you miss most, at the table and in the drill.</p>
            <ol class="leaks">${lk.map((x) => `<li><b>${esc(x.name)}</b><span>${x.miss} of ${x.n} missed</span></li>`).join('')}</ol>
            <button class="btn gold" data-drill>Drill these</button>` : '<p class="muted">No leaks yet. Play with Coach on, or try the strategy drill.</p>'}
        </div>
        <div class="card"><h3>Recent mistakes</h3>
          ${life.mistakes.length ? `<ul class="mistakes">${life.mistakes.slice(0, 12).map((m) => `<li><b>${esc(m.name)}</b>: you played ${ACTION_NAME[m.did] || m.did}, the chart says ${ACTION_NAME[m.should] || m.should}${m.loss ? ` <span class="muted">(−${Math.round(m.loss * 100)}¢/$1)</span>` : ''}${m.drill ? ' <em class="tag">drill</em>' : ''}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        </div>
        ${block('All time', life, null)}
        <div class="card"><h3>Drills</h3>
          <p>Strategy: ${life.drills.strategy.ok} of ${life.drills.strategy.n} right · best streak ${life.drills.strategy.best}</p>
          <p>Count: ${life.drills.count.ok} of ${life.drills.count.n} right</p></div>
        <p class="center"><button class="btn ghost small" data-reset>Reset all stats</button></p>
        <p class="small muted center">Kept on this device only.</p>
      </div>`;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) onBack();
    else if (b.hasAttribute('data-drill')) onDrill(leaks(get().life).map((x) => x.key));
    else if (b.hasAttribute('data-reset') && confirm('Reset all your stats on this device?')) { onReset(); draw(); }
  });
  return { show: draw };
}

export { UP_LABEL };
