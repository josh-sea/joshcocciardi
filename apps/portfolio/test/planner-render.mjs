/* Park Planner: the planning screen, driven in a real browser.
 *
 * Not wired into CI: it needs Chromium. `plan.test.mjs` covers the storage
 * rules on fixtures and is what CI runs. This covers what fixtures cannot,
 * which here is most of the point, because every change it checks is about
 * what survives a reload:
 *
 *   must-dos and how you walk used to be filed under a date, so they were
 *   gone every morning and you starred the same rides again;
 *
 *   "Rode it" existed only on a suggestion card, so a ride you went on
 *   because you walked past it could not be recorded at all;
 *
 *   a Lightning Lane asked for both ends of a window that is always an hour.
 *
 * None of those is a crash, and all three look fine in a screenshot. So this
 * reloads the page and asserts on what came back.
 *
 *   node apps/portfolio/test/planner-render.mjs
 *
 * Exits non-zero if any case fails. The live wait API is stubbed, so it is
 * deterministic and runs offline.
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const APP = new URL('../../disney-trivia/', import.meta.url).pathname;
const PORT = 8901;

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

const server = await serve();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

let bad = 0;
const ok = (n, c, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x)));
  if (!c) bad++;
};

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});

/* The live board, stubbed. Real waits would make this non-deterministic and
 * need a network; what is under test is what the page remembers, not what
 * the API said.
 */
/* Real ids from the committed catalogue, because the ride list is drawn
 * from that and the live feed only decorates it. Made-up ids would show as
 * no stars at all and the test would pass for the wrong reason.
 */
const SPACE = 'b2260923-9315-40fd-9c6b-44dd811dbe64';
const TRON = '5a43d1a7-ad53-4d25-abfe-25625f0da304';
const MANSION = '2551a77d-023f-4ab1-9a19-8afec0190f39';

const RIDES = [
  { id: SPACE, name: 'Space Mountain', wait: 35 },
  { id: TRON, name: 'TRON Lightcycle / Run', wait: 70 },
  { id: MANSION, name: 'Haunted Mansion', wait: 20 },
];

await page.route('**/api.themeparks.wiki/**', (route) => {
  const url = route.request().url();
  if (url.includes('/live')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      liveData: RIDES.map((r) => ({
        id: r.id, name: r.name, entityType: 'ATTRACTION', status: 'OPERATING',
        queue: { STANDBY: { waitTime: r.wait } },
      })),
    }) });
  }
  if (url.includes('/schedule')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schedule: [] }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
// The archive nudge and any Firestore read are not what this is about.
await page.route('**/firestore.googleapis.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
await page.route('**/api/park/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

/* A returning visitor who already declined the music, and who starred two
 * rides yesterday under the old key. That is the state the migration has to
 * cope with, and it is a real stored record, not a test hook.
 */
const YESTERDAY = '2026-11-05';
await page.addInitScript(([legacyKey, ids]) => {
  try {
    localStorage.setItem('disneyTrivia.musicOn', 'no');
    localStorage.setItem('parkPlanner.park', 'mk');
    localStorage.setItem(legacyKey, JSON.stringify({
      done: [ids.MANSION], mustDo: [ids.SPACE, ids.TRON], llWindows: [],
      skipHeld: false, pace: 95, maxWaitMin: 45,
    }));
  } catch { /* ignore */ }
}, [`parkPlanner.day.${YESTERDAY}.mk`, { SPACE, TRON, MANSION }]);

/* The ride list and the ridden list are each inside a collapsed <details>,
 * so nothing in them is visible until it is opened.
 */
const openPlanner = async () => {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.click('#game-pl');
  await page.waitForSelector('#pl-list .pl-row', { state: 'attached', timeout: 20000 });
  await page.$$eval('#pl details.pl-fold', (els) => els.forEach((d) => { d.open = true; }));
};

await openPlanner();

/* ── the migration ─────────────────────────────────────────────────────────
 *
 * Stars set yesterday have to be here today. Without this the change reads
 * as "the app forgot everything I had starred", which is the complaint it
 * exists to fix.
 */
const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('parkPlanner.prefs') || 'null'));
ok('a preferences record is written on first load', !!prefs, prefs);
ok('with yesterday\'s stars carried across',
  prefs && [SPACE, TRON].every((id) => prefs.mustDo.includes(id)), prefs && prefs.mustDo);
