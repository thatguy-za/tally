import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { formatMoney, formatMonth } from '$lib/currency.js';
import { PALETTE } from '$lib/palette.js';
import { getApiKey, getModel, getProvider, findModelInfo } from './ai-settings.js';
import {
  listCategories,
  listTransactions,
  updateTransaction,
  sampleDescriptionsForSuggestion,
  monthlyCategoryTotals,
  periodInsights,
  budgetStatus
} from './queries.js';

const BATCH_SIZE = 40;
const MAX_PER_RUN = 300;

const PROVIDER_NAME = { anthropic: 'Anthropic', openai: 'OpenAI' };

function client(provider, apiKeyOverride) {
  const apiKey = apiKeyOverride || getApiKey(provider);
  if (!apiKey) throw new Error(`No ${PROVIDER_NAME[provider]} API key configured.`);
  if (provider === 'openai') return new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
}

/** Turn an SDK/network error into a short, user-safe sentence. */
function friendlyError(e, provider) {
  const name = PROVIDER_NAME[provider] || 'The provider';
  const status = e?.status;
  const apiMsg =
    provider === 'openai' ? e?.error?.message : e?.error?.error?.message || e?.error?.message;
  if (status === 401) return 'the API key is invalid.';
  if (status === 403) return 'the API key is not permitted to use this model.';
  if (status === 429) return `the ${name} account is rate limited or out of credit.`;
  if (status === 404) return 'the selected model is unavailable for this key.';
  if (status >= 500) return `${name} had a server error — try again shortly.`;
  if (apiMsg) return apiMsg;
  if (e?.name === 'APIConnectionTimeoutError' || e?.code === 'ETIMEDOUT') return 'the request timed out.';
  return e?.message || 'unknown error';
}

/**
 * Tool schema shared by both providers — only the wrapping shape differs.
 * `category` is the 1-based number from the numbered list sent in the prompt,
 * not the category's name — a number is 1 output token against several for
 * most names, and output tokens are the pricier half of every model's rate.
 */
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
              type: ['integer', 'null'],
              description: 'The category number from the list, or null if genuinely unclear'
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
  const m = findModelInfo(model);
  if (!m) return 0;
  return (usage.input / 1e6) * m.input + (usage.output / 1e6) * m.output;
}

/**
 * Force a tool call and return its parsed input, regardless of provider.
 * @param {{ system: string, userText: string, tool?: object, toolName: string, maxTokens?: number, apiKeyOverride?: string, provider?: string, model?: string }} args
 * @returns {Promise<{ input: any, usage: {input:number,output:number} }>}
 */
async function callTool({ system, userText, tool = CATEGORISE_TOOL, toolName, maxTokens = 4096, apiKeyOverride, provider, model }) {
  provider = provider || getProvider();
  model = model || getModel(provider);

  if (provider === 'openai') {
    const openai = client('openai', apiKeyOverride);
    let res;
    try {
      res = await openai.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
              strict: true
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: toolName } }
      });
    } catch (e) {
      throw new Error(friendlyError(e, provider));
    }
    const usage = { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 };
    const call = res.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === toolName);
    let input = null;
    if (call) {
      try {
        input = JSON.parse(call.function.arguments);
      } catch {
        input = null;
      }
    }
    return { input, usage };
  }

  const anthropic = client('anthropic', apiKeyOverride);
  let res;
  try {
    res = await anthropic.messages.create({
      ...requestParams(model),
      max_tokens: maxTokens,
      system,
      tools: [tool],
      // force the tool — `auto` was letting Claude reply in prose
      tool_choice: { type: 'tool', name: toolName },
      messages: [{ role: 'user', content: userText }]
    });
  } catch (e) {
    throw new Error(friendlyError(e, provider));
  }
  const usage = { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 };
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  return { input: call?.input ?? null, usage };
}

/**
 * Plain text completion, regardless of provider.
 * @param {{ system?: string, userText: string, maxTokens: number, apiKeyOverride?: string, provider?: string, model?: string }} args
 * @returns {Promise<{ text: string, usage: {input:number,output:number}, model: string }>}
 */
