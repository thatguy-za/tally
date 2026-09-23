import { db, tx, seedCategories } from './db.js';
import { guessDomain, logoKey } from '$lib/logo.js';

/* ------------------------------------------------------------------ categories */

export function listCategories(userId, accountId) {
  return db
    .prepare('SELECT * FROM categories WHERE user_id = ? AND account_id = ? ORDER BY kind DESC, name')
    .all(userId, accountId);
}

/**
 * `saving` is money kept rather than spent — any transaction in a category of
 * this kind is left out of income/spending and reported on its own as
 * "saved" instead. The one exception is a dedicated savings account, where
 * that money IS the account's own income/spending rather than a separate
 * figure — see isSavingsAccount() below. `transfer` is for the receiving
 * side of a move between two of the user's own accounts (e.g. into a savings
 * account whose statement is also imported): it is excluded from income,
 * spending and "saved" alike, since that money was already accounted for on
 * the sending side. `opening_balance` is the starting balance you had when
 * you began tracking an account (the way most bank exports and other
 * budgeting apps represent it) — also excluded everywhere, since it isn't
 * income, spending, or a move between two tracked accounts.
 */
export const CATEGORY_KINDS = ['income', 'expense', 'saving', 'transfer', 'opening_balance'];
export const normaliseKind = (k) => (CATEGORY_KINDS.includes(k) ? k : 'expense');
/** Kinds left out of income/spending totals wherever they're computed. */
export const NON_SPENDING_KINDS = ['saving', 'transfer', 'opening_balance'];

export function createCategory(userId, accountId, name, kind, color) {
  const k = normaliseKind(kind);
  const c = color || '#64748b';
  const trimmed = name.trim();
  const info = db
    .prepare('INSERT INTO categories (user_id, account_id, name, kind, color) VALUES (?, ?, ?, ?, ?)')
    .run(userId, accountId, trimmed, k, c);
  return { id: Number(info.lastInsertRowid), name: trimmed, kind: k, color: c };
}

/** Change what a category *is* — the only way to mark one as savings after the fact. */
export function setCategoryKind(userId, accountId, id, kind) {
  db.prepare('UPDATE categories SET kind = ? WHERE id = ? AND user_id = ? AND account_id = ?').run(
    normaliseKind(kind),
    id,
    userId,
    accountId
  );
}

export function setCategoryColor(userId, accountId, id, color) {
  db.prepare('UPDATE categories SET color = ? WHERE id = ? AND user_id = ? AND account_id = ?').run(
    color,
    id,
    userId,
    accountId
  );
}

/** Full edit — name, kind and colour together, for the Categories page's edit row. */
export function updateCategory(userId, accountId, id, { name, kind, color }) {
  db.prepare(
    'UPDATE categories SET name = ?, kind = ?, color = ? WHERE id = ? AND user_id = ? AND account_id = ?'
  ).run(name.trim(), normaliseKind(kind), color || '#64748b', id, userId, accountId);
}

export function deleteCategory(userId, accountId, id) {
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND account_id = ?').run(
    id,
    userId,
    accountId
  );
}

/* --------------------------------------------------------------------- accounts */

export function listAccounts(userId) {
  return db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id').all(userId);
}

/** New accounts get their own copy of the default categories — never another account's. */
export function createAccount(userId, name, color, kind) {
  const trimmed = name.trim();
  const c = color || '#64748b';
  const k = kind === 'savings' ? 'savings' : 'checking';
  const info = db
    .prepare('INSERT INTO accounts (user_id, name, color, kind) VALUES (?, ?, ?, ?)')
    .run(userId, trimmed, c, k);
  const id = Number(info.lastInsertRowid);
  seedCategories(userId, id);
  return { id, name: trimmed, color: c, kind: k };
}

/** A savings account's own `saving`-kind transactions count as its ordinary income/expense — see isSavingsAccount(). */
export function setAccountKind(userId, id, kind) {
  const k = kind === 'savings' ? 'savings' : 'checking';
  db.prepare('UPDATE accounts SET kind = ? WHERE id = ? AND user_id = ?').run(k, id, userId);
}

export function renameAccount(userId, id, name, color) {
  db.prepare('UPDATE accounts SET name = ?, color = ? WHERE id = ? AND user_id = ?').run(
    name.trim(),
    color || '#64748b',
    id,
    userId
  );
}

/** Its transactions become unassigned ("No account"), same as deleting a category. */
export function deleteAccount(userId, id) {
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId);
}

/* ---------------------------------------------------------------- transactions */

