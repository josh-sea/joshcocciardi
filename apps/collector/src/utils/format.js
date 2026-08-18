// Small formatting helpers shared across the UI.

export const money = (value) => {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
};

// A currency value that should read cleanly on the dashboard tiles: no cents
// when it's a round number, so "$1,240" instead of "$1,240.00".
export const moneyCompact = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '$0';
  const n = Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
};

export const percent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${value >= 0 ? '' : ''}${(Number(value)).toFixed(1)}%`;
};

// Firestore Timestamp | Date | ISO string → short human date.
export const shortDate = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Coerce a form value into a number or null (so empty stays empty, not 0).
export const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
};
