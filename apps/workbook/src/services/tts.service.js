// Reading a word out loud, cheaply and reliably.
//
// Strategy (in order):
//   1. In-memory cache — instant replay within a session.
//   2. Shared cloud cache — Firestore doc workbook_audio/{slug} → a Storage mp3
//      that ANY user already generated. Every kid benefits from every other
//      kid's taps, so common words are free forever.
//   3. Cloud generate — on a miss, a Cloud Function (Google Cloud TTS) makes the
//      clip once; we upload it to the shared cache so it's never generated again.
//   4. On-device fallback — the browser's built-in speech reads the word. Works
//      on old devices too; it just can't be cached (no audio file to save).
//
// ── iOS/iPad audio unlock ────────────────────────────────────────────────────
// Mobile Safari blocks audio unless it starts *inside* a user gesture. Two rules
// keep taps audible on an iPad:
//   • We NEVER `await` before making the first sound — a tap that awaits a
//     network round-trip loses its gesture and iOS silently refuses to play.
//   • We reuse ONE <audio> element and "unlock" it on the first tap; a fresh
//     `new Audio()` per tap is not user-activated and stays muted.
// So on a tap we play a cached clip synchronously if we already have its URL;
// otherwise we speak with the on-device voice *right now* (no network) and warm
// the cloud cache in the background so the nicer voice is ready next time.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
import { uploadWordAudio } from './storage.service';
import { wordSlug } from '../utils/words';

// Flip to false to force the free on-device voice everywhere (no cloud calls).
export const CLOUD_TTS_ENABLED = true;

const memUrl = new Map(); // slug -> download URL
const synthesize = httpsCallable(functions, 'synthesizeWord');

const audioDocRef = (slug) => doc(db, 'workbook_audio', slug);

const b64ToBlob = (b64, type) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

// ── One shared, unlockable <audio> element ───────────────────────────────────
let player = null;
let unlocked = false;

const getPlayer = () => {
  if (!player && typeof Audio !== 'undefined') {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
};

// A tiny silent WAV so the very first play() has something to load inside the
// gesture. Built at runtime so it's guaranteed valid.
const silentWav = () => {
  const rate = 8000, samples = 8, dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, dataSize, true);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(bin);
};
let SILENT;

// MUST be called from inside a user gesture (a tap). Unlocks the shared <audio>
// element and keeps on-device speech warm. Cheap to call on every tap.
export const primeAudio = () => {
  const p = getPlayer();
  if (p && !unlocked) {
    try {
      SILENT = SILENT || silentWav();
      p.src = SILENT;
      const pr = p.play();
      if (pr && pr.catch) pr.catch(() => {});
      unlocked = true;
    } catch { /* ignore */ }
  }
  // iOS sometimes parks speech synthesis; nudge it awake within the gesture.
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume(); } catch { /* ignore */ }
};

// ── On-device speech ─────────────────────────────────────────────────────────
let cachedVoice = null;
const pickVoice = () => {
  if (cachedVoice) return cachedVoice;
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices() || [];
  cachedVoice =
    voices.find((v) => /en[-_]US/i.test(v.lang) && /Samantha|Google US|Natural|Aria|Jenny/i.test(v.name)) ||
    voices.find((v) => /en[-_]US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] || null;
  return cachedVoice;
};

const webSpeak = (text, onStart, onEnd) => {
  if (typeof speechSynthesis === 'undefined') { onEnd?.(); return; }
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;
  u.pitch = 1.05;
  const v = pickVoice();
  if (v) u.voice = v;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  try { speechSynthesis.speak(u); onStart?.(); } catch { onEnd?.(); }
};

// ── Cloud cache ──────────────────────────────────────────────────────────────
const findCachedUrl = async (slug) => {
  if (memUrl.has(slug)) return memUrl.get(slug);
  try {
    const snap = await getDoc(audioDocRef(slug));
    if (snap.exists() && snap.data().url) {
      memUrl.set(slug, snap.data().url);
      return snap.data().url;
    }
  } catch { /* offline / rules — fall through */ }
  return null;
};

