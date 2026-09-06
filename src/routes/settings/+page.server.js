import { fail } from '@sveltejs/kit';
import { CURRENCIES } from '$lib/currency.js';
import { db } from '$lib/server/db.js';
import {
  listCategories,
  createCategory,
  deleteCategory,
  listRules,
  createRule,
  deleteRule,
  applyRules
} from '$lib/server/queries.js';
import { verifyPassword, hashPassword } from '$lib/server/auth.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const userId = locals.user.id;
  const counts = db
    .prepare('SELECT category_id, COUNT(*) AS n FROM transactions WHERE user_id = ? GROUP BY category_id')
    .all(userId);
  const countMap = Object.fromEntries(counts.map((c) => [c.category_id, c.n]));

  const data = {
    currencies: CURRENCIES,
    currency: locals.user.currency,
    email: locals.user.email,
    myId: locals.user.id,
    isAdmin: !!locals.user.is_admin,
    categories: listCategories(userId).map((c) => ({ ...c, count: countMap[c.id] || 0 })),
    rules: listRules(userId)
  };

  if (locals.user.is_admin) {
    data.users = db
      .prepare('SELECT id, email, is_admin, currency, created_at FROM users ORDER BY id')
      .all();
  }
  return data;
}

export const actions = {
  currency: async ({ request, locals }) => {
    const f = await request.formData();
    const code = String(f.get('currency') || '');
    if (!CURRENCIES.some((c) => c.code === code)) return fail(400, { error: 'Unknown currency.' });
    db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(code, locals.user.id);
    return { section: 'currency', ok: true };
  },

  addCategory: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') || '').trim();
    const kind = String(f.get('kind') || 'expense');
    const color = String(f.get('color') || '#64748b');
    if (!name) return fail(400, { section: 'category', error: 'Name is required.' });
    try {
      createCategory(locals.user.id, name, kind, color);
    } catch {
      return fail(400, { section: 'category', error: 'A category with that name already exists.' });
    }
    return { section: 'category', ok: true };
  },

  deleteCategory: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id) deleteCategory(locals.user.id, id);
    return { section: 'category', ok: true };
  },

  addRule: async ({ request, locals }) => {
    const f = await request.formData();
    const matchText = String(f.get('match_text') || '').trim();
    const categoryId = Number(f.get('category_id'));
    const priority = Number(f.get('priority') || 0);
    if (!matchText || !categoryId)
      return fail(400, { section: 'rule', error: 'Enter text to match and a category.' });
    createRule(locals.user.id, matchText, categoryId, priority);
    const applied = applyRules(locals.user.id, { onlyUncategorised: true });
    return { section: 'rule', ok: true, applied };
  },

  deleteRule: async ({ request, locals }) => {
    const f = await request.formData();
    deleteRule(locals.user.id, Number(f.get('id')));
    return { section: 'rule', ok: true };
  },

  applyRules: async ({ request, locals }) => {
    const f = await request.formData();
    const onlyUncategorised = f.get('scope') !== 'all';
    const applied = applyRules(locals.user.id, { onlyUncategorised });
    return { section: 'rule', ok: true, applied };
  },

  password: async ({ request, locals }) => {
    const f = await request.formData();
    const current = String(f.get('current') || '');
    const next = String(f.get('next') || '');
    const confirm = String(f.get('confirm') || '');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(locals.user.id);
    if (!verifyPassword(current, row.password_hash))
      return fail(400, { section: 'password', error: 'Current password is incorrect.' });
    if (next.length < 8)
      return fail(400, { section: 'password', error: 'New password must be at least 8 characters.' });
    if (next !== confirm)
      return fail(400, { section: 'password', error: 'New passwords do not match.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), locals.user.id);
    return { section: 'password', ok: true };
  },

  resetUserPassword: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    const id = Number(f.get('id'));
    const next = String(f.get('new_password') || '');
    if (next.length < 8)
      return fail(400, { section: 'admin', error: 'Password must be at least 8 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); // force re-login
    return { section: 'admin', ok: true, msg: 'Password reset. Their existing sessions were ended.' };
  },

  setAdmin: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    const id = Number(f.get('id'));
    const makeAdmin = f.get('admin') === '1' ? 1 : 0;
    if (id === locals.user.id && !makeAdmin) {
      const others = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND id != ?').get(id).n;
      if (!Number(others)) return fail(400, { section: 'admin', error: 'You are the only admin.' });
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(makeAdmin, id);
    return { section: 'admin', ok: true };
  },

  deleteUser: async ({ request, locals }) => {
    if (!locals.user.is_admin) return fail(403);
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id === locals.user.id) return fail(400, { section: 'admin', error: "You can't delete yourself." });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { section: 'admin', ok: true, msg: 'User and all their data deleted.' };
  }
};
