// Reminder wording and rendering. Owners can edit the subject and body of each
// stage in plain text; {placeholders} are filled in at send time. The web app
// renders its live preview with this same code, so the preview is exact.

import { daysBetween, longDate } from './dates';
import { methodInfo, methodsToShow } from './methods';
import { formatMoney } from './money';
import type { CheckDetails, EzUser, Payment, PaymentMethod, ReminderKind, ReminderWording } from './types';

export const KIND_LABELS: Record<ReminderKind, string> = {
  courtesy: 'Heads-up (before or on the due date)',
  friendly: 'First reminder (friendly)',
  firm: 'Middle reminder (firmer)',
  final: 'Final notice',
};

export const DEFAULT_WORDING: Record<ReminderKind, ReminderWording> = {
  courtesy: {
    subject: 'Heads-up: {amount} for {job} is due {due}',
    body:
      'Hi {customer},\n\n' +
      'Just a heads-up that {amount} for {job} is due on {due}.\n\n' +
      'You will find the easy ways to pay below. Thank you!\n\n' +
      '{owner}\n{business}',
  },
  friendly: {
    subject: 'A friendly reminder from {business}',
    body:
      'Hi {customer},\n\n' +
      'Just a friendly reminder that {amount} for {job} was due on {due}. ' +
      'If you have already sent it, thank you, and please ignore this note.\n\n' +
      'You will find the easy ways to pay below.\n\n' +
      'Thanks so much,\n{owner}\n{business}',
  },
  firm: {
    subject: 'Reminder: {amount} for {job} is past due',
    body:
      'Hi {customer},\n\n' +
      'We have not received {amount} for {job} yet. It was due on {due} and is now {days} days past due. ' +
      'We would really appreciate payment this week.\n\n' +
      'If something has come up, just reply to this email and let us know.\n\n' +
      'Thank you,\n{owner}\n{business}',
  },
  final: {
    subject: 'Final notice: {amount} for {job}',
    body:
      'Hi {customer},\n\n' +
      'This is our final reminder about {amount} for {job}. It was due on {due} and is now {days} days past due. ' +
      'Please send payment as soon as you can.\n\n' +
      'If paying all at once is hard right now, we are happy to work something out.\n\n' +
      'Thank you,\n{owner}\n{business}',
  },
};

export const PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: '{customer}', meaning: 'Customer name' },
  { key: '{job}', meaning: 'Job title' },
  { key: '{amount}', meaning: 'Amount owed' },
  { key: '{due}', meaning: 'Due date' },
  { key: '{days}', meaning: 'Days late' },
  { key: '{ref}', meaning: 'Your reference number' },
  { key: '{owner}', meaning: 'Your name' },
  { key: '{business}', meaning: 'Business name' },
];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export type ReminderUser = Pick<
  EzUser,
  | 'businessName'
  | 'ownerName'
  | 'replyToEmail'
  | 'logoUrl'
  | 'paymentMethods'
  | 'defaultPaymentMethod'
  | 'showAllMethods'
  | 'wording'
  | 'offerPaymentPlans'
>;

export type ReminderPayment = Pick<
  Payment,
  'customerName' | 'jobTitle' | 'referenceNumber' | 'amount' | 'dueDate' | 'installment' | 'paymentMethodType'
>;

export interface RenderOptions {
  kind: ReminderKind;
  today: string;
  allowCustomWording: boolean;
  payPageUrl?: string | null; // "see details / how to pay" link
  planOfferUrl?: string | null; // only on a final notice when offered
  attachmentNote?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  sms: string;
}

export function wordingFor(user: Pick<EzUser, 'wording'>, kind: ReminderKind, allowCustom: boolean): ReminderWording {
  const custom = allowCustom ? user.wording?.[kind] : undefined;
  return {
    subject: custom?.subject?.trim() || DEFAULT_WORDING[kind].subject,
    body: custom?.body?.trim() || DEFAULT_WORDING[kind].body,
  };
}

function methodText(m: PaymentMethod): string {
  const info = methodInfo(m.type);
  if (info.kind === 'check') {
    const c = m.value as CheckDetails;
    return `${m.label}: make it out to ${c.payableTo} and mail to ${c.address}`;
  }
  return `${m.label}: ${m.value as string}`;
}

function methodHtml(m: PaymentMethod): string {
  const info = methodInfo(m.type);
  const label = escapeHtml(m.label);
  if (info.kind === 'link') {
    const url = escapeHtml(m.value as string);
    return (
      `<tr><td style="padding:6px 0">` +
      `<a href="${url}" style="display:block;background:#0b3d91;color:#ffffff;text-decoration:none;` +
      `font-size:20px;font-weight:700;padding:16px 20px;border-radius:10px;text-align:center">` +
      `Pay with ${label}</a></td></tr>`
    );
  }
  if (info.kind === 'check') {
    const c = m.value as CheckDetails;
    return (
      `<tr><td style="padding:10px 14px;border:2px solid #1a1a1a;border-radius:10px;font-size:18px;color:#111111">` +
      `<strong>Pay by check</strong><br>Make it out to: ${escapeHtml(c.payableTo)}<br>` +
      `Mail to: ${escapeHtml(c.address).replace(/\n/g, '<br>')}</td></tr>`
    );
  }
  return (
    `<tr><td style="padding:10px 14px;border:2px solid #1a1a1a;border-radius:10px;font-size:18px;color:#111111">` +
    `<strong>${label}</strong><br>${escapeHtml(m.value as string)}</td></tr>`
  );
}