const generateAndCache = async (slug, text) => {
  const res = await synthesize({ text });
  const { audioBase64, mime = 'audio/mpeg' } = res.data || {};
  if (!audioBase64) throw new Error('No audio returned.');
  const blob = b64ToBlob(audioBase64, mime);
  const { path, url } = await uploadWordAudio(slug, blob, mime);
  memUrl.set(slug, url);
  try {
    await setDoc(audioDocRef(slug), {
      slug, text, url, path,
      engine: 'cloud-tts',
      createdBy: auth.currentUser?.uid || null,
      createdAt: serverTimestamp(),
    });
  } catch { /* someone else cached it first — fine */ }
  return url;
};

// Get a playable URL, generating+caching on a miss. Throws if the cloud is
// off/unreachable and there's no cached clip.
export const ensureAudioUrl = async (word) => {
  const slug = wordSlug(word);
  if (!slug) return null;
  const cached = await findCachedUrl(slug);
  if (cached) return cached;
  if (!CLOUD_TTS_ENABLED) throw new Error('Cloud TTS disabled.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline.');
  return generateAndCache(slug, word);
};

// Play a URL on the shared (unlocked) element. Falls back to the device voice
// if playback is refused.
const playUrl = (url, word, onStart, onEnd) => {
  const p = getPlayer();
  if (!p) { webSpeak(word, onStart, onEnd); return; }
  try {
    p.pause();
    p.src = url;
    p.currentTime = 0;
    p.onplay = () => onStart?.();
    p.onended = () => onEnd?.();
    p.onerror = () => webSpeak(word, onStart, onEnd);
    const pr = p.play();
    if (pr && pr.catch) pr.catch(() => webSpeak(word, onStart, onEnd));
  } catch {
    webSpeak(word, onStart, onEnd);
  }
};

// Speak one word. Synchronous on purpose so the first sound starts inside the
// tap gesture (iOS requirement). If we already hold the cloud clip's URL we play
// it now; otherwise the device voice speaks immediately and we warm the cloud
// cache for next time.
export const speakWord = (word, { onStart, onEnd } = {}) => {
  const slug = wordSlug(word);
  if (!slug) { onEnd?.(); return; }

  primeAudio(); // unlock audio inside the gesture

  const cachedUrl = memUrl.get(slug);
  if (cachedUrl) {
    try { speechSynthesis?.cancel(); } catch { /* ignore */ }
    playUrl(cachedUrl, word, onStart, onEnd);
    return;
  }

  // No clip in hand — guarantee sound right now with the device voice…
  webSpeak(word, onStart, onEnd);

  // …and fetch/generate the cloud clip in the background for next time.
  if (CLOUD_TTS_ENABLED && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    ensureAudioUrl(word).catch(() => {});
  }
};

// Warm the in-memory URL map from the shared cache WITHOUT generating anything,
// so words already in the cache play with the nicer cloud voice on the very
// first tap. Called when a page opens. Never generates (no cost).
export const prefetchCachedUrls = async (words) => {
  const slugs = [...new Set(words.map(wordSlug).filter(Boolean))].filter((s) => !memUrl.has(s));
  await Promise.all(slugs.map(async (slug) => {
    try {
      const snap = await getDoc(audioDocRef(slug));
      if (snap.exists() && snap.data().url) memUrl.set(slug, snap.data().url);
    } catch { /* ignore */ }
  }));
};

// Warm the shared cache for a word (generates + stores). Used by the Word Bank.
//   'cached' | 'generated' | 'skipped'
export const warmWord = async (word) => {
  const slug = wordSlug(word);
  if (!slug) return 'skipped';
  const cached = await findCachedUrl(slug);
  if (cached) return 'cached';
  if (!CLOUD_TTS_ENABLED) return 'skipped';
  try {
    await generateAndCache(slug, word);
    return 'generated';
  } catch {
    return 'skipped';
  }
};

// Prime the on-device voice list early (Chrome loads voices asynchronously).
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };
  pickVoice();
}
