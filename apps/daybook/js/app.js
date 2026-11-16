/* Daybook: the page.
 *
 * One state object (see store.js), rendered whole on every change. The
 * day and the week are both drawn as horizontal strips: time runs left to
 * right, so a free afternoon shows up as empty space instead of vanishing
 * between two list rows.
 */

import * as T from './time.js';
import { eventsForDay, lanes, gaps, busyMinutes, windowFor, frac } from './layout.js';
import { KINDS, MOODS, valueOf, status, badges, streak, tally, tap, summary, STARTERS } from './trackers.js';
import { forDay, dueOn } from './todos.js';
import { apply, fresh, migrate, PALETTE, uid } from './store.js';
import { readAny } from './skylight.js';

const KEY = 'daybook.v1';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- state ----------

const load = () => {
  try { const raw = localStorage.getItem(KEY); return raw ? { state: migrate(JSON.parse(raw)), found: true } : { state: fresh(), found: false }; }
  catch { return { state: fresh(), found: false }; }
};
const loaded = load();
let S = loaded.state;
let firstRun = !loaded.found;

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private window */ } };

let undoState = null;
const dispatch = (action, { undo } = {}) => {
  const before = S;
  S = apply(S, action);
  save();
  render();
  if (undo) { undoState = before; toast(undo, true); }
};

const ui = { view: 'week', day: T.today(), trayOpen: false, sideOpen: false };
try { ui.trayOpen = localStorage.getItem('daybook.tray') === '1'; } catch { /* ignore */ }

// ---------- routing ----------

