/* Park Planner: the history screen.
 *
 * Draws the archive: a year of medians per park, and per ride inside it.
 * All the arithmetic lives in hist.js and all the fetching in histdata.js,
 * so this file is only about what appears and what happens when you tap it.
 *
 * Two loads on purpose. The park document is a few KB and the screen opens
 * on it; the per-ride document is a couple of hundred KB and arrives behind
 * it, filling the ride list in once it lands. Nothing waits on it: you can
 * read the month and weekday charts while it is still coming.
 *
 * Every class here is prefixed hx-. That is not house style, it is a scar:
 * the planner's own chart once reused .pl-bar, which was already its status
 * strip, and inherited `align-items: center` from it. The bars had the right
 * height, no width, and were invisible. A prefix nobody else uses is cheap.
 */

import { parkRollup, ridesRollup, hoursRollup, rideHours, ageWords } from './histdata.js';
import {
  decodeSeries, median, byMonth, byWeekday, compareRange,
  rankRides, extremes, bars, dateAt, indexOfDate,
  hourRows, openHours, bestHour, heatGrid, hourLabel, WEEKDAYS, DOW_ORDER,
  decodeGrid, cube, toggle, noSelection, isEmptySelection,
  viewMonths, viewWeekdays, viewHours, viewHeat, viewScope,
} from './hist.js';

const $ = (id) => document.getElementById(id);

const PARKS = [
  ['mk', 'Magic Kingdom'],
  ['ep', 'EPCOT'],
  ['hs', 'Hollywood Studios'],
  ['ak', 'Animal Kingdom'],
];

let park = 'mk';
let head = null;      // the park rollup
let rides = null;     // the per-ride rollup, once it arrives
let series = [];      // the park's decoded p50
let range = null;     // { from, to, label } or null for the whole window
let openRide = null;

// A park can post waits for nearly fifty attractions. Showing all of them
// makes the page four thousand pixels tall and buries the charts above it,
// so the list starts at the busiest few and opens on request.
const FIRST_SHOWN = 12;
let showAll = false;
let hours = null;      // the hourly rollup, if the backfill has run
let dow = 'all';       // which day of the week the hourly charts show

/* The open ride's fact table and what is selected in it.
 *
 * One table, three dimensions, four charts over it. Each chart is both a
 * display and a control, and each is aggregated with every filter except
 * its own, so selecting October leaves the months chart showing every month
 * and narrows everything else. A chart that filtered itself would collapse
 * to one bar with nowhere left to click.
 */
let rideCube = null;   // { id, cube, span } for the ride that is open
let rideBusy = false;  // a grid fetch in flight, so a double click is not two
let sel = noSelection();

/* ── presets ───────────────────────────────────────────────────────────────
 *
 * Built from the window the archive actually holds, not hardcoded, so they
 * cannot quietly point outside it as the window moves. A preset whose dates
 * fall wholly outside what we hold is not offered at all, which is better
 * than offering it and drawing nothing.
 */
function presets() {
  if (!head) return [];
  const { from, to } = head;
  const out = [{ key: 'all', label: 'Whole window', from, to }];

  const candidates = [
    { key: 'trip', label: 'Trip week 2025', from: '2025-11-06', to: '2025-11-11' },
    { key: 'nov', label: 'Nov 2025', from: '2025-11-01', to: '2025-11-30' },
    { key: 'xmas', label: 'Christmas 2025', from: '2025-12-20', to: '2026-01-02' },
    { key: 'last30', label: 'Last 30 days', from: dateAt(to, -29), to },
  ];
  for (const c of candidates) {
    // Keep it if it overlaps what we hold at all, clamped to the window.
    const lo = c.from < from ? from : c.from;
    const hi = c.to > to ? to : c.to;
    if (lo <= hi) out.push({ ...c, from: lo, to: hi });
  }
  return out;
}

/* ── drawing ──────────────────────────────────────────────────────────── */

