/* Park Planner: the rules, with no DOM and no network in sight.
 *
 * Everything here is a pure function of its arguments, so the whole thing
 * runs in node under the test suite. The decision this code makes is "where
 * should we walk next", and getting it wrong costs an hour of a holiday, so
 * it is worth being able to prove it on fixtures rather than finding out in
 * a queue.
 *
 * The objective, set by the person who has to live with it: ride the most
 * things in the day. Not the least walking, not the fanciest rides. That
 * choice is why `score` divides value by total minutes spent rather than
 * subtracting a walk penalty.
 */

/* ── geography ───────────────────────────────────────────────────────────── */

const R_EARTH_M = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Straight-line metres between two coordinates.
export function haversine(a, b) {
  if (!a || !b) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
  /* An object without coordinates gives NaN here, and NaN is the dangerous
   * kind of wrong: it is not null, so it passes a null check, and it sorts
   * unpredictably rather than throwing. Every caller treats null as "no
   * answer", so say null. */
  return Number.isFinite(m) ? m : null;
}

/* Nobody walks in a straight line through a theme park: you go round a lagoon,
 * you follow a path, you wait to cross a parade route. A detour factor over
 * the straight-line distance is crude but it is honest about being crude, and
 * it is within a couple of minutes of the real thing at park scale. A proper
 * walkway graph is the next step; this is what makes the planner usable
 * without one.
 *
 * 1.45 is the ratio of real walking distance to straight-line distance that
 * fits Magic Kingdom's hub-and-spoke layout: a spoke-to-spoke trip is close
 * to a right-angle through the hub, which is a factor of about 1.41.
 */
export const DETOUR = 1.45;

// Metres per minute. A brisk adult does about 80; a family with a six-year-old
// and a stroller does not. This is a user setting for a reason.
export const DEFAULT_PACE = 67;

export function walkMinutes(from, to, pace = DEFAULT_PACE, detour = DETOUR) {
  const m = haversine(from, to);
  if (m === null || !(pace > 0)) return null;
  const min = (m * detour) / pace;
  return Number.isFinite(min) ? min : null;
}

/* ── waits ───────────────────────────────────────────────────────────────── */

/* What the wait will be when you get there, not what it is now.
 *
 * The live number is what is posted at the entrance this minute. The forecast
 * is the API's own hourly curve for the day. Walking to a ride takes five or
 * ten minutes, and on a morning when a headliner is climbing fast that is the
 * difference between a 35-minute wait and a 55-minute one.
 *
 * The blend leans on live for an arrival that is almost immediate and on the
 * forecast for one that is further out, crossing over at `horizon` minutes.
 * Below that line the posted number is simply better information.
 */
export const BLEND_HORIZON_MIN = 25;

export function blendWait(liveMin, forecastMin, minutesAway, horizon = BLEND_HORIZON_MIN) {
  const hasLive = typeof liveMin === 'number' && liveMin >= 0;
  const hasFc = typeof forecastMin === 'number' && forecastMin >= 0;
  if (!hasLive && !hasFc) return null;
  if (!hasFc) return liveMin;
  if (!hasLive) return forecastMin;
  const away = Math.max(0, Number(minutesAway) || 0);
  const w = Math.min(1, away / horizon);          // 0 = trust live, 1 = trust forecast
  return liveMin * (1 - w) + forecastMin * w;
}

/* Read the API's hourly forecast at a given moment, interpolating between the
 * two hours either side. The feed gives one number per hour; a plan made at
 * 10:50 should not be using the 10:00 number as though nothing had changed.
 */
export function forecastAt(forecast, when) {
  if (!Array.isArray(forecast) || !forecast.length) return null;
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!Number.isFinite(t)) return null;

  const pts = forecast
    .map((f) => ({ t: new Date(f.time).getTime(), v: f.waitTime }))
    .filter((f) => Number.isFinite(f.t) && typeof f.v === 'number')
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;

  if (t <= pts[0].t) return pts[0].v;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;

  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1], b = pts[i];
      const span = b.t - a.t;
      if (!span) return b.v;
      return a.v + ((b.v - a.v) * (t - a.t)) / span;
    }
  }
  return pts[pts.length - 1].v;
}