const readHash = () => {
  const m = location.hash.match(/^#\/(day|week)(?:\/(\d{4}-\d{2}-\d{2}))?/);
  if (m) { ui.view = m[1]; ui.day = m[2] || T.today(); }
};
const writeHash = () => {
  const h = `#/${ui.view}/${ui.day}`;
  if (location.hash !== h) history.replaceState(null, '', h);
};
readHash();
addEventListener('hashchange', () => { readHash(); render(); });

const go = (patch) => { Object.assign(ui, patch); render(); $('#main').focus({ preventScroll: true }); };

// ---------- helpers ----------

const cal = (id) => S.calendars.find((c) => c.id === id) || S.calendars[0];
const colorOf = (ev) => cal(ev.cal)?.color || '#868e96';
const visibleCal = (ev) => cal(ev.cal)?.visible !== false;
const dayCtx = (day) => ({ dow: T.dayOfWeek(day), daysFrom: T.daysBetween, visible: visibleCal });
const dayEvents = (day) => eventsForDay(S.events, day, dayCtx(day));
const hasEvents = (day) => { const d = dayEvents(day); return d.timed.length + d.allDay.length > 0; };
const pct = (x) => `${(x * 100).toFixed(3)}%`;
const timeRange = (ev) => `${T.clock(ev.s)}–${T.clock(ev.e)}`;

// ---------- strip ----------

const ruler = (win) => {
  let out = '';
  const hours = (win.to - win.from) / 60;
  const step = hours > 16 ? 2 : 1;
  for (let m = win.from; m <= win.to; m += 60 * step) {
    const cls = m === win.from ? 'first' : m === win.to ? 'last' : '';
    const odd = ((m - win.from) / (60 * step)) % 2 === 1 ? ' odd' : '';
    out += `<span class="h ${cls}${odd}" style="left:${pct(frac(m, win))}">${T.clock(m)}</span>`;
  }
  return `<div class="ruler">${out}</div>`;
};

// Pixel width of a strip, so labels only go where they fit.
const stripPx = () => {
  const main = $('#main').clientWidth || 800;
  return ui.view === 'week' ? main - (innerWidth <= 700 ? 58 : 104) : main;
};

const strip = (day, timed, win, { big = false } = {}) => {
  const placed = lanes(timed);
  const px = stripPx();
  const maxLanes = placed.reduce((n, e) => Math.max(n, e.lanes), 1);
  const width = win.to - win.from;
  let html = '';
  for (let m = Math.ceil(win.from / 60) * 60; m < win.to; m += 60) {
    if (m === win.from) continue;
    html += `<i class="hl${m === 720 ? ' noon' : ''}" style="left:${pct(frac(m, win))}"></i>`;
  }
  const todayKey = T.today();
  if (day === todayKey) {
    const n = T.nowMin();
    if (n > win.from) html += `<i class="past" style="width:${pct(frac(n, win))}"></i>`;
    if (n >= win.from && n <= win.to) html += `<i class="now" style="left:${pct(frac(n, win))}"></i>`;
  }
  const spills = []; // [startPx, endPx] taken up by labels running out of short events
  let evHtml = '';
  for (const ev of placed) {
    const left = frac(ev.s, win), w = frac(ev.e, win) - left;
    const h = 100 / ev.lanes;
    const tiny = w * px < 6;
    // A short event next to open time lets its label run out to the right,
    // so a 15 minute standup still says what it is.
    const next = placed.reduce((m, o) => (o !== ev && o.s >= ev.e ? Math.min(m, o.s) : m), win.to);
    const roomPx = (frac(next, win) - left) * px - 6;
    const spill = !tiny && ev.lanes === 1 && w * px < 90 && roomPx > w * px + 30;
    const k = spill ? Math.min(roomPx, 150) / (w * px) : 1;
    if (spill) spills.push([left * px, left * px + Math.min(roomPx, 150)]);
    const label = `${ev.title || '(no title)'}, ${timeRange(ev)}${ev.location ? ', ' + ev.location : ''}`;
    evHtml += `<button class="ev${tiny ? ' tiny' : ''}${spill ? ' spill' : ''}" data-ev="${esc(ev.id)}" data-day="${day}" title="${esc(label)}" aria-label="${esc(label)}"
      style="--c:${colorOf(ev)};--k:${k.toFixed(3)};left:calc(${pct(left)} + 1px);width:calc(${pct(w)} - 2px);top:calc(${h * ev.lane}% + 3px);height:calc(${h}% - 6px)">
      <b>${esc(ev.title || '(no title)')}</b><small>${timeRange(ev)}${ev.location ? ' · ' + esc(ev.location) : ''}</small></button>`;
  }
  if (S.settings.showGaps) {
    for (const g of gaps(timed, win.from, win.to, 30)) {
      const text = `${T.span(g.len)} free`;
      // Label in whatever part of the gap a spilled label does not cover,
      // and only if the label fits there.
      let a = frac(g.s, win) * px;
      const b = frac(g.e, win) * px;
      for (const [s, e] of spills) if (s <= a + 1 && e > a) a = e + 4;
      if (b - a < text.length * 7 + 24) continue;
      html += `<div class="gap" style="left:${pct(a / px)};width:${pct((b - a) / px)}"><span>${text}</span></div>`;
    }
  }
  html += evHtml;
  return `<div class="strip drawable lanes-${maxLanes}" data-strip="${day}" data-from="${win.from}" data-to="${win.to}">${html}</div>`;
};

const allDayChips = (list, day) =>
  `<div class="alldays">${list.map((ev) => `<button class="chip" data-ev="${esc(ev.id)}" data-day="${day}" style="--c:${colorOf(ev)}">${esc(ev.title)}</button>`).join('')}</div>`;

// ---------- day view ----------

const renderDay = () => {
  const day = ui.day;
  const { allDay, timed } = dayEvents(day);
  const win = windowFor([timed], S.settings);
  const busy = busyMinutes(timed, win.from, win.to);
  const free = gaps(timed, win.from, win.to, 15);
  const longest = free.reduce((a, g) => (g.len > (a?.len || 0) ? g : a), null);

  let agenda = '';
  let cursor = win.from;
  const freeRow = (s, e) => `<div class="ag free"><div class="t">${T.clock(s)}</div><button class="card" data-new="${day}" data-s="${s}" data-e="${Math.min(e, s + 60)}">${T.span(e - s)} free · ${T.clock(s)} to ${T.clock(e)}</button></div>`;
  for (const ev of timed) {
    if (ev.s - cursor >= 30) agenda += freeRow(cursor, ev.s);
    agenda += `<div class="ag"><div class="t">${T.clock(ev.s)}</div><button class="card" data-ev="${esc(ev.id)}" data-day="${day}" style="--c:${colorOf(ev)}"><b>${esc(ev.title || '(no title)')}</b><small>${timeRange(ev)} · ${T.span(ev.e - ev.s)} · ${esc(cal(ev.cal)?.name || '')}${ev.location ? ' · ' + esc(ev.location) : ''}</small></button></div>`;
    cursor = Math.max(cursor, ev.e);
  }
  if (win.to - cursor >= 30) agenda += freeRow(cursor, win.to);

  return `
    ${welcome()}
    <div class="dayhead">
      <div class="stats">
        <span><b>${timed.length}</b> event${timed.length === 1 ? '' : 's'}</span>
        <span><b>${T.span(busy)}</b> booked</span>
        <span><b>${T.span(win.to - win.from - busy)}</b> open between ${T.clock(win.from)} and ${T.clock(win.to)}</span>
        ${longest ? `<span>longest stretch <b>${T.span(longest.len)}</b> from ${T.clock(longest.s)}</span>` : ''}
      </div>
    </div>
    <div class="board day">
      ${allDayChips(allDay, day)}
      ${ruler(win)}
      ${strip(day, timed, win, { big: true })}
    </div>
    <p class="muted" style="margin:8px 2px 0;font-size:12px">Drag across the day to block out time, or tap a free stretch below.</p>
    <h2 class="section-h">The day in order</h2>
    <div class="agenda">${agenda || '<div class="empty">Nothing booked.</div>'}</div>
    <h2 class="section-h">Trackers ${S.trackers.length ? `<button class="btn small ghost" data-act="tracker-new">＋ Add</button>` : ''}</h2>
    ${trackerCards(day)}`;
};

// ---------- week view ----------

const renderWeek = () => {
  const days = T.weekDays(ui.day, S.settings.firstDay);
  const perDay = days.map((d) => ({ day: d, ...dayEvents(d) }));
  const win = windowFor(perDay.map((d) => d.timed), S.settings);
  const todayKey = T.today();
  const rows = perDay.map(({ day, allDay, timed }) => {
    const b = badges(S.trackers, S.entries, day);
    const due = dueOn(S.todos, day).length;
    return `<div class="row${day === todayKey ? ' today' : ''}">
      <button class="lbl" data-goto="${day}" aria-label="Open ${T.label(day, 'long')}">
        <span class="dn">${T.label(day, 'dow')}</span>
        <span class="dd">${T.parseDate(day).getDate()}</span>
        ${b.length ? `<span class="badges">${b.map((x) => `<span class="badge ${x.status}" title="${esc(x.title)}">${x.glyph}</span>`).join('')}</span>` : ''}
        ${due ? `<span class="duedot">☐ ${due} due</span>` : ''}
      </button>
      <div class="rowbody">${allDay.length ? allDayChips(allDay, day) : ''}${strip(day, timed, win)}</div>
    </div>`;
  }).join('');

  return `
    ${welcome()}
    <div class="board week">
      <div class="row-ruler"><div class="spacer"></div>${ruler(win)}</div>
      ${rows}
    </div>
    <h2 class="section-h">This week's trackers ${S.trackers.length ? `<button class="btn small ghost" data-act="tracker-new">＋ Add</button>` : ''}</h2>
    ${trackerGrid(days)}`;
};

const welcome = () => {
  if (!firstRun) return '';
  return `<div class="welcome">
    <h2>Every day, left to right</h2>
    <p>Each day is a strip from morning to night, so the free stretches stay visible. To-dos live in the tray at the bottom until you tick them off, and trackers for habits show up as little badges on the week.</p>
    <div class="acts"><button class="btn primary" data-act="sample">Fill in a sample week</button><button class="btn" data-act="skylight">Import from Skylight</button><button class="btn ghost" data-act="dismiss">Start empty</button></div>
  </div>`;
};

// ---------- trackers ----------

const sparkFor = (t, day) => {
  const days = Array.from({ length: 14 }, (_, i) => T.addDays(day, i - 13));
  return `<div class="spark" aria-hidden="true">${days.map((d) => {
    const st = status(t, valueOf(S.entries, t.id, d));
    const h = t.kind === 'count' ? Math.min(1, (valueOf(S.entries, t.id, d) || 0) / (t.goal || 1)) : st ? 1 : 0.15;
    return `<i class="${st === 'done' ? 'on' : st === 'partial' ? 'half' : ''}" style="height:${Math.max(15, h * 100)}%"></i>`;
  }).join('')}</div>`;
};

const trackerControl = (t, day) => {
  const v = valueOf(S.entries, t.id, day);
  const id = esc(t.id);
  switch (t.kind) {
    case 'check':
      return `<button class="big${v ? ' on' : ''}" data-tk-tap="${id}" data-day="${day}" aria-pressed="${!!v}">${v ? '✓ Done' : 'Mark done'}</button>`;
    case 'count': {
      const goal = t.goal || 1, n = v || 0;
      return `<div class="counter"><button data-tk-dec="${id}" data-day="${day}" aria-label="One less">−</button>
        <div class="v">${n}<small> / ${goal}${t.unit ? ' ' + esc(t.unit) : ''}</small></div>
        <button data-tk-tap="${id}" data-day="${day}" aria-label="One more">＋</button></div>
        ${goal <= 20 ? `<div class="pips">${Array.from({ length: goal }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
    }
    case 'number':
      return `<div class="numrow"><input type="number" step="any" inputmode="decimal" value="${v ?? ''}" data-tk-num="${id}" data-day="${day}" aria-label="${esc(t.name)}">${t.unit ? `<span class="muted">${esc(t.unit)}</span>` : ''}</div>`;
    case 'mood':
      return `<div class="faces">${MOODS.map((f, i) => `<button class="${v === i + 1 ? 'on' : ''}" data-tk-mood="${id}" data-v="${i + 1}" data-day="${day}" aria-label="Mood ${i + 1} of 5" aria-pressed="${v === i + 1}">${f}</button>`).join('')}</div>`;
    case 'note':
      return `<textarea data-tk-note="${id}" data-day="${day}" placeholder="How was it?" aria-label="${esc(t.name)}">${esc(v || '')}</textarea>`;
    default: return '';
  }
};

const trackerCards = (day) => {
  if (!S.trackers.length) {
    return `<div class="empty"><span>Track habits and little things: a workout, glasses of water, your mood, a line of journal. They show up as badges on the week.</span><button class="btn" data-act="tracker-new">＋ Add a tracker</button></div>`;
  }
  return `<div class="trackers">${S.trackers.map((t) => {
    const st = status(t, valueOf(S.entries, t.id, day));
    const run = t.kind === 'note' || t.kind === 'number' ? 0 : streak(t, S.entries, day, T.addDays);
    return `<div class="tk${st === 'done' ? ' done' : ''}">
      <header><span class="ic">${esc(t.icon)}</span><span class="nm">${esc(t.name)}</span>
        <span class="st">${run > 1 ? `🔥 ${run} days` : ''}</span>
        <button data-tk-edit="${esc(t.id)}" aria-label="Edit ${esc(t.name)}">⋯</button></header>
      ${trackerControl(t, day)}
      ${sparkFor(t, day)}
    </div>`;
  }).join('')}</div>`;
};

const trackerGrid = (days) => {
  if (!S.trackers.length) return trackerCards(ui.day);
  const todayKey = T.today();
  const head = `<tr><th></th>${days.map((d) => `<th class="${d === todayKey ? 'today' : ''}">${T.label(d, 'dow').slice(0, 2)}</th>`).join('')}<th></th></tr>`;
  const body = S.trackers.map((t) => `<tr><td class="nm">${esc(t.icon)} <span class="hide-narrow">${esc(t.name)}</span></td>${days.map((d) => {
    const v = valueOf(S.entries, t.id, d), st = status(t, v);
    const quick = t.kind === 'check' || t.kind === 'count';
    const glyph = st === 'done' ? (t.kind === 'mood' ? MOODS[v - 1] : t.kind === 'check' ? '✓' : t.icon) : st === 'partial' ? v : '';
    return `<td><button class="cell ${st || ''}" ${quick ? `data-tk-tap="${esc(t.id)}"` : `data-goto="${d}"`} data-day="${d}" title="${esc(summary(t, v))}" aria-label="${esc(summary(t, v))}, ${T.label(d, 'long')}">${glyph}</button></td>`;
  }).join('')}<td class="cnt">${tally(t, S.entries, days)}/7</td></tr>`).join('');
  return `<table class="grid-week">${head}${body}</table>`;
};

// ---------- sidebar ----------

const renderSide = () => {
  const sel = ui.day;
  const first = T.parseDate(sel); first.setDate(1);
  const monthKey = T.dateKey(first);
  const start = T.weekStart(monthKey, S.settings.firstDay);
  const week = new Set(ui.view === 'week' ? T.weekDays(sel, S.settings.firstDay) : []);
  const todayKey = T.today();
  const dows = Array.from({ length: 7 }, (_, i) => T.label(T.addDays(start, i), 'dow').slice(0, 2));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = T.addDays(start, i);
    if (i === 35 && d.slice(0, 7) !== monthKey.slice(0, 7)) break;
    const cls = [d.slice(0, 7) !== monthKey.slice(0, 7) && 'out', d === todayKey && 'today', d === sel && 'sel', week.has(d) && 'inweek', hasEvents(d) && 'has'].filter(Boolean).join(' ');
    cells += `<button class="d ${cls}" data-pick="${d}" aria-label="${T.label(d, 'long')}">${T.parseDate(d).getDate()}</button>`;
  }
  const cals = S.calendars.map((c) => `<div class="cal-row" style="--c:${c.color}">
      <button class="sw${c.visible === false ? ' off' : ''}" data-cal-toggle="${esc(c.id)}" aria-label="${c.visible === false ? 'Show' : 'Hide'} ${esc(c.name)}" aria-pressed="${c.visible !== false}"></button>
      <button class="nm" data-cal-toggle="${esc(c.id)}">${esc(c.name)}</button>
      <button class="ed" data-cal-edit="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">⋯</button></div>`).join('');
  const tks = S.trackers.map((t) => `<div class="cal-row"><span>${esc(t.icon)}</span><button class="nm" data-tk-edit="${esc(t.id)}">${esc(t.name)}</button><span class="muted" style="font-size:12px">${streak(t, S.entries, todayKey, T.addDays) > 1 ? '🔥' + streak(t, S.entries, todayKey, T.addDays) : ''}</span></div>`).join('');
  $('#side').innerHTML = `
    <div class="mini">
      <header><button data-month="-1" aria-label="Previous month">‹</button><span>${T.label(monthKey, 'month')}</span><button data-month="1" aria-label="Next month">›</button></header>
      <div class="grid">${dows.map((d) => `<span class="dow">${d}</span>`).join('')}${cells}</div>
    </div>
    <div><h3>Calendars <button data-act="cal-new" aria-label="Add a calendar">＋</button></h3>${cals}</div>
    <div><h3>Trackers <button data-act="tracker-new" aria-label="Add a tracker">＋</button></h3>${tks || '<button class="link" data-act="tracker-new">Add a habit or tracker</button>'}</div>
    <div><h3>More</h3>
      <button class="link" data-act="skylight">Import from Skylight</button><br>
      <button class="link" data-act="settings">Settings, backup and restore</button>
    </div>`;
};

// ---------- to-do tray ----------

const renderTray = () => {
  const todayKey = T.today();
  const day = ui.view === 'day' ? ui.day : (T.weekDays(ui.day, S.settings.firstDay).includes(todayKey) ? todayKey : ui.day);
  const list = forDay(S.todos, day, todayKey);
  const open = list.filter((t) => !t.done);
  const doneCount = S.todos.filter((t) => t.done).length;
  const tray = $('#tray');
  tray.className = `tray${ui.trayOpen ? '' : ' closed'}`;
  const focused = document.activeElement?.id === 'todoIn';
  const draft = $('#todoIn')?.value || '';
  tray.innerHTML = `
    <div class="bar">
      <button class="tg" data-act="tray" aria-expanded="${ui.trayOpen}">${ui.trayOpen ? '▾' : '▸'} To-dos <span class="count${open.length ? '' : ' zero'}">${open.length}</span></button>
      <div class="peek">${open.slice(0, 6).map((t) => `<span class="${t.overdue ? 'overdue' : ''}">${esc(t.title)}</span>`).join('')}</div>
      <form id="todoForm" autocomplete="off">
        <input type="text" id="todoIn" placeholder="Add a to-do…" aria-label="New to-do" value="${esc(draft)}">
        <input type="date" id="todoDue" aria-label="Due date (optional)" title="Due date (optional)">
      </form>
    </div>
    <div class="list">
      ${list.map((t) => `<div class="todo${t.done ? ' done' : ''}${t.overdue ? ' overdue' : ''}">
        <button class="ck" data-todo="${esc(t.id)}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${t.done ? '✓' : ''}</button>
        <button class="tt" data-todo-edit="${esc(t.id)}">${esc(t.title)}</button>
        ${t.due ? `<span class="due">${t.overdue ? 'was due ' : ''}${T.label(t.due)}</span>` : ''}
        <button class="x" data-todo-del="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">✕</button></div>`).join('') || '<p class="muted">Nothing on the list. Add one above; it stays here until you tick it off.</p>'}
      <div class="foot"><span>Showing ${day === todayKey ? 'today' : T.label(day, 'long')}. Undated to-dos follow you every day.</span>${doneCount ? `<button class="link" data-act="clear-done">Clear ${doneCount} done</button>` : ''}</div>
    </div>`;
  if (focused) { const i = $('#todoIn'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
};

// ---------- render ----------

const render = () => {
  writeHash();
  const days = T.weekDays(ui.day, S.settings.firstDay);
  $('#title').textContent = ui.view === 'day' ? T.label(ui.day, 'long') : `${T.weekLabel(days)}, ${T.parseDate(days[6]).getFullYear()}`;
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-selected', b.dataset.view === ui.view);
  $('#main').innerHTML = ui.view === 'day' ? renderDay() : renderWeek();
  renderSide();
  renderTray();
  document.body.classList.toggle('side-open', ui.sideOpen);
  $('#scrim').hidden = !ui.sideOpen;
};

// ---------- dialogs ----------

const dlg = $('#dlg');
const openDialog = (html, onSubmit, onReady) => {
  dlg.innerHTML = `<form method="dialog">${html}</form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', (e) => {
    const btn = e.submitter;
    if (btn?.value === 'cancel') return;
    e.preventDefault();
    if (onSubmit(new FormData(form), btn?.value, form) !== false) dlg.close();
  });
  onReady?.(form);
  dlg.showModal();
  const first = $('[autofocus]', dlg);
  if (first) { first.focus(); first.select?.(); }
};

const calOptions = (selected) => S.calendars.map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['biweekly', 'Every two weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];

const editEvent = (ev, occurrenceDay) => {
  const isNew = !ev.id || !S.events.some((e) => e.id === ev.id);
  const repeating = ev.repeat && ev.repeat !== 'none';
  openDialog(`
    <h2>${isNew ? 'New event' : 'Edit event'}</h2>
    <input class="title-in field" name="title" placeholder="What's happening?" value="${esc(ev.title || '')}" required autofocus style="border:0;border-bottom:1px solid var(--line);border-radius:0;padding:6px 0;background:none">
    <div class="cols3">
      <label class="field"><span>Date</span><input type="date" name="date" value="${ev.date}" required></label>
      <label class="field"><span>Starts</span><input type="time" name="start" value="${ev.start || '09:00'}" step="300"></label>
      <label class="field"><span>Ends</span><input type="time" name="end" value="${ev.end || '10:00'}" step="300"></label>
    </div>
    <label class="check"><input type="checkbox" name="allDay"${ev.allDay ? ' checked' : ''}> All day</label>
    <label class="field" data-only-allday><span>Last day (for a trip or a few days off)</span><input type="date" name="endDate" value="${ev.endDate || ''}"></label>
    <div class="cols">
      <label class="field"><span>Calendar</span><select name="cal">${calOptions(ev.cal || S.calendars[0].id)}</select></label>
      <label class="field"><span>Repeats</span><select name="repeat">${REPEATS.map(([v, n]) => `<option value="${v}"${(ev.repeat || 'none') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Where</span><input name="location" value="${esc(ev.location || '')}" placeholder="Optional"></label>
    <label class="field"><span>Notes</span><textarea name="notes" placeholder="Optional">${esc(ev.notes || '')}</textarea></label>
    ${ev.source === 'skylight' ? '<p class="note">Imported from Skylight. Changes here stay in Daybook and are replaced the next time you import that week.</p>' : ''}
    <div class="acts">
      ${isNew ? '' : `<button class="btn danger" value="delete" formnovalidate>Delete${repeating ? ' all' : ''}</button>`}
      ${!isNew && repeating ? `<button class="btn danger" value="skip" formnovalidate>Delete just ${T.label(occurrenceDay)}</button>` : ''}
      <span class="grow"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">Save</button>
    </div>`,
  (fd, action) => {
    if (action === 'delete') { dispatch({ type: 'event/delete', id: ev.id }, { undo: 'Event deleted' }); return; }
    if (action === 'skip') { dispatch({ type: 'event/skip', id: ev.id, day: occurrenceDay }, { undo: `Removed from ${T.label(occurrenceDay)}` }); return; }
    const allDay = fd.get('allDay') === 'on';
    let start = fd.get('start') || '09:00', end = fd.get('end') || '';
    if (!allDay && end && end <= start) end = T.fromMin(Math.min(T.toMin(start) + 60, 23 * 60 + 59));
    const endDate = allDay && fd.get('endDate') > fd.get('date') ? fd.get('endDate') : null;
    dispatch({ type: 'event/save', event: {
      ...ev, id: ev.id || uid(), title: fd.get('title').trim(), date: fd.get('date'), allDay,
      start: allDay ? null : start, end: allDay ? null : end, endDate, cal: fd.get('cal'),
      repeat: fd.get('repeat'), location: fd.get('location').trim(), notes: fd.get('notes').trim(),
    } });
  },
  (form) => {
    const sync = () => {
      const on = form.allDay.checked;
      form.start.disabled = on; form.end.disabled = on;
      $('[data-only-allday]', form).hidden = !on;
    };
    form.allDay.addEventListener('change', sync); sync();
  });
};

const openEvent = (id, day) => {
  const ev = S.events.find((e) => e.id === id);
  if (ev) editEvent(ev, day);
};

const newEvent = (day, s = null, e = null) => {
  const n = T.nowMin();
  const start = s ?? (day === T.today() ? Math.min(Math.ceil(n / 30) * 30, 23 * 60) : 9 * 60);
  const end = e ?? Math.min(start + 60, 23 * 60 + 59);
  editEvent({ date: day, start: T.fromMin(start), end: T.fromMin(end), cal: S.calendars.find((c) => c.visible !== false)?.id });
};

const editTracker = (t = {}) => {
  const isNew = !t.id;
  openDialog(`
    <h2>${isNew ? 'New tracker' : 'Edit tracker'}</h2>
    ${isNew ? `<div class="starters">${STARTERS.filter((x) => !S.trackers.some((y) => y.name === x.name)).map((x, i) => `<button type="button" data-starter="${i}">${x.icon} ${x.name}</button>`).join('')}</div>` : ''}
    <div class="cols" style="grid-template-columns:80px 1fr">
      <label class="field"><span>Icon</span><input name="icon" value="${esc(t.icon || '⭐')}" maxlength="4" style="text-align:center;font-size:20px"></label>
      <label class="field"><span>Name</span><input name="name" value="${esc(t.name || '')}" required autofocus placeholder="Stretch, Water, Mood…"></label>
    </div>
    <div class="field"><span>Kind</span><div class="kinds">${Object.entries(KINDS).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}"${(t.kind || 'check') === k ? ' checked' : ''}><b>${v.name}</b><small>${v.hint}</small></label>`).join('')}</div></div>
    <div class="cols">
      <label class="field" data-for="count"><span>Daily goal</span><input type="number" name="goal" min="1" value="${t.goal || 8}"></label>
      <label class="field" data-for="count number"><span>Unit</span><input name="unit" value="${esc(t.unit || '')}" placeholder="glasses, lb, miles"></label>
    </div>
    <div class="acts">
      ${isNew ? '' : `<button class="btn small ghost" value="up" formnovalidate>↑</button><button class="btn small ghost" value="down" formnovalidate>↓</button><button class="btn danger" value="delete" formnovalidate>Delete</button>`}
      <span class="grow"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">Save</button>
    </div>`,
  (fd, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete ${t.name} and everything logged for it?`)) return false;
      dispatch({ type: 'tracker/delete', id: t.id }, { undo: 'Tracker deleted' }); return;
    }
    if (action === 'up' || action === 'down') { dispatch({ type: 'tracker/move', id: t.id, by: action === 'up' ? -1 : 1 }); return false; }
    const kind = fd.get('kind');
    dispatch({ type: 'tracker/save', tracker: {
      ...t, id: t.id || uid(), name: fd.get('name').trim(), icon: fd.get('icon').trim() || '⭐', kind,
      goal: kind === 'count' ? Math.max(1, parseInt(fd.get('goal'), 10) || 1) : undefined,
      unit: fd.get('unit').trim() || undefined,
    } });
  },
  (form) => {
    const sync = () => {
      const kind = form.querySelector('input[name=kind]:checked').value;
      for (const el of form.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(kind);
    };
    form.addEventListener('change', sync); sync();
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-starter]');
      if (!b) return;
      const x = STARTERS.filter((y) => !S.trackers.some((z) => z.name === y.name))[+b.dataset.starter];
      form.icon.value = x.icon; form.name.value = x.name;
      form.querySelector(`input[name=kind][value=${x.kind}]`).checked = true;
      if (x.goal) form.goal.value = x.goal;
      form.unit.value = x.unit || '';
      sync();
    });
  });
};

