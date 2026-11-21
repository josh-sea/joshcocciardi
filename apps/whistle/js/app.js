/* Whistle Rig: the page. Records (optionally over a song), finds the
 * notes, renders an instrument, plays it all back in sync. */
import * as P from './pitch.js';
import { INSTRUMENTS, render as renderInline } from './synth.js';
import { toMidi } from './midi.js';
import { encodeWav } from './wav.js';
import * as Store from './store.js';

const $ = (id) => document.getElementById(id);
const RENDER_SR = 44100;

const INST_BLURBS = {
  overdrive: 'Bends, sustain, grit', clean: 'Plucked and bright', bass: 'Three octaves down',
  lead: 'Follows every wobble', violin: 'Bowed, slow attack', brass: 'Brightens as you push', flute: 'Breathy, close to a whistle',
};

/* ---------- settings ---------- */
const DEFAULTS = {
  instrument: 'overdrive', octave: -1, semis: 0, tonic: 'auto', scale: 'auto',
  correction: 0.8, bends: 1, sens: 0.5, reverb: 0.25, echo: 0.15,
  volInst: 0.9, volSong: 0.7, volWhistle: 0,
};
let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem('whistle-rig-settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('whistle-rig-settings', JSON.stringify(S)); } catch {} };

/* ---------- state ---------- */
let ctx = null, graph = null;
let song = null;   // {buffer, blob, name, peaks}
let take = null;   // {id, name, pcm, sr, offset, nudge, created}
let tr = null, notes = null, key = null, perf = null;
let inst = null;   // {y: Float32Array, sr}
let playing = null, cursor = 0, rec = null;
let view = { start: 0, span: 6 };
let liveTrace = [];

/* ---------- worker, with an inline fallback ---------- */
let worker = null, jobId = 0;
const jobs = new Map();
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const job = jobs.get(e.data.id);
    if (!job) return;
    if ('progress' in e.data) return job.onProgress && job.onProgress(e.data.progress);
    jobs.delete(e.data.id);
    e.data.error ? job.reject(new Error(e.data.error)) : job.resolve(e.data.result);
  };
  worker.onerror = () => {
    worker = null;
    for (const [, job] of jobs) inline(job.type, job.payload, job.onProgress).then(job.resolve, job.reject);
    jobs.clear();
  };
} catch { worker = null; }

function inline(type, payload, onProgress) {
  if (type === 'analyze') return P.analyze(payload.x, { onProgress });
  return Promise.resolve(renderInline(payload.perf, payload.name, { sr: payload.sr }));
}
function run(type, payload, onProgress) {
  if (!worker) return inline(type, payload, onProgress);
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    jobs.set(id, { type, payload, onProgress, resolve, reject });
    worker.postMessage({ id, type, ...payload });
  });
}

/* ---------- audio graph ---------- */
function impulse(c, seconds = 2.4) {
  const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      d[i] = lp * Math.pow(1 - i / len, 3.2) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
    }
  }
  return buf;
}

function buildGraph(c) {
  const master = c.createGain(), inst = c.createGain(), songG = c.createGain(), whistle = c.createGain();
  const conv = c.createConvolver(); conv.buffer = impulse(c);
  const rev = c.createGain(), delay = c.createDelay(1.5), fb = c.createGain(), echo = c.createGain(), tone = c.createBiquadFilter();
  delay.delayTime.value = 0.34; fb.gain.value = 0.32; tone.type = 'lowpass'; tone.frequency.value = 3200;
  inst.connect(master); inst.connect(conv); conv.connect(rev); rev.connect(master);
  inst.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(echo); echo.connect(master);
  songG.connect(master); whistle.connect(master);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -6; comp.ratio.value = 4;
  master.connect(comp); comp.connect(c.destination);
  const g = { master, inst, song: songG, whistle, rev, echo };
  applyMix(g, true);
  return g;
}

