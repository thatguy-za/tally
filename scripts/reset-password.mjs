#!/usr/bin/env node
/**
 * Offline password reset / admin recovery.
 *
 *   node scripts/reset-password.mjs <email> <new-password>
 *
 * Respects DATABASE_PATH (defaults to ./data/budget.sqlite). Run it on the host
 * or inside the container: `docker exec -it budget node scripts/reset-password.mjs ...`
 */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const DB_PATH = process.env.DATABASE_PATH || './data/budget.sqlite';
const db = new DatabaseSync(DB_PATH);

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
const stored = `scrypt$${salt}$${hash}`;

const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(stored, user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
console.log(`Password updated for ${email}. Existing sessions cleared.`);
