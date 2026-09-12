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

/**
 * Bumped whenever the prompt changes. It feeds the cache fingerprint, so a
 * reworded summary regenerates instead of serving the old style forever.
 */
export const SUMMARY_VERSION = 4;

const SUMMARY_SYSTEM =
  'You write a very short money summary for someone new to budgeting, covering ' +
  'the period described. Use only the figures you are given: never calculate, ' +
  'estimate or invent a number, and never name a category that is not in the ' +
  'list. Write no more than 40 words: one sentence on how the period went, then ' +
  'one short, concrete suggestion tied to a specific category or figure above. ' +
  'Plain, warm, second-person English ("you spent…"). No headings, bullet ' +
  'points, markdown, preamble, sign-off or disclaimers. Skip generic advice ' +
  'such as "make a budget" or "track your spending" — they are already doing ' +
  'that. If things look healthy, say so plainly rather than manufacturing a ' +
  'problem.';

/**
 * The exact text sent to Claude for a period summary: every figure already
 * formatted, so the model narrates rather than calculates. Exported so it is
 * easy to audit what leaves the server — category names and totals, never an
 * individual transaction.
 *
 * @param {ReturnType<import('./queries.js').periodInsights>} insights
 * @param {string} currency
 */
export function buildPeriodFacts(insights, currency) {
  const money = (n) => formatMoney(n, currency);
  const b = insights.baseline;
  const lines = [];

  const label = insights.single
    ? formatMonth(insights.from)
    : `${formatMonth(insights.from)} to ${formatMonth(insights.to)} (${insights.months} month${insights.months === 1 ? '' : 's'} with data)`;
  if (insights.single && insights.partial) {
    lines.push(
      `Period: ${label} — still in progress, ${Math.round(insights.share * 100)}% of it elapsed. ` +
        'Figures are "so far this month", and every "usual" figure has been scaled to the same share of a month so the comparison is fair.'
    );
  } else if (insights.partial) {
    lines.push(`Period: ${label}. The final month is still in progress, so its figures are partial.`);
  } else {
    lines.push(`Period: ${label}.`);
  }

  const per = insights.single ? '' : ' a month on average';
  const cmp = (actual, usual) =>
    usual == null ? '' : ` (usual ${money(usual)} — ${money(Math.abs(actual - usual))} ${actual >= usual ? 'more' : 'less'})`;

  lines.push(`Came in: ${money(insights.earned)}` + (insights.single ? '' : ` in total, ${money(insights.avg.earned)}${per}`) + cmp(insights.avg.earned, b?.earned));
  lines.push(`Spent: ${money(insights.spent)}` + (insights.single ? '' : ` in total, ${money(insights.avg.spent)}${per}`) + cmp(insights.avg.spent, b?.spent));
  if (insights.saved > 0) {
    lines.push(`Saved: ${money(insights.saved)}` + (insights.single ? '' : ` in total, ${money(insights.avg.saved)}${per}`) + cmp(insights.avg.saved, b?.saved));
  } else if (insights.saved < 0) {
    lines.push(`Taken back out of savings: ${money(-insights.saved)}`);
  }
  if (insights.saved) {
    lines.push(
      'Money moved into savings is excluded from the "Spent" figure. Do not describe ' +
        'it as spending.'
    );
  }
  lines.push(
    b
      ? `"Usual" means this person's own monthly average across the ${b.months} month${b.months === 1 ? '' : 's'} before this period.`
      : 'There is nothing before this period to compare against.'
  );

  if (insights.movers.length) {
    lines.push('', `Biggest changes vs usual${insights.single ? '' : ' (monthly averages)'}:`);
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
 * Turn the numbers from `periodInsights` into a plain-English read of the period.
 * @param {ReturnType<import('./queries.js').periodInsights>} insights
 * @param {string} currency
 */
export async function summarisePeriod(insights, currency) {
  const model = getModel();
  let res;
  try {
    res = await client().messages.create({
      ...requestParams(model),
      max_tokens: 200,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: buildPeriodFacts(insights, currency) }]
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
