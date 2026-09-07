import { json, error } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { aiEnabled } from '$lib/server/ai-settings.js';
import {
  monthInsights,
  getInsight,
  setInsight,
  getUserAiCategorise
} from '$lib/server/queries.js';
import { summariseMonth } from '$lib/server/ai.js';

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
  const month = String(body?.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw error(400, 'A month (YYYY-MM) is required.');

  const insights = monthInsights(locals.user.id, month);
  if (!insights.earned && !insights.spent) return json({ summary: null });

  const fingerprint = createHash('sha1')
    .update(
      JSON.stringify([
        Math.round(insights.earned),
        Math.round(insights.spent),
        insights.movers.map((m) => [m.id, Math.round(m.spent), Math.round(m.usual)])
      ])
    )
    .digest('hex');

  const cached = getInsight(locals.user.id, month, fingerprint);
  if (cached) return json({ summary: cached, cached: true });

  try {
    const r = await summariseMonth(insights, locals.user.currency);
    if (!r.text) return json({ summary: null });
    setInsight(locals.user.id, month, fingerprint, r.text);
    return json({ summary: r.text, cached: false, costUsd: r.costUsd });
  } catch (e) {
    throw error(400, e?.message || 'the request failed');
  }
}