async function callText({ system, userText, maxTokens, apiKeyOverride, provider, model }) {
  provider = provider || getProvider();
  model = model || getModel(provider);

  if (provider === 'openai') {
    const openai = client('openai', apiKeyOverride);
    let res;
    try {
      res = await openai.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: userText }
        ]
      });
    } catch (e) {
      throw new Error(friendlyError(e, provider));
    }
    const usage = { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 };
    return { text: res.choices?.[0]?.message?.content?.trim() ?? '', usage, model };
  }

  const anthropic = client('anthropic', apiKeyOverride);
  let res;
  try {
    res = await anthropic.messages.create({
      ...requestParams(model),
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: userText }]
    });
  } catch (e) {
    throw new Error(friendlyError(e, provider));
  }
  const usage = { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 };
  return { text: res.content.find((x) => x.type === 'text')?.text?.trim() ?? '', usage, model };
}

const SYSTEM =
  'You are a meticulous personal-finance bookkeeper. Assign every transaction to ' +
  'exactly one of the user’s existing categories (by its number), matching the intent ' +
  'of the category names. Use the sign of the amount (negative = money out, positive = ' +
  'money in) and the description. Prefer a confident choice for well-known merchants ' +
  'and obvious cases; only use null when it is genuinely ambiguous. Respond solely by ' +
  'calling submit_categorisation with one assignment per transaction ref.';

/**
 * Core loop: ask the configured AI provider to categorise `items` against `categories`.
 * @param {{name:string,kind:string}[]} categories
 * @param {{ref:string,date:string,amount:number,description:string}[]} items
 * @returns {Promise<{ byRef: Map<string,string>, usage:{input:number,output:number} }>}
 * `byRef` maps ref -> a category name that exists in `categories` (validated).
 */
async function runCategorisation(categories, items) {
  const catList = categories.map((c, i) => `${i + 1}. ${c.name} (${c.kind})`).join('\n');

  const byRef = new Map();
  const usage = { input: 0, output: 0 };

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const txList = batch
      .map((t) => `${t.ref}\t${t.date}\t${Number(t.amount).toFixed(2)}\t${t.description || '(no description)'}`)
      .join('\n');

    const { input, usage: u } = await callTool({
      system: SYSTEM,
      userText:
        `Categories:\n${catList}\n\n` +
        `Transactions (ref, date, amount, description):\n${txList}\n\n` +
        `Assign a category number to every ref above.`,
      toolName: 'submit_categorisation'
    });
    usage.input += u.input;
    usage.output += u.output;

    const assignments = input?.assignments;
    if (!Array.isArray(assignments)) {
      console.warn('[ai] no assignments in response:', JSON.stringify(input).slice(0, 300));
      continue;
    }

    const refs = new Set(batch.map((t) => String(t.ref)));
    for (const a of assignments) {
      const idx = Number(a?.category);
      const cat = Number.isInteger(idx) && idx >= 1 && idx <= categories.length ? categories[idx - 1] : null;
      if (cat && refs.has(String(a.ref))) byRef.set(String(a.ref), cat.name);
    }
  }
  return { byRef, usage };
}

const SUGGEST_CATEGORIES_TOOL = {
  name: 'suggest_categories',
  description: 'Propose new categories tailored to this person\'s own transaction history.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['categories'],
    properties: {
      categories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kind'],
          properties: {
            name: { type: 'string', description: 'Short, human category name, e.g. "Childcare"' },
            kind: { type: 'string', enum: ['income', 'expense', 'saving'] },
            group: {
              type: 'string',
              description:
                'Optional shared label to roll this up with other related categories, e.g. "Home" for ' +
                'both Mortgage and Utilities. Reuse one of the existing groups given below when it fits ' +
                'rather than inventing a near-duplicate. Omit entirely when nothing meaningful ties this ' +
                "category to any other — most categories won't need one."
            }
          }
        }
      }
    }
  },
  strict: true
};

