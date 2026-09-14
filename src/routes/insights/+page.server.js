import { aiEnabled } from '$lib/server/ai-settings.js';
import {
  listMonths,
  listAccounts,
  monthRange,
  periodInsights,
  monthlyCategoryTotals,
  savingsSummary,
  getUserAiCategorise
} from '$lib/server/queries.js';

const isRealAccount = (id, accounts) => accounts.some((a) => String(a.id) === id);

const YM = /^\d{4}-\d{2}$/;
const MAX_SERIES = 7; // beyond this, categories fold into "Other"

/** `n` months before `ym`, as YYYY-MM. */
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Rank a kind's categories by their total over the period, keep the biggest
 * and fold the rest into one "Other" slot. Order is fixed for the whole
 * period, so a category keeps its place in the stack month to month.
 */
function seriesFor(rows, kind) {
  const totals = new Map();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const e = totals.get(r.id) || { id: r.id, name: r.name, color: r.color, total: 0 };
    e.total += r.total;
    totals.set(r.id, e);
  }
  const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
  const kept = ranked.slice(0, MAX_SERIES);
  const folded = ranked.slice(MAX_SERIES);
  if (folded.length) kept.push({ id: 'other', name: `Other (${folded.length})`, color: null, total: 0 });
  const slot = new Map(ranked.map((c, i) => [c.id, i < MAX_SERIES ? c.id : 'other']));
  return { series: kept.map(({ id, name, color }) => ({ id, name, color })), slot };
}

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  const userId = locals.user.id;
  const months = listMonths(userId); // newest first
  const accounts = listAccounts(userId);
  const latest = months[0] || shiftMonth(new Date().toISOString().slice(0, 7), 0);
  const earliest = months[months.length - 1] || latest;

  // default: the last twelve months, clipped to where the data actually starts
  const defTo = latest;
  const defFrom = [earliest, shiftMonth(latest, -11)].sort()[1];

  let from = url.searchParams.get('from') || defFrom;
  let to = url.searchParams.get('to') || defTo;
  if (!YM.test(from)) from = defFrom;
  if (!YM.test(to)) to = defTo;
  if (from > to) [from, to] = [to, from];

  const rawAccount = url.searchParams.get('account') || '';
  const accountId = rawAccount === 'none' || isRealAccount(rawAccount, accounts) ? rawAccount : null;

  const rows = monthlyCategoryTotals(userId, from, to, accountId);
  const income = seriesFor(rows, 'income');
  const expense = seriesFor(rows, 'expense');
  const values = {};
  for (const ym of monthRange(from, to)) values[ym] = { income: {}, expense: {} };
  for (const r of rows) {
    const bucket = values[r.ym][r.kind];
    const key = (r.kind === 'income' ? income : expense).slot.get(r.id);
    bucket[key] = (bucket[key] || 0) + r.total;
  }

  return {
    from,
    to,
    months,
    accounts,
    accountId,
    insights: periodInsights(userId, from, to, accountId),
    chart: {
      months: monthRange(from, to),
      income: income.series,
      expense: expense.series,
      values
    },
    savings: savingsSummary(userId, { from, to }, accountId),
    aiSummary: aiEnabled() && getUserAiCategorise(userId),
    currency: locals.user.currency
  };
}
