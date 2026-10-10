import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { hashPassword } from '$lib/server/auth.js';
import {
  aiStatus,
  aiEnabled,
  setSetting,
  getApiKey,
  modelsFor,
  addCustomModel,
  removeCustomModel,
  AI_PROVIDERS,
  providerStatus,
  looksLikeApiKey
} from '$lib/server/ai-settings.js';
import { testConnection, listProviderModels } from '$lib/server/ai.js';
import { diffModels } from '$lib/models.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (!locals.user.is_admin) throw redirect(303, '/settings');
  return {
    myId: locals.user.id,
    users: db
      .prepare(
        `SELECT u.id, u.username, u.is_admin, u.currency, u.created_at, u.ai_off,
                (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id) AS tx_count
         FROM users u ORDER BY u.id`
      )
      .all(),
    ai: aiStatus(),
    aiByProvider: Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, providerStatus(p.id)]))
  };
}

function requireAdmin(locals) {
  if (!locals.user.is_admin) throw redirect(303, '/settings');
}

export const actions = {
  resetUserPassword: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const id = Number(f.get('id'));
    const next = String(f.get('new_password') || '');
    if (next.length < 8)
      return fail(400, { section: 'user', error: 'Password must be at least 8 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return { section: 'user', ok: true, msg: 'Password reset. Their sessions were ended.' };
  },

  setAdmin: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const id = Number(f.get('id'));
    const makeAdmin = f.get('admin') === '1' ? 1 : 0;
    if (id === locals.user.id && !makeAdmin) {
      const others = db
        .prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id != ?')
        .get(id).n;
      if (!Number(others)) return fail(400, { section: 'user', error: 'You are the only admin.' });
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(makeAdmin, id);
    return { section: 'user', ok: true };
  },

  deleteUser: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id === locals.user.id) return fail(400, { section: 'user', error: "You can't delete yourself." });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { section: 'user', ok: true, msg: 'User and all their data deleted.' };
  },

  aiKey: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const provider = String(f.get('provider') || '');
    if (!AI_PROVIDERS.some((p) => p.id === provider)) return fail(400, { section: 'ai', error: 'Unknown provider.' });
    const key = String(f.get('api_key') || '').trim();
    const model = String(f.get('model') || '');
    const providerLabel = AI_PROVIDERS.find((p) => p.id === provider)?.label || provider;
    if (key && !looksLikeApiKey(provider, key))
      return fail(400, { section: 'ai', error: `That does not look like an API key for ${providerLabel}.` });
    setSetting('ai_provider', provider);
    setSetting(`${provider}_api_key`, key || null);
    if (model) setSetting(`${provider}_model`, model);
    return {
      section: 'ai',
      ok: true,
      msg: key ? 'API key saved.' : 'API key removed — AI features disabled.'
    };
  },

  // Asks the chosen provider (with its saved key) which models it offers and
  // reports what this app doesn't list yet — and what it lists that the
  // provider no longer does. Reads only; nothing is changed until an admin
  // chooses to add a model.
  aiModels: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const provider = String(f.get('provider') || '');
    if (!AI_PROVIDERS.some((p) => p.id === provider)) return fail(400, { section: 'ai', error: 'Unknown provider.' });
    if (!getApiKey(provider)) return fail(400, { section: 'ai', error: 'Save an API key for this provider first.' });
    try {
      const remote = await listProviderModels(provider);
      const { fresh, missing } = diffModels(provider, remote, modelsFor(provider));
      return {
        section: 'models',
        ok: true,
        provider,
        fresh: fresh.slice(0, 15),
        freshTotal: fresh.length,
        missing,
        msg: fresh.length
          ? `Found ${fresh.length} model${fresh.length === 1 ? '' : 's'} not in your list.`
          : 'No new models — your list is up to date.'
      };
    } catch (e) {
      return fail(400, { section: 'ai', error: `Couldn't check models: ${e?.message || 'unknown error'}` });
    }
  },

  aiAddModel: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const provider = String(f.get('provider') || '');
    const id = String(f.get('id') || '');
    const label = String(f.get('label') || '');
    const r = addCustomModel(provider, id, label);
    if (!r.ok) return fail(400, { section: 'ai', error: r.error });
    return { section: 'ai', ok: true, msg: `Added ${label || id} — choose it in the Model list, then save.` };
  },

  aiRemoveModel: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    removeCustomModel(String(f.get('provider') || ''), String(f.get('id') || ''));
    return { section: 'ai', ok: true, msg: 'Model removed.' };
  },

  aiTest: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const provider = String(f.get('provider') || '');
    if (!aiEnabled()) return fail(400, { section: 'ai', error: 'Add an API key first.' });
    try {
      const r = await testConnection({ provider });
      return { section: 'ai', ok: true, msg: `Connected — ${r.model} replied “${r.reply || '…'}”.` };
    } catch (e) {
      return fail(400, { section: 'ai', error: `Test failed: ${e?.message || 'unknown error'}` });
    }
  }
};
