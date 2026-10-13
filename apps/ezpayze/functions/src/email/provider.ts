// Outbound email through Resend's REST API (no SDK needed). Every reminder is
// From "{Business} via EzPayze" with Reply-To set to the owner, so customers'
// replies go straight to the business.

import { getSecret } from '../lib/config';
import { COL, db } from '../lib/firebase';

export interface OutboundEmail {
  to: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string }[]; // base64 content
  idempotencyKey?: string;
}

export class NotConfiguredError extends Error {}

/** Quote a display name for a From header. */
export function fromHeader(name: string, email: string): string {
  const clean = name.replace(/["\\\r\n<>]/g, '').slice(0, 80);
  return `"${clean}" <${email}>`;
}

export async function sendEmail(msg: OutboundEmail): Promise<{ id: string }> {
  const key = await getSecret('RESEND_API_KEY');
  // On the emulator with no key, "send" into a local outbox collection so the
  // whole flow can be run and inspected without a mail provider.
  if (!key && process.env.FUNCTIONS_EMULATOR === 'true') {
    const ref = await db.collection(`${COL.config}`).doc('devOutbox').collection('emails').add({ ...msg, at: Date.now() });
    return { id: `dev_${ref.id}` };
  }
  if (!key) throw new NotConfiguredError('Email sending is not set up yet (RESEND_API_KEY).');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (msg.idempotencyKey) headers['Idempotency-Key'] = msg.idempotencyKey.slice(0, 256);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: fromHeader(msg.fromName, msg.fromEmail),
      to: [msg.to],
      reply_to: msg.replyTo ? [msg.replyTo] : undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments?.length ? msg.attachments : undefined,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Email send failed (${res.status}): ${body.message ?? 'unknown error'}`);
  return { id: body.id };
}

export function isEmail(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
