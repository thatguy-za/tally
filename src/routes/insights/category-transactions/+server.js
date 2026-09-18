import { json, error } from '@sveltejs/kit';
import { listTransactions } from '$lib/server/queries.js';

const YM = /^\d{4}-\d{2}$/;

/** Backs the "click a chart segment" popup: every transaction in one category, for one month. */
export function GET({ url, locals }) {
  if (!locals.user) throw error(401);

  const month = url.searchParams.get('month') || '';
  if (!YM.test(month)) throw error(400, 'Invalid month.');

  const categoryParam = url.searchParams.get('category') || '';
  const categoryId = categoryParam === 'none' ? 'none' : Number(categoryParam);
  if (categoryParam !== 'none' && (!Number.isInteger(categoryId) || categoryId <= 0))
    throw error(400, 'Invalid category.');

  const transactions = listTransactions(locals.user.id, { month, categoryId });
  return json({ transactions });
}
