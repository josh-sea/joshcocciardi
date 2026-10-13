// Render and send one reminder for one payment, then advance its stage.
//
// Idempotency: before anything goes out we create
// payments/{id}/events/send_{stage} inside a transaction that also re-checks
// the payment (still unpaid, not paused, still on this stage). Firestore's
// create() fails if that doc exists, so two callers racing on the same stage
// can't both send. The provider call also carries an idempotency key, so a
// retry after a crash mid-send doesn't double-send either. If the send fails
// the claim is removed and the item can be tried again.

import { FieldValue } from 'firebase-admin/firestore';
import { hasSms, isPro, SMS_MONTHLY_CAP } from '../shared/billing';
import { addDays } from '../shared/dates';
import { nextAfterSend, nextStep } from '../shared/schedule';
import { renderReminder } from '../shared/templates';
import type { EzUser, Job, Payment, ReminderKind } from '../shared/types';
import { appSettings, paypageSecret } from '../lib/config';
import { eventData } from '../lib/events';
import { bucket, db, eventsCol, jobsCol, paymentsCol, userRef } from '../lib/firebase';
import { PAY_TOKEN_TTL_MS, signToken } from '../lib/token';
import { isEmail, NotConfiguredError, sendEmail } from '../email/provider';
import { sendSms } from '../sms/provider';

export type SendResult =
  | { ok: true; channel: 'email' | 'sms'; kind: ReminderKind }
  | { ok: false; reason: string; retry: boolean };

const STALE_CLAIM_MS = 10 * 60 * 1000;
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

export async function payPageUrl(uid: string, paymentId: string): Promise<string> {
  const [{ appUrl }, secret] = await Promise.all([appSettings(), paypageSecret()]);
  const token = signToken({ u: uid, p: paymentId, exp: Date.now() + PAY_TOKEN_TTL_MS }, secret);
  return `${appUrl}/pay/${token}`;
}

async function loadAttachments(uid: string, paths: string[]) {
  const out: { filename: string; content: string }[] = [];
  let total = 0;
  for (const path of paths.slice(0, 5)) {
    if (!path.startsWith(`ezpayze/users/${uid}/`)) continue;
    try {
      const file = bucket().file(path);
      const [meta] = await file.getMetadata();
      const size = Number(meta.size ?? 0);
      if (total + size > MAX_ATTACH_BYTES) continue;
      const [buf] = await file.download();
      total += buf.length;
      out.push({ filename: path.split('/').pop()!.replace(/^\d+-/, ''), content: buf.toString('base64') });
    } catch {
      // A missing file never blocks the reminder itself.
    }
  }
  return out;
}

