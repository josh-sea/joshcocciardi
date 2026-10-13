import { todayKey } from '@shared/dates';
import type { EzUser } from '@shared/types';

export const ownerToday = (profile: Pick<EzUser, 'timezone'>) => todayKey(profile.timezone || 'America/New_York');

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