const editCalendar = (c = {}) => {
  const isNew = !c.id;
  const color = c.color || PALETTE[S.calendars.length % PALETTE.length];
  openDialog(`
    <h2>${isNew ? 'New calendar' : 'Edit calendar'}</h2>
    <label class="field"><span>Name</span><input name="name" value="${esc(c.name || '')}" required autofocus placeholder="Cam, Bo, Work, Soccer…"></label>
    <div class="field"><span>Colour</span><div class="swatches">${PALETTE.map((p) => `<label style="--c:${p}"><input type="radio" name="color" value="${p}"${p === color ? ' checked' : ''} aria-label="${p}"><span></span></label>`).join('')}</div></div>
    <div class="acts">
      ${isNew || S.calendars.length <= 1 ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete with its events</button>'}
      <span class="grow"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">Save</button>
    </div>`,
  (fd, action) => {
    if (action === 'delete') {
      const n = S.events.filter((e) => e.cal === c.id).length;
      if (n && !confirm(`Delete ${c.name} and its ${n} event${n === 1 ? '' : 's'}?`)) return false;
      dispatch({ type: 'calendar/delete', id: c.id }, { undo: 'Calendar deleted' }); return;
    }
    dispatch({ type: 'calendar/save', calendar: { ...c, id: c.id || uid(), name: fd.get('name').trim(), color: fd.get('color') } });
  });
};

