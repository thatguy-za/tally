import { db, tx } from './db.js';

/* ------------------------------------------------------------------ categories */

export function listCategories(userId) {
  return db
    .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY kind DESC, name')
    .all(userId);
}

export function createCategory(userId, name, kind, color) {
  return db
    .prepare('INSERT INTO categories (user_id, name, kind, color) VALUES (?, ?, ?, ?)')
    .run(userId, name.trim(), kind === 'income' ? 'income' : 'expense', color || '#64748b');
}

export function deleteCategory(userId, id) {
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, userId);
}

/* ---------------------------------------------------------------- transactions */

export function listMonths(userId) {
  return db
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) AS ym FROM transactions
       WHERE user_id = ? ORDER BY ym DESC`
    )
    .all(userId)
    .map((r) => r.ym);
}

export function listTransactions(userId, f = {}) {
  const where = ['t.user_id = @userId'];
  const params = { userId };
  if (f.month) { where.push('substr(t.date, 1, 7) = @month'); params.month = f.month; }
  if (f.dateFrom) { where.push('t.date >= @dateFrom'); params.dateFrom = f.dateFrom; }
  if (f.dateTo) { where.push('t.date <= @dateTo'); params.dateTo = f.dateTo; }
  if (f.categoryId === 'none') where.push('t.category_id IS NULL');
  else if (f.categoryId) { where.push('t.category_id = @categoryId'); params.categoryId = f.categoryId; }
  if (f.search) { where.push('lower(t.description) LIKE @search'); params.search = `%${String(f.search).toLowerCase()}%`; }
  if (f.amountMin != null) { where.push('abs(t.amount) >= @amountMin'); params.amountMin = f.amountMin; }
  if (f.amountMax != null) { where.push('abs(t.amount) <= @amountMax'); params.amountMax = f.amountMax; }
  if (f.direction === 'in') where.push('t.amount >= 0');
  else if (f.direction === 'out') where.push('t.amount < 0');

  return db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.color AS category_color, c.kind AS category_kind
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(params);
}

export function addTransaction(userId, { date, description, amount, category_id, recurring_id }) {
  return db
    .prepare(
      `INSERT INTO transactions (user_id, date, description, amount, category_id, recurring_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, date, description || '', amount, category_id || null, recurring_id || null);
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
    `INSERT INTO transactions (user_id, date, description, amount, category_id)
     VALUES (?, ?, ?, ?, ?)`
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
      stmt.run(userId, r.date, r.description || '', r.amount, r.category_id || null);
      inserted++;
    }
  });
  return { inserted, duplicates };
}

export function updateTransaction(userId, id, fields) {
  const allowed = ['date', 'description', 'amount', 'category_id'];
  const sets = [];
  const params = { id, userId };
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = @${k}`); params[k] = fields[k]; }
  }
  if (!sets.length) return;
  db.prepare(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`
  ).run(params);
}

export function deleteTransaction(userId, id) {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
}

export function bulkCategorise(userId, ids, categoryId) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(
      `UPDATE transactions SET category_id = ?
       WHERE user_id = ? AND id IN (${placeholders})`
    )
    .run(categoryId || null, userId, ...ids);
  return Number(info.changes);
}

export function bulkDelete(userId, ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`DELETE FROM transactions WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
  return Number(info.changes);
}

export function uncategorisedCount(userId) {
  return Number(
    db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND category_id IS NULL')
      .get(userId).n
  );
}

/* --------------------------------------------------------------------- reports */

export function monthlyTotals(userId, months = 12) {
  return db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS incoming,
              SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS outgoing
       FROM transactions WHERE user_id = ?
       GROUP BY ym ORDER BY ym DESC LIMIT ?`
    )
    .all(userId, months);
}

