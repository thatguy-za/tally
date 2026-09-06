import { fail } from '@sveltejs/kit';
import { parseAmount } from '$lib/server/csv.js';
import {
  listCategories,
  listMonths,
  listTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  bulkCategorise,
  bulkDelete,
  applyRules,
  categoriseByRules,
  uncategorisedIds,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { categoriseWithAI } from '$lib/server/ai.js';

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
    months: listMonths(userId),
    filters,
    currency: locals.user.currency,
    aiCategorise: aiEnabled() && getUserAiCategorise(userId)
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
    addTransaction(locals.user.id, { date, description, amount: signed, category_id: categoryId });
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
    updateTransaction(locals.user.id, id, {
      date,
      description,
      amount: magnitude * (direction === 'in' ? 1 : -1)
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

  applyRules: async ({ request, locals }) => {
    const f = await request.formData();
    const onlyUncategorised = f.get('scope') !== 'all';
    const n = applyRules(locals.user.id, { onlyUncategorised });
    return { bulk: `Rules categorised ${n} transaction${n === 1 ? '' : 's'}.` };
  },

  aiCategorise: async ({ request, locals }) => {
    if (!aiEnabled() || !getUserAiCategorise(locals.user.id))
      return fail(403, { error: 'AI categorisation is not enabled for your account.' });
    const f = await request.formData();
    const selected = ids(f);
    const target = selected.length ? selected : uncategorisedIds(locals.user.id);
    if (!target.length) return { bulk: 'Nothing to categorise — everything already has a category.' };
    try {
      const r = await categoriseWithAI(locals.user.id, target);
      const cost = r.costUsd >= 0.01 ? `~$${r.costUsd.toFixed(2)}` : '<$0.01';
      return {
        bulk: `AI categorised ${r.categorised} of ${r.considered} · ${cost}`,
        aiDone: true
      };
    } catch (e) {
      return fail(400, { error: `AI categorisation failed: ${e?.message || 'unknown error'}` });
    }
  }
};
