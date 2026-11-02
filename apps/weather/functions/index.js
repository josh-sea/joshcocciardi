// Weather's Cloud Functions: codebase "weather" in the josh-cocciardi project.
// One HTTPS function, weather-api, served at /api/* on the weather Hosting site:
//
//   GET  /api/forecast?lat=..&lon=..        Pirate Weather forecast (cached)
//   POST /api/summary {lat, lon, name, timeframe, personality}
//                                           a short Claude-written summary
//
// Both API keys stay on the server, in Firestore at weather_secrets/keys
// (fields pirateWeatherKey and anthropicKey; clients can never read it). The
// summary endpoint builds its prompt from the forecast itself, so it can't be
// used as a general-purpose Claude proxy.
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const AnthropicMod = require('@anthropic-ai/sdk');
const { TIMEFRAMES, buildPrompt, fallbackSummary } = require('./prompts');
const { getPersonalityPrompt, isPersonality } = require('./personalities');

const Anthropic = AnthropicMod.default || AnthropicMod;

initializeApp();

const MODEL = 'claude-haiku-5-5';
const FORECAST_TTL_MS = 10 * 60 * 1000;
const SUMMARY_TTL_MS = 30 * 60 * 1000;
const KEYS_TTL_MS = 5 * 60 * 1000;

const ALLOWED_ORIGINS = [
  /^https:\/\/josh-cocciardi-weather\.(web\.app|firebaseapp\.com)$/,
  /^http:\/\/localhost(:\d+)?$/,
];

// ── Keys ────────────────────────────────────────────────────────────────────
// Read from Firestore, falling back to env vars for the local emulator.
let keysCache = null;
const readKeys = async () => {
  if (keysCache && Date.now() - keysCache.at < KEYS_TTL_MS) return keysCache.keys;
  let data = {};
  try {
    const snap = await getFirestore().collection('weather_secrets').doc('keys').get();
    if (snap.exists) data = snap.data();
  } catch (err) {
    console.error('Could not read weather_secrets/keys', err.message);
  }
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const keys = {
    pirateWeather: clean(data.pirateWeatherKey) || clean(process.env.PIRATE_WEATHER_KEY),
    anthropic: clean(data.anthropicKey) || clean(process.env.ANTHROPIC_API_KEY),
  };
  keysCache = { at: Date.now(), keys };
  return keys;
};

// ── Small per-instance caches and limits ────────────────────────────────────
// Good enough for a personal app: a burst from one visitor is capped, and
// people looking at the same place share a forecast and its summaries.
const cache = new Map();
const cached = (key, ttl) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  cache.delete(key);
  return undefined;
};
const remember = (key, value) => {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
};

const hits = new Map();
const overLimit = (bucket, ip, max, windowMs) => {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) hits.delete(hits.keys().next().value);
  return recent.length > max;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const parseCoord = (value, limit) => {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) throw new HttpError(400, 'bad_coordinates');
  return n;
};

// About 1 km of rounding, so nearby requests share a cache entry and the
// exact spot someone is standing never reaches the weather provider.
const coordKey = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

const getForecast = async (lat, lon) => {
  const key = `forecast:${coordKey(lat, lon)}`;
  const hit = cached(key, FORECAST_TTL_MS);
  if (hit) return hit;

  const { pirateWeather } = await readKeys();
  if (!pirateWeather) throw new HttpError(503, 'no_weather_key');

  const url = `https://api.pirateweather.net/forecast/${encodeURIComponent(pirateWeather)}/${lat.toFixed(4)},${lon.toFixed(4)}?exclude=hrrr`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Pirate Weather error', res.status, (await res.text()).slice(0, 200));
    throw new HttpError(502, 'weather_unavailable');
  }
  return remember(key, await res.json());
};

const writeSummary = async ({ timeframe, forecast, name, personality }) => {
  const { anthropic } = await readKeys();
  if (!anthropic) return { summary: fallbackSummary(timeframe, forecast), fallback: true };

  const client = new Anthropic({ apiKey: anthropic, maxRetries: 1, timeout: 20000 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // A 30-word blurb needs very little reasoning.
      output_config: { effort: 'low' },
      system: `You are an AI assistant that writes short weather summaries. Reply with the summary only. ${getPersonalityPrompt(personality)}`.trim(),
      messages: [{ role: 'user', content: buildPrompt(timeframe, forecast, name) }],
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    if (response.stop_reason === 'refusal' || !text) {
      return { summary: fallbackSummary(timeframe, forecast), fallback: true };
    }
    return { summary: text, fallback: false };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('Claude error', err.status, err.message);
    } else {
      console.error('Claude call failed', err);
    }
    return { summary: fallbackSummary(timeframe, forecast), fallback: true };
  }
};

// ── Routes ──────────────────────────────────────────────────────────────────
const forecastRoute = async (req) => {
  const lat = parseCoord(req.query.lat, 90);
  const lon = parseCoord(req.query.lon, 180);
  return getForecast(lat, lon);
};

const summaryRoute = async (req) => {
  const body = req.body || {};
  const lat = parseCoord(body.lat, 90);
  const lon = parseCoord(body.lon, 180);
  const timeframe = TIMEFRAMES.includes(body.timeframe) ? body.timeframe : null;
  if (!timeframe) throw new HttpError(400, 'bad_timeframe');
  const personality = isPersonality(body.personality) ? body.personality : 'default';
  // The name is only context for the prompt; keep it short and plain.
  const name = String(body.name || '').replace(/[^\p{L}\p{N} ,.'-]/gu, '').slice(0, 80).trim();

  const forecast = await getForecast(lat, lon);
  const key = `summary:${coordKey(lat, lon)}:${forecast.currently.time}:${timeframe}:${personality}:${name}`;
  const hit = cached(key, SUMMARY_TTL_MS);
  if (hit) return hit;

  const result = await writeSummary({ timeframe, forecast, name, personality });
  // Don't hold on to a fallback; the next try may reach Claude.
  return result.fallback ? result : remember(key, result);
};

const api = onRequest({ region: 'us-central1', maxInstances: 3, memory: '256MiB' }, async (req, res) => {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const ip = (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim();
  const path = req.path.replace(/^\/api/, '');

  try {
    if (path === '/forecast' && req.method === 'GET') {
      if (overLimit('forecast', ip, 60, 10 * 60 * 1000)) throw new HttpError(429, 'slow_down');
      return res.set('Cache-Control', 'private, max-age=300').json(await forecastRoute(req));
    }
    if (path === '/summary' && req.method === 'POST') {
      if (overLimit('summary', ip, 40, 10 * 60 * 1000)) throw new HttpError(429, 'slow_down');
      return res.json(await summaryRoute(req));
    }
    throw new HttpError(404, 'not_found');
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
    console.error('weather-api failed', err);
    return res.status(500).json({ error: 'internal' });
  }
});

exports.weather = { api };
