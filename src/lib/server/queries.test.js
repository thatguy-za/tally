import { describe, it, expect } from 'vitest';
import { db } from './db.js';
import {
  createCategory,
  setCategoryKind,
  createAccount,
  addTransaction,
  updateTransaction,
  bulkInsert,
  bulkCategorise,
  uncategorisedCount,
  monthlyTotals,
  categoryBreakdown,
  createRule,
  applyRules,
  categoriseByRules,
  budgetStatus,
  setBudget,
  categoryMonthlyAverages,
  monthRange,
  periodInsights,
  monthlyCategoryTotals,
  savingsSummary
} from './queries.js';

/**
 * Every test group gets its own user id, so fixtures never collide even
 * though the whole suite shares one on-disk SQLite file (see vite.config.js).
 */
let nextUser = 1;
function makeUser() {
  const id = nextUser++;
  db.prepare(
    "INSERT INTO users (id, email, password_hash, currency) VALUES (?, ?, 'x', 'EUR')"
  ).run(id, `test-user-${id}@example.com`);
  return id;
}

function makeCategory(userId, name, kind = 'expense') {
  return Number(createCategory(userId, name, kind, '#000000').lastInsertRowid);
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
  it('counts expense/income normally, excludes saving from spend and reports it as saved', () => {
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
    const checking = createAccount(u, 'Checking').lastInsertRowid;
    const savingsAcct = createAccount(u, 'Savings account').lastInsertRowid;
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
    const acct = createAccount(u, 'Checking').lastInsertRowid;
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
    const groceries = makeCategory(u, 'Groceries', 'expense');
    createRule(u, 'SPAR', groceries, 0);
    expect(categoriseByRules(u, 'SPAR Cape Town')).toBe(groceries);
    expect(categoriseByRules(u, 'spar cape town')).toBe(groceries);
    expect(categoriseByRules(u, 'Woolworths')).toBeNull();
  });

  it('prefers the higher-priority rule when more than one matches', () => {
    const u = makeUser();
    const general = makeCategory(u, 'Shopping', 'expense');
    const specific = makeCategory(u, 'Subscriptions', 'expense');
    createRule(u, 'Shop', general, 0);
    createRule(u, 'Shopify', specific, 10);
    expect(categoriseByRules(u, 'Shopify invoice')).toBe(specific);
  });
});

describe('applyRules', () => {
  it('with onlyUncategorised (the default), a higher-priority rule claims a row before a lower one can', () => {
    const u = makeUser();
    const general = makeCategory(u, 'Shopping', 'expense');
    const specific = makeCategory(u, 'Subscriptions', 'expense');
    // inserted low-priority-first, to make sure the effect is from priority
    // ordering and not insertion order
    createRule(u, 'Shop', general, 0);
    createRule(u, 'Shopify', specific, 10);
    addTx(u, { date: '2026-05-01', amount: -9, description: 'Shopify invoice' });

    const changed = applyRules(u, { onlyUncategorised: true });
    expect(changed).toBe(1);
    const [row] = db.prepare('SELECT category_id FROM transactions WHERE user_id = ?').all(u);
    expect(row.category_id).toBe(specific);
  });

  it('only touches uncategorised rows when onlyUncategorised is true', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const already = makeCategory(u, 'Other', 'expense');
    createRule(u, 'SPAR', groceries, 0);
    const id = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR', category_id: already }).lastInsertRowid);

    const changed = applyRules(u, { onlyUncategorised: true });
    expect(changed).toBe(0);
    const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(already);
  });

  it('with onlyUncategorised false, re-applies to already-categorised rows too', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const other = makeCategory(u, 'Other', 'expense');
    createRule(u, 'SPAR', groceries, 0);
    const id = Number(addTx(u, { date: '2026-05-01', amount: -9, description: 'SPAR', category_id: other }).lastInsertRowid);

    const changed = applyRules(u, { onlyUncategorised: false });
    expect(changed).toBe(1);
    const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(groceries);
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
    const acct = createAccount(u, 'Checking').lastInsertRowid;
    const cat = makeCategory(u, 'Groceries', 'expense');
    const id1 = Number(addTx(u, { date: '2026-06-01', amount: -10, account_id: acct }).lastInsertRowid);
    addTx(u, { date: '2026-06-02', amount: -5 }); // no account

    expect(uncategorisedCount(u)).toBe(2);
    expect(uncategorisedCount(u, acct)).toBe(1);

    bulkCategorise(u, [id1], cat);
    expect(uncategorisedCount(u)).toBe(1);
  });
});

