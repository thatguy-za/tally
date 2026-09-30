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
 * @param {{ref:string,date:string,amount:number,description:string,notes?:string}[]} items
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
      .map((t) => {
        const note = String(t.notes || '').trim();
        return `${t.ref}\t${t.date}\t${Number(t.amount).toFixed(2)}\t${t.description || '(no description)'}${note ? `\t(note: ${note})` : ''}`;
      })
      .join('\n');

    const { input, usage: u } = await callTool({
      system: SYSTEM,
      userText:
        `Categories:\n${catList}\n\n` +
        `Transactions (ref, date, amount, description, optional note):\n${txList}\n\n` +
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
            kind: { type: 'string', enum: ['income', 'expense', 'saving'] }
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
  'actually choose. Respond solely by calling suggest_categories.';

/**
 * Look at a sample of the user's own transactions and propose categories not
 * already covered by their existing list.
 * @param {number} userId
 * @returns {Promise<{ suggestions: {name:string,kind:string}[], usage:object, costUsd:number }>}
 */
export async function suggestNewCategories(userId, accountId) {
  const existing = listCategories(userId, accountId);
  const sample = sampleDescriptionsForSuggestion(userId, accountId, 150);
  const empty = { suggestions: [], usage: { input: 0, output: 0 }, costUsd: 0 };
  if (!sample.length) return empty;

  const existingList = existing.length
    ? existing.map((c) => `- ${c.name} (${c.kind})`).join('\n')
    : '(none yet)';
  const txList = sample.map((r) => `${Number(r.amount).toFixed(2)}\t${r.description}`).join('\n');

  const { input, usage } = await callTool({
    system: SUGGEST_CATEGORIES_SYSTEM,
    tool: SUGGEST_CATEGORIES_TOOL,
    toolName: 'suggest_categories',
    userText:
      `Existing categories:\n${existingList}\n\n` +
      `Sample transactions (amount, description):\n${txList}`
  });

  const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  const seen = new Set();
  const suggestions = [];
  for (const c of Array.isArray(input?.categories) ? input.categories : []) {
    const name = String(c?.name || '').trim();
    const kind = ['income', 'expense', 'saving'].includes(c?.kind) ? c.kind : 'expense';
    const key = name.toLowerCase();
    if (!name || existingNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ name, kind });
  }

  return { suggestions, usage, costUsd: estimateCost(usage, getModel()) };
}

/**
 * Suggest categories for parsed-but-not-yet-imported CSV rows.
 * @param {number} userId
 * @param {{ref:string,date:string,amount:number,description:string,notes?:string}[]} rows
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
      description: String(r.description || ''),
      notes: String(r.notes || '')
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

  const items = rows.map((r) => ({ ref: String(r.id), date: r.date, amount: r.amount, description: r.description, notes: r.notes }));
  const { byRef, usage } = await runCategorisation(categories, items);
  const byName = new Map(categories.map((c) => [c.name, c.id]));

  let updated = 0;
  for (const [ref, name] of byRef) {
    const categoryId = byName.get(name);
    if (!categoryId) continue;
    updateTransaction(userId, accountId, Number(ref), { category_id: categoryId });
    updated++;
  }

  return { updated, considered: items.length, usage, costUsd: estimateCost(usage, getModel()) };
}

/**
 * Every currency amount and percentage mentioned in `text`, as plain numbers —
 * built from Intl's own formatting of `currency` so it recognises whatever
 * shape formatMoney() actually produces (symbol before/after, its grouping
 * and decimal separators), rather than assuming "$1,234.56".
 */
/**
 * Same as `extractAmounts`, but keeps each figure's kind — 'currency' (an
 * amount) or 'percent' — rather than flattening them into one pool. Kept
 * apart so a currency-tagged figure in an answer can't be satisfied by a
 * percentage that happens to share the same digits, and vice versa: the
 * real bug this exists for was "€19 over" being accepted as grounded because
 * a *percentage* field (pctOver) happened to equal 19, when the actual
 * amount was €15.
 */
function extractTypedAmounts(text, currency) {
  let symbol, group = ',', decimal = '.';
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(1234.5);
    symbol = parts.find((p) => p.type === 'currency')?.value;
    group = parts.find((p) => p.type === 'group')?.value ?? group;
    decimal = parts.find((p) => p.type === 'decimal')?.value ?? decimal;
  } catch {
    /* fall through with the defaults above */
  }

  // what this currency is called in words, so "1850 euros" is read as money
  // too — a model that drops the symbol was still stating a figure
  const names = new Set([currency.toLowerCase()]);
  for (const n of [1, 2]) {
    try {
      const word = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'name' })
        .formatToParts(n)
        .find((p) => p.type === 'currency')?.value;
      if (word) names.add(word.toLowerCase());
    } catch {
      /* the ISO code alone will do */
    }
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const number = `\\d{1,3}(?:${esc(group)}\\d{3})*(?:${esc(decimal)}\\d+)?|\\d+(?:${esc(decimal)}\\d+)?`;
  const patterns = symbol
    ? [
        { source: `${esc(symbol)}\\s?-?(${number})`, kind: 'currency' },
        { source: `-?(${number})\\s?${esc(symbol)}`, kind: 'currency' }
      ]
    : [];
  patterns.push({ source: `-?(${number})\\s?%`, kind: 'percent' }); // bare percentages, e.g. "97% of it elapsed"
  // "1,850 euros" / "1850 EUR" — the code is usually written upper case
  patterns.push({ source: `-?(${number})\\s?(?:${[...names].map(esc).join('|')})\\b`, flags: 'gi', kind: 'currency' });
  // a bare figure the model wrote without any currency marking at all. A
  // thousands separator, minor units or four-plus digits all say "money";
  // plain small integers do not, and are left alone — "3 months" and "the
  // 1st" are not figures being claimed, and checking them would discard good
  // summaries over nothing.
  // the lookbehind has to exclude the group and decimal separators too, or
  // this matches *inside* a figure the symbol patterns already read: "€3,247.00"
  // would yield a phantom 247, which then makes unrelated numbers look traceable
  patterns.push({
    source:
      `(?<![${esc(symbol ?? '')}\\d${esc(group)}${esc(decimal)}])` +
      `(-?\\d{1,3}(?:${esc(group)}\\d{3})+(?:${esc(decimal)}\\d+)?|-?\\d+${esc(decimal)}\\d{2}|-?\\d{4,})` +
      `(?![\\d${esc(decimal)}])`,
    kind: 'currency'
  });

  const seen = new Set();
  const amounts = [];
  for (const pattern of patterns) {
    let re;
    try {
      re = new RegExp(pattern.source, pattern.flags || 'g');
    } catch {
      continue; // a lookbehind-less engine simply skips that refinement
    }
    let m;
    while ((m = re.exec(text))) {
      const n = parseFloat(m[1].split(group).join('').replace(decimal, '.'));
      if (!Number.isFinite(n)) continue;
      const key = `${pattern.kind}:${n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      amounts.push({ value: n, kind: pattern.kind });
    }
  }
  return amounts;
}

export function extractAmounts(text, currency) {
  return [...new Set(extractTypedAmounts(text, currency).map((a) => a.value))];
}

/**
 * How far a stated figure may sit from the fact behind it. The prompt invites
 * "rounding for readability", which a flat ±1 quietly forbade: "around €3,200"
 * for a real €3,247 was discarded as an invention. Allow half the rounding
 * step the figure itself implies — €3,200 is round to the hundred, so ±50 —
 * but never more than 5% of it, so a suspiciously round number can't license
 * a wildly different one.
 */
function roundingTolerance(n) {
  const abs = Math.abs(n);
  if (!abs || !Number.isInteger(n)) return 1; // cents quoted: expect near-exact
  let unit = 1;
  while (abs % (unit * 10) === 0 && unit < 1e6) unit *= 10;
  return Math.max(1, Math.min(unit / 2, abs * 0.05));
}

/**
 * How far `actual` sits from `usual`, as a whole-number percentage — computed
 * here so a chat answer to "how does this compare to usual" can quote a real
 * percentage instead of the model working one out itself (see period_summary
 * in executeChatTool). `null` when `usual` is too close to zero to divide by,
 * or missing entirely (no baseline yet) — the model is expected to describe
 * the period on its own terms rather than invent a percentage in that case.
 */
export function pctVsUsual(actual, usual) {
  if (usual == null || Math.abs(usual) < 0.5) return null;
  return Math.round(((actual - usual) / usual) * 100);
}

/**
 * Splits the facts sheet into the per-category figures ("- Groceries: €310.96
 * (usual €353.81 — €42.85 less)" gives Groceries all three) and the
 * period-level ones (Came in / Spent / Saved and their comparisons). Only the
 * first kind is owned by a name: a period total is about the whole period, so
 * it can legitimately appear in a sentence that happens to name one category.
 */
function factsByLabel(facts, currency) {
  const byCategory = new Map();
  const totals = [];
  for (const line of facts.split('\n')) {
    const m = /^(\s*-\s+)?([A-Za-z][^:]{0,40}):\s*(.+)$/.exec(line);
    if (!m) continue;
    const amounts = extractAmounts(m[3], currency);
    if (!amounts.length) continue;
    if (m[1]) byCategory.set(m[2].trim().toLowerCase(), amounts);
    else totals.push(...amounts);
  }
  return { byCategory, totals };
}

export function verifiedAgainstFacts(text, facts, currency) {
  const saidTyped = extractTypedAmounts(text, currency);
  if (!saidTyped.length) return true;
  // a currency figure must trace to a currency figure, and a percentage (the
  // facts sheet's only one is "elapsed" — "97% of it elapsed") to a
  // percentage — the same digits meaning two different things should not
  // license each other, same reasoning as groundedInToolResults
  const givenTyped = extractTypedAmounts(facts, currency);
  const pool = (kind) => givenTyped.filter((g) => g.kind === kind).map((g) => g.value);
  const traceable = (a) => pool(a.kind).some((g) => Math.abs(a.value - g) <= roundingTolerance(a.value));
  if (!saidTyped.every(traceable)) return false;

  // Every figure exists somewhere in the facts — but that alone lets the model
  // hang the right number on the wrong name ("Eating out hit €250" when €250
  // was Groceries). Where a sentence names exactly one category, its figures
  // have to be that category's own, or a period total that belongs to no
  // category in particular.
  const { byCategory, totals } = factsByLabel(facts, currency);
  if (!byCategory.size) return true;
  // "Rent & housing" is almost always written back as "rent and housing"
  const loose = (t) => t.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ');
  const near = (n, pool) => pool.some((g) => Math.abs(n - g) <= roundingTolerance(n));
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const said = loose(sentence);
    const mentioned = [...byCategory.keys()].filter((l) => said.includes(loose(l)));
    // none named, or several: no single owner to hold the figures to
    if (mentioned.length !== 1) continue;
    const owned = byCategory.get(mentioned[0]);
    for (const n of extractAmounts(sentence, currency)) {
      if (near(n, owned) || near(n, totals)) continue;
      // only object when the figure demonstrably belongs to a different
      // category; anything else is the global check's business
      if ([...byCategory.values()].some((pool) => near(n, pool))) return false;
    }
  }
  return true;
}

/**
 * Bumped whenever the prompt changes. It feeds the cache fingerprint, so a
 * reworded summary regenerates instead of serving the old style forever.
 */
export const SUMMARY_VERSION = 19;

/**
 * Tori's personality, shared by every place she writes — the chat and the
 * short narrated notes elsewhere (the period summary, the savings note).
 * Using the exact same wording everywhere is what makes a one-line note on
 * the Insights page sound like the same person you'd chat with on the Ask
 * Tori page, instead of a generic "AI summary" voice that happens to switch
 * personalities depending on which screen it's bolted onto.
 */
const TORI_PERSONA =
  "You are Tori, this person's personal financial advisor, built into the Tally app. Your " +
  'personality: fun and quick-witted, but fundamentally analytical — you would always rather ' +
  'make one sharp observation backed by a real number than ten vague platitudes. You are ' +
  'invested in this person doing well with their money, but you never lecture, moralise, or ' +
  'pad an answer with disclaimers. Talk like a smart friend who happens to be great with ' +
  'numbers, not like a corporate assistant.';

// shared tail, common to every account kind's summary prompt
const SUMMARY_RULES =
  'Use only the figures you are given: never calculate, estimate or invent a ' +
  'number, and never name a category that is not in the list. Every number ' +
  'you write must be one that appears below, essentially verbatim (rounding ' +
  'for readability is fine) — never a number you inferred, guessed, or ' +
  'recalled from a different period. You are only given each category\'s ' +
  'overall figure for the period and its usual comparison, never a ' +
  'month-by-month breakdown, so never attribute a figure to a specific ' +
  'month or claim something "spiked in March" or "has been climbing since ' +
  'June" — that level of detail was not given to you and would be ' +
  'invented. Never use an em dash (—); use a comma, a period, or just a ' +
  'plain word instead. Write no more than 55 words, as two or three sentences, each ' +
  'naming a concrete category or figure — no vague filler like "spending ' +
  'was mixed" or "a few categories changed". Write it the way you would ' +
  'actually say it out loud ' +
  'to this person, not like a report — vary your opening line rather than ' +
  'always leading with a total or the same phrase every time, and let a ' +
  'real reaction come through when a figure genuinely stands out, without ' +
  'manufacturing excitement over an ordinary month. When the numbers show ' +
  'genuine good news — spent less than usual, saved more than usual, a ' +
  'category coming in well under its usual — say so like you mean it ' +
  '("nice, you...", "good work keeping...", "well done saving...") instead ' +
  'of staying neutral about it; earn that warmth from the actual figures, ' +
  'never bolt it onto an unremarkable or genuinely bad month just to end ' +
  'on a positive note. No headings, bullet ' +
  'points, markdown, preamble, sign-off or disclaimers. Never use ' +
  'statistics jargon like "median", "average", "mean" or "baseline" — say ' +
  '"usual" instead, exactly as the facts below describe it, since the ' +
  'reader isn\'t a statistician. Never end with advice, a suggestion or a ' +
  'recommendation of any kind, generic or specific ("track your spending", ' +
  '"keep an eye on X", "consider…") — describe what happened and stop ' +
  'there. If nothing in the category detail stands out, say so plainly ' +
  'rather than manufacturing a problem. When there is no "usual" to compare ' +
  'against, work with what the period itself shows instead of commenting ' +
  'on the lack of history — never say there isn\'t enough data yet, that a ' +
  'clearer picture will emerge later, or to check back after a year or two; ' +
  'the reader wants to know what happened in the period they are already ' +
  'looking at, not when to come back.';

const SUMMARY_SYSTEM_STANDARD =
  TORI_PERSONA + ' ' +
  'Right now you are writing a very short note covering the period ' +
  'described, not chatting back and forth. The reader already sees the ' +
  'totals — came in, spent, saved — in cards right above this text, so ' +
  'never restate those totals or open with how the period "went" overall; ' +
  'that would just repeat the cards. Instead mine the category-level ' +
  'detail for the two or three most useful, specific things worth pointing ' +
  'out: which categories drove any change vs usual, or one category ' +
  'offsetting another. Talk about it the normal way money is talked about ' +
  '("you spent…", "you earned…"). ' +
  SUMMARY_RULES;

// this account is a dedicated savings account (see isSavingsAccount() in
// queries.js) — its transactions ARE the saving activity, not everyday
// spending or income, so the summary needs its own vocabulary entirely
const SUMMARY_SYSTEM_SAVINGS =
  TORI_PERSONA + ' ' +
  'Right now you are writing a very short note covering the period ' +
  'described, not chatting back and forth, for a dedicated SAVINGS account ' +
  '— every transaction on it is money moving into or out of savings, never ' +
  'everyday spending or income. The reader already sees "Came in" (paid ' +
  'into savings) and "Went out" (withdrawn from savings) in cards right ' +
  'above this text, so never restate those totals or open with how the ' +
  'period "went" overall. Instead mine the category-level detail for the ' +
  'two or three most useful, specific things worth pointing out: what ' +
  'drove a deposit or a withdrawal, or one contribution offsetting a ' +
  'withdrawal. Never call ' +
  'money going in "income" or "earnings" and never call money going out ' +
  '"spending" or "expenses" — describe it as paying into, putting aside, ' +
  'adding to, withdrawing from, or dipping into savings instead. ' +
  SUMMARY_RULES;

const summarySystem = (isSavingsAccount) => (isSavingsAccount ? SUMMARY_SYSTEM_SAVINGS : SUMMARY_SYSTEM_STANDARD);

/**
 * The exact text sent to the AI for a period summary: every figure already
 * formatted, so the model narrates rather than calculates. Exported so it is
 * easy to audit what leaves the server — category names and totals, never an
 * individual transaction.
 *
 * @param {ReturnType<import('./queries.js').periodInsights>} insights
 * @param {string} currency
 * @param {{ isSavingsAccount?: boolean, username?: string|null, accountName?: string|null, milestone?: {amount:number,total:number}|null }} [opts]
 *   `isSavingsAccount: true` when this period is scoped to a dedicated savings account (see
 *   isSavingsAccount() in queries.js) — `earned`/`spent` there are deposits/withdrawals, not
 *   everyday income or spending, and `saved` is always 0 since it isn't tracked separately for
 *   that account. `username`/`accountName`/`milestone` are optional personalisation context —
 *   each is only worth passing when it's genuinely usable (see the guards where they're read).
 */
export function buildPeriodFacts(
  insights,
  currency,
  { isSavingsAccount = false, username = null, accountName = null, milestone = null } = {}
) {
  const money = (n) => formatMoney(n, currency);
  const b = insights.baseline;
  const lines = [];

  // a first name is a nice, cheap way to make this feel written for them —
  // but `username` can be anything up to an email address (see Settings),
  // so only pass it through when it actually reads like a first name
  if (/^[A-Za-z][A-Za-z'-]{1,24}$/.test(username || '')) {
    lines.push(
      `Reader's first name: ${username}. You may open with it or work it in once if it lands ` +
        'naturally — never more than once, and it is completely fine to skip it rather than force it.'
    );
  }
  // "Main account" etc. is the seeded default name, not something the user
  // chose — only real context if they actually renamed it to something
  if (accountName && !/^(main account|checking|savings|account)$/i.test(accountName.trim())) {
    lines.push(
      `This is their "${accountName}" account. Let what that name implies about the money's ` +
        "purpose flavour the note where it genuinely fits — never force a mention if it doesn't."
    );
  }

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
  // for a single (possibly partial) month, compare the actual figure so far
  // against a baseline already scaled down to the same share — never the
  // full-month-projected `avg`, which would inflate "more than usual" by
  // however much of the month is still left to go
  const basis = (key) => (insights.single ? insights[key] : insights.avg[key]);

  if (isSavingsAccount) {
    lines.push('This account is a dedicated savings account — every figure below is savings activity, not everyday income or spending.');
    lines.push(`Paid into savings: ${money(insights.earned)}` + (insights.single ? '' : ` in total, ${money(insights.avg.earned)}${per}`) + cmp(basis('earned'), b?.earned));
    lines.push(`Withdrawn from savings: ${money(insights.spent)}` + (insights.single ? '' : ` in total, ${money(insights.avg.spent)}${per}`) + cmp(basis('spent'), b?.spent));
  } else {
    lines.push(`Came in: ${money(insights.earned)}` + (insights.single ? '' : ` in total, ${money(insights.avg.earned)}${per}`) + cmp(basis('earned'), b?.earned));
    lines.push(`Spent: ${money(insights.spent)}` + (insights.single ? '' : ` in total, ${money(insights.avg.spent)}${per}`) + cmp(basis('spent'), b?.spent));
    if (insights.saved > 0) {
      lines.push(`Saved: ${money(insights.saved)}` + (insights.single ? '' : ` in total, ${money(insights.avg.saved)}${per}`) + cmp(basis('saved'), b?.saved));
    } else if (insights.saved < 0) {
      lines.push(`Taken back out of savings: ${money(-insights.saved)}`);
    }
    if (insights.saved) {
      lines.push(
        'Money moved into savings is excluded from the "Spent" figure. Do not describe ' +
          'it as spending.'
      );
    }
  }
  if (b) {
    lines.push(
      `"Usual" means this person's own typical month across the ${b.months} month${b.months === 1 ? '' : 's'} before this period (the middle value across those months, not a plain average, so one unusually big or quiet month doesn't skew it — but say "usual", never "median", to the reader).`
    );
  } else {
    lines.push(
      'There is nothing before this period to compare against, so there is no "usual" for ' +
        'anything below — do not mention that, ask the reader to wait, or say a clearer ' +
        'picture will emerge later; just describe what these categories show for this period ' +
        'using the figures given.'
    );
  }

  if (insights.movers.length) {
    const moversLabel = isSavingsAccount ? 'Biggest movers vs usual' : 'Biggest changes vs usual';
    // spell out what basis these per-category figures are on, so the model
    // never states a partial-month actual or a typical-month median as if
    // it were the category's total for the whole period
    const moversNote = insights.single
      ? insights.partial
        ? ' (actuals so far this month, not projected to a full month)'
        : ''
      : ' (each a typical month for that category, i.e. the median month, not a period total)';
    lines.push('', `${moversLabel}${moversNote}:`);
    for (const m of insights.movers) {
      // each mover is tagged as a trend (a real streak behind it) or a
      // one-off (none) — see the instruction below for how to use this
      const pattern = m.streakMonths
        ? `an established trend, ${m.streakMonths} months running including this one`
        : 'a one-off this period, no streak behind it';
      lines.push(
        `- ${m.name}: ${money(m.spent)} (usual ${money(m.usual)} — ` +
          `${money(Math.abs(m.delta))} ${m.delta > 0 ? 'more' : 'less'}) [${pattern}]`
      );
    }
    lines.push(
      'The bracketed tag after each mover says whether it is backed by a real streak or is a ' +
        'one-off. Reflect that distinction in your wording: call a trend a trend (e.g. "keeps ' +
        'running higher", "third month in a row"), and call a one-off exactly that (e.g. "a ' +
        'one-off", "a one-time thing", "unusual this month") — never describe a one-off mover ' +
        'as if it were an ongoing pattern, and never call an established trend a one-off.'
    );
  } else if (insights.topCategories.length) {
    // no baseline to compare against (first period on record, or too early
    // to trust one) — these are simply the biggest categories for the
    // period itself, nothing to weigh them against
    lines.push('', `Biggest categories this period (period totals, no "usual" to compare against):`);
    for (const c of insights.topCategories) {
      lines.push(`- ${c.name}: ${money(c.total)}`);
    }
  }

  if (milestone) {
    lines.push(
      '',
      `Their all-time total ever put into savings passed ${money(milestone.amount)} during this ` +
        `period (now ${money(milestone.total)} in total) — a genuine milestone, worth a mention ` +
        "if it fits naturally (don't force it)."
    );
  }

  return lines.join('\n');
}

