import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { EventType } from '../shared/types';
import { eventsCol } from './firebase';

export function eventData(type: EventType, stage: number | null, meta: Record<string, unknown> = {}) {
  return { type, stage, at: Date.now(), serverAt: FieldValue.serverTimestamp(), meta };
}

export async function logEvent(
  uid: string,
  paymentId: string,
  type: EventType,
  stage: number | null = null,
  meta: Record<string, unknown> = {},
) {
  await eventsCol(uid, paymentId).add(eventData(type, stage, meta));
}

export function logEventTx(
  tx: Transaction,
  uid: string,
  paymentId: string,
  type: EventType,
  stage: number | null = null,
  meta: Record<string, unknown> = {},
) {
  tx.set(eventsCol(uid, paymentId).doc(), eventData(type, stage, meta));
}
