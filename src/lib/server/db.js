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
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'EUR',
    date_format   TEXT NOT NULL DEFAULT 'dmy',
    is_admin      INTEGER NOT NULL DEFAULT 0,
    onboarded_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  -- a real-world account (checking, savings, ...); transactions belong to
  -- one so money moving between a user's own accounts can be told apart from
  -- actual income or spending — see the 'transfer' category kind. Every
  -- figure in the app is always scoped to exactly one account at a time,
  -- never combined across them. The kind column changes one reporting rule: on a
  -- 'savings' account, a 'saving'-kind transaction counts as that account's
  -- own income/expense rather than a separately tracked "saved" figure — see
  -- isSavingsAccount() in queries.js.
  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#64748b',
    kind       TEXT NOT NULL DEFAULT 'checking',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );

  -- categories and rules belong to exactly one account — a new account
  -- starts with none of another account's categories or rules, matching the
  -- "no cross calculations" rule the rest of the app follows.
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'expense',
    color      TEXT NOT NULL DEFAULT '#64748b',
    UNIQUE (account_id, name)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount      REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    account_id  INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    -- set when the user has said this one doesn't need a category, so it
    -- stops appearing in the "N to categorise" nudge and the "none" filter
    dismissed_uncategorised INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id);

  CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
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

  -- guessed merchant domain per normalised description (see src/lib/logo.js),
  -- shared across all users since it's a fact about the merchant, not the
  -- user. domain is NULL when a lookup was tried and nothing usable was
  -- found, so that "no logo" doesn't get re-guessed on every page view.
  CREATE TABLE IF NOT EXISTS merchant_logos (
    key    TEXT PRIMARY KEY,
    domain TEXT
  );
`);

// --- lightweight migrations for existing databases ---
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
// Users used to be identified by email. Renaming keeps the UNIQUE constraint
// and existing values intact, so everyone's old email becomes their username.
if (userCols.includes('email') && !userCols.includes('username')) {
  db.exec('ALTER TABLE users RENAME COLUMN email TO username');
  userCols[userCols.indexOf('email')] = 'username';
}
if (!userCols.includes('ai_categorise')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_categorise INTEGER NOT NULL DEFAULT 0');
}
// AI categorisation is opt-OUT: on for everyone once an admin adds a key.
if (!userCols.includes('ai_off')) {
  db.exec('ALTER TABLE users ADD COLUMN ai_off INTEGER NOT NULL DEFAULT 0');
}
// Existing users predate the onboarding wizard — treat them as already
// onboarded so it doesn't suddenly appear for someone who set the app up
// long ago. New signups get onboarded_at = NULL and see the wizard.
if (!userCols.includes('onboarded_at')) {
  db.exec("ALTER TABLE users ADD COLUMN onboarded_at TEXT");
  db.exec("UPDATE users SET onboarded_at = datetime('now')");
}
// the CSV import review's date column used to carry its own per-import
// format dropdown — moved here since it rarely changes, so each column only
// needs one dropdown (the column mapping) instead of two.
if (!userCols.includes('date_format')) {
  db.exec("ALTER TABLE users ADD COLUMN date_format TEXT NOT NULL DEFAULT 'dmy'");
}

// Existing databases predate the accounts table's `kind` column (see its
// own comment above).
const acctCols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
if (!acctCols.includes('kind')) {
  db.exec("ALTER TABLE accounts ADD COLUMN kind TEXT NOT NULL DEFAULT 'checking'");
}

// Existing databases predate the accounts table's column on transactions.
const txCols = db.prepare("PRAGMA table_info(transactions)").all().map((c) => c.name);
if (!txCols.includes("account_id")) {
  db.exec("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL");
}
if (!txCols.includes("dismissed_uncategorised")) {
  db.exec("ALTER TABLE transactions ADD COLUMN dismissed_uncategorised INTEGER NOT NULL DEFAULT 0");
}
// created here rather than in the initial schema block above, since that
// block's CREATE TABLE is a no-op on an existing database and the ALTER
// TABLE above hasn't necessarily happened yet within that same batch
db.exec("CREATE INDEX IF NOT EXISTS idx_tx_user_acct ON transactions(user_id, account_id)");

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

// Categories and rules used to be shared across every account a user had.
// Rebuild both tables scoped to an account: existing rows go to the user's
// first account (their original checking account), and a fresh UNIQUE
// (account_id, name) replaces the old per-user one so a second account can
// reuse a category name without colliding.
//
// With foreign_keys enforcement on, SQLite's DROP TABLE below performs an
// implicit "delete every row" first and fires whatever ON DELETE actions
// depend on it — transactions.category_id (ON DELETE SET NULL) and the old
// rules.category_id (ON DELETE CASCADE) — before categories_new is even
// renamed into place. Left enabled, that silently wipes every transaction's
// category and deletes every rule outright. Disabled for just this rebuild,
// per SQLite's own recommended procedure for this kind of schema change.
const catCols = db.prepare('PRAGMA table_info(categories)').all().map((c) => c.name);
const ruleColsBefore = db.prepare('PRAGMA table_info(rules)').all().map((c) => c.name);
const rebuildingCategories = !catCols.includes('account_id');
const rebuildingRules = !ruleColsBefore.includes('account_id');
if (rebuildingCategories || rebuildingRules) db.exec('PRAGMA foreign_keys = OFF');

if (rebuildingCategories) {
  tx(() => {
    db.exec(`
      CREATE TABLE categories_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL DEFAULT 'expense',
        color      TEXT NOT NULL DEFAULT '#64748b',
        UNIQUE (account_id, name)
      )
    `);
    db.exec(`
      INSERT INTO categories_new (id, user_id, account_id, name, kind, color)
      SELECT c.id, c.user_id,
        (SELECT MIN(id) FROM accounts WHERE accounts.user_id = c.user_id),
        c.name, c.kind, c.color
      FROM categories c
    `);
    db.exec('DROP TABLE categories');
    db.exec('ALTER TABLE categories_new RENAME TO categories');
  });
}

if (rebuildingRules) {
  tx(() => {
    db.exec(`
      CREATE TABLE rules_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        match_text  TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        priority    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO rules_new (id, user_id, account_id, match_text, category_id, priority, created_at)
      SELECT r.id, r.user_id,
        (SELECT account_id FROM categories WHERE categories.id = r.category_id),
        r.match_text, r.category_id, r.priority, r.created_at
      FROM rules r
    `);
    db.exec('DROP TABLE rules');
    db.exec('ALTER TABLE rules_new RENAME TO rules');
  });
}

if (rebuildingCategories || rebuildingRules) {
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length) {
    throw new Error(`Foreign key check failed after category/rule migration: ${JSON.stringify(violations)}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}

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

export function seedCategories(userId, accountId) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, account_id, name, kind, color) VALUES (?, ?, ?, ?, ?)'
  );
  tx(() => {
    for (const c of DEFAULT_CATEGORIES) stmt.run(userId, accountId, c.name, c.kind, c.color);
  });
}

/** Creates the user's first account if they don't have one yet, and returns its id either way. */
export function seedDefaultAccount(userId) {
  const existing = db.prepare('SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1').get(userId);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO accounts (user_id, name) VALUES (?, ?)').run(userId, 'Main account');
  return Number(info.lastInsertRowid);
}
