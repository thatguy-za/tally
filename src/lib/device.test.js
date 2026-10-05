import { describe, it, expect } from 'vitest';
import { isIOS } from './device.js';

describe('isIOS', () => {
  it('recognises an iPhone', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone' })).toBe(true);
  });

  it('recognises an iPad that still says iPad', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X)', platform: 'iPad' })).toBe(true);
  });

  // iPadOS 13+ presents as a desktop Mac; the touch screen is the giveaway
  it('recognises a modern iPad posing as a Mac', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('does not mistake Android or Windows for iOS', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 })).toBe(false);
  });

  it('is false when there is no navigator (server render)', () => {
    expect(isIOS(undefined)).toBe(false);
  });
});
