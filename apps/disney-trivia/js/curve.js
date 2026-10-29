/* The shape of a ride's day, and whether right now is a good moment.
 *
 * The API ships an hourly wait forecast per ride, which is the same thing
 * Google's "popular times" bars are: what this ride usually does at each
 * hour. Drawn rather than reduced to a single suggestion, it lets you make
 * the call yourself, which is the point. The planner's own ranking is still
 * there for when you would rather not.
 *
 * The useful signal on top is the gap between the curve and the board: a
 * ride posting 25 when its own curve says 50 is having an unusually quiet
 * spell, and that is worth being told about while it lasts.
 *
 * Pure, so all of it runs in node.
 */

import { forecastAt } from './park.js';

/* ── reading the curve ───────────────────────────────────────────────────── */

export function points(forecast) {
  if (!Array.isArray(forecast)) return [];
  return forecast
    .map((f) => ({ t: new Date(f.time).getTime(), waitMin: f.waitTime, pct: f.percentage }))
    .filter((p) => Number.isFinite(p.t) && typeof p.waitMin === 'number')
    .sort((a, b) => a.t - b.t);
}

export const hasCurve = (forecast) => points(forecast).length >= 2;

/* Render-ready bars.
 *
 * Heights are relative to the ride's own busiest hour rather than to any
 * absolute scale, because the question each chart answers is "when is this
 * ride worth doing", not "is this ride busier than that one". A 20-minute
 * ride and a 90-minute one both deserve a readable shape.
 */
export function bars(forecast, now = Date.now()) {
  const pts = points(forecast);
  if (!pts.length) return [];
  const peak = Math.max(...pts.map((p) => p.waitMin), 1);
  const t = now instanceof Date ? now.getTime() : now;

  // The bar "now" sits in is the latest one at or before this moment.
  let nowAt = -1;
  pts.forEach((p, i) => { if (p.t <= t) nowAt = i; });

  return pts.map((p, i) => ({
    t: p.t,
    waitMin: p.waitMin,
    rel: Math.max(0.06, p.waitMin / peak),   // never a zero-height sliver
    isNow: i === nowAt,
    isPast: i < nowAt,
  }));
}

/* The quietest hours still to come. What you actually want from the chart:
 * not "when is it busy" but "when should I come back".
 */
export function bestAhead(forecast, now = Date.now(), count = 2) {
  const t = now instanceof Date ? now.getTime() : now;
  const ahead = points(forecast).filter((p) => p.t > t);
  if (!ahead.length) return [];
  return [...ahead]
    .sort((a, b) => a.waitMin - b.waitMin || a.t - b.t)
    .slice(0, count)
    .sort((a, b) => a.t - b.t);
}

export function peak(forecast) {
  const pts = points(forecast);
  if (!pts.length) return null;
  return pts.reduce((worst, p) => (p.waitMin > worst.waitMin ? p : worst), pts[0]);
}

/* How much of the rest of the day the curve actually covers.
 *
 * It usually stops before closing time, and a chart that quietly ends at
 * five while the park runs to ten invites the wrong conclusion about the
 * evening. Better to say so.
 */
export function coversUntil(forecast) {
  const pts = points(forecast);
  return pts.length ? pts[pts.length - 1].t : null;
}

/* ── is now a good moment ────────────────────────────────────────────────── */

/* A ride has to be posting meaningfully under its own curve before this says
 * anything. Two thresholds, both needed:
 *
 *   the ratio, so a 25 against a 50 counts and a 25 against a 28 does not;
 *   a floor on the expected wait, so a 3 against a 6 is not announced as a
 *   rare opportunity. Short queues wobble by more than they mean.
 */
export const BETTER_AT = 0.7;
export const WORSE_AT = 1.4;
export const MIN_EXPECTED = 12;

export function verdict(liveMin, forecast, now = Date.now()) {
  const expected = forecastAt(forecast, now instanceof Date ? now : new Date(now));
  const hasLive = typeof liveMin === 'number' && liveMin >= 0;
  if (!hasLive || typeof expected !== 'number') {
    return { state: 'unknown', expected: null, liveMin: hasLive ? liveMin : null, ratio: null };
  }
  const base = { expected, liveMin, ratio: expected > 0 ? liveMin / expected : null };

  if (expected < MIN_EXPECTED) return { ...base, state: 'normal' };
  if (liveMin <= expected * BETTER_AT) return { ...base, state: 'better' };
  if (liveMin >= expected * WORSE_AT) return { ...base, state: 'worse' };
  return { ...base, state: 'normal' };
}

/* The sentence that goes under the chart. Says the two numbers, because the
 * comparison is the whole of the claim and hiding it behind a colour asks
 * you to take it on trust.
 */
export function verdictWords(v) {
  if (!v || v.state === 'unknown') return '';
  const e = Math.round(v.expected);
  const l = Math.round(v.liveMin);
  if (v.state === 'better') return `Posting ${l} against ${e} usual. Go now.`;
  if (v.state === 'worse') return `Posting ${l} against ${e} usual. Busier than it should be.`;
  return `Posting ${l}, about the ${e} you would expect.`;
}

/* ── the board ───────────────────────────────────────────────────────────── */

/* Every ride worth dropping what you are doing for, best first.
 *
 * Ranked by how many minutes you actually save rather than by the ratio: a
 * headliner 40 minutes under its curve matters more than a kiddie ride 8
 * under its own, even though the second is the bigger proportion.
 */
export function rightNow(rides, live, now = Date.now()) {
  const out = [];
  for (const ride of rides || []) {
    if (!ride.queued) continue;
    const l = (live || {})[ride.id];
    if (!l || l.status !== 'OPERATING') continue;
    const v = verdict(l.waitMin, l.forecast, now);
    if (v.state !== 'better') continue;
    out.push({ ...ride, ...v, saves: v.expected - v.liveMin });
  }
  return out.sort((a, b) => b.saves - a.saves);
}
