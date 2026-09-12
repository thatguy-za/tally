import { currentMonth } from '$lib/currency.js';
import {
  monthlyTotals,
  listMonths,
  listTransactions,
  uncategorisedCount,
  budgetStatus,
  savingsSummary
} from '$lib/server/queries.js';

/**
 * The dashboard is about the latest month only — trends live on Reports.
 * @type {import('./$types').PageServerLoad}
 */
export function load({ locals, url }) {
  const userId = locals.user.id;

  const months = listMonths(userId);
  // default to the most recent month that actually has transactions
  const month = url.searchParams.get('month') || months[0] || currentMonth();

  const forMonth = monthlyTotals(userId, 120).find((t) => t.ym === month) || {
    incoming: 0,
    outgoing: 0,
    saved: 0
  };

  // one list for "where it went": every spending category that saw money this
  // month or has a target, biggest first, each carrying its target if it has one
  const spending = budgetStatus(userId, month)
    .filter((b) => b.kind === 'expense' && (b.actual > 0 || b.target != null))
    .sort((a, b) => b.actual - a.actual)
    .map(({ id, name, color, actual, target, remaining, pct }) => ({ id, name, color, actual, target, remaining, pct }));
  const budgeted = spending.filter((b) => b.target != null);

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
    spending: spending.slice(0, 8),
    budgets: {
      target: budgeted.reduce((s, b) => s + b.target, 0),
      actual: budgeted.reduce((s, b) => s + b.actual, 0),
      over: budgeted.filter((b) => b.remaining < 0).length,
      count: budgeted.length
    },
    currency: locals.user.currency
  };
}
