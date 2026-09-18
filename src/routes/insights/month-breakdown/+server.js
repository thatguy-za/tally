import { json, error } from '@sveltejs/kit';
import { monthlyCategoryTotals } from '$lib/server/queries.js';

const YM = /^\d{4}-\d{2}$/;

/**
 * Backs the "click a month" popup: every individual spending category with a
 * transaction that month, unfolded — unlike the chart's own series, which
 * caps at the top few categories and lumps the rest into "Other".
 */
export function GET({ url, locals }) {
  if (!locals.user) throw error(401);

  const month = url.searchParams.get('month') || '';
  if (!YM.test(month)) throw error(400, 'Invalid month.');

  const accountParam = url.searchParams.get('account') || '';
  const accountId = accountParam === 'none' ? 'none' : accountParam || null;

  const rows = monthlyCategoryTotals(locals.user.id, month, month, accountId);
  const segments = rows
    .filter((r) => r.kind === 'expense' || r.kind === 'saving')
    .map((r) => ({ id: r.id, name: r.name, color: r.color, value: r.total }))
    .sort((a, b) => b.value - a.value);

  return json({ segments });
}
