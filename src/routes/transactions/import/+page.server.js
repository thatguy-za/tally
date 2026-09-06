import { fail } from '@sveltejs/kit';
import { parseCsv, parseAmount, parseDate } from '$lib/server/csv.js';
import { listCategories, bulkInsert, applyRules, uncategorisedCount } from '$lib/server/queries.js';
import { db } from '$lib/server/db.js';

const MAX_ROWS = 5000;

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return { categories: listCategories(locals.user.id) };
}

function guess(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const cand of candidates) {
    const i = lower.findIndex((h) => h.includes(cand));
    if (i > -1) return String(i);
  }
  return '';
}

export const actions = {
  analyze: async ({ request }) => {
    const f = await request.formData();
    const file = f.get('file');
    if (!file || typeof file === 'string' || file.size === 0)
      return fail(400, { error: 'Choose a CSV file.' });
    if (file.size > 5 * 1024 * 1024) return fail(400, { error: 'File is larger than 5 MB.' });

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) return fail(400, { error: 'That file has no data rows.' });

    const headers = rows[0];
    const body = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));

    return {
      analyzed: true,
      csv: text,
      headers,
      preview: body.slice(0, 8),
      rowCount: body.length,
      mapping: {
        date: guess(headers, ['date', 'datum', 'booking']),
        description: guess(headers, ['description', 'desc', 'name', 'payee', 'details', 'memo', 'reference', 'narrative']),
        amount: guess(headers, ['amount', 'value', 'bedrag', 'montant']),
        debit: guess(headers, ['debit', 'withdrawal', 'paid out', 'uit', 'af']),
        credit: guess(headers, ['credit', 'deposit', 'paid in', 'bij']),
        category: guess(headers, ['category', 'categorie'])
      }
    };
  },

  import: async ({ request, locals }) => {
    const f = await request.formData();
    const text = String(f.get('csv') || '');
    const col = {
      date: f.get('col_date'),
      description: f.get('col_description'),
      amount: f.get('col_amount'),
      debit: f.get('col_debit'),
      credit: f.get('col_credit'),
      category: f.get('col_category')
    };
    const dateOrder = f.get('date_order') === 'mdy' ? 'mdy' : 'dmy';
    const invert = f.get('invert') === 'on';
    const skipDuplicates = f.get('skip_duplicates') === 'on';
    const runRules = f.get('run_rules') === 'on';
    const defaultCategoryId = f.get('default_category_id') ? Number(f.get('default_category_id')) : null;
    const autoCreate = f.get('auto_create') === 'on';

    if (col.date === null || col.date === '') return fail(400, { error: 'Pick the date column.' });
    if ((col.amount === null || col.amount === '') && col.debit === '' && col.credit === '')
      return fail(400, { error: 'Pick an amount column, or debit/credit columns.' });

    const rows = parseCsv(text).slice(1).filter((r) => r.some((c) => c.trim() !== ''));
    if (rows.length > MAX_ROWS) return fail(400, { error: `Too many rows (limit ${MAX_ROWS}).` });

    const cats = listCategories(locals.user.id);
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
    const insertCat = db.prepare(
      "INSERT INTO categories (user_id, name, kind) VALUES (?, ?, 'expense')"
    );

    const cell = (r, idx) => (idx === '' || idx === null ? '' : r[Number(idx)] ?? '');
    const prepared = [];
    let skipped = 0;

    for (const r of rows) {
      const date = parseDate(cell(r, col.date), dateOrder);
      if (!date) { skipped++; continue; }

      let amount;
      if (col.amount !== '' && col.amount !== null) {
        amount = parseAmount(cell(r, col.amount));
      } else {
        const debit = parseAmount(cell(r, col.debit)) || 0;
        const credit = parseAmount(cell(r, col.credit)) || 0;
        amount = Math.abs(credit) - Math.abs(debit);
      }
      if (amount == null || amount === 0) { skipped++; continue; }
      if (invert) amount = -amount;

      let categoryId = defaultCategoryId;
      const catName = cell(r, col.category).trim();
      if (catName) {
        const existing = catByName.get(catName.toLowerCase());
        if (existing) categoryId = existing;
        else if (autoCreate) {
          const info = insertCat.run(locals.user.id, catName);
          catByName.set(catName.toLowerCase(), Number(info.lastInsertRowid));
          categoryId = Number(info.lastInsertRowid);
        }
      }

      prepared.push({
        date,
        description: cell(r, col.description).trim().slice(0, 200),
        amount,
        category_id: categoryId
      });
    }

    if (!prepared.length)
      return fail(400, { error: 'No valid rows found — check your column mapping.' });

    const { inserted, duplicates } = bulkInsert(locals.user.id, prepared, { skipDuplicates });
    const categorisedByRules = runRules ? applyRules(locals.user.id, { onlyUncategorised: true }) : 0;

    return {
      imported: inserted,
      skipped,
      duplicates,
      categorisedByRules,
      uncategorised: uncategorisedCount(locals.user.id)
    };
  }
};
