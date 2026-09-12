import { json, error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { aiEnabled } from '$lib/server/ai-settings.js';
import {
  periodInsights,
  listAccounts,
  getInsight,
  setInsight,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { summarisePeriod, SUMMARY_VERSION } from '$lib/server/ai.js';

const YM = /^\d{4}-\d{2}$/;

/**
 * The numbers are recomputed here rather than taken from the request, so a
 * client cannot talk the model into narrating figures that aren't its own.
 * The result is cached against a fingerprint of those numbers, so viewing the
 * page repeatedly costs nothing.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, locals }) {
  if (!locals.user) throw error(401);
  if (!aiEnabled() || !getUserAiCategorise(locals.user.id))
    throw error(403, 'AI summaries are not enabled for your account.');

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Bad request body.');
  }
  let from = String(body?.from || '');
  let to = String(body?.to || '');
  if (!YM.test(from) || !YM.test(to)) throw error(400, 'A period (YYYY-MM to YYYY-MM) is required.');
  if (from > to) [from, to] = [to, from];

  // only trust an account id that actually belongs to this user
  const rawAccount = String(body?.accountId || '');
  const accounts = listAccounts(locals.user.id);
  const accountId =
    rawAccount === 'none' || accounts.some((a) => String(a.id) === rawAccount) ? rawAccount : null;

  const insights = periodInsights(locals.user.id, from, to, accountId);
  if (!insights.earned && !insights.spent && !insights.saved) return json({ summary: null });

  const fingerprint = createHash('sha1')
    .update(
      JSON.stringify([
        // the prompt version is in here so a reworded summary regenerates
        SUMMARY_VERSION,
        Math.round(insights.earned),
        Math.round(insights.spent),
        Math.round(insights.saved),
        insights.movers.map((m) => [m.id, Math.round(m.spent), Math.round(m.usual)])
      ])
    )
    .digest('hex');

  // a different account filter is a different cached summary
  const scope = `${from}:${to}${accountId ? `:${accountId}` : ''}`;
  const cached = getInsight(locals.user.id, scope, fingerprint);
  if (cached) return json({ summary: cached, cached: true });

  try {
    const r = await summarisePeriod(insights, locals.user.currency);
    if (!r.text) return json({ summary: null });
    setInsight(locals.user.id, scope, fingerprint, r.text);
    return json({ summary: r.text, cached: false, costUsd: r.costUsd });
  } catch (e) {
    throw error(400, e?.message || 'the request failed');
  }
}
