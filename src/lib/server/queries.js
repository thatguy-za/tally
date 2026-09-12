import { db, tx } from './db.js';

/* ------------------------------------------------------------------ categories */

export function listCategories(userId) {
  return db
    .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY kind DESC, name')
    .all(userId);
}

/**
 * `saving` is money kept rather than spent — it is left out of every "spent"
 * figure and reported on its own.
 */
export const CATEGORY_KINDS = ['income', 'expense', 'saving'];
export const normaliseKind = (k) => (CATEGORY_KINDS.includes(k) ? k : 'expense');

export function createCategory(userId, name, kind, color) {
  return db
    .prepare('INSERT INTO categories (user_id, name, kind, color) VALUES (?, ?, ?, ?)')
    .run(userId, name.trim(), normaliseKind(kind), color || '#64748b');
}

/** Change what a category *is* — the only way to mark one as savings after the fact. */
export function setCategoryKind(userId, id, kind) {
  db.prepare('UPDATE categories SET kind = ? WHERE id = ? AND user_id = ?').run(
    normaliseKind(kind),
    id,
    userId
  );
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
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(params);
}

export function addTransaction(userId, { date, description, amount, category_id }) {
  return db
    .prepare(
      `INSERT INTO transactions (user_id, date, description, amount, category_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, date, description || '', amount, category_id || null);
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

// AI categorisation is opt-out — on unless the user has explicitly turned it off.
export function setUserAiCategorise(userId, on) {
  db.prepare('UPDATE users SET ai_off = ? WHERE id = ?').run(on ? 0 : 1, userId);
}

export function getUserAiCategorise(userId) {
  return !db.prepare('SELECT ai_off FROM users WHERE id = ?').get(userId)?.ai_off;
}

export function uncategorisedCount(userId) {
  return Number(
    db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND category_id IS NULL')
      .get(userId).n
  );
}

/* --------------------------------------------------------------------- reports */

// SQL fragments for the saving/not-saving split; uncategorised counts as spending.
const IS_SAVING = `COALESCE(c.kind, 'expense') = 'saving'`;
const NOT_SAVING = `COALESCE(c.kind, 'expense') != 'saving'`;

/**
 * Per-month in / out / saved. Money in a `saving` category is money kept, so it
 * is excluded from `outgoing` and reported as `saved` — a net contribution, so
 * a withdrawal shows up negative rather than being hidden.
 */
export function monthlyTotals(userId, months = 12) {
  return db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym,
              SUM(CASE WHEN t.amount > 0 AND ${NOT_SAVING} THEN t.amount ELSE 0 END) AS incoming,
              SUM(CASE WHEN t.amount < 0 AND ${NOT_SAVING} THEN -t.amount ELSE 0 END) AS outgoing,
              SUM(CASE WHEN ${IS_SAVING} THEN -t.amount ELSE 0 END) AS saved
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
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
export function categoryMonthlyAverages(userId) {
  const span = db
    .prepare(
      `SELECT COUNT(DISTINCT substr(date, 1, 7)) AS months FROM transactions WHERE user_id = ?`
    )
    .get(userId);
  const months = Math.max(1, span?.months ?? 1);
  const rows = db
    .prepare(
      `SELECT c.id, c.name,
              COALESCE(SUM(ABS(t.amount)), 0) AS total
       FROM categories c
       JOIN transactions t ON t.category_id = c.id AND t.user_id = c.user_id
       WHERE c.user_id = @userId AND c.kind = 'expense'
       GROUP BY c.id`
    )
    .all({ userId });
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
 * measured as a monthly average against the months *before* the period, plus the
 * categories whose monthly average moved the most.
 *
 * A single-month period is the plain case ("this month vs your usual"). For
 * longer periods the same maths runs on averages, so "usual" means the months
 * leading up to the period. A month still in progress counts for the share of
 * it elapsed, so a half-finished month doesn't drag the average down.
 *
 * @param {number} userId
 * @param {string} from YYYY-MM
 * @param {string} to   YYYY-MM (inclusive)
 */
export function periodInsights(userId, from, to) {
  const nowYm = ym(new Date());
  const totals = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym,
              SUM(CASE WHEN t.amount > 0 AND ${NOT_SAVING} THEN t.amount ELSE 0 END) AS incoming,
              SUM(CASE WHEN t.amount < 0 AND ${NOT_SAVING} THEN -t.amount ELSE 0 END) AS outgoing,
              SUM(CASE WHEN ${IS_SAVING} THEN -t.amount ELSE 0 END) AS saved
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?
       GROUP BY ym`
    )
    .all(userId);

  const inPeriod = totals.filter((r) => r.ym >= from && r.ym <= to);
  const before = totals.filter((r) => r.ym < from);
  const sum = (rows, pick) => rows.reduce((s, r) => s + pick(r), 0);

  const earned = sum(inPeriod, (r) => r.incoming);
  const spent = sum(inPeriod, (r) => r.outgoing);
  const saved = sum(inPeriod, (r) => r.saved);

  // months that count towards the average: those with data, the current one
  // only for the share of it that has happened
  const partial = to >= nowYm;
  const effectiveMonths = inPeriod.reduce((s, r) => s + (r.ym === nowYm ? monthElapsed(r.ym) : 1), 0);
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

  const n = Math.max(effectiveMonths, 0.01);
  const avg = { earned: earned / n, spent: spent / n, saved: saved / n };
  const bmean = (pick) => sum(before, pick) / before.length;
  const baseline = comparable
    ? {
        months: before.length,
        // income and savings land in lumps, so a part-month can't be compared
        earned: single && partial ? null : bmean((r) => r.incoming),
        spent: bmean((r) => r.outgoing) * share,
        saved: single && partial ? null : bmean((r) => r.saved)
      }
    : null;

  const catRows = db
    .prepare(
      `SELECT c.id, c.name, c.color, substr(t.date, 1, 7) AS ym, SUM(-t.amount) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.amount < 0 AND c.kind = 'expense'
       GROUP BY c.id, ym`
    )
    .all(userId);

  const byCat = new Map();
  for (const r of catRows) {
    let e = byCat.get(r.id);
    if (!e) {
      e = { id: r.id, name: r.name, color: r.color, period: 0, before: 0 };
      byCat.set(r.id, e);
    }
    if (r.ym >= from && r.ym <= to) e.period += r.total;
    else if (r.ym < from) e.before += r.total;
  }

  const movers = comparable
    ? [...byCat.values()]
        .map((e) => {
          const spent = e.period / n;
          const usual = (e.before / before.length) * share;
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
 */
export function monthlyCategoryTotals(userId, from, to) {
  return db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym, c.id, c.name, c.color, c.kind,
              SUM(ABS(t.amount)) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = @userId AND c.kind IN ('income', 'expense')
         AND substr(t.date, 1, 7) BETWEEN @from AND @to
         AND ((c.kind = 'income' AND t.amount > 0) OR (c.kind = 'expense' AND t.amount < 0))
       GROUP BY ym, c.id`
    )
    .all({ userId, from, to });
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
 */
export function savingsSummary(userId, window = 12) {
  const rows = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS ym, SUM(-t.amount) AS saved
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND c.kind = 'saving'
       GROUP BY ym ORDER BY ym`
    )
    .all(userId);

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

  const configured = db
    .prepare(`SELECT 1 AS ok FROM categories WHERE user_id = ? AND kind = 'saving' LIMIT 1`)
    .get(userId);

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
