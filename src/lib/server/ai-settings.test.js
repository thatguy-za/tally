import { describe, it, expect, afterEach } from 'vitest';
import {
  AI_PROVIDERS,
  AI_MODELS,
  getProvider,
  getApiKey,
  getModel,
  looksLikeApiKey,
  findModelInfo,
  providerStatus,
  aiStatus,
  aiEnabled,
  setSetting,
  modelsFor,
  addCustomModel,
  removeCustomModel
} from './ai-settings.js';

// keep this suite from leaking settings into others sharing the test DB
afterEach(() => {
  setSetting('ai_provider', null);
  setSetting('anthropic_api_key', null);
  setSetting('anthropic_model', null);
  setSetting('openai_api_key', null);
  setSetting('openai_model', null);
  setSetting('anthropic_custom_models', null);
  setSetting('openai_custom_models', null);
});

describe('getProvider', () => {
  it('defaults to anthropic when nothing is set', () => {
    expect(getProvider()).toBe('anthropic');
  });

  it('respects a saved provider', () => {
    setSetting('ai_provider', 'openai');
    expect(getProvider()).toBe('openai');
  });

  it('falls back to the default for an unrecognised value', () => {
    setSetting('ai_provider', 'bogus');
    expect(getProvider()).toBe('anthropic');
  });
});

describe('getApiKey / aiEnabled', () => {
  it('is null and disabled with nothing configured', () => {
    expect(getApiKey('anthropic')).toBeNull();
    expect(getApiKey('openai')).toBeNull();
    expect(aiEnabled()).toBe(false);
  });

  it('reads the key for the provider asked, independent of the active provider', () => {
    setSetting('ai_provider', 'anthropic');
    setSetting('openai_api_key', 'sk-openai-test');
    expect(getApiKey('openai')).toBe('sk-openai-test');
    expect(getApiKey('anthropic')).toBeNull();
    // aiEnabled() only looks at the currently active provider
    expect(aiEnabled()).toBe(false);
  });

  it('enables once the active provider has a key', () => {
    setSetting('ai_provider', 'openai');
    setSetting('openai_api_key', 'sk-openai-test');
    expect(aiEnabled()).toBe(true);
  });
});

describe('getModel', () => {
  it('falls back to each provider’s own default', () => {
    expect(getModel('anthropic')).toBe('claude-opus-5');
    expect(getModel('openai')).toBe('gpt-5.1');
  });

  it('rejects a model that belongs to the other provider', () => {
    setSetting('anthropic_model', 'gpt-5.1');
    expect(getModel('anthropic')).toBe('claude-opus-5');
  });

  it('accepts a valid saved model', () => {
    setSetting('openai_model', 'gpt-5.1-nano');
    expect(getModel('openai')).toBe('gpt-5.1-nano');
  });
});

describe('looksLikeApiKey', () => {
  it('requires the sk-ant- prefix for anthropic', () => {
    expect(looksLikeApiKey('anthropic', 'sk-ant-abc123')).toBe(true);
    expect(looksLikeApiKey('anthropic', 'sk-abc123')).toBe(false);
  });

  it('accepts any sk- prefixed key for openai', () => {
    expect(looksLikeApiKey('openai', 'sk-abc123')).toBe(true);
    expect(looksLikeApiKey('openai', 'sk-proj-abc123')).toBe(true);
    expect(looksLikeApiKey('openai', 'not-a-key')).toBe(false);
  });
});

describe('findModelInfo', () => {
  it('finds a model regardless of which provider list it lives in', () => {
    expect(findModelInfo('claude-haiku-4-5')?.id).toBe('claude-haiku-4-5');
    expect(findModelInfo('gpt-5.1-mini')?.id).toBe('gpt-5.1-mini');
  });

  it('returns null for an unknown model id', () => {
    expect(findModelInfo('not-a-real-model')).toBeNull();
  });
});

