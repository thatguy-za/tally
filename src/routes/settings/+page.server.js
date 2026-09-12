import { fail } from '@sveltejs/kit';
import { CURRENCIES } from '$lib/currency.js';
import { db } from '$lib/server/db.js';
import {
  listCategories,
  createCategory,
  deleteCategory,
  setCategoryKind,
  listAccounts,
  createAccount,
  renameAccount,
  deleteAccount,
  listRules,
  createRule,
  deleteRule,
  applyRules,
  setUserAiCategorise,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { verifyPassword, hashPassword } from '$lib/server/auth.js';
import { aiEnabled } from '$lib/server/ai-settings.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const userId = locals.user.id;
  const counts = db
    .prepare('SELECT category_id, COUNT(*) AS n FROM transactions WHERE user_id = ? GROUP BY category_id')
    .all(userId);
  const countMap = Object.fromEntries(counts.map((c) => [c.category_id, c.n]));
  const acctCounts = db
    .prepare('SELECT account_id, COUNT(*) AS n FROM transactions WHERE user_id = ? GROUP BY account_id')
    .all(userId);
  const acctCountMap = Object.fromEntries(acctCounts.map((c) => [c.account_id, c.n]));

  return {
    currencies: CURRENCIES,
    currency: locals.user.currency,
    email: locals.user.email,
    isAdmin: !!locals.user.is_admin,
    categories: listCategories(userId).map((c) => ({ ...c, count: countMap[c.id] || 0 })),
    accounts: listAccounts(userId).map((a) => ({ ...a, count: acctCountMap[a.id] || 0 })),
    rules: listRules(userId),
    aiAvailable: aiEnabled(),
    aiCategorise: getUserAiCategorise(userId)
  };
}

export const actions = {
  currency: async ({ request, locals }) => {
    const f = await request.formData();
    const code = String(f.get('currency') || '');
    if (!CURRENCIES.some((c) => c.code === code)) return fail(400, { error: 'Unknown currency.' });
    db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(code, locals.user.id);
    return { section: 'currency', ok: true };
  },

  addAccount: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') || '').trim();
    const color = String(f.get('color') || '#64748b');
    if (!name) return fail(400, { section: 'account', error: 'Name is required.' });
    try {
      createAccount(locals.user.id, name, color);
    } catch {
      return fail(400, { section: 'account', error: 'An account with that name already exists.' });
    }
    return { section: 'account', ok: true };
  },

  renameAccount: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const name = String(f.get('name') || '').trim();
    const color = String(f.get('color') || '#64748b');
    if (!id || !name) return fail(400, { section: 'account', error: 'Name is required.' });
    try {
      renameAccount(locals.user.id, id, name, color);
    } catch {
      return fail(400, { section: 'account', error: 'An account with that name already exists.' });
    }
    return { section: 'account', ok: true, msg: 'Account updated' };
  },

  deleteAccount: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id) deleteAccount(locals.user.id, id);
    return { section: 'account', ok: true };
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

  categoryKind: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const kind = String(f.get('kind') || '');
    if (!id) return fail(400, { section: 'category', error: 'Unknown category.' });
    setCategoryKind(locals.user.id, id, kind);
    return { section: 'category', ok: true, msg: 'Category updated' };
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

  aiCategorise: async ({ request, locals }) => {
    if (!aiEnabled()) return fail(400);
    const f = await request.formData();
    setUserAiCategorise(locals.user.id, f.get('on') === '1');
    return { section: 'aiuser', ok: true };
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
  }
};
