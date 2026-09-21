import { db, tx } from './db.js';
import { toCsv, parseCsv } from '$lib/csv.js';
import { createZip, readZip } from './zip.js';
import { listTransactions, CATEGORY_KINDS } from './queries.js';

const FILES = ['transactions.csv', 'categories.csv', 'rules.csv', 'budgets.csv'];

/**
 * Every account's data, as the four CSVs described to the user — each row
 * carries an account_name column instead of one file per account, so the
 * zip's contents are always the same four names no matter how many accounts
 * exist.
 * @param {number} userId
 * @returns {Buffer}
 */
export function buildBackupZip(userId) {
  const transactions = listTransactions(userId).map((t) => ({
    account_name: t.account_name || '',
    date: t.date,
    description: t.description,
    amount: t.amount,
    category_name: t.category_name || '',
    dismissed_uncategorised: t.dismissed_uncategorised ? 1 : 0
  }));

  const categories = db
    .prepare(
      `SELECT a.name AS account_name, c.name, c.kind, c.color, c.group_name
       FROM categories c JOIN accounts a ON a.id = c.account_id
       WHERE c.user_id = ? ORDER BY a.name, c.kind, c.name`
    )
    .all(userId);

  const rules = db
    .prepare(
      `SELECT a.name AS account_name, r.match_text, c.name AS category_name, r.priority
       FROM rules r
       JOIN accounts a ON a.id = r.account_id
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? ORDER BY a.name, r.priority DESC, r.id`
    )
    .all(userId);

  const budgets = db
    .prepare(
      `SELECT a.name AS account_name, c.name AS category_name, b.amount
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       JOIN accounts a ON a.id = c.account_id
       WHERE b.user_id = ? ORDER BY a.name, c.name`
    )
    .all(userId);

  return createZip([
    { name: 'transactions.csv', data: toCsv(transactions, ['account_name', 'date', 'description', 'amount', 'category_name', 'dismissed_uncategorised']) },
    { name: 'categories.csv', data: toCsv(categories, ['account_name', 'name', 'kind', 'color', 'group_name']) },
    { name: 'rules.csv', data: toCsv(rules, ['account_name', 'match_text', 'category_name', 'priority']) },
    { name: 'budgets.csv', data: toCsv(budgets, ['account_name', 'category_name', 'amount']) }
  ]);
}

/** Turns parsed CSV rows (array-of-arrays, header first) into objects keyed by header. */
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/**
 * Wipes every account this user has — and everything scoped to them
 * (categories, rules, budgets, transactions) — and rebuilds all of it from
 * the four CSVs in `zipBuffer`. All-or-nothing: any structural problem
 * (a missing file, an unparseable CSV) throws and rolls back before
 * anything is touched; a row referencing an account/category that never
 * got created from categories.csv is skipped and counted rather than
 * failing the whole restore.
 * @param {number} userId
 * @param {Buffer} zipBuffer
 * @returns {{ accounts: number, categories: number, rules: number, budgets: number, transactions: number, skipped: number }}
 */
export function restoreBackup(userId, zipBuffer) {
  let entries;
  try {
    entries = readZip(zipBuffer);
  } catch {
    throw new Error('That file is not a valid zip archive.');
  }
  const byName = new Map(entries.map((e) => [e.name, e.data.toString('utf8')]));
  const missing = FILES.filter((f) => !byName.has(f));
  if (missing.length) throw new Error(`The zip is missing ${missing.join(', ')}.`);

  const transactions = rowsToObjects(parseCsv(byName.get('transactions.csv'), ','));
  const categories = rowsToObjects(parseCsv(byName.get('categories.csv'), ','));
  const rules = rowsToObjects(parseCsv(byName.get('rules.csv'), ','));
  const budgets = rowsToObjects(parseCsv(byName.get('budgets.csv'), ','));

  // every account name mentioned anywhere, so a row in one file referencing
  // an account that (unexpectedly) has no categories still gets an account
  const accountNames = new Set();
  for (const rows of [transactions, categories, rules, budgets]) {
    for (const r of rows) if (r.account_name?.trim()) accountNames.add(r.account_name.trim());
  }
  if (!accountNames.size) throw new Error('No accounts found in this backup.');

  let skipped = 0;

  return tx(() => {
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId); // cascades categories, rules, budgets

    const accountId = new Map(); // name -> id
    const insertAccount = db.prepare('INSERT INTO accounts (user_id, name) VALUES (?, ?)');
    for (const name of accountNames) {
      const info = insertAccount.run(userId, name);
      accountId.set(name, Number(info.lastInsertRowid));
    }

    const categoryId = new Map(); // "accountId:name" -> id
    const insertCategory = db.prepare(
      'INSERT INTO categories (user_id, account_id, name, kind, color, group_name) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const r of categories) {
      const acctId = accountId.get(r.account_name?.trim());
      const name = r.name?.trim();
      if (!acctId || !name) { skipped++; continue; }
      const kind = CATEGORY_KINDS.includes(r.kind) ? r.kind : 'expense';
      const info = insertCategory.run(userId, acctId, name, kind, r.color || '#64748b', r.group_name?.trim() || null);
      categoryId.set(`${acctId}:${name}`, Number(info.lastInsertRowid));
    }

    const insertRule = db.prepare(
      'INSERT INTO rules (user_id, account_id, match_text, category_id, priority) VALUES (?, ?, ?, ?, ?)'
    );
    let ruleCount = 0;
    for (const r of rules) {
      const acctId = accountId.get(r.account_name?.trim());
      const catId = acctId && categoryId.get(`${acctId}:${r.category_name?.trim()}`);
      const matchText = r.match_text?.trim();
      if (!acctId || !catId || !matchText) { skipped++; continue; }
      insertRule.run(userId, acctId, matchText, catId, Number(r.priority) || 0);
      ruleCount++;
    }

    const insertBudget = db.prepare('INSERT INTO budgets (user_id, category_id, amount) VALUES (?, ?, ?)');
    let budgetCount = 0;
    for (const r of budgets) {
      const acctId = accountId.get(r.account_name?.trim());
      const catId = acctId && categoryId.get(`${acctId}:${r.category_name?.trim()}`);
      const amount = Number(r.amount);
      if (!catId || !Number.isFinite(amount)) { skipped++; continue; }
      insertBudget.run(userId, catId, amount);
      budgetCount++;
    }

    const insertTx = db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category_id, account_id, dismissed_uncategorised) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    let txCount = 0;
    for (const r of transactions) {
      const amount = Number(r.amount);
      if (!r.date || !Number.isFinite(amount)) { skipped++; continue; }
      const acctId = accountId.get(r.account_name?.trim()) || null;
      const catId = (acctId && categoryId.get(`${acctId}:${r.category_name?.trim()}`)) || null;
      insertTx.run(
        userId,
        r.date,
        r.description || '',
        amount,
        catId,
        acctId,
        r.dismissed_uncategorised === '1' || r.dismissed_uncategorised === 'true' ? 1 : 0
      );
      txCount++;
    }

    return {
      accounts: accountId.size,
      categories: categoryId.size,
      rules: ruleCount,
      budgets: budgetCount,
      transactions: txCount,
      skipped
    };
  });
}