const SUGGEST_CATEGORIES_SYSTEM =
  'You help someone set up categories for their personal budget. Look at a sample of their ' +
  'own transaction descriptions (with amounts — negative is money out, positive is money in) ' +
  'and their existing categories, then propose NEW categories that would meaningfully group ' +
  'transactions those existing categories do not already cover well. Merge similar merchants ' +
  'into one sensible category rather than one per merchant (e.g. all supermarkets under ' +
  '"Groceries", not one category per store). Never repeat a category that already exists ' +
  '(matching is case-insensitive). Suggest at most 8, and suggest none if the existing list ' +
  'already covers the transactions reasonably. Use short, plain category names a person would ' +
  'actually choose. Give a category a "group" only when it clearly belongs with another category ' +
  '(existing or newly suggested) under one umbrella a person would recognise, e.g. "Home" for ' +
  'Mortgage and Utilities, or "Car" for Fuel and Insurance — reuse an existing group from the list ' +
  "below when one fits, and leave most categories ungrouped rather than forcing a group where there " +
  'is no real link. Respond solely by calling suggest_categories.';

/**
 * Look at a sample of the user's own transactions and propose categories not
 * already covered by their existing list.
 * @param {number} userId
 * @returns {Promise<{ suggestions: {name:string,kind:string,group:string|null}[], usage:object, costUsd:number }>}
 */
