import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { hashPassword } from '$lib/server/auth.js';
import { aiStatus, aiEnabled, setSetting } from '$lib/server/ai-settings.js';
import { testConnection } from '$lib/server/ai.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (!locals.user.is_admin) throw redirect(303, '/settings');
  return {
    myId: locals.user.id,
    users: db
      .prepare(
        `SELECT u.id, u.email, u.is_admin, u.currency, u.created_at, u.ai_categorise,
                (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id) AS tx_count
         FROM users u ORDER BY u.id`
      )
      .all(),
    ai: aiStatus()
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
    const key = String(f.get('api_key') || '').trim();
    const model = String(f.get('model') || '');
    if (key && !/^sk-ant-/.test(key))
      return fail(400, { section: 'ai', error: 'That does not look like an Anthropic API key (starts with sk-ant-).' });
    setSetting('anthropic_api_key', key || null);
    if (model) setSetting('anthropic_model', model);
    return {
      section: 'ai',
      ok: true,
      msg: key ? 'API key saved.' : 'API key removed — AI features disabled.'
    };
  },

  aiModel: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    setSetting('anthropic_model', String(f.get('model') || ''));
    return { section: 'ai', ok: true, msg: 'Model updated.' };
  },

  aiTest: async ({ locals }) => {
    requireAdmin(locals);
    if (!aiEnabled()) return fail(400, { section: 'ai', error: 'Add an API key first.' });
    try {
      const r = await testConnection();
      return { section: 'ai', ok: true, msg: `Connected — ${r.model} replied “${r.reply || '…'}”.` };
    } catch (e) {
      return fail(400, { section: 'ai', error: `Test failed: ${e?.message || 'unknown error'}` });
    }
  }
};
