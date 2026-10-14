import { describe, it, expect, beforeEach } from 'vitest';
import { checkLogin, recordLoginFailure, recordLoginSuccess, resetLoginThrottle } from './login-throttle.js';

const fail = (n, addr = '1.1.1.1', user = 'ann', t0 = 0) => {
  for (let i = 0; i < n; i++) recordLoginFailure(addr, user, t0);
};

describe('login throttle', () => {
  beforeEach(resetLoginThrottle);

  it('lets the first few wrong passwords through without delay', () => {
    fail(4);
    expect(checkLogin('1.1.1.1', 'ann', 0).allowed).toBe(true);
  });

  it('then makes the next attempt wait, for longer each time', () => {
    fail(5);
    expect(checkLogin('1.1.1.1', 'ann', 0)).toEqual({ allowed: false, retryAfterSec: 1 });
    recordLoginFailure('1.1.1.1', 'ann', 1000);
    expect(checkLogin('1.1.1.1', 'ann', 1000)).toEqual({ allowed: false, retryAfterSec: 2 });
    recordLoginFailure('1.1.1.1', 'ann', 3000);
    expect(checkLogin('1.1.1.1', 'ann', 3000)).toEqual({ allowed: false, retryAfterSec: 4 });
  });

  it('allows the attempt again once the wait is over', () => {
    fail(5);
    expect(checkLogin('1.1.1.1', 'ann', 1500).allowed).toBe(true);
  });

  it('never makes anyone wait more than a minute', () => {
    fail(40);
    expect(checkLogin('1.1.1.1', 'ann', 0)).toEqual({ allowed: false, retryAfterSec: 60 });
  });

  it('keeps one address and one username from affecting another', () => {
    fail(10);
    expect(checkLogin('2.2.2.2', 'ann', 0).allowed).toBe(true);
    expect(checkLogin('1.1.1.1', 'bob', 0).allowed).toBe(true);
  });

  it('treats the username case-insensitively, so changing the case does not reset it', () => {
    fail(6, '1.1.1.1', 'Ann');
    expect(checkLogin('1.1.1.1', 'aNN', 0).allowed).toBe(false);
  });

  it('forgets after a quiet spell, and after a successful login', () => {
    fail(10);
    expect(checkLogin('1.1.1.1', 'ann', 16 * 60_000).allowed).toBe(true);
    recordLoginSuccess('1.1.1.1', 'ann');
    expect(checkLogin('1.1.1.1', 'ann', 0).allowed).toBe(true);
  });
});
