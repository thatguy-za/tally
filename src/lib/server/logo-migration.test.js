import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db.js';
import { dropLegacyLogoGuesses } from './logo-migration.js';

describe('dropLegacyLogoGuesses', () => {
  beforeEach(() => db.exec('DELETE FROM merchant_logos'));
  const put = (key, domain) => db.prepare('INSERT INTO merchant_logos (key, domain) VALUES (?, ?)').run(key, domain);
  const has = (key) => !!db.prepare('SELECT 1 FROM merchant_logos WHERE key = ?').get(key);

  it('drops the wrong guesses the old rule cached', () => {
    put('future dated rent', 'future.com');
    put('qa manual entry', 'manual.com');
    expect(dropLegacyLogoGuesses(db)).toBe(2);
    expect(has('future dated rent')).toBe(false);
    expect(has('qa manual entry')).toBe(false);
  });

  it('keeps a logo someone chose by hand, which differs from the old guess', () => {
    put('rent', 'mycaravanpark.com');
    put('my landlord', 'example-landlord.co.uk');
    expect(dropLegacyLogoGuesses(db)).toBe(0);
    expect(has('rent')).toBe(true);
    expect(has('my landlord')).toBe(true);
  });

  it('keeps an explicit "no logo", which is a null', () => {
    put('atm withdrawal', null);
    expect(dropLegacyLogoGuesses(db)).toBe(0);
    expect(has('atm withdrawal')).toBe(true);
  });
});
