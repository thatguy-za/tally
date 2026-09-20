import { fail } from '@sveltejs/kit';
import { CURRENCIES } from '$lib/currency.js';
import { DATE_FORMATS } from '$lib/csv.js';
import { db } from '$lib/server/db.js';
import {
  listCategories,
  listAccounts,
  createAccount,
  renameAccount,
  deleteAccount,
  listRules,
  createRule,
  deleteRule,
  applyRules,
  previewRuleRerun,
  applyCategoryChanges,
  setUserAiCategorise,
  getUserAiCategorise,
  deleteAllTransactions
} from '$lib/server/queries.js';
import { verifyPassword, hashPassword, getUserByUsername } from '$lib/server/auth.js';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { restoreBackup } from '$lib/server/backup.js';

const MAX_BACKUP_SIZE = 20 * 1024 * 1024;

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const userId = locals.user.id;
  const accountId = locals.accountId;
  const acctCounts = db
    .prepare('SELECT account_id, COUNT(*) AS n FROM transactions WHERE user_id = ? GROUP BY account_id')
    .all(userId);
  const acctCountMap = Object.fromEntries(acctCounts.map((c) => [c.account_id, c.n]));

  return {
    currencies: CURRENCIES,
    currency: locals.user.currency,
    dateFormats: DATE_FORMATS,
    dateFormat: locals.user.date_format,
    username: locals.user.username,
    isAdmin: !!locals.user.is_admin,
    categories: listCategories(userId, accountId),
    accounts: listAccounts(userId).map((a) => ({ ...a, count: acctCountMap[a.id] || 0 })),
    rules: listRules(userId, accountId),
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

  dateFormat: async ({ request, locals }) => {
    const f = await request.formData();
    const value = String(f.get('date_format') || '');
    if (!DATE_FORMATS.some((d) => d.value === value)) return fail(400, { error: 'Unknown date format.' });
    db.prepare('UPDATE users SET date_format = ? WHERE id = ?').run(value, locals.user.id);
    return { section: 'dateFormat', ok: true };
  },

  addAccount: async ({ request, locals }) => {
    const f = await request.formData();
    const name = String(f.get('name') || '').trim();
    const color = String(f.get('color') || '#64748b');
    const kind = f.get('kind') === 'savings' ? 'savings' : 'checking';
    if (!name) return fail(400, { section: 'account', error: 'Name is required.' });
    let created;
    try {
      created = createAccount(locals.user.id, name, color, kind);
    } catch {
      return fail(400, { section: 'account', error: 'An account with that name already exists.' });
    }
    return { section: 'account', ok: true, msg: 'Account added', created };
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
    const all = listAccounts(locals.user.id);
    if (!all.some((a) => a.id === id)) return fail(400, { section: 'account', error: 'Unknown account.' });
    if (all.length <= 1)
      return fail(400, { section: 'account', error: "You can't delete your only account." });
    deleteAccount(locals.user.id, id);
    return { section: 'account', ok: true, msg: 'Account deleted' };
  },

  addRule: async ({ request, locals }) => {
    const f = await request.formData();
    const matchText = String(f.get('match_text') || '').trim();
    const categoryId = Number(f.get('category_id'));
    const priority = Number(f.get('priority') || 0);
    const overwrite = f.get('overwrite') === 'on';
    if (!matchText || !categoryId)
      return fail(400, { section: 'rule', error: 'Enter text to match and a category.' });
    createRule(locals.user.id, locals.accountId, matchText, categoryId, priority);
    const applied = applyRules(locals.user.id, { onlyUncategorised: !overwrite, accountId: locals.accountId });
    return { section: 'rule', ok: true, applied };
  },

  deleteRule: async ({ request, locals }) => {
    const f = await request.formData();
    deleteRule(locals.user.id, Number(f.get('id')));
    return { section: 'rule', ok: true };
  },

  previewRerun: async ({ locals }) => {
    const changes = previewRuleRerun(locals.user.id, locals.accountId);
    return { section: 'rerun', ok: true, changes };
  },

  applyRerun: async ({ request, locals }) => {
    const f = await request.formData();
    let changes;
    try {
      changes = JSON.parse(String(f.get('changes') || '[]'));
    } catch {
      return fail(400, { section: 'rerun', error: 'Could not read the preview — please try again.' });
    }
    const applied = applyCategoryChanges(locals.user.id, changes);
    return { section: 'rerun', ok: true, applied };
  },

  aiCategorise: async ({ request, locals }) => {
    if (!aiEnabled()) return fail(400);
    const f = await request.formData();
    setUserAiCategorise(locals.user.id, f.get('on') === '1');
    return { section: 'aiuser', ok: true };
  },

  username: async ({ request, locals }) => {
    const f = await request.formData();
    const username = String(f.get('username') || '').trim();
    if (!username || username.length > 64 || /\s/.test(username))
      return fail(400, { section: 'username', error: 'Choose a username with no spaces (up to 64 characters).' });
    const existing = getUserByUsername(username);
    if (existing && existing.id !== locals.user.id)
      return fail(400, { section: 'username', error: 'That username is already taken.' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.toLowerCase(), locals.user.id);
    return { section: 'username', ok: true, msg: 'Username updated' };
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

  deleteAllTransactions: async ({ locals }) => {
    const n = deleteAllTransactions(locals.user.id);
    return { section: 'danger', ok: true, msg: `Deleted ${n} transaction${n === 1 ? '' : 's'}.` };
  },

  restoreBackup: async ({ request, locals }) => {
    const f = await request.formData();
    const file = f.get('file');
    if (!file || typeof file === 'string' || file.size === 0)
      return fail(400, { section: 'danger', error: 'Choose a backup zip file.' });
    if (file.size > MAX_BACKUP_SIZE)
      return fail(400, { section: 'danger', error: 'That file is larger than 20 MB.' });

    let summary;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      summary = restoreBackup(locals.user.id, buffer);
    } catch (e) {
      return fail(400, { section: 'danger', error: e?.message || 'Could not restore that backup.' });
    }
    return {
      section: 'danger',
      ok: true,
      msg: `Restored ${summary.accounts} account${summary.accounts === 1 ? '' : 's'}, ${summary.categories} categories, ${summary.rules} rules, ${summary.budgets} budgets and ${summary.transactions} transactions${summary.skipped ? ` (${summary.skipped} row${summary.skipped === 1 ? '' : 's'} skipped)` : ''}.`
    };
  }
};
