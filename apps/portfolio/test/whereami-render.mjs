/* Where Am I — adding photos and guessing on a real map, in a real browser.
 *
 * Not wired into CI: it needs Chromium. `geo.test.mjs` and `exif.test.mjs`
 * cover the arithmetic and the byte parsing, which is where the subtle bugs
 * live. This covers the half those cannot: that the screen actually does the
 * thing.
 *
 * Firebase is stubbed at the module boundary rather than over the network.
 * The game imports `store.js` lazily inside `init()`, so a service worker
 * style intercept would be fighting the module loader; serving a stand-in
 * `store.js` from the test's own server is both simpler and exact.
 *
 *   node apps/portfolio/test/whereami-render.mjs
 *
 * Exits non-zero if any case fails. No network: tiles and the Leaflet CDN
 * are stubbed too, so it runs offline and deterministically.
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const APP = new URL('../../disney-trivia/', import.meta.url).pathname;
const PORT = 8903;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
                '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

/* A stand-in for store.js: the same exports, backed by an array. Every round
 * the page adds lands here and can be read back, which is what makes "did it
 * actually save the location and the region" checkable.
 */
const FAKE_STORE = `
let rounds = [];
export const _rounds = () => rounds;
export function currentUid() { return 'test-uid'; }
export async function ready() { return 'test-uid'; }
export async function urlFor() {
  // A 2x2 red PNG, so the peephole has something with real dimensions.
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAACddGYaAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
}
export async function myDecks() { return []; }
export async function forget() {}
export async function createDeck() { return deckStub(); }
export async function openDeck() { return deckStub(); }
export async function getDeck() { return deckStub(); }
export async function setTolerance() {}
export async function listScores() { return []; }
export async function saveScore() {}
export async function removeRound(deckId, round) {
  rounds = rounds.filter((r) => r.id !== round.id);
}
export async function listRounds() { return rounds.slice(); }
export async function addRound(deckId, { photoFile, park, answer, label, at, start }) {
  const r = { id: 'r' + (rounds.length + 1), photo: { path: 'p', w: 2, h: 2 }, park,
              label: label || '', createdByUid: 'test-uid' };
  if (answer) r.answer = { park, x: answer.x, y: answer.y };
  if (at) r.at = { lat: at.lat, lng: at.lng, from: at.from };
  if (start) r.start = { x: start.x, y: start.y, r: start.r };
  rounds.push(r);
  window.__added = rounds.slice();
  return r;
}
function deckStub() { return { id: 'd1', name: 'Test', tolerance: 0.08, memberUids: ['test-uid'] }; }
export async function shrink() { return { blob: new Blob(), w: 2, h: 2 }; }
export async function loadImage() { return new Image(); }
`;

/* Leaflet, stubbed. The real library is 150KB from a CDN and this test has
 * no business asserting that someone else's map works; what matters is that
 * the game asks it for the right things. So the stub records every call.
 */
const FAKE_LEAFLET = `
window.__leaflet = { pins: {}, rings: [], views: [], frames: [] };
window.L = {
  map(el) {
    const m = {
      setView(c, z) { window.__leaflet.views.push({ c, z }); return m; },
      on(ev, fn) { if (ev === 'click') window.__leaflet.click = fn; return m; },
      addLayer() {}, removeLayer() {}, remove() {},
      invalidateSize() {},
      fitBounds(b) { window.__leaflet.frames.push(b); },
      dragging: stubHandler(), scrollWheelZoom: stubHandler(),
      doubleClickZoom: stubHandler(), touchZoom: stubHandler(),
    };
    el.setAttribute('data-map', 'yes');
    return m;
  },
  tileLayer() { return { addTo() {} }; },
  marker(latlng, opts) {
    const o = { addTo() { return o; }, _latlng: latlng, _opts: opts };
    window.__leaflet.pins[opts.icon.options.className] = latlng;
    return o;
  },
  divIcon(options) { return { options }; },
  circle(latlng, opts) {
    window.__leaflet.rings.push({ latlng, radius: opts.radius });
    return { addTo() {} };
  },
};
function stubHandler() { return { enable() {}, disable() {} }; }
`;

