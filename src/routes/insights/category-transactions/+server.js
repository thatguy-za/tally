import { json, error } from '@sveltejs/kit';
import { listTransactions, getLogoDomains } from '$lib/server/queries.js';

// matches the transactions page's own load (+page.server.js) — without this
// the same merchant shows a logo there and a plain dot here
function withLogos(transactions) {
  const logoDomains = getLogoDomains(transactions.map((t) => t.description));
  for (const t of transactions) t.logo_domain = logoDomains.get(t.description) ?? null;
  return transactions;
}

const YM = /^\d{4}-\d{2}$/;

/**
 * Backs the "click a chart segment" popup: every transaction in one category,
 * over one month (`month`) or a run of them (`from`/`to`, as the period flow
 * chart needs). `-31` is a safe upper bound because dates are ISO strings and
 * compared lexically, so it catches every day of the closing month.
 */
function period(url) {
  const month = url.searchParams.get('month') || '';
  if (YM.test(month)) return { month };
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!YM.test(from) || !YM.test(to) || from > to) throw error(400, 'Invalid period.');
  return { dateFrom: `${from}-01`, dateTo: `${to}-31` };
}

export function GET({ url, locals }) {
  if (!locals.user) throw error(401);

  const span = period(url);
  const categoryParam = url.searchParams.get('category') || '';

  if (categoryParam === 'other') {
    const kind = url.searchParams.get('kind') || 'expense';
    const categoryKinds = kind === 'expense' ? ['expense', 'saving'] : [kind];
    // -1 is the sentinel for the "Uncategorised" bucket — kept alongside real
    // category ids so it can also be excluded when shown on its own
    const excludeCategoryIds = (url.searchParams.get('exclude') || '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n !== 0);
    const transactions = listTransactions(locals.user.id, {
      ...span,
      categoryId: 'other',
      categoryKinds,
      excludeCategoryIds,
      kind,
      accountId: locals.accountId
    });
    return json({ transactions: withLogos(transactions) });
  }

  const categoryId = categoryParam === 'none' ? 'none' : Number(categoryParam);
  // -1 is the chart's own "Uncategorised" bucket (see monthlyCategoryTotals),
  // shown as its own segment rather than folded into Other
  if (categoryParam !== 'none' && (!Number.isInteger(categoryId) || (categoryId <= 0 && categoryId !== -1)))
    throw error(400, 'Invalid category.');

  const kind = categoryId === -1 ? url.searchParams.get('kind') || 'expense' : undefined;
  const transactions = listTransactions(locals.user.id, { ...span, categoryId, kind, accountId: locals.accountId });
  return json({ transactions: withLogos(transactions) });
}
