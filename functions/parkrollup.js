// ---------------------------------------------------------------------------
// Park Planner: rolling the wait archive up into something a phone can read.
//
// Pure. No requires beyond the date helper, no Firestore, no network.
//
// The archive is one document per park-day: 399 days x 4 parks, each holding
// every ride's figures for that day. That is the right shape to write and the
// wrong shape to read. A history screen wants "this ride across the year",
// which is a column through 399 documents, and a browser is not going to make
// 399 reads to draw one chart.
//
// So each park gets two rollup documents, built here and written by
// parkhistory.js whenever the archive changes:
//
//   park_rollups/{park}        the park's own daily medians. A few KB, so the
//                              screen can open on it immediately.
//   park_rollups/{park}_rides  every ride's daily series. Around 200KB, so it
//                              is fetched only when someone opens a ride.
//
// Series are stored as comma-separated strings, not arrays of numbers. Both
// the REST API and the client SDKs put a type wrapper round every value, so
// {"integerValue":"15"} per day would turn 1.6KB of numbers into 20KB of
// JSON. One string per series costs one wrapper. Empty between commas is a
// day with no figure, which is not the same as a zero and must not become
// one.
//
// Days are positional: index 0 is `from`, and every day up to `to` has a
// slot whether or not the archive has it. That keeps a series parseable
// without carrying its own dates, and survives a gap.
// ---------------------------------------------------------------------------

'use strict';

const { addDays } = require('./parkdaily');

/* ── series ────────────────────────────────────────────────────────────── */

const encodeSeries = (values) => values
  .map((v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''))
  .join(',');

const decodeSeries = (text) => (typeof text === 'string' && text.length
  ? text.split(',').map((t) => (t === '' ? null : Number(t)))
  : []);

/* Trailing empties carry no information, and a ride that stopped reporting
 * months ago would otherwise pay for every day since. Leading ones have to
 * stay: they are what makes the series positional.
 */
const trimTail = (text) => text.replace(/,+$/, '');

/* ── days ──────────────────────────────────────────────────────────────── */

function dayCount(from, to) {
  if (!from || !to || to < from) return 0;
  let n = 1;
  for (let d = from; d < to; d = addDays(d, 1)) n++;
  return n;
}

function dayIndex(from, date) {
  if (!from || !date || date < from) return -1;
  let i = 0;
  for (let d = from; d < date; d = addDays(d, 1)) { i++; if (i > 20000) return -1; }
  return i;
}

/* ── the rollup ────────────────────────────────────────────────────────────
 *
 * Takes the park's archive documents in any order and returns both rollups.
 * A ride is kept if it ever posted a wait: an attraction that only ever
 * reported "open" is a row in the daily archive and noise in a chart.
 *
 * The name is whatever the ride was called on the most recent day it appears,
 * because that is the one a reader will recognise.
 */
function build(park, docs) {
  const rows = (docs || [])
    .filter((d) => d && typeof d.date === 'string' && d.index)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!rows.length) return null;

  const from = rows[0].date;
  const to = rows[rows.length - 1].date;
  const days = dayCount(from, to);

  const parkP50 = new Array(days).fill(null);
  const parkP90 = new Array(days).fill(null);
  const parkWaits = new Array(days).fill(null);

  // id -> { n, p50[], p90[], seen }
  const rides = new Map();

  for (const row of rows) {
    const i = dayIndex(from, row.date);
    if (i < 0 || i >= days) continue;

    parkP50[i] = num(row.index.p50);
    parkP90[i] = num(row.index.p90);
    parkWaits[i] = num(row.index.waits);

    for (const [id, r] of Object.entries(row.rides || {})) {
      if (!r) continue;
      let slot = rides.get(id);
      if (!slot) {
        slot = { n: '', p50: new Array(days).fill(null), p90: new Array(days).fill(null), waits: 0 };
        rides.set(id, slot);
      }
      // Later rows win the name, and rows are sorted, so this ends on the
      // most recent spelling.
      if (typeof r.n === 'string' && r.n) slot.n = r.n;
      const p50 = num(r.p50);
      if (p50 !== null) slot.waits++;
      slot.p50[i] = p50;
      slot.p90[i] = num(r.p90);
    }
  }

  const ridesOut = {};
  for (const [id, slot] of rides) {
    if (!slot.waits) continue;  // never posted a wait: nothing to plot
    ridesOut[id] = {
      n: slot.n || id,
      p50: trimTail(encodeSeries(slot.p50)),
      p90: trimTail(encodeSeries(slot.p90)),
    };
  }

  return {
    park,
    from,
    to,
    days,
    index: {
      p50: trimTail(encodeSeries(parkP50)),
      p90: trimTail(encodeSeries(parkP90)),
      waits: trimTail(encodeSeries(parkWaits)),
    },
    rides: ridesOut,
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

module.exports = { encodeSeries, decodeSeries, trimTail, dayCount, dayIndex, build };
