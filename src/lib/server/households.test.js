import { describe, it, expect } from 'vitest';
import { db } from './db.js';
import {
  getHousehold,
  createHousehold,
  createInvite,
  joinHousehold,
  leaveHousehold,
  setCategoryHousehold,
  listInvites,
  revokeInvite,
  normaliseCode,
  formatCode
} from './households.js';
import {
  HOUSEHOLD,
  createCategory,
  addTransaction,
  listTransactions,
  listCategories,
  listMonths,
  periodInsights,
  monthlyCategoryTotals,
  householdMemberTotals,
  memberNames
} from './queries.js';

// own id range, so these fixtures never collide with other test files' users
let nextUser = 7000;
function makeUser(currency = 'EUR') {
  const id = nextUser++;
  db.prepare("INSERT INTO users (id, username, password_hash, currency) VALUES (?, ?, 'x', ?)").run(id, `hh-user-${id}`, currency);
  return id;
}
function makeAccount(userId, name = 'Main') {
  return Number(db.prepare('INSERT INTO accounts (user_id, name) VALUES (?, ?)').run(userId, name).lastInsertRowid);
}
function makeCategory(userId, accountId, name, kind = 'expense') {
  return createCategory(userId, accountId, name, kind, '#123456').id;
}
function spend(userId, accountId, categoryId, amount, date = '2026-06-10', description = 'x') {
  addTransaction(userId, { date, description, amount, category_id: categoryId, account_id: accountId });
}
/** two people in one household, each with an account */
function pair() {
  const a = makeUser();
  const b = makeUser();
  createHousehold(a, 'Test');
  const { code } = createInvite(a);
  expect(joinHousehold(b, code).ok).toBe(true);
  return { a, b, accA: makeAccount(a), accB: makeAccount(b) };
}

describe('creating, inviting and joining', () => {
  it('creates a household with the creator as its only member, in their currency', () => {
    const u = makeUser('GBP');
    expect(createHousehold(u, '  The Smiths  ')).toEqual({ ok: true });
    const h = getHousehold(u);
    expect(h).toMatchObject({ name: 'The Smiths', currency: 'GBP' });
    expect(h.members.map((m) => m.id)).toEqual([u]);
    expect(h.members[0].you).toBe(true);
  });

  it('puts a person in at most one household', () => {
    const u = makeUser();
    createHousehold(u, 'One');
    expect(createHousehold(u, 'Two').ok).toBe(false);
  });

  it('lets someone join with a code, once, and the code is then spent', () => {
    const a = makeUser();
    const b = makeUser();
    const c = makeUser();
    createHousehold(a, 'Home');
    const { code } = createInvite(a);
    expect(joinHousehold(b, code).ok).toBe(true);
    expect(getHousehold(b).members).toHaveLength(2);
    expect(joinHousehold(c, code).ok).toBe(false);
  });

  it('accepts a code typed in lower case, with a dash or spaces', () => {
    const a = makeUser();
    const b = makeUser();
    createHousehold(a, 'Home');
    const { code } = createInvite(a);
    expect(joinHousehold(b, ` ${formatCode(code).toLowerCase()} `).ok).toBe(true);
    expect(normaliseCode('ab-cd 12')).toBe('ABCD12');
  });

  it('gives the same answer for an unknown, a used and an expired code', () => {
    const a = makeUser();
    const b = makeUser();
    createHousehold(a, 'Home');
    const { code } = createInvite(a, Date.now() - 8 * 864e5); // expired a day ago
    const unknown = joinHousehold(b, 'ZZZZZZZZ');
    const expired = joinHousehold(b, code);
    expect(unknown.ok).toBe(false);
    expect(expired).toEqual(unknown);
    expect(joinHousehold(b, '').ok).toBe(false);
  });

  it('will not let a member of one household join another', () => {
    const a = makeUser();
    const b = makeUser();
    createHousehold(a, 'A');
    createHousehold(b, 'B');
    const { code } = createInvite(a);
    expect(joinHousehold(b, code).ok).toBe(false);
  });

  it('needs a member to make a code, and lets any member revoke one', () => {
    expect(createInvite(makeUser()).ok).toBe(false);
    const a = makeUser();
    createHousehold(a, 'Home');
    const { code } = createInvite(a);
    expect(listInvites(a).map((i) => i.code)).toContain(code);
    revokeInvite(a, code);
    expect(listInvites(a)).toEqual([]);
  });
});

