/* Park Planner: the history screen, driven in a real browser.
 *
 * Not wired into CI: it needs Chromium and the live archive. `hist.test.mjs`
 * covers the arithmetic on fixtures and is what CI runs. This covers the half
 * that arithmetic cannot: that the thing actually draws.
 *
 * That distinction earned its place. The planner's first chart reused a class
 * name that was already its status strip, inherited `align-items: center`
 * from it, and rendered bars with the correct height, no width, and a page
 * that looked entirely plausible. Every number behind it was right. So this
 * measures elements rather than trusting a screenshot.
 *
 * Self-contained: it reads the real archive from the public Firestore REST
 * API, builds the rollups with the same module the Cloud Function uses, and
 * serves them to the page from a route stub. No fixture to go stale, and the
 * rollup builder is exercised on production data every run.
 *
 *   node apps/portfolio/test/history-render.mjs
 *
 * Exits non-zero if any case fails, and writes a full-page screenshot beside
 * itself as history.png.
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// Playwright is installed globally here and resolves by require, not as a
// bare ESM specifier.
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const roll = require('../../../functions/parkrollup.js');

const APP = new URL('../../disney-trivia/', import.meta.url).pathname;
const PROJECT = 'josh-cocciardi';
const KEY = 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc';
const PORT = 8899;

/* The real archive, read the way anyone could: these documents are public by
 * rule. Paged until Firestore stops handing out a token, rather than a fixed
 * number of rounds, which is how an earlier version of this quietly tested
 * three parks and a truncated fourth.
 */
