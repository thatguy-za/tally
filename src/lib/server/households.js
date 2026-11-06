import { randomInt } from 'node:crypto';
import { db } from './db.js';

/**
 * Households: two or more people who can see the spending in the categories
 * each of them chooses to share, and nothing else. No account, category or
 * transaction belongs to a household — the only thing that crosses between
 * members is the `household` flag on a category (see queries.js, which turns
 * the flagged ones into the household view).
 */

const INVITE_DAYS = 7;
// no 0/O or 1/I/L, which are easy to misread when a code is read out or typed
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** "abcd-efgh " → "ABCDEFGH" */
export const normaliseCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "ABCDEFGH" → "ABCD-EFGH", for showing */
export const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * The household a person belongs to, with its members, or null.
 * @param {number} userId
 * @returns {{ id: number, name: string, currency: string, members: { id: number, username: string, joinedAt: string, you: boolean }[] } | null}
 */
export function getHousehold(userId) {
  const h = db
    .prepare(
      `SELECT h.id, h.name, h.currency FROM households h
       JOIN household_members m ON m.household_id = h.id WHERE m.user_id = ?`
    )
    .get(userId);
  if (!h) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.username, m.joined_at AS joinedAt FROM household_members m
       JOIN users u ON u.id = m.user_id WHERE m.household_id = ? ORDER BY m.joined_at, u.id`
    )
    .all(h.id)
    .map((r) => ({ ...r, you: r.id === userId }));
  return { id: h.id, name: h.name, currency: h.currency, members };
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function createHousehold(userId, name) {
  if (getHousehold(userId)) return { ok: false, error: 'You are already in a household.' };
  const trimmed = String(name ?? '').trim().slice(0, 60) || 'Our household';
  const user = db.prepare('SELECT currency FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'Unknown user.' };
  db.exec('BEGIN');
  try {
    const info = db
      .prepare('INSERT INTO households (name, currency, created_by) VALUES (?, ?, ?)')
      .run(trimmed, user.currency, userId);
    db.prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)').run(userId, Number(info.lastInsertRowid));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

/** A single-use code, good for a week, that lets someone join the caller's household. */
export function createInvite(userId, now = Date.now()) {
  const h = getHousehold(userId);
  if (!h) return { ok: false, error: 'Create or join a household first.' };
  db.prepare('DELETE FROM household_invites WHERE expires_at < ?').run(new Date(now).toISOString());
  const expiresAt = new Date(now + INVITE_DAYS * 864e5).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    try {
      db.prepare('INSERT INTO household_invites (code, household_id, created_by, expires_at) VALUES (?, ?, ?, ?)').run(code, h.id, userId, expiresAt);
      return { ok: true, code, expiresAt };
    } catch {
      /* a clash with a live code — draw another */
    }
  }
  return { ok: false, error: 'Could not make a code — try again.' };
}

/** Invites still waiting to be used, for the household's members to see. */
export function listInvites(userId, now = Date.now()) {
  const h = getHousehold(userId);
  if (!h) return [];
  return db
    .prepare('SELECT code, expires_at AS expiresAt FROM household_invites WHERE household_id = ? AND expires_at >= ? ORDER BY created_at DESC')
    .all(h.id, new Date(now).toISOString());
}

export function revokeInvite(userId, code) {
  const h = getHousehold(userId);
  if (!h) return;
  db.prepare('DELETE FROM household_invites WHERE code = ? AND household_id = ?').run(normaliseCode(code), h.id);
}

/**
 * Join with a code. A household shows its spending in one currency, so someone
 * on a different currency is asked to switch first (`switchCurrency`); only the
 * way amounts are shown changes — no transaction amount is touched.
 * @param {number} userId
 * @param {string} rawCode
 * @param {{ switchCurrency?: boolean, now?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, error: string, needsCurrency?: { from: string, to: string } }}
 */
export function joinHousehold(userId, rawCode, { switchCurrency = false, now = Date.now() } = {}) {
  if (getHousehold(userId)) return { ok: false, error: 'You are already in a household. Leave it first to join another.' };
  const code = normaliseCode(rawCode);
  const invite = code
    ? db
        .prepare('SELECT i.code, i.household_id AS householdId, h.currency FROM household_invites i JOIN households h ON h.id = i.household_id WHERE i.code = ? AND i.expires_at >= ?')
        .get(code, new Date(now).toISOString())
    : null;
  // the same words for an unknown, used or expired code, so a guess learns nothing
  if (!invite) return { ok: false, error: 'That code is not valid, or it has expired.' };

  const user = db.prepare('SELECT currency FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'Unknown user.' };
  if (user.currency !== invite.currency && !switchCurrency)
    return {
      ok: false,
      error: `This household uses ${invite.currency}. Your currency is ${user.currency}.`,
      needsCurrency: { from: user.currency, to: invite.currency }
    };

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO household_members (user_id, household_id) VALUES (?, ?)').run(userId, invite.householdId);
    db.prepare('DELETE FROM household_invites WHERE code = ?').run(code);
    if (user.currency !== invite.currency) db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(invite.currency, userId);
    // nothing is shared on arrival, whatever was ticked before
    db.prepare('UPDATE categories SET household = 0 WHERE user_id = ?').run(userId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

/**
 * Leave. Everything this person shared stops being visible at once (their
 * flags are cleared, so joining another household later shares nothing until
 * they tick it again), and a household with nobody left is removed.
 */
export function leaveHousehold(userId) {
  const h = getHousehold(userId);
  if (!h) return { ok: false, error: 'You are not in a household.' };
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM household_members WHERE user_id = ?').run(userId);
    db.prepare('UPDATE categories SET household = 0 WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM households WHERE id NOT IN (SELECT household_id FROM household_members)').run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

/**
 * Tick or untick a category as shared with the household. Only a spending
 * category of the caller's own, and only while in a household.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function setCategoryHousehold(userId, accountId, categoryId, shared) {
  if (!getHousehold(userId)) return { ok: false, error: 'Join or create a household first.' };
  const cat = db.prepare('SELECT kind FROM categories WHERE id = ? AND user_id = ? AND account_id = ?').get(categoryId, userId, accountId);
  if (!cat) return { ok: false, error: 'Unknown category.' };
  if (cat.kind !== 'expense') return { ok: false, error: 'Only spending categories can be shared with a household.' };
  db.prepare('UPDATE categories SET household = ? WHERE id = ?').run(shared ? 1 : 0, categoryId);
  return { ok: true };
}