/* ── today versus the forecast ─────────────────────────────────────────────
 *
 * The API's hourly forecast is a seasonal average: what this ride usually
 * does on a day like today. It knows nothing about today in particular.
 * Half term, a downpour at eleven, a ride down all morning pushing its
 * queue onto the ride next door: on any of those the whole park runs hot
 * or cold against the curve, all day.
 *
 * So compare what is posted now with what the forecast said for now, and
 * carry that ratio forward. It needs no history at all, which is the point:
 * it works on day one and it works on a day nothing in the archive looks
 * like.
 *
 * Shape from the forecast, level from this morning. At arrival = now the
 * correction reproduces the posted wait exactly, so nothing is lost near to
 * hand and the curve beyond it is lifted or dropped to match the day.
 */

// A ratio outside this is not a busy day, it is bad data or a broken ride.
export const RATIO_MIN = 0.5;
export const RATIO_MAX = 2.0;

/* Small forecasts make wild ratios: a ride forecast at 5 and posting 40 is
 * an 8x that says nothing about the afternoon. Weight a ride's own evidence
 * by the size of the number it is based on, and lean on the park-wide ratio
 * for the rest. Ten minutes is where a ride's own ratio starts to be worth
 * about as much as the park's.
 */
export const RATIO_HALF_WEIGHT_MIN = 10;

export function clampRatio(r) {
  /* Zero is allowed through and clamped up, because a posted wait of zero
   * is a walk-on: a real observation that today is running cold, not a
   * missing one. Rejecting it threw that away. Only a negative or a
   * non-number is nonsense. */
  if (!Number.isFinite(r) || r < 0) return null;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, r));
}

