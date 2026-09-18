import { json, error } from '@sveltejs/kit';
import { listTransactions } from '$lib/server/queries.js';

const YM = /^\d{4}-\d{2}$/;

/** Backs the "click a chart segment" popup: every transaction in one category, for one month. */
export function GET({ url, locals }) {
  if (!locals.user) throw error(401);

  const month = url.searchParams.get('month') || '';
  if (!YM.test(month)) throw error(400, 'Invalid month.');

  const categoryParam = url.searchParams.get('category') || '';

  if (categoryParam === 'other') {
    const kind = url.searchParams.get('kind') || 'expense';
    const categoryKinds = kind === 'expense' ? ['expense', 'saving'] : [kind];
    const excludeCategoryIds = (url.searchParams.get('exclude') || '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    const transactions = listTransactions(locals.user.id, {
      month,
      categoryId: 'other',
      categoryKinds,
      excludeCategoryIds
    });
    return json({ transactions });
  }

  const categoryId = categoryParam === 'none' ? 'none' : Number(categoryParam);
  if (categoryParam !== 'none' && (!Number.isInteger(categoryId) || categoryId <= 0))
    throw error(400, 'Invalid category.');

  const transactions = listTransactions(locals.user.id, { month, categoryId });
  return json({ transactions });
}
