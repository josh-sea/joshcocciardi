/* Park Planner: keeping the wait-time archive topped up.
 *
 * ThemeParks.wiki holds every wait-time change back to 2021, but a free key
 * may only read the last 30 days of it. So each day has to be copied into our
 * own store while it is still readable, and after that it is ours for good.
 *
 * There is no scheduler doing that. GitHub's cron gave us one run in thirteen
 * hours when we tried it for the live collector, and a day missed here cannot
 * be recovered once it ages out of the window. So the app does it: opening the
 * planner is the trigger.
 *
 * All this file decides is *whether* to poke the endpoint. The endpoint works
 * out which days are missing, fetches them and writes them; it takes no input
 * from us, so a poke can only ever cause the right thing or nothing at all.
 * We keep it to once per park-day per device, which is enough, since the
 * endpoint is idempotent and four people opening the app on the same day
 * should not mean four runs.
 */

import { parkDate } from './parkdata.js';

export const ENDPOINT = '/api/park/archive';
const STAMP = 'parkPlanner.archive.lastDay';

/* Has today's poke already happened?
 *
 * Keyed on the *park's* date, not the device's. The archive is a record of
 * park-days, and a phone in another zone must not get a second vote on when
 * a park day rolls over.
 */
export function shouldNudge(lastDay, today) {
  if (!today) return false;
  return lastDay !== today;
}

const read = () => { try { return localStorage.getItem(STAMP); } catch { return null; } };
const write = (d) => { try { localStorage.setItem(STAMP, d); } catch { /* private mode; poke again next load */ } };

/* Fire and forget, with one deliberate asymmetry: the stamp is written
 * *before* the request, not after it.
 *
 * Writing it after would mean a device with no signal pokes on every single
 * load, which is the state the planner is most often in. A missed day is not
 * lost by giving up for the rest of the day either: the endpoint walks the
 * whole readable window, so tomorrow's poke collects today's and yesterday's
 * alike. Being late costs nothing until a day falls out of the window, which
 * takes a week.
 */
export async function nudge({ now = new Date(), fetchImpl = fetch } = {}) {
  const today = parkDate(now);
  if (!shouldNudge(read(), today)) return { skipped: 'already today' };
  write(today);

  try {
    const res = await fetchImpl(ENDPOINT, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { failed: res.status };
    return { ran: await res.json().catch(() => null) };
  } catch (err) {
    // Offline in a queue is the normal case, not an error worth surfacing.
    return { failed: String(err && err.message || err) };
  }
}
