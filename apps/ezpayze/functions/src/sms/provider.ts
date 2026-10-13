// SMS add-on through Twilio's REST API (no SDK needed).

import { getSecret } from '../lib/config';
import { NotConfiguredError } from '../email/provider';

/** Best-effort E.164 for US numbers; anything already starting with + is kept. */
export function toE164(phone: string): string | null {
  const s = phone.trim();
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s.replace(/[\s()-]/g, '')) ? s.replace(/[\s()-]/g, '') : null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const [sid, token, from] = await Promise.all([
    getSecret('TWILIO_ACCOUNT_SID'),
    getSecret('TWILIO_AUTH_TOKEN'),
    getSecret('TWILIO_FROM_NUMBER'),
  ]);
  if (!sid || !token || !from) throw new NotConfiguredError('Text messages are not set up yet (Twilio).');
  const number = toE164(to);
  if (!number) throw new Error('That phone number does not look right.');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: number, From: from, Body: body }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok || !json.sid) throw new Error(`Text failed (${res.status}): ${json.message ?? 'unknown error'}`);
  return { sid: json.sid };
}