/**
 * Turn the numbers from `periodInsights` into a plain-English read of the period.
 * @param {ReturnType<import('./queries.js').periodInsights>} insights
 * @param {string} currency
 * @param {{ isSavingsAccount?: boolean }} [opts] see buildPeriodFacts()
 */
export async function summarisePeriod(insights, currency, opts = {}) {
  const model = getModel();
  const facts = buildPeriodFacts(insights, currency, opts);
  const { text, usage } = await callText({
    system: summarySystem(opts.isSavingsAccount),
    userText: facts,
    maxTokens: 200,
    model
  });
  if (text && !verifiedAgainstFacts(text, facts, currency)) {
    console.warn('[ai] period summary cited a figure not in the facts sheet, discarding:', text);
    return { text: '', usage, costUsd: estimateCost(usage, model) };
  }
  return { text, usage, costUsd: estimateCost(usage, model) };
}

/**
 * Bumped whenever the savings-summary prompt changes, same purpose as
 * SUMMARY_VERSION above.
 */
export const SAVINGS_SUMMARY_VERSION = 2;

const SAVINGS_SUMMARY_SYSTEM =
  TORI_PERSONA + ' ' +
  'Right now you are writing a very short note on how someone has been ' +
  'putting money aside, covering the period described, not chatting back ' +
  'and forth. Use only the figures you are given: never calculate, ' +
  'estimate or invent a number. Write no more than 45 words, as one or two ' +
  'sentences, in your own voice rather than a report, and call out ' +
  'whatever a plain reader would actually notice — a lump sum much bigger ' +
  'than the rest, a month with nothing set aside, money taken back out, or ' +
  'a clear run of months trending up or down. If the monthly amounts are ' +
  'fairly steady with nothing to point at, say that plainly rather than ' +
  'manufacturing a pattern. No headings, bullet points, markdown, ' +
  'preamble, sign-off or disclaimers.';

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
  const facts = buildSavingsFacts(series, currency);
  const { text, usage } = await callText({
    system: SAVINGS_SUMMARY_SYSTEM,
    userText: facts,
    maxTokens: 150,
    model
  });
  if (text && !verifiedAgainstFacts(text, facts, currency)) {
    console.warn('[ai] savings summary cited a figure not in the facts sheet, discarding:', text);
    return { text: '', usage, costUsd: estimateCost(usage, model) };
  }
  return { text, usage, costUsd: estimateCost(usage, model) };
}