export function listMonths(userId, accountId = null) {
  const af = accountFilter(accountId).sql.replace('t.account_id', 'account_id');
  return db
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) AS ym FROM transactions
       WHERE user_id = @userId ${af} ORDER BY ym DESC`
    )
    .all({ userId, ...accountFilter(accountId).params })
    .map((r) => r.ym);
}

export function listTransactions(userId, f = {}) {
  const where = ['t.user_id = @userId'];
  const params = { userId };
  if (f.month) { where.push('substr(t.date, 1, 7) = @month'); params.month = f.month; }
  if (f.dateFrom) { where.push('t.date >= @dateFrom'); params.dateFrom = f.dateFrom; }
  if (f.dateTo) { where.push('t.date <= @dateTo'); params.dateTo = f.dateTo; }
  // dismissed-uncategorised rows opted out of ever needing a category, so
  // they don't belong in a "what still needs categorising" filtered view
  if (f.categoryId === 'none') where.push('t.category_id IS NULL AND t.dismissed_uncategorised = 0');
  else if (f.categoryId === 'other') {
    // the chart's folded "Other" bucket: every categorised transaction of the
    // given kind(s) that isn't one of the individually-shown categories
    where.push('t.category_id IS NOT NULL');
    if (f.categoryKinds?.length) {
      where.push(`c.kind IN (${f.categoryKinds.map((_, i) => `@kind${i}`).join(',')})`);
      f.categoryKinds.forEach((k, i) => { params[`kind${i}`] = k; });
    }
    if (f.excludeCategoryIds?.length) {
      where.push(`t.category_id NOT IN (${f.excludeCategoryIds.map((_, i) => `@excl${i}`).join(',')})`);
      f.excludeCategoryIds.forEach((id, i) => { params[`excl${i}`] = id; });
    }
  } else if (f.categoryId) { where.push('t.category_id = @categoryId'); params.categoryId = f.categoryId; }
  if (f.accountId === 'none') where.push('t.account_id IS NULL');
  else if (f.accountId) { where.push('t.account_id = @accountId'); params.accountId = f.accountId; }
  if (f.search) { where.push('lower(t.description) LIKE @search'); params.search = `%${String(f.search).toLowerCase()}%`; }
  if (f.amountMin != null) { where.push('abs(t.amount) >= @amountMin'); params.amountMin = f.amountMin; }
  if (f.amountMax != null) { where.push('abs(t.amount) <= @amountMax'); params.amountMax = f.amountMax; }
  if (f.direction === 'in') where.push('t.amount >= 0');
  else if (f.direction === 'out') where.push('t.amount < 0');

  return db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.color AS category_color, c.kind AS category_kind,
              a.name AS account_name, a.color AS account_color
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(params);
}

export function addTransaction(userId, { date, description, amount, category_id, account_id }) {
  return db
    .prepare(
      `INSERT INTO transactions (user_id, date, description, amount, category_id, account_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, date, description || '', amount, category_id || null, account_id || null);
}

const dupeKey = (r) =>
  `${r.date}|${Number(r.amount).toFixed(2)}|${String(r.description || '').trim().toLowerCase()}`;

export function existingDupeKeys(userId) {
  const rows = db
    .prepare('SELECT date, amount, description FROM transactions WHERE user_id = ?')
    .all(userId);
  return new Set(rows.map(dupeKey));
}

