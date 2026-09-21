import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryKind,
  setCategoryColor,
  listRules,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { suggestNewCategories } from '$lib/server/ai.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const userId = locals.user.id;
  const accountId = locals.accountId;
  const counts = db
    .prepare('SELECT category_id, COUNT(*) AS n FROM transactions WHERE user_id = ? AND account_id = ? GROUP BY category_id')
    .all(userId, accountId);
  const countMap = Object.fromEntries(counts.map((c) => [c.category_id, c.n]));

  return {
    categories: listCategories(userId, accountId).map((c) => ({ ...c, count: countMap[c.id] || 0 })),
    rules: listRules(userId, accountId),
    aiAvailable: aiEnabled() && getUserAiCategorise(userId),
    currency: locals.user.currency
  };
}

export const actions = {
  addCategory: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') || '').trim();
    const kind = String(f.get('kind') || 'expense');
    const color = String(f.get('color') || '#64748b');
    if (!name) return fail(400, { section: 'category', error: 'Name is required.' });
    let created;
    try {
      created = createCategory(locals.user.id, locals.accountId, name, kind, color);
    } catch {
      return fail(400, { section: 'category', error: 'A category with that name already exists.' });
    }
    return { section: 'category', ok: true, created };
  },

  updateCategory: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const name = String(f.get('name') || '').trim();
    const kind = String(f.get('kind') || 'expense');
    const color = String(f.get('color') || '#64748b');
    if (!id || !name) return fail(400, { section: 'category', error: 'Name is required.' });
    try {
      updateCategory(locals.user.id, locals.accountId, id, { name, kind, color });
    } catch {
      return fail(400, { section: 'category', error: 'A category with that name already exists.' });
    }
    return { section: 'category', ok: true, msg: 'Category updated' };
  },

  categoryKind: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const kind = String(f.get('kind') || '');
    if (!id) return fail(400, { section: 'category', error: 'Unknown category.' });
    setCategoryKind(locals.user.id, locals.accountId, id, kind);
    return { section: 'category', ok: true, msg: 'Category updated' };
  },

  categoryColor: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const color = String(f.get('color') || '#64748b');
    if (!id) return fail(400, { section: 'category', error: 'Unknown category.' });
    setCategoryColor(locals.user.id, locals.accountId, id, color);
    return { section: 'category', ok: true, msg: 'Category updated' };
  },

  deleteCategory: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (id) deleteCategory(locals.user.id, locals.accountId, id);
    return { section: 'category', ok: true };
  },

  suggest: async ({ locals }) => {
    if (!aiEnabled() || !getUserAiCategorise(locals.user.id))
      return fail(400, { section: 'ai', error: 'AI is not enabled for your account.' });
    try {
      const r = await suggestNewCategories(locals.user.id, locals.accountId);
      return { section: 'ai', ok: true, suggestions: r.suggestions, costUsd: r.costUsd };
    } catch (e) {
      return fail(400, { section: 'ai', error: e?.message || 'Could not generate suggestions.' });
    }
  },

  addSuggested: async ({ request, locals }) => {
    const f = await request.formData();
    let picks;
    try {
      picks = JSON.parse(String(f.get('picks') || '[]'));
    } catch {
      picks = [];
    }
    let added = 0;
    for (const p of Array.isArray(picks) ? picks : []) {
      const name = String(p?.name || '').trim();
      if (!name) continue;
      try {
        createCategory(locals.user.id, locals.accountId, name, p?.kind || 'expense', p?.color);
        added++;
      } catch {
        /* skip duplicates */
      }
    }
    return { section: 'category', ok: true, msg: `${added} categor${added === 1 ? 'y' : 'ies'} added` };
  }
};
