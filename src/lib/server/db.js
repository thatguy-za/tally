import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';

const DB_PATH = env.DATABASE_PATH || './data/tally.sqlite';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// let a writer wait out a brief lock instead of failing immediately — cheap
// insurance for a single-file SQLite app under any concurrent access
db.exec('PRAGMA busy_timeout = 5000');

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

  -- a real-world account (checking, savings, ...). Transactions belong to one
  -- so money moving between a user's own accounts can be told apart from
  -- actual income or spending — see the 'transfer' category kind.
  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#64748b',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount      REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    account_id  INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id);
  CREATE INDEX IF NOT EXISTS idx_tx_user_acct ON transactions(user_id, account_id);

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

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- one cached AI summary per user per report scope; regenerated when the
  -- fingerprint of the underlying numbers changes, so a page view is free.
  CREATE TABLE IF NOT EXISTS insights (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    summary     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, scope)
  );
`);

// --- lightweight migrations for existing databases ---
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('ai_categorise')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_categorise INTEGER NOT NULL DEFAULT 0');
}
// AI categorisation is opt-OUT: on for everyone once an admin adds a key.
if (!userCols.includes('ai_off')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_off INTEGER NOT NULL DEFAULT 0');
}

// Existing databases predate the accounts table's column on transactions.
const txCols = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
if (!txCols.includes("account_id")) {
  db.exec("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_user_acct ON transactions(user_id, account_id)");
}

// Every user needs at least one account to import or add transactions into.
// Cheap and idempotent, so it doubles as the one-time backfill for anyone
// upgrading from before accounts existed.
db.exec(`
  INSERT INTO accounts (user_id, name)
  SELECT id, 'Main account' FROM users WHERE id NOT IN (SELECT DISTINCT user_id FROM accounts)
`);
db.exec(`
  UPDATE transactions SET account_id = (
    SELECT MIN(id) FROM accounts WHERE accounts.user_id = transactions.user_id
  )
  WHERE account_id IS NULL
`);

// Savings used to be seeded as an expense, which counted money you kept as
// money you spent. Reclassify the seeded category once — guarded by a flag so
// it never stomps a user who has deliberately set it back.
const SAVING_MIGRATION = 'migrated_saving_kind';
const migrated = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SAVING_MIGRATION);
if (!migrated) {
  db.prepare(
    `UPDATE categories SET kind = 'saving', color = '#0ea5e9'
     WHERE kind = 'expense' AND name = 'Savings & investments'`
  ).run();
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(SAVING_MIGRATION, '1');
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
  // money moved here is kept, not spent — see the `saving` kind
  { name: 'Savings & investments', kind: 'saving', color: '#0ea5e9' }
];

export function seedCategories(userId) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, kind, color) VALUES (?, ?, ?, ?)'
  );
  tx(() => {
    for (const c of DEFAULT_CATEGORIES) stmt.run(userId, c.name, c.kind, c.color);
  });
}

export function seedDefaultAccount(userId) {
  db.prepare(
    'INSERT OR IGNORE INTO accounts (user_id, name) VALUES (?, ?)'
  ).run(userId, 'Main account');
}
