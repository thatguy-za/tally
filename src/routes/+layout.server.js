import { listAccounts, listCategories } from '$lib/server/queries.js';
import { aiStatus } from '$lib/server/ai-settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const user = locals.user;
  if (!user || user.onboarded_at) return { user };

  return {
    user,
    onboarding: {
      isAdmin: !!user.is_admin,
      ai: aiStatus(),
      accounts: listAccounts(user.id),
      categories: listCategories(user.id)
    }
  };
}
