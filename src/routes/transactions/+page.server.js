import { fail } from '@sveltejs/kit';
import { parseAmount } from '$lib/server/csv.js';
import {
  listCategories,
  listAccounts,
  listMonths,
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  bulkCategorise,
  bulkDelete,
  applyRules,
  categoriseByRules,
  createRule,
  listRules
} from '$lib/server/queries.js';

const num = (v) => {
  const n = parseAmount(String(v ?? ''));
  return n == null ? null : Math.abs(n);
};
const ids = (form) =>
  form.getAll('id').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;
  const q = url.searchParams;

  const filters = {
    month: q.get('month') || '',
    dateFrom: q.get('from') || '',
    dateTo: q.get('to') || '',
    category: q.get('category') || '',
    account: q.get('account') || '',
    search: q.get('q') || '',
    amountMin: q.get('min') || '',
    amountMax: q.get('max') || '',
    direction: q.get('dir') || ''
  };

  const transactions = listTransactions(userId, {
    month: filters.month || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    categoryId:
      filters.category === 'none' ? 'none' : filters.category ? Number(filters.category) : undefined,
    accountId: filters.account === 'none' ? 'none' : filters.account ? Number(filters.account) : undefined,
    search: filters.search || undefined,
    amountMin: filters.amountMin ? Number(filters.amountMin) : undefined,
    amountMax: filters.amountMax ? Number(filters.amountMax) : undefined,
    direction: filters.direction || undefined
  });

  const sum = transactions.reduce(
    (acc, t) => {
      if (t.amount >= 0) acc.incoming += t.amount;
      else acc.outgoing += -t.amount;
      return acc;
    },
    { incoming: 0, outgoing: 0 }
  );

  return {
    transactions,
    sum,
    categories: listCategories(userId),
    accounts: listAccounts(userId),
    months: listMonths(userId),
    filters,
    currency: locals.user.currency
  };
}

export const actions = {
  add: async ({ request, locals }) => {
    const f = await request.formData();
    const date = String(f.get('date') || '');
    const description = String(f.get('description') || '').trim();
    const amount = num(f.get('amount'));
    const direction = String(f.get('direction') || 'out');
    if (!date || amount == null) return fail(400, { error: 'Date and a valid amount are required.' });
    const signed = amount * (direction === 'in' ? 1 : -1);
    let categoryId = f.get('category_id') ? Number(f.get('category_id')) : null;
    if (!categoryId) categoryId = categoriseByRules(locals.user.id, description);
    // no account field shown (only one account) — file it under that one
    let accountId = f.get('account_id') ? Number(f.get('account_id')) : null;
    if (!accountId) accountId = listAccounts(locals.user.id)[0]?.id ?? null;
    addTransaction(locals.user.id, { date, description, amount: signed, category_id: categoryId, account_id: accountId });
    return { added: true };
  },

  categorise: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const categoryId = f.get('category_id') ? Number(f.get('category_id')) : null;
    if (!id) return fail(400);
    updateTransaction(locals.user.id, id, { category_id: categoryId });
    return { updated: true };
  },

  update: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const date = String(f.get('date') || '');
    const description = String(f.get('description') || '').trim();
    const magnitude = num(f.get('amount'));
    const direction = String(f.get('direction') || 'out');
    if (!id || !date || magnitude == null) return fail(400, { error: 'Invalid values.' });
    const accountId = f.get('account_id') !== null ? Number(f.get('account_id')) || null : undefined;
    updateTransaction(locals.user.id, id, {
      date,
      description,
      amount: magnitude * (direction === 'in' ? 1 : -1),
      ...(accountId !== undefined ? { account_id: accountId } : {})
    });
    return { updated: true };
  },

  delete: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id) deleteTransaction(locals.user.id, id);
    return { deleted: true };
  },

  bulkCategorise: async ({ request, locals }) => {
    const f = await request.formData();
    const selected = ids(f);
    const categoryId = f.get('category_id') ? Number(f.get('category_id')) : null;
    const n = bulkCategorise(locals.user.id, selected, categoryId);
    return { bulk: `Updated ${n} transaction${n === 1 ? '' : 's'}.` };
  },

  bulkDelete: async ({ request, locals }) => {
    const f = await request.formData();
    const n = bulkDelete(locals.user.id, ids(f));
    return { bulk: `Deleted ${n} transaction${n === 1 ? '' : 's'}.` };
  },

  saveRule: async ({ request, locals }) => {
    const f = await request.formData();
    const matchText = String(f.get('match_text') || '').trim();
    const categoryId = Number(f.get('category_id'));
    const priority = Number(f.get('priority')) || 0;
    if (!matchText || !categoryId)
      return fail(400, { error: 'A match phrase and category are required.' });
    if (!listCategories(locals.user.id).some((c) => c.id === categoryId))
      return fail(400, { error: 'Unknown category.' });
    const dupe = listRules(locals.user.id).some(
      (r) => r.match_text.toLowerCase() === matchText.toLowerCase() && r.category_id === categoryId
    );
    if (!dupe) createRule(locals.user.id, matchText, categoryId, priority);
    const applied = applyRules(locals.user.id, { onlyUncategorised: true });
    return { ruleSaved: matchText, applied };
  },

  applyRules: async ({ request, locals }) => {
    const f = await request.formData();
    const onlyUncategorised = f.get('scope') !== 'all';
    const n = applyRules(locals.user.id, { onlyUncategorised });
    return { bulk: `Rules categorised ${n} transaction${n === 1 ? '' : 's'}.` };
  }
};
