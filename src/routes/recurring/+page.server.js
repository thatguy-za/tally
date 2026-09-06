import { fail } from '@sveltejs/kit';
import { parseAmount } from '$lib/server/csv.js';
import {
  listCategories,
  listRecurring,
  dueRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  postRecurringOccurrence,
  skipRecurringOccurrence
} from '$lib/server/queries.js';

const FREQ = ['weekly', 'monthly', 'yearly'];

function readForm(f) {
  const magnitude = parseAmount(String(f.get('amount') || ''));
  const direction = String(f.get('direction') || 'out');
  const frequency = FREQ.includes(String(f.get('frequency'))) ? String(f.get('frequency')) : 'monthly';
  return {
    description: String(f.get('description') || '').trim(),
    amount: magnitude == null ? null : Math.abs(magnitude) * (direction === 'in' ? 1 : -1),
    category_id: f.get('category_id') ? Number(f.get('category_id')) : null,
    frequency,
    interval_n: Math.max(1, Number(f.get('interval_n') || 1)),
    next_date: String(f.get('next_date') || ''),
    end_date: String(f.get('end_date') || '') || null,
    auto_post: f.get('auto_post') === 'on' ? 1 : 0
  };
}

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return {
    recurring: listRecurring(locals.user.id),
    due: dueRecurring(locals.user.id),
    categories: listCategories(locals.user.id),
    currency: locals.user.currency,
    today: new Date().toISOString().slice(0, 10)
  };
}

export const actions = {
  create: async ({ request, locals }) => {
    const data = readForm(await request.formData());
    if (data.amount == null || !data.next_date)
      return fail(400, { error: 'Amount and first date are required.' });
    createRecurring(locals.user.id, data);
    return { created: true };
  },

  update: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const data = readForm(f);
    if (!id || data.amount == null || !data.next_date) return fail(400, { error: 'Invalid values.' });
    updateRecurring(locals.user.id, id, data);
    return { updated: true };
  },

  toggle: async ({ request, locals }) => {
    const f = await request.formData();
    updateRecurring(locals.user.id, Number(f.get('id')), {
      active: f.get('active') === '1' ? 1 : 0
    });
    return { updated: true };
  },

  delete: async ({ request, locals }) => {
    const f = await request.formData();
    deleteRecurring(locals.user.id, Number(f.get('id')));
    return { deleted: true };
  },

  post: async ({ request, locals }) => {
    const f = await request.formData();
    postRecurringOccurrence(locals.user.id, Number(f.get('id')));
    return { posted: true };
  },

  skip: async ({ request, locals }) => {
    const f = await request.formData();
    skipRecurringOccurrence(locals.user.id, Number(f.get('id')));
    return { skipped: true };
  },

  postAll: async ({ locals }) => {
    const due = dueRecurring(locals.user.id);
    for (const r of due) postRecurringOccurrence(locals.user.id, r.id);
    return { posted: due.length };
  }
};
