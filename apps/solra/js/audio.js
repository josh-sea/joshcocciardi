/* Getting rendered samples to a speaker, and microphone audio back.
 *
 * All synthesis lives in synth.js; this file owns the AudioContext and nothing
 * else, so the language itself stays testable outside a browser.
 */

import { renderUtterance, renderTone, renderPreamble, SAMPLE_RATE } from './synth.js';

let ctx = null;
let current = null;
let unlocked = false;

export function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

/* Browsers hold the context suspended until a gesture. Every play path calls
 * this first; it is a no-op after the first time. */
export async function unlock() {
  const c = context();
  if (c.state === 'suspended') await c.resume();
  unlocked = c.state === 'running';
  return unlocked;
}

export function isUnlocked() { return unlocked; }

export function stop() {
  if (current) {
    try { current.source.stop(); } catch (e) { /* already finished */ }
    if (current.raf) cancelAnimationFrame(current.raf);
    // The end callback runs view code; a fault there must not leave the audio
    // layer wedged for every later play.
    try { if (current.onEnd) current.onEnd(true); } catch (e) { /* view already gone */ }
    current = null;
  }
}

function toBuffer(rendered) {
  const c = context();
  const buf = c.createBuffer(1, rendered.samples.length, c.sampleRate);
  if (rendered.sampleRate === c.sampleRate) {
    buf.copyToChannel(rendered.samples, 0);
    return buf;
  }
  // Linear resample. Only bites when a device runs at 48 kHz.
  const ratio = rendered.sampleRate / c.sampleRate;
  const out = buf.getChannelData(0);
  for (let i = 0; i < out.length; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(rendered.samples.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = rendered.samples[i0] * (1 - t) + rendered.samples[i1] * t;
  }
  return buf;
}

/* Plays a rendered buffer. `onMark` fires as playback crosses each element in
 * rendered.marks, which is how the transcript highlights in step with the
 * audio. Returns a promise that settles when playback finishes or is stopped.
 */
export async function play(rendered, { onMark, gain = 1 } = {}) {
  await unlock();
  stop();
  const c = context();
  const source = c.createBufferSource();
  source.buffer = toBuffer(rendered);
  const g = c.createGain();
  g.gain.value = gain;
  source.connect(g).connect(c.destination);

  return new Promise((resolve) => {
    const startedAt = c.currentTime;
    const state = { source, onEnd: null, raf: 0 };
    let done = false;
    const finish = (interrupted) => {
      if (done) return;
      done = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      try { if (onMark) onMark(null); } catch (e) { /* view already gone */ }
      if (current === state) current = null;
      resolve(!interrupted);
    };
    state.onEnd = finish;
    source.onended = () => finish(false);

    if (onMark && rendered.marks && rendered.marks.length) {
      const marks = rendered.marks.filter((m) => m.type === 'slot' || m.type === 'preamble' || m.type === 'coda');
      let at = -1;
      const tick = () => {
        if (done) return;
        const elapsed = (c.currentTime - startedAt) * rendered.sampleRate;
        let idx = -1;
        for (let i = 0; i < marks.length; i += 1) {
          if (elapsed >= marks[i].start && elapsed < marks[i].end) { idx = i; break; }
        }
        if (idx !== at) {
          at = idx;
          try { onMark(idx >= 0 ? marks[idx] : null); } catch (e) { /* view already gone */ }
        }
        state.raf = requestAnimationFrame(tick);
      };
      state.raf = requestAnimationFrame(tick);
    }

    current = state;
    source.start();
  });
}

export function playUtterance(u, opts = {}) {
  return play(renderUtterance(u, opts), opts);
}

export function playTone(freq, ms = 500, opts = {}) {
  return play({ samples: renderTone(freq, ms), sampleRate: SAMPLE_RATE, marks: [] }, opts);
}

export function playPreamble(opts = {}) {
  return play(renderPreamble(opts), opts);
}

/* ── Microphone ────────────────────────────────────────────────────────── */

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('solra-tap', Tap);
`;

/* Records until `stopAfterMs`, or until it has heard sound and then silence for
 * `trailingSilenceMs`. Resolves to { samples, sampleRate }.
 *
 * Prefers an AudioWorklet and falls back to ScriptProcessorNode, which is
 * deprecated but is still the only capture path on some older browsers.
 */
export async function record({ maxMs = 9000, trailingSilenceMs = 500, onLevel } = {}) {
  await unlock();
  const c = context();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = c.createMediaStreamSource(stream);

  const chunks = [];
  let total = 0;
  let heardSound = false;
  let lastLoudAt = 0;
  const started = c.currentTime;

  let node = null;
  let cleanupNode = () => {};

  const onChunk = (data) => {
    chunks.push(data);
    total += data.length;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    if (onLevel) onLevel(peak);
    const now = (c.currentTime - started) * 1000;
    if (peak > 0.02) { heardSound = true; lastLoudAt = now; }
  };

  try {
    await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    node = new AudioWorkletNode(c, 'solra-tap');
    node.port.onmessage = (e) => onChunk(e.data);
    source.connect(node);
    // Keep the graph pulling without making the mic audible.
    const mute = c.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(c.destination);
    cleanupNode = () => { try { node.disconnect(); mute.disconnect(); } catch (e) { /* noop */ } };
  } catch (e) {
    node = c.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => onChunk(Float32Array.from(ev.inputBuffer.getChannelData(0)));
    const mute = c.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute).connect(c.destination);
    cleanupNode = () => { try { node.disconnect(); mute.disconnect(); } catch (err) { /* noop */ } };
  }

  await new Promise((resolve) => {
    const check = () => {
      const now = (c.currentTime - started) * 1000;
      if (now >= maxMs) return resolve();
      if (heardSound && now - lastLoudAt > trailingSilenceMs) return resolve();
      setTimeout(check, 60);
    };
    setTimeout(check, 200);
  });

  cleanupNode();
  source.disconnect();
  stream.getTracks().forEach((t) => t.stop());

  const samples = new Float32Array(total);
  let at = 0;
  for (const ch of chunks) { samples.set(ch, at); at += ch.length; }
  return { samples, sampleRate: c.sampleRate, heardSound };
}

export function micSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