describe('budgetStatus', () => {
  it('computes remaining and pct for an expense target, matched to the given month only', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    setBudget(u, groceries, 200);
    addTx(u, { date: '2026-07-05', amount: -150, category_id: groceries });
    addTx(u, { date: '2026-08-05', amount: -999, category_id: groceries }); // different month, ignored

    const row = budgetStatus(u, '2026-07').find((r) => r.id === groceries);
    expect(row.target).toBe(200);
    expect(row.actual).toBe(150);
    expect(row.remaining).toBe(50);
    expect(row.pct).toBe(75);
  });

  it('flips the sign for a saving category, so a net withdrawal reads negative rather than "saved"', () => {
    const u = makeUser();
    const savings = makeCategory(u, 'Savings', 'saving');
    setBudget(u, savings, 100);
    addTx(u, { date: '2026-07-01', amount: -30, category_id: savings }); // paid in
    addTx(u, { date: '2026-07-02', amount: 50, category_id: savings }); // withdrawn, net outflow

    const row = budgetStatus(u, '2026-07').find((r) => r.id === savings);
    // net signed amount is +20 (more taken out than put in) -> actual is -20
    expect(row.actual).toBe(-20);
  });

  it('narrows actuals to one account', () => {
    const u = makeUser();
    const acct = createAccount(u, 'Checking').lastInsertRowid;
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2026-07-01', amount: -40, category_id: groceries, account_id: acct });
    addTx(u, { date: '2026-07-02', amount: -10, category_id: groceries });

    const filtered = budgetStatus(u, '2026-07', acct).find((r) => r.id === groceries);
    const combined = budgetStatus(u, '2026-07').find((r) => r.id === groceries);
    expect(filtered.actual).toBe(40);
    expect(combined.actual).toBe(50);
  });
});

describe('categoryMonthlyAverages', () => {
  it('averages total spend over the number of distinct months with any data', () => {
    const u = makeUser();
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2026-01-01', amount: -100, category_id: groceries });
    addTx(u, { date: '2026-02-01', amount: -50, category_id: groceries });
    // a third month with unrelated activity still counts as a month with data
    addTx(u, { date: '2026-03-01', amount: -1, category_id: makeCategory(u, 'Other', 'expense') });

    const row = categoryMonthlyAverages(u).find((r) => r.id === groceries);
    expect(row.average).toBe(50); // 150 total / 3 months
  });
});

