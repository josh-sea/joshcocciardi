/* Park Planner: the screen.
 *
 * Lazy-loaded the first time somebody opens the Planner tab, like the photo
 * game, so the ticket book still starts with no network at all.
 *
 * Everything that decides anything lives in park.js and is tested in node.
 * This file is wiring: read the catalogue, ask for live waits, put cards on
 * screen, and remember the day in localStorage so a dead phone battery or a
 * reload does not lose what you have ridden.
 */

import { planAhead, explain, parkRatio, DEFAULT_PACE } from './park.js';
import { bars, bestAhead, verdict, verdictWords, rightNow, hasCurve, coversUntil } from './curve.js';
import { liveFor, hoursFor, parkDate, parkClock, ageWords } from './parkdata.js';

const $ = (id) => document.getElementById(id);
const PARK_ORDER = ['mk', 'ep', 'hs', 'ak'];

let catalogue = null;     // the committed ride list
let park = 'mk';
let live = { rides: {}, age: Infinity, from: 'none' };
let hours = null;
let here = null;          // { lat, lng } from geolocation
let watchId = null;
let busy = false;

/* The day, kept in localStorage. Firestore would be nicer for sharing across
 * the family's phones, but it would also mean a sign-in and a network round
 * trip before you can tick off a ride, in a place with no signal. Local wins
 * for v1; the rules for park_plans are already in place for when it does not.
 */
const dayKey = () => `parkPlanner.day.${parkDate()}.${park}`;
const freshDay = () => ({ done: [], mustDo: [], llWindows: [], skipHeld: true, pace: DEFAULT_PACE, maxWaitMin: null });

let day = freshDay();

const loadDay = () => {
  try {
    const raw = localStorage.getItem(dayKey());
    day = raw ? { ...freshDay(), ...JSON.parse(raw) } : freshDay();
  } catch { day = freshDay(); }
};
const saveDay = () => {
  try { localStorage.setItem(dayKey(), JSON.stringify(day)); } catch { /* private mode */ }
};

/* ── where you are ───────────────────────────────────────────────────────── */

/* Without a location there is nothing to route from, so the planner falls
 * back to the park's centre and says so rather than refusing to work. Plenty
 * of the value (what is short right now, what is about to get worse) does not
 * depend on knowing where you are standing.
 */
function parkCentre() {
  const rides = (catalogue.parks[park] || {}).rides || [];
  if (!rides.length) return null;
  const lat = rides.reduce((n, r) => n + r.lat, 0) / rides.length;
  const lng = rides.reduce((n, r) => n + r.lng, 0) / rides.length;
  return { lat, lng, approximate: true };
}

function startWatching() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      paintWhere();
      render();
    },
    () => { paintWhere(); },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
  );
}

function paintWhere() {
  const el = $('pl-where');
  if (!el) return;
  if (here) {
    const acc = here.accuracy ? ` ±${Math.round(here.accuracy)}m` : '';
    el.textContent = `Using your location${acc}`;
    el.dataset.state = 'on';
  } else {
    el.textContent = 'Routing from the middle of the park. Tap to use your location.';
    el.dataset.state = 'off';
  }
}

/* ── loading ─────────────────────────────────────────────────────────────── */

async function refresh({ force = false } = {}) {
  if (busy) return;
  busy = true;
  $('pl-refresh').disabled = true;
  try {
    const [l, h] = await Promise.all([
      liveFor(park, { force }),
      hoursFor(park, parkDate(), { force }).catch(() => null),
    ]);
    live = l;
    hours = h;
    $('pl-error').textContent = '';
  } catch (err) {
    $('pl-error').textContent =
      'Could not reach the wait times, and nothing is cached for this park yet. ' + (err.message || err);
  } finally {
    busy = false;
    $('pl-refresh').disabled = false;
    render();
  }
}

/* ── rendering ───────────────────────────────────────────────────────────── */

function ridesHere() {
  return ((catalogue.parks[park] || {}).rides || []);
}

function statusLine() {
  const bits = [];
  bits.push(`Waits ${ageWords(live.age)}`);
  if (live.from === 'stale') bits.push('offline, showing the last we got');
  if (hours && hours.open) {
    bits.push(`${parkClock(hours.open)} to ${parkClock(hours.close)}`);
  }
  const d = day.done.length;
  if (d) bits.push(`${d} ridden`);
  return bits.join(' · ');
}

