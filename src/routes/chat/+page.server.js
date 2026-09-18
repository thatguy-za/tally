import { redirect } from '@sveltejs/kit';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { getUserAiCategorise, periodInsights } from '$lib/server/queries.js';
import { currentMonth } from '$lib/currency.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (!aiEnabled() || !getUserAiCategorise(locals.user.id)) throw redirect(303, '/insights');

  // a real figure from this month, so the empty state opens with something
  // this person's own data actually says, not a generic "ask me anything"
  const month = currentMonth();
  const ins = periodInsights(locals.user.id, month, month);
  return {
    currency: locals.user.currency,
    spentSoFar: ins.reason === 'empty' ? null : ins.spent
  };
}
