export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'PLN', label: 'Polish Zloty' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'INR', label: 'Indian Rupee (₹)' }
];

/** @param {number} amount @param {string} currency */
export function formatMoney(amount, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      signDisplay: 'auto'
    }).format(amount ?? 0);
  } catch {
    return `${(amount ?? 0).toFixed(2)} ${currency}`;
  }
}

/** @param {string} ym  e.g. "2026-09" -> "September 2026" */
export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
