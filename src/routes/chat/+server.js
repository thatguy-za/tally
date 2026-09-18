import { json, error } from '@sveltejs/kit';
import { aiEnabled } from '$lib/server/ai-settings.js';
import { getUserAiCategorise } from '$lib/server/queries.js';
import { chatWithData } from '$lib/server/ai.js';

const MAX_HISTORY = 12; // messages kept, oldest dropped first — bounds cost per request
const MAX_MESSAGE_LEN = 2000;

/**
 * One turn of "chat with your data". The client sends the whole visible
 * conversation each time (nothing is persisted server-side); the server
 * re-derives every figure itself via tools scoped to the signed-in user, so
 * the client can never talk the model into reporting someone else's numbers.
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request, locals }) {
  if (!locals.user) throw error(401);
  if (!aiEnabled() || !getUserAiCategorise(locals.user.id))
    throw error(403, 'Chat is not enabled for your account.');

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Bad request body.');
  }

  const history = Array.isArray(body?.history) ? body.history : [];
  const clean = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_LEN) }));

  if (!clean.length || clean[clean.length - 1].role !== 'user')
    throw error(400, 'A user message is required.');

  try {
    const r = await chatWithData(locals.user.id, clean, locals.user.currency);
    return json({ text: r.text, charts: r.charts, costUsd: r.costUsd });
  } catch (e) {
    throw error(400, e?.message || 'the request failed');
  }
}