const fmtDate = (d) => {
  const [y, m, day] = d.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${names[Number(m) - 1]} ${y}`;
};

const mins = (v) => (v === null || v === undefined ? '–' : `${v} min`);

function drawParks() {
  const box = $('hx-parks');
  box.replaceChildren(...PARKS.map(([key, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(key === park));
    b.textContent = name;
    b.onclick = () => { if (key !== park) { park = key; openRide = null; load(); } };
    return b;
  }));
}

function drawRanges() {
  const box = $('hx-ranges');
  const active = range ? range.key : 'all';
  box.replaceChildren(...presets().map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(p.key === active));
    b.textContent = p.label;
    b.onclick = () => {
      range = p.key === 'all' ? null : p;
      render();
    };
    return b;
  }));
}

/* A bar chart. `rows` come from hist.js already scaled; this only turns them
 * into elements. Each bar is a real button when `onPick` is given, because a
 * chart you can tap has to be reachable without a pointer too.
 */
/* `active` is a single key or a list of them: a cross-filtered chart can
 * have several bars selected at once.
 */
const isActive = (active, key) => (Array.isArray(active)
  ? active.some((k) => String(k) === String(key))
  : active !== null && String(active) === String(key));

function drawBars(into, rows, { onPick = null, active = null } = {}) {
  const el = $(into);
  if (!rows.length) { el.replaceChildren(); return; }
  const picked = Array.isArray(active) && active.length > 0;
  el.replaceChildren(...bars(rows).map((r) => {
    const col = document.createElement(onPick ? 'button' : 'div');
    col.className = 'hx-col';
    if (onPick) {
      col.type = 'button';
      col.onclick = () => onPick(r);
      col.setAttribute('aria-pressed', isActive(active, r.key) ? 'true' : 'false');
      col.setAttribute('aria-label', `${r.label}, ${mins(r.value)}${r.days ? `, ${r.days} days` : ''}`);
    }
    if (isActive(active, r.key)) col.dataset.on = 'yes';
    // Something is selected and this is not it: dim rather than hide, so the
    // comparison the chart exists for is still readable.
    else if (picked) col.dataset.off = 'yes';
    if (r.value === null) col.dataset.empty = 'yes';

    const bar = document.createElement('i');
    bar.style.setProperty('--h', `${r.pct}%`);
    const tag = document.createElement('span');
    tag.textContent = r.label;

    /* The number, under the label. Bars alone cannot carry this: a park
     * whose weekdays run 15 to 20 draws seven bars between 75% and 100%,
     * which is an honest shape and an unreadable one. The figure is the
     * thing being asked for, so it is written down.
     */
    const val = document.createElement('em');
    val.textContent = r.value === null ? '' : String(r.value);
    col.append(bar, tag, val);
    return col;
  }));
}

function drawSummary() {
  const r = range || { from: head.from, to: head.to, label: 'the whole window' };
  const cmp = compareRange(series, head.from, r.from, r.to);

  const parts = [];
  if (cmp.median === null) {
    parts.push('No data in this range.');
  } else {
    parts.push(`Median ${cmp.median} min across ${cmp.days} day${cmp.days === 1 ? '' : 's'}.`);
    if (range && cmp.pct !== null) {
      const word = cmp.pct === 0 ? 'exactly average'
        : cmp.pct > 0 ? `${cmp.pct}% busier than usual`
        : `${Math.abs(cmp.pct)}% quieter than usual`;
      parts.push(`That is ${word} for this park (${cmp.overall} min over the whole window).`);
    }
  }
  $('hx-summary').textContent = parts.join(' ');
  $('hx-range-when').textContent = range
    ? `${fmtDate(r.from)} to ${fmtDate(r.to)}`
    : `${fmtDate(head.from)} to ${fmtDate(head.to)} · ${head.days} days`;
}

/* ── hour by hour ─────────────────────────────────────────────────────────
 *
 * Only appears once the hourly backfill has run. Until then the section says
 * so rather than drawing an empty chart, because an empty chart reads as
 * "this park has no queues" and a sentence does not.
 */
function drawHours() {
  const chips = $('hx-dow');
  const box = $('hx-hours');
  const says = $('hx-hours-says');

  if (!hours) {
    chips.replaceChildren();
    box.replaceChildren();
    says.textContent = hours === null
      ? 'Hour-by-hour data has not been collected for this park yet.'
      : '';
    return;
  }

  const options = [{ key: 'all', label: 'Any day' },
    ...DOW_ORDER.map((d) => ({ key: String(d), label: WEEKDAYS[d] }))];
  chips.replaceChildren(...options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.key === dow));
    b.textContent = o.label;
    b.onclick = () => { dow = o.key; render(); };
    return b;
  }));

  const series = hourSeries(hours.index);
  if (!series.some((v) => v !== null)) {
    box.replaceChildren();
    says.textContent = 'Nothing recorded for that day of the week yet.';
    return;
  }

  const { best, worst } = bestHour(series);
  says.textContent = best && worst && best.hour !== worst.hour
    ? `Quietest around ${hourLabel(best.hour)} at ${best.value} min, busiest around ${hourLabel(worst.hour)} at ${worst.value} min.`
    : '';
  drawBars('hx-hours', hourRows(series, openHours(series)));
}

/* `all` or one weekday, decoded. The rollup indexes weekdays Sunday-first
 * because that is how it was built; the chips are Monday-first for reading.
 * Mixing those up rotates every chart by a day and still looks fine.
 */
function hourSeries(block) {
  if (!block) return [];
  if (dow === 'all') return decodeSeries(block.all);
  return decodeSeries((block.dow || [])[Number(dow)]);
}

function drawRides() {
  const box = $('hx-rides');
  if (!rides) {
    box.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'hx-quiet', textContent: 'Loading the rides…',
    }));
    return;
  }
  const r = range || { from: head.from, to: head.to };
  const ranked = rankRides(rides.rides, rides.from, r.from, r.to);
  if (!ranked.length) {
    box.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'hx-quiet', textContent: 'No ride posted a wait in this range.',
    }));
    return;
  }

  const shown = showAll ? ranked : ranked.slice(0, FIRST_SHOWN);
  const more = $('hx-more');
  if (ranked.length > FIRST_SHOWN) {
    more.hidden = false;
    more.textContent = showAll
      ? `Show the busiest ${FIRST_SHOWN} only`
      : `Show all ${ranked.length} rides`;
    more.onclick = () => { showAll = !showAll; render(); };
  } else {
    more.hidden = true;
  }

  box.replaceChildren(...shown.map((ride) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'hx-ride';
    if (openRide === ride.id) row.dataset.on = 'yes';

    const name = document.createElement('strong');
    name.textContent = ride.name;
    const big = document.createElement('b');
    big.textContent = `${ride.median}`;
    const unit = document.createElement('em');
    unit.textContent = 'min';

    const vs = document.createElement('span');
    if (range && ride.delta !== null && ride.delta !== 0) {
      vs.textContent = `${ride.delta > 0 ? '+' : ''}${ride.delta} vs usual`;
      vs.dataset.sign = ride.delta > 0 ? 'up' : 'down';
    } else {
      vs.textContent = `${ride.days} day${ride.days === 1 ? '' : 's'}`;
    }

    row.append(name, big, unit, vs);
    row.onclick = () => {
      const opening = openRide !== ride.id;
      openRide = opening ? ride.id : null;
      // A different ride is a different table, so the old selection means
      // nothing against it and carrying it over would silently filter the
      // new ride by last ride's October.
      sel = noSelection();
      rideCube = null;
      render();
      if (opening) {
        loadRideGrid(ride.id);
        const panel = $('hx-ride-detail');
        if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    return row;
  }));
}

/* Fetch one ride's per-day grid, which is what makes its charts filterable.
 *
 * Its own document and its own request, because all of a park's grids come
 * to about 566KB: too much to send to draw one ride, and it grows with every
 * day collected. The panel draws immediately from the profiles it already
 * has and redraws when this lands, rather than showing nothing until it
 * does.
 *
 * A missing grid is normal, not an error: a park whose hourly backfill has
 * not reached it yet, or a ride added since the last rollup. The panel falls
 * back to the collapsed profiles and says the detail is not collected.
 */
async function loadRideGrid(id) {
  if (rideBusy) return;
  rideBusy = true;
  try {
    const got = await rideHours(park, id);
    // The ride may have been closed or swapped while this was in flight.
    if (openRide !== id) return;
    const grid = got && got.data ? decodeGrid(got.data.h) : [];
    if (!grid.length) { rideCube = null; return; }
    const built = cube(got.data.from, grid);
    rideCube = { id, cube: built, span: openHours(viewHours(built, noSelection())) };
  } catch {
    // Offline or blocked: the profiles already drawn are still true.
    if (openRide === id) rideCube = null;
  } finally {
    rideBusy = false;
    if (openRide === id) drawRide();
  }
}

function drawRide() {
  const panel = $('hx-ride-detail');
  if (!openRide || !rides || !rides.rides[openRide]) { panel.hidden = true; return; }

  const ride = rides.rides[openRide];
  const s = decodeSeries(ride.p50);
  const p90 = decodeSeries(ride.p90);
  panel.hidden = false;
  $('hx-ride-name').textContent = ride.n;

  const r = range || { from: rides.from, to: rides.to };
  const cmp = compareRange(s, rides.from, r.from, r.to);
  const ex = extremes(s, rides.from);

  const lines = [];
  if (cmp.median !== null) {
    lines.push(`${cmp.median} min median in this range, against ${cmp.overall} min overall.`);
    if (cmp.pct !== null && cmp.pct !== 0 && range) {
      lines.push(`${Math.abs(cmp.pct)}% ${cmp.pct > 0 ? 'busier' : 'quieter'} than its usual.`);
    }
  }
  const worstP90 = median(p90);
  if (worstP90 !== null) lines.push(`Nine days in ten it stays under about ${worstP90} min.`);
  $('hx-ride-says').textContent = lines.join(' ');

  $('hx-ride-extremes').replaceChildren(...[
    ex.best && `Quietest: ${ex.best.value} min on ${fmtDate(ex.best.date)}`,
    ex.worst && `Busiest: ${ex.worst.value} min on ${fmtDate(ex.worst.date)}`,
  ].filter(Boolean).map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));

  drawRideHours();

  /* With a grid, every chart below comes from the same table and they filter
   * each other. Without one, they fall back to the daily series and are
   * read-only: there is nothing to cross-filter against, and a chart that
   * looks clickable and does nothing is worse than one that does not.
   */
  if (rideCube && rideCube.id === openRide) {
    drawBars('hx-ride-months', viewMonths(rideCube.cube, sel), {
      onPick: (row) => pick('months', row.key),
      active: sel.months,
    });
    drawBars('hx-ride-days', viewWeekdays(rideCube.cube, sel), {
      onPick: (row) => pick('dows', row.key),
      active: sel.dows,
    });
  } else {
    drawBars('hx-ride-months', byMonth(s, rides.from), {
      onPick: (row) => pickMonth(row),
      active: range && range.key && range.key.startsWith('m:') ? range.key.slice(2) : null,
    });
    drawBars('hx-ride-days', byWeekday(s, rides.from));
  }
  drawFilters();
}

/* A click on any bar. Toggling rather than replacing, so two months can be
 * compared against each other, and a second click on the same bar clears it.
 */
function pick(dim, key) {
  sel = toggle(sel, dim, key);
  drawRide();
}

function clearFilters() {
  sel = noSelection();
  drawRide();
}

/* What is selected, written out and removable.
 *
 * Without this a filtered chart is indistinguishable from a quiet ride: the
 * numbers are simply smaller and nothing says why. The day count matters for
 * the same reason, because a median of two afternoons should not read like a
 * fact about October.
 */
function drawFilters() {
  const box = $('hx-ride-filters');
  if (!rideCube || rideCube.id !== openRide || isEmptySelection(sel)) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  box.hidden = false;

  const chip = (label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hx-chip';
    b.textContent = label;
    b.onclick = onClick;
    b.setAttribute('aria-label', `Remove filter ${label}`);
    return b;
  };

  const kids = [];
  const months = viewMonths(rideCube.cube, noSelection());
  for (const key of sel.months) {
    const row = months.find((m) => m.key === key);
    kids.push(chip(row ? row.label : key, () => pick('months', key)));
  }
  for (const d of sel.dows) kids.push(chip(WEEKDAYS[Number(d)], () => pick('dows', d)));
  for (const h of sel.hours) kids.push(chip(hourLabel(Number(h)), () => pick('hours', h)));

  const scope = viewScope(rideCube.cube, sel);
  const note = document.createElement('span');
  note.className = 'hx-scope';
  note.textContent = scope.cells
    ? `${scope.days} day${scope.days === 1 ? '' : 's'}, median ${scope.value} min`
    : 'nothing matches';
  kids.push(note);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'hx-chip hx-chip-clear';
  clear.textContent = 'Clear';
  clear.onclick = clearFilters;
  kids.push(clear);

  box.replaceChildren(...kids);
}

/* A ride's own hours, and its week as a grid.
 *
 * The grid is where the hourly data stops being trivia: a single profile
 * says a ride peaks at two, the grid says it peaks at two on a Saturday and
 * hardly at all on a Thursday, which is the difference between a fact and a
 * plan.
 */
function drawRideHours() {
  const wrap = $('hx-ride-hourly');
  const live = rideCube && rideCube.id === openRide ? rideCube : null;
  const ride = hours && openRide ? hours.rides[openRide] : null;
  if (!live && !ride) { wrap.hidden = true; return; }
  wrap.hidden = false;

  /* The hour axis is fixed from the unfiltered data, not recomputed per
   * filter. Let it follow the selection and the chart changes width on every
   * click, which makes two selections impossible to compare by eye: the
   * whole point of filtering is that the thing either side of it holds
   * still.
   */
  const span = live ? live.span : openHours(hourSeries(ride));
  const series = live ? viewHours(live.cube, sel) : hourSeries(ride);

  const { best, worst } = bestHour(series);
  $('hx-ride-hours-says').textContent = best && worst && best.hour !== worst.hour
    ? `Quietest around ${hourLabel(best.hour)} at ${best.value} min, busiest around ${hourLabel(worst.hour)} at ${worst.value} min.`
    : 'Not enough hours recorded to tell them apart.';

  drawBars('hx-ride-hours', hourRows(series, span), live ? {
    onPick: (row) => pick('hours', row.hour),
    active: sel.hours,
  } : {});

  const heat = live
    ? viewHeat(live.cube, sel)
    : { top: 0, rows: heatGrid(ride.dow || []) };
  if (!live) {
    heat.top = Math.max(0, ...heat.rows.flatMap((r) => r.cells.map((c) => (c.value === null ? 0 : c.value))));
  }

  const cells = [];
  for (const row of heat.rows) {
    const tag = document.createElement('b');
    tag.textContent = row.label;
    const line = document.createElement('div');
    line.className = 'hx-row';
    for (let h = span.from; h <= span.to; h++) {
      const cell = row.cells[h];
      /* A cell is a control when there is a table behind it: clicking one
       * selects its weekday and its hour together, which is the "what is
       * this ride like on a Saturday at two" question the grid is for.
       */
      const i = document.createElement(live ? 'button' : 'i');
      if (live) {
        i.type = 'button';
        i.onclick = () => {
          sel = toggle(toggle(sel, 'dows', row.key), 'hours', h);
          drawRide();
        };
      }
      const on = live
        && sel.dows.some((d) => String(d) === row.key)
        && sel.hours.some((x) => String(x) === String(h));
      if (on) i.dataset.on = 'yes';
      if (cell && cell.pct !== null) {
        i.dataset.v = '';
        i.style.setProperty('--v', String(Math.max(cell.pct, 8)));
        i.title = `${row.label} ${hourLabel(h)}: ${cell.value} min`;
        i.setAttribute('aria-label', i.title);
      } else {
        i.setAttribute('aria-label', `${row.label} ${hourLabel(h)}: no data`);
      }
      line.append(i);
    }
    cells.push(tag, line);
  }
  // One row of hour labels under the grid rather than one per row.
  const spacer = document.createElement('b');
  const hourLine = document.createElement('div');
  hourLine.className = 'hx-hourline';
  for (let h = span.from; h <= span.to; h++) {
    const sp = document.createElement('span');
    sp.textContent = h % 3 === 0 ? hourLabel(h) : '';
    hourLine.append(sp);
  }
  cells.push(spacer, hourLine);
  $('hx-ride-heat').replaceChildren(...cells);

  $('hx-heat-key').textContent = heat.top
    ? `Darkest cell is ${heat.top} min. Every cell is scaled against that, so a quiet day reads quiet.`
    : '';
  /* When the hourly window is shorter than the archive, say so. All four
   * charts come from the hourly grid now, so on a park whose backfill has
   * not finished they cover less than the months chart used to, and a chart
   * that quietly narrowed is worse than one that says what it covers.
   * Nothing to say once the backfill catches up, which is the normal case.
   */
  const narrow = live && rides && live.cube.from > rides.from;
  $('hx-ride-hint').textContent = live
    ? 'Tap any bar or cell to filter. Everything else follows; the chart you tapped'
      + ' stays whole so you can keep comparing.'
      + (narrow
        ? ` These four charts cover ${fmtDate(live.cube.from)} onwards, where hour-by-hour`
          + ` detail has been collected. The archive itself goes back to ${fmtDate(rides.from)}.`
        : '')
    : 'Hour-by-hour detail for this ride has not been collected yet, so these charts'
      + ' cannot be filtered against each other.';
}

function pickMonth(row) {
  if (row.value === null) return;
  const first = `${row.key}-01`;
  // The last day of that month, found by stepping back from the first of the
  // next one rather than by a table of month lengths.
  const [y, m] = row.key.split('-').map(Number);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  range = { key: `m:${row.key}`, label: row.label, from: first, to: dateAt(nextFirst, -1) };
  render();
}

function render() {
  if (!head) return;
  drawRanges();
  drawSummary();
  drawBars('hx-months', byMonth(series, head.from), {
    onPick: pickMonth,
    active: range && range.key && range.key.startsWith('m:') ? range.key.slice(2) : null,
  });
  drawBars('hx-days', byWeekday(series, head.from));
  drawHours();
  drawRides();
  drawRide();
}

/* ── loading ──────────────────────────────────────────────────────────── */

/* Wipe the screen before fetching the next park.
 *
 * Without this the previous park's charts and ride list sit there until the
 * new data lands, so tapping Hollywood Studios shows you Magic Kingdom's
 * rides with nothing to say they are the wrong park's. Stale data presented
 * as current is worse than an empty panel, and this panel is specifically
 * for comparing parks, so it is the mistake someone would actually make.
 */
function clear() {
  for (const id of ['hx-months', 'hx-days', 'hx-rides', 'hx-ride-months', 'hx-ride-days', 'hx-ride-extremes']) {
    $(id).replaceChildren();
  }
  $('hx-ride-detail').hidden = true;
  $('hx-ride-hourly').hidden = true;
  $('hx-more').hidden = true;
  for (const id of ['hx-dow', 'hx-hours', 'hx-ride-heat']) $(id).replaceChildren();
  $('hx-hours-says').textContent = '';
  showAll = false;
  $('hx-range-when').textContent = '';
  $('hx-age').textContent = '';
}

async function load() {
  drawParks();
  clear();
  $('hx-error').textContent = '';
  $('hx-summary').textContent = 'Loading…';
  head = null; rides = null; hours = null; series = []; dow = 'all';

  let got;
  try {
    got = await parkRollup(park);
  } catch (err) {
    $('hx-error').textContent = `Could not load the history: ${err.message || err}`;
    $('hx-summary').textContent = '';
    return;
  }
  if (!got.data) {
    $('hx-summary').textContent = '';
    $('hx-error').textContent = 'No history has been rolled up for this park yet.';
    $('hx-rides').replaceChildren();
    return;
  }

  head = got.data;
  series = decodeSeries(head.index && head.index.p50);
  $('hx-age').textContent = got.from === 'network' ? '' : `· ${ageWords(got.age)}`;
  render();

  // The ride document is the big one. Fetched after the screen is already
  // usable, and its failure costs the ride list and nothing else.
  const want = park;
  /* The hourly rollup rides along with the per-ride one. It may not exist:
   * the hourly backfill is a separate, far more expensive job, so the screen
   * has to be useful without it rather than broken until it has run.
   */
  hoursRollup(park).then((got2) => {
    if (want !== park) return;
    hours = got2.data;
    render();
  }).catch(() => { hours = null; });

  try {
    const more = await ridesRollup(park);
    if (want !== park) return;  // they switched parks while it was in flight
    rides = more.data;
  } catch {
    rides = null;
    $('hx-rides').replaceChildren(Object.assign(document.createElement('p'), {
      className: 'hx-quiet', textContent: 'Could not load the per-ride history.',
    }));
    return;
  }
  render();
}

export async function init() {
  $('hx-ride-close').onclick = () => {
    openRide = null;
    sel = noSelection();
    rideCube = null;
    render();
  };
  await load();
}

// Re-entering the tab should not re-download a year of history.
export function onShow() {
  if (!head) load();
}