describe('periodInsights', () => {
  it('reads a single complete month against the average of the months before it', () => {
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
    expect(ins.baseline.spent).toBe(150); // average of 100 and 200

    const mover = ins.movers.find((m) => m.id === groceries);
    expect(mover.usual).toBe(150);
    expect(mover.spent).toBe(300);
    expect(mover.delta).toBe(150);
  });

  it('reports no baseline for the very first month of data', () => {
    const u = makeUser();
    addTx(u, { date: '2025-01-01', amount: -10, category_id: makeCategory(u, 'Groceries', 'expense') });
    const ins = periodInsights(u, '2025-01', '2025-01');
    expect(ins.reason).toBe('no-history');
    expect(ins.comparable).toBe(false);
    expect(ins.baseline).toBeNull();
  });

  it('reports "empty" when the period has no data of any kind', () => {
    const u = makeUser();
    const ins = periodInsights(u, '2025-01', '2025-01');
    expect(ins.reason).toBe('empty');
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

  it('excludes a transfer-kind transaction from earned, spent and saved', () => {
    const u = makeUser();
    const transfer = makeCategory(u, 'Transfer', 'transfer');
    addTx(u, { date: '2025-04-01', amount: 500, category_id: transfer });
    const ins = periodInsights(u, '2025-04', '2025-04');
    expect(ins.reason).toBe('empty'); // nothing counts as earned/spent/saved at all
  });

  it('narrows to a single account', () => {
    const u = makeUser();
    const acct = createAccount(u, 'Checking').lastInsertRowid;
    const groceries = makeCategory(u, 'Groceries', 'expense');
    addTx(u, { date: '2025-05-01', amount: -40, category_id: groceries, account_id: acct });
    addTx(u, { date: '2025-05-02', amount: -10, category_id: groceries });

    expect(periodInsights(u, '2025-05', '2025-05', acct).spent).toBe(40);
    expect(periodInsights(u, '2025-05', '2025-05').spent).toBe(50);
  });
});

describe('monthlyCategoryTotals', () => {
  it('includes only income (positive) and expense (negative) transactions, as positive magnitudes', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    const groceries = makeCategory(u, 'Groceries', 'expense');
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-01', amount: 1000, category_id: salary });
    addTx(u, { date: '2026-01-02', amount: -100, category_id: groceries });
    addTx(u, { date: '2026-01-03', amount: -50, category_id: savings }); // excluded entirely

    const rows = monthlyCategoryTotals(u, '2026-01', '2026-01');
    expect(rows).toHaveLength(2);
    const salaryRow = rows.find((r) => r.id === salary);
    const groceriesRow = rows.find((r) => r.id === groceries);
    expect(salaryRow.total).toBe(1000);
    expect(groceriesRow.total).toBe(100);
  });

  it('excludes an income category\'s refund (a negative amount) and an expense category\'s reversal (a positive amount)', () => {
    const u = makeUser();
    const salary = makeCategory(u, 'Salary', 'income');
    addTx(u, { date: '2026-01-01', amount: -5, category_id: salary }); // an income category charged backwards
    expect(monthlyCategoryTotals(u, '2026-01', '2026-01')).toHaveLength(0);
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
    const acct = createAccount(u, 'Checking').lastInsertRowid;
    const savings = makeCategory(u, 'Savings', 'saving');
    addTx(u, { date: '2026-01-15', amount: -100, category_id: savings, account_id: acct });
    addTx(u, { date: '2026-01-16', amount: -20, category_id: savings });

    expect(savingsSummary(u, 12, acct).total).toBe(100);
    expect(savingsSummary(u, 12).total).toBe(120);
  });
});

describe('setCategoryKind', () => {
  it('changes what a category is, which changes how its transactions are read', () => {
    const u = makeUser();
    const cat = makeCategory(u, 'Misc', 'expense');
    addTx(u, { date: '2026-01-01', amount: -75, category_id: cat });
    expect(monthlyTotals(u, 1)[0].outgoing).toBe(75);

    setCategoryKind(u, cat, 'saving');
    expect(monthlyTotals(u, 1)[0].outgoing).toBe(0);
    expect(monthlyTotals(u, 1)[0].saved).toBe(75);
  });
});

describe('updateTransaction', () => {
  it('only updates the fields provided', () => {
    const u = makeUser();
    const cat = makeCategory(u, 'Groceries', 'expense');
    const id = Number(addTx(u, { date: '2026-01-01', amount: -10, description: 'Coffee' }).lastInsertRowid);

    updateTransaction(u, id, { category_id: cat });

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    expect(row.category_id).toBe(cat);
    expect(row.description).toBe('Coffee'); // untouched
    expect(row.amount).toBe(-10); // untouched
  });
});
