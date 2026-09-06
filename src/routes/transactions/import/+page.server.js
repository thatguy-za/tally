import { fail } from '@sveltejs/kit';
import { parseCsv } from '$lib/csv.js';
import {
  listCategories,
  bulkInsert,
  applyRules,
  uncategorisedCount,
  existingDupeKeys,
  createCategory,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { aiEnabled } from '$lib/server/ai-settings.js';

const MAX_ROWS = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return {
    categories: listCategories(locals.user.id),
    aiAvailable: aiEnabled() && getUserAiCategorise(locals.user.id)
  };
}

export const actions = {
  analyze: async ({ request, locals }) => {
    const f = await request.formData();
    const file = f.get('file');
    if (!file || typeof file === 'string' || file.size === 0)
      return fail(400, { error: 'Choose a CSV file.' });
    if (file.size > 8 * 1024 * 1024) return fail(400, { error: 'File is larger than 8 MB.' });

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 1) return fail(400, { error: "That file doesn't look like a CSV." });

    return {
      analyzed: true,
      csv: text,
      filename: file.name,
      // let the client pre-flag duplicates; capped so the payload stays small
      existingKeys: [...existingDupeKeys(locals.user.id)].slice(0, 8000)
    };
  },

  import: async ({ request, locals }) => {
    const f = await request.formData();
    let payload;
    try {
      payload = JSON.parse(String(f.get('payload') || '{}'));
    } catch {
      return fail(400, { error: 'Could not read the review data — please try again.' });
    }
    const incoming = Array.isArray(payload.rows) ? payload.rows : [];
    const opts = payload.options || {};
    if (!incoming.length) return fail(400, { error: 'No rows selected to import.' });
    if (incoming.length > MAX_ROWS) return fail(400, { error: `Too many rows (limit ${MAX_ROWS}).` });

    const cats = listCategories(locals.user.id);
    const byId = new Set(cats.map((c) => c.id));
    const byName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const resolveCategory = (row) => {
      if (row.category_id && byId.has(Number(row.category_id))) return Number(row.category_id);
      const name = String(row.category_name || '').trim();
      if (!name) return null;
      const hit = byName.get(name.toLowerCase());
      if (hit) return hit;
      if (opts.createCategories) {
        const info = createCategory(locals.user.id, name, 'expense');
        const id = Number(info.lastInsertRowid);
        byId.add(id);
        byName.set(name.toLowerCase(), id);
        return id;
      }
      return null;
    };

    const prepared = [];
    let invalid = 0;
    for (const r of incoming) {
      const date = String(r.date || '').slice(0, 10);
      const amount = Number(r.amount);
      if (!DATE_RE.test(date) || !Number.isFinite(amount)) { invalid++; continue; }
      prepared.push({
        date,
        description: String(r.description || '').trim().slice(0, 200),
        amount,
        category_id: resolveCategory(r)
      });
    }
    if (!prepared.length)
      return fail(400, { error: 'None of the selected rows have a valid date and amount.' });

    const { inserted, duplicates } = bulkInsert(locals.user.id, prepared, {
      skipDuplicates: opts.skipDuplicates !== false
    });
    const categorisedByRules = opts.runRules
      ? applyRules(locals.user.id, { onlyUncategorised: true })
      : 0;

    return {
      imported: inserted,
      duplicates,
      invalid,
      categorisedByRules,
      uncategorised: uncategorisedCount(locals.user.id)
    };
  }
};
