/* Small things every screen uses: escaping, money, cards, toasts, sounds. */
import { SUIT_GLYPH, isRed, label } from './cards.js';

export const $ = (sel, root = document) => root.querySelector(sel);

/* Replace an element's markup only when it changed, so a tap that lands
 * while another player's move arrives isn't lost to a rebuilt button.
 */
const lastHtml = new WeakMap();
export function setHtml(el, html) {
  if (!el || lastHtml.get(el) === html) return false;
  lastHtml.set(el, html);
  el.innerHTML = html;
  return true;
}

export function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* $1,250 or $7.50: cents only when there are some. */
export function money(n, { sign = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const pre = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return `${pre}$${s}`;
}

export const pct = (p, digits = 0) => `${(p * 100).toFixed(digits)}%`;

/* EV in plain words, per dollar bet. */
export function evWords(ev) {
  const c = Math.round(Math.abs(ev) * 100);
  if (c === 0) return 'about even';
  return ev > 0 ? `wins ${c}¢ per $1` : `loses ${c}¢ per $1`;
}

export const signed = (n, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`;

export function cardHtml(c, cls = '') {
  if (!c || c === '??') return `<span class="card back ${cls}" aria-label="Face-down card"></span>`;
  const g = SUIT_GLYPH[c[1]];
  return `<span class="card ${isRed(c) ? 'red' : ''} ${cls}" aria-label="${label(c)}${g}">
    <i class="r">${label(c)}</i><i class="s">${g}</i><b>${g}</b></span>`;
}

let toastTimer = 0;
export function toast(text, ms = 2400) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* Synthesised, so there is nothing to download. Starts after a tap. */
let ac = null;
let muted = false;
export const setMuted = (m) => { muted = !!m; };
export function unlockAudio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}

const TUNES = {
  card: [[1800, 0, 0.025, 'noise']],
  chip: [[2400, 0, 0.03], [3100, 0.03, 0.03]],
  win: [[660, 0, 0.09], [880, 0.09, 0.16]],
  bj: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.28]],
  lose: [[300, 0, 0.16], [220, 0.14, 0.22]],
  good: [[880, 0, 0.07], [1175, 0.07, 0.1]],
  bad: [[240, 0, 0.18]],
  turn: [[740, 0, 0.08]],
};

export function sound(name) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  for (const [f, at, dur, kind] of TUNES[name] || []) {
    const g = ac.createGain();
    let src;
    if (kind === 'noise') {
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f;
      src.connect(bp).connect(g);
    } else {
      src = ac.createOscillator();
      src.type = name === 'lose' || name === 'bad' ? 'sawtooth' : 'triangle';
      src.frequency.value = f;
      src.connect(g);
    }
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(name === 'card' ? 0.35 : 0.14, t0 + at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    g.connect(ac.destination);
    src.start(t0 + at);
    src.stop(t0 + at + dur + 0.02);
  }
}

export function buzz(ms = 25) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not on iOS */ }
}

export const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* fine */ } },
  sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* fine */ } },
};

/* A tiny line chart of the bankroll, as SVG. */
export function sparkline(values, { w = 300, h = 64, start = null } = {}) {
  const v = values.slice();
  if (start !== null) v.unshift(start);
  if (v.length < 2) return '<p class="muted small">Play a few hands to see your bankroll over time.</p>';
  const lo = Math.min(...v), hi = Math.max(...v);
  const span = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 4 - ((y - lo) / span) * (h - 8)).toFixed(1)}`);
  const base = start !== null ? (h - 4 - ((start - lo) / span) * (h - 8)).toFixed(1) : null;
  const up = v[v.length - 1] >= v[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Bankroll over time">
    ${base !== null ? `<line x1="0" x2="${w}" y1="${base}" y2="${base}" class="base"/>` : ''}
    <polyline points="${pts.join(' ')}"/></svg>`;
}

/* ── the craps table's noise ─────────────────────────────────────────── */

function noiseBuffer(sec) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * sec), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* A die hitting felt or the wall: a short click, louder for harder hits. */
export function diceClick(strength = 0.5) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(0.05);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 1800; bp.Q.value = 4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.15 + 0.5 * strength, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t0);
}

/* The rail: a cheer is a swell of bright noise with a few whoops on top;
 * a groan is a dark, falling murmur.
 */
export function crowdSound(kind) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const dur = kind === 'cheer' ? 1.8 : 1.4;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(kind === 'cheer' ? 900 : 500, t0);
  f.frequency.linearRampToValueAtTime(kind === 'cheer' ? 1400 : 250, t0 + dur);
  f.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(kind === 'cheer' ? 0.35 : 0.22, t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t0);
  const voices = kind === 'cheer' ? 4 : 3;
  for (let i = 0; i < voices; i++) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = kind === 'cheer' ? 'triangle' : 'sawtooth';
    const at = t0 + 0.05 + Math.random() * 0.35;
    const base = kind === 'cheer' ? 380 + Math.random() * 300 : 160 + Math.random() * 60;
    o.frequency.setValueAtTime(base, at);
    o.frequency.exponentialRampToValueAtTime(kind === 'cheer' ? base * 1.9 : base * 0.6, at + 0.5);
    og.gain.setValueAtTime(0.0001, at);
    og.gain.exponentialRampToValueAtTime(kind === 'cheer' ? 0.05 : 0.035, at + 0.06);
    og.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'cheer' ? 2500 : 700;
    o.connect(lp).connect(og).connect(ac.destination);
    o.start(at); o.stop(at + 0.75);
  }
}

/* The stickman, out loud, if the phone can talk. */
let voice = null;
export function speak(text, { on = true } = {}) {
  try {
    if (!on || muted || !window.speechSynthesis) return;
    const clean = String(text).replace(/\(.*?\)/g, '').replace(/[!]{2,}/g, '!');
    if (!voice) {
      const vs = speechSynthesis.getVoices();
      voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /male|daniel|alex|fred/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    if (voice) u.voice = voice;
    u.rate = 1.12; u.pitch = 0.9; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* no voice here */ }
}