/** Insert rows, skipping ones that duplicate an existing transaction or an earlier row in the batch. */
export function bulkInsert(userId, rows, { skipDuplicates = true } = {}) {
  const seen = skipDuplicates ? existingDupeKeys(userId) : new Set();
  const stmt = db.prepare(
    `INSERT INTO transactions (user_id, date, description, amount, category_id, account_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  let inserted = 0;
  let duplicates = 0;
  tx(() => {
    for (const r of rows) {
      if (skipDuplicates) {
        const k = dupeKey(r);
        if (seen.has(k)) { duplicates++; continue; }
        seen.add(k);
      }
      stmt.run(userId, r.date, r.description || '', r.amount, r.category_id || null, r.account_id || null);
      inserted++;
    }
  });
  return { inserted, duplicates };
}

// `IS` rather than `=` for account_id below: a transaction's account_id can
// be NULL (unassigned, e.g. after its account was deleted), and `= NULL`
// never matches in SQL even when the bound value is also null — `IS` is the
// null-safe equality that still behaves like `=` for two real ids.

/** `accountId` is the account currently active, not a field being changed — a transaction can only ever be touched from the account it's already in. */
export function updateTransaction(userId, accountId, id, fields) {
  const allowed = ['date', 'description', 'amount', 'category_id', 'account_id'];
  const sets = [];
  const params = { id, userId, scopeAccountId: accountId };
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = @${k}`); params[k] = fields[k]; }
  }
  if (!sets.length) return;
  db.prepare(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId AND account_id IS @scopeAccountId`
  ).run(params);
}

export function deleteTransaction(userId, accountId, id) {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ? AND account_id IS ?').run(id, userId, accountId);
}

export function bulkCategorise(userId, accountId, ids, categoryId) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(
      `UPDATE transactions SET category_id = ?
       WHERE user_id = ? AND account_id IS ? AND id IN (${placeholders})`
    )
    .run(categoryId || null, userId, accountId, ...ids);
  return Number(info.changes);
}

export function bulkDelete(userId, accountId, ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`DELETE FROM transactions WHERE user_id = ? AND account_id IS ? AND id IN (${placeholders})`)
    .run(userId, accountId, ...ids);
  return Number(info.changes);
}

export function deleteAllTransactions(userId) {
  const info = db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
  return Number(info.changes);
}

// AI categorisation is opt-out — on unless the user has explicitly turned it off.
export function setUserAiCategorise(userId, on) {
  db.prepare('UPDATE users SET ai_off = ? WHERE id = ?').run(on ? 0 : 1, userId);
}

export function getUserAiCategorise(userId) {
  return !db.prepare('SELECT ai_off FROM users WHERE id = ?').get(userId)?.ai_off;
}

/**
 * A representative sample of this user's own transaction descriptions, one
 * per distinct (lowercased) description, newest first — used to ask the AI
 * for category suggestions tailored to how this person actually spends,
 * rather than a generic list.
 */
export function sampleDescriptionsForSuggestion(userId, accountId, limit = 150) {
  const rows = db
    .prepare(
      `SELECT description, amount FROM transactions
       WHERE user_id = ? AND account_id = ? AND description != ''
       ORDER BY id DESC LIMIT 2000`
    )
    .all(userId, accountId);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = r.description.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function uncategorisedCount(userId, accountId = null) {
  const af = accountFilter(accountId);
  return Number(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions t
         WHERE t.user_id = @userId AND t.category_id IS NULL
           AND t.dismissed_uncategorised = 0 ${af.sql}`
      )
      .get({ userId, ...af.params }).n
  );
}

/** Says "this one doesn't need a category" — it stops counting toward the nudge. */
export function setUncategorisedDismissed(userId, id, dismissed) {
  db.prepare('UPDATE transactions SET dismissed_uncategorised = ? WHERE id = ? AND user_id = ?').run(
    dismissed ? 1 : 0,
    id,
    userId
  );
}

/* --------------------------------------------------------------------- reports */

// SQL fragments for splitting out what counts as ordinary income/spending.
// 'transfer' and 'opening_balance' are excluded from both everywhere, but
// 'saving' is only pulled out on a *non*-savings account — see
// isSavingsAccount() below. On a savings account, a 'saving'-kind transaction
// IS the account's whole purpose, so it's just ordinary income/spending there
// (by sign) rather than a separate "saved" figure, which would double-count it.
const NON_SPENDING_KINDS_SANS_SAVING = NON_SPENDING_KINDS.filter((k) => k !== 'saving');
const notSpendingSql = (onSavingsAccount) =>
  `COALESCE(c.kind, 'expense') NOT IN (${(onSavingsAccount ? NON_SPENDING_KINDS_SANS_SAVING : NON_SPENDING_KINDS)
    .map((k) => `'${k}'`)
    .join(', ')})`;
const isSavingSql = (onSavingsAccount) => (onSavingsAccount ? '0' : `COALESCE(c.kind, 'expense') = 'saving'`);

