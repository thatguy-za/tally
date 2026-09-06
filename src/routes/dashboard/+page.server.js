import { currentMonth } from '$lib/currency.js';
import {
  monthlyTotals,
  listMonths,
  listTransactions,
  categoryBreakdown,
  uncategorisedCount,
  dueRecurring,
  runAutoPost,
  budgetStatus,
  categorySparkData
} from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;

  // Auto-post any due recurring entries flagged for it (cheap; only runs when something is due).
  runAutoPost(userId);

  const months = listMonths(userId);
  // default to the most recent month that actually has transactions
  const month = url.searchParams.get('month') || months[0] || currentMonth();

  const totals = monthlyTotals(userId, 12);
  const forMonth = totals.find((t) => t.ym === month) || { incoming: 0, outgoing: 0 };

  const budgetRows = budgetStatus(userId, month).filter(
    (b) => b.kind === 'expense' && b.target != null
  );
  const { byCategory: spark } = categorySparkData(userId, 6);

  return {
    month,
    months,
    totals,
    monthTotals: { incoming: forMonth.incoming || 0, outgoing: forMonth.outgoing || 0 },
    recent: listTransactions(userId, { month }).slice(0, 8),
    uncategorised: uncategorisedCount(userId),
    due: dueRecurring(userId),
    breakdown: categoryBreakdown(userId, month).filter((b) => b.total < 0),
    spark,
    budgetRows: budgetRows
      .slice()
      .sort((a, b) => b.actual - a.actual)
      .map((b) => ({ id: b.id, name: b.name, color: b.color, pct: b.pct, target: b.target, actual: b.actual })),
    budgets: {
      target: budgetRows.reduce((s, b) => s + b.target, 0),
      actual: budgetRows.reduce((s, b) => s + b.actual, 0),
      over: budgetRows.filter((b) => b.remaining < 0).length,
      count: budgetRows.length
    },
    currency: locals.user.currency
  };
}
