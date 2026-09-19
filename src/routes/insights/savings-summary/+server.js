import { json, error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { savingsSummary, getInsight, setInsight, getUserAiCategorise } from '$lib/server/queries.js';
import { summariseSavings, SAVINGS_SUMMARY_VERSION } from '$lib/server/ai.js';

const YM = /^\d{4}-\d{2}$/;

/**
 * Same shape as /insights/summary: numbers are recomputed here (never taken
 * from the request), and the result is cached against a fingerprint of them.
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

  const accountId = locals.accountId;
  const s = savingsSummary(locals.user.id, { from, to }, accountId);
  if (!s.series.length) return json({ summary: null });

  const fingerprint = createHash('sha1')
    .update(
      JSON.stringify([SAVINGS_SUMMARY_VERSION, s.series.map((p) => [p.ym, Math.round(p.saved)])])
    )
    .digest('hex');

  const scope = `savings:${from}:${to}${accountId ? `:${accountId}` : ''}`;
  const cached = getInsight(locals.user.id, scope, fingerprint);
  if (cached) return json({ summary: cached, cached: true });

  try {
    const r = await summariseSavings(s.series, locals.user.currency);
    if (!r.text) return json({ summary: null });
    setInsight(locals.user.id, scope, fingerprint, r.text);
    return json({ summary: r.text, cached: false, costUsd: r.costUsd });
  } catch (e) {
    throw error(400, e?.message || 'the request failed');
  }
}