async function archive() {
  const un = (v) => {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('nullValue' in v) return null;
    if ('mapValue' in v) {
      return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, un(x)]));
    }
    return null;
  };
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/park_history`;
  const docs = [];
  let token = '';
  for (;;) {
    const res = await fetch(`${base}?key=${KEY}&pageSize=200${token ? `&pageToken=${token}` : ''}`);
    if (!res.ok) throw new Error(`archive -> ${res.status}`);
    const body = await res.json();
    for (const d of body.documents || []) {
      if (!d.fields || !d.fields.date) continue;
      docs.push(Object.fromEntries(
        Object.entries(d.fields).filter(([k]) => k !== 'fetchedAt').map(([k, v]) => [k, un(v)])));
    }
    token = body.nextPageToken || '';
    if (!token) break;
  }
  return docs;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
                '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = join(APP, rel || 'index.html');
      if (!file.startsWith(APP) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}

console.log('reading the live archive…');
const docs = await archive();
const rollups = {};
for (const park of ['mk', 'ep', 'hs', 'ak']) {
  const built = roll.build(park, docs.filter((d) => d.park === park));
  if (!built) continue;
  const { rides, ...head } = built;
  rollups[park] = { head, rides };
}
console.log(`${docs.length} park-days, rolled up into ${Object.keys(rollups).length} parks`);
if (!rollups.mk) { console.log('no Magic Kingdom archive to draw'); process.exit(1); }

const server = await serve();

// Plain JSON -> Firestore's typed REST shape, so the stub is indistinguishable
// from the real endpoint as far as the client is concerned.
const wrap = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(wrap) } };
  return { mapValue: { fields: wrapFields(v) } };
};
const wrapFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, wrap(v)]));

let served = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

// A returning visitor who already declined the music, so the offer dialog
// is not sitting over the tab strip. This is a real stored state, not a
// test hook: index.html reads this exact key.
await page.addInitScript(() => {
  try { localStorage.setItem('disneyTrivia.musicOn', 'no'); } catch { /* ignore */ }
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.route('**/firestore.googleapis.com/**/park_rollups/**', (route) => {
  const url = route.request().url();
  const name = decodeURIComponent(url.split('/park_rollups/')[1].split('?')[0]);
  served.push(name);
  const park = name.replace(/_rides$/, '');
  const r = rollups[park];
  if (!r) return route.fulfill({ status: 404, body: '{}' });
  const body = name.endsWith('_rides')
    ? { fields: wrapFields({ park, from: r.head.from, to: r.head.to, days: r.head.days, rides: r.rides }) }
    : { fields: wrapFields(r.head) };
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
// Keep it offline and deterministic: the live wait API has no part in this.
await page.route('**/api.themeparks.wiki/**', (r) => r.abort());

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.click('#game-hx');
await page.waitForSelector('#hx-months .hx-col', { timeout: 15000 });
await page.waitForSelector('#hx-rides .hx-ride', { timeout: 15000 });

let bad = 0;
const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); if (!c) bad++; };

// --- the bug this prefix exists for: height without width
const barBox = await page.$$eval('#hx-months .hx-col i', (els) =>
  els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
ok(`every month bar has width (${barBox.length} bars)`, barBox.every((b) => b.w > 0), barBox.slice(0, 3));
ok('and height', barBox.every((b) => b.h > 0), barBox.slice(0, 3));
ok('and at least one is tall, so it is a chart not a flat line',
  Math.max(...barBox.map((b) => b.h)) > 40, Math.max(...barBox.map((b) => b.h)));

const dayBox = await page.$$eval('#hx-days .hx-col i', (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().width)));
ok(`seven weekday bars, all with width`, dayBox.length === 7 && dayBox.every((w) => w > 0), dayBox);

const labels = await page.$$eval('#hx-days .hx-col span', (e) => e.map((x) => x.textContent));
ok('weekdays start on Monday', labels[0] === 'Mon' && labels[6] === 'Sun', labels);

// Bars alone cannot carry a 15-vs-20 difference at this size, so the figure
// is written under each one. Without it the chart is honest and unreadable.
const vals = await page.$$eval('#hx-days .hx-col em', (e) => e.map((x) => x.textContent));
ok('every weekday bar shows its number', vals.length === 7 && vals.every((v) => /^\d/.test(v)), vals);
console.log('   weekdays read:', labels.map((l, i) => `${l} ${vals[i]}`).join('  '));
const monthVals = await page.$$eval('#hx-months .hx-col em', (e) => e.map((x) => x.textContent));
ok('and so does every month bar', monthVals.every((v) => v === '' || /^\d/.test(v)), monthVals);

// --- it loaded the small doc first, then the big one
ok('the park doc is fetched before the rides doc', served[0] === 'mk' && served.includes('mk_rides'), served);

// --- the ride list
const rows = await page.$$eval('#hx-rides .hx-ride', (els) => els.map((e) => ({
  name: e.querySelector('strong').textContent,
  min: Number(e.querySelector('b').textContent),
  w: Math.round(e.getBoundingClientRect().width),
})));
ok(`the ride list rendered (${rows.length} rides)`, rows.length > 5, rows.length);

// The list is capped so the charts above it are not buried. The cap must be
// a cap, not a silent truncation: the button has to say how many there are.
const moreText = await page.textContent('#hx-more');
ok('the list is capped and says how many it is hiding', /Show all \d+ rides/.test(moreText), moreText);
ok('and the cap is actually applied', rows.length <= 12, rows.length);
await page.click('#hx-more');
await page.waitForFunction(() => document.querySelectorAll('#hx-rides .hx-ride').length > 12);
const allRows = await page.$$eval('#hx-rides .hx-ride', (e) => e.length);
ok(`expanding shows them all (${allRows})`, allRows > 12, allRows);
await page.click('#hx-more');
await page.waitForFunction(() => document.querySelectorAll('#hx-rides .hx-ride').length <= 12);
ok('and it collapses again', true, null);

// Page height, because the reason for the cap was a four-thousand-pixel page.
const tall = await page.evaluate(() => document.documentElement.scrollHeight);
ok(`the page is a readable length (${tall}px)`, tall < 2600, tall);
ok('ranked busiest first', rows.every((r, i) => i === 0 || rows[i - 1].min >= r.min), rows.slice(0, 4));
ok('every row has width', rows.every((r) => r.w > 100), rows.slice(0, 2));
console.log('   busiest three:', rows.slice(0, 3).map((r) => `${r.name} ${r.min}min`).join(', '));

// --- nothing scrolls sideways, which is the phone failure mode
const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal scroll at 390px', over <= 0, over);

// --- interaction: a range preset
const summaryBefore = await page.textContent('#hx-summary');
const tripChip = await page.$('#hx-ranges button:has-text("Trip week 2025")');
ok('the trip-week preset is offered', !!tripChip, null);
if (tripChip) {
  await tripChip.click();
  await page.waitForFunction((b) => document.getElementById('hx-summary').textContent !== b, summaryBefore);
  const after = await page.textContent('#hx-summary');
  ok('choosing it changes the summary', after !== summaryBefore, { summaryBefore, after });
  ok('and the summary compares with the usual', /than usual|exactly average/.test(after), after);
  console.log('   trip week says:', after.trim());
  const when = await page.textContent('#hx-range-when');
  console.log('   range shown as:', when.trim());
}

// --- interaction: tapping a month
await page.click('#hx-ranges button:has-text("Whole window")');
const monthLabel = await page.$eval('#hx-months .hx-col:nth-child(3) span', (e) => e.textContent);
await page.click('#hx-months .hx-col:nth-child(3)');
await page.waitForTimeout(200);
const onCount = await page.$$eval('#hx-months .hx-col[data-on="yes"]', (e) => e.length);
ok(`tapping a month (${monthLabel}) marks exactly one bar`, onCount === 1, onCount);

// --- interaction: opening a ride
await page.click('#hx-rides .hx-ride');
await page.waitForSelector('#hx-ride-detail:not([hidden])');
const ride = await page.evaluate(() => ({
  name: document.getElementById('hx-ride-name').textContent,
  says: document.getElementById('hx-ride-says').textContent,
  extremes: [...document.querySelectorAll('#hx-ride-extremes li')].map((l) => l.textContent),
  months: document.querySelectorAll('#hx-ride-months .hx-col').length,
  days: document.querySelectorAll('#hx-ride-days .hx-col').length,
}));
ok('a ride opens with a name', !!ride.name, ride.name);

// The panel must sit above the list, or tapping the top ride opens something
// forty rows below the tap.
const order = await page.evaluate(() => {
  const d = document.getElementById('hx-ride-detail');
  const l = document.getElementById('hx-rides');
  return d.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING ? 'detail first' : 'list first';
});
ok('the detail panel comes before the ride list', order === 'detail first', order);
ok('and says something about it', ride.says.length > 20, ride.says);
ok('and names its quietest and busiest day with dates',
  ride.extremes.length === 2 && ride.extremes.every((t) => /\d{4}/.test(t)), ride.extremes);
ok('and draws its own month chart', ride.months > 6, ride.months);
ok('and its own weekday chart', ride.days === 7, ride.days);
console.log('   ride:', ride.name);
for (const e of ride.extremes) console.log('     ' + e);

const rideBars = await page.$$eval('#hx-ride-months .hx-col i', (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().width)));
ok('the ride chart bars have width too', rideBars.every((w) => w > 0), rideBars.slice(0, 3));

await page.screenshot({ path: new URL('./history.png', import.meta.url).pathname, fullPage: true });

// --- switching parks
// The old park's rows must be gone the moment the park changes, not left
// on screen until the new ones arrive, so this asserts the gap exists before
// waiting for the new list. Waiting on `.hx-ride` alone would have matched
// the previous park's rows and passed while showing the wrong data.
const mkFirst = await page.$eval('#hx-rides .hx-ride strong', (e) => e.textContent);
await page.click('#hx-parks button:has-text("Hollywood Studios")');
await page.waitForFunction(() => document.querySelectorAll('#hx-rides .hx-ride').length === 0,
  null, { timeout: 5000 });
ok('the old park\'s rides are cleared immediately', true, null);
await page.waitForSelector('#hx-rides .hx-ride');
const hsRows = await page.$$eval('#hx-rides .hx-ride strong', (e) => e.map((x) => x.textContent));
ok('and the new list is a different park', hsRows[0] !== mkFirst, { mkFirst, hs: hsRows[0] });
ok('switching park reloads the ride list', hsRows.length > 5 && hsRows.join().includes('Slinky'), hsRows.slice(0, 3));
ok('and the detail panel closed with it', await page.$eval('#hx-ride-detail', (e) => e.hidden), null);
console.log('   HS busiest:', hsRows.slice(0, 3).join(', '));

ok('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
server.close();
console.log(bad ? `\n${bad} failing` : '\nall passing');
process.exit(bad ? 1 : 0);