/* How today is running against the forecast, in one line.
 *
 * Worth showing rather than hiding inside the maths: it is the planner's
 * single biggest assumption about today, and if it says the park is 40%
 * quieter than usual while you are stood in a crowd, you know to stop
 * trusting the forecast-based numbers and read the posted ones instead.
 */
function todayLine() {
  const { ratio, sample } = parkRatio(ridesHere(), live.rides, new Date());
  const el = $('pl-today');
  if (!el) return;
  if (sample < 4 || Math.abs(ratio - 1) < 0.12) {
    el.textContent = '';
    el.removeAttribute('data-mood');
    return;
  }
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const hot = ratio > 1;
  el.textContent = hot
    ? `Running about ${pct}% busier than a normal day. Forecasts below are adjusted up to match.`
    : `Running about ${pct}% quieter than a normal day. Forecasts below are adjusted down to match.`;
  el.dataset.mood = hot ? 'hot' : 'cold';
}

function card(c, rank) {
  const el = document.createElement('article');
  el.className = 'pl-card';
  if (rank === 0) el.classList.add('top');

  const total = Math.round(c.walkMin + c.waitMin + c.rideMin);
  el.innerHTML = `
    <div class="pl-rank">${rank === 0 ? 'Next up' : `Option ${rank + 1}`}</div>
    <h3>${escapeHtml(c.name)}</h3>
    <div class="pl-nums">
      <span><b>${Math.round(c.walkMin)}</b> walk</span>
      <span><b>${Math.round(c.waitMin)}</b> queue</span>
      <span><b>${Math.round(c.rideMin)}</b> ride</span>
      <span class="pl-total"><b>${total}</b> min all in</span>
    </div>
    <p class="pl-why">${escapeHtml(explain(c))}</p>
  `;

  if (c.chain && c.chain.length > 1) {
    const then = document.createElement('p');
    then.className = 'pl-then';
    then.textContent = 'then ' + c.chain.slice(1).map((x) => x.name).join(', then ');
    el.append(then);
  }

  const row = document.createElement('div');
  row.className = 'pl-actions';

  const did = document.createElement('button');
  did.type = 'button';
  did.className = 'pl-did';
  did.textContent = 'Rode it';
  did.onclick = () => {
    day.done = [...new Set([...day.done, c.id])];
    saveDay();
    render();
  };

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = 'Not now';
  skip.onclick = () => {
    // A skip is for this round only: it drops to the back rather than being
    // marked done, because "not now" is not "never".
    skipped.add(c.id);
    render();
  };

  row.append(did, skip);
  el.append(row);
  return el;
}

const skipped = new Set();

function render() {
  if (!catalogue) return;
  $('pl-status').textContent = statusLine();
  todayLine();
  drawRightNow();

  const from = here || parkCentre();
  const state = {
    from,
    now: new Date(),
    pace: day.pace,
    done: day.done,
    mustDo: day.mustDo,
    llWindows: day.llWindows,
    skipHeld: day.skipHeld,
    maxWaitMin: day.maxWaitMin,
    /* The deadline that makes a must-do mean something. Without it every
     * must-do stays a mild preference all day and you go home without
     * riding it. */
    closing: hours && hours.close ? hours.close : null,
  };

  const all = planAhead(ridesHere(), live.rides, state, 2, 3);
  // Skips go to the back rather than away, so an empty park still shows them.
  const ranked = [...all.filter((c) => !skipped.has(c.id)), ...all.filter((c) => skipped.has(c.id))];

  const box = $('pl-cards');
  box.replaceChildren();
  if (!ranked.length) {
    const p = document.createElement('p');
    p.className = 'pl-empty';
    p.textContent = whyNothing();
    box.append(p);
  } else {
    ranked.slice(0, 3).forEach((c, i) => box.append(card(c, i)));
  }

  renderList(all);
  renderDone();
}

/* Why there is nothing to suggest.
 *
 * "Nothing to suggest" on its own reads like a bug, and at ten past nine at
 * Hollywood Studios it is not a bug, it is closing time. Each of these is a
 * different thing for you to do about it, so each gets its own sentence.
 */
