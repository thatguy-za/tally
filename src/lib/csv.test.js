import { describe, it, expect } from 'vitest';
import { parseCsv, detectDelimiter, parseAmount, parseDate, guessMapping, dupeKey } from './csv.js';

describe('detectDelimiter', () => {
  it('picks the most frequent of , ; tab |', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a|b|c')).toBe('|');
  });

  it('ignores delimiter characters inside quoted fields', () => {
    // three real semicolons vs. two commas hidden inside a quoted field
    expect(detectDelimiter('"a,b";c;"d,e,f"')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('splits a simple comma file into rows and fields', () => {
    expect(parseCsv('date,amount\n2026-01-01,12.50')).toEqual([
      ['date', 'amount'],
      ['2026-01-01', '12.50']
    ]);
  });

  it('handles quoted fields containing the delimiter and escaped quotes', () => {
    const csv = 'description,amount\n"SPAR, Cape Town",-10\n"He said ""hi""",5';
    expect(parseCsv(csv)).toEqual([
      ['description', 'amount'],
      ['SPAR, Cape Town', '-10'],
      ['He said "hi"', '5']
    ]);
  });

  it('handles CRLF and bare LF line endings in the same file', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4']
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
  });

  it('drops blank lines, whether trailing or in the middle of the file', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
  });

  it('auto-detects semicolon-delimited files', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
  });
});

describe('parseAmount', () => {
  it('parses plain and negative numbers', () => {
    expect(parseAmount('1234.56')).toBe(1234.56);
    expect(parseAmount('-1234.56')).toBe(-1234.56);
  });

  it('treats parentheses as negative (accounting notation)', () => {
    expect(parseAmount('(1234.56)')).toBe(-1234.56);
  });

  it('disambiguates EU (1.234,56) vs US (1,234.56) grouping by the last separator', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('treats a lone comma as a decimal separator only when followed by 1-2 digits', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('1,234')).toBe(1234); // grouping comma, not decimal
  });

  it('reads DR/debit as negative and CR/credit as positive', () => {
    expect(parseAmount('123.45 DR')).toBe(-123.45);
    expect(parseAmount('123.45 debit')).toBe(-123.45);
    expect(parseAmount('123.45 CR')).toBe(123.45);
  });

  it('strips a currency symbol', () => {
    expect(parseAmount('€ 1234.56')).toBe(1234.56);
  });

  it('returns null for empty input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it('reads a value with no digits at all as 0, not null', () => {
    // stripping non-numeric characters from e.g. "n/a" leaves an empty
    // string, and Number('') is 0 — a quirk of the current implementation,
    // not a design choice, so pinning it here means a change to it is a
    // deliberate decision rather than an accidental regression
    expect(parseAmount('n/a')).toBe(0);
    expect(parseAmount('hello')).toBe(0);
  });
});

describe('parseDate', () => {
  it('normalises ISO dates, with or without a time component', () => {
    expect(parseDate('2026-01-05')).toBe('2026-01-05');
    expect(parseDate('2026-01-05T10:00:00')).toBe('2026-01-05');
  });

  it('normalises bare YYYYMMDD', () => {
    expect(parseDate('20260105')).toBe('2026-01-05');
  });

  it('respects the requested day/month order for ambiguous numeric dates', () => {
    expect(parseDate('05/01/2026', 'dmy')).toBe('2026-01-05');
    expect(parseDate('05/01/2026', 'mdy')).toBe('2026-05-01');
  });

  it('infers YMD order from a 4-digit leading part regardless of the order argument', () => {
    expect(parseDate('2026/01/05', 'dmy')).toBe('2026-01-05');
  });

  it('parses textual months in either position', () => {
    expect(parseDate('1 Jan 2026')).toBe('2026-01-01');
    expect(parseDate('Jan 1, 2026')).toBe('2026-01-01');
    expect(parseDate('1-Jan-26')).toBe('2026-01-01');
  });

  it('expands a 2-digit year using the usual 70-year pivot', () => {
    expect(parseDate('01/01/26', 'dmy')).toBe('2026-01-01');
    expect(parseDate('01/01/99', 'dmy')).toBe('1999-01-01');
  });

  it('returns null for empty or unrecognisable input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('matches common header spellings for each field', () => {
    const headers = ['Booking Date', 'Payee', 'Amount', 'Category'];
    expect(guessMapping(headers)).toEqual({
      date: '0',
      description: '1',
      amount: '2',
      debit: '',
      credit: '',
      category: '3'
    });
  });

  it('recognises separate debit/credit columns', () => {
    const headers = ['Date', 'Details', 'Money out', 'Money in'];
    const m = guessMapping(headers);
    expect(m.debit).toBe('2');
    expect(m.credit).toBe('3');
    expect(m.amount).toBe('');
  });

  it('leaves a field unmapped when nothing matches', () => {
    expect(guessMapping(['Foo', 'Bar']).date).toBe('');
  });
});

describe('dupeKey', () => {
  it('is stable regardless of amount formatting or description case/whitespace', () => {
    expect(dupeKey('2026-01-01', 12.5, ' SPAR Cape Town ')).toBe(
      dupeKey('2026-01-01', '12.50', 'spar cape town')
    );
  });

  it('differs when the date, amount or description differs', () => {
    const base = dupeKey('2026-01-01', 10, 'Coffee');
    expect(dupeKey('2026-01-02', 10, 'Coffee')).not.toBe(base);
    expect(dupeKey('2026-01-01', 11, 'Coffee')).not.toBe(base);
    expect(dupeKey('2026-01-01', 10, 'Tea')).not.toBe(base);
  });
});
