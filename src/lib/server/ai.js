import Anthropic from '@anthropic-ai/sdk';
import { db, tx } from './db.js';
import { getApiKey, getModel, AI_MODELS } from './ai-settings.js';
import { listCategories } from './queries.js';

const BATCH_SIZE = 40;
const MAX_PER_RUN = 300;

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
  description: 'Record the chosen category for each transaction by its ref.',
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
          required: ['ref', 'category'],
          properties: {
            ref: { type: 'string' },
            category: {
              type: ['string', 'null'],
              description: 'Exact category name from the list, or null if genuinely unclear'
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
export function estimateCost(usage, model) {
  const m = AI_MODELS.find((x) => x.id === model);
  if (!m) return 0;
  return (usage.input / 1e6) * m.input + (usage.output / 1e6) * m.output;
}

const SYSTEM =
  'You are a meticulous personal-finance bookkeeper. Assign every transaction to ' +
  'exactly one of the user’s existing categories, matching the intent of the category ' +
  'names. Use the sign of the amount (negative = money out, positive = money in) and ' +
  'the description. Prefer a confident choice for well-known merchants and obvious ' +
  'cases; only use null when it is genuinely ambiguous. Respond solely by calling ' +
  'submit_categorisation with one assignment per transaction ref.';

/**
 * Core loop: ask Claude to categorise `items` against `categories`.
 * @param {{name:string,kind:string}[]} categories
 * @param {{ref:string,date:string,amount:number,description:string}[]} items
 * @returns {Promise<{ byRef: Map<string,string>, usage:{input:number,output:number} }>}
 * `byRef` maps ref -> a category name that exists in `categories` (validated).
 */
async function runCategorisation(categories, items) {
  const anthropic = client();
  const model = getModel();
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.name]));
  const catList = categories.map((c) => `- ${c.name} (${c.kind})`).join('\n');

  const byRef = new Map();
  const usage = { input: 0, output: 0 };

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const txList = batch
      .map((t) => `${t.ref}\t${t.date}\t${Number(t.amount).toFixed(2)}\t${t.description || '(no description)'}`)
      .join('\n');

    let res;
    try {
      res = await anthropic.messages.create({
        ...requestParams(model),
        system: SYSTEM,
        tools: [CATEGORISE_TOOL],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content:
              `Categories:\n${catList}\n\n` +
              `Transactions (ref, date, amount, description):\n${txList}\n\n` +
              `Call submit_categorisation now with an assignment for every ref above.`
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

    const refs = new Set(batch.map((t) => String(t.ref)));
    for (const a of assignments) {
      const name = a?.category ? byName.get(String(a.category).trim().toLowerCase()) : null;
      if (name && refs.has(String(a.ref))) byRef.set(String(a.ref), name);
    }
  }
  return { byRef, usage };
}

/**
 * Categorise existing DB transactions in place (never overwrites a set category).
 * @param {number} userId @param {number[]} txIds
 */
export async function categoriseWithAI(userId, txIds) {
  const ids = [...new Set(txIds.map(Number).filter(Boolean))].slice(0, MAX_PER_RUN);
  const empty = { categorised: 0, considered: 0, usage: { input: 0, output: 0 }, costUsd: 0 };
  if (!ids.length) return empty;

  const categories = listCategories(userId);
  if (!categories.length) throw new Error('Add some categories first.');

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, date, description, amount FROM transactions WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...ids);
  if (!rows.length) return empty;

  const items = rows.map((r) => ({ ref: String(r.id), date: r.date, amount: r.amount, description: r.description }));
  const { byRef, usage } = await runCategorisation(categories, items);
  const catId = new Map(categories.map((c) => [c.name, c.id]));

  let categorised = 0;
  const stmt = db.prepare(
    'UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ? AND category_id IS NULL'
  );
  tx(() => {
    for (const [ref, name] of byRef) {
      const id = Number(ref);
      const cid = catId.get(name);
      if (id && cid) categorised += Number(stmt.run(cid, id, userId).changes);
    }
  });

  return { categorised, considered: rows.length, usage, costUsd: estimateCost(usage, getModel()) };
}

/**
 * Suggest categories for parsed-but-not-yet-imported CSV rows.
 * @param {number} userId
 * @param {{ref:string,date:string,amount:number,description:string}[]} rows
 * @returns {Promise<{ suggestions: Record<string,string>, considered:number, usage:object, costUsd:number }>}
 */
export async function suggestCategoriesForRows(userId, rows) {
  const items = rows
    .filter((r) => r && r.ref != null)
    .slice(0, MAX_PER_RUN)
    .map((r) => ({
      ref: String(r.ref),
      date: String(r.date || ''),
      amount: Number(r.amount) || 0,
      description: String(r.description || '')
    }));
  const empty = { suggestions: {}, considered: 0, usage: { input: 0, output: 0 }, costUsd: 0 };
  if (!items.length) return empty;

  const categories = listCategories(userId);
  if (!categories.length) throw new Error('Add some categories first.');

  const { byRef, usage } = await runCategorisation(categories, items);
  return {
    suggestions: Object.fromEntries(byRef),
    considered: items.length,
    usage,
    costUsd: estimateCost(usage, getModel())
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
