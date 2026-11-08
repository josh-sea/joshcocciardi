/* Park Planner: the cloud half of what the planner remembers.
 *
 * The phone stays the copy the app reads and writes. This is what makes it
 * survive the browser clearing its storage and reach a second device, and
 * it is deliberately the slower, optional half: every function here can
 * fail, and the planner carries on when it does.
 *
 *   park_plans/{uid}                 preferences: must-dos, pace, limits
 *   park_plans/{uid}/days/{date_park}  one day at one park
 *
 * Which is the shape the security rules were already written for, back when
 * the planner's own comment said local wins for v1.
 *
 * The merge rule lives in plan.js and is tested there. This file is the
 * Firestore calls and nothing else worth arguing about.
 */

import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { app } from './account.js';
import { dayDocId, readPrefs, readDay, stampOf } from './plan.js';

const db = getFirestore(app);

const prefsRef = (uid) => doc(db, 'park_plans', uid);
const dayRef = (uid, date, park) => doc(db, 'park_plans', uid, 'days', dayDocId(date, park));

/* Reads return null for "nothing there" and also for "could not ask". The
 * caller does the same thing either way: keep what is on the phone. A
 * planner that refuses to draw because Firestore timed out in a queue would
 * be a worse app than the one that never synced at all.
 */
export async function fetchPrefs(uid) {
  try {
    const snap = await getDoc(prefsRef(uid));
    if (!snap.exists()) return null;
    const raw = snap.data();
    return { ...readPrefs(raw), updatedAt: stampOf(raw) };
  } catch { return null; }
}

export async function fetchDay(uid, date, park) {
  try {
    const snap = await getDoc(dayRef(uid, date, park));
    if (!snap.exists()) return null;
    const raw = snap.data();
    return { ...readDay(raw), updatedAt: stampOf(raw) };
  } catch { return null; }
}

/* Writes report whether they landed, because the one thing worse than not
 * syncing is telling someone their plan is saved when it is not.
 */
export async function pushPrefs(uid, prefs) {
  try { await setDoc(prefsRef(uid), prefs); return true; } catch { return false; }
}

export async function pushDay(uid, date, park, day) {
  try { await setDoc(dayRef(uid, date, park), { ...day, date, park }); return true; } catch { return false; }
}

/* Every day on record, newest first: the history.
 *
 * Ordered by document id, which is `date_park` and therefore sorts by date
 * without needing a field index. Capped because this is a list on a phone,
 * not an export.
 */
export async function fetchHistory(uid, max = 60) {
  try {
    const q = query(collection(db, 'park_plans', uid, 'days'), orderBy('__name__', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const raw = d.data();
      const [date, park] = d.id.split('_');
      return {
        id: d.id,
        date: typeof raw.date === 'string' ? raw.date : date,
        park: typeof raw.park === 'string' ? raw.park : park,
        ...readDay(raw),
      };
    }).filter((d) => d.date);
  } catch { return []; }
}
