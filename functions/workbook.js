// Workbook Reader: text-to-speech for a single tapped word.
//
// The client calls this only on a CACHE MISS — a word no user has ever tapped.
// It returns the audio as base64 MP3; the client plays it and uploads it to the
// shared Storage cache (workbook/audio/{slug}.mp3) so it's never generated
// again, for anyone. Keeping the key server-side means no TTS credentials ship
// to the browser.
//
// Requires the "Cloud Text-to-Speech API" enabled on the josh-cocciardi GCP
// project; the function runs as the default service account, which has access.
// Voice can be overridden with the WORKBOOK_TTS_VOICE env var.

const { onCall, HttpsError } = require('firebase-functions/v2/https');

// Lazy-required so a problem loading the TTS package can never break the other
// functions in this codebase (gatekeeper, canitwo) at deploy/cold-start time.
let client;
const getClient = () => {
  if (!client) {
    const textToSpeech = require('@google-cloud/text-to-speech');
    client = new textToSpeech.TextToSpeechClient();
  }
  return client;
};

const VOICE = process.env.WORKBOOK_TTS_VOICE || 'en-US-Neural2-F';

exports.synthesizeWord = onCall({ cors: true, memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to use the reading voice.');
  }

  const text = String(request.data?.text || '').trim();
  if (!text) throw new HttpsError('invalid-argument', 'No text to read.');
  // Taps are single words; cap length so this can never be used as a general
  // TTS endpoint. A generous cap still covers the longest workbook words.
  if (text.length > 80) throw new HttpsError('invalid-argument', 'Text is too long for a single word.');

  try {
    const [response] = await getClient().synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'en-US', name: VOICE },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0 },
    });
    const audioBase64 = Buffer.from(response.audioContent).toString('base64');
    return { audioBase64, mime: 'audio/mpeg' };
  } catch (err) {
    console.error('[synthesizeWord] TTS failed:', err?.message || err);
    // Surface a clean error; the client falls back to the on-device voice.
    throw new HttpsError('internal', 'Could not generate speech.');
  }
});
