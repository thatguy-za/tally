import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';

const DB_PATH = env.DATABASE_PATH || './data/tally.sqlite';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Run `fn` inside a transaction. Returns whatever `fn` returns.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'EUR',
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    kind    TEXT NOT NULL DEFAULT 'expense',
    color   TEXT NOT NULL DEFAULT '#64748b',
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount      REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id);

  CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_text  TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount      REAL NOT NULL,
    UNIQUE (user_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS recurring (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description  TEXT NOT NULL DEFAULT '',
    amount       REAL NOT NULL,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    frequency    TEXT NOT NULL DEFAULT 'monthly',
    interval_n   INTEGER NOT NULL DEFAULT 1,
    next_date    TEXT NOT NULL,
    end_date     TEXT,
    auto_post    INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// --- lightweight migrations for existing databases ---
const txCols = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
if (!txCols.includes('recurring_id')) {
  db.exec('ALTER TABLE transactions ADD COLUMN recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL');
}

const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('ai_categorise')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_categorise INTEGER NOT NULL DEFAULT 0');
}
// AI categorisation is opt-OUT: on for everyone once an admin adds a key.
if (!userCols.includes('ai_off')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_off INTEGER NOT NULL DEFAULT 0');
}

const DEFAULT_CATEGORIES = [
  { name: 'Salary', kind: 'income', color: '#16a34a' },
  { name: 'Other income', kind: 'income', color: '#0d9488' },
  { name: 'Groceries', kind: 'expense', color: '#f97316' },
  { name: 'Rent & housing', kind: 'expense', color: '#6366f1' },
  { name: 'Utilities', kind: 'expense', color: '#0ea5e9' },
  { name: 'Transport', kind: 'expense', color: '#eab308' },
  { name: 'Eating out', kind: 'expense', color: '#ec4899' },
  { name: 'Shopping', kind: 'expense', color: '#a855f7' },
  { name: 'Health', kind: 'expense', color: '#ef4444' },
  { name: 'Subscriptions', kind: 'expense', color: '#8b5cf6' },
  { name: 'Entertainment', kind: 'expense', color: '#14b8a6' },
  { name: 'Savings & investments', kind: 'expense', color: '#64748b' }
];

export function seedCategories(userId) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, kind, color) VALUES (?, ?, ?, ?)'
  );
  tx(() => {
    for (const c of DEFAULT_CATEGORIES) stmt.run(userId, c.name, c.kind, c.color);
  });
}
