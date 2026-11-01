#!/usr/bin/env node
/* Park Planner: keep the archive inside the API's lookback window.
 *
 * The archive can only ever be built from days the API will still talk
 * about. That window is the plan's, not ours: seven days with no key, thirty
 * with a free one, four hundred on Pro. A day that falls out of it is gone
 * for good, and no amount of backfilling later brings it back.
 *
 * Which makes this the one job in the repo with a deadline. Everything else
 * can be re-run whenever. This cannot: it has to have run before each day
 * ages past the floor, or that day is simply missing from the record
 * forever.
 *
 * So it runs daily, not fortnightly. A day's worth of exposure rather than
 * fourteen, for the same handful of API calls, and three consecutive
 * failures still leave a fortnight of slack to notice in. The cost argument
 * for a longer gap does not exist: in the steady state this is four range
 * calls for the daily summaries and four park-days of hourly detail, against
 * a free-key budget of six hundred history calls an hour.
 *
 * It asks for no particular window. Both endpoints work out what they are
 * missing inside whatever the key can currently reach, so this is a gap
 * sweep rather than a "fetch yesterday": a run that was skipped is made good
 * by the next one, as long as that happens while the days are still
 * readable. That self-healing is the whole point, and it is why the job
 * passes no dates.
 *
 * Why Node and not more bash. The two backfill workflows each carry about
 * eighty lines of curl and status-code arithmetic, and the knowledge in them
 * is worth more than that: a 403 is a token, a 504 is Hosting's sixty-second
 * cap, a 500 with no JSON body is a killed container and therefore memory, a
 * 200 that does not say `keyed` is a run that silently walked seven days.
 * That belongs in one place that a test can drive, which a curl loop is not.
 *
 * Needs, both already in place for the other jobs:
 *   PARK_TOKEN   the token stored in Firestore at park_secrets/collector.
 *   the API key   in Firestore at park_secrets/collector { apiKey }.
 *
 * PARK_ARCHIVE_URL and PARK_HOURS_URL are optional overrides for the two
 * endpoints. Unset, the job goes through the site's own rewrites, which is
 * the normal path.
 */

import { realpathSync } from 'node:fs';

/* www, not the bare host. joshcocciardi.com answers 301, and while fetch
 * follows redirects it is not worth finding out whether undici keeps a
 * custom header across an origin change. The first real run of the daily
 * backfill died on exactly this redirect.
 */
export const DEFAULTS = {
  archive: 'https://www.joshcocciardi.com/api/park/archive',
  hours: 'https://www.joshcocciardi.com/api/park/hours',
};

/* Passes per endpoint. The steady state needs one each. The headroom is for
 * a run that has a gap to close: the daily side takes one range call per
 * thirty-one park-days, the hourly side one call per park-day, so a
 * fortnight's gap is fifty-six park-days of hourly detail and still well
 * inside a single pass's time budget. Eight is for the case where it is not.
 */
export const PASSES = { archive: 4, hours: 8 };

export const CALL_TIMEOUT_MS = 75 * 1000;

/* A condition a person has to do something about, as opposed to a run that
 * merely has more to do.
 */
export class Fail extends Error {}

const KEYLESS = [
  'The run was NOT using the ThemeParks API key, so it can only reach back',
  'seven days. On a daily schedule that silently shrinks the archive to a',
  'week while reporting success, which is worse than failing.',
  '',
  'Add the key in the Firebase console under Firestore -> park_secrets ->',
  'collector, as a field named apiKey, alongside the existing token field.',
].join('\n');

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/* One request. Everything that comes back is either a body to read or a
 * reason to stop; nothing is shrugged off.
 */