function whyNothing() {
  if (live.from === 'none') return 'No wait times yet. Tap refresh once you have a signal.';

  const rides = ridesHere().filter((r) => r.queued);
  const states = rides.map((r) => (live.rides[r.id] || {}).status);
  const anyOpen = states.some((st) => st === 'OPERATING');

  if (!anyOpen) {
    const shut = hours && hours.close && new Date() > new Date(hours.close);
    const notYet = hours && hours.open && new Date() < new Date(hours.earlyOpen || hours.open);
    if (shut) return `${catalogue.parks[park].name} is closed for the night. Try another park, or come back tomorrow.`;
    if (notYet) return `${catalogue.parks[park].name} is not open yet. Doors at ${parkClock(hours.earlyOpen || hours.open)}.`;
    return `Nothing is running at ${catalogue.parks[park].name} right now.`;
  }

  const left = rides.filter((r) => !day.done.includes(r.id));
  if (!left.length) return 'You have ridden everything with a queue. Go and get a Dole Whip.';
  if (day.maxWaitMin !== null) {
    return `Nothing is under ${day.maxWaitMin} minutes right now. Raise the limit under "How you walk", or wait it out.`;
  }
  if (day.llWindows.length) {
    return 'Nothing fits before your next Lightning Lane. Head that way.';
  }
  return 'Nothing to suggest just now. Pull to refresh in a few minutes.';
}

/* Rides having an unusually quiet spell, best first.
 *
 * The planner's own ranking answers "where next". This answers a different
 * question: what is cheap right now that usually is not. It is the one
 * thing the hourly curve gives you that a posted wait alone cannot, and it
 * is deliberately a list rather than a single suggestion, because which of
 * them is worth crossing a park for is a judgement about your day, not a
 * number.
 */
function drawRightNow() {
  const box = $('pl-now');
  const head = $('pl-now-head');
  const found = rightNow(ridesHere(), live.rides, new Date());

  if (!found.length) {
    box.replaceChildren();
    head.textContent = '';
    return;
  }
  head.textContent = `${found.length} ride${found.length === 1 ? '' : 's'} quieter than usual`;
  box.replaceChildren(...found.slice(0, 6).map((r) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pl-nowrow';
    el.innerHTML =
      `<span class="pl-nowsave">-${Math.round(r.saves)}</span>` +
      `<span class="pl-nowname">${escapeHtml(r.name)}</span>` +
      `<span class="pl-nownums"><b>${Math.round(r.liveMin)}</b> vs ${Math.round(r.expected)} usual</span>`;
    el.onclick = () => openCurve(r.id);
    return el;
  }));
}

/* The ride's own day, drawn.
 *
 * Relative to its own busiest hour rather than any absolute scale, because
 * the question is "when is this ride worth doing", not "is it busier than
 * that one". The curve usually stops before closing time, so the chart says
 * where it ends rather than letting the shape imply the evening.
 */
function openCurve(rideId) {
  const ride = ridesHere().find((r) => r.id === rideId);
  const l = (live.rides || {})[rideId] || {};
  if (!ride) return;

  const box = $('pl-curve');
  box.hidden = false;
  $('pl-curve-name').textContent = ride.name;

  if (!hasCurve(l.forecast)) {
    $('pl-curve-bars').replaceChildren();
    $('pl-curve-says').textContent = 'No hourly forecast for this one, only the posted wait.';
    $('pl-curve-best').textContent = '';
    return;
  }

  const now = new Date();
  const drawn = bars(l.forecast, now);
  $('pl-curve-bars').replaceChildren(...drawn.map((b) => {
    const col = document.createElement('div');
    col.className = 'pl-col';
    col.dataset.when = b.isNow ? 'now' : (b.isPast ? 'past' : 'ahead');
    col.style.setProperty('--h', `${Math.round(b.rel * 100)}%`);
    col.title = `${parkClock(b.t)} · ${b.waitMin} min`;
    col.innerHTML = `<i></i><span>${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric' }).format(b.t)}</span>`;
    return col;
  }));

  $('pl-curve-says').textContent = verdictWords(verdict(l.waitMin, l.forecast, now));

  const better = bestAhead(l.forecast, now, 2);
  const until = coversUntil(l.forecast);
  const bits = [];
  if (better.length) {
    bits.push('Quietest left today: ' + better.map((b) => `${parkClock(b.t)} (${b.waitMin} min)`).join(' and ') + '.');
  }
  if (until && hours && hours.close && until < new Date(hours.close).getTime() - 30 * 60000) {
    bits.push(`The forecast only runs to ${parkClock(until)}, so the evening is not in this chart.`);
  }
  $('pl-curve-best').textContent = bits.join(' ');
}

