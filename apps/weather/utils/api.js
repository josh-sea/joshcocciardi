import { Platform } from 'react-native';

// The forecast and the AI summaries come from the weather-api Cloud Function,
// which holds the API keys. In production it is served from the same origin
// at /api/*. A local dev server (localhost:8081) or a native build has no
// such route, so those talk to the deployed site unless EXPO_PUBLIC_API_BASE
// points somewhere else (the functions emulator, for example).
const PRODUCTION = 'https://josh-cocciardi-weather.web.app';

const isLocalWeb =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

const BASE = process.env.EXPO_PUBLIC_API_BASE || (Platform.OS !== 'web' || isLocalWeb ? PRODUCTION : '');

const request = async (path, options) => {
  const res = await fetch(`${BASE}/api${path}`, options);
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = (await res.json()).error || code;
    } catch (e) {
      // not JSON; keep the status code
    }
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return res.json();
};

export const fetchForecast = (latitude, longitude) =>
  request(`/forecast?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);

export const fetchSummary = ({ latitude, longitude, name, timeframe, personality }) =>
  request('/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: latitude, lon: longitude, name, timeframe, personality }),
  });
