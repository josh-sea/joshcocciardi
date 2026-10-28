/* Small things every screen uses: escaping, toasts, sounds, buzzes. */
import { standings } from './room.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer = 0;
export function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* Sounds are synthesised, so there is nothing to download. The context can
 * only start after a tap, which every game begins with anyway.
 */
let ac = null;
export function unlockAudio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}

const TUNES = {
  good: [[660, 0, 0.09], [880, 0.09, 0.14]],
  bad: [[260, 0, 0.18], [200, 0.16, 0.22]],
  tick: [[1200, 0, 0.04]],
  pop: [[520, 0, 0.06]],
  end: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]],
};

export function sound(name) {
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const [f, at, dur] of TUNES[name] || []) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = name === 'bad' ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.02);
  }
}

export function buzz(ms = 30) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not on iOS */ }
}

/* The scoreboard, as rows. `me` gets a highlight. */
export function standingsHtml(scores, names, me, { limit = 0, unit = '' } = {}) {
  let rows = standings(scores, names);
  if (limit) rows = rows.slice(0, limit);
  if (!rows.length) return '<p class="muted">No scores yet.</p>';
  const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `${n}.`);
  return `<ol class="standings">${rows.map((r) => `
    <li class="${r.uid === me ? 'me' : ''}"><span class="place">${medal(r.place)}</span>
      <span class="who">${esc(r.name)}${r.uid === me ? ' <em>(you)</em>' : ''}</span>
      <span class="pts">${r.score}${unit}</span></li>`).join('')}</ol>`;
}

export const secondsLeft = (deadline, now) => Math.max(0, Math.ceil((deadline - now) / 1000));

/* Bars and counters that count down to a deadline: give an element
 * data-deadline and data-span (ms) and the app's clock keeps it moving.
 */
export function paintTimers(root, now) {
  root.querySelectorAll('[data-deadline]').forEach((el) => {
    const d = Number(el.dataset.deadline), span = Number(el.dataset.span) || 1;
    if (el.classList.contains('tbar')) {
      const f = Math.max(0, Math.min(1, (d - now) / span));
      el.style.setProperty('--f', f.toFixed(3));
      el.classList.toggle('low', f < 0.25);
    } else {
      el.textContent = String(secondsLeft(d, now));
    }
  });
}
