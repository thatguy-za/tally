import { listAccounts, listCategories, getUserAiCategorise } from '$lib/server/queries.js';
import { aiStatus, aiEnabled } from '$lib/server/ai-settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const user = locals.user;
  if (!user) return { user };

  const aiAvailable = aiEnabled() && getUserAiCategorise(user.id);
  const accounts = locals.accounts;
  const accountId = locals.accountId;
  if (user.onboarded_at) return { user, aiAvailable, accounts, accountId };

  return {
    user,
    aiAvailable,
    accounts,
    accountId,
    onboarding: {
      isAdmin: !!user.is_admin,
      ai: aiStatus(),
      accounts: listAccounts(user.id),
      categories: listCategories(user.id, accountId)
    }
  };
}