function serve() {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      const path = decodeURIComponent(req.url.split('?')[0]);
      const send = (body, type) => {
        res.writeHead(200, { 'content-type': type });
        res.end(body);
      };
      if (path === '/js/store.js') return send(FAKE_STORE, 'text/javascript');

      const rel = path.replace(/^\/+/, '');
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
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 },
  permissions: ['geolocation'],
  // Just outside Space Mountain, so "use my location" has a real answer and
  // the park has to be worked out from it.
  geolocation: { latitude: 28.41932, longitude: -81.57767 },
});
const page = await ctx.newPage();

let bad = 0;
const ok = (n, c, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x)));
  if (!c) bad++;
};

const errors = [];
page.on('pageerror', (e) => { errors.push(String(e)); if (process.env.WA_DEBUG) console.log('PAGEERROR', String(e)); });
page.on('console', (m) => {
  if (process.env.WA_DEBUG) console.log('CONSOLE', m.type(), m.text());
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});

// Leaflet's CDN, stubbed. Both files, because the module waits on the script
// and the stylesheet is requested alongside it.
await page.route('**/cdnjs.cloudflare.com/**/leaflet.js', (r) =>
  r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_LEAFLET }));
await page.route('**/cdnjs.cloudflare.com/**/leaflet.css', (r) =>
  r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());

await page.addInitScript(() => {
  try { localStorage.setItem('disneyTrivia.musicOn', 'no'); } catch { /* ignore */ }
});

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.click('#game-wa');
/* Get into a deck. The door is what shows first; the deck panes stay hidden
 * until one is open. The stubbed store accepts anything, so this is the
 * shortest path to the two panes under test.
 */
await page.waitForSelector('#door', { state: 'visible', timeout: 20000 });
await page.waitForSelector('#open-name', { state: 'visible', timeout: 10000 });
await page.fill('#open-name', 'Test');
await page.fill('#open-pass', 'hunter2hunter2');
await page.click('#form-open button[type="submit"]');
await page.waitForSelector('#mode-add', { state: 'visible', timeout: 15000 });
await page.click('#mode-add');
await page.waitForSelector('#add-photo', { state: 'visible', timeout: 10000 });

/* ── adding photos, several at once ───────────────────────────────────────
 *
 * The old flow was one photo at a time with four decisions each, which is
 * why decks stayed small.
 */
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEB'
  + 'AQEAAAAAAAAAAAECAwQFBgcICQoL/9oACAEBAAA/AKrAH//Z', 'base64');

await page.setInputFiles('#add-photo', [
  { name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  { name: 'c.jpg', mimeType: 'image/jpeg', buffer: jpeg },
]);
await page.waitForSelector('#add-queue', { state: 'visible', timeout: 10000 });

const count = await page.$eval('#add-count', (e) => e.textContent);
ok('picking several photos queues them', /1 of 3/.test(count), count);

// The circle appears without having to be discovered.
await page.waitForSelector('#add-circle:not([hidden])', { timeout: 10000 });
const circle0 = await page.$eval('#add-circle', (e) => {
  const r = e.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
});
ok('a start circle is on the photo from the off', circle0.w > 0 && circle0.h > 0, circle0);
ok('and it is round', Math.abs(circle0.w - circle0.h) <= 1, circle0);

// Dragging moves it.
const img = await page.$('#add-preview');
const box = await img.boundingBox();
await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.33, { steps: 4 });
await page.mouse.up();
const circle1 = await page.$eval('#add-circle', (e) => {
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y) };
});
ok('dragging moves the circle', circle1.x !== circle0.x || circle1.y !== circle0.y,
  { before: circle0, after: circle1 });

// The slider sizes it.
await page.$eval('#add-size', (e) => { e.value = '25'; e.dispatchEvent(new Event('input')); });
const circle2 = await page.$eval('#add-circle', (e) => Math.round(e.getBoundingClientRect().width));
ok('the slider sizes it', circle2 > circle0.w, { before: circle0.w, after: circle2 });

/* The location. Nothing can be saved without one, which is the point: a
 * round with no coordinates is the thing this change exists to stop making.
 */
ok('nothing can be added before there is a location',
  await page.$eval('#add-save', (e) => e.disabled), null);

await page.click('#add-here');
await page.waitForFunction(() => !document.getElementById('add-save').disabled,
  null, { timeout: 15000 });

