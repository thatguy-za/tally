import { env } from '$env/dynamic/private';
import { db } from './db.js';

/**
 * Claude models an admin can pick for categorisation. `input`/`output` are
 * USD per 1M tokens, used only to show a rough cost estimate after a run.
 */
export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — most capable', input: 5, output: 25 },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced', input: 2, output: 10 },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest & cheapest', input: 1, output: 5 }
];
const DEFAULT_MODEL = 'claude-opus-5';

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

/** The API key actually used: env var wins, else the admin-supplied one. */
export function getApiKey() {
  return env.ANTHROPIC_API_KEY || getSetting('anthropic_api_key') || null;
}

export function getModel() {
  const m = getSetting('anthropic_model');
  return AI_MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL;
}

/** @returns {{ configured: boolean, keyFromEnv: boolean, keyMask: string|null, model: string, models: typeof AI_MODELS }} */
export function aiStatus() {
  const key = getApiKey();
  const fromEnv = !!env.ANTHROPIC_API_KEY;
  return {
    configured: !!key,
    keyFromEnv: fromEnv,
    keyMask: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null,
    model: getModel(),
    models: AI_MODELS
  };
}

/** Is AI categorisation available to users right now? */
export function aiEnabled() {
  return !!getApiKey();
}
