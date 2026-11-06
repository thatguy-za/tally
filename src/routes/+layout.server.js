import { getUserAiCategorise } from '$lib/server/queries.js';
import { aiStatus, aiEnabled } from '$lib/server/ai-settings.js';

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const user = locals.user;
  if (!user) return { user };
  const hideNumbers = !!locals.hideNumbers;
  // what the header needs of the household; the rest lives in Settings
  const household = locals.household
    ? { id: locals.household.id, name: locals.household.name, members: locals.household.members.length }
    : null;
  const view = locals.view ?? 'account';

  const aiAvailable = aiEnabled() && getUserAiCategorise(user.id);
  const accounts = locals.accounts;
  const accountId = locals.accountId;

  // the onboarding nudge is just "connect an AI key" for the admin who set
  // this instance up — everyone else, and an admin who's already configured
  // one or already dismissed this, sees nothing
  const ai = aiStatus();
  if (user.onboarded_at || !user.is_admin || ai.configured) return { user, aiAvailable, accounts, accountId, hideNumbers, household, view };

  return { user, aiAvailable, accounts, accountId, hideNumbers, household, view, onboarding: { ai } };
}