const where = await page.$eval('#add-where', (e) => e.textContent);
ok('the phone\'s location names the park it is in', /Magic Kingdom/.test(where), where);
ok('and says where the location came from', /this phone/.test(where), where);

await page.fill('#add-label', 'By the castle');
await page.click('#add-save');
await page.waitForFunction(() => /2 of 3/.test(document.getElementById('add-count').textContent),
  null, { timeout: 15000 });
ok('saving moves straight on to the next photo', true, null);

const saved = await page.evaluate(() => window.__added);
ok('one round was saved', saved.length === 1, saved.length);
{
  const r = saved[0];
  ok('with real coordinates', Math.abs(r.at.lat - 28.41932) < 1e-4 && Math.abs(r.at.lng + 81.57767) < 1e-4, r.at);
  ok('marked as coming from the phone', r.at.from === 'gps', r.at);
  ok('with the park worked out from them', r.park === 'mk', r.park);
  ok('and the start region', r.start && r.start.r > 0, r.start);
  ok('whose centre is where the circle was dragged to, not the middle',
    Math.abs(r.start.x - 0.5) > 0.05 || Math.abs(r.start.y - 0.5) > 0.05, r.start);
  ok('and no pin on the artwork, because there is nothing to place one from',
    r.answer === undefined, r.answer);
  ok('the label came too', r.label === 'By the castle', r.label);
}

// Skipping leaves nothing behind.
await page.click('#add-skip');
await page.waitForFunction(() => /3 of 3/.test(document.getElementById('add-count').textContent),
  null, { timeout: 10000 });
ok('skipping a photo adds nothing', (await page.evaluate(() => window.__added)).length === 1, null);

/* ── guessing on a real map ──────────────────────────────────────────────── */

await page.click('#mode-play');
await page.waitForSelector('#play-live', { state: 'visible', timeout: 15000 });
await page.waitForSelector('#park-pick button', { timeout: 10000 });

// Picking the park brings up the real map, not the drawing.
await page.click('#park-pick button');
await page.waitForSelector('#geowrap[data-map="yes"]', { timeout: 15000 });
ok('a round with coordinates is guessed on a real map', true, null);
ok('and the drawn map stays hidden', await page.$eval('#mapwrap', (e) => e.hidden), null);

const centred = await page.evaluate(() => window.__leaflet.views[0]);
ok('centred on the park that was picked',
  centred && Math.abs(centred.c[0] - 28.41932) < 0.01, centred);

// A tap on the map is a guess. Driven through the stub's recorded handler,
// because the tiles are not real and there is nothing to click on.
ok('nothing can be locked in before a guess',
  await page.$eval('#lockin', (e) => e.disabled), null);
await page.evaluate(() => window.__leaflet.click({ latlng: { lat: 28.41950, lng: -81.57790 } }));
await page.waitForFunction(() => !document.getElementById('lockin').disabled, null, { timeout: 5000 });
ok('tapping the map makes a guess', true, null);

await page.click('#lockin');
await page.waitForSelector('#verdict:not([hidden])', { timeout: 10000 });
const verdict = await page.$eval('#verdict', (e) => e.textContent);
ok('the verdict is in metres, not a share of a picture', /\d+\s*m\b/.test(verdict), verdict);
ok('and it is a near miss, not a wrong park', /Nailed it|Close enough/.test(verdict), verdict);

const ring = await page.evaluate(() => window.__leaflet.rings.at(-1));
ok('a ring shows how close counted', ring && ring.radius === 60, ring);
const pins = await page.evaluate(() => Object.keys(window.__leaflet.pins));
ok('both the guess and the answer are on the map',
  pins.some((k) => /guess/.test(k)) && pins.some((k) => /answer/.test(k)), pins);
const framed = await page.evaluate(() => window.__leaflet.frames.length);
ok('and the map frames them both so the gap is visible', framed > 0, framed);

// No horizontal overflow on a phone, with a map in the page.
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow on a phone', overflow <= 1, overflow);

ok('no uncaught exceptions and no console errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
server.close();
console.log(bad ? `\n${bad} failing` : '\nall passing');
process.exit(bad ? 1 : 0);