/* ------------------------------------------------------------ chat with your data */

// Tool round-trips per user message. A charted comparison legitimately needs
// several: resolve the category, fetch a total per month, call show_chart, then
// one more turn to actually write the answer once the chart comes back. Four
// was not enough for that, and the question failed *after* drawing the chart.
const CHAT_MAX_ROUNDS = 7;
const CHAT_TOOL_TIMEOUT_TEXT =
  "That needed more digging than I can do in one go — try asking something narrower, like a shorter date range or one category.";

/**
 * Never hand back an empty bubble. The model sometimes ends a charted answer
 * with the chart alone, which renders as a chart above nothing at all.
 */
function textOrFallback(text, charts) {
  const t = (text || '').trim();
  if (t) return t;
  const title = charts?.[charts.length - 1]?.title;
  return title ? `Here's ${title.charAt(0).toLowerCase()}${title.slice(1)}.` : '';
}

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
    description: 'List individual transactions matching a filter — for "show me" / "when did I" questions about specific line items, and for a spending/income total by merchant, note or other text that is not an actual category (sum the returned amounts yourself).',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to', 'category_id', 'search', 'direction', 'limit'],
      properties: {
        from: { type: ['string', 'null'], description: 'YYYY-MM-DD lower bound, inclusive, or null' },
        to: { type: ['string', 'null'], description: 'YYYY-MM-DD upper bound, inclusive, or null' },
        category_id: { type: ['integer', 'null'], description: 'Restrict to one category id, or null' },
        search: { type: ['string', 'null'], description: 'Case-insensitive substring of the description or notes, or null' },
        direction: { type: ['string', 'null'], description: '"in" for money received, "out" for money spent, or null for both' },
        limit: { type: 'integer', description: 'Max rows to return, 1-30' }
      }
    }
  },
  {
    name: 'period_summary',
    description: 'Earned/spent/saved for a period, and how it compares to this person\'s usual (median) month — for "how am I doing" / "is this more than usual" / "how does this compare to usual" questions. The result already includes vsUsualPct and each mover\'s pctChange, so quote those directly rather than computing a percentage yourself.',
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
    description: "Target vs. actual per category for one month — for questions about budgets or targets. Includes pct (% of target) and pctOver (% over/under target); quote those directly rather than deriving one from the other.",
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
        category: r.category_name || null,
        notes: r.notes || null
      }));
    }

    case 'period_summary': {
      const ins = periodInsights(userId, input.from, input.to, accountId);
      // same basis periodInsights itself compares against "usual" with — a
      // single month's own actual, or the period's typical (median) month
      const basis = (key) => (ins.single ? ins[key] : ins.avg[key]);
      return {
        earned: ins.earned,
        spent: ins.spent,
        saved: ins.saved,
        kept: ins.kept,
        savingsRate: ins.rate,
        avgPerMonth: ins.avg,
        usualBaseline: ins.baseline,
        // computed here, not left for the model to work out — "how does this
        // compare to usual" is exactly the question that invited it to invent
        // its own percentage, which the fact-checking below then had to reject
        vsUsualPct: ins.baseline && {
          earned: pctVsUsual(basis('earned'), ins.baseline.earned),
          spent: pctVsUsual(basis('spent'), ins.baseline.spent),
          saved: pctVsUsual(basis('saved'), ins.baseline.saved)
        },
        biggestMovesVsUsual: ins.movers.map((m) => ({ ...m, pctChange: pctVsUsual(m.spent, m.usual) }))
      };
    }

    case 'budget_status':
      // pct ("% of target") and pctOver ("% over/under target", the more
      // natural way to say it — "19% over" rather than "119% of target") are
      // both included so the model never has to derive one from the other
      return budgetStatus(userId, input.month, accountId).map((r) => ({
        name: r.name,
        kind: r.kind,
        target: r.target,
        actual: r.actual,
        remaining: r.remaining,
        pct: r.pct,
        pctOver: r.target ? pctVsUsual(r.actual, r.target) : null
      }));

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const chatToolSpecs = CHAT_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