export function categoryBreakdown(userId, month) {
  const params = { userId };
  let monthFilter = '';
  if (month) { monthFilter = 'AND substr(t.date, 1, 7) = @month'; params.month = month; }
  return db
    .prepare(
      `SELECT c.id AS id,
              COALESCE(c.name, 'Uncategorised') AS name,
              COALESCE(c.color, '#94a3b8') AS color,
              COALESCE(c.kind, 'expense') AS kind,
              SUM(t.amount) AS total,
              COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId ${monthFilter}
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
export function categorySparkData(userId, months = 6) {
  const now = new Date();
  const list = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    list.push(d.toISOString().slice(0, 7));
  }
  const since = list[0] + '-01';
  const rows = db
    .prepare(
      `SELECT category_id, substr(date, 1, 7) AS ym, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ? AND date >= ? AND category_id IS NOT NULL
       GROUP BY category_id, ym`
    )
    .all(userId, since);

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

export function listRules(userId) {
  return db
    .prepare(
      `SELECT r.*, c.name AS category_name, c.color AS category_color
       FROM rules r JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? ORDER BY r.priority DESC, r.id`
    )
    .all(userId);
}

export function createRule(userId, matchText, categoryId, priority = 0) {
  return db
    .prepare(
      'INSERT INTO rules (user_id, match_text, category_id, priority) VALUES (?, ?, ?, ?)'
    )
    .run(userId, matchText.trim(), categoryId, priority);
}

export function deleteRule(userId, id) {
  db.prepare('DELETE FROM rules WHERE id = ? AND user_id = ?').run(id, userId);
}

/**
 * Apply all of a user's rules.
 * @param {number} userId
 * @param {{ onlyUncategorised?: boolean, ids?: number[] }} opts
 * @returns {number} number of transactions updated
 */
export function applyRules(userId, { onlyUncategorised = true, ids = null } = {}) {
  const rules = db
    .prepare('SELECT * FROM rules WHERE user_id = ? ORDER BY priority DESC, id')
    .all(userId);
  let changed = 0;
  tx(() => {
    for (const rule of rules) {
      const params = {
        userId,
        categoryId: rule.category_id,
        match: `%${rule.match_text.toLowerCase()}%`
      };
      let sql = `UPDATE transactions SET category_id = @categoryId
                 WHERE user_id = @userId AND lower(description) LIKE @match`;
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

/** Preview which category a description would get from the rules (used on manual/CSV entry). */
export function categoriseByRules(userId, description) {
  if (!description) return null;
  const d = description.toLowerCase();
  const rules = db
    .prepare('SELECT match_text, category_id FROM rules WHERE user_id = ? ORDER BY priority DESC, id')
    .all(userId);
  for (const r of rules) if (d.includes(r.match_text.toLowerCase())) return r.category_id;
  return null;
}

/* ------------------------------------------------------------------- recurring */

export function advanceDate(dateStr, frequency, n = 1) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (frequency === 'weekly') base.setUTCDate(base.getUTCDate() + 7 * n);
  else if (frequency === 'yearly') base.setUTCFullYear(base.getUTCFullYear() + n);
  else {
    // monthly: keep day-of-month, clamp to end of shorter months
    const targetMonth = base.getUTCMonth() + n;
    const targetYear = base.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate();
    base.setUTCFullYear(targetYear, normMonth, Math.min(d, lastDay));
  }
  return base.toISOString().slice(0, 10);
}

export function listRecurring(userId) {
  return db
    .prepare(
      `SELECT r.*, c.name AS category_name, c.color AS category_color
       FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? ORDER BY r.active DESC, r.next_date`
    )
    .all(userId);
}

export function createRecurring(userId, r) {
  return db
    .prepare(
      `INSERT INTO recurring
         (user_id, description, amount, category_id, frequency, interval_n, next_date, end_date, auto_post)
       VALUES (@userId, @description, @amount, @category_id, @frequency, @interval_n, @next_date, @end_date, @auto_post)`
    )
    .run({
      userId,
      description: r.description || '',
      amount: r.amount,
      category_id: r.category_id || null,
      frequency: r.frequency || 'monthly',
      interval_n: r.interval_n || 1,
      next_date: r.next_date,
      end_date: r.end_date || null,
      auto_post: r.auto_post ? 1 : 0
    });
}

export function updateRecurring(userId, id, fields) {
  const allowed = [
    'description', 'amount', 'category_id', 'frequency',
    'interval_n', 'next_date', 'end_date', 'auto_post', 'active'
  ];
  const sets = [];
  const params = { id, userId };
  for (const k of allowed) if (k in fields) { sets.push(`${k} = @${k}`); params[k] = fields[k]; }
  if (!sets.length) return;
  db.prepare(`UPDATE recurring SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`).run(params);
}

export function deleteRecurring(userId, id) {
  db.prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').run(id, userId);
}

/** Recurring entries with next_date on or before `asOf` (default today). */
export function dueRecurring(userId, asOf = new Date().toISOString().slice(0, 10)) {
  return db
    .prepare(
      `SELECT r.*, c.name AS category_name, c.color AS category_color
       FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? AND r.active = 1 AND r.next_date <= ?
         AND (r.end_date IS NULL OR r.next_date <= r.end_date)
       ORDER BY r.next_date`
    )
    .all(userId, asOf);
}

/** Post one occurrence of a recurring entry and roll next_date forward. */
export function postRecurringOccurrence(userId, id) {
  const r = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?').get(id, userId);
  if (!r) return null;
  return tx(() => {
    addTransaction(userId, {
      date: r.next_date,
      description: r.description,
      amount: r.amount,
      category_id: r.category_id,
      recurring_id: r.id
    });
    const next = advanceDate(r.next_date, r.frequency, r.interval_n);
    const active = r.end_date && next > r.end_date ? 0 : 1;
    db.prepare('UPDATE recurring SET next_date = ?, active = ? WHERE id = ?').run(next, active, r.id);
    return { date: r.next_date, next };
  });
}

export function skipRecurringOccurrence(userId, id) {
  const r = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?').get(id, userId);
  if (!r) return;
  const next = advanceDate(r.next_date, r.frequency, r.interval_n);
  const active = r.end_date && next > r.end_date ? 0 : 1;
  db.prepare('UPDATE recurring SET next_date = ?, active = ? WHERE id = ?').run(next, active, r.id);
}

/** Auto-post everything currently due that is flagged auto_post. Returns count posted. */
export function runAutoPost(userId) {
  const due = dueRecurring(userId).filter((r) => r.auto_post);
  let posted = 0;
  for (const r of due) {
    // guard against a huge backlog: cap at 24 catch-up postings per entry
    for (let i = 0; i < 24; i++) {
      const fresh = db.prepare('SELECT next_date, active FROM recurring WHERE id = ?').get(r.id);
      if (!fresh.active || fresh.next_date > new Date().toISOString().slice(0, 10)) break;
      postRecurringOccurrence(userId, r.id);
      posted++;
    }
  }
  return posted;
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

/** target vs actual vs remaining for each expense category in `month` (YYYY-MM). */
export function budgetStatus(userId, month) {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.color, c.kind,
              b.amount AS target,
              COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.user_id = c.user_id AND t.category_id = c.id
                  AND substr(t.date, 1, 7) = @month
              ), 0) AS actual_signed
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = c.user_id
       WHERE c.user_id = @userId
       ORDER BY c.kind DESC, c.name`
    )
    .all({ userId, month });

  return rows.map((r) => {
    const actual = Math.abs(r.actual_signed);
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
