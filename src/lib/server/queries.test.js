import { describe, it, expect, vi } from 'vitest';
import { db } from './db.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  setCategoryKind,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  bulkInsert,
  bulkCategorise,
  bulkDelete,
  uncategorisedCount,
  monthlyTotals,
  categoryBreakdown,
  createRule,
  deleteRule,
  applyRules,
  categoriseByRules,
  previewRuleRerun,
  applyCategoryChanges,
  budgetStatus,
  setBudget,
  categoryMonthlyAverages,
  monthRange,
  periodInsights,
  monthlyCategoryTotals,
  savingsSummary,
  getLogoDomains
} from './queries.js';

/**
 * Every test group gets its own user id, so fixtures never collide even
 * though the whole suite shares one on-disk SQLite file (see vite.config.js).
 */
let nextUser = 1;
function makeUser() {
  const id = nextUser++;
  db.prepare(
    "INSERT INTO users (id, username, password_hash, currency) VALUES (?, ?, 'x', 'EUR')"
  ).run(id, `test-user-${id}`);
  return id;
}

/**
 * Categories and rules now belong to one account each. Most tests don't care
 * about multi-account behaviour, so they share one implicit account per user
 * instead of each having to create one — tests that DO care create their own
 * accounts explicitly and pass the id through.
 */
// a bare insert, not the real createAccount() — tests want a blank account to
// put their own fixture categories in, not a full seeded default set
function makeAccount(userId, name = 'Checking', color = '#64748b', kind = 'checking') {
  const info = db
    .prepare('INSERT INTO accounts (user_id, name, color, kind) VALUES (?, ?, ?, ?)')
    .run(userId, name, color, kind);
  return Number(info.lastInsertRowid);
}

const defaultAccountByUser = new Map();
function defaultAccount(userId) {
  let id = defaultAccountByUser.get(userId);
  if (!id) {
    id = makeAccount(userId, 'Default');
    defaultAccountByUser.set(userId, id);
  }
  return id;
}

function makeCategory(userId, name, kind = 'expense', accountId = defaultAccount(userId)) {
  return createCategory(userId, accountId, name, kind, '#000000').id;
}

function addTx(userId, { date, amount, category_id = null, account_id = null, description = '' }) {
  return addTransaction(userId, { date, description, amount, category_id, account_id });
}

describe('monthRange', () => {
  it('lists every calendar month between from and to, inclusive', () => {
    expect(monthRange('2026-01', '2026-01')).toEqual(['2026-01']);
    expect(monthRange('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02'
    ]);
  });
});