// One ride's ratio of posted to forecast, right now. Null when either is missing.
export function ratioFor(liveMin, forecastNowMin) {
  if (typeof liveMin !== 'number' || liveMin < 0) return null;
  if (typeof forecastNowMin !== 'number' || forecastNowMin <= 0) return null;
  return clampRatio(liveMin / forecastNowMin);
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/* How the park as a whole is running against its forecast.
 *
 * The median rather than the mean, because one ride breaking down and
 * dumping 90 minutes onto its queue should not drag the whole park's
 * number with it. Needs a few rides reporting before it will say anything:
 * two rides is an anecdote.
 */
export const RATIO_MIN_SAMPLE = 4;

export function parkRatio(rides, live, now) {
  const ratios = [];
  for (const ride of rides || []) {
    const l = (live || {})[ride.id];
    if (!l || l.status !== STATUS_OPEN) continue;
    const r = ratioFor(l.waitMin, forecastAt(l.forecast, now));
    if (r !== null) ratios.push(r);
  }
  if (ratios.length < RATIO_MIN_SAMPLE) return { ratio: 1, sample: ratios.length };
  return { ratio: median(ratios), sample: ratios.length };
}

/* A ride's working ratio: its own, pulled toward the park's by however
 * little its own evidence is worth.
 */
export function blendRatio(rideRatio, park = 1, forecastNowMin = 0) {
  if (rideRatio === null || rideRatio === undefined) return clampRatio(park) ?? 1;
  const base = Math.max(0, Number(forecastNowMin) || 0);
  const w = base / (base + RATIO_HALF_WEIGHT_MIN);   // 0 = trust the park, 1 = trust the ride
  return clampRatio(park * (1 - w) + rideRatio * w) ?? 1;
}

/* The forecast for a moment, corrected for how today is actually going. */
export function correctedForecastAt(forecast, when, ratio = 1) {
  const raw = forecastAt(forecast, when);
  if (raw === null) return null;
  const r = clampRatio(ratio) ?? 1;
  return raw * r;
}

/* How much worse this ride gets if you leave it for later. A ride at its
 * daily low is urgent in a way that a ride already past its peak is not: you
 * can come back to the second one, and the first one you cannot.
 *
 * Returns a multiplier around 1: above 1 means "go now", below means "later
 * is fine".
 */
export function urgency(forecast, when, nowWait, lookaheadMin = 120) {
  const later = forecastAt(forecast, new Date(new Date(when).getTime() + lookaheadMin * 60000));
  const base = typeof nowWait === 'number' ? nowWait : forecastAt(forecast, when);
  if (typeof later !== 'number' || typeof base !== 'number') return 1;
  if (base <= 0) return later > 0 ? 1.3 : 1;
  const ratio = later / base;
  /* Centred so that a ride whose wait does not move comes out at exactly 1
   * and changes nothing. Getting this wrong is invisible: every ride is
   * nudged by the same constant, the ordering looks fine, and the number
   * stops meaning what its name says.
   *
   * Clamped either side: a ride going from 5 minutes to 60 should not swamp
   * every other consideration, and nothing should be written off entirely.
   */
  return Math.min(1.6, Math.max(0.7, 0.65 + ratio * 0.35));
}

/* ── Lightning Lane ──────────────────────────────────────────────────────── */

/* A held Lightning Lane is a time you have promised to be somewhere. The
 * planner's job around one is to not send you somewhere you cannot get back
 * from, and to not send you to a ride you are about to skip the queue for.
 *
 * Windows are entered by hand. Nothing here touches a Disney account.
 */
export function holdsFor(llWindows, attractionId, when) {
  const t = new Date(when).getTime();
  return (llWindows || []).some(
    (w) => w.attractionId === attractionId && t <= new Date(w.end).getTime()
  );
}

/* Would doing this ride make you late for a Lightning Lane you hold?
 *
 * finish = when you would be walking away from this ride. From there you
 * still have to walk to the Lightning Lane's ride, so the check is against
 * the window's end minus that walk, not against the window's end.
 */
export function collidesWithLL(finish, llWindows, rideById, from, pace) {
  const t = new Date(finish).getTime();
  for (const w of llWindows || []) {
    const end = new Date(w.end).getTime();
    if (end < t) continue;                      // window already gone
    const target = rideById(w.attractionId);
    const walk = target ? walkMinutes(from, target, pace) : 0;
    const mustLeaveBy = end - (walk || 0) * 60000;
    if (t > mustLeaveBy) return w;
  }
  return null;
}

/* ── scoring ─────────────────────────────────────────────────────────────── */

/* What marking something a must-do is worth, in ordinary rides.
 *
 * The objective is most rides in the day, so a must-do has to pay for itself
 * against throughput: Space Mountain at a 35-minute wait costs about four
 * trips round Dumbo, and at 2.2 it lost to Dumbo every time. Five is the
 * honest statement of the preference, which is "I would give up most of an
 * hour of other rides rather than miss this one".
 *
 * It is still a thumb on the scale and not a guarantee. A must-do with a
 * 120-minute wait will lose to a cluster of walk-ons, which is the right
 * answer at 2pm and the wrong one at 8pm. Ordering by urgency is what stops
 * that becoming a problem: a headliner is at its most urgent early, which is
 * when the planner pushes hardest for it.
 */
export const MUST_DO_BOOST = 5;

/* One candidate, scored.
 *
 * value / minutes, which is rides-per-hour by another name. A must-do is
 * worth more than twice an ordinary ride, and a ride about to get much worse
 * is worth more than one that will still be there at four o'clock.
 *
 * `minutes` is the whole commitment: walking there, queueing, and riding. A
 * 5-minute wait ten minutes' walk away and a 15-minute wait next door cost
 * the same, which is exactly the trade a planner should be making.
 */
export function scoreCandidate(c) {
  const minutes = (c.walkMin || 0) + (c.waitMin || 0) + (c.rideMin || 0);
  if (!(minutes > 0)) return 0;
  const must = c.mustDo ? MUST_DO_BOOST * (c.pressure || 1) : 1;
  const value = must * (c.value || 1) * (c.urgency || 1);
  return value / minutes;
}

/* How hard to push an unridden must-do, given how much day is left.
 *
 * A fixed multiplier cannot do this job. The objective is most rides in the
 * day, so at 9am a 10-minute walk-on genuinely does beat an 80-minute
 * headliner: you get the walk-on and the headliner is still there. But run
 * that argument all day and you go home at 10pm without riding the thing you
 * came for, because there is always something shorter nearby.
 *
 * A must-do is a deadline, not a weight. So: work out how much time the
 * remaining must-dos actually need, compare it with how much day is left,
 * and let the pressure rise as that slack runs out. Early on this is close
 * to 1 and changes nothing. Late on it dominates, which is exactly when it
 * should.
 *
 * Eased rather than linear so it stays out of the way until it matters and
 * then bites hard.
 */
export const PRESSURE_MAX = 6;
export const PRESSURE_EASY_SLACK = 3;   // this much slack and there is no hurry

export function mustDoPressure(timeLeftMin, neededMin) {
  if (!(neededMin > 0)) return 1;
  if (!Number.isFinite(timeLeftMin)) return 1;    // closing time unknown: no opinion
  if (timeLeftMin <= 0) return PRESSURE_MAX;
  const slack = timeLeftMin / neededMin;
  if (slack >= PRESSURE_EASY_SLACK) return 1;
  if (slack <= 1) return PRESSURE_MAX;            // only just enough time, or not enough
  const t = (PRESSURE_EASY_SLACK - slack) / (PRESSURE_EASY_SLACK - 1);
  return 1 + t * t * (PRESSURE_MAX - 1);
}

/* What the must-dos you have not done yet will cost, roughly: their queue,
 * their ride, and a nominal walk between them. Rough is fine; this feeds a
 * ratio, not a schedule.
 */
export const NOMINAL_WALK_MIN = 8;

export function mustDoCost(rides, live, mustDo, done = []) {
  const doneSet = new Set(done);
  let total = 0;
  for (const id of mustDo || []) {
    if (doneSet.has(id)) continue;
    const ride = rides.find((r) => r.id === id);
    if (!ride) continue;
    const l = (live && live[id]) || {};
    const wait = typeof l.waitMin === 'number' ? l.waitMin : 30;
    total += wait + (ride.minutes || 6) + NOMINAL_WALK_MIN;
  }
  return total;
}

/* ── the plan ────────────────────────────────────────────────────────────── */

export const STATUS_OPEN = 'OPERATING';

/* Build the candidate list for one moment.
 *
 * `rides` are the park's attractions with coordinates and durations.
 * `live` maps attraction id to { status, waitMin, forecast }.
 * `state` is what we know about the day: where you are, what you have done,
 * what you must do, which Lightning Lanes you hold.
 */
export function candidates(rides, live, state) {
  const {
    from, now = new Date(), pace = DEFAULT_PACE,
    done = [], mustDo = [], llWindows = [], skipHeld = true,
    maxWaitMin = null, values = {}, closing = null,
  } = state || {};

  const doneSet = new Set(done);
  const mustSet = new Set(mustDo);
  const byId = (id) => rides.find((r) => r.id === id) || null;
  const nowMs = new Date(now).getTime();

  // How hard the remaining must-dos are pushing, worked out once for the
  // whole list rather than per candidate.
  const timeLeft = closing ? (new Date(closing).getTime() - nowMs) / 60000 : Infinity;
  const pressure = mustDoPressure(timeLeft, mustDoCost(rides, live, mustDo, done));

  // How the park is running against its forecast today, also once.
  const today = parkRatio(rides, live, now);

  const out = [];
  for (const ride of rides) {
    if (!ride.queued) continue;                      // walk-through, no queue
    if (doneSet.has(ride.id)) continue;

    const l = live[ride.id] || {};
    if (l.status && l.status !== STATUS_OPEN) continue;

    /* A ride you hold a Lightning Lane for is handled by the Lightning Lane,
     * not by standing in its queue. Overridable, because riding something
     * twice is a perfectly good reason to queue for it anyway.
     */
    if (skipHeld && holdsFor(llWindows, ride.id, now)) continue;

    const walkMin = walkMinutes(from, ride, pace);
    if (walkMin === null) continue;
    const arrival = new Date(nowMs + walkMin * 60000);

    /* Correct the forecast for today before leaning on it. The blend then
     * still trusts the posted number for an arrival that is almost
     * immediate, because that is a measurement and this is an inference.
     */
    const fcNow = forecastAt(l.forecast, now);
    const ratio = blendRatio(ratioFor(l.waitMin, fcNow), today.ratio, fcNow);
    const fc = correctedForecastAt(l.forecast, arrival, ratio);
    const waitMin = blendWait(l.waitMin, fc, walkMin);
    if (waitMin === null) continue;
    if (maxWaitMin !== null && waitMin > maxWaitMin && !mustSet.has(ride.id)) continue;

    const rideMin = ride.minutes || 6;
    const finish = new Date(arrival.getTime() + (waitMin + rideMin) * 60000);

    const clash = collidesWithLL(finish, llWindows, byId, ride, pace);
    if (clash) continue;

    const cand = {
      id: ride.id,
      name: ride.name,
      /* Carried so a candidate can be the starting point of the next step.
       * Without these, planAhead's `from: c` has no coordinates, every walk
       * in the chain comes out NaN, and the look-ahead quietly ranks on
       * nothing at all. */
      lat: ride.lat,
      lng: ride.lng,
      walkMin,
      waitMin,
      rideMin,
      liveWaitMin: typeof l.waitMin === 'number' ? l.waitMin : null,
      forecastAtArrivalMin: typeof fc === 'number' ? fc : null,
      rawForecastAtArrivalMin: forecastAt(l.forecast, arrival),
      todayRatio: ratio,
      arrival,
      finish,
      mustDo: mustSet.has(ride.id),
      value: values[ride.id] || 1,
      urgency: urgency(l.forecast, now, l.waitMin),
      pressure: mustSet.has(ride.id) ? pressure : 1,
    };
    cand.score = scoreCandidate(cand);
    out.push(cand);
  }

  return out.sort((a, b) => b.score - a.score);
}

/* Look past the next move.
 *
 * Greedy picks the best single ride, which can walk you to the far corner of
 * the park for one good queue and leave you there. A shallow beam search
 * plays each of the top few options forward a couple of rides and keeps the
 * opening that leads somewhere good, which is what stops it stranding you.
 *
 * Depth 2 to 3 is enough. Deeper is guessing: the waits it would be reasoning
 * about are forecasts of forecasts.
 */
export function planAhead(rides, live, state, depth = 2, beam = 3) {
  const first = candidates(rides, live, state);
  if (!first.length || depth <= 1) return first.map((c) => ({ ...c, chain: [c], total: c.score }));

  const scored = first.slice(0, Math.max(beam, 3)).map((c) => {
    let total = c.score;
    const chain = [c];
    let cursor = { ...state, from: c, now: c.finish, done: [...(state.done || []), c.id] };

    for (let d = 1; d < depth; d++) {
      const next = candidates(rides, live, cursor)[0];
      if (!next) break;
      chain.push(next);
      // Later moves count for less: they rest on a forecast of a forecast.
      total += next.score * 0.6 ** d;
      cursor = { ...cursor, from: next, now: next.finish, done: [...cursor.done, next.id] };
    }
    return { ...c, chain, total };
  });

  // Anything outside the beam keeps its own score, so a strong single move is
  // never dropped simply because it was not explored.
  const rest = first.slice(Math.max(beam, 3)).map((c) => ({ ...c, chain: [c], total: c.score }));
  return [...scored, ...rest].sort((a, b) => b.total - a.total);
}

/* A line of plain English for why a suggestion is a suggestion. Shown on the
 * card: a planner you cannot argue with is a planner you stop trusting.
 */
export function explain(c) {
  const bits = [];
  bits.push(`${Math.round(c.walkMin)} min walk`);
  if (typeof c.liveWaitMin === 'number') {
    bits.push(`${Math.round(c.liveWaitMin)} min posted`);
  }
  if (typeof c.forecastAtArrivalMin === 'number' && typeof c.liveWaitMin === 'number'
      && Math.abs(c.forecastAtArrivalMin - c.liveWaitMin) >= 8) {
    bits.push(c.forecastAtArrivalMin > c.liveWaitMin
      ? `climbing to ${Math.round(c.forecastAtArrivalMin)}`
      : `easing to ${Math.round(c.forecastAtArrivalMin)}`);
  }
  // Only worth saying when the correction is big enough to have moved the
  // answer; a 5% nudge is noise and reads as false precision.
  if (typeof c.todayRatio === 'number' && Math.abs(c.todayRatio - 1) >= 0.2) {
    bits.push(c.todayRatio > 1 ? 'busier than usual today' : 'quieter than usual today');
  }
  if (c.mustDo) {
    bits.push((c.pressure || 1) >= 2.5
      ? 'must-do, and the day is running out'
      : 'on your must-do list');
  }
  if (c.urgency >= 1.25) bits.push('much worse later');
  else if (c.urgency <= 0.9) bits.push('fine later too');
  return bits.join(' · ');
}