export async function sendReminder(
  uid: string,
  user: EzUser,
  paymentId: string,
  expectedStage: number,
  today: string,
): Promise<SendResult> {
  const paymentRef = paymentsCol(uid).doc(paymentId);
  const claimRef = eventsCol(uid, paymentId).doc(`send_${expectedStage}`);
  const ladderOpts = { reminderSchedule: user.reminderSchedule, courtesyNote: user.courtesyNote };

  // 1. Re-check and claim.
  let payment: Payment;
  let kind: ReminderKind;
  try {
    const claimed = await db.runTransaction(async (tx) => {
      const [snap, claim] = await Promise.all([tx.get(paymentRef), tx.get(claimRef)]);
      if (!snap.exists) return { skip: 'missing' };
      const p = snap.data() as Payment;
      if (p.status === 'paid' || p.status === 'canceled') return { skip: 'paid' };
      if (p.paused) return { skip: 'paused' };
      if (p.reminderStage !== expectedStage) return { skip: 'already_sent' };
      const step = nextStep(p, ladderOpts);
      if (!step) return { skip: 'ladder_done' };
      if (claim.exists) {
        const c = claim.data()!;
        if (c.meta?.state === 'sent') return { skip: 'already_sent' };
        if (Date.now() - (c.at ?? 0) < STALE_CLAIM_MS) return { skip: 'in_progress' };
      }
      tx.set(claimRef, eventData('reminder_sent', expectedStage, { state: 'sending', kind: step.kind }));
      return { payment: p, kind: step.kind };
    });
    if ('skip' in claimed) return { ok: false, reason: claimed.skip as string, retry: false };
    payment = claimed.payment as Payment;
    kind = claimed.kind as ReminderKind;
  } catch (err) {
    return { ok: false, reason: `claim_failed: ${(err as Error).message}`, retry: true };
  }

  // 2. Render and send.
  const pro = isPro(user.subscription);
  const wantsSms = hasSms(user.subscription) && !!payment.customerPhone;
  const wantsEmail = isEmail(payment.customerEmail);
  if (!wantsEmail && !wantsSms) {
    await claimRef.delete();
    return { ok: false, reason: 'No email address for this customer.', retry: false };
  }

  try {
    const settings = await appSettings();
    const link = await payPageUrl(uid, paymentId);
    const offerPlan =
      kind === 'final' && pro && user.offerPaymentPlans && !payment.installment && payment.amount >= 200;
    const job = (await jobsCol(uid).doc(payment.jobId).get()).data() as Job | undefined;
    const attachments = pro && wantsEmail && job?.attachments?.length ? await loadAttachments(uid, job.attachments) : [];
    const rendered = renderReminder(user, payment, {
      kind,
      today,
      allowCustomWording: pro,
      payPageUrl: link,
      planOfferUrl: offerPlan ? `${link}?plan=1` : null,
      attachmentNote: attachments.length ? 'A copy of your invoice is attached.' : null,
    });

    let channel: 'email' | 'sms' = 'email';
    const meta: Record<string, unknown> = { state: 'sent', kind };
    if (wantsEmail) {
      const res = await sendEmail({
        to: payment.customerEmail!,
        fromName: `${user.businessName} via EzPayze`,
        fromEmail: settings.fromEmail,
        replyTo: user.replyToEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments,
        idempotencyKey: `ezpayze-${uid}-${paymentId}-${expectedStage}`,
      });
      meta.emailId = res.id;
      meta.to = payment.customerEmail;
    }
    if (wantsSms) {
      const month = today.slice(0, 7);
      const allowed = await db.runTransaction(async (tx) => {
        const u = await tx.get(userRef(uid));
        const used = Number(u.get(`usage.sms.${month}`) ?? 0);
        if (used >= SMS_MONTHLY_CAP) return false;
        tx.update(userRef(uid), { [`usage.sms.${month}`]: FieldValue.increment(1) });
        return true;
      });
      if (allowed) {
        try {
          const res = await sendSms(payment.customerPhone!, rendered.sms);
          meta.smsSid = res.sid;
          if (!wantsEmail) channel = 'sms';
        } catch (err) {
          if (!wantsEmail) throw err;
          meta.smsError = (err as Error).message;
        }
      } else {
        if (!wantsEmail) throw new Error('Monthly text limit reached.');
        meta.smsError = 'monthly_cap';
      }
    }
    meta.channel = channel;

    // 3. Advance the stage and mark the claim sent.
    const nextDue = nextAfterSend(payment, ladderOpts, today);
    const batch = db.batch();
    batch.update(paymentRef, {
      reminderStage: expectedStage + 1,
      lastReminderSent: Date.now(),
      nextReminderDue: nextDue,
      status: payment.dueDate < today ? 'overdue' : payment.dueDate === today ? 'due' : 'scheduled',
    });
    batch.set(claimRef, eventData('reminder_sent', expectedStage, meta));
    if (offerPlan) batch.set(eventsCol(uid, paymentId).doc(), eventData('plan_offered', expectedStage));
    await batch.commit();
    return { ok: true, channel, kind };
  } catch (err) {
    await claimRef.delete().catch(() => undefined);
    const notConfigured = err instanceof NotConfiguredError;
    return { ok: false, reason: (err as Error).message, retry: !notConfigured };
  }
}

/** Push a payment's next reminder to tomorrow ("Hold"). */
export function holdUntil(today: string): string {
  return addDays(today, 1);
}