describe('category kinds and monthlyTotals', () => {
  it('excludes saving from spend and reports it as saved', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const savings = makeCategory(u, 'Savings', 'saving');

    addTx(u, { date: '2026-03-01', amount: 3000, category_id: salary });
    addTx(u, { date: '2026-03-05', amount: -200, category_id: groceries });
    // money leaving the current account into savings: negative, saving kind
    addTx(u, { date: '2026-03-06', amount: -400, category_id: savings });

    const [row] = monthlyTotals(u, 1);
    expect(row.incoming).toBe(3000);
    expect(row.outgoing).toBe(200); // the saving transfer must not inflate this
    expect(row.saved).toBe(400);
  });

  it('excludes transfer (the receiving side of a move between accounts) from income, outgoing and saved alike', () => {
    const u = makeUser();
    const transfer = makeCategory(u, 'Transfer', 'transfer');
    // the arrival of a transfer already counted as "saved" on the sending side
    addTx(u, { date: '2026-03-06', amount: 400, category_id: transfer });

    const [row] = monthlyTotals(u, 1);
    expect(row.incoming).toBe(0);
    expect(row.outgoing).toBe(0);
    expect(row.saved).toBe(0);
  });

  it('excludes opening_balance (the starting balance of a tracked account) from income, outgoing and saved alike', () => {
    const u = makeUser();
    const opening = makeCategory(u, 'Opening balance', 'opening_balance');
    addTx(u, { date: '2026-03-01', amount: 1000, category_id: opening });

    const [row] = monthlyTotals(u, 1);
    expect(row.incoming).toBe(0);
    expect(row.outgoing).toBe(0);
    expect(row.saved).toBe(0);
  });

  it('treats an uncategorised transaction as ordinary spending/income, not saving', () => {
    const u = makeUser();
    addTx(u, { date: '2026-03-01', amount: -50 });
    addTx(u, { date: '2026-03-02', amount: 50 });

    const [row] = monthlyTotals(u, 1);
    expect(row.outgoing).toBe(50);
    expect(row.incoming).toBe(50);
    expect(row.saved).toBe(0);
  });

  it('filters to one account, or to unassigned transactions, without double-counting', () => {
    const u = makeUser();
    const checking = makeAccount(u, 'Checking');
    const savingsAcct = makeAccount(u, 'Savings account');
    const groceries = makeCategory(u, 'Groceries', 'expense');

    addTx(u, { date: '2026-03-01', amount: -100, category_id: groceries, account_id: checking });
    addTx(u, { date: '2026-03-02', amount: -30, category_id: groceries, account_id: savingsAcct });
    addTx(u, { date: '2026-03-03', amount: -10, category_id: groceries }); // no account

    const all = monthlyTotals(u, 1)[0];
    const checkingOnly = monthlyTotals(u, 1, checking)[0];
    const savingsOnly = monthlyTotals(u, 1, savingsAcct)[0];
    const unassigned = monthlyTotals(u, 1, 'none')[0];

    expect(all.outgoing).toBe(140);
    expect(checkingOnly.outgoing).toBe(100);
    expect(savingsOnly.outgoing).toBe(30);
    expect(unassigned.outgoing).toBe(10);
    // the three slices add back up to the combined total
    expect(checkingOnly.outgoing + savingsOnly.outgoing + unassigned.outgoing).toBe(all.outgoing);
  });

  it('treats a saving category as ordinary income/spending on a dedicated savings account', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Emergency fund', '#000000', 'savings');
    const savings = makeCategory(u, 'Savings', 'saving', acct);
    addTx(u, { date: '2026-03-01', amount: 500, category_id: savings, account_id: acct });
    addTx(u, { date: '2026-03-02', amount: -50, category_id: savings, account_id: acct });

    const [row] = monthlyTotals(u, 1, acct);
    expect(row.incoming).toBe(500);
    expect(row.outgoing).toBe(50);
    expect(row.saved).toBe(0);
  });
});

describe('categoryBreakdown', () => {
  it('reports uncategorised transactions under a synthetic "Uncategorised" bucket', () => {
    const u = makeUser();
    addTx(u, { date: '2026-04-01', amount: -20 });
    const rows = categoryBreakdown(u, '2026-04');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Uncategorised');
    expect(rows[0].total).toBe(-20);
  });

  it('narrows to a single account when asked', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Checking');
    const cat = makeCategory(u, 'Shopping', 'expense');
    addTx(u, { date: '2026-04-01', amount: -20, category_id: cat, account_id: acct });
    addTx(u, { date: '2026-04-02', amount: -5, category_id: cat });

    expect(categoryBreakdown(u, '2026-04', acct)[0].total).toBe(-20);
    expect(categoryBreakdown(u, '2026-04')[0].total).toBe(-25);
  });
});

describe('categoriseByRules', () => {
  it('matches a substring of the description, case-insensitively', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    expect(categoriseByRules(u, acct, 'SPAR Cape Town')).toBe(groceries);
    expect(categoriseByRules(u, acct, 'spar cape town')).toBe(groceries);
    expect(categoriseByRules(u, acct, 'Woolworths')).toBeNull();
  });

  it('prefers the higher-priority rule when more than one matches', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const general = makeCategory(u, 'Shopping', 'expense');
    const specific = makeCategory(u, 'Subscriptions', 'expense');
    createRule(u, acct, 'Shop', general, 0);
    createRule(u, acct, 'Shopify', specific, 10);
    expect(categoriseByRules(u, acct, 'Shopify invoice')).toBe(specific);
  });
});