export async function suggestNewCategories(userId, accountId) {
  const existing = listCategories(userId, accountId);
  const sample = sampleDescriptionsForSuggestion(userId, accountId, 150);
  const empty = { suggestions: [], usage: { input: 0, output: 0 }, costUsd: 0 };
  if (!sample.length) return empty;

  const existingList = existing.length
    ? existing.map((c) => `- ${c.name} (${c.kind}${c.group_name ? `, group: ${c.group_name}` : ''})`).join('\n')
    : '(none yet)';
  const existingGroups = [...new Set(existing.map((c) => c.group_name).filter(Boolean))];
  const groupsList = existingGroups.length ? existingGroups.join(', ') : '(none yet)';
  const txList = sample.map((r) => `${Number(r.amount).toFixed(2)}\t${r.description}`).join('\n');

  const { input, usage } = await callTool({
    system: SUGGEST_CATEGORIES_SYSTEM,
    tool: SUGGEST_CATEGORIES_TOOL,
    toolName: 'suggest_categories',
    userText:
      `Existing categories:\n${existingList}\n\n` +
      `Existing groups: ${groupsList}\n\n` +
      `Sample transactions (amount, description):\n${txList}`
  });

  const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  const groupByLower = new Map(existingGroups.map((g) => [g.toLowerCase(), g]));
  const seen = new Set();
  const suggestions = [];
  for (const c of Array.isArray(input?.categories) ? input.categories : []) {
    const name = String(c?.name || '').trim();
    const kind = ['income', 'expense', 'saving'].includes(c?.kind) ? c.kind : 'expense';
    const key = name.toLowerCase();
    if (!name || existingNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    const rawGroup = String(c?.group || '').trim();
    // snap to an existing group's own casing when the model reused one, so
    // "home" and "Home" don't split into two groups later
    const group = rawGroup ? groupByLower.get(rawGroup.toLowerCase()) || rawGroup : null;
    suggestions.push({ name, kind, group });
  }

  return { suggestions, usage, costUsd: estimateCost(usage, getModel()) };
}

/**
 * Suggest categories for parsed-but-not-yet-imported CSV rows.
 * @param {number} userId
 * @param {{ref:string,date:string,amount:number,description:string}[]} rows
 * @returns {Promise<{ suggestions: Record<string,string>, considered:number, usage:object, costUsd:number }>}
 */
export async function suggestCategoriesForRows(userId, accountId, rows) {
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

  const categories = listCategories(userId, accountId);
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
 * The AI half of "re-run categorisation": whatever is still uncategorised
 * after the user's own rules have had a pass gets sent to the model, and
 * anything it's confident about is saved immediately (unlike
 * suggestCategoriesForRows, which only previews before an import).
 * @param {number} userId
 * @returns {Promise<{ updated: number, considered: number, usage: object, costUsd: number }>}
 */
export async function categoriseUncategorisedTransactions(userId, accountId = null) {
  const empty = { updated: 0, considered: 0, usage: { input: 0, output: 0 }, costUsd: 0 };
  const categories = listCategories(userId, accountId);
  if (!categories.length) return empty;

  const rows = listTransactions(userId, { categoryId: 'none', accountId }).slice(0, MAX_PER_RUN);
  if (!rows.length) return empty;

  const items = rows.map((r) => ({ ref: String(r.id), date: r.date, amount: r.amount, description: r.description }));
  const { byRef, usage } = await runCategorisation(categories, items);
  const byName = new Map(categories.map((c) => [c.name, c.id]));

  let updated = 0;
  for (const [ref, name] of byRef) {
    const categoryId = byName.get(name);
    if (!categoryId) continue;
    updateTransaction(userId, Number(ref), { category_id: categoryId });
    updated++;
  }

  return { updated, considered: items.length, usage, costUsd: estimateCost(usage, getModel()) };
}

/**
 * Bumped whenever the prompt changes. It feeds the cache fingerprint, so a
 * reworded summary regenerates instead of serving the old style forever.
 */
export const SUMMARY_VERSION = 7;

const SUMMARY_SYSTEM =
  'You write a very short money summary covering the period described. Use ' +
  'only the figures you are given: never calculate, estimate or invent a ' +
  'number, and never name a category that is not in the list. Write no more ' +
  'than 40 words, as two sentences: one on how the period went; then one ' +
  'highlighting the most notable trend or deviation from usual — a category ' +
  'that moved a lot, a run of months heading the same direction, or the ' +
  'biggest entry in "Biggest changes vs usual" — or, if nothing stands out, ' +
  'say spending looked steady. Plain, warm, second-person English ("you ' +
  'spent…"). No headings, bullet points, markdown, preamble, sign-off or ' +
  'disclaimers. Never end with advice, a suggestion or a recommendation of ' +
  'any kind, generic or specific ("track your spending", "keep an eye on ' +
  'X", "consider…") — describe what happened and stop there. If things look ' +
  'healthy, say so plainly rather than manufacturing a problem.';

/**
 * The exact text sent to the AI for a period summary: every figure already
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

  const per = insights.single ? '' : ' in a typical month';
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
      ? `"Usual" means this person's own median month across the ${b.months} month${b.months === 1 ? '' : 's'} before this period — the middle value, not the average, so one unusually big or quiet month doesn't skew it.`
      : 'There is nothing before this period to compare against.'
  );

  if (insights.movers.length) {
    lines.push('', `Biggest changes vs usual${insights.single ? '' : ' (medians)'}:`);
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
  const { text, usage } = await callText({
    system: SUMMARY_SYSTEM,
    userText: buildPeriodFacts(insights, currency),
    maxTokens: 200,
    model
  });
  return { text, usage, costUsd: estimateCost(usage, model) };
}

/**
 * Bumped whenever the savings-summary prompt changes, same purpose as
 * SUMMARY_VERSION above.
 */
export const SAVINGS_SUMMARY_VERSION = 1;

const SAVINGS_SUMMARY_SYSTEM =
  'You write a very short note on how someone has been putting money aside, covering the ' +
  'period described. Use only the figures you are given: never calculate, estimate or invent a ' +
  "number. Write no more than 45 words, as one or two sentences, and call out whatever a plain " +
  'reader would actually notice — a lump sum much bigger than the rest, a month with nothing set ' +
  'aside, money taken back out, or a clear run of months trending up or down. If the monthly ' +
  'amounts are fairly steady with nothing to point at, say that plainly rather than manufacturing ' +
  'a pattern. Plain, warm, second-person English ("you put aside…"). No headings, bullet points, ' +
  'markdown, preamble, sign-off or disclaimers.';

/**
 * The exact text sent to the AI for a savings summary — every month's
 * contribution already formatted, so the model narrates rather than
 * calculates.
 * @param {{ ym: string, saved: number }[]} series
 * @param {string} currency
 */
export function buildSavingsFacts(series, currency) {
  const money = (n) => formatMoney(n, currency);
  if (!series.length) return 'No savings-category transactions in this period.';
  const lines = ['Money put aside per month (negative means more was taken out than paid in):'];
  for (const p of series) lines.push(`- ${p.ym}: ${money(p.saved)}`);
  const total = series.reduce((s, p) => s + p.saved, 0);
  lines.push(`Total across the period: ${money(total)}.`);
  return lines.join('\n');
}

/**
 * Turn a `savingsSummary` series into a plain-English read of the pattern.
 * @param {{ ym: string, saved: number }[]} series
 * @param {string} currency
 */
export async function summariseSavings(series, currency) {
  const model = getModel();
  const { text, usage } = await callText({
    system: SAVINGS_SUMMARY_SYSTEM,
    userText: buildSavingsFacts(series, currency),
    maxTokens: 150,
    model
  });
  return { text, usage, costUsd: estimateCost(usage, model) };
}

/* ------------------------------------------------------------ chat with your data */

const CHAT_MAX_ROUNDS = 4; // tool round-trips per user message, before giving up
const CHAT_TOOL_TIMEOUT_TEXT =
  "That needed more digging than I can do in one go — try asking something narrower, like a shorter date range or one category.";

/**
 * Read-only tools the chat assistant can call — each one runs against a
 * single `userId` supplied by the server, never by the model, so a chat
 * message can only ever see that person's own data. Every property is
 * `required` (using a `null` branch for "optional") because OpenAI's strict
 * function-calling mode rejects schemas that omit properties from `required`.
 */
const CHAT_TOOLS = [
  {
    name: 'list_categories',
    description: "List every one of the user's categories, with id, name and kind.",
    input_schema: { type: 'object', additionalProperties: false, required: [], properties: {} }
  },
  {
    name: 'category_totals',
    description: 'Total income/expense/savings per category over a month range, for the currently active account — for "how much did I spend on X" questions.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', description: 'Start month, YYYY-MM, inclusive' },
        to: { type: 'string', description: 'End month, YYYY-MM, inclusive' }
      }
    }
  },
  {
    name: 'search_transactions',
    description: 'List individual transactions matching a filter — for "show me" / "when did I" questions about specific line items.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to', 'category_id', 'search', 'direction', 'limit'],
      properties: {
        from: { type: ['string', 'null'], description: 'YYYY-MM-DD lower bound, inclusive, or null' },
        to: { type: ['string', 'null'], description: 'YYYY-MM-DD upper bound, inclusive, or null' },
        category_id: { type: ['integer', 'null'], description: 'Restrict to one category id, or null' },
        search: { type: ['string', 'null'], description: 'Case-insensitive substring of the description, or null' },
        direction: { type: ['string', 'null'], description: '"in" for money received, "out" for money spent, or null for both' },
        limit: { type: 'integer', description: 'Max rows to return, 1-30' }
      }
    }
  },
  {
    name: 'period_summary',
    description: 'Earned/spent/saved for a period, and how it compares to this person\'s usual (median) month — for "how am I doing" / "is this more than usual" questions.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', description: 'Start month, YYYY-MM, inclusive' },
        to: { type: 'string', description: 'End month, YYYY-MM, inclusive' }
      }
    }
  },
  {
    name: 'budget_status',
    description: "Target vs. actual per category for one month — for questions about budgets or targets.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['month'],
      properties: { month: { type: 'string', description: 'YYYY-MM' } }
    }
  },
  {
    name: 'show_chart',
    description:
      'Render a simple bar chart alongside your reply, for questions comparing amounts across ' +
      'categories or months (e.g. "chart my spending by category"). Call this in addition to ' +
      'your normal text answer, using numbers you already got from another tool — it does not ' +
      'look anything up itself. The chart always uses each category\'s own colour from this app, ' +
      'so pass category_id whenever a bar represents one category.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'bars'],
      properties: {
        title: { type: 'string', description: 'Short chart title, e.g. "Spending by category, September 2026"' },
        bars: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'value', 'category_id'],
            properties: {
              label: { type: 'string', description: 'Bar label, e.g. a category or month name' },
              value: { type: 'number', description: 'Bar value as a plain positive number' },
              category_id: {
                type: ['integer', 'null'],
                description: "If this bar is one category from list_categories, its id — otherwise null"
              }
            }
          }
        }
      }
    }
  }
];

