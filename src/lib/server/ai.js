import Anthropic from '@anthropic-ai/sdk';
import { formatMoney, formatMonth } from '$lib/currency.js';
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
        // force the tool — all models in the picker (Opus 5 / Sonnet 5 / Haiku 4.5)
        // support forced tool_choice, and `auto` was letting Claude reply in prose
        tool_choice: { type: 'tool', name: 'submit_categorisation' },
        messages: [
          {
            role: 'user',
            content:
              `Categories:\n${catList}\n\n` +
              `Transactions (ref, date, amount, description):\n${txList}\n\n` +
              `Assign a category to every ref above.`
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
    if (!Array.isArray(assignments)) {
      console.warn('[ai] no assignments in response:', JSON.stringify(res.content).slice(0, 300));
      continue;
    }

    const refs = new Set(batch.map((t) => String(t.ref)));
    for (const a of assignments) {
      const name = a?.category ? byName.get(String(a.category).trim().toLowerCase()) : null;
      if (name && refs.has(String(a.ref))) byRef.set(String(a.ref), name);
    }
  }
  return { byRef, usage };
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

const SUMMARY_SYSTEM =
  'You write a short monthly money summary for someone new to budgeting. ' +
  'Use only the figures you are given: never calculate, estimate or invent a ' +
  'number, and never name a category that is not in the list. Write two or ' +
  'three short sentences of plain, warm, second-person English ("you spent…"), ' +
  'then one concrete suggestion tied to a specific category or figure above. ' +
  'No headings, no bullet points, no markdown, no preamble, no sign-off and no ' +
  'disclaimers. Avoid generic advice such as "make a budget" or "track your ' +
  'spending" — they are already doing that. If the month looks healthy, say so ' +
  'plainly rather than manufacturing a problem.';

/**
 * The exact text sent to Claude for a month summary: every figure already
 * formatted, so the model narrates rather than calculates. Exported so it is
 * easy to audit what leaves the server — category names and totals, never an
 * individual transaction.
 *
 * @param {ReturnType<import('./queries.js').monthInsights>} insights
 * @param {string} currency
 */
export function buildMonthFacts(insights, currency) {
  const money = (n) => formatMoney(n, currency);
  const b = insights.baseline;
  const lines = [];

  lines.push(
    insights.partial
      ? `Month: ${formatMonth(insights.month)} — still in progress, ${Math.round(insights.share * 100)}% of it elapsed. ` +
        'Figures below are "so far this month", and every "usual" figure has been scaled to the same share of a month so the comparison is fair.'
      : `Month: ${formatMonth(insights.month)} (complete).`
  );
  lines.push(
    `Earned: ${money(insights.earned)}` + (b?.earned != null ? ` (usual ${money(b.earned)})` : '')
  );
  lines.push(
    `Spent: ${money(insights.spent)}` +
      (b
        ? ` (usual ${money(b.spent)} — ${money(Math.abs(insights.spent - b.spent))} ${insights.spent >= b.spent ? 'more' : 'less'})`
        : '')
  );
  if (insights.saved > 0) {
    lines.push(
      `Put aside into savings: ${money(insights.saved)}` +
        (b?.saved != null ? ` (usual ${money(b.saved)})` : '')
    );
  } else if (insights.saved < 0) {
    lines.push(`Taken back out of savings: ${money(-insights.saved)}`);
  }
  lines.push(
    `Kept: ${money(insights.kept)}` +
      (insights.rate != null ? ` — ${insights.rate}% of what came in` : '')
  );
  if (insights.saved) {
    lines.push(
      'Money moved into savings counts as kept, not spent: it is excluded from the ' +
        '"Spent" figure and already included in "Kept". Do not describe it as spending.'
    );
  }
  lines.push(
    b
      ? `"Usual" means this person's own average across ${b.months} earlier month${b.months === 1 ? '' : 's'}.`
      : 'There is no earlier month to compare against yet.'
  );

  if (insights.movers.length) {
    lines.push('', 'Biggest changes vs usual:');
    for (const m of insights.movers) {
      lines.push(
        `- ${m.name}: ${money(m.spent)} (usual ${money(m.usual)} — ` +
          `${money(Math.abs(m.delta))} ${m.delta > 0 ? 'more' : 'less'})`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Turn the numbers from `monthInsights` into a plain-English read of the month.
 * @param {ReturnType<import('./queries.js').monthInsights>} insights
 * @param {string} currency
 */
export async function summariseMonth(insights, currency) {
  const model = getModel();
  let res;
  try {
    res = await client().messages.create({
      ...requestParams(model),
      max_tokens: 400,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: buildMonthFacts(insights, currency) }]
    });
  } catch (e) {
    throw new Error(friendlyError(e));
  }

  const usage = { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 };
  return {
    text: res.content.find((x) => x.type === 'text')?.text?.trim() ?? '',
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