describe('applyRules', () => {
  it('with onlyUncategorised (the default), a higher-priority rule claims a row before a lower one can', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const general = makeCategory(u, 'Shopping', 'expense');
    const specific = makeCategory(u, 'Subscriptions', 'expense');
    // inserted low-priority-first, to make sure the effect is from priority
    // ordering and not insertion order
    createRule(u, acct, 'Shop', general, 0);
    createRule(u, acct, 'Shopify', specific, 10);
    addTx(u, { date: '2026-05-01', amount: -9, description: 'Shopify invoice', account_id: acct });

    const changed = applyRules(u, { onlyUncategorised: true, accountId: acct });
    expect(changed).toBe(1);
    const [row] = db.prepare('SELECT category_id FROM transactions WHERE user_id = ?').all(u);
    expect(row.category_id).toBe(specific);
  });

  it('only touches uncategorised rows when onlyUncategorised is true', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const already = makeCategory(u, 'Other', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    const id = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR', category_id: already, account_id: acct }).lastInsertRowid);

    const changed = applyRules(u, { onlyUncategorised: true, accountId: acct });
    expect(changed).toBe(0);
    const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(already);
  });

  it('with onlyUncategorised false, re-applies to already-categorised rows too', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const other = makeCategory(u, 'Other', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    const id = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR', category_id: other, account_id: acct }).lastInsertRowid);

    const changed = applyRules(u, { onlyUncategorised: false, accountId: acct });
    expect(changed).toBe(1);
    const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(groceries);
  });

  it('with accountId, only touches rows in that account — no cross-account calculations', () => {
    const u = makeUser();
    const checking = makeAccount(u, 'Checking');
    const savings = makeAccount(u, 'Savings', '#000', 'savings');
    const groceries = makeCategory(u, 'Groceries', 'expense', savings);
    createRule(u, savings, 'SPAR', groceries, 0);
    const inChecking = Number(
      addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR', account_id: checking }).lastInsertRowid
    );
    const inSavings = Number(
      addTx(u, { date: '2026-05-02', amount: -9, description: 'SPAR', account_id: savings }).lastInsertRowid
    );

    const changed = applyRules(u, { onlyUncategorised: true, accountId: savings });
    expect(changed).toBe(1);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(inSavings).category_id).toBe(groceries);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(inChecking).category_id).toBeNull();
  });
});

describe('previewRuleRerun', () => {
  it('reports a row already categorised differently from what the rules would now pick', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const other = makeCategory(u, 'Other', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    const id = Number(
      addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR run', category_id: other, account_id: acct }).lastInsertRowid
    );

    const changes = previewRuleRerun(u, acct);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id,
      from_category_id: other,
      from_category_name: 'Other',
      to_category_id: groceries,
      to_category_name: 'Groceries'
    });
  });

  it('skips a row whose category already matches what the rules would pick', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR run', category_id: groceries, account_id: acct });
    expect(previewRuleRerun(u, acct)).toHaveLength(0);
  });

  it('includes an uncategorised row a rule would now match', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    createRule(u, acct, 'SPAR', groceries, 0);
    const id = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR run', account_id: acct }).lastInsertRowid);

    const changes = previewRuleRerun(u, acct);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id, from_category_id: null, from_category_name: null, to_category_id: groceries });
  });

  it('nothing changes without any rules', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR run', account_id: acct });
    expect(previewRuleRerun(u, acct)).toHaveLength(0);
  });
});

describe('deleteRule', () => {
  it('does nothing when the rule belongs to a different account than the one given', () => {
    const u = makeUser();
    const home = makeAccount(u, 'Home');
    const other = makeAccount(u, 'Other');
    const groceries = makeCategory(u, 'Groceries', 'expense', home);
    const id = Number(createRule(u, home, 'SPAR', groceries, 0).lastInsertRowid);

    deleteRule(u, other, id);
    expect(db.prepare('SELECT 1 FROM rules WHERE id = ?').get(id)).toBeTruthy();

    deleteRule(u, home, id);
    expect(db.prepare('SELECT 1 FROM rules WHERE id = ?').get(id)).toBeUndefined();
  });
});

describe('applyCategoryChanges', () => {
  it('applies exactly the given id -> category_id pairs and nothing else', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const untouched = makeCategory(u, 'Other', 'expense');
    const id1 = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'a', account_id: acct }).lastInsertRowid);
    const id2 = Number(
      addTx(u, { date: '2026-05-02', amount: -5, description: 'b', category_id: untouched, account_id: acct }).lastInsertRowid
    );

    const n = applyCategoryChanges(u, [{ id: id1, category_id: groceries }]);
    expect(n).toBe(1);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id1).category_id).toBe(groceries);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id2).category_id).toBe(untouched);
  });

  it('does nothing for an empty list', () => {
    const u = makeUser();
    expect(applyCategoryChanges(u, [])).toBe(0);
  });
});