/**
 * Every number appearing in the tool results a chat answer was built from.
 * Unlike a summary's facts sheet these are raw JSON, so take *all* numeric
 * literals rather than only money-shaped ones — ids and counts among them.
 * Over-collecting here only makes the check more forgiving, which is the right
 * way to be wrong: a false rejection would throw away a good answer.
 */
/**
 * Every number in a tool result, split by whether its own JSON key marks it
 * as a percentage (pct/percent/rate) or not — so a currency-tagged figure in
 * the answer can't be satisfied by a percentage that happens to share the
 * same digits, and vice versa. This is what actually caught the model
 * writing "€19 over" when pctOver was 19 but the real amount was €15: 19
 * genuinely appears in the tool result, just as a percentage, not a euro
 * amount. Falls back to one undifferentiated pool (as "other") when a result
 * isn't parseable JSON (e.g. `{"error": "..."}` already came through that way).
 */
function numbersInToolResults(results) {
  const percent = [];
  const other = [];
  // a tool result stores a shortfall/decrease as a signed negative (delta:
  // -330, pctChange: -45), but natural phrasing states the magnitude with a
  // directional word instead ("in the red by €330", "cut by 45%") rather
  // than literally writing "-45%" — both are the same fact, so both must be
  // recognised as grounded
  const add = (pool, n) => {
    pool.push(n);
    if (n < 0) pool.push(-n);
  };
  const isPct = (key) => key != null && /pct|percent|rate/i.test(key);
  // once a key on the way down says "percentage" (vsUsualPct, pctChange...),
  // every number nested under it is one too, even where the leaf's own key
  // is a plain name shared with a currency field elsewhere — vsUsualPct.spent
  // is a percentage, not an amount, despite being called "spent"
  const walk = (node, key, pct) => {
    const nowPct = pct || isPct(key);
    if (typeof node === 'number' && Number.isFinite(node)) add(nowPct ? percent : other, node);
    else if (Array.isArray(node)) for (const v of node) walk(v, key, nowPct);
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k, nowPct);
  };
  for (const r of results) {
    try {
      walk(JSON.parse(r), null, false);
    } catch {
      for (const m of String(r).matchAll(/-?\d+(?:\.\d+)?/g)) {
        const n = parseFloat(m[0]);
        if (Number.isFinite(n)) add(other, n);
      }
    }
  }
  return { percent, other };
}

