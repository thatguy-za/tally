import { json, error } from '@sveltejs/kit';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { getUserAiCategorise } from '$lib/server/queries.js';
import { suggestCategoriesForRows } from '$lib/server/ai.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  if (!locals.user) throw error(401);
  if (!aiEnabled() || !getUserAiCategorise(locals.user.id))
    throw error(403, 'AI categorisation is not enabled for your account.');

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Bad request body.');
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return json({ suggestions: {}, considered: 0, costUsd: 0 });

  try {
    const r = await suggestCategoriesForRows(locals.user.id, rows);
    return json({ suggestions: r.suggestions, considered: r.considered, costUsd: r.costUsd });
  } catch (e) {
    throw error(400, `AI suggestions failed: ${e?.message || 'unknown error'}`);
  }
}
