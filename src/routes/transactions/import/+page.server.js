import { fail } from '@sveltejs/kit';
import { parseCsv } from '$lib/csv.js';
import {
  listCategories,
  listRules,
  listTransactions,
  bulkInsert,
  applyRules,
  uncategorisedCount,
  existingDupeKeys,
  createCategory,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { aiEnabled } from '$lib/server/ai-settings.js';

const MAX_ROWS = 5000;
const MAX_FILES = 20;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return {
    categories: listCategories(locals.user.id, locals.accountId),
    // matched client-side during review, before a row is ever sent to AI
    rules: listRules(locals.user.id, locals.accountId),
    aiAvailable: aiEnabled() && getUserAiCategorise(locals.user.id),
    dateFormat: locals.user.date_format
  };
}

export const actions = {
  analyze: async ({ request, locals }) => {
    const f = await request.formData();
    const files = f.getAll('file').filter((x) => x && typeof x !== 'string' && x.size > 0);
    if (!files.length) return fail(400, { error: 'Choose a CSV file.' });
    if (files.length > MAX_FILES) return fail(400, { error: `Too many files (limit ${MAX_FILES}).` });
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) return fail(400, { error: `${file.name} is larger than 8 MB.` });
    }

    const parsedFiles = [];
    for (const file of files) {
      const text = await file.text();
      if (parseCsv(text).length < 1) return fail(400, { error: `${file.name} doesn't look like a CSV.` });
      parsedFiles.push({ filename: file.name, csv: text });
    }

    return {
      analyzed: true,
      files: parsedFiles,
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

    // always the currently active account — you're always "in" one
    // account's context, so there's nothing to choose
    const accountId = locals.accountId;

    const cats = listCategories(locals.user.id, accountId);
    const byId = new Set(cats.map((c) => c.id));
    const byName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const resolveCategory = (row) => {
      if (row.category_id && byId.has(Number(row.category_id))) return Number(row.category_id);
      const name = String(row.category_name || '').trim();
      if (!name) return null;
      const hit = byName.get(name.toLowerCase());
      if (hit) return hit;
      if (opts.createCategories) {
        const created = createCategory(locals.user.id, accountId, name, 'expense');
        byId.add(created.id);
        byName.set(name.toLowerCase(), created.id);
        return created.id;
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
        category_id: resolveCategory(r),
        account_id: accountId
      });
    }
    if (!prepared.length)
      return fail(400, { error: 'None of the selected rows have a valid date and amount.' });

    const { inserted, duplicates } = bulkInsert(locals.user.id, prepared, {
      skipDuplicates: opts.skipDuplicates !== false
    });
    const categorisedByRules = opts.runRules
      ? applyRules(locals.user.id, { onlyUncategorised: true, accountId })
      : 0;

    return {
      imported: inserted,
      duplicates,
      invalid,
      categorisedByRules,
      uncategorised: uncategorisedCount(locals.user.id, accountId),
      // so the "done" step can offer them up for categorising right away
      uncategorisedRows: listTransactions(locals.user.id, { categoryId: 'none', accountId }).slice(0, 200)
    };
  }
};