function applyMix(g = graph, instant = false) {
  if (!g) return;
  const set = (param, v) => instant || !ctx ? (param.value = v) : param.setTargetAtTime(v, ctx.currentTime, 0.03);
  set(g.inst.gain, S.volInst);
  set(g.song.gain, S.volSong);
  set(g.whistle.gain, S.volWhistle * 2.5);
  set(g.rev.gain, S.reverb * 0.9);
  set(g.echo.gain, S.echo * 0.7);
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    graph = buildGraph(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const bufCache = new WeakMap();
function toBuffer(c, y, sr) {
  if (c === ctx && bufCache.has(y)) return bufCache.get(y);
  const b = c.createBuffer(1, y.length, sr);
  b.copyToChannel ? b.copyToChannel(y, 0) : b.getChannelData(0).set(y);
  if (c === ctx) bufCache.set(y, b);
  return b;
}

/* ---------- playback ---------- */
const total = () => (take ? take.pcm.length / take.sr : 0);
const songOffset = () => (take ? take.offset + (take.nudge || 0) / 1000 : 0);

function startSources(c, g, from, when) {
  const srcs = [];
  const add = (buffer, dest, offset, at = when) => {
    if (!buffer || offset >= buffer.duration) return;
    const s = c.createBufferSource(); s.buffer = buffer; s.connect(dest);
    s.start(at, Math.max(0, offset));
    srcs.push(s);
  };
  if (inst) add(toBuffer(c, inst.y, inst.sr), g.inst, from);
  if (take) add(toBuffer(c, take.pcm, take.sr), g.whistle, from);
  if (song) {
    const pos = songOffset() + from;
    pos >= 0 ? add(song.buffer, g.song, pos) : add(song.buffer, g.song, 0, when - pos);
  }
  return srcs;
}

function play(from = cursor) {
  if (!take) return;
  stop(false);
  ensureCtx();
  if (from >= total() - 0.05) from = 0;
  const when = ctx.currentTime + 0.05;
  playing = { srcs: startSources(ctx, graph, from, when), t0: when, from };
  $('playIcon').setAttribute('d', 'M6 4h4v16H6zM14 4h4v16h-4z');
  $('playBtn').setAttribute('aria-label', 'Pause');
  tick();
}

function stop(keepCursor = true) {
  if (!playing) return;
  if (keepCursor) cursor = pos();
  for (const s of playing.srcs) { try { s.stop(); } catch {} }
  playing = null;
  $('playIcon').setAttribute('d', 'M7 4l13 8-13 8z');
  $('playBtn').setAttribute('aria-label', 'Play');
  draw();
}

const pos = () => (playing ? Math.max(playing.from, playing.from + ctx.currentTime - playing.t0) : cursor);

function restartIfPlaying() { if (playing) play(pos()); }

function tick() {
  if (!playing) return;
  const p = pos();
  if (p >= total() + 0.3) { stop(false); cursor = 0; draw(); return; }
  // Keep the playhead in view when zoomed in.
  if (view.span < total() && (p > view.start + view.span * 0.85 || p < view.start)) view.start = clampView(p - view.span * 0.15);
  draw();
  requestAnimationFrame(tick);
}

/* ---------- processing ---------- */
async function resample(x, from, to) {
  if (from === to) return Float32Array.from(x);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(1, Math.ceil(x.length * to / from), to);
  const src = oc.createBufferSource(); src.buffer = toBuffer(oc, x, from); src.connect(oc.destination); src.start();
  const out = await oc.startRendering();
  return Float32Array.from(out.getChannelData(0));
}

function busy(text) { $('busy').hidden = !text; if (text) $('busyText').textContent = text; }

async function processTake() {
  stop(false); cursor = 0;
  view = { start: 0, span: Math.max(2, total()) };
  $('takeName').value = take.name;
  busy('Listening for notes…');
  try {
    const x = await resample(take.pcm, take.sr, P.ANALYSIS_SR);
    const raw = await run('analyze', { x }, (p) => busy(`Listening for notes… ${Math.round(p * 100)}%`));
    tr = P.track(raw);
    notes = P.segment(tr, S.sens);
    key = P.detectKey(notes);
    showKey();
    if (!notes.length) toast('No whistling found in that recording. Try whistling a little louder, closer to the mic.');
    await rerender();
  } catch (err) {
    console.error(err);
    toast('That recording could not be read. Try another file.');
  }
  busy('');
  updateSongUI();
}

function settingsForPerform() {
  const mode = key ? key.mode : 'major';
  const scale = S.scale === 'auto' ? mode : S.scale;
  let tonic = S.tonic === 'auto' ? (key ? key.tonic : 0) : +S.tonic;
  if (S.tonic === 'auto' && key) {
    const majorish = ['major', 'majpent', 'mixolydian'].includes(scale), minorish = ['minor', 'minpent', 'blues', 'dorian'].includes(scale);
    if (majorish && key.mode === 'minor') tonic = (tonic + 3) % 12;
    if (minorish && key.mode === 'major') tonic = (tonic + 9) % 12;
  }
  return { transpose: S.octave * 12 + S.semis, correction: S.correction, bends: S.bends, tonic, scale };
}

let renderSeq = 0;
async function rerender() {
  if (!tr) return;
  perf = P.perform(tr, notes, settingsForPerform());
  $('noteCount').textContent = `${perf.notes.length} notes`;
  draw();
  const id = ++renderSeq;
  const y = await run('render', { perf, name: S.instrument, sr: RENDER_SR });
  if (id !== renderSeq) return;
  inst = { y, sr: RENDER_SR };
  restartIfPlaying();
}
let rerenderTimer = 0;
const rerenderSoon = () => { clearTimeout(rerenderTimer); rerenderTimer = setTimeout(rerender, 140); };

/* ---------- recording ---------- */
async function startRecording() {
  ensureCtx();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (err) {
    toast(err && err.name === 'NotAllowedError'
      ? 'The microphone is blocked. Allow it for this site in your browser settings, or open a recording instead.'
      : 'No microphone was found. You can open a recording instead.');
    return;
  }
  stop(false);
  await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
  const sink = ctx.createGain(); sink.gain.value = 0;
  src.connect(analyser); src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);

  const T0 = ctx.currentTime + 0.3;
  const chunks = [];
  proc.onaudioprocess = (e) => {
    const t = e.playbackTime ?? ctx.currentTime;
    if (t >= T0 && rec) chunks.push(Float32Array.from(e.inputBuffer.getChannelData(0)));
  };
  let songSrc = null;
  const songStart = song ? +$('songStart').value : 0;
  if (song) {
    songSrc = ctx.createBufferSource(); songSrc.buffer = song.buffer; songSrc.connect(graph.song);
    songSrc.start(T0, songStart);
    songSrc.onended = () => { if (rec && rec.songSrc === songSrc) stopRecording(); };
  }
  // What the song was doing when the first recorded sample was captured.
  const settings = stream.getAudioTracks()[0]?.getSettings?.() || {};
  const latency = (ctx.outputLatency || ctx.baseLatency || 0.01) + (settings.latency || 0.01) + 2048 / ctx.sampleRate;
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  rec = { stream, src, proc, analyser, sink, songSrc, chunks, T0, offset: songStart - latency, wake, buf: new Float32Array(2048), d: new Float32Array(400) };
  liveTrace = [];
  $('recBtn').setAttribute('aria-pressed', 'true');
  $('recLabel').textContent = 'Stop';
  live();
}

function live() {
  if (!rec) return;
  rec.analyser.getFloatTimeDomainData(rec.buf);
  let e = 0; for (let i = 0; i < 1024; i++) e += rec.buf[i] * rec.buf[i];
  const t = ctx.currentTime - rec.T0;
  let m = NaN;
  if (Math.sqrt(e / 1024) > 0.004) {
    const r = P.yin(rec.buf, 0, 1024, ctx.sampleRate, rec.d);
    if (r.hz > P.MIN_HZ && r.clarity > 0.8) m = P.hzToMidi(r.hz);
  }
  if (t >= 0) liveTrace.push({ t, m });
  if (!isNaN(m)) {
    const cents = Math.round((m - Math.round(m)) * 100);
    $('tunerNote').textContent = P.noteName(m);
    $('tunerSub').textContent = `${Math.round(P.midiToHz(m))} Hz · ${cents >= 0 ? '+' : ''}${cents}¢`;
  }
  $('recLabel').textContent = t < 0 ? 'Ready…' : `Stop ${fmt(t, false)}`;
  drawLive();
  requestAnimationFrame(live);
}

async function stopRecording() {
  if (!rec) return;
  const r = rec; rec = null;
  try { r.songSrc && r.songSrc.stop(); } catch {}
  r.proc.onaudioprocess = null;
  r.src.disconnect(); r.proc.disconnect(); r.sink.disconnect();
  r.stream.getTracks().forEach((t) => t.stop());
  try { r.wake && r.wake.release(); } catch {}
  $('recBtn').setAttribute('aria-pressed', 'false');
  $('recLabel').textContent = 'Record';
  $('tunerNote').textContent = '–'; $('tunerSub').textContent = 'live pitch';
  const len = r.chunks.reduce((s, c) => s + c.length, 0);
  if (len < ctx.sampleRate * 0.5) { toast('That take was too short. Hold Record a little longer.'); draw(); return; }
  const pcm = new Float32Array(len);
  let o = 0; for (const c of r.chunks) { pcm.set(c, o); o += c.length; }
  const now = new Date();
  take = { id: null, name: `Take ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, pcm, sr: ctx.sampleRate, offset: r.offset, nudge: 0, created: now.getTime() };
  await processTake();
}

/* ---------- files ---------- */
async function decodeFile(file) {
  ensureCtx();
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
}

function mono(buffer) {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

function songPeaks(buffer) {
  const hop = Math.floor(buffer.sampleRate * 0.01), d = buffer.getChannelData(0);
  const peaks = new Float32Array(Math.ceil(d.length / hop));
  for (let i = 0; i < peaks.length; i++) {
    let m = 0; for (let j = i * hop, e = Math.min(d.length, j + hop); j < e; j++) m = Math.max(m, Math.abs(d[j]));
    peaks[i] = m;
  }
  return peaks;
}

async function loadSong(blob, name) {
  try {
    const buffer = await decodeFile(blob);
    song = { buffer, blob, name, peaks: songPeaks(buffer) };
    $('songStart').max = Math.max(0, Math.floor(buffer.duration - 1));
    if (+$('songStart').value > buffer.duration) $('songStart').value = 0;
    updateSongUI();
    return true;
  } catch {
    toast('That song file could not be played here. Try an mp3 or m4a.');
    return false;
  }
}

function updateSongUI() {
  $('songName').textContent = song ? `${song.name} · ${fmt(song.buffer.duration, false)}` : 'Optional. Any audio file on your device (mp3, m4a, wav).';
  $('songClear').hidden = !song;
  $('songStartField').hidden = !song;
  $('nudgeField').hidden = !song || !take;
  $('songStartOut').textContent = fmt(+$('songStart').value, false);
  if (take) { $('nudge').value = take.nudge || 0; showOut('nudge'); }
  draw();
}

/* ---------- drawing ---------- */
const canvas = $('roll'), g2 = canvas.getContext('2d');
let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['ink', 'muted', 'line', 'well', 'amber', 'amber-soft', 'blue', 'panel', 'rec']) colors[k] = cs.getPropertyValue('--' + k).trim();
}
function size() {
  const dpr = window.devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return r;
}
let W = 0, H = 0;
new ResizeObserver(() => { const r = size(); W = r.width; H = r.height; rec ? drawLive() : draw(); }).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const LEFT = 34, BOTTOM = 20;

function pitchRange() {
  let lo = Infinity, hi = -Infinity;
  const shift = S.octave * 12 + S.semis;
  if (perf) for (let i = 0; i < perf.frames; i++) {
    const a = perf.pitch[i], b = tr.midi[i] + shift;
    if (!isNaN(a)) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
    if (!isNaN(b)) { lo = Math.min(lo, b); hi = Math.max(hi, b); }
  }
  if (!isFinite(lo)) { lo = 60; hi = 72; }
  const mid = (lo + hi) / 2, span = Math.max(12, hi - lo + 4);
  return [mid - span / 2, mid + span / 2];
}

function grid(lo, hi, y) {
  const semis = hi - lo, rowH = (H - BOTTOM) / semis;
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const pc = ((m % 12) + 12) % 12;
    if ([1, 3, 6, 8, 10].includes(pc)) { g2.fillStyle = colors.line; g2.globalAlpha = 0.35; g2.fillRect(LEFT, y(m) - rowH / 2, W - LEFT, rowH); g2.globalAlpha = 1; }
    if (pc === 0 || rowH > 13) {
      g2.fillStyle = colors.muted; g2.font = '10px "IBM Plex Mono", monospace'; g2.textBaseline = 'middle';
      if (pc === 0 || rowH > 13) g2.fillText(P.noteName(m), 4, y(m));
      if (pc === 0) { g2.strokeStyle = colors.line; g2.lineWidth = 1; g2.beginPath(); g2.moveTo(LEFT, y(m) + rowH / 2); g2.lineTo(W, y(m) + rowH / 2); g2.stroke(); }
    }
  }
}

function draw() {
  if (rec || !W) return;
  if (!colors.ink) readColors();
  g2.clearRect(0, 0, W, H);
  if (!perf) return;
  const [lo, hi] = pitchRange();
  const x = (t) => LEFT + (t - view.start) / view.span * (W - LEFT);
  const y = (m) => (H - BOTTOM) * (1 - (m - lo) / (hi - lo));
  grid(lo, hi, y);

  // The song's loudness along the bottom, so you can line up with the beat.
  if (song) {
    const off = songOffset(), band = 34, base = H - BOTTOM;
    g2.fillStyle = colors.muted; g2.globalAlpha = 0.28;
    for (let px = LEFT; px < W; px += 2) {
      const t = view.start + (px - LEFT) / (W - LEFT) * view.span + off;
      const i = Math.floor(t * 100);
      if (i < 0 || i >= song.peaks.length) continue;
      const h = song.peaks[i] * band;
      g2.fillRect(px, base - h, 1.5, h);
    }
    g2.globalAlpha = 1;
  }

  const hop = perf.hop, f0 = Math.max(0, Math.floor(view.start / hop) - 1), f1 = Math.min(perf.frames, Math.ceil((view.start + view.span) / hop) + 1);
  const rowH = (H - BOTTOM) / (hi - lo);
  // Notes found.
  for (const n of perf.notes) {
    if (n.end < f0 || n.start > f1) continue;
    const x0 = x(n.start * hop), x1 = x(n.end * hop);
    g2.fillStyle = colors['amber-soft']; g2.strokeStyle = colors.amber; g2.lineWidth = 1;
    g2.beginPath(); g2.roundRect ? g2.roundRect(x0, y(n.pitch) - rowH / 2, Math.max(2, x1 - x0 - 1), rowH, 3) : g2.rect(x0, y(n.pitch) - rowH / 2, Math.max(2, x1 - x0 - 1), rowH);
    g2.fill(); g2.stroke();
  }
  const line = (arr, shift, color, width, alpha) => {
    g2.strokeStyle = color; g2.lineWidth = width; g2.globalAlpha = alpha; g2.lineJoin = 'round';
    g2.beginPath(); let pen = false;
    for (let i = f0; i < f1; i++) {
      const v = arr[i];
      if (isNaN(v)) { pen = false; continue; }
      pen ? g2.lineTo(x(i * hop), y(v + shift)) : g2.moveTo(x(i * hop), y(v + shift));
      pen = true;
    }
    g2.stroke(); g2.globalAlpha = 1;
  };
  line(tr.midi, S.octave * 12 + S.semis, colors.blue, 2, 0.5);
  line(perf.pitch, 0, colors.amber, 2.25, 1);

  // Time axis.
  g2.fillStyle = colors.muted; g2.font = '10px "IBM Plex Mono", monospace'; g2.textBaseline = 'alphabetic';
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => (W - LEFT) / (view.span / s) > 60) || 60;
  for (let t = Math.ceil(view.start / step) * step; t < view.start + view.span; t += step) {
    g2.fillText(fmt(t, false), x(t) + 3, H - 6);
    g2.fillRect(x(t), H - BOTTOM, 1, 4);
  }
  // Playhead.
  const p = pos();
  g2.fillStyle = colors.ink; g2.fillRect(x(p) - 1, 0, 2, H - BOTTOM);
  $('timeNow').textContent = fmt(p);
  $('timeTotal').textContent = fmt(total());
}

function drawLive() {
  if (!W) return;
  if (!colors.ink) readColors();
  g2.clearRect(0, 0, W, H);
  const span = 8, now = liveTrace.length ? liveTrace[liveTrace.length - 1].t : 0, start = Math.max(0, now - span);
  let lo = Infinity, hi = -Infinity;
  for (const p of liveTrace) if (p.t >= start && !isNaN(p.m)) { lo = Math.min(lo, p.m); hi = Math.max(hi, p.m); }
  if (!isFinite(lo)) { lo = 74; hi = 90; }
  const mid = (lo + hi) / 2, s = Math.max(14, hi - lo + 4);
  lo = mid - s / 2; hi = mid + s / 2;
  const x = (t) => LEFT + (t - start) / span * (W - LEFT), y = (m) => (H - BOTTOM) * (1 - (m - lo) / (hi - lo));
  grid(lo, hi, y);
  g2.strokeStyle = colors.blue; g2.lineWidth = 2.5; g2.lineJoin = 'round'; g2.beginPath();
  let pen = false;
  for (const p of liveTrace) {
    if (p.t < start || isNaN(p.m)) { pen = false; continue; }
    pen ? g2.lineTo(x(p.t), y(p.m)) : g2.moveTo(x(p.t), y(p.m)); pen = true;
  }
  g2.stroke();
  g2.fillStyle = colors.rec; g2.beginPath(); g2.arc(W - 14, 14, 5, 0, Math.PI * 2); g2.fill();
}

function clampView(start) { return Math.max(0, Math.min(Math.max(0, total() - view.span), start)); }

function zoom(factor) {
  const center = playing ? pos() : view.start + view.span / 2;
  view.span = Math.max(1.5, Math.min(Math.max(2, total()), view.span * factor));
  view.start = clampView(center - view.span / 2);
  draw();
}

// Click to move the playhead, drag to scroll.
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, start: view.start, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 5) drag.moved = true;
  if (drag.moved && view.span < total()) { view.start = clampView(drag.start - dx / (W - LEFT) * view.span); draw(); }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved && take && !rec) {
    const r = canvas.getBoundingClientRect();
    const t = Math.max(0, Math.min(total(), view.start + (e.clientX - r.left - LEFT) / (W - LEFT) * view.span));
    if (playing) play(t); else { cursor = t; draw(); }
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
  e.preventDefault();
  if (e.ctrlKey) zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);
  else { view.start = clampView(view.start + e.deltaX / (W - LEFT) * view.span); draw(); }
}, { passive: false });

/* ---------- export ---------- */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const safeName = () => (take ? take.name : 'whistle').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'whistle';

async function exportWav() {
  if (!inst) return;
  $('wavBtn').disabled = true;
  try {
    const sr = 44100, len = Math.ceil((total() + 2.5) * sr);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(2, len, sr);
    startSources(oc, buildGraph(oc), 0, 0);
    const out = await oc.startRendering();
    download(new Blob([encodeWav([out.getChannelData(0), out.getChannelData(1)], sr)], { type: 'audio/wav' }), `${safeName()}.wav`);
    toast('Mix downloaded.');
  } catch (err) {
    console.error(err); toast('The mix could not be rendered on this device.');
  }
  $('wavBtn').disabled = false;
}

function exportMidi() {
  if (!perf) return;
  download(new Blob([toMidi(perf, { program: INSTRUMENTS[S.instrument].gm })], { type: 'audio/midi' }), `${safeName()}.mid`);
  toast('MIDI downloaded.');
}

/* ---------- takes ---------- */
async function saveTake() {
  if (!take) return;
  take.name = $('takeName').value.trim() || take.name;
  take.id = take.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  try {
    await Store.saveTake({
      id: take.id, name: take.name, created: take.created || Date.now(), duration: total(),
      pcm: take.pcm, sr: take.sr, offset: take.offset, nudge: take.nudge || 0,
      songBlob: song ? song.blob : null, songName: song ? song.name : null, backingName: song ? song.name : null,
      settings: { ...S },
    });
    toast(`Saved “${take.name}”.`);
    listTakes();
  } catch (err) {
    console.error(err); toast('This browser would not save the take. It may be in private mode or out of space.');
  }
}

async function openTake(id) {
  try {
    const t = await Store.getTake(id);
    if (!t) return;
    Object.assign(S, t.settings || {});
    syncControls();
    if (t.songBlob) await loadSong(t.songBlob, t.songName || 'Song'); else song = null;
    take = { id: t.id, name: t.name, pcm: t.pcm, sr: t.sr, offset: t.offset || 0, nudge: t.nudge || 0, created: t.created };
    await processTake();
  } catch (err) { console.error(err); toast('That take could not be opened.'); }
}

async function listTakes() {
  const ul = $('takes');
  let items = [];
  try { items = await Store.listTakes(); } catch { ul.innerHTML = '<li class="empty">Saving takes is not available in this browser.</li>'; return; }
  ul.textContent = '';
  if (!items.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No saved takes yet.'; ul.append(li); return; }
  for (const t of items) {
    const li = document.createElement('li');
    const name = document.createElement('button'); name.className = 't-name'; name.textContent = t.name; name.onclick = () => openTake(t.id);
    const meta = document.createElement('span'); meta.className = 't-meta';
    meta.textContent = `${fmt(t.duration || 0, false)} · ${new Date(t.created).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    const del = document.createElement('button'); del.className = 'link-btn'; del.textContent = 'Delete';
    del.onclick = async () => {
      if (del.dataset.armed) { await Store.deleteTake(t.id); if (take && take.id === t.id) take.id = null; listTakes(); return; }
      del.dataset.armed = '1'; del.textContent = 'Delete for good?';
      setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete'; }, 3000);
    };
    li.append(name, meta, del);
    ul.append(li);
  }
}

/* ---------- controls ---------- */
function fmt(t, tenths = true) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return tenths ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

const OUTS = {
  correction: (v) => `${Math.round(v * 100)}%`, bends: (v) => `${Math.round(v * 100)}%`, sens: (v) => `${Math.round(v * 100)}%`,
  reverb: (v) => `${Math.round(v * 100)}%`, echo: (v) => `${Math.round(v * 100)}%`,
  volInst: (v) => `${Math.round(v * 100)}%`, volSong: (v) => `${Math.round(v * 100)}%`, volWhistle: (v) => `${Math.round(v * 100)}%`,
  nudge: (v) => `${v > 0 ? '+' : ''}${v} ms`,
};
function showOut(id) { const o = $(id + 'Out'); if (o) o.textContent = OUTS[id](+$(id).value); }

function buildInstruments() {
  const grid = $('instGrid');
  for (const [id, def] of Object.entries(INSTRUMENTS)) {
    const b = document.createElement('button');
    b.className = 'inst'; b.setAttribute('role', 'radio'); b.dataset.id = id;
    b.innerHTML = `${def.label}<small>${INST_BLURBS[id]}</small>`;
    b.onclick = () => {
      S.instrument = id; S.octave = def.octave; saveSettings(); syncControls(); rerender();
    };
    grid.append(b);
  }
}

function showKey() {
  $('keyGuess').textContent = key ? `${P.NOTE_NAMES[key.tonic]} ${key.mode}` : '';
  const auto = $('tonic').options[0];
  auto.textContent = key ? `Auto (${P.NOTE_NAMES[key.tonic]})` : 'Auto';
  $('scale').options[0].textContent = key ? `Auto (${key.mode})` : 'Auto';
}

function syncControls() {
  for (const b of $('instGrid').children) b.setAttribute('aria-checked', String(b.dataset.id === S.instrument));
  $('octave').value = S.octave; $('semis').value = S.semis; $('tonic').value = S.tonic; $('scale').value = S.scale;
  for (const id of ['correction', 'bends', 'sens', 'reverb', 'echo', 'volInst', 'volSong', 'volWhistle']) { $(id).value = S[id]; showOut(id); }
}

function wire() {
  for (let s = -6; s <= 6; s++) $('semis').add(new Option(s === 0 ? 'None' : `${s > 0 ? '+' : ''}${s} semitone${Math.abs(s) > 1 ? 's' : ''}`, s));
  $('tonic').add(new Option('Auto', 'auto'));
  P.NOTE_NAMES.forEach((n, i) => $('tonic').add(new Option(n, i)));
  $('scale').add(new Option('Auto', 'auto'));
  for (const [id, sc] of Object.entries(P.SCALES)) $('scale').add(new Option(sc.label, id));
  buildInstruments();
  syncControls();

  const onSelect = (id, num = true) => $(id).addEventListener('change', () => { S[id] = num ? +$(id).value : $(id).value; saveSettings(); rerender(); });
  onSelect('octave'); onSelect('semis'); onSelect('tonic', false); onSelect('scale', false);
  $('tonic').addEventListener('change', () => { if (S.tonic !== 'auto') S.tonic = +S.tonic; });

  for (const id of ['correction', 'bends']) $(id).addEventListener('input', () => { S[id] = +$(id).value; showOut(id); saveSettings(); rerenderSoon(); });
  $('sens').addEventListener('input', () => {
    S.sens = +$('sens').value; showOut('sens'); saveSettings();
    if (tr) { notes = P.segment(tr, S.sens); rerenderSoon(); }
  });
  for (const id of ['reverb', 'echo', 'volInst', 'volSong', 'volWhistle']) $(id).addEventListener('input', () => { S[id] = +$(id).value; showOut(id); saveSettings(); applyMix(); });
  $('nudge').addEventListener('input', () => { if (take) { take.nudge = +$('nudge').value; showOut('nudge'); draw(); } });
  $('nudge').addEventListener('change', restartIfPlaying);

  $('playBtn').onclick = () => (playing ? stop() : play());
  $('rewBtn').onclick = () => { const was = !!playing; stop(false); cursor = 0; view.start = 0; was ? play(0) : draw(); };
  $('zoomIn').onclick = () => zoom(1 / 1.6);
  $('zoomOut').onclick = () => zoom(1.6);
  $('recBtn').onclick = () => (rec ? stopRecording() : startRecording());
  $('demoBtn').onclick = loadDemo;
  $('saveBtn').onclick = saveTake;
  $('wavBtn').onclick = exportWav;
  $('midiBtn').onclick = exportMidi;
  $('takeName').addEventListener('change', () => { if (take) take.name = $('takeName').value.trim() || take.name; });

  $('songFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (await loadSong(f, f.name.replace(/\.[^.]+$/, ''))) {
      // A take without a song picks up this one, lined up with where the song starts.
      if (take && take.offset === 0 && !take.nudge) take.offset = +$('songStart').value;
      updateSongUI();
    }
  });
  $('songClear').onclick = () => { stop(); song = null; updateSongUI(); };
  $('songStart').addEventListener('input', () => {
    $('songStartOut').textContent = fmt(+$('songStart').value, false);
  });
  $('whistleFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const b = await decodeFile(f);
      take = { id: null, name: f.name.replace(/\.[^.]+$/, ''), pcm: mono(b), sr: b.sampleRate, offset: song ? +$('songStart').value : 0, nudge: 0, created: Date.now() };
      await processTake();
    } catch { toast('That file could not be opened. Try an mp3, m4a or wav.'); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target.closest('input, select, button, textarea')) return;
    e.preventDefault(); playing ? stop() : play();
  });
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4200);
}

async function loadDemo() {
  stop(false);
  take = { id: null, name: 'Demo whistle', pcm: P.demoWhistle(P.ANALYSIS_SR), sr: P.ANALYSIS_SR, offset: 0, nudge: 0, created: Date.now() };
  await processTake();
}

wire();
listTakes();
loadDemo();
