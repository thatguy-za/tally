import { aiEnabled } from '$lib/server/ai-settings.js';
import {
  listMonths,
  listCategories,
  monthRange,
  periodInsights,
  monthlyCategoryTotals,
  savingsSummary,
  getUserAiCategorise,
  householdMemberTotals,
  HOUSEHOLD
} from '$lib/server/queries.js';
import { servedOverHttps } from '$lib/server/auth.js';
import { PERIOD_COOKIE } from '$lib/server/period-cookie.js';

const YM = /^\d{4}-\d{2}$/;
const MAX_SERIES = 7; // beyond this, categories fold into "Other"

/** `n` months before `ym`, as YYYY-MM. */
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Rank a kind's categories by their total over the period, keep the biggest
 * and fold the rest into one "Other" slot — carrying the folded-away
 * categories in `.folded` so the chart can still expand and pick any of them
 * individually. Order is fixed for the whole period, so a category keeps its
 * place in the stack month to month.
 */
function seriesFor(rows, kind) {
  const totals = new Map();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const e = totals.get(r.id) || { id: r.id, name: r.name, color: r.color, total: 0 };
    e.total += r.total;
    totals.set(r.id, e);
  }
  const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
  const pick = ({ id, name, color }) => ({ id, name, color });
  const kept = ranked.slice(0, MAX_SERIES).map(pick);
  const folded = ranked.slice(MAX_SERIES).map(pick);
  if (folded.length) kept.push({ id: 'other', name: `Other (${folded.length})`, color: null, folded });
  return kept;
}

/** Each member's share over the period, with members who shared nothing listed at zero. */
function memberTotalsFor(household, userId, from, to) {
  const spent = new Map(householdMemberTotals(userId, from, to).map((r) => [r.id, r]));
  return household.members
    .map((m) => ({ id: m.id, username: m.username, you: m.you, total: spent.get(m.id)?.total ?? 0, count: spent.get(m.id)?.count ?? 0 }))
    .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));
}

/** @type {import('./$types').PageServerLoad} */
export function load(event) {
  const { locals, url, cookies } = event;
  const userId = locals.user.id;
  // the household view runs the same queries against its own shared slice of
  // everyone's spending (see HOUSEHOLD in queries.js), so nothing below changes
  const household = locals.view === 'household' && locals.household;
  const accountId = household ? HOUSEHOLD : locals.accountId;
  const months = listMonths(userId, accountId); // newest first
  const latest = months[0] || shiftMonth(new Date().toISOString().slice(0, 7), 0);
  const earliest = months[months.length - 1] || latest;

  // default: the last twelve months, clipped to where the data actually starts
  const defTo = latest;
  const defFrom = [earliest, shiftMonth(latest, -11)].sort()[1];

  // an explicit range in the URL wins; otherwise fall back to whatever range
  // this user picked last time, remembered in a cookie, before the computed default
  const saved = cookies.get(PERIOD_COOKIE);
  const [savedFrom, savedTo] = saved ? saved.split(':') : [];

  let from = url.searchParams.get('from') || savedFrom || defFrom;
  let to = url.searchParams.get('to') || savedTo || defTo;
  if (!YM.test(from)) from = defFrom;
  if (!YM.test(to)) to = defTo;
  if (from > to) [from, to] = [to, from];

  cookies.set(PERIOD_COOKIE, `${from}:${to}`, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: servedOverHttps(event),
    maxAge: 60 * 60 * 24 * 365
  });

  // rows are already bucketed into 'income'/'expense' by sign — see
  // monthlyCategoryTotals. `values` keeps each category's own id (never
  // folded) so the chart can still pick an "Other" member individually —
  // seriesFor()'s `.folded` list is what decides the default grouping.
  const rows = monthlyCategoryTotals(userId, from, to, accountId);
  const income = seriesFor(rows, 'income');
  const expense = seriesFor(rows, 'expense');
  const values = {};
  for (const ym of monthRange(from, to)) values[ym] = { income: {}, expense: {} };
  for (const r of rows) {
    const bucket = values[r.ym][r.kind];
    bucket[r.id] = (bucket[r.id] || 0) + r.total;
  }

  return {
    from,
    to,
    months,
    categories: listCategories(userId, accountId),
    insights: periodInsights(userId, from, to, accountId),
    chart: {
      months: monthRange(from, to),
      income,
      expense,
      values
    },
    // savings and the AI summary are about one real account
    savings: household ? null : savingsSummary(userId, { from, to }, accountId),
    aiSummary: !household && aiEnabled() && getUserAiCategorise(userId),
    currency: locals.user.currency,
    household: household ? { name: household.name, members: household.members.length, memberTotals: memberTotalsFor(household, userId, from, to) } : null
  };
}