/** Whether the account being viewed is a dedicated savings account, or the combined/unassigned view. */
function isSavingsAccount(userId, accountId) {
  if (!accountId || accountId === 'none') return false;
  return db.prepare('SELECT kind FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId)?.kind === 'savings';
}

/**
 * An optional account filter as a SQL fragment + the params to bind. Every
 * per-account view (dashboard, reports) is optional — pass null/undefined for
 * the combined, all-accounts read.
 * @param {number|string|null|undefined} accountId 'none' matches unassigned transactions
 */
function accountFilter(accountId) {
  if (accountId === 'none') return { sql: 'AND t.account_id IS NULL', params: {} };
  if (accountId) return { sql: 'AND t.account_id = @accountId', params: { accountId } };
  return { sql: '', params: {} };
}

/**
 * Per-month in / out / saved. Money in a `saving` category is money kept, so it
 * is excluded from `outgoing` and reported as `saved` — a net contribution, so
 * a withdrawal shows up negative rather than being hidden. On a dedicated
 * savings account, that money IS the account's income, so it counts as
 * ordinary in/out there instead — see isSavingsAccount().
 */
export function monthlyTotals(userId, months = 12, accountId = null) {
  const af = accountFilter(accountId);
  const savings = isSavingsAccount(userId, accountId);
  const notSpending = notSpendingSql(savings);
  const isSaving = isSavingSql(savings);
  return db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym,
              SUM(CASE WHEN t.amount > 0 AND ${notSpending} THEN t.amount ELSE 0 END) AS incoming,
              SUM(CASE WHEN t.amount < 0 AND ${notSpending} THEN -t.amount ELSE 0 END) AS outgoing,
              SUM(CASE WHEN ${isSaving} THEN -t.amount ELSE 0 END) AS saved
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId ${af.sql}
       GROUP BY ym ORDER BY ym DESC LIMIT @months`
    )
    .all({ userId, months, ...af.params });
}

export function categoryBreakdown(userId, month, accountId = null) {
  const params = { userId };
  let monthFilter = '';
  if (month) { monthFilter = 'AND substr(t.date, 1, 7) = @month'; params.month = month; }
  const af = accountFilter(accountId);
  Object.assign(params, af.params);
  return db
    .prepare(
      `SELECT c.id AS id,
              COALESCE(c.name, 'Uncategorised') AS name,
              COALESCE(c.color, '#94a3b8') AS color,
              COALESCE(c.kind, 'expense') AS kind,
              SUM(t.amount) AS total,
              COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId ${monthFilter} ${af.sql}
       GROUP BY c.id
       ORDER BY total ASC`
    )
    .all(params);
}

/**
 * Per-category monthly spend magnitude for the last `months` calendar months.
 * @returns {{ months: string[], byCategory: Record<string, number[]> }}
 * arrays run oldest -> newest and align to `months`.
 */
export function categorySparkData(userId, months = 6, accountId = null) {
  const now = new Date();
  const list = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    list.push(d.toISOString().slice(0, 7));
  }
  const since = list[0] + '-01';
  const af = accountFilter(accountId).sql.replace('t.account_id', 'account_id');
  const rows = db
    .prepare(
      `SELECT category_id, substr(date, 1, 7) AS ym, SUM(amount) AS total
       FROM transactions
       WHERE user_id = @userId AND date >= @since AND category_id IS NOT NULL ${af}
       GROUP BY category_id, ym`
    )
    .all({ userId, since, ...accountFilter(accountId).params });

  const idx = Object.fromEntries(list.map((m, i) => [m, i]));
  /** @type {Record<string, number[]>} */
  const byCategory = {};
  for (const r of rows) {
    if (!(r.category_id in byCategory)) byCategory[r.category_id] = list.map(() => 0);
    const i = idx[r.ym];
    if (i != null) byCategory[r.category_id][i] = Math.max(0, -r.total);
  }
  return { months: list, byCategory };
}

/* ----------------------------------------------------------------------- rules */

export function listRules(userId, accountId) {
  return db
    .prepare(
      `SELECT r.*, c.name AS category_name, c.color AS category_color
       FROM rules r JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? AND r.account_id = ? ORDER BY r.priority DESC, r.id`
    )
    .all(userId, accountId);
}

export function createRule(userId, accountId, matchText, categoryId, priority = 0) {
  return db
    .prepare(
      'INSERT INTO rules (user_id, account_id, match_text, category_id, priority) VALUES (?, ?, ?, ?, ?)'
    )
    .run(userId, accountId, matchText.trim(), categoryId, priority);
}

export function deleteRule(userId, accountId, id) {
  db.prepare('DELETE FROM rules WHERE id = ? AND user_id = ? AND account_id = ?').run(id, userId, accountId);
}

/**
 * Apply a single account's rules to that same account's transactions.
 * @param {number} userId
 * @param {{ onlyUncategorised?: boolean, ids?: number[], accountId: number }} opts
 * @returns {number} number of transactions updated
 */
export function applyRules(userId, { onlyUncategorised = true, ids = null, accountId = null } = {}) {
  const af = accountFilter(accountId).sql.replace('t.account_id', 'account_id');
  const rules = db
    .prepare('SELECT * FROM rules WHERE user_id = ? AND account_id = ? ORDER BY priority DESC, id')
    .all(userId, accountId);
  let changed = 0;
  tx(() => {
    for (const rule of rules) {
      const params = {
        userId,
        categoryId: rule.category_id,
        match: `%${rule.match_text.toLowerCase()}%`,
        ...accountFilter(accountId).params
      };
      let sql = `UPDATE transactions SET category_id = @categoryId
                 WHERE user_id = @userId AND lower(description) LIKE @match ${af}`;
      if (onlyUncategorised) sql += ' AND category_id IS NULL';
      if (ids && ids.length) {
        sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
        changed += Number(db.prepare(sql).run(params, ...ids).changes);
      } else {
        changed += Number(db.prepare(sql).run(params).changes);
      }
    }
  });
  return changed;
}

/**
 * Dry-run every one of the account's rules against every one of its
 * transactions — categorised or not — and report only the ones whose
 * category would actually change. Nothing is written; this powers "Re-run
 * categorisation"'s preview, so the user approves the diff before anything
 * is saved. Same "first (highest-priority) match wins" semantics as
 * categoriseByRules, so the preview matches what a single description would
 * actually get.
 * @param {number} userId @param {number} accountId
 */
export function previewRuleRerun(userId, accountId) {
  const rules = db
    .prepare('SELECT * FROM rules WHERE user_id = ? AND account_id = ? ORDER BY priority DESC, id')
    .all(userId, accountId);
  if (!rules.length) return [];

  const transactions = db
    .prepare(
      `SELECT t.id, t.date, t.description, t.amount, t.category_id,
              c.name AS category_name, c.color AS category_color
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.account_id = ?
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(userId, accountId);

  const categoriesById = new Map(
    db.prepare('SELECT id, name, color FROM categories WHERE user_id = ? AND account_id = ?').all(userId, accountId)
      .map((c) => [c.id, c])
  );

  const changes = [];
  for (const t of transactions) {
    const d = t.description.toLowerCase();
    const rule = rules.find((r) => d.includes(r.match_text.toLowerCase()));
    if (!rule || rule.category_id === t.category_id) continue;
    const next = categoriesById.get(rule.category_id);
    changes.push({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      from_category_id: t.category_id,
      from_category_name: t.category_name,
      from_category_color: t.category_color,
      to_category_id: rule.category_id,
      to_category_name: next?.name ?? '',
      to_category_color: next?.color ?? null
    });
  }
  return changes;
}

/**
 * Applies a specific set of {id, category_id} changes — the ones the user
 * approved from previewRuleRerun's diff — rather than re-deriving them, so
 * what gets saved is exactly what was shown.
 * @param {number} userId @param {{id:number, category_id:number}[]} changes
 * @returns {number}
 */
export function applyCategoryChanges(userId, changes) {
  if (!changes?.length) return 0;
  const stmt = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ?');
  let count = 0;
  tx(() => {
    for (const c of changes) count += stmt.run(c.category_id, c.id, userId).changes;
  });
  return count;
}

/** Preview which category a description would get from the current account's rules. */
export function categoriseByRules(userId, accountId, description) {
  if (!description) return null;
  const d = description.toLowerCase();
  const rules = db
    .prepare(
      'SELECT match_text, category_id FROM rules WHERE user_id = ? AND account_id = ? ORDER BY priority DESC, id'
    )
    .all(userId, accountId);
  for (const r of rules) if (d.includes(r.match_text.toLowerCase())) return r.category_id;
  return null;
}

/* ----------------------------------------------------------------------- budgets */

export function listBudgets(userId) {
  return db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
}

export function setBudget(userId, categoryId, amount) {
  db.prepare(
    `INSERT INTO budgets (user_id, category_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount`
  ).run(userId, categoryId, amount);
}

export function deleteBudget(userId, categoryId) {
  db.prepare('DELETE FROM budgets WHERE user_id = ? AND category_id = ?').run(userId, categoryId);
}

/** target vs actual vs remaining for each expense category in `month` (YYYY-MM), scoped to one account. */
export function budgetStatus(userId, month, accountId) {
  const af = accountFilter(accountId).sql.replace('t.account_id', 'account_id');
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.color, c.kind,
              b.amount AS target,
              COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.user_id = c.user_id AND t.category_id = c.id
                  AND substr(t.date, 1, 7) = @month ${af}
              ), 0) AS actual_signed
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = c.user_id
       WHERE c.user_id = @userId AND c.account_id = @accountId
       ORDER BY c.kind DESC, c.name`
    )
    .all({ userId, accountId, month, ...accountFilter(accountId).params });

  return rows.map((r) => {
    // savings are a net contribution, so a month with more withdrawn than paid
    // in has to read negative — Math.abs() would report it as money saved.
    // `|| 0` collapses the -0 that negating an empty month produces, which
    // would otherwise format as "-€0.00".
    const actual = r.kind === 'saving' ? -r.actual_signed || 0 : Math.abs(r.actual_signed);
    const target = r.target ?? null;
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      kind: r.kind,
      target,
      actual,
      remaining: target != null ? target - actual : null,
      pct: target ? Math.min(999, Math.round((actual / target) * 100)) : null
    };
  });
}

/**
 * Average monthly spend per expense category across all history.
 * total spent in the category / number of distinct months the user has any data.
 * @returns {{ id:number, name:string, average:number }[]}
 */
export function categoryMonthlyAverages(userId, accountId) {
  const af = accountFilter(accountId);
  const span = db
    .prepare(
      `SELECT COUNT(DISTINCT substr(date, 1, 7)) AS months FROM transactions t
       WHERE t.user_id = @userId ${af.sql}`
    )
    .get({ userId, ...af.params });
  const months = Math.max(1, span?.months ?? 1);
  const rows = db
    .prepare(
      `SELECT c.id, c.name,
              COALESCE(SUM(ABS(t.amount)), 0) AS total
       FROM categories c
       JOIN transactions t ON t.category_id = c.id AND t.user_id = c.user_id
       WHERE c.user_id = @userId AND c.account_id = @accountId AND c.kind = 'expense' ${af.sql}
       GROUP BY c.id`
    )
    .all({ userId, accountId, ...af.params });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    average: Math.round((r.total / months) * 100) / 100
  }));
}

/* -------------------------------------------------------------------- insights */

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Share of `month` (YYYY-MM) already elapsed — 1 for any month that has ended. */
function monthElapsed(month) {
  const now = new Date();
  const nowYm = ym(now);
  if (month < nowYm) return 1;
  if (month > nowYm) return 0;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.min(1, now.getDate() / days);
}

/** The middle value of `nums` (average of the two middle values for an even count). */
function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Every calendar month from `from` to `to` inclusive, as YYYY-MM. */
export function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  while (true) {
    const cur = `${y}-${String(m).padStart(2, '0')}`;
    if (cur > to) break;
    out.push(cur);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * A beginner-facing read of a period: what came in, went out and was put aside,
 * measured against the months *before* the period, plus the categories that
 * moved the most.
 *
 * "Usual" is the median across those earlier months, not the mean — one wildly
 * expensive or quiet month (a holiday, a one-off bill) would otherwise drag a
 * plain average toward it and make every other month look like a deviation.
 * The median holds steady against that kind of outlier.
 *
 * A single-month period is the plain case ("this month vs your usual"). A
 * month still in progress counts for the share of it elapsed, so a
 * half-finished month doesn't drag the baseline down.
 *
 * @param {number} userId
 * @param {string} from YYYY-MM
 * @param {string} to   YYYY-MM (inclusive)
 */
export function periodInsights(userId, from, to, accountId = null) {
  const nowYm = ym(new Date());
  const af = accountFilter(accountId);
  const savings = isSavingsAccount(userId, accountId);
  const notSpending = notSpendingSql(savings);
  const isSaving = isSavingSql(savings);
  const totals = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym,
              SUM(CASE WHEN t.amount > 0 AND ${notSpending} THEN t.amount ELSE 0 END) AS incoming,
              SUM(CASE WHEN t.amount < 0 AND ${notSpending} THEN -t.amount ELSE 0 END) AS outgoing,
              SUM(CASE WHEN ${isSaving} THEN -t.amount ELSE 0 END) AS saved
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId ${af.sql}
       GROUP BY ym`
    )
    .all({ userId, ...af.params });

  const inPeriod = totals.filter((r) => r.ym >= from && r.ym <= to);
  const before = totals.filter((r) => r.ym < from);
  const sum = (rows, pick) => rows.reduce((s, r) => s + pick(r), 0);

  const earned = sum(inPeriod, (r) => r.incoming);
  const spent = sum(inPeriod, (r) => r.outgoing);
  const saved = sum(inPeriod, (r) => r.saved);

  const partial = to >= nowYm;
  const single = from === to;
  const share = single && partial ? monthElapsed(from) : 1;

  // Scaling a lone month by days elapsed assumes spending is spread evenly,
  // which it isn't — rent lands on the 1st, salary near the end. In the first
  // quarter of a single month that noise swamps the signal, so hold back.
  const reason = !(earned || spent || saved)
    ? 'empty'
    : !before.length
      ? 'no-history'
      : single && partial && share < 0.25
        ? 'early'
        : 'ok';
  const comparable = reason === 'ok';

  // A single month's own "per month" figure is just that month, projected up
  // from whatever share of it has elapsed so far. Across several months
  // though, a plain mean is exactly the kind of figure one huge or tiny month
  // distorts — same reason "usual" below is a median, not a mean — so the
  // period's own typical month is a median across its complete months too. A
  // month still in progress can't be fractionally weighted into a median the
  // way it can a mean, so it's left out entirely rather than pro-rated.
  const n = Math.max(single ? share : 1, 0.01);
  const completeMonths = inPeriod.filter((r) => r.ym !== nowYm || !partial);
  const avg = single
    ? { earned: earned / n, spent: spent / n, saved: saved / n }
    : {
        earned: median(completeMonths.map((r) => r.incoming)),
        spent: median(completeMonths.map((r) => r.outgoing)),
        saved: median(completeMonths.map((r) => r.saved))
      };
  const bmedian = (pick) => median(before.map(pick));
  const baseline = comparable
    ? {
        months: before.length,
        // income and savings land in lumps, so a part-month can't be compared
        earned: single && partial ? null : bmedian((r) => r.incoming),
        spent: bmedian((r) => r.outgoing) * share,
        saved: single && partial ? null : bmedian((r) => r.saved)
      }
    : null;

  const catRows = db
    .prepare(
      `SELECT c.id, c.name, c.color, substr(t.date, 1, 7) AS ym, SUM(-t.amount) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId AND t.amount < 0 AND c.kind = 'expense' ${af.sql}
       GROUP BY c.id, ym`
    )
    .all({ userId, ...af.params });

  // per-category, per-month totals (zero-filled across each side), so both
  // "usual" and — across several months — the period's own figure can be a
  // median rather than a mean skewed by one odd month
  const beforeYms = before.map((r) => r.ym);
  const completeYms = completeMonths.map((r) => r.ym);
  const byCat = new Map();
  for (const r of catRows) {
    let e = byCat.get(r.id);
    if (!e) {
      e = { id: r.id, name: r.name, color: r.color, periodByMonth: new Map(), beforeByMonth: new Map() };
      byCat.set(r.id, e);
    }
    if (r.ym >= from && r.ym <= to) e.periodByMonth.set(r.ym, r.total);
    else if (r.ym < from) e.beforeByMonth.set(r.ym, r.total);
  }

  const movers = comparable
    ? [...byCat.values()]
        .map((e) => {
          const spent = single
            ? (e.periodByMonth.get(from) || 0) / n
            : median(completeYms.map((ym) => e.periodByMonth.get(ym) || 0));
          const usual = median(beforeYms.map((ym) => e.beforeByMonth.get(ym) || 0)) * share;
          return { id: e.id, name: e.name, color: e.color, spent, usual, delta: spent - usual };
        })
        .filter((e) => Math.abs(e.delta) >= 1 && (e.spent >= 1 || e.usual >= 1))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5)
    : [];

  return {
    from,
    to,
    single,
    months: inPeriod.length,
    partial,
    share,
    comparable,
    reason,
    earned,
    spent,
    saved,
    kept: earned - spent,
    rate: earned > 0 ? Math.round(((earned - spent) / earned) * 100) : null,
    avg,
    baseline,
    movers
  };
}