/* The full board, so you can argue with the suggestion. Sorted by wait, which
 * is how everyone actually reads a wait-times list.
 */
function renderList(candidates) {
  const box = $('pl-list');
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const rows = ridesHere()
    .filter((r) => r.queued)
    .map((r) => {
      const l = live.rides[r.id] || {};
      const c = byId.get(r.id);
      return { ride: r, l, c, wait: typeof l.waitMin === 'number' ? l.waitMin : Infinity };
    })
    .sort((a, b) => a.wait - b.wait);

  box.replaceChildren(...rows.map(({ ride, l, c }) => {
    const row = document.createElement('div');
    row.className = 'pl-row';
    if (day.done.includes(ride.id)) row.classList.add('done');
    if (day.mustDo.includes(ride.id)) row.classList.add('must');

    const hasWait = typeof l.waitMin === 'number';
    const wait = hasWait ? `${l.waitMin}` : '–';
    const note = l.status && l.status !== 'OPERATING' ? l.status.toLowerCase() : '';

    row.innerHTML = `
      <span class="pl-wait" data-empty="${hasWait ? 'no' : 'yes'}">${wait}</span>
      <span class="pl-name">${escapeHtml(ride.name)}</span>
      <span class="pl-meta">${note || (c ? `${Math.round(c.walkMin)} min away` : '')}</span>
    `;

    /* The whole row opens the ride's day, which is the natural thing to
     * reach for once a chart exists at all. The star keeps its own hit
     * area so starring never opens the chart by accident. */
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.onclick = () => openCurve(ride.id);
    row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurve(ride.id); } };

    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'pl-star';
    star.setAttribute('aria-pressed', String(day.mustDo.includes(ride.id)));
    star.setAttribute('aria-label', `Must do ${ride.name}`);
    star.textContent = '★';
    star.onclick = (e) => {
      e.stopPropagation();
      day.mustDo = day.mustDo.includes(ride.id)
        ? day.mustDo.filter((x) => x !== ride.id)
        : [...day.mustDo, ride.id];
      saveDay();
      render();
    };
    row.append(star);
    return row;
  }));
}

function renderDone() {
  const box = $('pl-done');
  const names = day.done
    .map((id) => ridesHere().find((r) => r.id === id))
    .filter(Boolean);
  $('pl-done-count').textContent = names.length ? `${names.length} today` : '';
  box.replaceChildren(...names.map((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.name;
    b.title = 'Tap to un-tick';
    b.onclick = () => { day.done = day.done.filter((x) => x !== r.id); saveDay(); render(); };
    return b;
  }));
}

/* ── Lightning Lane, entered by hand ─────────────────────────────────────── */

