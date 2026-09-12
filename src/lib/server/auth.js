import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, seedCategories, seedDefaultAccount } from './db.js';

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function createUser(email, password) {
  const count = Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(email.toLowerCase().trim(), hashPassword(password), count === 0 ? 1 : 0);
  const id = Number(info.lastInsertRowid);
  seedCategories(id);
  seedDefaultAccount(id);
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

export function getUserById(id) {
  return db
    .prepare('SELECT id, email, currency, is_admin FROM users WHERE id = ?')
    .get(id);
}

export function createSession(userId) {
  const id = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expires.toISOString()
  );
  return { id, expires };
}

export function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT s.id, s.expires_at, u.id AS user_id, u.email, u.currency, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    )
    .get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return { id: row.user_id, email: row.email, currency: row.currency, is_admin: row.is_admin };
}

export function deleteSession(sessionId) {
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/**
 * Is the browser actually on HTTPS? adapter-node assumes `https` for
 * `event.url` when ORIGIN is unset, so we can't trust that. The `Origin` header
 * (always sent by browsers on same-origin form POSTs) and `x-forwarded-proto`
 * are reliable; fall back to the resolved URL.
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
function servedOverHttps(event) {
  const fwd = event.request.headers.get('x-forwarded-proto');
  if (fwd) return fwd.split(',')[0].trim() === 'https';
  const origin = event.request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).protocol === 'https:';
    } catch {
      /* ignore */
    }
  }
  return event.url.protocol === 'https:';
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {{ id: string, expires: Date }} session
 */
export function setSessionCookie(event, session) {
  event.cookies.set(SESSION_COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // A Secure cookie is silently dropped by the browser over plain HTTP, which
    // is how many self-hosted deploys run — so only set it on real HTTPS.
    secure: servedOverHttps(event),
    expires: session.expires
  });
}

export function clearSessionCookie(event) {
  event.cookies.delete(SESSION_COOKIE, { path: '/', secure: servedOverHttps(event) });
}

export { SESSION_COOKIE };