describe('joining with a different currency', () => {
  it('asks before changing it, and changes nothing until told to', () => {
    const a = makeUser('EUR');
    const b = makeUser('USD');
    createHousehold(a, 'Home');
    const { code } = createInvite(a);
    const r = joinHousehold(b, code);
    expect(r).toMatchObject({ ok: false, needsCurrency: { from: 'USD', to: 'EUR' } });
    expect(getHousehold(b)).toBeNull();
    expect(db.prepare('SELECT currency FROM users WHERE id = ?').get(b).currency).toBe('USD');
  });

  it('switches the currency on request, and leaves every transaction amount alone', () => {
    const a = makeUser('EUR');
    const b = makeUser('USD');
    const acc = makeAccount(b);
    const cat = makeCategory(b, acc, 'Food');
    spend(b, acc, cat, -42.5);
    createHousehold(a, 'Home');
    const { code } = createInvite(a);
    expect(joinHousehold(b, code, { switchCurrency: true }).ok).toBe(true);
    expect(db.prepare('SELECT currency FROM users WHERE id = ?').get(b).currency).toBe('EUR');
    expect(db.prepare('SELECT amount FROM transactions WHERE user_id = ?').get(b).amount).toBe(-42.5);
  });
});

describe('leaving', () => {
  it('stops everything the person shared, and clears their ticks', () => {
    const { a, b, accA, accB } = pair();
    const ca = makeCategory(a, accA, 'Groceries');
    const cb = makeCategory(b, accB, 'Groceries');
    setCategoryHousehold(a, accA, ca, true);
    setCategoryHousehold(b, accB, cb, true);
    spend(a, accA, ca, -10);
    spend(b, accB, cb, -20);
    expect(listTransactions(a, { accountId: HOUSEHOLD })).toHaveLength(2);

    expect(leaveHousehold(b).ok).toBe(true);
    expect(listTransactions(a, { accountId: HOUSEHOLD }).map((t) => t.member_id)).toEqual([a]);
    expect(db.prepare('SELECT household FROM categories WHERE id = ?').get(cb).household).toBe(0);
    expect(listTransactions(b, { accountId: HOUSEHOLD })).toEqual([]);
  });

  it('removes a household when its last member goes', () => {
    const u = makeUser();
    createHousehold(u, 'Solo');
    const id = getHousehold(u).id;
    leaveHousehold(u);
    expect(db.prepare('SELECT 1 FROM households WHERE id = ?').get(id)).toBeUndefined();
    expect(leaveHousehold(u).ok).toBe(false);
  });

  it('shares nothing with the next household until ticked again', () => {
    const { a, accA } = pair();
    const ca = makeCategory(a, accA, 'Rent');
    setCategoryHousehold(a, accA, ca, true);
    leaveHousehold(a);
    const x = makeUser();
    createHousehold(x, 'Other');
    const { code } = createInvite(x);
    joinHousehold(a, code);
    expect(db.prepare('SELECT household FROM categories WHERE id = ?').get(ca).household).toBe(0);
  });
});

