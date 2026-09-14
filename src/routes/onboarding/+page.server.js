import { fail, redirect } from '@sveltejs/kit';
import { finishOnboarding } from '$lib/server/auth.js';
import { aiEnabled, setSetting, AI_PROVIDERS, looksLikeApiKey } from '$lib/server/ai-settings.js';
import { testConnection } from '$lib/server/ai.js';

// Not a page anyone navigates to directly — the wizard is an overlay mounted
// in the root layout. This route exists only to host its form actions.
export function load() {
  throw redirect(303, '/dashboard');
}

export const actions = {
  apiKey: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    const provider = String(f.get('provider') || '');
    if (!AI_PROVIDERS.some((p) => p.id === provider)) return fail(400, { error: 'Unknown provider.' });
    const key = String(f.get('api_key') || '').trim();
    const model = String(f.get('model') || '');
    const providerLabel = AI_PROVIDERS.find((p) => p.id === provider)?.label || provider;
    if (key && !looksLikeApiKey(provider, key))
      return fail(400, { error: `That does not look like an API key for ${providerLabel}.` });
    setSetting('ai_provider', provider);
    setSetting(`${provider}_api_key`, key || null);
    if (model) setSetting(`${provider}_model`, model);
    return { ok: true, configured: !!key };
  },

  test: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    // test whatever is currently typed, even if it hasn't been saved yet —
    // falls back to the configured key/model when the field is left blank
    const provider = String(f.get('provider') || '');
    const apiKey = String(f.get('api_key') || '').trim();
    const model = String(f.get('model') || '');
    if (!apiKey && !aiEnabled()) return fail(400, { error: 'Add an API key first.' });
    try {
      const r = await testConnection({ provider, apiKey, model });
      return { ok: true, msg: `Connected — ${r.model} replied “${r.reply || '…'}”.` };
    } catch (e) {
      return fail(400, { error: `Test failed: ${e?.message || 'unknown error'}` });
    }
  },

  finish: async ({ locals }) => {
    finishOnboarding(locals.user.id);
    return { ok: true };
  }
};
