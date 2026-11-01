/* Park Planner: the daily catch-up that keeps the archive inside the window.
 *
 * This job has a property none of the others do: the thing it collects
 * expires. A day the API will no longer serve is gone, so the failure that
 * matters is not a crash, it is a run that reports success having done less
 * than it should. Three of those are reachable here and all three are
 * checked: a keyless run that quietly walks seven days instead of thirty, a
 * killed container that looks like a server error, and a job that reports
 * work outstanding for ever while making no progress.
 */

import assert from 'node:assert/strict';
import {
  once, runEndpoint, catchUp, verdict, Fail, DEFAULTS, PASSES,
} from '../../../scripts/park-catchup.mjs';

let checks = 0;
const is = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };

/* A fetch that answers a scripted list of responses, and records what it was
 * asked. Each entry is { status, body } where a string body is sent as-is
 * and an object is sent as JSON.
 */
function scripted(responses) {
  const calls = [];
  let i = 0;
  const impl = async (url, opts) => {
    calls.push({ url, headers: (opts && opts.headers) || {} });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (typeof r === 'function') return r();
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { status: r.status === undefined ? 200 : r.status, text: async () => text };
  };
  impl.calls = calls;
  return impl;
}

const fails = async (fn, re, m) => {
  try {
    await fn();
  } catch (err) {
    ok(err instanceof Fail, `${m} (is a Fail)`);
    ok(re.test(err.message), `${m}: ${err.message.split('\n')[0]}`);
    return;
  }
  assert.fail(`${m}: expected a failure`);
};

const base = { url: 'https://x/api', token: 't' };

/* ── one request ───────────────────────────────────────────────────────────
 *
 * Each status means a different thing to do about it, which is the whole
 * reason this is not a curl loop.
 */

is(await once({ ...base, fetchImpl: scripted([{ body: { keyed: true, stored: 3 } }]) }),
  { keyed: true, stored: 3 }, 'a 200 with JSON comes back as the body');

// The token goes in X-Park-Token, never Authorization: Firebase Hosting does
// not forward Authorization through a rewrite, and a stripped header reads as
// an unauthenticated run that succeeds.
{
  const f = scripted([{ body: { keyed: true } }]);
  await once({ ...base, fetchImpl: f });
  is(f.calls[0].headers['X-Park-Token'], 't', 'the token travels as X-Park-Token');
  is(f.calls[0].headers.Authorization, undefined, 'and not as Authorization, which Hosting strips');
}

await fails(() => once({ ...base, fetchImpl: scripted([{ status: 403, body: { error: 'no' } }]) }),
  /403: the token does not match/, 'a 403 names the token');

await fails(() => once({ ...base, fetchImpl: scripted([{ status: 504, body: '' }]) }),
  /Hosting cut the request off/, 'a 504 is Hosting\'s cap, not a broken function');

// The one worth telling apart: Cloud Run killing the container answers 500
// with its own plain-text body, which from the status code alone is
// indistinguishable from the handler reporting a failure.
await fails(() => once({ ...base, fetchImpl: scripted([{ status: 500, body: 'Internal Server Error' }]) }),
  /ran out of memory/, 'a 500 with no JSON body is an out-of-memory kill');

await fails(() => once({ ...base, fetchImpl: scripted([{ status: 500, body: { error: 'reported' } }]) }),
  /^HTTP 500 from the endpoint/, 'a 500 that is this handler\'s own JSON is not called a memory problem');

await fails(() => once({ ...base, fetchImpl: scripted([{ status: 200, body: '<html>nope</html>' }]) }),
  /body is not JSON/, 'a 200 of HTML is a failure, not an empty result');

await fails(() => once({ ...base, fetchImpl: scripted([{ status: 302, body: '' }]) }),
  /^HTTP 302/, 'a redirect that was not followed to an answer is a failure');

await fails(() => once({ ...base, fetchImpl: async () => { throw new Error('ECONNRESET'); } }),
  /did not complete: ECONNRESET/, 'a network error says so');

// The timeout has to fire rather than hang a runner for its whole budget.
await fails(() => once({
  ...base,
  timeoutMs: 5,
  fetchImpl: (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }),
}), /did not complete/, 'a call that never answers is aborted');

/* ── driving one endpoint to a stop ────────────────────────────────────── */

const drive = (responses, passes = 8) => runEndpoint({
  name: 'x', ...base, passes, fetchImpl: scripted(responses),
});

is(await drive([{ body: { keyed: true, stored: 0 } }]),
  { outcome: 'done', left: null, passes: 1 },
  'no `incomplete` is the end of it, in one pass');

is(await drive([
  { body: { keyed: true, stored: 8, incomplete: true } },
  { body: { keyed: true, stored: 8, incomplete: true } },
  { body: { keyed: true, stored: 2 } },
]), { outcome: 'done', left: null, passes: 3 },
  'an incomplete pass is continued until it is not');

is(await drive([
  { body: { keyed: true, stored: 60, left: 40, incomplete: true, rateLimited: true } },
]), { outcome: 'budget', left: 40, passes: 1 },
  'the API\'s hourly budget stops the run and reports what is left');