/**
 * The chat equivalent of verifiedAgainstFacts: every figure the answer states
 * has to trace back to something a tool actually returned, and a percentage
 * must trace back to a percentage specifically (see numbersInToolResults).
 * Chat is already grounded by its tools, so this is a backstop against the
 * model doing its own arithmetic in prose — the one thing tool-calling does
 * not prevent.
 * @param {string} text @param {string[]} toolResults @param {string} currency
 */
export function groundedInToolResults(text, toolResults, currency) {
  const said = extractTypedAmounts(text, currency);
  if (!said.length || !toolResults.length) return true;
  const { percent, other } = numbersInToolResults(toolResults);
  const near = (n, pool) => pool.some((g) => Math.abs(n - g) <= roundingTolerance(n));
  return said.every((a) => near(a.value, a.kind === 'percent' ? percent : other));
}

/**
 * The answer to hand back: the model's own words when its figures check out,
 * a chart-naming fallback when it said nothing at all, and a refusal when it
 * stated a figure no tool returned.
 */
function verifiedChatText(said, toolResults, charts, currency) {
  const text = textOrFallback(said, charts);
  if (!text || groundedInToolResults(text, toolResults, currency)) return text;
  console.warn('[ai] chat answer cited a figure no tool returned, withholding:', text);
  return CHAT_UNVERIFIED_TEXT;
}

