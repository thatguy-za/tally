import { describe, it, expect } from 'vitest';
import { guessDomain, legacyGuessDomain, logoKey } from './logo.js';
import { MERCHANTS } from './merchants.js';

describe('guessDomain — only when the merchant is clear', () => {
  it('uses a web address that is written in the description', () => {
    expect(guessDomain('NETFLIX.COM')).toBe('netflix.com');
    expect(guessDomain('AMAZON.CO.UK')).toBe('amazon.co.uk');
    expect(guessDomain('www.audible.com')).toBe('audible.com');
    expect(guessDomain('UBER   *TRIP HELP.UBER.COM')).toBe('uber.com');
    expect(guessDomain('shop.amazon.co.uk/order')).toBe('amazon.co.uk');
  });

  it('does not read a name, an invoice number or an email as a web address', () => {
    expect(guessDomain('J.Smith rent')).toBeNull();
    expect(guessDomain('INV.2024 payment')).toBeNull();
    expect(guessDomain('pay john@gmail.com')).toBeNull();
    expect(guessDomain('refund to anna@outlook.com')).toBeNull();
  });

  it('recognises a known merchant at the start, through card-processor noise', () => {
    expect(guessDomain('Starbucks')).toBe('starbucks.com');
    expect(guessDomain('SQ *SPAR CAPE TOWN')).toBe('spar-international.com');
    expect(guessDomain('PAYPAL *SPOTIFY AB')).toBe('spotify.com');
    expect(guessDomain('POS PURCHASE PICK N PAY')).toBe('pnp.co.za');
    expect(guessDomain('DEBIT CARD PAYMENT TO SHELL GARAGE')).toBe('shell.com');
  });

  it('ignores reference numbers, punctuation and apostrophes in the name', () => {
    expect(guessDomain('123456 GITHUB INC')).toBe('github.com');
    expect(guessDomain("MCDONALD'S #4521")).toBe('mcdonalds.com');
    expect(guessDomain('H&M Store 22')).toBe('hm.com');
    expect(guessDomain('Albert Heijn 1234 Amsterdam')).toBe('ah.nl');
  });

  it('prefers the longest name it knows', () => {
    expect(guessDomain('UBER EATS HELP')).toBe('ubereats.com');
    expect(guessDomain('Uber trip')).toBe('uber.com');
  });

  it('gives nothing for descriptions that do not name a known merchant', () => {
    for (const d of [
      'Future dated rent',
      'QA manual entry',
      'A very long description that goes on and on',
      'Unknown card payment XYZ123',
      'Zero amount adjustment',
      'Salary ACME Ltd',
      'Pharmacy',
      'Coffee',
      'Mum',
      'Jane Doe'
    ])
      expect(guessDomain(d), d).toBeNull();
  });

  it('gives nothing for generic bank wording, even if a brand follows it', () => {
    expect(guessDomain('ATM WITHDRAWAL')).toBeNull();
    expect(guessDomain('Transfer to savings')).toBeNull();
    expect(guessDomain('Interest Paid')).toBeNull();
    expect(guessDomain('DIRECT DEBIT - GYM MEMBERSHIP')).toBeNull();
  });

  it('only recognises a merchant at the start, not buried in the text', () => {
    expect(guessDomain('Lunch at Starbucks with Sam')).toBeNull();
  });

  it('returns null for empty or blank input', () => {
    expect(guessDomain('')).toBeNull();
    expect(guessDomain('   ')).toBeNull();
    expect(guessDomain(null)).toBeNull();
  });
});

describe('the merchant list', () => {
  it('has only keys in the normalised form the matcher produces', () => {
    for (const key of Object.keys(MERCHANTS)) expect(key, key).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
  });
  it('has a plausible domain for every merchant', () => {
    for (const [key, domain] of Object.entries(MERCHANTS)) expect(domain, key).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  });
});

describe('legacyGuessDomain (only for the one-time clean-up of old cached guesses)', () => {
  it('still reproduces what the old rule would have cached', () => {
    expect(legacyGuessDomain('future dated rent')).toBe('future.com');
    expect(legacyGuessDomain('starbucks')).toBe('starbucks.com');
  });
});

describe('logoKey', () => {
  it('normalises case and whitespace so the same merchant reuses one cache entry', () => {
    expect(logoKey('  SPAR   Cape Town ')).toBe(logoKey('spar cape town'));
  });

  it('differs for genuinely different descriptions', () => {
    expect(logoKey('Spar')).not.toBe(logoKey('Checkers'));
  });
});
