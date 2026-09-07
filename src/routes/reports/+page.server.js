import { currentMonth } from '$lib/currency.js';
import { aiEnabled } from '$lib/server/ai-settings.js';
import {
  categoryBreakdown,
  listMonths,
  monthlyTotals,
  monthInsights,
  getUserAiCategorise
} from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;
  const months = listMonths(userId);
  // default to the most recent month that actually has data, not a blank
  // calendar month the user hasn't imported yet
  const scope = url.searchParams.get('month') || months[0] || currentMonth();
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
    // the month read + movers only mean something for a single month
    insights: all ? null : monthInsights(userId, scope),
    aiSummary: !all && aiEnabled() && getUserAiCategorise(userId),
    currency: locals.user.currency
  };
}