const editTodo = (t) => {
  openDialog(`
    <h2>To-do</h2>
    <label class="field"><span>What</span><input name="title" value="${esc(t.title)}" required autofocus></label>
    <label class="field"><span>Due (leave empty to keep it in the tray every day)</span><input type="date" name="due" value="${t.due || ''}"></label>
    <div class="acts"><button class="btn danger" value="delete" formnovalidate>Delete</button><span class="grow"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="save">Save</button></div>`,
  (fd, action) => {
    if (action === 'delete') { dispatch({ type: 'todo/delete', id: t.id }, { undo: 'To-do deleted' }); return; }
    dispatch({ type: 'todo/edit', id: t.id, patch: { title: fd.get('title').trim(), due: fd.get('due') || null } });
  });
};

const settingsDialog = () => {
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const opt = (sel) => hours.map((h) => `<option value="${h * 60}"${h * 60 === sel ? ' selected' : ''}>${T.clock(h * 60 % 1440)}${h === 24 ? ' (midnight)' : ''}</option>`).join('');
  openDialog(`
    <h2>Settings</h2>
    <div class="cols">
      <label class="field"><span>Day starts</span><select name="from">${opt(S.settings.from)}</select></label>
      <label class="field"><span>Day ends</span><select name="to">${opt(S.settings.to)}</select></label>
    </div>
    <p class="muted" style="margin:-6px 0 0;font-size:12px">The strip stretches past these hours when something is booked outside them.</p>
    <label class="field"><span>Weeks start on</span><select name="firstDay"><option value="0"${S.settings.firstDay === 0 ? ' selected' : ''}>Sunday</option><option value="1"${S.settings.firstDay === 1 ? ' selected' : ''}>Monday</option></select></label>
    <label class="check"><input type="checkbox" name="showGaps"${S.settings.showGaps ? ' checked' : ''}> Label the free stretches ("2h free")</label>
    <div class="field"><span>Backup</span>
      <div class="acts" style="justify-content:flex-start">
        <button class="btn small" type="button" data-x="export">Download a backup</button>
        <label class="btn small">Restore from a backup<input type="file" accept="application/json,.json" data-x="import" hidden></label>
      </div>
      <p class="muted" style="margin:0;font-size:12px">Daybook keeps everything in this browser. Download a backup now and then, or to move to another device.</p>
    </div>
    <div class="acts"><span class="grow"></span><button class="btn ghost" value="cancel" formnovalidate>Close</button><button class="btn primary" value="save">Save</button></div>`,
  (fd) => {
    const from = +fd.get('from'), to = +fd.get('to');
    if (to - from < 120) { alert('Leave at least two hours between the start and end of the day.'); return false; }
    dispatch({ type: 'settings/set', patch: { from, to, firstDay: +fd.get('firstDay'), showGaps: fd.get('showGaps') === 'on' } });
  },
  (form) => {
    $('[data-x=export]', form).addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `daybook-${T.today()}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('[data-x=import]', form).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const next = JSON.parse(await f.text());
        if (!confirm('Replace everything in Daybook with this backup?')) return;
        dispatch({ type: 'replace', state: next }, { undo: 'Backup restored' });
        dlg.close();
      } catch { alert('That file is not a Daybook backup.'); }
    });
  });
};

const skylightDialog = () => {
  openDialog(`
    <h2>Import from Skylight</h2>
    <div class="note">Skylight's web app loads your calendar from its API while you are signed in. Grab that response once and Daybook reads it here, in your browser. Nothing is uploaded.
      <ol>
        <li>Open your Skylight calendar in the browser and pick the weeks you want.</li>
        <li>Open developer tools (⌥⌘I on a Mac, F12 on Windows) and go to <b>Network</b>. Type <code>calendar</code> in the filter.</li>
        <li>Reload, or step forward a week. Either right-click the <code>calendar_events</code> request and copy its <b>response</b>, or use <b>Save all as HAR</b> and drop that file below.</li>
      </ol>
    </div>
    <div class="drop" data-drop>Drop a <b>.har</b> or <b>.json</b> file here, or <label class="link" style="display:inline">choose one<input type="file" accept=".har,.json,application/json" hidden data-file></label></div>
    <label class="field"><span>…or paste the response</span><textarea name="paste" placeholder='{"data":[{"type":"calendar_event", …}]}' style="min-height:110px;font-family:ui-monospace,monospace;font-size:12px"></textarea></label>
    <div class="result" data-result></div>
    <div class="acts"><span class="grow"></span><button class="btn ghost" value="cancel" formnovalidate>Close</button><button class="btn primary" value="save">Import</button></div>`,
  (fd, _a, form) => {
    const text = fd.get('paste').trim() || form.dataset.file || '';
    if (!text) { $('[data-result]', form).textContent = 'Paste a response or drop a file first.'; return false; }
    let got;
    try { got = readAny(text); } catch { $('[data-result]', form).textContent = 'That is not JSON. Copy the response body (it starts with {).'; return false; }
    if (!got.events.length) { $('[data-result]', form).textContent = `No calendar events found${got.responses ? '' : ' (no calendar_events requests in that file)'}. Try a different request.`; return false; }
    dispatch({ type: 'import/events', source: 'skylight', events: got.events, calendars: got.calendars, from: got.from, to: got.to });
    firstRun = false;
    toast(`Imported ${got.events.length} event${got.events.length === 1 ? '' : 's'} from Skylight${got.calendars.length ? ` across ${got.calendars.length} calendar${got.calendars.length === 1 ? '' : 's'}` : ''}`);
    if (got.from) go({ day: got.from });
  },
  (form) => {
    const drop = $('[data-drop]', form);
    const take = async (file) => {
      form.dataset.file = await file.text();
      drop.innerHTML = `Loaded <b>${esc(file.name)}</b>. Press Import.`;
    };
    $('[data-file]', form).addEventListener('change', (e) => e.target.files[0] && take(e.target.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) take(f); });
  });
};

// ---------- sample week ----------

const sample = () => {
  const days = T.weekDays(T.today(), S.settings.firstDay);
  const [sun, mon, tue, wed, thu, fri, sat] = days;
  const E = (date, title, start, end, cal, extra = {}) => ({ id: uid(), date, title, start, end, cal, ...extra });
  const events = [
    E(mon, 'Standup', '09:30', '09:45', 'me', { repeat: 'weekdays' }),
    E(mon, 'School drop-off', '08:15', '08:45', 'family', { repeat: 'weekdays' }),
    E(mon, 'Design review', '13:00', '14:30', 'me'),
    E(mon, 'Pilates', '18:00', '19:00', 'ash'),
    E(tue, '1:1 with manager', '11:00', '11:30', 'me'),
    E(tue, 'Cam soccer practice', '17:30', '18:30', 'family', { location: 'Field 3' }),
    E(wed, 'Dentist', '10:00', '11:00', 'ash'),
    E(wed, 'Planning', '10:30', '12:00', 'me'),
    E(wed, 'Lunch with Dan', '12:30', '13:30', 'me'),
    E(thu, 'Bo swim lesson', '16:00', '16:45', 'family'),
    E(thu, 'Date night', '19:00', '21:30', 'ash'),
    E(fri, 'Focus block', '09:45', '12:00', 'me'),
    E(fri, 'Pizza night', '18:00', '19:30', 'family'),
    E(sat, 'Cam soccer game', '09:00', '10:30', 'family', { location: 'John Jay' }),
    E(sat, 'Birthday party', '13:00', '15:00', 'family'),
    E(sun, 'Grammy & G-pop for dinner', '17:00', '19:30', 'family'),
    { id: uid(), date: fri, title: 'Trash & recycling', allDay: true, cal: 'family' },
  ];
  const trackers = [
    { id: uid(), name: 'Workout', icon: '💪', kind: 'check' },
    { id: uid(), name: 'Water', icon: '💧', kind: 'count', goal: 8, unit: 'glasses' },
    { id: uid(), name: 'Read', icon: '📚', kind: 'check' },
    { id: uid(), name: 'Mood', icon: '🙂', kind: 'mood' },
  ];
  const entries = {};
  const todayKey = T.today();
  for (const t of trackers) {
    entries[t.id] = {};
    for (let i = 1; i <= 10; i++) {
      const d = T.addDays(todayKey, -i);
      const r = Math.sin(i * 7.1 + t.name.length) * 0.5 + 0.5;
      if (t.kind === 'check' && r > 0.35) entries[t.id][d] = true;
      if (t.kind === 'count') entries[t.id][d] = Math.round(3 + r * 5);
      if (t.kind === 'mood') entries[t.id][d] = 2 + Math.round(r * 3);
    }
  }
  let next = S;
  for (const ev of events) next = apply(next, { type: 'event/save', event: ev });
  next = { ...next, trackers: [...next.trackers, ...trackers], entries: { ...next.entries, ...entries } };
  for (const [title, due] of [['Book Thanksgiving flights', null], ['Sign Bo\'s field trip form', T.addDays(todayKey, -1)], ['Call the plumber', todayKey], ['Order Cam\'s cleats', T.addDays(todayKey, 3)]]) {
    next = apply(next, { type: 'todo/add', title, due, created: todayKey });
  }
  S = next; firstRun = false; save(); render();
  toast('Sample week added', true);
  undoState = fresh();
};

// ---------- toast ----------

let toastTimer;
const toast = (msg, canUndo = false) => {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${canUndo ? '<button>Undo</button>' : ''}`;
  if (canUndo) el.querySelector('button').onclick = () => { if (undoState) { S = undoState; undoState = null; save(); render(); } el.remove(); };
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 5000);
};

// ---------- events ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-goto], [data-pick]');
  if (!t || dlg.contains(t)) return;
  const d = t.dataset;
  if (d.view) return go({ view: d.view });
  if (d.ev) return openEvent(d.ev, d.day);
  if (d.goto) return go({ view: 'day', day: d.goto, sideOpen: false });
  if (d.pick) return go({ day: d.pick, sideOpen: false });
  if (d.month) { const x = T.parseDate(ui.day); x.setDate(1); x.setMonth(x.getMonth() + +d.month); return go({ day: T.dateKey(x) }); }
  if (d.new) return newEvent(d.new, +d.s, +d.e);
  if (d.calToggle) return dispatch({ type: 'calendar/toggle', id: d.calToggle });
  if (d.calEdit) return editCalendar(S.calendars.find((c) => c.id === d.calEdit));
  if (d.tkEdit) return editTracker(S.trackers.find((x) => x.id === d.tkEdit));
  if (d.tkTap) { const tk = S.trackers.find((x) => x.id === d.tkTap); return dispatch({ type: 'entry/set', tracker: tk.id, day: d.day, value: tap(tk, valueOf(S.entries, tk.id, d.day)) }); }
  if (d.tkDec) { const n = (valueOf(S.entries, d.tkDec, d.day) || 0) - 1; return dispatch({ type: 'entry/set', tracker: d.tkDec, day: d.day, value: n > 0 ? n : null }); }
  if (d.tkMood) { const v = +d.v; const cur = valueOf(S.entries, d.tkMood, d.day); return dispatch({ type: 'entry/set', tracker: d.tkMood, day: d.day, value: cur === v ? null : v }); }
  if (d.todo) return dispatch({ type: 'todo/toggle', id: d.todo, day: ui.view === 'day' ? ui.day : T.today() });
  if (d.todoEdit) return editTodo(S.todos.find((x) => x.id === d.todoEdit));
  if (d.todoDel) return dispatch({ type: 'todo/delete', id: d.todoDel }, { undo: 'To-do deleted' });
  switch (d.act) {
    case 'tray': ui.trayOpen = !ui.trayOpen; try { localStorage.setItem('daybook.tray', ui.trayOpen ? '1' : '0'); } catch { /* ignore */ } return renderTray();
    case 'tracker-new': ui.sideOpen = false; return editTracker();
    case 'cal-new': return editCalendar();
    case 'settings': ui.sideOpen = false; render(); return settingsDialog();
    case 'skylight': ui.sideOpen = false; render(); return skylightDialog();
    case 'sample': return sample();
    case 'dismiss': firstRun = false; save(); return render();
    case 'clear-done': return dispatch({ type: 'todo/clearDone' }, { undo: 'Cleared done to-dos' });
    default:
  }
});

