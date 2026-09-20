import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { rmSync, mkdirSync } from 'node:fs';

/**
 * Regression test for a data-loss bug: rebuilding `categories`/`rules` to add
 * `account_id` (see db.js) drops the old tables while foreign_keys
 * enforcement is on. SQLite's DROP TABLE performs an implicit "delete every
 * row" first, which fires transactions.category_id's ON DELETE SET NULL and
 * the old rules.category_id's ON DELETE CASCADE — wiping every
 * transaction's category and deleting every rule — before the migration
 * even finishes. This sets up a database in exactly the pre-migration shape
 * (every other migration already applied, only this one pending) and
 * asserts both survive.
 */
const DB_PATH = '.vitest-tmp/migration-test.sqlite';

beforeAll(() => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true });
  mkdirSync('.vitest-tmp', { recursive: true });

  const raw = new DatabaseSync(DB_PATH);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(`
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'EUR',
      date_format   TEXT NOT NULL DEFAULT 'dmy',
      is_admin      INTEGER NOT NULL DEFAULT 0,
      onboarded_at  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE accounts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#64748b',
      kind       TEXT NOT NULL DEFAULT 'checking',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, name)
    );
    -- pre-migration shape: no account_id, uniqueness on (user_id, name)
    CREATE TABLE categories (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name    TEXT NOT NULL,
      kind    TEXT NOT NULL DEFAULT 'expense',
      color   TEXT NOT NULL DEFAULT '#64748b',
      UNIQUE (user_id, name)
    );
    CREATE TABLE transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount      REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      account_id  INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      dismissed_uncategorised INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- pre-migration shape: no account_id
    CREATE TABLE rules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_text  TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      priority    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE budgets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      amount      REAL NOT NULL,
      UNIQUE (user_id, category_id)
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE insights (
      user_id     INTEGER NOT NULL,
      scope       TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      summary     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, scope)
    );
    CREATE TABLE merchant_logos (key TEXT PRIMARY KEY, domain TEXT);
  `);

  raw.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('mig-user', 'x');
  raw.prepare('INSERT INTO accounts (id, user_id, name) VALUES (1, 1, ?)').run('Main account');
  raw.prepare('INSERT INTO categories (id, user_id, name, kind) VALUES (1, 1, ?, ?)').run('Groceries', 'expense');
  raw
    .prepare(
      'INSERT INTO transactions (id, user_id, date, description, amount, category_id, account_id) VALUES (1, 1, ?, ?, ?, 1, 1)'
    )
    .run('2026-01-15', 'SPAR', -42.5);
  raw.prepare('INSERT INTO rules (id, user_id, match_text, category_id) VALUES (1, 1, ?, 1)').run('SPAR');
  raw.close();
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true });
});

describe('category/rule account-scoping migration', () => {
  it('preserves transaction categorisation and rules instead of wiping them', async () => {
    // db.js resolves its path from $env/dynamic/private, which SvelteKit's
    // vite plugin bakes in once from process.env at startup — it can't be
    // changed mid-run, so this file is its own vitest invocation (see the
    // test:migration script) with DATABASE_PATH already pointed at DB_PATH
    // in the shell before the process starts.
    const { db } = await import('./db.js');

    const tx = db.prepare('SELECT category_id FROM transactions WHERE id = 1').get();
    expect(tx.category_id).toBe(1);

    const rules = db.prepare('SELECT * FROM rules').all();
    expect(rules).toHaveLength(1);
    expect(rules[0].match_text).toBe('SPAR');
    expect(rules[0].category_id).toBe(1);

    const cat = db.prepare('SELECT account_id FROM categories WHERE id = 1').get();
    expect(cat.account_id).toBe(1);

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    expect(fkViolations).toHaveLength(0);
  });
});
