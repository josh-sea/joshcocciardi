export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rem = abs % 100;
  return rem === 0 ? `${sign}$${dollars}` : `${sign}$${dollars}.${String(rem).padStart(2, '0')}`;
}

/** "$1,250.50" / "1250.5" / "1,250" -> cents, or null if it isn't money. */
export function parseMoney(input: string): number | null {
  const s = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