ok('and the settings that went with them', prefs && prefs.pace === 95 && prefs.maxWaitMin === 45
  && prefs.skipHeld === false, prefs);

const prefsKeyDated = await page.evaluate(() =>
  Object.keys(localStorage).some((k) => /^parkPlanner\.prefs\./.test(k)));
ok('and the preferences key carries no date, which is the whole point', !prefsKeyDated, null);

// The day half stays where it was, without the settings it no longer owns.
const legacy = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'),
  `parkPlanner.day.${YESTERDAY}.mk`);
ok('yesterday\'s day record keeps what was ridden', legacy && legacy.done.includes(MANSION), legacy);
ok('and no longer carries the settings', legacy && legacy.mustDo === undefined, legacy);

/* The stars are on screen, which is the difference between migrating the
 * record and the page actually using it.
 */
const starred = await page.$$eval('#pl-list .pl-star[aria-pressed="true"]',
  (els) => els.map((e) => e.closest('.pl-row').querySelector('.pl-name').textContent));
ok(`the stars are drawn (${starred.length})`, starred.length === 2, starred);

/* ── ticking off any ride ──────────────────────────────────────────────────
 *
 * "Rode it" was only on a suggestion card, so a ride you walked past and
 * went on could not be recorded, and the planner kept offering it.
 */
const ticks = await page.$$('#pl-list .pl-tick');
ok(`every ride row has a tick (${ticks.length})`, ticks.length === (await page.$$('#pl-list .pl-row')).length,
  ticks.length);

const nameOf = (i) => page.$eval(`#pl-list .pl-row:nth-child(${i}) .pl-name`, (e) => e.textContent);
const target = await nameOf(1);
await page.click('#pl-list .pl-row:nth-child(1) .pl-tick');
await page.waitForFunction(() => document.querySelectorAll('#pl-list .pl-tick[aria-pressed="true"]').length > 0,
  null, { timeout: 5000 });

const doneNames = await page.$$eval('#pl-done button', (els) => els.map((e) => e.textContent));
ok('ticking a ride records it as ridden', doneNames.includes(target), { target, doneNames });

// The star must not have moved: the two controls share a row and tapping one
// must not do the other's job.
const starsAfter = await page.$$eval('#pl-list .pl-star[aria-pressed="true"]', (els) => els.length);
ok('and does not change what is starred', starsAfter === 2, starsAfter);

// Tapping the row opens the ride's chart; the tick must not.
const curveOpen = await page.$eval('#pl-curve', (e) => !e.hidden);
ok('nor open the ride chart by accident', !curveOpen, curveOpen);

// It survives a reload, which is the only claim that matters here.
await openPlanner();
const doneAfter = await page.$$eval('#pl-done button', (els) => els.map((e) => e.textContent));
ok('and it is still there after a reload', doneAfter.includes(target), doneAfter);

// And it un-ticks.
await page.click('#pl-list .pl-tick[aria-pressed="true"]');
await page.waitForFunction(() => document.querySelectorAll('#pl-list .pl-tick[aria-pressed="true"]').length === 0,
  null, { timeout: 5000 });
const doneCleared = await page.$$eval('#pl-done button', (els) => els.map((e) => e.textContent));
ok('tapping it again un-ticks the ride', !doneCleared.includes(target), doneCleared);

/* ── a Lightning Lane is an hour ───────────────────────────────────────────
 *
 * Both ends used to be typed, which asked for something the app knew and
 * let you enter a window ending before it started.
 */
const hasEnd = await page.$('#pl-ll-end');
ok('there is no second time field to fill in', hasEnd === null, null);

