// Nightly housekeeping: roll payment statuses forward (scheduled -> due ->
// overdue), end expired trials, and recompute every summary to fix drift.

import { logger } from 'firebase-functions';
import { isPro } from '../shared/billing';
import { todayKey } from '../shared/dates';
import { openStatus } from '../shared/schedule';
import type { EzUser, Payment } from '../shared/types';
import { COL, db, paymentsCol, userRef } from '../lib/firebase';
import { normalizeUser } from '../lib/users';
import { recomputeSummary } from './onPaid';

export async function rollupUser(uid: string, user: EzUser, now = Date.now()) {
  const today = todayKey(user.timezone, now);
  const snap = await paymentsCol(uid).where('status', 'in', ['scheduled', 'due', 'overdue']).get();
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    const p = d.data() as Payment;
    const status = openStatus(p.dueDate, today);
    if (status === p.status) continue;
    batch.update(d.ref, { status });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  const sub = user.subscription;
  if (sub.status === 'trialing' && !isPro(sub, now)) {
    await userRef(uid).update({ subscription: { ...sub, plan: 'free', status: 'active', trialEndsAt: null } });
  }
  await recomputeSummary(uid, user);
}

export async function nightly(now = Date.now()) {
  const users = await db.collection(COL.users).get();
  for (const doc of users.docs) {
    try {
      await rollupUser(doc.id, normalizeUser(doc.data() as Partial<EzUser>), now);
    } catch (err) {
      logger.error('rollup failed', { uid: doc.id, err: (err as Error).message });
    }
  }
}
