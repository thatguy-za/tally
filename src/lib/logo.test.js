import { describe, it, expect } from 'vitest';
import { guessDomain, logoKey } from './logo.js';

describe('guessDomain', () => {
  it('prefers an actual domain already present in the text', () => {
    expect(guessDomain('NETFLIX.COM')).toBe('netflix.com');
    expect(guessDomain('AMAZON.CO.UK')).toBe('amazon.co.uk');
    expect(guessDomain('www.audible.com')).toBe('audible.com');
    expect(guessDomain('UBER   *TRIP HELP.UBER.COM')).toBe('uber.com');
  });

  it('strips card-network/processor noise prefixes, including stacked ones', () => {
    expect(guessDomain('SQ *SPAR CAPE TOWN')).toBe('spar.com');
    expect(guessDomain('PAYPAL *SPOTIFY AB')).toBe('spotify.com');
    expect(guessDomain('POS PURCHASE WOOLWORTHS')).toBe('woolworths.com');
    expect(guessDomain('DEBIT CARD PAYMENT TO SHELL GARAGE')).toBe('shell.com');
  });

  it('skips a leading reference number to find the merchant word', () => {
    expect(guessDomain('123456 GITHUB INC')).toBe('github.com');
    expect(guessDomain('MCDONALDS #4521')).toBe('mcdonalds.com');
  });

  it('skips grammatical filler words rather than giving up', () => {
    expect(guessDomain('TST* THE COFFEE BAR')).toBe('coffee.com');
  });

  it('returns null for generic bank-speak instead of guessing a nonsense domain', () => {
    expect(guessDomain('ATM WITHDRAWAL')).toBeNull();
    expect(guessDomain('SALARY - ACME CORP')).toBeNull();
    expect(guessDomain('Interest Paid')).toBeNull();
    expect(guessDomain('Transfer to savings')).toBeNull();
    expect(guessDomain('DIRECT DEBIT - GYM MEMBERSHIP')).toBeNull();
  });

  it('returns null for empty or blank input', () => {
    expect(guessDomain('')).toBeNull();
    expect(guessDomain('   ')).toBeNull();
    expect(guessDomain(null)).toBeNull();
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