document.addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.tkNum) { const v = e.target.value === '' ? null : parseFloat(e.target.value); dispatch({ type: 'entry/set', tracker: d.tkNum, day: d.day, value: Number.isNaN(v) ? null : v }); }
  if (d.tkNote) dispatch({ type: 'entry/set', tracker: d.tkNote, day: d.day, value: e.target.value.trim() || null });
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'todoForm') return;
  e.preventDefault();
  const title = $('#todoIn').value;
  const due = $('#todoDue').value || null;
  $('#todoIn').value = '';
  if (!ui.trayOpen) { ui.trayOpen = true; try { localStorage.setItem('daybook.tray', '1'); } catch { /* ignore */ } }
  dispatch({ type: 'todo/add', title, due, created: T.today() });
});

$('#todayBtn').onclick = () => go({ day: T.today() });
$('#prevBtn').onclick = () => go({ day: T.addDays(ui.day, ui.view === 'day' ? -1 : -7) });
$('#nextBtn').onclick = () => go({ day: T.addDays(ui.day, ui.view === 'day' ? 1 : 7) });
$('#newBtn').onclick = () => newEvent(ui.view === 'day' ? ui.day : (T.weekDays(ui.day, S.settings.firstDay).includes(T.today()) ? T.today() : ui.day));
$('#menuBtn').onclick = () => go({ sideOpen: true });
$('#scrim').onclick = () => go({ sideOpen: false });

