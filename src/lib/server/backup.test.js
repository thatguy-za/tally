import { describe, it, expect } from 'vitest';
import { db } from './db.js';
import {
  createCategory,
  createRule,
  setBudget,
  addTransaction,
  listAccounts,
  listCategories,
  listRules,
  listTransactions
} from './queries.js';
import { buildBackupZip, restoreBackup } from './backup.js';
import { readZip, createZip } from './zip.js';

let nextUser = 100000; // well clear of queries.test.js's own counter, since both share one db file
function makeUser() {
  const id = nextUser++;
  db.prepare("INSERT INTO users (id, username, password_hash, currency) VALUES (?, ?, 'x', 'EUR')").run(
    id,
    `backup-test-user-${id}`
  );
  return id;
}

function makeAccount(userId, name) {
  const info = db.prepare('INSERT INTO accounts (user_id, name) VALUES (?, ?)').run(userId, name);
  return Number(info.lastInsertRowid);
}

describe('backup and restore', () => {
  it('round-trips accounts, categories, rules, budgets and transactions across two accounts', () => {
    const u = makeUser();
    const main = makeAccount(u, 'Main account');
    const savings = makeAccount(u, 'Savings');

    const groceries = createCategory(u, main, 'Groceries', 'expense', '#f97316').id;
    const salary = createCategory(u, main, 'Salary', 'income', '#16a34a').id;
    const savingsCat = createCategory(u, savings, 'Savings & investments', 'saving', '#0ea5e9').id;

    createRule(u, main, 'SPAR', groceries, 5);
    setBudget(u, groceries, 250);
    addTransaction(u, { date: '2026-01-05', description: 'SPAR run', amount: -42.5, category_id: groceries, account_id: main });
    addTransaction(u, { date: '2026-01-10', description: 'Payday', amount: 2000, category_id: salary, account_id: main });
    addTransaction(u, { date: '2026-01-15', description: 'Transfer to savings', amount: -300, category_id: savingsCat, account_id: savings });
    addTransaction(u, { date: '2026-01-20', description: 'Unsorted', amount: -12, category_id: null, account_id: main });

    const zip = buildBackupZip(u);

    // wipe-and-replace onto the SAME user: nuke the live data first, then
    // restore from the buffer built a moment ago, to prove the backup alone
    // (not any leftover live state) is what repopulates everything
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(u);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(u);

    const summary = restoreBackup(u, zip);
    expect(summary).toMatchObject({ accounts: 2, categories: 3, rules: 1, budgets: 1, transactions: 4, skipped: 0 });

    const accounts = listAccounts(u);
    expect(accounts.map((a) => a.name).sort()).toEqual(['Main account', 'Savings']);
    const newMain = accounts.find((a) => a.name === 'Main account').id;
    const newSavings = accounts.find((a) => a.name === 'Savings').id;

    const mainCats = listCategories(u, newMain);
    expect(mainCats.map((c) => c.name).sort()).toEqual(['Groceries', 'Salary']);
    const newGroceries = mainCats.find((c) => c.name === 'Groceries');
    expect(newGroceries.kind).toBe('expense');
    expect(newGroceries.color).toBe('#f97316');

    const rules = listRules(u, newMain);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ match_text: 'SPAR', category_id: newGroceries.id, priority: 5 });

    const budgetRow = db.prepare('SELECT amount FROM budgets WHERE user_id = ? AND category_id = ?').get(u, newGroceries.id);
    expect(budgetRow.amount).toBe(250);

    const txs = listTransactions(u);
    expect(txs).toHaveLength(4);
    const unsorted = txs.find((t) => t.description === 'Unsorted');
    expect(unsorted.category_id).toBeNull();
    expect(unsorted.account_id).toBe(newMain);
    const savingsTx = txs.find((t) => t.description === 'Transfer to savings');
    expect(savingsTx.account_id).toBe(newSavings);
  });

  it('skips a rule referencing a category that never resolves, without failing the whole restore', () => {
    const u = makeUser();
    const main = makeAccount(u, 'Main account');
    createCategory(u, main, 'Groceries', 'expense', '#f97316');
    addTransaction(u, { date: '2026-01-05', description: 'ok', amount: -10, category_id: null, account_id: main });
    const zip = buildBackupZip(u);

    // append a rule row naming a category that doesn't exist in
    // categories.csv, simulating a hand-edited backup
    const entries = readZip(zip);
    const patched = entries.map((e) =>
      e.name === 'rules.csv'
        ? { ...e, data: e.data.toString('utf8') + 'Main account,NOPE,Nonexistent category,0\r\n' }
        : e
    );
    const corruptZip = createZip(patched);

    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(u);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(u);

    const summary = restoreBackup(u, corruptZip);
    expect(summary.transactions).toBe(1);
    expect(summary.rules).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it('throws a clear error when a required file is missing from the zip', () => {
    const u = makeUser();
    const zip = createZip([
      { name: 'transactions.csv', data: 'account_name,date,description,amount,category_name,dismissed_uncategorised\r\n' }
    ]);
    expect(() => restoreBackup(u, zip)).toThrow(/missing/i);
  });
});
