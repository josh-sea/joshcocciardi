// Live Firestore subscriptions for the signed-in owner. A small business has
// at most a few thousand payments, so we subscribe to whole collections and
// filter in memory; no composite indexes needed.

import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { Customer, Job, Payment, PlanRequest, QueueDay } from '@shared/types';
import { db, USERS } from './firebase';

export type WithId<T> = T & { id: string };

function useCollection<T>(uid: string, name: string, order?: string): { items: WithId<T>[]; loading: boolean } {
  const [state, setState] = useState<{ items: WithId<T>[]; loading: boolean }>({ items: [], loading: true });
  useEffect(() => {
    const base = collection(db, USERS, uid, name);
    const q = order ? query(base, orderBy(order, 'desc'), limit(3000)) : query(base, limit(3000));
    return onSnapshot(
      q,
      (snap) => setState({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), loading: false }),
      () => setState((s) => ({ ...s, loading: false })),
    );
  }, [uid, name, order]);
  return state;
}

export const usePayments = (uid: string) => useCollection<Payment>(uid, 'payments');
export const useJobs = (uid: string) => useCollection<Job>(uid, 'jobs', 'createdAt');
export const useCustomers = (uid: string) => useCollection<Customer>(uid, 'customers');
export const usePlanRequests = (uid: string) => useCollection<PlanRequest>(uid, 'planRequests');

export function useDoc<T>(path: string[] | null): { data: WithId<T> | null; loading: boolean } {
  const key = path?.join('/') ?? '';
  const [state, setState] = useState<{ data: WithId<T> | null; loading: boolean }>({ data: null, loading: !!path });
  useEffect(() => {
    if (!key) return;
    const [first, ...rest] = key.split('/');
    return onSnapshot(
      doc(db, first, ...rest),
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null, loading: false }),
      () => setState({ data: null, loading: false }),
    );
  }, [key]);
  return state;
}

export const useQueueDay = (uid: string, date: string) => useDoc<QueueDay>([USERS, uid, 'queue', date]);

export function useEvents(uid: string, paymentId: string | null) {
  const [items, setItems] = useState<WithId<{ type: string; stage: number | null; at: number; meta?: Record<string, unknown> }>[]>([]);
  useEffect(() => {
    if (!paymentId) return;
    const q = query(collection(db, USERS, uid, 'payments', paymentId, 'events'), orderBy('at', 'desc'), limit(50));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { type: string; stage: number | null; at: number }) }))), () => setItems([]));
  }, [uid, paymentId]);
  return items;
}