const CHAT_UNVERIFIED_TEXT =
  "I worked that out but the figures didn't line up with what I looked up, so I'd rather not guess — ask me again, or narrow it to one category or month.";

async function chatTurnAnthropic({ system, messages, userId, accountId, model, apiKeyOverride, currency }) {
  const anthropic = client('anthropic', apiKeyOverride);
  const usage = { input: 0, output: 0 };
  const charts = [];
  const toolResults = [];
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
      const said = res.content.find((b) => b.type === 'text')?.text ?? '';
      return { text: verifiedChatText(said, toolResults, charts, currency), usage, charts };
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
        toolResults.push(content);
        return { type: 'tool_result', tool_use_id: tu.id, content };
      })
    });
  }

  // Out of rounds, but the tool results gathered so far usually already answer
  // the question — ask once more with the tools withdrawn so it has to reply in
  // prose, instead of apologising on top of a chart it just drew.
  try {
    const res = await anthropic.messages.create({
      ...requestParams(model),
      max_tokens: 1024,
      system,
      messages: [...convo, { role: 'user', content: CHAT_WRAP_UP }]
    });
    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    const said = res.content.find((b) => b.type === 'text')?.text ?? '';
    return {
      text: verifiedChatText(said, toolResults, charts, currency) || CHAT_TOOL_TIMEOUT_TEXT,
      usage,
      charts
    };
  } catch {
    return { text: textOrFallback('', charts) || CHAT_TOOL_TIMEOUT_TEXT, usage, charts };
  }
}