/**
 * Per-month, per-category totals for the stacked chart, income and spending
 * only (savings have their own card). Amounts are positive magnitudes.
 *
 * Bucketed by the transaction's own sign, not by the category's kind — a
 * category only decides its *name*, never whether a transaction lands in the
 * "in" or "out" bar. That matches periodInsights' "Came in"/"Went out" cards
 * above this chart, which do the same; keying off kind instead meant a
 * transaction whose sign disagreed with its category's kind (a refund into an
 * expense-kind category like "Shopping", a correction on an income-kind one)
 * was silently dropped from both bars here while still counting up there.
 * An uncategorised transaction is folded into its own "Uncategorised" bucket
 * (id -1) the same way. A 'saving'-kind category is no exception — a deposit
 * is income, a withdrawal is spending, exactly like every other category, on
 * every account alike.
 */
export function monthlyCategoryTotals(userId, from, to, accountId = null) {
  const af = accountFilter(accountId);
  return db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym,
              COALESCE(c.id, -1) AS id,
              COALESCE(c.name, 'Uncategorised') AS name,
              c.color AS color,
              CASE WHEN t.amount > 0 THEN 'income' ELSE 'expense' END AS kind,
              SUM(ABS(t.amount)) AS total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId
         AND substr(t.date, 1, 7) BETWEEN @from AND @to
         AND (c.id IS NULL OR c.kind IN ('income', 'expense', 'saving'))
         ${af.sql}
       GROUP BY ym, COALESCE(c.id, -1), CASE WHEN t.amount > 0 THEN 'income' ELSE 'expense' END`
    )
    .all({ userId, from, to, ...af.params });
}

/**
 * Everything the savings views need: the running total put aside, and a
 * month-by-month series carrying both that month's contribution and the balance
 * built up to it.
 *
 * Pass a number for the last N months (dashboard) or `{ from, to }` for a
 * range (reports). `total` is the balance at the end of the window.
 *
 * These are *net contributions*, never an account balance — Tally has no sight
 * of interest or market growth, and a withdrawal shows up as a negative
 * contribution rather than being hidden. Label it "put aside", not "savings".
 *
 * On a dedicated savings account, `saving`-kind transactions already count as
 * ordinary income/expense for that account (see isSavingsAccount()), so
 * tracking them again here as a separate "saved" figure would double-count
 * them — this reports unconfigured for that account instead.
 */
export function savingsSummary(userId, window = 12, accountId = null) {
  if (isSavingsAccount(userId, accountId)) {
    return { total: 0, inWindow: 0, series: [], months: 0, configured: false };
  }
  const af = accountFilter(accountId);
  const rows = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym, SUM(-t.amount) AS saved
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId AND c.kind = 'saving' ${af.sql}
       GROUP BY ym ORDER BY ym`
    )
    .all({ userId, ...af.params });

  let running = 0;
  const all = rows.map((r) => {
    running += r.saved;
    return { ym: r.ym, saved: r.saved, total: running };
  });

  let series;
  let total;
  if (typeof window === 'number') {
    series = all.slice(-window);
    total = running;
  } else {
    series = all.filter((p) => p.ym >= window.from && p.ym <= window.to);
    const upTo = all.filter((p) => p.ym <= window.to);
    total = upTo.length ? upTo[upTo.length - 1].total : 0;
  }

  const configured = accountId
    ? db
        .prepare(`SELECT 1 AS ok FROM categories WHERE user_id = ? AND account_id = ? AND kind = 'saving' LIMIT 1`)
        .get(userId, accountId)
    : db.prepare(`SELECT 1 AS ok FROM categories WHERE user_id = ? AND kind = 'saving' LIMIT 1`).get(userId);

  return {
    total,
    inWindow: series.reduce((s, p) => s + p.saved, 0),
    series,
    months: rows.length,
    configured: !!configured
  };
}

