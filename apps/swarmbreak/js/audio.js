/* Sound effects made on the spot with Web Audio: no files to load. */

let ac = null, master = null;
const last = {};
export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination); }
  catch { ac = null; }
}
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.35; }

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function tone({ f = 440, f2 = f, dur = 0.1, type = 'square', vol = 0.3 }) {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function hiss({ dur = 0.15, vol = 0.3, freq = 1200, q = 1, sweep = 1 }) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
  s.buffer = noise(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}

const SOUNDS = {
  fire0: () => tone({ f: 900, f2: 300, dur: 0.07, vol: 0.12 }),
  fire1: () => hiss({ dur: 0.22, vol: 0.5, freq: 900, sweep: 0.3 }),
  fire2: () => hiss({ dur: 0.12, vol: 0.12, freq: 500, q: 0.5 }),
  fire3: () => { tone({ f: 2400, f2: 200, dur: 0.3, type: 'sawtooth', vol: 0.15 }); },
  fire4: () => hiss({ dur: 0.35, vol: 0.3, freq: 400, sweep: 2 }),
  boom: () => { hiss({ dur: 0.7, vol: 0.8, freq: 300, sweep: 0.2, q: 0.6 }); tone({ f: 120, f2: 30, dur: 0.5, type: 'sine', vol: 0.5 }); },
  hit: () => tone({ f: 200, f2: 120, dur: 0.05, vol: 0.08, type: 'triangle' }),
  die: () => hiss({ dur: 0.2, vol: 0.25, freq: 700, sweep: 0.4, q: 3 }),
  spit: () => hiss({ dur: 0.15, vol: 0.15, freq: 2000, sweep: 0.5, q: 4 }),
  ouch: () => tone({ f: 220, f2: 110, dur: 0.15, vol: 0.2, type: 'sawtooth' }),
  down: () => { tone({ f: 400, f2: 60, dur: 0.6, type: 'sawtooth', vol: 0.25 }); },
  pick: () => { tone({ f: 660, f2: 990, dur: 0.12, vol: 0.15 }); setTimeout(() => ac && tone({ f: 990, f2: 1320, dur: 0.12, vol: 0.12 }), 70); },
  open: () => { [0, 160, 320].forEach(d => setTimeout(() => ac && tone({ f: 520, f2: 780, dur: 0.14, vol: 0.18 }), d)); },
  nest: () => { hiss({ dur: 0.6, vol: 0.4, freq: 300, sweep: 0.3, q: 2 }); },
  roar: () => { tone({ f: 90, f2: 50, dur: 0.9, type: 'sawtooth', vol: 0.4 }); hiss({ dur: 0.9, vol: 0.3, freq: 600, sweep: 0.3 }); },
  clear: () => { [0, 120, 240, 420].forEach((d, i) => setTimeout(() => ac && tone({ f: [523, 659, 784, 1046][i], dur: 0.2, vol: 0.18 }), d)); },
};

export function play(name) {
  if (!ac || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - (last[name] || 0) < 45) return;
  last[name] = now;
  SOUNDS[name]();
}

export function eventSounds(events) {
  for (const e of events) {
    const k = e[0];
    if (k === 'fire') play('fire' + e[2]);
    else if (k === 'rail') { /* the fire sound covers it */ }
    else if (k in SOUNDS) play(k);
    else if (k === 'bite') play('ouch');
    else if (k === 'brood') play('spit');
    else if (k === 'won') play('clear');
  }
}