describe('bulkInsert', () => {
  it('skips rows that duplicate an existing transaction, and duplicates within the same batch', () => {
    const u = makeUser();
    addTx(u, { date: '2026-06-01', amount: -10, description: 'Coffee' });

    const result = bulkInsert(u, [
      { date: '2026-06-01', amount: -10, description: 'Coffee' }, // dupes the existing row
      { date: '2026-06-02', amount: -5, description: 'Tea' },
      { date: '2026-06-02', amount: -5, description: 'Tea' } // dupes the previous line in this batch
    ]);

    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(2);
    const count = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?').get(u).n;
    expect(count).toBe(2); // the original + the one genuinely new row
  });

  it('can be told to keep duplicates', () => {
    const u = makeUser();
    addTx(u, { date: '2026-06-01', amount: -10, description: 'Coffee' });
    const result = bulkInsert(
      u,
      [{ date: '2026-06-01', amount: -10, description: 'Coffee' }],
      { skipDuplicates: false }
    );
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(0);
  });
});

describe('uncategorisedCount and bulkCategorise', () => {
  it('counts and clears uncategorised transactions, optionally scoped to an account', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Checking');
    const cat = makeCategory(u, 'Groceries', 'expense');
    const id1 = Number(addTx(u, { date: '2026-06-01', amount: -10, account_id: acct }).lastInsertRowid);
    addTx(u, { date: '2026-06-02', amount: -5 }); // no account

    expect(uncategorisedCount(u)).toBe(2);
    expect(uncategorisedCount(u, acct)).toBe(1);

    bulkCategorise(u, acct, [id1], cat);
    expect(uncategorisedCount(u)).toBe(1);
  });
});

describe('budgetStatus', () => {
  it('computes remaining and pct for an expense target, matched to the given month only', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    setBudget(u, groceries, 200);
    addTx(u, { date: '2026-07-05', amount: -150, category_id: groceries, account_id: acct });
    addTx(u, { date: '2026-08-05', amount: -999, category_id: groceries, account_id: acct }); // different month, ignored

    const row = budgetStatus(u, '2026-07', acct).find((r) => r.id === groceries);
    expect(row.target).toBe(200);
    expect(row.actual).toBe(150);
    expect(row.remaining).toBe(50);
    expect(row.pct).toBe(75);
  });

  it('flips the sign for a saving category, so a net withdrawal reads negative rather than "saved"', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const savings = makeCategory(u, 'Savings', 'saving');
    setBudget(u, savings, 100);
    addTx(u, { date: '2026-07-01', amount: -30, category_id: savings, account_id: acct }); // paid in
    addTx(u, { date: '2026-07-02', amount: 50, category_id: savings, account_id: acct }); // withdrawn, net outflow

    const row = budgetStatus(u, '2026-07', acct).find((r) => r.id === savings);
    // net signed amount is +20 (more taken out than put in) -> actual is -20
    expect(row.actual).toBe(-20);
  });

  it('narrows actuals to one account, never blending another account\'s categories or spend in', () => {
    const u = makeUser();
    const checking = makeAccount(u, 'Checking');
    const savings = makeAccount(u, 'Savings', '#000', 'savings');
    const groceries = makeCategory(u, 'Groceries', 'expense', checking);
    addTx(u, { date: '2026-07-01', amount: -40, category_id: groceries, account_id: checking });

    const checkingRows = budgetStatus(u, '2026-07', checking);
    expect(checkingRows.find((r) => r.id === groceries).actual).toBe(40);
    // the savings account never even sees checking's category
    expect(budgetStatus(u, '2026-07', savings).find((r) => r.id === groceries)).toBeUndefined();
  });
});

describe('categoryMonthlyAverages', () => {
  it('averages total spend over the number of distinct months with any data', () => {
    const u = makeUser();
    const acct = defaultAccount(u);
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2026-01-01', amount: -100, category_id: groceries, account_id: acct });
    addTx(u, { date: '2026-02-01', amount: -50, category_id: groceries, account_id: acct });
    // a third month with unrelated activity still counts as a month with data
    addTx(u, { date: '2026-03-01', amount: -1, category_id: makeCategory(u, 'Other', 'expense'), account_id: acct });

    const row = categoryMonthlyAverages(u, acct).find((r) => r.id === groceries);
    expect(row.average).toBe(50); // 150 total / 3 months
  });

  it('scopes to one account when given, never blending another account\'s spend in', () => {
    const u = makeUser();
    const checking = makeAccount(u, 'Checking');
    const savings = makeAccount(u, 'Savings', '#000', 'savings');
    const groceries = makeCategory(u, 'Groceries', 'expense', checking);
    addTx(u, { date: '2026-01-01', amount: -100, category_id: groceries, account_id: checking });

    const row = categoryMonthlyAverages(u, checking).find((r) => r.id === groceries);
    expect(row.average).toBe(100);
  });
});