export async function once({ url, token, fetchImpl, timeoutMs = CALL_TIMEOUT_MS }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { 'X-Park-Token': token },
      signal: ac.signal,
      redirect: 'follow',
    });
  } catch (err) {
    throw new Fail(`the request did not complete: ${(err && err.message) || err}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (body === null || typeof body !== 'object') body = null;

  const status = res.status;

  if (status === 403) {
    throw new Fail('403: the token does not match park_secrets/collector.token.');
  }
  if (status === 504) {
    throw new Fail([
      '504: Firebase Hosting cut the request off at its 60s cap. The function',
      'may still be writing. This job resumes where it stopped, so a single',
      '504 costs nothing; if it keeps happening, BUDGET_MS in',
      'functions/parkhistory-limits.cjs is too close to the cap.',
    ].join('\n'));
  }
  /* A 500 whose body is not this handler's JSON is a killed container rather
   * than a reported failure, and what kills it is memory. The two are
   * indistinguishable from the status code alone, and only one of them is a
   * code change away.
   */
  if (status === 500 && !body) {
    throw new Fail([
      '500 with no JSON body: the function was killed rather than returning',
      'an error, which for these jobs means it ran out of memory. Check the',
      'memory on parkArchiveHours (2GiB) and parkArchive (256MiB).',
    ].join('\n'));
  }
  if (status < 200 || status >= 300) {
    throw new Fail(`HTTP ${status} from the endpoint.${text ? `\n${text.slice(0, 500)}` : ''}`);
  }
  if (!body) {
    throw new Fail(`a ${status} whose body is not JSON:\n${text.slice(0, 500)}`);
  }

  return body;
}

const describe = (body) => {
  const bits = [`stored ${num(body.stored, 0)}`];
  if (num(body.left, null) !== null) bits.push(`${body.left} left`);
  if (body.incomplete) bits.push('incomplete');
  if (body.rateLimited) bits.push('rate limited');
  return bits.join(', ');
};

/* Drive one endpoint to a stop, and say which stop it was.
 *
 *   done     nothing left to fetch.
 *   budget   the API's hourly history budget ran out. Expected on a large
 *            catch-up and not a failure: the next run carries on.
 *   stuck    two passes in a row stored nothing while still reporting work
 *            outstanding. Asking again cannot help, so stop asking and say
 *            so, rather than burn thirty passes rediscovering it.
 *   passes   still making progress when the passes ran out. Legitimate for a
 *            long catch-up; the next run continues.
 *
 * `stuck` is the one that earns its keep. A permanent gap the API will not
 * serve, or a bug, otherwise shows up as a job that reports work outstanding
 * for ever while looking busy.
 */
export async function runEndpoint({ name, url, token, passes, fetchImpl, log = () => {},
                                    timeoutMs = CALL_TIMEOUT_MS }) {
  let left = null;
  let idle = 0;

  for (let pass = 1; pass <= passes; pass++) {
    const body = await once({ url, token, fetchImpl, timeoutMs });
    log(`  ${name} pass ${pass}: ${describe(body)}`);

    /* Checked on the first pass only, since later passes are the same
     * request. A keyless run stores what it fetched perfectly well; there is
     * just a week of it instead of a month.
     */
    if (pass === 1 && body.keyed !== true) throw new Fail(KEYLESS);

    left = num(body.left, left);

    if (body.rateLimited === true) return { outcome: 'budget', left, passes: pass };
    if (!body.incomplete) return { outcome: 'done', left, passes: pass };

    if (num(body.stored, 0) > 0) idle = 0;
    else if (++idle >= 2) return { outcome: 'stuck', left, passes: pass };
  }

  return { outcome: 'passes', left, passes };
}

export async function catchUp({ token, urls = DEFAULTS, fetchImpl = fetch, log = () => {},
                                passes = PASSES, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  if (!token) throw new Fail('PARK_TOKEN is not set.');

  const out = {};
  /* Daily first. The hourly side only asks for days the daily archive
   * already holds, so a yesterday collected in the same run is one the
   * hourly pass can then profile, rather than one it picks up tomorrow.
   */
  for (const name of ['archive', 'hours']) {
    log(`${name}: ${urls[name]}`);
    out[name] = await runEndpoint({
      name, url: urls[name], token, passes: passes[name], fetchImpl, log, timeoutMs,
    });
  }
  return out;
}

/* What the run means, in one place, so the exit code and the words agree.
 *
 * `stuck` is the only outcome that fails the job. Running out of passes or
 * out of API budget is a long catch-up behaving correctly, and failing a
 * daily job for that would train us to ignore it.
 */
export function verdict(out) {
  const lines = [];
  let ok = true;

  for (const [name, res] of Object.entries(out)) {
    // Only worth saying when there is something left; "up to date, 0 still
    // missing" is two facts where one will do.
    const left = res.left ? ` ${res.left} park-days still missing.` : '';
    if (res.outcome === 'done') {
      lines.push(`${name}: up to date.${left}`);
    } else if (res.outcome === 'budget') {
      lines.push(`${name}: out of hourly API budget after ${res.passes} passes.${left}`
        + ' The next run carries on.');
    } else if (res.outcome === 'passes') {
      lines.push(`${name}: still working through a gap after ${res.passes} passes.${left}`
        + ' The next run carries on.');
    } else {
      ok = false;
      lines.push(`${name}: no progress over two passes while still reporting work`
        + ` outstanding.${left}`);
    }
  }

  // Once, at the end, however many halves are stuck. Said twice it reads
  // like two problems.
  if (!ok) {
    lines.push('');
    lines.push('Asking again will not help, so this stopped rather than spending');
    lines.push('the budget rediscovering it. Something is wrong: either days are');
    lines.push('being asked for that the API will not serve, or a write is');
    lines.push('failing. Check the function logs for parkArchive and');
    lines.push('parkArchiveHours.');
  }

  return { ok, text: lines.join('\n') };
}

async function main() {
  const token = process.env.PARK_TOKEN || '';
  const urls = {
    archive: process.env.PARK_ARCHIVE_URL || DEFAULTS.archive,
    hours: process.env.PARK_HOURS_URL || DEFAULTS.hours,
  };

  try {
    const out = await catchUp({ token, urls, log: (m) => console.log(m) });
    const { ok, text } = verdict(out);
    console.log('');
    console.log(text);
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.log('');
    if (err instanceof Fail) {
      console.error(err.message);
    } else {
      console.error(`unexpected: ${(err && err.stack) || err}`);
    }
    process.exit(1);
  }
}

const here = realpathSync(new URL(import.meta.url).pathname);
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (here === invoked) await main();
