// Today-screen actions: Hold, Approve, and Send now.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { localParts, timeToMinutes, todayKey } from '../shared/dates';
import type { Payment, QueueDay } from '../shared/types';
import { logEventTx } from '../lib/events';
import { db, paymentsCol, queueCol } from '../lib/firebase';
import { requireUser, str } from '../lib/users';
import { holdUntil, sendReminder } from '../reminders/sendReminder';
import { setQueueItemState } from '../jobs/markPaid';
import { buildQueueFor } from './buildDailyQueue';
import { sendQueueFor } from './sendQueue';

export const queueAction = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const action = str(req.data?.action, 20);
  const paymentId = str(req.data?.paymentId, 100);
  if (!['hold', 'unhold', 'approve', 'unapprove'].includes(action) || !paymentId) {
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
  const today = todayKey(user.timezone);
  const payRef = paymentsCol(uid).doc(paymentId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(payRef);
    if (!snap.exists) throw new HttpsError('not-found', 'That payment is gone.');
    const p = snap.data() as Payment;
    if (action === 'hold') {
      const write = await setQueueItemState(tx, uid, today, paymentId, 'held', ['pending', 'approved', 'failed']);
      if (p.nextReminderDue && p.nextReminderDue <= today) tx.update(payRef, { nextReminderDue: holdUntil(today) });
      write();
      logEventTx(tx, uid, paymentId, 'held', p.reminderStage);
    } else if (action === 'unhold') {
      const write = await setQueueItemState(tx, uid, today, paymentId, 'pending', ['held']);
      if (p.status !== 'paid' && p.status !== 'canceled') tx.update(payRef, { nextReminderDue: today });
      write();
    } else if (action === 'approve') {
      (await setQueueItemState(tx, uid, today, paymentId, 'approved', ['pending', 'failed']))();
    } else {
      (await setQueueItemState(tx, uid, today, paymentId, 'pending', ['approved']))();
    }
  });

  // Approving after the send time has passed sends it right away.
  if (action === 'approve') {
    const { minutes } = localParts(Date.now(), user.timezone);
    const day = (await queueCol(uid).doc(today).get()).data() as QueueDay | undefined;
    const item = day?.items.find((i) => i.paymentId === paymentId);
    if (day?.sentAt && item && minutes >= timeToMinutes(user.queue.sendTime)) {
      const res = await sendReminder(uid, user, paymentId, item.stage, today);
      await db.runTransaction(async (tx) => {
        (await setQueueItemState(tx, uid, today, paymentId, res.ok ? 'sent' : 'failed', ['approved']))();
      });
      return { ok: true, sent: res.ok, reason: res.ok ? null : res.reason };
    }
  }
  return { ok: true };
});

/** "Looks good, send them" / "Send now": send today's list early. */
export const sendNow = onCall({ cors: true, timeoutSeconds: 300 }, async (req) => {
  const { uid, user } = await requireUser(req);
  const today = todayKey(user.timezone);
  // Build today's list first if the morning run hasn't happened yet.
  await buildQueueFor(uid, user, today, { email: false });
  const res = await sendQueueFor(uid, user, today, { manual: true });
  return { ok: true, ...res };
});

/** Build today's list on demand (e.g. right after setup, before morningTime). */
export const refreshToday = onCall({ cors: true }, async (req) => {
  const { uid, user } = await requireUser(req);
  const today = todayKey(user.timezone);
  const { minutes } = localParts(Date.now(), user.timezone);
  if (minutes < timeToMinutes(user.queue.morningTime)) return { ok: true, built: false, today };
  const res = await buildQueueFor(uid, user, today, { email: false });
  return { ok: true, built: res.created, today };
});
