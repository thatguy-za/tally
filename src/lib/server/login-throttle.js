/**
 * Slows down password guessing. After a few wrong passwords for the same
 * username from the same address, further attempts are refused for a short,
 * growing time (1s, 2s, 4s … up to a minute). It is a delay, not a lock-out,
 * so someone who keeps guessing at a username can't also keep the real owner
 * out for good — the owner just waits a moment, from their own address.
 * In memory: it resets when the server restarts, which is fine for a delay.
 */
const FREE_ATTEMPTS = 4;
const MAX_WAIT_MS = 60_000;
const FORGET_AFTER_MS = 15 * 60_000;
const MAX_ENTRIES = 5000;

/** @type {Map<string, { failures: number, last: number }>} */
const attempts = new Map();

const keyFor = (address, username) => `${address}|${String(username).trim().toLowerCase()}`;

function prune(now) {
  for (const [k, v] of attempts) if (now - v.last > FORGET_AFTER_MS) attempts.delete(k);
  // a flood of distinct usernames must not grow this without bound
  if (attempts.size > MAX_ENTRIES) for (const k of attempts.keys()) { attempts.delete(k); if (attempts.size <= MAX_ENTRIES / 2) break; }
}

/** @returns {{ allowed: true } | { allowed: false, retryAfterSec: number }} */
export function checkLogin(address, username, now = Date.now()) {
  const a = attempts.get(keyFor(address, username));
  if (!a || now - a.last > FORGET_AFTER_MS || a.failures <= FREE_ATTEMPTS) return { allowed: true };
  const wait = Math.min(MAX_WAIT_MS, 1000 * 2 ** (a.failures - FREE_ATTEMPTS - 1));
  const left = a.last + wait - now;
  return left > 0 ? { allowed: false, retryAfterSec: Math.ceil(left / 1000) } : { allowed: true };
}

export function recordLoginFailure(address, username, now = Date.now()) {
  const k = keyFor(address, username);
  const a = attempts.get(k);
  attempts.set(k, { failures: a && now - a.last <= FORGET_AFTER_MS ? a.failures + 1 : 1, last: now });
  if (attempts.size % 100 === 0) prune(now);
}

export function recordLoginSuccess(address, username) {
  attempts.delete(keyFor(address, username));
}

/** For tests. */
export function resetLoginThrottle() {
  attempts.clear();
}