// The one that earns its keep. Without it a permanent gap, or a failing
// write, is a job that looks busy for ever: thirty passes a run, every run,
// reporting work outstanding and never doing any.
is(await drive([
  { body: { keyed: true, stored: 0, left: 12, incomplete: true } },
  { body: { keyed: true, stored: 0, left: 12, incomplete: true } },
  { body: { keyed: true, stored: 0, left: 12, incomplete: true } },
]), { outcome: 'stuck', left: 12, passes: 2 },
  'two passes that store nothing while still incomplete is a stop, not a loop');

// But one idle pass is not stuck: the daily endpoint spends a pass on
// rollups alone, storing no days, and then has nothing left to do.
is(await drive([
  { body: { keyed: true, stored: 0, incomplete: true } },
  { body: { keyed: true, stored: 0 } },
]), { outcome: 'done', left: null, passes: 2 },
  'a single pass spent on rollups is not mistaken for being stuck');

// And progress resets it, so a slow gap close is never called stuck.
is(await drive([
  { body: { keyed: true, stored: 0, left: 9, incomplete: true } },
  { body: { keyed: true, stored: 4, left: 5, incomplete: true } },
  { body: { keyed: true, stored: 0, left: 5, incomplete: true } },
  { body: { keyed: true, stored: 5, left: 0 } },
]), { outcome: 'done', left: 0, passes: 4 },
  'an idle pass between productive ones does not end the run');

is((await drive([{ body: { keyed: true, stored: 7, left: 3, incomplete: true } }], 3)),
  { outcome: 'passes', left: 3, passes: 3 },
  'running out of passes while still progressing is its own outcome');

/* The silent downgrade this job exists to prevent. A keyless run reaches
 * back seven days, stores them perfectly, and answers 200.
 */
await fails(() => drive([{ body: { stored: 7, keyed: false } }]),
  /NOT using the ThemeParks API key/, 'a keyless run fails rather than quietly archiving a week');

await fails(() => drive([{ body: { stored: 7 } }]),
  /NOT using the ThemeParks API key/, 'a body with no `keyed` at all is treated the same way');

// Checked on the first pass only: later passes are the same request, and a
// body that omits the field mid-run must not fail a run already proven keyed.
is(await drive([
  { body: { keyed: true, stored: 8, incomplete: true } },
  { body: { stored: 1 } },
]), { outcome: 'done', left: null, passes: 2 },
  'the key check is a first-pass check');

/* ── both endpoints ───────────────────────────────────────────────────── */

{
  const f = scripted([{ body: { keyed: true, stored: 1 } }]);
  const out = await catchUp({ token: 't', fetchImpl: f });
  is(Object.keys(out), ['archive', 'hours'], 'both halves run');
  // Daily first: the hourly side only asks for days the daily archive holds,
  // so yesterday collected in this run is profiled in this run too.
  ok(f.calls[0].url.endsWith('/archive'), 'the daily archive goes first');
  ok(f.calls[1].url.endsWith('/hours'), 'then the hourly detail');
}

await fails(() => catchUp({ token: '', fetchImpl: scripted([{ body: {} }]) }),
  /PARK_TOKEN is not set/, 'a missing token is caught before any request');

ok(DEFAULTS.archive.startsWith('https://www.'), 'the default host is www: the bare host answers 301');
ok(DEFAULTS.hours.startsWith('https://www.'), 'for both endpoints');
ok(PASSES.hours > PASSES.archive, 'the hourly side gets more passes, being one call per park-day');

/* ── what the run means ───────────────────────────────────────────────── */

{
  const v = verdict({ archive: { outcome: 'done', left: null, passes: 1 } });
  ok(v.ok, 'up to date passes');
  ok(/up to date/.test(v.text), 'and says so');
}
{
  const v = verdict({ hours: { outcome: 'budget', left: 40, passes: 2 } });
  ok(v.ok, 'running out of API budget is not a failure: the next run carries on');
  ok(/40 park-days still missing/.test(v.text), 'and it says how many are left');
}
{
  // "up to date, 0 park-days still missing" is two facts where one will do.
  const v = verdict({ hours: { outcome: 'done', left: 0, passes: 1 } });
  is(v.text, 'hours: up to date.', 'nothing missing is not worth a sentence');
}
{
  // The explanation belongs at the end once, not after each stuck half:
  // twice reads like two separate problems.
  const v = verdict({
    archive: { outcome: 'stuck', left: 2, passes: 2 },
    hours: { outcome: 'stuck', left: 3, passes: 2 },
  });
  is(v.text.match(/Asking again will not help/g).length, 1,
    'the explanation is given once however many halves are stuck');
  ok(/archive: no progress/.test(v.text) && /hours: no progress/.test(v.text),
    'while both halves are still named');
}
{
  const v = verdict({ hours: { outcome: 'passes', left: 12, passes: 8 } });
  ok(v.ok, 'running out of passes while progressing is not a failure either');
}
{
  const v = verdict({ hours: { outcome: 'stuck', left: 12, passes: 2 } });
  ok(!v.ok, 'making no progress IS a failure, so it reaches a person');
  ok(/no progress over two passes/.test(v.text), 'and names the condition');
}
{
  // One bad half fails the run even when the other is fine.
  const v = verdict({
    archive: { outcome: 'done', left: null, passes: 1 },
    hours: { outcome: 'stuck', left: 3, passes: 2 },
  });
  ok(!v.ok, 'a healthy daily half does not excuse a stuck hourly one');
}

console.log(`parkcatchup: ${checks} assertions passed`);
process.exit(0);
