// Signed, expiring links for the public pay page. The customer never logs in;
// the token names exactly one payment and nothing else.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PayToken {
  u: string; // owner uid
  p: string; // payment id
  exp: number; // epoch ms
}

export const PAY_TOKEN_TTL_MS = 120 * 86400000;

export function signToken(payload: PayToken, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: unknown, secret: string, now = Date.now()): PayToken | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as PayToken;
    if (typeof payload.u !== 'string' || typeof payload.p !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