await page.$eval('#pl-ll-ride', (e, id) => { e.value = id; }, SPACE);
await page.fill('#pl-ll-start', '14:30');
await page.click('#pl-ll-add');
await page.waitForSelector('#pl-ll-list .pl-llrow', { timeout: 5000 });

const llText = await page.$eval('#pl-ll-list .pl-llrow span', (e) => e.textContent);
ok('the window it stores runs for an hour',
  /\b2:30\s*(?:AM|PM)?\s*[\u2013-]\s*3:30\b/i.test(llText.replace(/\u202f|\u00a0/g, ' ')), llText);

const stored = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^parkPlanner\.day\./.test(x)
    && (JSON.parse(localStorage.getItem(x) || '{}').llWindows || []).length);
  return k ? JSON.parse(localStorage.getItem(k)).llWindows[0] : null;
});
ok('and stores both ends, so the planner still reasons about a window',
  stored && new Date(stored.end) - new Date(stored.start) === 3600000, stored);

// Asking without a time says so rather than storing a window onto nothing.
await page.fill('#pl-ll-start', '');
await page.$eval('#pl-ll-ride', (e, id) => { e.value = id; }, TRON);
await page.click('#pl-ll-add');
const err = await page.$eval('#pl-ll-error', (e) => e.textContent);
ok('and a missing start time is refused with a reason', /start time/i.test(err), err);

/* ── the settings survive too ─────────────────────────────────────────── */
await openPlanner();
const pace = await page.$eval('#pl-pace', (e) => e.value);
const maxWait = await page.$eval('#pl-maxwait', (e) => e.value);
ok('the walking pace is still what it was', pace === '95', pace);
ok('and the wait limit', maxWait === '45', maxWait);

/* ── signed out is still the default, and still offline ───────────────────
 *
 * The planner's first promise is that it starts with no network at all.
 * Loading 300KB of auth SDK on every open, to discover that nobody is
 * signed in, would quietly break that. So the test is not "does sign-in
 * work" but "was Firebase left alone".
 */
const sdk = [];
page.on('request', (r) => { if (/gstatic\.com\/firebasejs/.test(r.url())) sdk.push(r.url()); });
await openPlanner();
ok('signed out, no Firebase SDK is fetched at all', sdk.length === 0, sdk.slice(0, 2));

const says = await page.$eval('#pl-acct-says', (e) => e.textContent);
ok('and the page says the plan is only on this device', /this device only/i.test(says), says);
ok('offering a way to fix that', await page.$('#pl-acct-google') !== null, null);
ok('with the sign-out button hidden', await page.$eval('#pl-acct-out', (e) => e.hidden), null);
ok('and no history section, since there is nothing to show',
  await page.$eval('#pl-history-fold', (e) => e.hidden), null);

// The email form is a second step rather than two fields competing with the
// Google button.
ok('the email field is out of the way until asked for',
  await page.$eval('#pl-acct-email', (e) => e.hidden), null);
await page.click('#pl-acct-email-open');
ok('and appears when it is', !(await page.$eval('#pl-acct-email', (e) => e.hidden)), null);

// A bad address is refused locally, without a round trip. This loads the
// SDK, which is the point at which loading it is justified.
await page.fill('#pl-acct-address', 'not-an-address');
await page.click('#pl-acct-send');
await page.waitForFunction(() => document.getElementById('pl-acct-error').textContent.length > 0,
  null, { timeout: 15000 });
const addrErr = await page.$eval('#pl-acct-error', (e) => e.textContent);
ok('an address with no @ is refused with a reason', /email address/i.test(addrErr), addrErr);
ok('and the SDK is only fetched once sign-in is actually asked for', sdk.length > 0, sdk.length);

// Everything above still has to be true with the account block present.
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on a phone', overflow <= 1, overflow);

ok('no uncaught exceptions and no console errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
server.close();
console.log(bad ? `\n${bad} failing` : '\nall passing');
process.exit(bad ? 1 : 0);
