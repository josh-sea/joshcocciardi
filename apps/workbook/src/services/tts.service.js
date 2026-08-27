// Reading a word out loud, cheaply and reliably.
//
// Strategy (in order):
//   1. In-memory cache — instant replay within a session.
//   2. Shared cloud cache — Firestore doc workbook_audio/{slug} → a Storage mp3
//      that ANY user already generated. Every kid benefits from every other
//      kid's taps, so common words are free forever.
//   3. Cloud generate — on a miss, a Cloud Function (Google Cloud TTS) makes the
//      clip once; we upload it to the shared cache so it's never generated again.
//   4. On-device fallback — if we're offline or the cloud is unavailable, the
//      browser's built-in speech reads the word. Works on old devices too; it
//      just can't be cached (no audio file to save).
//
// Because taps are single words, the cache is a small, dense, universal set —
// after a little use almost nothing hits the cloud.

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

// Look for an already-cached clip (memory, then the shared Firestore cache).
const findCachedUrl = async (slug) => {
  if (memUrl.has(slug)) return memUrl.get(slug);
  try {
    const snap = await getDoc(audioDocRef(slug));
    if (snap.exists() && snap.data().url) {
      memUrl.set(slug, snap.data().url);
      return snap.data().url;
    }
  } catch {
    /* offline / rules — fall through */
  }
  return null;
};

// Generate a clip in the cloud and store it in the shared cache. Returns a URL.
const generateAndCache = async (slug, text) => {
  const res = await synthesize({ text });
  const { audioBase64, mime = 'audio/mpeg' } = res.data || {};
  if (!audioBase64) throw new Error('No audio returned.');
  const blob = b64ToBlob(audioBase64, mime);
  const { path, url } = await uploadWordAudio(slug, blob, mime);
  memUrl.set(slug, url);
  // Write the shared cache doc. If another client won the race, this is an
  // update the rules reject — ignore it; the clip is uploaded either way.
  try {
    await setDoc(audioDocRef(slug), {
      slug,
      text,
      url,
      path,
      engine: 'cloud-tts',
      createdBy: auth.currentUser?.uid || null,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* someone else cached it first — fine */
  }
  return url;
};

// Get a playable URL for a word, generating+caching if needed. Throws if the
// cloud is off/unreachable and there's no cached clip.
export const ensureAudioUrl = async (word) => {
  const slug = wordSlug(word);
  if (!slug) return null;
  const cached = await findCachedUrl(slug);
  if (cached) return cached;
  if (!CLOUD_TTS_ENABLED) throw new Error('Cloud TTS disabled.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Offline.');
  }
  return generateAndCache(slug, word);
};

// ── Playback (one thing speaks at a time) ────────────────────────────────────
let currentAudio = null;

const stopAll = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
};

let cachedVoice = null;
const pickVoice = () => {
  if (cachedVoice) return cachedVoice;
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices() || [];
  // Prefer a natural-sounding US English voice; fall back to any en, then any.
  cachedVoice =
    voices.find((v) => /en-US/i.test(v.lang) && /Samantha|Google US|Natural|Aria|Jenny/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null;
  return cachedVoice;
};

const webSpeak = (text, onStart, onEnd) => {
  if (typeof speechSynthesis === 'undefined') { onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; // a touch slow for a new reader
  u.pitch = 1.05;
  const v = pickVoice();
  if (v) u.voice = v;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  // Some browsers fire onstart late; call it optimistically too.
  onStart?.();
};

// Speak one word. Calls onStart when audio begins, onEnd when it finishes.
export const speakWord = async (word, { onStart, onEnd } = {}) => {
  stopAll();
  try {
    const url = await ensureAudioUrl(word);
    if (url) {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onplay = () => onStart?.();
      audio.onended = () => { if (currentAudio === audio) currentAudio = null; onEnd?.(); };
      audio.onerror = () => { webSpeak(word, onStart, onEnd); };
      await audio.play();
      return;
    }
  } catch {
    /* fall through to on-device voice */
  }
  webSpeak(word, onStart, onEnd);
};

// Warm the shared cache for a word without playing it. Returns:
//   'cached'    already in the cache (no cost)
//   'generated' just generated + stored
//   'skipped'   couldn't generate (offline / cloud off)
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
