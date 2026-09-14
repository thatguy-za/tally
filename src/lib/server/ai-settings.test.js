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
  setSetting
} from './ai-settings.js';

// keep this suite from leaking settings into others sharing the test DB
afterEach(() => {
  setSetting('ai_provider', null);
  setSetting('anthropic_api_key', null);
  setSetting('anthropic_model', null);
  setSetting('openai_api_key', null);
  setSetting('openai_model', null);
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
    expect(s.models).toBe(AI_MODELS.openai);
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
    expect(s.modelsByProvider).toBe(AI_MODELS);
    expect(s.configured).toBe(true);
  });
});
