import { json, error } from '@sveltejs/kit';
import { savingsSummary } from '$lib/server/queries.js';

const YM = /^\d{4}-\d{2}$/;

/** Backs the "click the Saved tile" popup: monthly savings contributions for a period. */
export function GET({ url, locals }) {
  if (!locals.user) throw error(401);

  let from = url.searchParams.get('from') || '';
  let to = url.searchParams.get('to') || '';
  if (!YM.test(from) || !YM.test(to)) throw error(400, 'Invalid period.');
  if (from > to) [from, to] = [to, from];

  const s = savingsSummary(locals.user.id, { from, to }, locals.accountId);
  return json({ series: s.series, total: s.total });
}
