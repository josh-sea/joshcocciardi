// "Send me a sample": email the owner exactly what a customer would get, so
// they can see it in their own inbox before trusting it with real customers.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { isPro } from '../shared/billing';
import { addDays, todayKey } from '../shared/dates';
import { renderReminder, samplePayment } from '../shared/templates';
import type { ReminderKind } from '../shared/types';
import { appSettings } from '../lib/config';
import { requireUser } from '../lib/users';
import { isEmail, NotConfiguredError, sendEmail } from '../email/provider';

export const sendSample = onCall({ cors: true }, async (req) => {
  const { user } = await requireUser(req);
  const kinds: ReminderKind[] = ['courtesy', 'friendly', 'firm', 'final'];
  const kind = kinds.includes(req.data?.kind) ? (req.data.kind as ReminderKind) : 'friendly';
  const today = todayKey(user.timezone);
  const due = kind === 'courtesy' ? today : addDays(today, -(kind === 'final' ? 30 : kind === 'firm' ? 14 : 7));
  const settings = await appSettings();
  const rendered = renderReminder(user, samplePayment(due), {
    kind,
    today,
    allowCustomWording: isPro(user.subscription),
    payPageUrl: `${settings.appUrl}/pay/sample`,
    planOfferUrl: kind === 'final' && user.offerPaymentPlans ? `${settings.appUrl}/pay/sample?plan=1` : null,
  });
  const to = isEmail(user.replyToEmail) ? user.replyToEmail : user.email;
  try {
    await sendEmail({
      to,
      fromName: `${user.businessName} via EzPayze`,
      fromEmail: settings.fromEmail,
      replyTo: user.replyToEmail,
      subject: `[Sample] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (err) {
    if (err instanceof NotConfiguredError) throw new HttpsError('failed-precondition', 'Email sending is not turned on yet.');
    throw new HttpsError('internal', 'We could not send the sample. Please try again.');
  }
  return { ok: true, to };
});
