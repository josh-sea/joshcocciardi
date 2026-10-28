/* Word Race on screen: the wheel you swipe across, your words, and the
 * reveal.
 *
 * Swipe from letter to letter and let go to send the word; slide back onto
 * the letter before to take one off. Tapping letters one at a time works
 * too (then tap Go), and so does typing on a laptop.
 */
import { INTRO_MS, ROUND_MS, REVEAL_MS, FIRST_BONUS, localProblem, pointsFor } from './race.js';
import { esc, sound, buzz, toast } from './ui.js';
import { obj, arr, shuffle, standings } from './room.js';

/* HIT is about the letter's own radius. Any wider and a straight swipe
 * between two letters one apart clips the letter in between: the middle of
 * that chord is about 33 units from it.
 */
const SIZE = 300, R = 112, HIT = 27;

export function mount(stage, api) {
  stage.innerHTML = '<div class="race"></div>';
  const el = stage.firstChild;
  let s = null, round = -1, phase = null;
  let order = [], chain = [], tapping = false, dragging = false, moved = false;
  let pending = new Set(), seenN = 0, seenFirsts = {}, flashTimer = 0;
  let wheel = null, word = null, line = null, msg = null, mine = null;

  const letters = () => (s ? s.pub.letters : '');
  const center = (slot) => {
    const a = (slot / order.length) * Math.PI * 2 - Math.PI / 2;
    return [SIZE / 2 + R * Math.cos(a), SIZE / 2 + R * Math.sin(a)];
  };
  const current = () => chain.map((i) => letters()[i]).join('');
  const found = () => arr(obj(s && s.secret).found);

  /* ── the wheel ── */
  function buildPlaying() {
    el.innerHTML = `
      <div class="kicker race-head"></div>
      <div class="tbar" data-deadline="${s.pub.deadline}" data-span="${ROUND_MS}"></div>
      <div class="race-others"></div>
      <div class="race-word"><span class="w"></span><span class="m"></span></div>
      <div class="rw" style="--size:${SIZE}px">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true"><polyline points="" /></svg>
        ${order.map((li, slot) => {
          const [x, y] = center(slot);
          return `<button class="rl" data-slot="${slot}" style="left:${(x / SIZE) * 100}%;top:${(y / SIZE) * 100}%">${esc(letters()[li].toUpperCase())}</button>`;
        }).join('')}
        <button class="rshuffle" aria-label="Shuffle the letters">🔀</button>
      </div>
      <div class="race-keys"><button class="btn small" data-clear>Clear</button><button class="btn small pink" data-go>Go</button></div>
      <div class="race-mine"></div>`;
    wheel = el.querySelector('.rw');
    word = el.querySelector('.race-word .w');
    msg = el.querySelector('.race-word .m');
    line = el.querySelector('polyline');
    mine = el.querySelector('.race-mine');
    paintChain();
  }

  function slotAt(e) {
    const r = wheel.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE, y = ((e.clientY - r.top) / r.height) * SIZE;
    let best = -1, bd = HIT;
    order.forEach((_, slot) => {
      const [cx, cy] = center(slot);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = slot; }
    });
    return best;
  }

  function paintChain() {
    if (!wheel) return;
    const slots = chain.map((li) => order.indexOf(li));
    wheel.querySelectorAll('.rl').forEach((b) => b.classList.toggle('on', slots.includes(Number(b.dataset.slot))));
    line.setAttribute('points', slots.map((sl) => center(sl).join(',')).join(' '));
    word.textContent = current().toUpperCase();
    word.classList.toggle('empty', !chain.length);
    if (chain.length) { msg.textContent = ''; msg.className = 'm'; }
  }

  function flash(text, kind) {
    msg.textContent = text;
    msg.className = `m ${kind}`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { msg.textContent = ''; msg.className = 'm'; }, 1800);
  }

  function submit() {
    const w = current();
    chain = [];
    tapping = false;
    paintChain();
    if (!w) return;
    const why = localProblem(w, letters(), [...found(), ...pending]);
    if (why) { flash(why, 'bad'); sound('bad'); buzz(60); return; }
    pending.add(w);
    api.send({ t: 'word', w });
    flash(`${w.toUpperCase()}…`, '');
    paintMine();
  }

  function add(li) {
    if (chain.includes(li)) {
      // Back onto the letter before the last one: take the last one off.
      if (chain.length > 1 && chain[chain.length - 2] === li) { chain.pop(); paintChain(); }
      return;
    }
    chain.push(li);
    sound('tick');
    paintChain();
  }

  el.addEventListener('pointerdown', (e) => {
    if (!wheel || !s || s.pub.phase !== 'playing') return;
    if (e.target.closest('.rshuffle')) return;
    const slot = slotAt(e);
    if (slot < 0) return;
    e.preventDefault();
    wheel.setPointerCapture(e.pointerId);
    const li = order[slot];
    if (tapping && chain.length) {
      if (chain[chain.length - 1] === li) { chain.pop(); paintChain(); }
      else if (!chain.includes(li)) add(li);
    } else {
      chain = [];
      add(li);
    }
    dragging = true;
    moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const slot = slotAt(e);
    if (slot < 0) return;
    const li = order[slot];
    if (li === chain[chain.length - 1]) return;
    const before = chain.length;
    add(li);
    if (chain.length !== before) moved = true;
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (moved) submit();
    else tapping = true;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  el.addEventListener('click', (e) => {
    if (e.target.closest('.rshuffle')) {
      order = shuffle(order);
      chain = [];
      tapping = false;
      buildPlaying();
      update(s);
    } else if (e.target.closest('[data-go]')) submit();
    else if (e.target.closest('[data-clear]')) { chain = []; tapping = false; paintChain(); }
  });

  const onKey = (e) => {
    if (!s || s.pub.phase !== 'playing' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') { e.preventDefault(); submit(); return; }
    if (k === 'backspace') { e.preventDefault(); chain.pop(); paintChain(); return; }
    if (k === 'escape') { chain = []; paintChain(); return; }
    if (/^[a-z]$/.test(k)) {
      const li = [...letters()].findIndex((c, i) => c === k && !chain.includes(i));
      if (li >= 0) { tapping = true; chain.push(li); sound('tick'); paintChain(); }
    }
  };
  document.addEventListener('keydown', onKey);

  /* ── your words, and everyone else's progress ── */
  function paintMine() {
    if (!mine) return;
    const done = found();
    const all = [...done, ...[...pending].filter((w) => !done.includes(w))];
    const pts = done.reduce((n, w) => n + pointsFor(w), 0);
    all.sort((a, b) => b.length - a.length || a.localeCompare(b));
    mine.innerHTML = `<h3>Your words <small>${done.length} · ${pts.toLocaleString()} pts</small></h3>
      <div class="race-list">${all.map((w) => `<span class="${done.includes(w) ? '' : 'wait'} l${Math.min(w.length, 8)}">${esc(w)}</span>`).join('') || '<span class="muted">Swipe across the letters to make a word.</span>'}</div>`;
  }

  function paintOthers() {
    const p = s.pub, box = el.querySelector('.race-others');
    if (!box) return;
    const counts = obj(p.counts), firsts = obj(p.firsts);
    const chips = s.online.map((pl) => `<span class="${pl.uid === s.me ? 'me' : ''}">${esc(s.names[pl.uid] || '?')} <b>${counts[pl.uid] || 0}</b></span>`).join('');
    const fl = Object.keys(FIRST_BONUS).map((len) => `<span class="${firsts[len] ? 'got' : ''}" title="First ${len}-letter word">${len}${firsts[len] ? ` · ${esc(s.names[firsts[len]] || '?')}` : ''}</span>`).join('');
    box.innerHTML = `<div class="race-counts">${chips}</div><div class="race-firsts"><small>Firsts</small>${fl}</div>`;
  }

  /* ── the state ── */
  function update(next) {
    s = next;
    const p = s.pub;
    if (p.round !== round || p.phase !== phase) {
      const newRound = p.round !== round;
      round = p.round;
      if (newRound) {
        order = [...p.letters].map((_, i) => i);
        chain = []; pending = new Set(); seenN = 0; seenFirsts = {};
      }
      if (p.phase === 'reveal' && phase !== 'reveal') sound('end');
      phase = p.phase;
      wheel = null;
      if (p.phase === 'playing') buildPlaying();
    }

    if (p.phase === 'intro') {
      el.innerHTML = `<div class="panel center">
        <div class="kicker">Round ${p.round} of ${p.rounds}</div>
        <h2>Get ready to race!</h2>
        <p>Swipe across the letters to make words. Longer words score more, and being first to find a 5, 6, 7 or 8-letter word earns a bonus. Can you find the word that uses all eight?</p>
        <div class="bigcount" data-deadline="${p.deadline}"></div>
        <div class="tbar" data-deadline="${p.deadline}" data-span="${INTRO_MS}"></div></div>`;
      return;
    }

    if (p.phase === 'playing') {
      el.querySelector('.race-head').textContent = `Round ${p.round} of ${p.rounds} · ${p.total}+ words hiding in here`;
      const last = obj(s.secret).last;
      if (last && last.n > seenN) {
        seenN = last.n;
        pending.delete(last.w);
        if (last.ok) {
          flash(last.first ? `First ${last.w.length}-letter word! +${last.pts}` : `${last.w.toUpperCase()} +${last.pts}`, 'good');
          sound('good');
          buzz(last.first ? [30, 40, 30] : 25);
        } else {
          flash(`${last.w.toUpperCase()}: ${last.why}`, 'bad');
          sound('bad');
        }
      }
      for (const [len, uid] of Object.entries(obj(p.firsts))) {
        if (seenFirsts[len]) continue;
        seenFirsts[len] = true;
        if (uid !== s.me) toast(`${s.names[uid] || 'Someone'} found the first ${len}-letter word!`);
      }
      paintOthers();
      paintMine();
      return;
    }

    if (p.phase === 'reveal') {
      const rv = obj(p.reveal), pts = obj(rv.points), winners = arr(rv.winners);
      const me = s.me;
      const wname = winners.map((u) => (u === me ? 'You' : esc(s.names[u] || '?'))).join(' & ');
      const rows = standings(pts, s.names);
      const initials = (by) => arr(by).map((u) => esc((s.names[u] || '?').slice(0, 1))).join('');
      const chip = (x) => {
        const by = arr(x.by);
        return `<span class="${by.length ? 'found' : 'missed'}${by.includes(me) ? ' mine' : ''} l${Math.min(x.w.length, 8)}">${esc(x.w)}${by.length ? `<i>${initials(by)}</i>` : ''}</span>`;
      };
      el.innerHTML = `
        <div class="panel center win">
          <div class="kicker">Round ${p.round} of ${p.rounds}</div>
          <h2>${winners.length ? `👑 ${wname} ${winners.length === 1 && winners[0] !== me ? 'wins' : 'win'} the round!` : 'Nobody scored this round'}</h2>
          <ol class="standings">${rows.map((r) => `<li class="${r.uid === me ? 'me' : ''}"><span class="place">${winners.includes(r.uid) ? '👑' : r.place + '.'}</span>
            <span class="who">${esc(r.name)}</span><span class="pts">${r.score.toLocaleString()}</span></li>`).join('')}</ol>
        </div>
        <h3>Every word</h3>
        <div class="race-list reveal">${arr(rv.common).map(chip).join('')}</div>
        ${arr(rv.rare).length ? `<h3>Bonus words you knew</h3><div class="race-list reveal">${arr(rv.rare).map(chip).join('')}</div>` : ''}
        <div class="tbar" data-deadline="${p.deadline}" data-span="${REVEAL_MS}"></div>`;
    }
  }

  return { update, destroy() { document.removeEventListener('keydown', onKey); clearTimeout(flashTimer); } };
}