describe('periodInsights', () => {
  it('reads a single complete month against the median of the months before it', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const savings = makeCategory(u, 'Savings', 'saving');

    for (const [ym, spend] of [['2025-01', 100], ['2025-02', 200]]) {
      addTx(u, { date: `${ym}-01`, amount: 1000, category_id: salary });
      addTx(u, { date: `${ym}-02`, amount: -spend, category_id: groceries });
    }
    addTx(u, { date: '2025-03-01', amount: 1000, category_id: salary });
    addTx(u, { date: '2025-03-02', amount: -300, category_id: groceries });
    addTx(u, { date: '2025-03-03', amount: -400, category_id: savings });

    const ins = periodInsights(u, '2025-03', '2025-03');
    expect(ins.single).toBe(true);
    expect(ins.partial).toBe(false); // safely in the past
    expect(ins.earned).toBe(1000);
    expect(ins.spent).toBe(300);
    expect(ins.saved).toBe(400);
    expect(ins.kept).toBe(700); // earned - spent; saving is not spending
    expect(ins.comparable).toBe(true);
    expect(ins.baseline.months).toBe(2);
    expect(ins.baseline.spent).toBe(150); // median of 100 and 200

    const mover = ins.movers.find((m) => m.id === groceries);
    expect(mover.usual).toBe(150);
    expect(mover.spent).toBe(300);
    expect(mover.delta).toBe(150);
  });

  it('excludes a saving category from earned/spent and counts it as saved, on a regular account', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Checking');
    const savings = makeCategory(u, 'Savings', 'saving', acct);
    addTx(u, { date: '2026-01-01', amount: 500, category_id: savings, account_id: acct }); // a deposit
    addTx(u, { date: '2026-01-02', amount: -50, category_id: savings, account_id: acct }); // a withdrawal

    const ins = periodInsights(u, '2026-01', '2026-01', acct);
    expect(ins.earned).toBe(0);
    expect(ins.spent).toBe(0);
    expect(ins.saved).toBe(-450); // net: -500 deposited + 50 withdrawn
  });

  it('treats a saving category as ordinary earned/spent on a dedicated savings account, not as saved', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Emergency fund', '#000000', 'savings');
    const savings = makeCategory(u, 'Savings', 'saving', acct);
    addTx(u, { date: '2026-01-01', amount: 500, category_id: savings, account_id: acct }); // a deposit
    addTx(u, { date: '2026-01-02', amount: -50, category_id: savings, account_id: acct }); // a withdrawal

    const ins = periodInsights(u, '2026-01', '2026-01', acct);
    expect(ins.earned).toBe(500);
    expect(ins.spent).toBe(50);
    expect(ins.saved).toBe(0);
  });

  it('reports no baseline for the very first month of data', () => {
    const u = makeUser();
    addTx(u, { date: '2025-01-01', amount: -10, category_id: makeCategory(u, 'Groceries', 'expense') });
    const ins = periodInsights(u, '2025-01', '2025-01');
    expect(ins.reason).toBe('no-history');
    expect(ins.comparable).toBe(false);
    expect(ins.baseline).toBeNull();
  });

  it('still reports the biggest categories when there is no earlier history to compare against', () => {
    const u = makeUser();
    const rent = makeCategory(u, 'Rent', 'expense');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2025-01-01', amount: -1000, category_id: rent });
    addTx(u, { date: '2025-02-01', amount: -1000, category_id: rent });
    addTx(u, { date: '2025-01-05', amount: -200, category_id: groceries });
    addTx(u, { date: '2025-02-05', amount: -150, category_id: groceries });

    const ins = periodInsights(u, '2025-01', '2025-02');
    expect(ins.comparable).toBe(false);
    expect(ins.movers).toEqual([]);
    expect(ins.topCategories.map((c) => c.name)).toEqual(['Rent', 'Groceries']);
    expect(ins.topCategories.find((c) => c.name === 'Rent').total).toBe(2000);
    expect(ins.topCategories.find((c) => c.name === 'Groceries').total).toBe(350);
  });

  it('reports "empty" when the period has no data of any kind', () => {
    const u = makeUser();
    const ins = periodInsights(u, '2025-01', '2025-01');
    expect(ins.reason).toBe('empty');
  });

  it('is not skewed by one outlier month when computing the baseline', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    // three ordinary months and one wildly expensive one (e.g. a one-off bill)
    for (const [ym, spend] of [['2025-01', 100], ['2025-02', 110], ['2025-03', 90], ['2025-04', 900]]) {
      addTx(u, { date: `${ym}-01`, amount: -spend, category_id: groceries });
    }
    addTx(u, { date: '2025-05-01', amount: -105, category_id: groceries });

    const ins = periodInsights(u, '2025-05', '2025-05');
    // median of [100, 110, 90, 900] is 105 — the mean (300) would call a
    // perfectly ordinary €105 month "63% under usual"
    expect(ins.baseline.spent).toBe(105);
  });

  it('averages a multi-month range and compares it to the months before the range', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2025-01-01', amount: -100, category_id: groceries }); // baseline
    addTx(u, { date: '2025-02-01', amount: -200, category_id: groceries }); // in range
    addTx(u, { date: '2025-03-01', amount: -400, category_id: groceries }); // in range

    const ins = periodInsights(u, '2025-02', '2025-03');
    expect(ins.single).toBe(false);
    expect(ins.spent).toBe(600); // total across the range
    expect(ins.avg.spent).toBe(300); // per month in range
    expect(ins.baseline.spent).toBe(100); // the one month before the range
  });

  it('uses the median, not the mean, for a multi-month range so one outlier month cannot skew it', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2025-01-01', amount: -100, category_id: groceries }); // baseline
    addTx(u, { date: '2025-02-01', amount: -100, category_id: groceries }); // in range
    addTx(u, { date: '2025-03-01', amount: -120, category_id: groceries }); // in range
    addTx(u, { date: '2025-04-01', amount: -5000, category_id: groceries }); // in range — a one-off

    const ins = periodInsights(u, '2025-02', '2025-04');
    expect(ins.spent).toBe(5220); // total still reflects every transaction
    expect(ins.avg.spent).toBe(120); // the median month, unmoved by the outlier
  });

  it('excludes a transfer-kind transaction from earned, spent and saved', () => {
    const u = makeUser();
    const transfer = makeCategory(u, 'Transfer', 'transfer');
    addTx(u, { date: '2025-04-01', amount: 500, category_id: transfer });
    const ins = periodInsights(u, '2025-04', '2025-04');
    expect(ins.reason).toBe('empty'); // nothing counts as earned/spent/saved at all
  });

  it('narrows to a single account', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Checking');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2025-05-01', amount: -40, category_id: groceries, account_id: acct });
    addTx(u, { date: '2025-05-02', amount: -10, category_id: groceries });

    expect(periodInsights(u, '2025-05', '2025-05', acct).spent).toBe(40);
    expect(periodInsights(u, '2025-05', '2025-05').spent).toBe(50);
  });

  it("reports a mover's actual spend so far on a partial month, never projected up to a full month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10)); // Jan 10 2026 — 10 of 31 days elapsed
    try {
      const u = makeUser();
      const groceries = makeCategory(u, 'Groceries', 'expense');
      addTx(u, { date: '2025-12-05', amount: -100, category_id: groceries }); // one month of history
      addTx(u, { date: '2026-01-05', amount: -20, category_id: groceries }); // actual so far this month

      const ins = periodInsights(u, '2026-01', '2026-01');
      expect(ins.partial).toBe(true);
      const mover = ins.movers.find((m) => m.id === groceries);
      // €20 actual — dividing by the ~32% of the month elapsed would wrongly
      // inflate this to ~€62, overstating what was actually spent
      expect(mover.spent).toBe(20);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('monthlyCategoryTotals', () => {
  it('includes income (positive), expense (negative) and saving (negative) transactions, as positive magnitudes', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-01', amount: 1000, category_id: salary });
    addTx(u, { date: '2026-01-02', amount: -100, category_id: groceries });
    addTx(u, { date: '2026-01-03', amount: -50, category_id: savings });

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01');
    expect(rows).toHaveLength(3);
    const salaryRow = rows.find((r) => r.id === salary);
    const groceriesRow = rows.find((r) => r.id === groceries);
    const savingsRow = rows.find((r) => r.id === savings);
    expect(salaryRow.total).toBe(1000);
    expect(groceriesRow.total).toBe(100);
    expect(savingsRow.total).toBe(50);
  });

  it('counts a saving category\'s deposit (a positive amount) as income, on any account', () => {
    const u = makeUser();
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-01', amount: 50, category_id: savings });

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: savings, kind: 'income', total: 50 });
  });

  it('counts a saving category\'s deposit as income when the account being viewed is itself a savings account too', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Emergency fund', '#000000', 'savings');
    const savings = makeCategory(u, 'Savings', 'saving', acct);
    addTx(u, { date: '2026-01-01', amount: 50, category_id: savings, account_id: acct });

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01', acct);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: savings, kind: 'income', total: 50 });
  });

  it('buckets by the transaction\'s own sign, not its category\'s kind, so a refund or correction still shows', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    const shopping = makeCategory(u, 'Shopping', 'expense');
    addTx(u, { date: '2026-01-01', amount: -5, category_id: salary }); // a correction charged back against income
    addTx(u, { date: '2026-01-02', amount: 20, category_id: shopping }); // a refund into an expense category

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01');
    expect(rows).toHaveLength(2);
    const salaryRow = rows.find((r) => r.id === salary);
    const shoppingRow = rows.find((r) => r.id === shopping);
    expect(salaryRow).toMatchObject({ kind: 'expense', total: 5 });
    expect(shoppingRow).toMatchObject({ kind: 'income', total: 20 });
  });

  it('folds uncategorised transactions into an "Uncategorised" bucket by sign, instead of dropping them', () => {
    const u = makeUser();
    addTx(u, { date: '2026-01-01', amount: 200 }); // uncategorised income
    addTx(u, { date: '2026-01-02', amount: -30 }); // uncategorised expense

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01');
    expect(rows).toHaveLength(2);
    const incomeRow = rows.find((r) => r.kind === 'income');
    const expenseRow = rows.find((r) => r.kind === 'expense');
    expect(incomeRow).toMatchObject({ id: -1, name: 'Uncategorised', total: 200 });
    expect(expenseRow).toMatchObject({ id: -1, name: 'Uncategorised', total: 30 });
  });
});

