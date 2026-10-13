// First sign-in: create the owner's EzPayze profile with a 14-day Pro trial and
// tag the shared Auth user as an EzPayze customer (custom claim apps.ezpayze),
// so other apps in the project can tell EzPayze accounts apart.

import { onCall } from 'firebase-functions/v2/https';
import { defaultSubscription } from '../shared/billing';
import { DEFAULT_SCHEDULE } from '../shared/schedule';
import type { EzUser } from '../shared/types';
import { auth, db, userRef } from '../lib/firebase';
import { requireUid, str } from '../lib/users';

function validTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/New_York';
  }
}

export const ensureAccount = onCall({ cors: true }, async (req) => {
  const uid = requireUid(req);
  const email = (req.auth?.token.email as string | undefined) ?? '';
  const timezone = validTimeZone(str(req.data?.timezone, 60) || 'America/New_York');
  const ref = userRef(uid);

  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    const user: EzUser = {
      email,
      ownerName: (req.auth?.token.name as string | undefined) ?? '',
      businessName: '',
      phone: null,
      logoPath: null,
      logoUrl: null,
      replyToEmail: email,
      timezone,
      industry: null,
      subscription: defaultSubscription(),
      paymentMethods: [],
      defaultPaymentMethod: null,
      showAllMethods: true,
      reminderSchedule: [...DEFAULT_SCHEDULE],
      courtesyNote: false,
      queue: { morningTime: '07:00', sendTime: '11:00', mode: 'auto' },
      offerPaymentPlans: true,
      wording: {},
      onboardingComplete: false,
      createdAt: Date.now(),
    };
    tx.set(ref, user);
    return true;
  });

  const record = await auth().getUser(uid);
  const claims = record.customClaims ?? {};
  const apps = (claims.apps as Record<string, boolean> | undefined) ?? {};
  if (!apps.ezpayze) await auth().setCustomUserClaims(uid, { ...claims, apps: { ...apps, ezpayze: true } });

  return { created };
});
