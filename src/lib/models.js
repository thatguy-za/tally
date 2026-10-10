/**
 * Helpers for comparing the models a provider says are available with the
 * ones this app already offers. Pure, so it can be tested without a network.
 */

/**
 * Strips a trailing release date, so a dated snapshot and its alias are the
 * same model: "claude-haiku-4-5-20251001" and "gpt-4o-2024-08-06" become
 * "claude-haiku-4-5" and "gpt-4o".
 */
export const baseModelId = (id) => String(id).replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '');

// providers list everything they host next to the chat models: embeddings,
// speech, images, moderation, and models that only speak other APIs
const NOT_CHAT = /audio|realtime|transcribe|diarize|tts|image|embedding|moderation|search|instruct|whisper|dall-e|computer-use|codex/;

/** Whether `id` looks like a text chat model this app could actually call. */
export function isChatModel(provider, id) {
  if (provider === 'anthropic') return id.startsWith('claude-');
  if (!/^(gpt-|o\d)/.test(id)) return false;
  return !NOT_CHAT.test(id);
}

/**
 * What a provider's model list adds to, or lacks from, the models already
 * offered.
 * @param {string} provider
 * @param {{ id: string, label?: string, created?: number }[]} remote the provider's own list
 * @param {{ id: string }[]} known the models already offered
 * @returns {{ fresh: { id: string, label: string, created?: number }[], missing: string[] }}
 *   `fresh`: chat models not offered yet, newest first, one per model (an
 *   undated alias is preferred over a dated snapshot of it).
 *   `missing`: offered models the provider no longer lists — likely retired.
 */
export function diffModels(provider, remote, known) {
  const chat = remote.filter((m) => isChatModel(provider, m.id));

  const byBase = new Map();
  for (const m of chat) {
    const base = baseModelId(m.id);
    const have = byBase.get(base);
    const isAlias = m.id === base;
    if (!have || (isAlias && have.id !== base) || (!isAlias && have.id !== base && (m.created ?? 0) > (have.created ?? 0)))
      byBase.set(base, m);
  }

  const knownBases = new Set(known.map((m) => baseModelId(m.id)));
  const fresh = [...byBase.entries()]
    .filter(([base]) => !knownBases.has(base))
    .map(([, m]) => ({ id: m.id, label: m.label || m.id, created: m.created }))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

  const remoteBases = new Set(byBase.keys());
  const missing = known.filter((m) => !remoteBases.has(baseModelId(m.id))).map((m) => m.id);

  return { fresh, missing };
}