describe('what a category tick shares', () => {
  it('only lets a member tick their own spending categories', () => {
    const { a, b, accA, accB } = pair();
    const mine = makeCategory(a, accA, 'Food');
    const income = makeCategory(a, accA, 'Pay', 'income');
    const theirs = makeCategory(b, accB, 'Food');
    expect(setCategoryHousehold(a, accA, mine, true).ok).toBe(true);
    expect(setCategoryHousehold(a, accA, income, true).ok).toBe(false);
    expect(setCategoryHousehold(a, accA, theirs, true).ok).toBe(false);
    expect(setCategoryHousehold(makeUser(), 1, mine, true).ok).toBe(false); // not in a household
  });

  it('shows others only the transactions in ticked categories — never the rest', () => {
    const { a, b, accA, accB } = pair();
    const shared = makeCategory(b, accB, 'Groceries');
    const secret = makeCategory(b, accB, 'Gifts');
    setCategoryHousehold(b, accB, shared, true);
    spend(b, accB, shared, -30, '2026-06-02', 'supermarket');
    spend(b, accB, secret, -99, '2026-06-03', 'surprise present');
    addTransaction(b, { date: '2026-06-04', description: 'no category', amount: -5, account_id: accB });

    const seen = listTransactions(a, { accountId: HOUSEHOLD });
    expect(seen.map((t) => t.description)).toEqual(['supermarket']);
    expect(seen[0].member_id).toBe(b);
    // and their own, un-ticked, are not in the household view either
    expect(listTransactions(b, { accountId: HOUSEHOLD }).map((t) => t.description)).toEqual(['supermarket']);
  });

  it('never shows a non-member anything, nor members of another household', () => {
    const { a, accA } = pair();
    const ca = makeCategory(a, accA, 'Food');
    setCategoryHousehold(a, accA, ca, true);
    spend(a, accA, ca, -10);
    const outsider = makeUser();
    expect(listTransactions(outsider, { accountId: HOUSEHOLD })).toEqual([]);
    const other = pair();
    expect(listTransactions(other.a, { accountId: HOUSEHOLD })).toEqual([]);
  });

  it('merges categories of the same name, in any case, and across a person’s accounts', () => {
    const { a, b, accA, accB } = pair();
    const accA2 = makeAccount(a, 'Second');
    const c1 = makeCategory(a, accA, 'Groceries');
    const c2 = makeCategory(a, accA2, 'groceries');
    const c3 = makeCategory(b, accB, 'GROCERIES');
    for (const [u, acc, c] of [[a, accA, c1], [a, accA2, c2], [b, accB, c3]]) setCategoryHousehold(u, acc, c, true);
    spend(a, accA, c1, -10);
    spend(a, accA2, c2, -20);
    spend(b, accB, c3, -30);

    const cats = listCategories(a, HOUSEHOLD);
    expect(cats).toHaveLength(1);
    expect(cats[0]).toMatchObject({ name: 'Groceries', kind: 'expense' });
    const txs = listTransactions(a, { accountId: HOUSEHOLD });
    expect(txs).toHaveLength(3);
    expect(new Set(txs.map((t) => t.category_id))).toEqual(new Set([cats[0].id]));
  });

  it('unticking takes a category out again', () => {
    const { a, accA } = pair();
    const ca = makeCategory(a, accA, 'Food');
    setCategoryHousehold(a, accA, ca, true);
    spend(a, accA, ca, -10);
    expect(listTransactions(a, { accountId: HOUSEHOLD })).toHaveLength(1);
    setCategoryHousehold(a, accA, ca, false);
    expect(listTransactions(a, { accountId: HOUSEHOLD })).toHaveLength(0);
  });
});

describe('the household view, through the ordinary queries', () => {
  function setup() {
    const { a, b, accA, accB } = pair();
    const fa = makeCategory(a, accA, 'Food');
    const fb = makeCategory(b, accB, 'Food');
    const ra = makeCategory(a, accA, 'Rent');
    for (const [u, acc, c] of [[a, accA, fa], [b, accB, fb], [a, accA, ra]]) setCategoryHousehold(u, acc, c, true);
    spend(a, accA, fa, -40, '2026-05-10');
    spend(b, accB, fb, -60, '2026-05-12');
    spend(a, accA, ra, -500, '2026-05-01');
    spend(b, accB, fb, -80, '2026-06-05');
    return { a, b };
  }

  it('totals the spending of everyone, by month and by category', () => {
    const { a } = setup();
    expect(listMonths(a, HOUSEHOLD)).toEqual(['2026-06', '2026-05']);
    const rows = monthlyCategoryTotals(a, '2026-05', '2026-06', HOUSEHOLD);
    const sum = (ym, name) => rows.filter((r) => r.ym === ym && r.name === name).reduce((s, r) => s + r.total, 0);
    expect(sum('2026-05', 'Food')).toBe(100);
    expect(sum('2026-05', 'Rent')).toBe(500);
    expect(sum('2026-06', 'Food')).toBe(80);
  });

  it('gives the period’s spending as the sum of what is shared', () => {
    const { a } = setup();
    const ins = periodInsights(a, '2026-05', '2026-05', HOUSEHOLD);
    expect(ins.spent).toBe(600);
  });

  it('says who paid how much', () => {
    const { a, b } = setup();
    const totals = householdMemberTotals(a, '2026-05', '2026-06');
    expect(totals.map((t) => [t.id, t.total])).toEqual([[a, 540], [b, 140]].sort((x, y) => y[1] - x[1]));
    expect(memberNames(a)).toEqual({ [a]: `hh-user-${a}`, [b]: `hh-user-${b}` });
  });

  it('is the same for each member', () => {
    const { a, b } = setup();
    expect(periodInsights(b, '2026-05', '2026-06', HOUSEHOLD).spent).toBe(periodInsights(a, '2026-05', '2026-06', HOUSEHOLD).spent);
  });

  it('filters by category and month like any list', () => {
    const { a } = setup();
    const food = listCategories(a, HOUSEHOLD).find((c) => c.name === 'Food');
    const txs = listTransactions(a, { accountId: HOUSEHOLD, categoryId: food.id, month: '2026-05' });
    expect(txs.map((t) => t.amount).sort((x, y) => x - y)).toEqual([-60, -40]);
  });
});