function renderLL() {
  const box = $('pl-ll-list');
  box.replaceChildren(...day.llWindows.map((w, i) => {
    const ride = ridesHere().find((r) => r.id === w.attractionId);
    const row = document.createElement('div');
    row.className = 'pl-llrow';
    row.innerHTML = `<b>${escapeHtml(ride ? ride.name : 'Unknown ride')}</b>
      <span>${parkClock(w.start)} – ${parkClock(w.end)}</span>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.setAttribute('aria-label', 'Remove this Lightning Lane');
    del.textContent = '×';
    del.onclick = () => { day.llWindows.splice(i, 1); saveDay(); renderLL(); render(); };
    row.append(del);
    return row;
  }));

  const pick = $('pl-ll-ride');
  if (pick.options.length <= 1) {
    for (const r of ridesHere().filter((x) => x.queued)) {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.name;
      pick.append(o);
    }
  }
}

/* The return window is entered as two times on today's date in park time.
 * Building a Date from "today in Florida" plus "HH:MM" is fiddlier than it
 * looks: the browser is in whatever zone the phone is in, which on this trip
 * is the same zone, but will not be when the plan is made from home.
 */
function parkTimeToday(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const date = parkDate();
  // Try both US Eastern offsets and keep the one that round-trips, which
  // settles daylight saving without a tz library.
  for (const off of ['-04:00', '-05:00']) {
    const guess = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${off}`);
    const back = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(guess);
    if (back === `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`) return guess;
  }
  return null;
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function drawParkPicker() {
  const box = $('pl-parks');
  box.replaceChildren(...PARK_ORDER.map((k) => {
    const p = catalogue.parks[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k === park));
    b.textContent = p.short;
    b.onclick = () => {
      if (park === k) return;
      park = k;
      try { localStorage.setItem('parkPlanner.park', k); } catch { /* ignore */ }
      loadDay();
      skipped.clear();
      drawParkPicker();
      renderLL();
      $('pl-ll-ride').replaceChildren(new Option('Which ride?', ''));
      renderLL();
      refresh();
    };
    return b;
  }));
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export async function init() {
  catalogue = await fetch('parks/attractions.json').then((r) => r.json());

  try { park = localStorage.getItem('parkPlanner.park') || 'mk'; } catch { park = 'mk'; }
  if (!catalogue.parks[park]) park = 'mk';
  loadDay();

  drawParkPicker();
  renderLL();
  paintWhere();

  $('pl-curve-close').onclick = () => { $('pl-curve').hidden = true; };
  $('pl-refresh').onclick = () => refresh({ force: true });
  $('pl-where').onclick = startWatching;

  /* Ask for location straight away. Opening this tab is itself the user
   * gesture a browser wants before it will prompt, and the first thing you
   * want on arriving in a park is "what is near me" rather than a button to
   * press first. If it is refused or unavailable the button stays as the way
   * back in, and the planner keeps working from the middle of the park.
   */
  startWatching();

  $('pl-skipheld').checked = day.skipHeld;
  $('pl-skipheld').onchange = (e) => { day.skipHeld = e.target.checked; saveDay(); render(); };

  $('pl-pace').value = String(day.pace);
  $('pl-pace').oninput = (e) => {
    day.pace = Number(e.target.value) || DEFAULT_PACE;
    $('pl-pace-out').textContent = paceWords(day.pace);
    saveDay();
    render();
  };
  $('pl-pace-out').textContent = paceWords(day.pace);

  $('pl-maxwait').value = day.maxWaitMin === null ? '' : String(day.maxWaitMin);
  $('pl-maxwait').onchange = (e) => {
    const v = Number(e.target.value);
    day.maxWaitMin = e.target.value === '' || !Number.isFinite(v) ? null : v;
    saveDay();
    render();
  };

  $('pl-ll-add').onclick = () => {
    const id = $('pl-ll-ride').value;
    const start = parkTimeToday($('pl-ll-start').value);
    const end = parkTimeToday($('pl-ll-end').value);
    const err = $('pl-ll-error');
    if (!id) { err.textContent = 'Pick a ride first.'; return; }
    if (!start || !end) { err.textContent = 'Both times are needed, as HH:MM.'; return; }
    if (end <= start) { err.textContent = 'The window has to end after it starts.'; return; }
    err.textContent = '';
    day.llWindows = [...day.llWindows, { attractionId: id, start: start.toISOString(), end: end.toISOString() }]
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    saveDay();
    renderLL();
    render();
  };

  $('pl-reset').onclick = () => {
    if (!day.done.length || confirm('Clear everything you have ridden today?')) {
      day.done = [];
      skipped.clear();
      saveDay();
      render();
    }
  };

  await refresh();

  // Waits move. A refresh every three minutes while the tab is on screen
  // keeps the board live without hammering a free API from a phone.
  setInterval(() => { if (!document.hidden && $('pl').offsetParent !== null) refresh(); }, 3 * 60 * 1000);
}

const paceWords = (p) => {
  if (p <= 55) return 'Strolling, with a stroller';
  if (p <= 70) return 'Family pace';
  if (p <= 85) return 'Walking properly';
  return 'Marching';
};

// Re-render on every return to the tab, so the clock-sensitive bits are right.
export function onShow() {
  render();
  if (live.age > 3 * 60 * 1000) refresh();
}
