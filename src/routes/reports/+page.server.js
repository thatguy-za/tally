import { currentMonth } from '$lib/currency.js';
import { categoryBreakdown, listMonths, monthlyTotals } from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;
  const months = listMonths(userId);
  const scope = url.searchParams.get('month') || currentMonth();
  const all = scope === 'all';

  const breakdown = categoryBreakdown(userId, all ? null : scope);
  const expense = breakdown
    .filter((b) => b.total < 0)
    .map((b) => ({ ...b, total: Math.abs(b.total) }))
    .sort((a, b) => b.total - a.total);
  const income = breakdown
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    scope,
    months,
    expense,
    income,
    expenseTotal: expense.reduce((s, b) => s + b.total, 0),
    incomeTotal: income.reduce((s, b) => s + b.total, 0),
    trend: monthlyTotals(userId, 12),
    currency: locals.user.currency
  };
}