/** Turns a validated `show_chart` call into render-ready bars with real, on-platform colours. */
function normaliseChart(userId, accountId, input) {
  const colorById = new Map(listCategories(userId, accountId).map((c) => [c.id, c.color]));
  const bars = (Array.isArray(input?.bars) ? input.bars : []).slice(0, 12).map((b, i) => {
    const value = Number(b?.value);
    const catId = Number.isInteger(b?.category_id) ? b.category_id : null;
    return {
      label: String(b?.label || '').trim().slice(0, 40) || `#${i + 1}`,
      value: Number.isFinite(value) ? value : 0,
      color: (catId && colorById.get(catId)) || PALETTE[i % PALETTE.length]
    };
  });
  return { title: String(input?.title || '').trim().slice(0, 80), bars };
}

/**
 * Runs one chat tool against `userId`'s own data and returns a plain
 * JSON-able result. `charts` collects any `show_chart` calls made this turn,
 * so the caller can hand them back to the client alongside the reply.
 */
function executeChatTool(userId, accountId, name, input, charts) {
  switch (name) {
    case 'show_chart':
      charts.push(normaliseChart(userId, accountId, input));
      return { ok: true };
    case 'list_categories':
      return listCategories(userId, accountId).map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

    case 'category_totals': {
      const rows = monthlyCategoryTotals(userId, input.from, input.to, accountId);
      const byCat = new Map();
      for (const r of rows) {
        const e = byCat.get(r.id) || { id: r.id, name: r.name, kind: r.kind, total: 0 };
        e.total += r.total;
        byCat.set(r.id, e);
      }
      return [...byCat.values()];
    }

    case 'search_transactions': {
      const limit = Math.min(Math.max(1, Number(input.limit) || 20), 30);
      const rows = listTransactions(userId, {
        dateFrom: input.from || undefined,
        dateTo: input.to || undefined,
        categoryId: input.category_id ?? undefined,
        accountId,
        search: input.search || undefined,
        direction: input.direction === 'in' || input.direction === 'out' ? input.direction : undefined
      }).slice(0, limit);
      return rows.map((r) => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        category: r.category_name || null
      }));
    }

    case 'period_summary': {
      const ins = periodInsights(userId, input.from, input.to, accountId);
      return {
        earned: ins.earned,
        spent: ins.spent,
        saved: ins.saved,
        kept: ins.kept,
        savingsRate: ins.rate,
        avgPerMonth: ins.avg,
        usualBaseline: ins.baseline,
        biggestMovesVsUsual: ins.movers
      };
    }

    case 'budget_status':
      return budgetStatus(userId, input.month, accountId).map((r) => ({
        name: r.name,
        kind: r.kind,
        target: r.target,
        actual: r.actual,
        remaining: r.remaining
      }));

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const chatToolSpecs = CHAT_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