/** Cached AI summary for a report scope, or null when the numbers have moved on. */
export function getInsight(userId, scope, fingerprint) {
  const row = db
    .prepare('SELECT summary, fingerprint FROM insights WHERE user_id = ? AND scope = ?')
    .get(userId, scope);
  return row && row.fingerprint === fingerprint ? row.summary : null;
}

export function setInsight(userId, scope, fingerprint, summary) {
  db.prepare(
    `INSERT INTO insights (user_id, scope, fingerprint, summary) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, scope) DO UPDATE SET fingerprint = excluded.fingerprint,
       summary = excluded.summary, created_at = datetime('now')`
  ).run(userId, scope, fingerprint, summary);
}

/* ------------------------------------------------------------------- logos */

/**
 * Resolve a favicon-able domain guess for each description, reusing a
 * cached guess (including a cached "nothing found") for anything seen
 * before, and computing + caching the rest in one batch.
 * @param {string[]} descriptions
 * @returns {Map<string, string|null>} keyed by the *original* description
 */
export function getLogoDomains(descriptions) {
  const byKey = new Map(); // logoKey -> original description(s)
  for (const d of descriptions) {
    const key = logoKey(d);
    if (key && !byKey.has(key)) byKey.set(key, d);
  }
  if (!byKey.size) return new Map();

  const keys = [...byKey.keys()];
  const placeholders = keys.map(() => '?').join(',');
  const cached = db
    .prepare(`SELECT key, domain FROM merchant_logos WHERE key IN (${placeholders})`)
    .all(...keys);
  const domainByKey = new Map(cached.map((r) => [r.key, r.domain]));

  const missing = keys.filter((k) => !domainByKey.has(k));
  if (missing.length) {
    const insert = db.prepare('INSERT OR IGNORE INTO merchant_logos (key, domain) VALUES (?, ?)');
    tx(() => {
      for (const key of missing) {
        const domain = guessDomain(byKey.get(key));
        domainByKey.set(key, domain);
        insert.run(key, domain);
      }
    });
  }

  const result = new Map();
  for (const d of descriptions) result.set(d, domainByKey.get(logoKey(d)) ?? null);
  return result;
}

/**
 * Manually pin a description's logo to a specific domain (or explicitly to
 * "no logo" when domain is null) — overrides whatever guessDomain() came up
 * with. Applies to every transaction sharing this description, same as the
 * automatic guess already does.
 */
export function setLogoDomain(description, domain) {
  const key = logoKey(description);
  if (!key) return;
  db.prepare(
    `INSERT INTO merchant_logos (key, domain) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET domain = excluded.domain`
  ).run(key, domain || null);
}

/** Forgets a cached guess (manual or automatic) so it's recomputed on next use. */
export function resetLogoDomain(description) {
  const key = logoKey(description);
  if (!key) return;
  db.prepare('DELETE FROM merchant_logos WHERE key = ?').run(key);
}