describe('providerStatus / aiStatus', () => {
  it('reports unconfigured status for a provider with no key', () => {
    const s = providerStatus('openai');
    expect(s).toMatchObject({ provider: 'openai', configured: false, keyFromEnv: false, keyMask: null });
    expect(s.models).toEqual(AI_MODELS.openai);
  });

  it('masks a configured key', () => {
    setSetting('openai_api_key', 'sk-abcdefghijklmnop');
    const s = providerStatus('openai');
    expect(s.configured).toBe(true);
    expect(s.keyMask).toMatch(/^sk-abcd…/);
  });

  it('aiStatus exposes the full provider/model catalogue alongside the active provider', () => {
    setSetting('ai_provider', 'openai');
    setSetting('openai_api_key', 'sk-abcdefghijklmnop');
    const s = aiStatus();
    expect(s.provider).toBe('openai');
    expect(s.providers).toBe(AI_PROVIDERS);
    expect(s.modelsByProvider).toEqual(AI_MODELS);
    expect(s.configured).toBe(true);
  });
});

describe('models added from a provider check', () => {
  it('are offered alongside the curated list, marked as added', () => {
    addCustomModel('anthropic', 'claude-opus-6', 'Claude Opus 6');
    const models = modelsFor('anthropic');
    expect(models.slice(0, AI_MODELS.anthropic.length)).toEqual(AI_MODELS.anthropic);
    expect(models.at(-1)).toEqual({ id: 'claude-opus-6', label: 'Claude Opus 6', custom: true });
    expect(providerStatus('anthropic').models.at(-1).id).toBe('claude-opus-6');
  });

  it('can be selected, where an unknown id would fall back to the default', () => {
    setSetting('anthropic_model', 'claude-opus-6');
    expect(getModel('anthropic')).toBe('claude-opus-5');
    addCustomModel('anthropic', 'claude-opus-6', 'Claude Opus 6');
    expect(getModel('anthropic')).toBe('claude-opus-6');
  });

  it('have no known price, so no cost can be estimated', () => {
    addCustomModel('openai', 'gpt-6', 'gpt-6');
    expect(findModelInfo('gpt-6')).toMatchObject({ id: 'gpt-6' });
    expect(findModelInfo('gpt-6').input).toBeUndefined();
  });

  it('are kept per provider', () => {
    addCustomModel('openai', 'gpt-6', 'gpt-6');
    expect(modelsFor('anthropic').some((m) => m.id === 'gpt-6')).toBe(false);
  });

  it('are not added twice, nor on top of a curated one', () => {
    addCustomModel('anthropic', 'claude-opus-6', 'Claude Opus 6');
    addCustomModel('anthropic', 'claude-opus-6', 'Claude Opus 6');
    addCustomModel('anthropic', 'claude-opus-5', 'Duplicate');
    expect(modelsFor('anthropic')).toHaveLength(AI_MODELS.anthropic.length + 1);
  });

  it('reject an id that is not a plausible model name, and an unknown provider', () => {
    expect(addCustomModel('anthropic', 'bad id; drop table', 'x').ok).toBe(false);
    expect(addCustomModel('anthropic', '', 'x').ok).toBe(false);
    expect(addCustomModel('nonsense', 'claude-opus-6', 'x').ok).toBe(false);
    expect(modelsFor('anthropic')).toEqual(AI_MODELS.anthropic);
  });

  it('stop at a sensible cap', () => {
    for (let i = 0; i < 20; i++) expect(addCustomModel('openai', `gpt-x${i}`, `x${i}`).ok).toBe(true);
    expect(addCustomModel('openai', 'gpt-one-too-many', 'x').ok).toBe(false);
  });

  it('can be removed, and removing the selected one falls back to the default', () => {
    addCustomModel('anthropic', 'claude-opus-6', 'Claude Opus 6');
    setSetting('anthropic_model', 'claude-opus-6');
    removeCustomModel('anthropic', 'claude-opus-6');
    expect(modelsFor('anthropic')).toEqual(AI_MODELS.anthropic);
    expect(getModel('anthropic')).toBe('claude-opus-5');
  });
});