describe('savingsSummary', () => {
  it('builds a running total and reports the balance at each point', () => {
    const u = makeUser();
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-15', amount: -100, category_id: savings });
    addTx(u, { date: '2026-02-15', amount: -50, category_id: savings });
    addTx(u, { date: '2026-03-15', amount: 30, category_id: savings }); // a withdrawal

    const s = savingsSummary(u, 12);
    expect(s.total).toBe(120); // 100 + 50 - 30
    expect(s.series.map((p) => p.saved)).toEqual([100, 50, -30]);
    expect(s.series.map((p) => p.total)).toEqual([100, 150, 120]);
    expect(s.configured).toBe(true);
  });

  it('accepts a {from, to} window and reports the balance as of the end of it', () => {
    const u = makeUser();
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-15', amount: -100, category_id: savings });
    addTx(u, { date: '2026-02-15', amount: -50, category_id: savings });

    const s = savingsSummary(u, { from: '2026-02', to: '2026-02' });
    expect(s.inWindow).toBe(50);
    expect(s.total).toBe(150); // cumulative through the end of the window
  });

  it('is false for configured, and empty, when the user has no savings category', () => {
    const u = makeUser();
    makeCategory(u, 'Groceries', 'expense');
    const s = savingsSummary(u, 12);
    expect(s.configured).toBe(false);
    expect(s.total).toBe(0);
  });

  it('narrows to a single account', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Checking');
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-15', amount: -100, category_id: savings, account_id: acct });
    addTx(u, { date: '2026-01-16', amount: -20, category_id: savings });

    expect(savingsSummary(u, 12, acct).total).toBe(100);
    expect(savingsSummary(u, 12).total).toBe(120);
  });

  it('reports unconfigured on a dedicated savings account, since it counts as ordinary income/expense there instead', () => {
    const u = makeUser();
    const acct = makeAccount(u, 'Emergency fund', '#000000', 'savings');
    const savings = makeCategory(u, 'Savings', 'saving', acct);
    addTx(u, { date: '2026-01-15', amount: 100, category_id: savings, account_id: acct });

    const s = savingsSummary(u, 12, acct);
    expect(s.configured).toBe(false);
    expect(s.total).toBe(0);
    expect(s.series).toEqual([]);
  });
});