async function chatTurnAnthropic({ system, messages, userId, accountId, model, apiKeyOverride }) {
  const anthropic = client('anthropic', apiKeyOverride);
  const usage = { input: 0, output: 0 };
  const charts = [];
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
    let res;
    try {
      res = await anthropic.messages.create({
        ...requestParams(model),
        max_tokens: 1024,
        system,
        tools: chatToolSpecs,
        messages: convo
      });
    } catch (e) {
      throw new Error(friendlyError(e, 'anthropic'));
    }
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;

    const toolUses = res.content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) {
      return { text: res.content.find((b) => b.type === 'text')?.text?.trim() ?? '', usage, charts };
    }

    convo.push({ role: 'assistant', content: res.content });
    convo.push({
      role: 'user',
      content: toolUses.map((tu) => {
        let content;
        try {
          content = JSON.stringify(executeChatTool(userId, accountId, tu.name, tu.input || {}, charts)).slice(0, 8000);
        } catch (e) {
          content = JSON.stringify({ error: e?.message || 'That lookup failed.' });
        }
        return { type: 'tool_result', tool_use_id: tu.id, content };
      })
    });
  }
  return { text: CHAT_TOOL_TIMEOUT_TEXT, usage, charts };
}

async function chatTurnOpenAI({ system, messages, userId, accountId, model, apiKeyOverride }) {
  const openai = client('openai', apiKeyOverride);
  const usage = { input: 0, output: 0 };
  const charts = [];
  const tools = CHAT_TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema, strict: true }
  }));
  const convo = [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];

  for (let round = 0; round < CHAT_MAX_ROUNDS; round++) {
    let res;
    try {
      res = await openai.chat.completions.create({
        model,
        max_completion_tokens: 1024,
        messages: convo,
        tools
      });
    } catch (e) {
      throw new Error(friendlyError(e, 'openai'));
    }
    usage.input += res.usage?.prompt_tokens ?? 0;
    usage.output += res.usage?.completion_tokens ?? 0;

    const msg = res.choices?.[0]?.message;
    const calls = msg?.tool_calls || [];
    if (!calls.length) return { text: msg?.content?.trim() ?? '', usage, charts };

    convo.push(msg);
    for (const c of calls) {
      let args = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {
        /* treat as no args */
      }
      let content;
      try {
        content = JSON.stringify(executeChatTool(userId, accountId, c.function.name, args, charts)).slice(0, 8000);
      } catch (e) {
        content = JSON.stringify({ error: e?.message || 'That lookup failed.' });
      }
      convo.push({ role: 'tool', tool_call_id: c.id, content });
    }
  }
  return { text: CHAT_TOOL_TIMEOUT_TEXT, usage, charts };
}

