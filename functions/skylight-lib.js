// Pure helpers for the Skylight proxy (functions/skylight.js), kept apart so
// node can test them without firebase-functions installed.

const HOST = 'app.ourskylight.com';
// Fixed: the categories ride along so events come back with names and colours.
const INCLUDE = 'categories,calendar_account,event_notification_setting';
const MAX_DAYS = 93;

class BadInput extends Error {}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const frameId = (v) => {
  const s = String(v ?? '').trim();
  if (!/^\d{1,12}$/.test(s)) throw new BadInput('The frame id is the number in the Skylight URL, after /frames/.');
  return s;
};

const timezone = (v) => {
  const s = String(v || 'America/New_York');
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(s) || s.length > 48) throw new BadInput('Unknown time zone.');
  return s;
};

/** The upstream URL. Fixed host and path; only digits and checked dates go in. */
const eventsUrl = ({ frame, dateMin, dateMax, tz }) => {
  if (!isDate(dateMin) || !isDate(dateMax)) throw new BadInput('Dates must look like 2026-11-01.');
  if (dateMax < dateMin) throw new BadInput('date_max is before date_min.');
  const days = (Date.parse(dateMax) - Date.parse(dateMin)) / 86400000;
  if (days > MAX_DAYS) throw new BadInput(`Ask for ${MAX_DAYS} days or fewer at a time.`);
  const url = new URL(`https://${HOST}/api/frames/${frameId(frame)}/calendar_events`);
  url.searchParams.set('date_min', dateMin);
  url.searchParams.set('date_max', dateMax);
  url.searchParams.set('timezone', timezone(tz));
  url.searchParams.set('include', INCLUDE);
  return url.toString();
};

/**
 * The Authorization header. People paste the bare token, or the whole header
 * value copied from developer tools ("Bearer …" or "Basic …"); keep the
 * scheme they copied, default to Bearer.
 */
const authHeader = (raw) => {
  let s = String(raw ?? '').trim().replace(/^authorization:\s*/i, '');
  if (!s) throw new BadInput('Paste the token.');
  if (s.length > 4096 || /[\r\n]/.test(s)) throw new BadInput('That does not look like a token.');
  if (/^(bearer|basic|token)\s+/i.test(s)) {
    const [scheme, ...rest] = s.split(/\s+/);
    return `${scheme[0].toUpperCase()}${scheme.slice(1).toLowerCase()} ${rest.join(' ')}`;
  }
  return `Bearer ${s}`;
};

/** A hint at which token is stored, never the token itself. */
const hint = (header) => {
  const tok = header.split(/\s+/).pop();
  return tok.length > 8 ? `…${tok.slice(-4)}` : '…';
};

module.exports = { HOST, INCLUDE, MAX_DAYS, BadInput, eventsUrl, authHeader, hint, frameId, timezone };
