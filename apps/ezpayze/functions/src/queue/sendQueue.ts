// Sending the checklist. At each owner's local sendTime we send what is still
// on today's list: everything pending in "auto" mode, only approved items in
// "approve" mode. "Send now" runs the same code early.

import { logger } from 'firebase-functions';
import { passedLocalTime } from '../shared/dates';
import type { EzUser, QueueDay, QueueItem } from '../shared/types';
import { COL, db, queueCol } from '../lib/firebase';
import { normalizeUser } from '../lib/users';
import { sendReminder } from '../reminders/sendReminder';

/** In "approve" mode only items the owner approved go out, even on Send now. */
export function shouldSend(item: QueueItem, mode: EzUser['queue']['mode']): boolean {
  if (item.state === 'approved') return true;
  return item.state === 'pending' && mode === 'auto';
}

/** Send today's list for one owner. Safe to call twice: sends are idempotent. */
export async function sendQueueFor(uid: string, user: EzUser, today: string, opts: { manual: boolean }) {
  const ref = queueCol(uid).doc(today);
  const snap = await ref.get();
  if (!snap.exists) return { sent: 0, failed: 0 };
  const day = snap.data() as QueueDay;
  if (day.sentAt && !opts.manual) return { sent: 0, failed: 0 };

  const results = new Map<string, Partial<QueueItem>>();
  let sent = 0;
  let failed = 0;
  for (const item of day.items) {
    if (!shouldSend(item, user.queue.mode)) continue;
    const res = await sendReminder(uid, user, item.paymentId, item.stage, today);
    if (res.ok) {
      sent++;
      results.set(item.paymentId, { state: 'sent', channel: res.channel });
    } else if (res.reason === 'paid') {
      results.set(item.paymentId, { state: 'paid' });
    } else if (['paused', 'already_sent', 'ladder_done', 'missing'].includes(res.reason)) {
      results.set(item.paymentId, { state: 'skipped' });
    } else {
      failed++;
      results.set(item.paymentId, { state: 'failed', error: res.reason.slice(0, 200) });
    }
  }

  // Merge results onto the latest copy so a "Got paid" tapped mid-send sticks.
  await db.runTransaction(async (tx) => {
    const latest = (await tx.get(ref)).data() as QueueDay;
    const items = latest.items.map((i) => {
      const r = results.get(i.paymentId);
      if (!r) return i;
      if (i.state === 'paid' && r.state !== 'sent') return i;
      const next = { ...i, ...r };
      if (r.state !== 'failed') delete next.error;
      return next;
    });
    const update: Partial<QueueDay> = { items };
    if (!opts.manual || user.queue.mode === 'auto' || !items.some((i) => i.state === 'pending')) update.sentAt = Date.now();
    tx.update(ref, update);
  });
  return { sent, failed };
}

export async function sendDueQueues(now = Date.now()) {
  const users = await db.collection(COL.users).where('onboardingComplete', '==', true).get();
  let total = 0;
  for (const doc of users.docs) {
    const user = normalizeUser(doc.data() as Partial<EzUser>);
    const dateKey = passedLocalTime(now, user.timezone, user.queue.sendTime);
    if (!dateKey) continue;
    try {
      const { sent } = await sendQueueFor(doc.id, user, dateKey, { manual: false });
      total += sent;
    } catch (err) {
      logger.error('sendQueue failed', { uid: doc.id, err: (err as Error).message });
    }
  }
  return total;
}
