/* Tiny Web Audio kit: every sound is synthesised, nothing is downloaded. */

let ctx = null, master = null, on = true;
const last = {};

export function setSound(v) { on = v; if (master) master.gain.value = v ? 0.5 : 0; }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.5 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// Limit how often one sound can start, so a crowd of 800 does not deafen.
function gate(name, gapMs) {
  const now = performance.now();
  if (last[name] && now - last[name] < gapMs) return false;
  last[name] = now;
  return true;
}

function tone({ type = 'sine', f0, f1 = f0, dur = 0.1, vol = 0.2, delay = 0 }) {
  if (!ctx || !on) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.2, freq = 1200, q = 1 }) {
  if (!ctx || !on) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  shot() { if (gate('shot', 60)) tone({ type: 'triangle', f0: 240, f1: 90, dur: 0.08, vol: 0.12 }); },
  gate(mul) {
    if (!gate('gate', 70)) return;
    tone({ type: 'square', f0: mul ? 660 : 520, f1: mul ? 990 : 700, dur: 0.09, vol: 0.05 });
  },
  pop() { if (gate('pop', 35)) tone({ type: 'sine', f0: 700 + Math.random() * 300, f1: 200, dur: 0.06, vol: 0.06 }); },
  hit() { if (gate('hit', 80)) noise({ dur: 0.12, vol: 0.18, freq: 300, q: 0.8 }); },
  hurt() { if (gate('hurt', 120)) tone({ type: 'sawtooth', f0: 160, f1: 60, dur: 0.2, vol: 0.12 }); },
  champ() {
    tone({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.4, vol: 0.18 });
    tone({ type: 'square', f0: 330, f1: 660, dur: 0.25, vol: 0.06, delay: 0.05 });
  },
  ready() { tone({ type: 'triangle', f0: 880, dur: 0.08, vol: 0.1 }); tone({ type: 'triangle', f0: 1320, dur: 0.12, vol: 0.1, delay: 0.09 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.14, delay: i * 0.12 })); noise({ dur: 0.6, vol: 0.2, freq: 200 }); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: 0.3, vol: 0.08, delay: i * 0.16 })); },
  click() { tone({ type: 'sine', f0: 900, f1: 700, dur: 0.05, vol: 0.08 }); },
};
