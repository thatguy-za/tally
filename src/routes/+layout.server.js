import { getUserAiCategorise } from '$lib/server/queries.js';
import { aiStatus, aiEnabled } from '$lib/server/ai-settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const user = locals.user;
  if (!user) return { user };

  const aiAvailable = aiEnabled() && getUserAiCategorise(user.id);
  const accounts = locals.accounts;
  const accountId = locals.accountId;

  // the onboarding nudge is just "connect an AI key" for the admin who set
  // this instance up — everyone else, and an admin who's already configured
  // one or already dismissed this, sees nothing
  const ai = aiStatus();
  if (user.onboarded_at || !user.is_admin || ai.configured) return { user, aiAvailable, accounts, accountId };

  return { user, aiAvailable, accounts, accountId, onboarding: { ai } };
}