describe('setCategoryKind', () => {
  it('changes what a category is, which changes how its transactions are read', () => {
    const u = makeUser();
    const cat = makeCategory(u, 'Misc', 'expense');
    addTx(u, { date: '2026-01-01', amount: -75, category_id: cat });
    expect(monthlyTotals(u, 1)[0].outgoing).toBe(75);

    setCategoryKind(u, defaultAccount(u), cat, 'saving');
    expect(monthlyTotals(u, 1)[0].outgoing).toBe(0);
    expect(monthlyTotals(u, 1)[0].saved).toBe(75);
  });
});

describe('updateTransaction', () => {
  it('only updates the fields provided', () => {
    const u = makeUser();
    const cat = makeCategory(u, 'Groceries', 'expense');
    const id = Number(addTx(u, { date: '2026-01-01', amount: -10, description: 'Coffee' }).lastInsertRowid);

    updateTransaction(u, null, id, { category_id: cat });

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(cat);
    expect(row.description).toBe('Coffee'); // untouched
    expect(row.amount).toBe(-10); // untouched
  });

  it('does nothing when the transaction belongs to a different account than the one given', () => {
    const u = makeUser();
    const home = makeAccount(u, 'Home');
    const other = makeAccount(u, 'Other');
    const cat = makeCategory(u, 'Groceries', 'expense', home);
    const id = Number(addTx(u, { date: '2026-01-01', amount: -10, account_id: home }).lastInsertRowid);

    updateTransaction(u, other, id, { category_id: cat });

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBeNull(); // untouched — id belongs to `home`, not `other`
  });
});