// Drag across a strip to block out time; a plain tap makes a one-hour event.
let drag = null;
const snap = (m) => Math.round(m / 15) * 15;
const minAt = (stripEl, clientX) => {
  const r = stripEl.getBoundingClientRect();
  const from = +stripEl.dataset.from, to = +stripEl.dataset.to;
  return snap(from + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (to - from));
};
document.addEventListener('pointerdown', (e) => {
  const s = e.target.closest('[data-strip]');
  if (!s || e.target.closest('.ev') || e.button !== 0) return;
  drag = { el: s, day: s.dataset.strip, a: minAt(s, e.clientX), x: e.clientX, ghost: null, pointerType: e.pointerType };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) < 6 && !drag.ghost) return;
  if (drag.pointerType === 'touch' && !drag.ghost && Math.abs(e.clientX - drag.x) < 12) return;
  const b = minAt(drag.el, e.clientX);
  const s = Math.min(drag.a, b), en = Math.max(drag.a, b);
  if (!drag.ghost) { drag.ghost = document.createElement('div'); drag.ghost.className = 'ghost'; drag.el.append(drag.ghost); }
  const from = +drag.el.dataset.from, to = +drag.el.dataset.to;
  Object.assign(drag.ghost.style, { left: pct((s - from) / (to - from)), width: pct((en - s) / (to - from)) });
  drag.ghost.textContent = en > s ? `${T.clock(s)}–${T.clock(en)}` : '';
  drag.s = s; drag.e = en;
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  d.ghost?.remove();
  if (d.ghost && d.e - d.s >= 15) newEvent(d.day, d.s, d.e);
  else if (!d.ghost) newEvent(d.day, d.a, Math.min(d.a + 60, 24 * 60 - 1));
});
document.addEventListener('pointercancel', () => { drag?.ghost?.remove(); drag = null; });

document.addEventListener('keydown', (e) => {
  if (dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const k = e.key;
  if (k === 't') go({ day: T.today() });
  else if (k === 'd') go({ view: 'day' });
  else if (k === 'w') go({ view: 'week' });
  else if (k === 'ArrowLeft' || k === 'j') $('#prevBtn').click();
  else if (k === 'ArrowRight' || k === 'k') $('#nextBtn').click();
  else if (k === 'n' || k === 'c') { e.preventDefault(); $('#newBtn').click(); }
  else if (k === '/') { e.preventDefault(); ui.trayOpen = true; renderTray(); $('#todoIn').focus(); }
  else return;
});

// Labels are fitted to the width, so lay out again after a resize.
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!dlg.open) render(); }, 150); });

// Keep the now line moving and roll over at midnight.
let lastToday = T.today();
setInterval(() => {
  if (dlg.open || document.activeElement?.matches('input, textarea, select')) return;
  const t = T.today();
  if (t !== lastToday && ui.day === lastToday) ui.day = t;
  lastToday = t;
  render();
}, 60000);

render();
