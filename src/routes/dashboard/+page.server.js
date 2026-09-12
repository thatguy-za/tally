import { currentMonth } from '$lib/currency.js';
import {
  monthlyTotals,
  listMonths,
  listTransactions,
  categoryBreakdown,
  uncategorisedCount,
  budgetStatus,
  categorySparkData,
  savingsSummary
} from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;

  const months = listMonths(userId);
  // default to the most recent month that actually has transactions
  const month = url.searchParams.get('month') || months[0] || currentMonth();

  const forMonth = monthlyTotals(userId, 120).find((t) => t.ym === month) || { incoming: 0, outgoing: 0, saved: 0 };

  const budgetRows = budgetStatus(userId, month).filter(
    (b) => b.kind === 'expense' && b.target != null
  );
  const { byCategory: spark } = categorySparkData(userId, 6);

  return {
    month,
    months,
    monthTotals: {
      incoming: forMonth.incoming || 0,
      outgoing: forMonth.outgoing || 0,
      saved: forMonth.saved || 0
    },
    savings: savingsSummary(userId, 12),
    recent: listTransactions(userId, { month }).slice(0, 8),
    uncategorised: uncategorisedCount(userId),
    // savings aren't spending, so they stay out of "where it went"
    breakdown: categoryBreakdown(userId, month).filter((b) => b.total < 0 && b.kind !== 'saving' && b.kind !== 'transfer'),
    spark,
    budgets: {
      target: budgetRows.reduce((s, b) => s + b.target, 0),
      actual: budgetRows.reduce((s, b) => s + b.actual, 0),
      over: budgetRows.filter((b) => b.remaining < 0).length,
      count: budgetRows.length
    },
    currency: locals.user.currency
  };
}
