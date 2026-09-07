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
  const expenses = rows.filter((r) => r.kind === 'expense');
  const withTarget = expenses.filter((e) => e.target != null);
  return {
    month,
    months: listMonths(locals.user.id),
    expenses,
    savings: rows.filter((r) => r.kind === 'saving'),
    income: rows.filter((r) => r.kind === 'income'),
    totals: {
      count: withTarget.length,
      target: withTarget.reduce((s, e) => s + e.target, 0),
      actual: withTarget.reduce((s, e) => s + e.actual, 0)
    },
    currency: locals.user.currency
  };
}

export const actions = {
  save: async ({ request, locals }) => {
    const f = await request.formData();
    for (const [key, val] of f.entries()) {
      const m = key.match(/^amount_(\d+)$/);
      if (!m) continue;
      const categoryId = Number(m[1]);
      const raw = String(val || '').trim();
      if (raw === '') {
        deleteBudget(locals.user.id, categoryId);
        continue;
      }
      const amount = parseAmount(raw);
      if (amount == null || amount < 0)
        return fail(400, { error: 'Enter a positive amount for every target.' });
      setBudget(locals.user.id, categoryId, Math.abs(amount));
    }
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
