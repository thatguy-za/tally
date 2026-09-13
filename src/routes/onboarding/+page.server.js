import { fail, redirect } from '@sveltejs/kit';
import { finishOnboarding } from '$lib/server/auth.js';
import { setSetting } from '$lib/server/ai-settings.js';

// Not a page anyone navigates to directly — the wizard is an overlay mounted
// in the root layout. This route exists only to host its form actions.
export function load() {
  throw redirect(303, '/dashboard');
}

export const actions = {
  apiKey: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    const key = String(f.get('api_key') || '').trim();
    if (key && !/^sk-ant-/.test(key))
      return fail(400, { error: 'That does not look like an Anthropic API key (starts with sk-ant-).' });
    setSetting('anthropic_api_key', key || null);
    return { ok: true, configured: !!key };
  },

  finish: async ({ locals }) => {
    finishOnboarding(locals.user.id);
    return { ok: true };
  }
};
