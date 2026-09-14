import { env } from '$env/dynamic/private';
import { db } from './db.js';

/** The AI providers an admin can choose between for transaction categorisation. */
export const AI_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'openai', label: 'OpenAI (GPT)' }
];

/**
 * Models an admin can pick per provider. `input`/`output` are USD per 1M
 * tokens, used only to show a rough cost estimate after a run.
 */
export const AI_MODELS = {
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5 — most capable', input: 5, output: 25 },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced', input: 2, output: 10 },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest & cheapest', input: 1, output: 5 }
  ],
  openai: [
    { id: 'gpt-5.1', label: 'GPT-5.1 — most capable', input: 5, output: 15 },
    { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini — balanced', input: 0.6, output: 2.4 },
    { id: 'gpt-5.1-nano', label: 'GPT-5.1 nano — fastest & cheapest', input: 0.15, output: 0.6 }
  ]
};
const DEFAULT_MODEL = { anthropic: 'claude-opus-5', openai: 'gpt-5.1' };
const DEFAULT_PROVIDER = 'anthropic';

const getStmt = db.prepare('SELECT value FROM app_settings WHERE key = ?');
const setStmt = db.prepare(
  `INSERT INTO app_settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);
const delStmt = db.prepare('DELETE FROM app_settings WHERE key = ?');

export function getSetting(key) {
  return getStmt.get(key)?.value ?? null;
}
export function setSetting(key, value) {
  if (value == null || value === '') delStmt.run(key);
  else setStmt.run(key, String(value));
}

/** Which provider is currently active for the whole instance. */
export function getProvider() {
  const p = getSetting('ai_provider');
  return AI_PROVIDERS.some((x) => x.id === p) ? p : DEFAULT_PROVIDER;
}

const ENV_KEY = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

/** The API key actually used for `provider` (defaults to the active one): env var wins, else the admin-supplied one. */
export function getApiKey(provider = getProvider()) {
  return env[ENV_KEY[provider]] || getSetting(`${provider}_api_key`) || null;
}

export function getModel(provider = getProvider()) {
  const m = getSetting(`${provider}_model`);
  const list = AI_MODELS[provider] || [];
  return list.some((x) => x.id === m) ? m : DEFAULT_MODEL[provider];
}

/** Loose, provider-shaped sanity check for a pasted API key — not a real validation. */
export function looksLikeApiKey(provider, key) {
  return provider === 'openai' ? /^sk-/.test(key) : /^sk-ant-/.test(key);
}

/** Find a model's cost info regardless of which provider it belongs to. */
export function findModelInfo(id) {
  for (const list of Object.values(AI_MODELS)) {
    const m = list.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}

/** @returns {{ configured: boolean, keyFromEnv: boolean, keyMask: string|null, model: string, models: {id:string,label:string,input:number,output:number}[] }} */
export function providerStatus(provider) {
  const key = getApiKey(provider);
  return {
    provider,
    configured: !!key,
    keyFromEnv: !!env[ENV_KEY[provider]],
    keyMask: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null,
    model: getModel(provider),
    models: AI_MODELS[provider]
  };
}

/** Status for the currently active provider, plus the full provider/model catalogue. */
export function aiStatus() {
  const provider = getProvider();
  return {
    providers: AI_PROVIDERS,
    modelsByProvider: AI_MODELS,
    ...providerStatus(provider)
  };
}

/** Is AI categorisation available to users right now? */
export function aiEnabled() {
  return !!getApiKey();
}
