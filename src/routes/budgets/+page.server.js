import { fail } from '@sveltejs/kit';
import { currentMonth } from '$lib/currency.js';
import { parseAmount } from '$lib/server/csv.js';
import {
  budgetStatus,
  setBudget,
  deleteBudget,
  listMonths,
  categoryMonthlyAverages
} from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const month = url.searchParams.get('month') || currentMonth();
  const rows = budgetStatus(locals.user.id, month);
  return {
    month,
    months: listMonths(locals.user.id),
    expenses: rows.filter((r) => r.kind === 'expense'),
    income: rows.filter((r) => r.kind === 'income'),
    currency: locals.user.currency
  };
}

export const actions = {
  set: async ({ request, locals }) => {
    const f = await request.formData();
    const categoryId = Number(f.get('category_id'));
    const raw = String(f.get('amount') || '').trim();
    if (!categoryId) return fail(400);
    if (raw === '') {
      deleteBudget(locals.user.id, categoryId);
      return { saved: true };
    }
    const amount = parseAmount(raw);
    if (amount == null || amount < 0) return fail(400, { error: 'Enter a positive amount.' });
    setBudget(locals.user.id, categoryId, Math.abs(amount));
    return { saved: true };
  },

  generateTargets: async ({ locals }) => {
    const averages = categoryMonthlyAverages(locals.user.id).filter((a) => a.average > 0);
    for (const a of averages) {
      setBudget(locals.user.id, a.id, a.average);
    }
    return { generated: averages.length };
  }
};