export function reminderVars(user: ReminderUser, payment: ReminderPayment, today: string): Record<string, string> {
  const late = Math.max(0, daysBetween(payment.dueDate, today));
  const job = payment.installment
    ? `${payment.jobTitle} (payment ${payment.installment.number} of ${payment.installment.of})`
    : payment.jobTitle;
  return {
    customer: payment.customerName.split(' ')[0] || payment.customerName,
    job,
    amount: formatMoney(payment.amount),
    due: longDate(payment.dueDate),
    days: String(late),
    ref: payment.referenceNumber ?? '',
    owner: user.ownerName,
    business: user.businessName,
  };
}

export function renderReminder(user: ReminderUser, payment: ReminderPayment, opts: RenderOptions): RenderedEmail {
  const vars = reminderVars(user, payment, opts.today);
  const wording = wordingFor(user, opts.kind, opts.allowCustomWording);
  const subject = fill(wording.subject, vars).replace(/\s+/g, ' ').trim().slice(0, 150);
  const body = fill(wording.body, vars);
  const methods = methodsToShow(user.paymentMethods, {
    defaultType: user.defaultPaymentMethod,
    overrideType: payment.paymentMethodType,
    showAll: user.showAllMethods,
  });

  const detailRows: [string, string][] = [
    ['For', vars.job],
    ['Amount', vars.amount],
    ['Due', vars.due],
  ];
  if (payment.referenceNumber) detailRows.push(['Reference', payment.referenceNumber]);

  // Plain text version.
  const textParts = [body, '', detailRows.map(([k, v]) => `${k}: ${v}`).join('\n')];
  if (methods.length) textParts.push('', 'How to pay:', ...methods.map(methodText));
  if (opts.attachmentNote) textParts.push('', opts.attachmentNote);
  if (opts.payPageUrl) textParts.push('', `See the details and ways to pay: ${opts.payPageUrl}`);
  if (opts.planOfferUrl) textParts.push('', `Need to split this up? Ask for a payment plan: ${opts.planOfferUrl}`);
  textParts.push('', 'Questions? Just reply to this email.', '', footerText(user));
  const text = textParts.join('\n');

  // HTML version: big type, high contrast, one column.
  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:20px;line-height:1.5;color:#111111">${escapeHtml(s).replace(/\n/g, '<br>')}</p>`;
  const paragraphs = body.split(/\n{2,}/).map(p).join('');
  const logo = user.logoUrl
    ? `<img src="${escapeHtml(user.logoUrl)}" alt="${escapeHtml(user.businessName)}" style="max-height:72px;max-width:240px;margin-bottom:16px">`
    : `<div style="font-size:26px;font-weight:800;color:#111111;margin-bottom:16px">${escapeHtml(user.businessName)}</div>`;
  const details = detailRows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:18px;color:#333333">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;font-size:20px;font-weight:700;color:#111111">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  const howToPay = methods.length
    ? `<h2 style="font-size:22px;margin:24px 0 8px;color:#111111">How to pay</h2>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px">${methods
        .map(methodHtml)
        .join('')}</table>`
    : '';
  const attachment = opts.attachmentNote ? p(opts.attachmentNote) : '';
  const payLink = opts.payPageUrl
    ? `<p style="margin:16px 0;font-size:18px"><a href="${escapeHtml(opts.payPageUrl)}" style="color:#0b3d91;font-weight:700">See the details and ways to pay</a></p>`
    : '';
  const planOffer = opts.planOfferUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr>` +
      `<td style="padding:18px;background:#fff6d6;border:2px solid #7a5b00;border-radius:10px;font-size:20px;color:#111111">` +
      `<strong>Need to split this up?</strong><br>` +
      `<a href="${escapeHtml(opts.planOfferUrl)}" style="color:#0b3d91;font-weight:700">Tap here to ask for a payment plan.</a>` +
      `</td></tr></table>`
    : '';
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td>` +
    logo +
    paragraphs +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;border-top:2px solid #1a1a1a;padding-top:8px;width:100%">${details}</table>` +
    howToPay +
    attachment +
    payLink +
    planOffer +
    `<p style="margin:24px 0 16px;font-size:18px;color:#111111">Questions? Just reply to this email.</p>` +
    `<p style="margin:24px 0 0;font-size:15px;line-height:1.5;color:#333333">${escapeHtml(footerText(user))}</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  const sms = smsText(user, payment, opts, vars);
  return { subject, text, html, sms };
}

function footerText(user: ReminderUser): string {
  return (
    `This reminder was sent by EzPayze on behalf of ${user.businessName} (${user.replyToEmail}). ` +
    `You are getting it because of work ${user.businessName} did for you. ` +
    `If you think it reached you by mistake, reply and let them know.`
  );
}

function smsText(user: ReminderUser, payment: ReminderPayment, opts: RenderOptions, vars: Record<string, string>): string {
  const lead =
    opts.kind === 'courtesy'
      ? `${user.businessName}: heads-up, ${vars.amount} for ${vars.job} is due ${vars.due}.`
      : opts.kind === 'final'
        ? `${user.businessName}: final reminder, ${vars.amount} for ${vars.job} is ${vars.days} days past due.`
        : `${user.businessName}: reminder, ${vars.amount} for ${vars.job} was due ${vars.due}.`;
  const link = opts.payPageUrl ? ` Ways to pay: ${opts.payPageUrl}` : '';
  return `${lead}${link} Reply STOP to opt out.`.slice(0, 320);
}

/** A believable sample for the setup "Done" screen and the wording preview. */
export function samplePayment(dueDate: string): ReminderPayment {
  return {
    customerName: 'Jane Miller',
    jobTitle: 'Kitchen cabinet install',
    referenceNumber: '1042',
    amount: 125000,
    dueDate,
    installment: null,
    paymentMethodType: null,
  };
}
