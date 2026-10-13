import { renderReminder, type ReminderPayment, type ReminderUser } from '@shared/templates';
import type { ReminderKind } from '@shared/types';

/** Exactly what the customer will get (same renderer as the Cloud Functions). */
export function ReminderPreview({ user, payment, kind, today, allowCustom, title = 'Preview of the email' }: {
  user: ReminderUser;
  payment: ReminderPayment;
  kind: ReminderKind;
  today: string;
  allowCustom: boolean;
  title?: string;
}) {
  const r = renderReminder(user, payment, {
    kind,
    today,
    allowCustomWording: allowCustom,
    payPageUrl: 'https://ezpayze.web.app/pay/sample',
    planOfferUrl: kind === 'final' && user.offerPaymentPlans ? 'https://ezpayze.web.app/pay/sample?plan=1' : null,
  });
  return (
    <div className="email-preview">
      <div className="head">
        <div><strong>From:</strong> {user.businessName || 'Your business'} via EzPayze</div>
        <div><strong>Subject:</strong> {r.subject}</div>
      </div>
      <iframe title={title} srcDoc={r.html} sandbox="" />
    </div>
  );
}