describe('deleteTransaction, bulkCategorise and bulkDelete stay within one account', () => {
  it('deleteTransaction only removes a row that belongs to the given account', () => {
    const u = makeUser();
    const home = makeAccount(u, 'Home');
    const other = makeAccount(u, 'Other');
    const id = Number(addTx(u, { date: '2026-01-01', amount: -10, account_id: home }).lastInsertRowid);

    deleteTransaction(u, other, id);
    expect(db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(id)).toBeTruthy();

    deleteTransaction(u, home, id);
    expect(db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(id)).toBeUndefined();
  });

  it('bulkCategorise and bulkDelete ignore ids outside the given account', () => {
    const u = makeUser();
    const home = makeAccount(u, 'Home');
    const other = makeAccount(u, 'Other');
    const cat = makeCategory(u, 'Groceries', 'expense', home);
    const inHome = Number(addTx(u, { date: '2026-01-01', amount: -10, account_id: home }).lastInsertRowid);
    const inOther = Number(addTx(u, { date: '2026-01-02', amount: -5, account_id: other }).lastInsertRowid);

    expect(bulkCategorise(u, home, [inHome, inOther], cat)).toBe(1);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(inOther).category_id).toBeNull();

    expect(bulkDelete(u, home, [inHome, inOther])).toBe(1);
    expect(db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(inOther)).toBeTruthy();
  });
});

describe('getLogoDomains', () => {
  it('guesses and caches a domain per unique description, reused across repeats', () => {
    const first = getLogoDomains(['SPAR CAPE TOWN', 'SPAR CAPE TOWN', 'NETFLIX.COM']);
    expect(first.get('SPAR CAPE TOWN')).toBe('spar.com');
    expect(first.get('NETFLIX.COM')).toBe('netflix.com');

    const cachedRow = db
      .prepare('SELECT domain FROM merchant_logos WHERE key = ?')
      .get('spar cape town');
    expect(cachedRow.domain).toBe('spar.com');

    // a second call must reuse the cached row rather than re-guessing
    const second = getLogoDomains(['SPAR CAPE TOWN']);
    expect(second.get('SPAR CAPE TOWN')).toBe('spar.com');
  });

  it('caches a null guess too, so an ungessable description is not retried forever', () => {
    const result = getLogoDomains(['ATM WITHDRAWAL']);
    expect(result.get('ATM WITHDRAWAL')).toBeNull();

    const cachedRow = db
      .prepare('SELECT key, domain FROM merchant_logos WHERE key = ?')
      .get('atm withdrawal');
    expect(cachedRow).toBeTruthy();
    expect(cachedRow.domain).toBeNull();
  });

  it('maps blank descriptions to null without erroring', () => {
    const result = getLogoDomains(['', 'GITHUB INC']);
    expect(result.get('')).toBeNull();
    expect(result.get('GITHUB INC')).toBe('github.com');
  });
});
