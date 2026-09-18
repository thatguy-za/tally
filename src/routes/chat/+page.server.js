import { redirect } from '@sveltejs/kit';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { getUserAiCategorise } from '$lib/server/queries.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (!aiEnabled() || !getUserAiCategorise(locals.user.id)) throw redirect(303, '/insights');
  return { currency: locals.user.currency };
}