async function chatTurnOpenAI({ system, messages, userId, accountId, model, apiKeyOverride, currency }) {
  const openai = client('openai', apiKeyOverride);
  const usage = { input: 0, output: 0 };
  const charts = [];
  const toolResults = [];
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
    if (!calls.length) return { text: verifiedChatText(msg?.content, toolResults, charts, currency), usage, charts };

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
      toolResults.push(content);
      convo.push({ role: 'tool', tool_call_id: c.id, content });
    }
  }

  // same wrap-up as the Anthropic path above
  try {
    const res = await openai.chat.completions.create({
      model,
      max_completion_tokens: 1024,
      messages: [...convo, { role: 'user', content: CHAT_WRAP_UP }]
    });
    usage.input += res.usage?.prompt_tokens ?? 0;
    usage.output += res.usage?.completion_tokens ?? 0;
    const said = res.choices?.[0]?.message?.content ?? '';
    return {
      text: verifiedChatText(said, toolResults, charts, currency) || CHAT_TOOL_TIMEOUT_TEXT,
      usage,
      charts
    };
  } catch {
    return { text: textOrFallback('', charts) || CHAT_TOOL_TIMEOUT_TEXT, usage, charts };
  }
}

const CHAT_WRAP_UP =
  'Answer now in plain prose, using only the figures already returned by the tools above. ' +
  'Do not ask for another lookup. If those results do not fully answer the question, say what ' +
  'they do show and what is missing.';

