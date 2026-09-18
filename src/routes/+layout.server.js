import { listAccounts, listCategories, getUserAiCategorise } from '$lib/server/queries.js';
import { aiStatus, aiEnabled } from '$lib/server/ai-settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const user = locals.user;
  if (!user) return { user };

  const aiAvailable = aiEnabled() && getUserAiCategorise(user.id);
  if (user.onboarded_at) return { user, aiAvailable };

  return {
    user,
    aiAvailable,
    onboarding: {
      isAdmin: !!user.is_admin,
      ai: aiStatus(),
      accounts: listAccounts(user.id),
      categories: listCategories(user.id)
    }
  };
}
