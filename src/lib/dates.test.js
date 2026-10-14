import { describe, it, expect } from 'vitest';
import { shortDate } from './dates.js';

describe('shortDate', () => {
  it('puts the day first or the month first, as chosen', () => {
    expect(shortDate('2026-10-13', 'dmy')).toBe('13 Oct');
    expect(shortDate('2026-10-13', 'mdy')).toBe('Oct 13');
    expect(shortDate('2026-10-03', 'ymd')).toBe('Oct 3');
  });

  it('defaults to day first and ignores a time part', () => {
    expect(shortDate('2026-01-05T10:00:00')).toBe('5 Jan');
  });

  it('never shifts the day, whatever the time zone of the machine it runs on', () => {
    const tz = process.env.TZ;
    for (const zone of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
      process.env.TZ = zone;
      expect(shortDate('2026-10-13', 'dmy')).toBe('13 Oct');
    }
    process.env.TZ = tz;
  });

  it('hands back something readable when it is not a date', () => {
    expect(shortDate('')).toBe('');
    expect(shortDate(null)).toBe('');
    expect(shortDate('2026-99-99')).toBe('2026-99-99');
  });
});
