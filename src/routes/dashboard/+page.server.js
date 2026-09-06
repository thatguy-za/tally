import { currentMonth } from '$lib/currency.js';
import {
  monthlyTotals,
  listMonths,
  listTransactions,
  categoryBreakdown,
  uncategorisedCount,
  dueRecurring,
  runAutoPost,
  budgetStatus
} from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;

  // Auto-post any due recurring entries flagged for it (cheap; only runs when something is due).
  runAutoPost(userId);

  const month = url.searchParams.get('month') || currentMonth();

  const totals = monthlyTotals(userId, 12);
  const forMonth = totals.find((t) => t.ym === month) || { incoming: 0, outgoing: 0 };

  const budgets = budgetStatus(userId, month).filter((b) => b.kind === 'expense' && b.target != null);

  return {
    month,
    months: listMonths(userId),
    totals,
    monthTotals: { incoming: forMonth.incoming || 0, outgoing: forMonth.outgoing || 0 },
    recent: listTransactions(userId, { month }).slice(0, 8),
    uncategorised: uncategorisedCount(userId),
    due: dueRecurring(userId),
    breakdown: categoryBreakdown(userId, month).filter((b) => b.total < 0),
    budgets: {
      target: budgets.reduce((s, b) => s + b.target, 0),
      actual: budgets.reduce((s, b) => s + b.actual, 0),
      over: budgets.filter((b) => b.remaining < 0).length,
      count: budgets.length
    },
    currency: locals.user.currency
  };
}
