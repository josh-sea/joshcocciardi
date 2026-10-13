// The owner's morning checklist email. Many owners live in their inbox, so
// every row gets its own big "Got paid" button. Buttons open the app (which
// asks them to sign in if needed) rather than acting from the email, so a
// forwarded email can never mark anything paid.

import { formatTime } from '../shared/dates';
import { formatMoney } from '../shared/money';
import { escapeHtml } from '../shared/templates';
import type { EzUser, PlanRequest, QueueItem } from '../shared/types';

export { formatTime };

const KIND_TEXT: Record<string, string> = {
  courtesy: 'Heads-up',
  friendly: 'First reminder',
  firm: 'Second reminder',
  final: 'Final notice',
};

export function itemLine(item: QueueItem): string {
  const late = item.daysLate === 0 ? 'due today' : `${item.daysLate} day${item.daysLate === 1 ? '' : 's'} late`;
  return `${item.customerName}, ${item.jobTitle}, ${formatMoney(item.amount)}, ${late}. ${KIND_TEXT[item.kind] ?? 'Reminder'}.`;
}

export function renderMorningEmail(
  user: Pick<EzUser, 'ownerName' | 'queue'>,
  items: QueueItem[],
  requests: (PlanRequest & { id: string })[],
  opts: { appUrl: string; today: string },
) {
  const n = items.length;
  const subject = n
    ? `${n} reminder${n === 1 ? '' : 's'} going out at ${formatTime(user.queue.sendTime)}. Anyone already paid?`
    : `${requests.length} payment plan request${requests.length === 1 ? '' : 's'} to look at`;
  const hello = user.ownerName ? `Good morning, ${user.ownerName.split(' ')[0]}.` : 'Good morning.';
  const sendLine =
    user.queue.mode === 'auto'
      ? `These go out at ${formatTime(user.queue.sendTime)} unless you tell us someone already paid.`
      : `These only go out if you approve them. Open EzPayze to approve.`;

  const today = `${opts.appUrl}/today`;
  const text = [
    hello,
    '',
    n ? sendLine : '',
    '',
    ...items.map((i) => `- ${itemLine(i)}\n  Got paid? ${opts.appUrl}/today?paid=${i.paymentId}`),
    ...(requests.length
      ? ['', 'Payment plan requests:', ...requests.map((r) => `- ${r.customerName} asked to pay ${formatMoney(r.amount)} in ${r.count} payments. ${today}`)]
      : []),
    '',
    n ? `Looks good, send them now: ${opts.appUrl}/today?send=1` : '',
    `Open today's list: ${today}`,
  ].join('\n');

  const button = (href: string, label: string, bg = '#0b3d91') =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;` +
    `font-size:20px;font-weight:700;padding:14px 22px;border-radius:10px;min-width:120px;text-align:center">${escapeHtml(label)}</a>`;

  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:16px 0;border-bottom:2px solid #d0d0d0">` +
        `<div style="font-size:22px;font-weight:700;color:#111111">${escapeHtml(i.customerName)}</div>` +
        `<div style="font-size:19px;color:#111111;margin:4px 0">${escapeHtml(i.jobTitle)}</div>` +
        `<div style="font-size:19px;color:#111111;margin-bottom:10px"><strong>${formatMoney(i.amount)}</strong>, ` +
        `${i.daysLate === 0 ? 'due today' : `${i.daysLate} day${i.daysLate === 1 ? '' : 's'} late`}. ${escapeHtml(KIND_TEXT[i.kind] ?? '')}</div>` +
        button(`${opts.appUrl}/today?paid=${encodeURIComponent(i.paymentId)}`, 'Got paid', '#0a5c2b') +
        `</td></tr>`,
    )
    .join('');

  const reqRows = requests
    .map(
      (r) =>
        `<tr><td style="padding:14px;border:2px solid #7a5b00;background:#fff6d6;border-radius:10px;font-size:19px;color:#111111">` +
        `<strong>${escapeHtml(r.customerName)}</strong> asked to pay ${formatMoney(r.amount)} in ${r.count} payments.` +
        (r.note ? `<br>"${escapeHtml(r.note)}"` : '') +
        `<br><br>${button(today, 'Look at it')}</td></tr>`,
    )
    .join('');

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td>` +
    `<div style="font-size:16px;font-weight:700;color:#0b3d91;letter-spacing:1px">EZPAYZE</div>` +
    `<h1 style="font-size:28px;color:#111111;margin:8px 0 12px">${escapeHtml(hello)}</h1>` +
    (n ? `<p style="font-size:20px;color:#111111;margin:0 0 8px">${escapeHtml(sendLine)}</p>` : '') +
    (n ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : '') +
    (requests.length
      ? `<h2 style="font-size:24px;color:#111111;margin:24px 0 8px">Payment plan requests</h2>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px">${reqRows}</table>`
      : '') +
    `<p style="margin:28px 0 12px">${n ? button(`${opts.appUrl}/today?send=1`, 'Looks good, send them') : button(today, "Open today's list")}</p>` +
    `<p style="font-size:16px;color:#333333;margin-top:24px">You get this email on mornings when reminders are ready. ` +
    `Change the time in Settings.</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}