const CHAT_SYSTEM = (currency, today) =>
  TORI_PERSONA + ' ' +
  `Today is ${today} (current month ${today.slice(0, 7)}). Amounts are in ${currency}. ` +
  'Always call a tool before stating any figure — never guess, calculate from memory, or ' +
  'reuse a number from earlier in the conversation without re-checking it. Use list_categories ' +
  'to resolve a category name to its id, category_totals for spending/income by category, ' +
  'search_transactions for specific line items, period_summary for how a period compares to ' +
  'usual, and budget_status for target-vs-actual in a month. period_summary\'s vsUsualPct and ' +
  'each mover\'s pctChange are already "how much more or less than usual", so a value of 133 ' +
  'means "133% more than usual" (roughly 2.3x), never "133% of usual" (which would mean only ' +
  '33% more) — get that wrong and the number is technically present but the sentence around it ' +
  'is not. budget_status\'s pct is "how much of the target" (119 means "at 119% of budget"), ' +
  'while its pctOver is already the over/under difference (19 means "19% over budget", -10 ' +
  'means "10% under") — say whichever one you were given, never turn one into the other or ' +
  'subtract 100 from pct yourself. Transactions can carry a short ' +
  'free-text note as well as a description — search_transactions\'s search argument checks ' +
  'both. A spending/income question naming something that is not one of this person\'s actual ' +
  'categories (confirm against list_categories, don\'t assume) — a merchant, a note, a label ' +
  'like "car insurance" — has no category_totals answer; call search_transactions with that ' +
  'text instead and add up the returned amounts yourself rather than concluding it can\'t be ' +
  'answered. If a question needs a date range and none is given, assume the current month ' +
  'unless context suggests otherwise — but that default is for spending/period questions ' +
  'specifically; a lookup by name, description or note with no period mentioned at all is not ' +
  'time-scoped, so pass null for from/to there instead of silently limiting it to this month. When a ' +
  'comparison across categories or months would be clearer as a chart, call show_chart with ' +
  'the numbers you already looked up (it does not fetch anything itself). The chart never ' +
  'stands on its own: after calling it, write the answer in words as well, saying what the ' +
  'chart shows — which is biggest, what moved, what the reader should take from it. A reply ' +
  'that is only a chart is not an answer, and neither is one that just names the chart. ' +
  'Keep answers short and concrete — a ' +
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
  const { text, usage, charts } = await turn({ system, messages: history, userId, accountId, model, currency });
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
