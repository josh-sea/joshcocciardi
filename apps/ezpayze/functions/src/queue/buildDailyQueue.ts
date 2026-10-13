// The morning checklist. Every 15 minutes we look for owners whose local
// morningTime has passed and who don't have today's checklist yet, collect
// every payment whose next reminder is due today or earlier, write
// queue/{today}, and email the owner the list.

import type { QueueDay, QueueItem, EzUser, Payment, PlanRequest } from '../shared/types';
import { daysBetween, passedLocalTime } from '../shared/dates';
import { nextStep } from '../shared/schedule';
import { appSettings } from '../lib/config';
import { COL, db, paymentsCol, planRequestsCol, queueCol } from '../lib/firebase';
import { normalizeUser } from '../lib/users';
import { NotConfiguredError, sendEmail } from '../email/provider';
import { renderMorningEmail } from '../email/morningEmail';
import { logger } from 'firebase-functions';

export async function dueItems(uid: string, user: EzUser, today: string): Promise<QueueItem[]> {
  const snap = await paymentsCol(uid).where('nextReminderDue', '<=', today).get();
  const ladderOpts = { reminderSchedule: user.reminderSchedule, courtesyNote: user.courtesyNote };
  const items: QueueItem[] = [];
  for (const doc of snap.docs) {
    const p = doc.data() as Payment;
    if (p.status === 'paid' || p.status === 'canceled' || p.paused) continue;
    const step = nextStep(p, ladderOpts);
    if (!step) continue;
    items.push({
      paymentId: doc.id,
      stage: p.reminderStage,
      kind: step.kind,
      channel: p.customerEmail ? 'email' : 'sms',
      state: 'pending',
      customerName: p.customerName,
      jobTitle: p.installment ? `${p.jobTitle} (payment ${p.installment.number} of ${p.installment.of})` : p.jobTitle,
      amount: p.amount,
      daysLate: Math.max(0, daysBetween(p.dueDate, today)),
    });
  }
  // Oldest debts first.
  items.sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
  return items;
}

/** Build today's checklist for one owner if it doesn't exist yet. */
export async function buildQueueFor(uid: string, user: EzUser, today: string, opts: { email: boolean }) {
  const ref = queueCol(uid).doc(today);
  const items = await dueItems(uid, user, today);
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    const day: QueueDay = { date: today, items, readyAt: Date.now(), sentAt: null, morningEmailSentAt: null };
    tx.set(ref, day);
    return true;
  });
  if (!created) return { created: false, count: 0 };

  if (opts.email) {
    const requests = await planRequestsCol(uid).where('status', '==', 'pending').get();
    if (items.length || !requests.empty) {
      try {
        const settings = await appSettings();
        const mail = renderMorningEmail(user, items, requests.docs.map((d) => ({ id: d.id, ...(d.data() as PlanRequest) })), {
          appUrl: settings.appUrl,
          today,
        });
        await sendEmail({
          to: user.email,
          fromName: 'EzPayze',
          fromEmail: settings.fromEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          idempotencyKey: `ezpayze-morning-${uid}-${today}`,
        });
        await ref.update({ morningEmailSentAt: Date.now() });
      } catch (err) {
        if (!(err instanceof NotConfiguredError)) logger.error('morning email failed', { uid, err: (err as Error).message });
      }
    }
  }
  return { created: true, count: items.length };
}

/** Scheduled sweep. Owners are few per project, so a full scan is fine. */
export async function buildDailyQueues(now = Date.now()) {
  const users = await db.collection(COL.users).where('onboardingComplete', '==', true).get();
  let built = 0;
  for (const doc of users.docs) {
    const user = normalizeUser(doc.data() as Partial<EzUser>);
    const dateKey = passedLocalTime(now, user.timezone, user.queue.morningTime);
    if (!dateKey) continue;
    try {
      const res = await buildQueueFor(doc.id, user, dateKey, { email: true });
      if (res.created) built++;
    } catch (err) {
      logger.error('buildQueue failed', { uid: doc.id, err: (err as Error).message });
    }
  }
  return built;
}
