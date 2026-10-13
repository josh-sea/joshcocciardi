// Runtime configuration.
//
// Provider keys are looked up in this order:
//   1. process.env (Secret Manager via defineSecret, or a local .env for the
//      emulator), using the upper-case names from the build handoff;
//   2. the admin-only Firestore doc ezpayze_config/secrets (no client can read
//      it; see firestore.rules), using the camelCase field names below.
// The fallback keeps deploys green before any secret exists: a function that
// binds a missing Secret Manager secret fails the whole deploy.

import { randomBytes } from 'node:crypto';
import { COL, db } from './firebase';

export type SecretName =
  | 'RESEND_API_KEY'
  | 'TWILIO_ACCOUNT_SID'
  | 'TWILIO_AUTH_TOKEN'
  | 'TWILIO_FROM_NUMBER'
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_BILLING_WEBHOOK_SECRET'
  | 'PAYPAGE_TOKEN_SECRET';

const FIELD: Record<SecretName, string> = {
  RESEND_API_KEY: 'resendApiKey',
  TWILIO_ACCOUNT_SID: 'twilioAccountSid',
  TWILIO_AUTH_TOKEN: 'twilioAuthToken',
  TWILIO_FROM_NUMBER: 'twilioFromNumber',
  STRIPE_SECRET_KEY: 'stripeSecretKey',
  STRIPE_BILLING_WEBHOOK_SECRET: 'stripeBillingWebhookSecret',
  PAYPAGE_TOKEN_SECRET: 'paypageTokenSecret',
};

let cache: { at: number; secrets: Record<string, string>; settings: Record<string, string> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const [s, t] = await Promise.all([
    db.collection(COL.config).doc('secrets').get(),
    db.collection(COL.config).doc('settings').get(),
  ]);
  cache = { at: Date.now(), secrets: (s.data() ?? {}) as Record<string, string>, settings: (t.data() ?? {}) as Record<string, string> };
  return cache;
}

export async function getSecret(name: SecretName): Promise<string | null> {
  const env = process.env[name];
  if (env) return env;
  const { secrets } = await load();
  return secrets[FIELD[name]] || null;
}

/** The pay-page signing key. Generated once (admin-only doc) if none is set. */
export async function paypageSecret(): Promise<string> {
  const existing = await getSecret('PAYPAGE_TOKEN_SECRET');
  if (existing) return existing;
  const ref = db.collection(COL.config).doc('secrets');
  const key = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.get(FIELD.PAYPAGE_TOKEN_SECRET) as string | undefined;
    if (cur) return cur;
    const fresh = randomBytes(32).toString('base64url');
    tx.set(ref, { [FIELD.PAYPAGE_TOKEN_SECRET]: fresh }, { merge: true });
    return fresh;
  });
  cache = null;
  return key;
}

export interface AppSettings {
  appUrl: string;
  fromEmail: string;
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
  stripePriceSms: string | null;
}

export async function appSettings(): Promise<AppSettings> {
  const { settings } = await load();
  return {
    appUrl: (process.env.EZPAYZE_APP_URL || settings.appUrl || 'https://ezpayze.web.app').replace(/\/$/, ''),
    fromEmail: process.env.EZPAYZE_FROM_EMAIL || settings.fromEmail || 'billing@ezpayze.com',
    stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || settings.stripePriceMonthly || null,
    stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || settings.stripePriceYearly || null,
    stripePriceSms: process.env.STRIPE_PRICE_SMS || settings.stripePriceSms || null,
  };
}
