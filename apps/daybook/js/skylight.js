/* Turning a Skylight calendar response into Daybook events.
 *
 * Skylight's web app talks to a JSON:API style backend: a response has a
 * `data` array of `calendar_event` records with `attributes`, and an
 * `included` array that carries the categories (the people: Josh, Ash,
 * the kids) with a label and colour. This reads that shape, and is
 * forgiving about field names so a slightly different payload (or a
 * plain array of events) still imports.
 *
 * Nothing here talks to the network. The page takes JSON the user
 * copied out of their browser's developer tools; a live sync can feed
 * the same function later.
 */

import { dateKey, pad, addDays } from './time.js';

const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k];
  return undefined;
};

const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** A date-only string ("2026-11-16") is a local day, not UTC midnight. */
const isDateOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const toLocal = (v) => {
  if (v == null) return null;
  if (isDateOnly(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const categoryOf = (rec) => {
  const rel = rec.relationships || {};
  const one = rel.category?.data || rel.categories?.data?.[0];
  if (one?.id) return String(one.id);
  const a = rec.attributes || rec;
  const ids = pick(a, 'category_ids', 'categoryIds');
  if (Array.isArray(ids) && ids.length) return String(ids[0]);
  const id = pick(a, 'category_id', 'categoryId');
  return id != null ? String(id) : null;
};

/** Read a Skylight payload. Returns { events, calendars, from, to, skipped }. */
export const fromSkylight = (payload, { fallbackColor = '#868e96' } = {}) => {
  const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const records = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
  const included = Array.isArray(body?.included) ? body.included : [];

  const calendars = [];
  const seenCal = new Set();
  const addCal = (id, name, color) => {
    const cid = `sky-${id}`;
    if (seenCal.has(cid)) return cid;
    seenCal.add(cid);
    calendars.push({ id: cid, name: name || `Skylight ${id}`, color: color || fallbackColor, source: 'skylight' });
    return cid;
  };
  for (const inc of included) {
    if (!/categor/i.test(inc.type || '')) continue;
    const a = inc.attributes || {};
    addCal(inc.id, pick(a, 'label', 'name', 'title'), pick(a, 'color', 'colour', 'hex'));
  }

  const events = [];
  let skipped = 0, from = null, to = null;
  for (const rec of records) {
    if (rec.type && !/event/i.test(rec.type)) continue;
    const a = rec.attributes || rec;
    const start = toLocal(pick(a, 'starts_at', 'start_at', 'start', 'start_time', 'startsAt'));
    if (!start) { skipped++; continue; }
    let end = toLocal(pick(a, 'ends_at', 'end_at', 'end', 'end_time', 'endsAt'));
    const allDay = Boolean(pick(a, 'all_day', 'allDay', 'is_all_day')) ||
      isDateOnly(pick(a, 'starts_at', 'start'));
    const catId = categoryOf(rec);
    const cal = catId ? addCal(catId) : addCal('shared', 'Skylight');
    const date = dateKey(start);
    const ev = {
      id: `sky-${rec.id ?? `${date}-${events.length}`}-${date}`,
      sourceId: rec.id != null ? String(rec.id) : null,
      source: 'skylight',
      cal,
      title: String(pick(a, 'summary', 'title', 'name') || '(no title)'),
      date,
      allDay,
      notes: pick(a, 'description', 'notes') || '',
      location: pick(a, 'location') || '',
    };
    if (allDay) {
      // All-day ends are exclusive: an event on the 16th ends at the 17th.
      if (end) {
        const last = addDays(dateKey(end), dateKey(end) > date ? -1 : 0);
        if (last > date) ev.endDate = last;
      }
    } else {
      ev.start = hhmm(start);
      if (!end || end <= start) end = new Date(start.getTime() + 30 * 60000);
      // An event running past midnight is cut at the end of its first day.
      ev.end = dateKey(end) === date ? hhmm(end) : '23:59';
    }
    events.push(ev);
    const last = ev.endDate || date;
    if (!from || date < from) from = date;
    if (!to || last > to) to = last;
  }
  return { events, calendars, from, to, skipped };
};

/**
 * Read a HAR file (DevTools → Network → "Save all as HAR") and import
 * every calendar response in it. The HAR carries the session cookie in
 * its request headers; this only reads response bodies and never keeps
 * the file.
 */
export const fromHar = (har, opts) => {
  const log = (typeof har === 'string' ? JSON.parse(har) : har)?.log;
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  const merged = { events: [], calendars: [], from: null, to: null, skipped: 0, responses: 0, urls: [] };
  const seen = new Set();
  for (const e of entries) {
    const url = e.request?.url || '';
    if (!/calendar_?events|\/events\b/i.test(url)) continue;
    const c = e.response?.content;
    if (!c?.text) continue;
    let text = c.text;
    if (c.encoding === 'base64') {
      try { text = typeof atob === 'function' ? decodeURIComponent(escape(atob(text))) : Buffer.from(text, 'base64').toString('utf8'); }
      catch { continue; }
    }
    let got;
    try { got = fromSkylight(text, opts); } catch { continue; }
    merged.responses++;
    merged.urls.push(url.split('?')[0]);
    merged.skipped += got.skipped;
    for (const ev of got.events) if (!seen.has(ev.id)) { seen.add(ev.id); merged.events.push(ev); }
    for (const cal of got.calendars) if (!merged.calendars.some((x) => x.id === cal.id)) merged.calendars.push(cal);
    if (got.from && (!merged.from || got.from < merged.from)) merged.from = got.from;
    if (got.to && (!merged.to || got.to > merged.to)) merged.to = got.to;
  }
  return merged;
};

/** A JSON paste or a HAR file: work out which and read it. */
export const readAny = (text, opts) => {
  const body = JSON.parse(text);
  return body?.log?.entries ? fromHar(body, opts) : { ...fromSkylight(body, opts), responses: 1 };
};
