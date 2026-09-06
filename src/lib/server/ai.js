import Anthropic from '@anthropic-ai/sdk';
import { db, tx } from './db.js';
import { getApiKey, getModel, AI_MODELS } from './ai-settings.js';
import { listCategories } from './queries.js';

const BATCH_SIZE = 40;
const MAX_TX_PER_RUN = 200;

function client() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No Anthropic API key configured.');
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
}

/** Turn an SDK/network error into a short, user-safe sentence. */
function friendlyError(e) {
  const status = e?.status;
  const apiMsg = e?.error?.error?.message || e?.error?.message;
  if (status === 401) return 'the API key is invalid.';
  if (status === 403) return 'the API key is not permitted to use this model.';
  if (status === 429) return 'the Anthropic account is rate limited or out of credit.';
  if (status === 404) return 'the selected model is unavailable for this key.';
  if (status >= 500) return 'Anthropic had a server error — try again shortly.';
  if (apiMsg) return apiMsg;
  if (e?.name === 'APIConnectionTimeoutError') return 'the request timed out.';
  return e?.message || 'unknown error';
}

const CATEGORISE_TOOL = {
  name: 'submit_categorisation',
  description: 'Record the chosen category for each transaction.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['assignments'],
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'category'],
          properties: {
            id: { type: 'integer' },
            category: {
              type: ['string', 'null'],
              description: "Exact category name from the list, or null if genuinely unclear"
            }
          }
        }
      }
    }
  },
  strict: true
};

function requestParams(model) {
  const p = { model, max_tokens: 4096 };
  // Haiku 4.5 rejects output_config.effort; the reasoning models take it.
  if (model !== 'claude-haiku-4-5') p.output_config = { effort: 'low' };
  return p;
}

/** @param {{ input:number, output:number }} usage @param {string} model */
function estimateCost(usage, model) {
  const m = AI_MODELS.find((x) => x.id === model);
  if (!m) return 0;
  return (usage.input / 1e6) * m.input + (usage.output / 1e6) * m.output;
}

/**
 * Ask Claude to categorise the given transactions for a user.
 * Only assigns categories that exist for that user; never overwrites a category
 * that is already set (the caller decides which ids to pass).
 * @param {number} userId
 * @param {number[]} txIds
 */
export async function categoriseWithAI(userId, txIds) {
  const ids = [...new Set(txIds.map(Number).filter(Boolean))].slice(0, MAX_TX_PER_RUN);
  if (!ids.length) return { categorised: 0, considered: 0, usage: { input: 0, output: 0 }, costUsd: 0 };

  const categories = listCategories(userId);
  if (!categories.length) throw new Error('Add some categories first.');

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, date, description, amount FROM transactions
       WHERE user_id = ? AND id IN (${placeholders})`
    )
    .all(userId, ...ids);
  if (!rows.length) return { categorised: 0, considered: 0, usage: { input: 0, output: 0 }, costUsd: 0 };

  const model = getModel();
  const anthropic = client();
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const system =
    'You are a meticulous personal-finance bookkeeper. Assign every transaction to ' +
    'exactly one of the user’s existing categories, matching the intent of the ' +
    'category names. Use the sign of the amount (negative = money out, positive = ' +
    'money in) and the description. Prefer a confident choice for well-known merchants ' +
    'and obvious cases; only use null when it is genuinely ambiguous. Respond solely by ' +
    'calling submit_categorisation with one assignment per transaction id.';

  const catList = categories
    .map((c) => `- ${c.name} (${c.kind})`)
    .join('\n');

  let categorised = 0;
  const usage = { input: 0, output: 0 };

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const txList = batch
      .map((t) => `${t.id}\t${t.date}\t${t.amount.toFixed(2)}\t${t.description || '(no description)'}`)
      .join('\n');

    let res;
    try {
      res = await anthropic.messages.create({
        ...requestParams(model),
        system,
        tools: [CATEGORISE_TOOL],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content:
              `Categories:\n${catList}\n\n` +
              `Transactions (id, date, amount, description):\n${txList}\n\n` +
              `Call submit_categorisation now with an assignment for each id above.`
          }
        ]
      });
    } catch (e) {
      throw new Error(friendlyError(e));
    }

    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;

    const call = res.content.find(
      (b) => b.type === 'tool_use' && b.name === 'submit_categorisation'
    );
    const assignments = call?.input?.assignments;
    if (!Array.isArray(assignments)) continue;

    const updates = [];
    for (const a of assignments) {
      const catId = a?.category ? byName.get(String(a.category).trim().toLowerCase()) : null;
      if (catId && batch.some((t) => t.id === Number(a.id))) {
        updates.push({ id: Number(a.id), catId });
      }
    }
    if (updates.length) {
      const stmt = db.prepare(
        'UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ? AND category_id IS NULL'
      );
      tx(() => {
        for (const u of updates) categorised += Number(stmt.run(u.catId, u.id, userId).changes);
      });
    }
  }

  return {
    categorised,
    considered: rows.length,
    usage,
    costUsd: estimateCost(usage, model)
  };
}

/** Cheap round-trip to verify the key + model work. */
export async function testConnection() {
  const model = getModel();
  let res;
  try {
    res = await client().messages.create({
      ...requestParams(model),
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the word: ok' }]
    });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  const text = res.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
  return { model, reply: text.slice(0, 40) };
}
