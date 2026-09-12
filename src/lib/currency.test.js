import { describe, it, expect } from 'vitest';
import { formatMoney, formatMonth, currentMonth, CURRENCIES } from './currency.js';

describe('formatMoney', () => {
  it('includes the magnitude and treats negative and positive consistently', () => {
    const pos = formatMoney(1234.5, 'EUR');
    const neg = formatMoney(-1234.5, 'EUR');
    expect(pos).toContain('1,234.5');
    expect(neg).not.toBe(pos);
    expect(neg).toMatch(/-/);
  });

  it('defaults to EUR and treats a missing amount as zero', () => {
    expect(() => formatMoney(undefined)).not.toThrow();
    expect(formatMoney(null)).toContain('0');
  });

  it('falls back instead of throwing for an unrecognised currency code', () => {
    expect(() => formatMoney(10, 'NOTACODE')).not.toThrow();
  });

  it('formats every currency in the picker without throwing', () => {
    for (const c of CURRENCIES) expect(() => formatMoney(10, c.code)).not.toThrow();
  });
});

describe('formatMonth', () => {
  it('turns a YYYY-MM into a month name and year', () => {
    const label = formatMonth('2026-09');
    expect(label).toMatch(/2026/);
    expect(label.toLowerCase()).toMatch(/sep/);
  });
});

describe('currentMonth', () => {
  it('returns the current UTC-ish month as YYYY-MM', () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    expect(currentMonth()).toBe(new Date().toISOString().slice(0, 7));
  });
});
