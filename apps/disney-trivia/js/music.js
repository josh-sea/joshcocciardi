/* Background music for both games.
 *
 * Plain audio files, played by a plain <audio> element. No embed, no third
 * party, no network once the file is cached: music keeps playing in a queue
 * with no signal, which is the whole point of it existing.
 *
 * The pure helpers at the top are exported so they can be tested in node; the
 * player below them is the only part that touches the DOM.
 */

/* ── the testable parts ──────────────────────────────────────────────────── */

export const DEFAULT_VOLUME = 0.35;   // background, not foreground
export const FADE_MS = 900;

/* Volume arrives from a slider, from storage, and from whatever the last
 * release wrote. Anything unusable has to become the default rather than
 * silence, or music just stops working with nothing on screen to explain it.
 *
 * null and '' are the traps: Number(null) and Number('') are both 0, which
 * is perfectly finite, so a missing localStorage key would read as "volume
 * zero" rather than "no setting". They are rejected before the conversion.
 */
export function clampVolume(v) {
  if (v === null || v === undefined || v === '') return DEFAULT_VOLUME;
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(Math.max(n, 0), 1);
}

/* A readable title from a file name, so dropping a file into music/ needs no
 * other edit. 'music/main-street_loop.mp3' becomes 'Main street loop'.
 */
export function trackLabel(src) {
  const base = String(src || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return 'Untitled';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Walk a playlist, wrapping at the end. An empty list has nowhere to go.
export function nextIndex(i, len) {
  if (!(len > 0)) return -1;
  return ((i + 1) % len + len) % len;
}

/* Play order. Shuffling matters more than it sounds: a short list played in
 * the same order every session becomes as memorised as the music itself.
 * `rand` is injectable so the order can be pinned in a test.
 */
export function orderFor(count, shuffle = true, rand = Math.random) {
  const idx = Array.from({ length: Math.max(0, count | 0) }, (_, i) => i);
  if (!shuffle) return idx;
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ── the player ──────────────────────────────────────────────────────────── */

const VOL_KEY = 'disneyTrivia.musicVolume';
const ON_KEY = 'disneyTrivia.musicOn';

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v === null ? fallback : v; }
  catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

let audio = null;
let tracks = [];        // { src, title, credit }
let order = [];
let at = -1;
let volume = clampVolume(read(VOL_KEY, DEFAULT_VOLUME));
let wanted = read(ON_KEY, 'no') === 'yes';   // what the player asked for
let silenced = false;   // what the page's sound toggle says
let fading = null;
let onChange = () => {};

function el() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0;
    audio.addEventListener('ended', () => { if (tracks.length > 1) step(); else replay(); });
    // A missing or unplayable file should move the playlist on rather than
    // leaving the player stuck looking like it is playing.
    audio.addEventListener('error', () => { if (tracks.length > 1) step(); else stop(); });
  }
  return audio;
}

function fadeTo(target, ms = FADE_MS, done) {
  clearInterval(fading);
  const a = el();
  const from = a.volume;
  const started = Date.now();
  fading = setInterval(() => {
    const t = Math.min((Date.now() - started) / ms, 1);
    a.volume = clampVolume(from + (target - from) * t);
    if (t >= 1) { clearInterval(fading); fading = null; if (done) done(); }
  }, 40);
}

function load(i) {
  const a = el();
  at = i;
  const track = tracks[order[i]];
  if (!track) return;
  a.src = track.src;
  a.currentTime = 0;
  a.volume = 0;
  const p = a.play();
  if (p && p.catch) p.catch(() => { /* blocked until a gesture; the UI asks for one */ });
  fadeTo(effectiveVolume());
  onChange();
}

function replay() { const a = el(); a.currentTime = 0; a.play().catch(() => {}); }
function step() { if (tracks.length) load(nextIndex(at, order.length)); }

function effectiveVolume() { return silenced ? 0 : volume; }

export function isPlaying() { return Boolean(audio && !audio.paused && wanted); }
export function currentTrack() { return tracks[order[at]] || null; }
export function getVolume() { return volume; }

export function setVolume(v) {
  volume = clampVolume(v);
  write(VOL_KEY, String(volume));
  if (audio && !audio.paused) { clearInterval(fading); audio.volume = effectiveVolume(); }
  onChange();
}

export function play(i = at < 0 ? 0 : at) {
  if (!tracks.length) return;
  wanted = true;
  write(ON_KEY, 'yes');
  if (at === i && audio && !audio.paused) { onChange(); return; }
  load(i);
}

export function stop() {
  wanted = false;
  write(ON_KEY, 'no');
  if (!audio) { onChange(); return; }
  fadeTo(0, 350, () => { audio.pause(); onChange(); });
  onChange();
}

export function toggle() { (isPlaying() ? stop : play)(); }

/* Skip. Deliberately starts the next track rather than just stopping this
 * one, so the button does something audible even when the player was paused.
 */
export function next() {
  if (!tracks.length) return;
  wanted = true;
  write(ON_KEY, 'yes');
  load(nextIndex(at, order.length));
}

/* The page's own sound switch silences music too: "sound off" should mean
 * silence, not "silence except the music". Pausing rather than muting so a
 * phone is not quietly decoding audio at zero volume for an hour.
 */
export function setSilenced(v) {
  silenced = Boolean(v);
  if (!audio) return;
  if (silenced) { clearInterval(fading); audio.pause(); audio.volume = 0; }
  else if (wanted) { audio.play().catch(() => {}); fadeTo(volume, 400); }
  onChange();
}

export function setTracks(list) {
  tracks = (list || []).filter(t => t && t.src);
  order = orderFor(tracks.length);
  at = -1;
  onChange();
}

export function addTrack(track, andPlay = true) {
  tracks = tracks.concat([track]);
  order = order.concat([tracks.length - 1]);
  if (andPlay) play(order.length - 1);
  else onChange();
}

export function listTracks() { return tracks.map((t, i) => ({ ...t, index: order.indexOf(i) })); }
export function wasWanted() { return wanted; }
export function observe(fn) { onChange = fn || (() => {}); }
