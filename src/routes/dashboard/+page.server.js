import { currentMonth } from '$lib/currency.js';
import {
  monthlyTotals,
  listMonths,
  listAccounts,
  listTransactions,
  categoryBreakdown,
  uncategorisedCount,
  budgetStatus,
  categorySparkData,
  savingsSummary,
  NON_SPENDING_KINDS,
  getLogoDomains
} from '$lib/server/queries.js';

const isRealAccount = (id, accounts) => accounts.some((a) => String(a.id) === id);

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;

  const months = listMonths(userId);
  const accounts = listAccounts(userId);
  // default to the most recent month that actually has transactions
  const month = url.searchParams.get('month') || months[0] || currentMonth();
  const rawAccount = url.searchParams.get('account') || '';
  const accountId = rawAccount === 'none' || isRealAccount(rawAccount, accounts) ? rawAccount : null;

  const forMonth = monthlyTotals(userId, 120, accountId).find((t) => t.ym === month) || {
    incoming: 0,
    outgoing: 0,
    saved: 0
  };

  const budgetRows = budgetStatus(userId, month, accountId).filter(
    (b) => b.kind === 'expense' && b.target != null
  );
  const { byCategory: spark } = categorySparkData(userId, 6, accountId);

  const recent = listTransactions(userId, { month, accountId }).slice(0, 8);
  const logoDomains = getLogoDomains(recent.map((t) => t.description));
  for (const t of recent) t.logo_domain = logoDomains.get(t.description) ?? null;

  return {
    month,
    months,
    accounts,
    accountId,
    monthTotals: {
      incoming: forMonth.incoming || 0,
      outgoing: forMonth.outgoing || 0,
      saved: forMonth.saved || 0
    },
    savings: savingsSummary(userId, 12, accountId),
    recent,
    uncategorised: uncategorisedCount(userId, accountId),
    // savings, transfers and opening balances aren't spending, so they stay
    // out of "where it went"
    breakdown: categoryBreakdown(userId, month, accountId)
      .filter((b) => b.total < 0 && !NON_SPENDING_KINDS.includes(b.kind)),
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
