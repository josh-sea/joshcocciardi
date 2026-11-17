/* Daybook: the calendar's layout, trackers, to-dos and Skylight import.
 *
 * Run: node apps/portfolio/test/daybook.test.mjs
 */
import * as T from '../../daybook/js/time.js';
import { occursOn, eventsForDay, lanes, gaps, busyMinutes, windowFor, frac } from '../../daybook/js/layout.js';
import { status, badges, streak, tally, tap } from '../../daybook/js/trackers.js';
import { forDay, dueOn } from '../../daybook/js/todos.js';
import { apply, fresh, migrate } from '../../daybook/js/store.js';
import { fromSkylight, fromHar, readAny } from '../../daybook/js/skylight.js';
import { parseFrame } from '../../daybook/js/sync.js';
import { createRequire } from 'node:module';
const lib = createRequire(import.meta.url)('../../../functions/skylight-lib.js');

let failures = 0, passes = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`); }
};
const ctx = (day) => ({ dow: T.dayOfWeek(day), daysFrom: T.daysBetween });

console.log('time');
ok('addDays across a month', T.addDays('2026-11-30', 1) === '2026-12-01');
ok('addDays across DST', T.addDays('2026-11-01', 1) === '2026-11-02' && T.addDays('2026-03-08', 1) === '2026-03-09');
ok('week starts on Sunday', T.weekStart('2026-11-18') === '2026-11-15');
ok('week starts on Monday', T.weekStart('2026-11-15', 1) === '2026-11-09');
ok('clock', T.clock(570) === '9:30a' && T.clock(720) === '12p' && T.clock(0) === '12a');
ok('span', T.span(150) === '2h 30m' && T.span(45) === '45m' && T.span(120) === '2h');
ok('weekLabel across months', T.weekLabel(T.weekDays('2026-12-01')) === 'Nov 29 – Dec 5');

console.log('repeats');
const weekly = { date: '2026-11-02', repeat: 'weekly' };
ok('weekly lands every 7 days', occursOn(weekly, '2026-11-16', 1, T.daysBetween) && !occursOn(weekly, '2026-11-17', 2, T.daysBetween));
ok('nothing before the first date', !occursOn(weekly, '2026-10-26', 1, T.daysBetween));
ok('weekdays skip the weekend', occursOn({ date: '2026-11-02', repeat: 'weekdays' }, '2026-11-20', 5, T.daysBetween) && !occursOn({ date: '2026-11-02', repeat: 'weekdays' }, '2026-11-21', 6, T.daysBetween));
ok('a skipped occurrence is gone', !occursOn({ ...weekly, skip: ['2026-11-16'] }, '2026-11-16', 1, T.daysBetween));
ok('until ends it', !occursOn({ ...weekly, until: '2026-11-10' }, '2026-11-16', 1, T.daysBetween));
ok('monthly by day of month', occursOn({ date: '2026-10-16', repeat: 'monthly' }, '2026-11-16', 1, T.daysBetween));

console.log('layout');
const evs = [
  { id: 'a', date: '2026-11-16', start: '09:00', end: '10:00' },
  { id: 'b', date: '2026-11-16', start: '09:30', end: '11:00' },
  { id: 'c', date: '2026-11-16', start: '10:00', end: '10:30' },
  { id: 'd', date: '2026-11-16', start: '14:00', end: '15:00' },
  { id: 'e', date: '2026-11-16', allDay: true, title: 'Trash day' },
  { id: 'f', date: '2026-11-15', allDay: true, endDate: '2026-11-17', title: 'Trip' },
  { id: 'g', date: '2026-11-16', start: '16:00', end: '16:00' },
];
const day = eventsForDay(evs, '2026-11-16', ctx('2026-11-16'));
ok('all-day split out, multi-day included', day.allDay.map((e) => e.id).join() === 'e,f');
ok('zero-length event gets 30 minutes', day.timed.find((e) => e.id === 'g').e === 16 * 60 + 30);
const laid = lanes(day.timed);
const by = Object.fromEntries(laid.map((e) => [e.id, e]));
ok('overlap cluster uses two lanes', by.a.lanes === 2 && by.b.lanes === 2 && by.c.lanes === 2);
ok('c reuses lane 0 after a ends', by.c.lane === 0 && by.b.lane === 1);
ok('a lone event keeps the full height', by.d.lanes === 1 && by.d.lane === 0);
const free = gaps(day.timed, 7 * 60, 22 * 60);
ok('gaps between busy stretches', free.map((g) => `${T.fromMin(g.s)}-${T.fromMin(g.e)}`).join() === '07:00-09:00,11:00-14:00,15:00-16:00,16:30-22:00', free);
ok('busy minutes count overlaps once', busyMinutes(day.timed, 7 * 60, 22 * 60) === 120 + 60 + 30);
ok('short gaps are hidden', gaps([{ s: 600, e: 660 }, { s: 670, e: 700 }], 600, 700).length === 0);
ok('window stretches for an early flight', windowFor([[{ s: 330, e: 400 }]]).from === 300);
ok('frac clamps', frac(0, { from: 420, to: 1320 }) === 0 && frac(870, { from: 420, to: 1320 }) === 0.5);
ok('hidden calendars drop out', eventsForDay([{ id: 'x', cal: 'ash', date: '2026-11-16', start: '09:00', end: '10:00' }], '2026-11-16', { ...ctx('2026-11-16'), visible: (e) => e.cal !== 'ash' }).timed.length === 0);

console.log('trackers');
const water = { id: 'w', name: 'Water', icon: '💧', kind: 'count', goal: 8 };
const gym = { id: 'g', name: 'Workout', icon: '💪', kind: 'check' };
const mood = { id: 'm', name: 'Mood', icon: '🙂', kind: 'mood' };
ok('count below goal is partial', status(water, 3) === 'partial' && status(water, 8) === 'done');
ok('tap counts up and toggles', tap(water, 2) === 3 && tap(gym, null) === true && tap(gym, true) === null);
const entries = { g: { '2026-11-13': true, '2026-11-14': true, '2026-11-15': true }, m: { '2026-11-16': 5 }, w: { '2026-11-16': 4 } };
ok('streak counts back from yesterday before today is done', streak(gym, entries, '2026-11-16', T.addDays) === 3);
ok('streak breaks on a gap', streak(gym, { g: { '2026-11-16': true, '2026-11-14': true } }, '2026-11-16', T.addDays) === 1);
const b = badges([gym, mood, water], entries, '2026-11-16');
ok('badges show mood face and partial counter', b.length === 2 && b[0].glyph === '😄' && b[1].status === 'partial');
ok('tally', tally(gym, entries, T.weekDays('2026-11-16')) === 1);

console.log('to-dos');
const todos = [
  { id: '1', title: 'Undated', done: false, due: null, created: '2026-11-10' },
  { id: '2', title: 'Overdue', done: false, due: '2026-11-12' },
  { id: '3', title: 'Future', done: false, due: '2026-11-20' },
  { id: '4', title: 'Done today', done: true, doneOn: '2026-11-16' },
  { id: '5', title: 'Done long ago', done: true, doneOn: '2026-11-01' },
];
const tdy = forDay(todos, '2026-11-16', '2026-11-16').map((t) => t.id).join();
ok('today: overdue first, undated, done last; future hidden', tdy === '2,1,4', tdy);
ok('future day shows its dated to-do but not overdue ones', forDay(todos, '2026-11-20', '2026-11-16').map((t) => t.id).join() === '3,1');
ok('dueOn', dueOn(todos, '2026-11-20').length === 1);

console.log('store');
let s = fresh();
s = apply(s, { type: 'todo/add', title: '  Call the plumber ', created: '2026-11-16' });
s = apply(s, { type: 'todo/add', title: '   ' });
ok('blank to-dos are ignored and titles trimmed', s.todos.length === 1 && s.todos[0].title === 'Call the plumber');
s = apply(s, { type: 'todo/toggle', id: s.todos[0].id, day: '2026-11-16' });
ok('toggle records the day', s.todos[0].done && s.todos[0].doneOn === '2026-11-16');
s = apply(s, { type: 'tracker/save', tracker: { ...water, id: 'w' } });
s = apply(s, { type: 'entry/set', tracker: 'w', day: '2026-11-16', value: 3 });
s = apply(s, { type: 'entry/set', tracker: 'w', day: '2026-11-16', value: null });
ok('a cleared entry is removed', !('2026-11-16' in s.entries.w));
s = apply(s, { type: 'entry/set', tracker: 'w', day: '2026-11-17', value: 0 });
ok('a logged zero is kept (0 drinks counts)', s.entries.w['2026-11-17'] === 0);
s = apply(s, { type: 'event/save', event: { id: 'r', date: '2026-11-02', repeat: 'weekly', start: '08:00', end: '09:00', cal: 'me' } });
s = apply(s, { type: 'event/skip', id: 'r', day: '2026-11-16' });
ok('skip one occurrence', s.events[0].skip[0] === '2026-11-16');
s = apply(s, { type: 'calendar/delete', id: 'me' });
ok('deleting a calendar takes its events', s.events.length === 0 && !s.calendars.some((c) => c.id === 'me'));
ok('migrate fills gaps', migrate({ settings: { from: 360 } }).settings.to === 22 * 60 && migrate(null).calendars.length === 3);

console.log('skylight');
const payload = {
  data: [
    { id: '101', type: 'calendar_event', attributes: { summary: 'Cam soccer', starts_at: '2026-11-16T17:30:00', ends_at: '2026-11-16T18:30:00', all_day: false, location: 'Field 3' }, relationships: { category: { data: { id: '7', type: 'category' } } } },
    { id: '102', type: 'calendar_event', attributes: { summary: 'Thanksgiving', starts_at: '2026-11-26', ends_at: '2026-11-27', all_day: true } },
    { id: '103', type: 'calendar_event', attributes: { summary: 'Trip', starts_at: '2026-11-27', ends_at: '2026-11-30', all_day: true }, relationships: { category: { data: { id: '8' } } } },
    { id: '104', type: 'calendar_event', attributes: { summary: 'Late', starts_at: '2026-11-17T23:00:00', ends_at: '2026-11-18T01:00:00' } },
    { id: '105', type: 'calendar_event', attributes: { summary: 'Broken' } },
  ],
  included: [
    { id: '7', type: 'category', attributes: { label: 'Cam', color: '#ff8800' } },
    { id: '8', type: 'category', attributes: { label: 'Ash', color: '#e64980' } },
  ],
};
const sky = fromSkylight(JSON.stringify(payload));
ok('reads events and skips broken ones', sky.events.length === 4 && sky.skipped === 1);
const soccer = sky.events[0];
ok('timed event', soccer.date === '2026-11-16' && soccer.start === '17:30' && soccer.end === '18:30' && soccer.cal === 'sky-7' && soccer.location === 'Field 3');
ok('categories become calendars with colours', sky.calendars.find((c) => c.id === 'sky-7').name === 'Cam' && sky.calendars.find((c) => c.id === 'sky-7').color === '#ff8800');
ok('one-day all-day has no endDate', sky.events[1].allDay && !sky.events[1].endDate);
ok('multi-day all-day end is exclusive', sky.events[2].endDate === '2026-11-29');
ok('past midnight is cut at the day', sky.events[3].end === '23:59');
ok('range', sky.from === '2026-11-16' && sky.to === '2026-11-29');
ok('plain array works too', fromSkylight([{ id: 1, title: 'x', start: '2026-11-16T09:00:00' }]).events[0].end === '09:30');
let s2 = apply(fresh(), { type: 'import/events', source: 'skylight', ...sky });
s2 = apply(s2, { type: 'import/events', source: 'skylight', ...sky });
ok('re-import does not duplicate', s2.events.length === 4 && s2.calendars.filter((c) => c.id === 'sky-7').length === 1);

const har = { log: { entries: [
  { request: { url: 'https://api.example.test/api/frames/1/calendar_events?date_min=2026-11-15', headers: [{ name: 'Cookie', value: 'secret' }] }, response: { content: { text: JSON.stringify(payload) } } },
  { request: { url: 'https://api.example.test/api/frames/1/calendar_events?date_min=2026-11-15' }, response: { content: { encoding: 'base64', text: Buffer.from(JSON.stringify(payload)).toString('base64') } } },
  { request: { url: 'https://api.example.test/api/frames/1/chores' }, response: { content: { text: '{"data":[]}' } } },
] } };
const fromH = fromHar(har);
ok('HAR: reads calendar responses, base64 too, de-duplicated', fromH.responses === 2 && fromH.events.length === 4);
ok('readAny tells HAR from a paste', readAny(JSON.stringify(har)).responses === 2 && readAny(JSON.stringify(payload)).events.length === 4);
ok('a logged zero weight still gets a badge', status({ kind: 'number' }, 0) === 'done');

console.log('skylight proxy');
const url = new URL(lib.eventsUrl({ frame: '3575532', dateMin: '2026-10-01', dateMax: '2026-11-01', tz: 'America/New_York' }));
ok('builds the calendar_events URL', url.host === 'app.ourskylight.com' && url.pathname === '/api/frames/3575532/calendar_events' && url.searchParams.get('include') === lib.INCLUDE && url.searchParams.get('date_min') === '2026-10-01');
const throws = (f) => { try { f(); return false; } catch (e) { return e instanceof lib.BadInput; } };
ok('frame must be digits (no path tricks)', throws(() => lib.frameId('1/../../users')) && throws(() => lib.frameId('')));
ok('dates are checked', throws(() => lib.eventsUrl({ frame: 1, dateMin: '2026-1-1', dateMax: '2026-02-01' })) && throws(() => lib.eventsUrl({ frame: 1, dateMin: '2026-03-01', dateMax: '2026-02-01' })));
ok('range is capped', throws(() => lib.eventsUrl({ frame: 1, dateMin: '2026-01-01', dateMax: '2026-12-31' })));
ok('time zone is checked', throws(() => lib.timezone('America/New_York&x=1')) && lib.timezone('America/Argentina/Buenos_Aires') === 'America/Argentina/Buenos_Aires');
ok('bare token becomes Bearer', lib.authHeader(' abc123 ') === 'Bearer abc123');
ok('pasted header keeps its scheme', lib.authHeader('Authorization: basic dXNlcjp0b2s=') === 'Basic dXNlcjp0b2s=' && lib.authHeader('bearer xyz') === 'Bearer xyz');
ok('newlines are refused (no header injection)', throws(() => lib.authHeader('abc\r\nX-Evil: 1')));
ok('hint shows only the last four', lib.hint('Bearer abcdefghijkl') === '…ijkl');
ok('frame from a pasted URL', parseFrame('https://app.ourskylight.com/api/frames/3575532/calendar_events?date_min=2026-10-01') === '3575532' && parseFrame(' 42 ') === '42' && parseFrame('nope') === null);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