const CHAT_SYSTEM = (currency, today) =>
  "You are Tori, this person's personal financial advisor, built into the Tally app. Your " +
  'personality: fun and quick-witted, but fundamentally analytical — you would always rather ' +
  'make one sharp observation backed by a real number than ten vague platitudes. You are ' +
  'invested in this person doing well with their money, but you never lecture, moralise, or ' +
  'pad an answer with disclaimers. Talk like a smart friend who happens to be great with ' +
  'numbers, not like a corporate assistant. ' +
  `Today is ${today} (current month ${today.slice(0, 7)}). Amounts are in ${currency}. ` +
  'Always call a tool before stating any figure — never guess, calculate from memory, or ' +
  'reuse a number from earlier in the conversation without re-checking it. Use list_categories ' +
  'to resolve a category name to its id, category_totals for spending/income by category, ' +
  'search_transactions for specific line items, period_summary for how a period compares to ' +
  'usual, and budget_status for target-vs-actual in a month. If a question needs a date range ' +
  'and none is given, assume the current month unless context suggests otherwise. When a ' +
  'comparison across categories or months would be clearer as a chart, call show_chart with ' +
  'the numbers you already looked up (it does not fetch anything itself) — still give your ' +
  'normal text answer too, don\'t reply with only a chart. Keep answers short and concrete — a ' +
  'sentence or two, or a brief list for multiple items — with real personality in the phrasing, ' +
  'but never at the expense of accuracy. Plain English, no markdown headings, no "as your ' +
  'financial advisor" preamble and no signing off as Tori — just talk like her. Never invent a ' +
  'transaction, category or number that did not come from a tool result; if the data does not ' +
  'answer the question, say so.';

/**
 * One turn of "chat with your data": `history` is the visible conversation so
 * far (already ending with the latest user message), as
 * `{ role: 'user'|'assistant', content: string }[]`. The model gathers
 * whatever it needs itself via the tools above, scoped to `userId` — the
 * request never carries data the model didn't ask a tool for.
 * @param {number} userId
 * @param {number} accountId
 * @param {{role:string,content:string}[]} history
 * @param {string} currency
 */
export async function chatWithData(userId, accountId, history, currency) {
  const provider = getProvider();
  const model = getModel(provider);
  const system = CHAT_SYSTEM(currency, new Date().toISOString().slice(0, 10));

  const turn = provider === 'openai' ? chatTurnOpenAI : chatTurnAnthropic;
  const { text, usage, charts } = await turn({ system, messages: history, userId, accountId, model });
  return { text, usage, charts, costUsd: estimateCost(usage, model) };
}

/**
 * Cheap round-trip to verify the key + model work. Pass `apiKey`/`model`/`provider`
 * to test values that haven't been saved yet (e.g. still sitting in a form) —
 * omit any of them to fall back to whatever is already configured.
 * @param {{ provider?: string, apiKey?: string, model?: string }} [overrides]
 */
export async function testConnection({ provider, apiKey, model } = {}) {
  provider = provider || getProvider();
  model = model || getModel(provider);
  const { text } = await callText({
    userText: 'Reply with the word: ok',
    maxTokens: 16,
    apiKeyOverride: apiKey,
    provider,
    model
  });
  return { model, reply: text.slice(0, 40) };
}
