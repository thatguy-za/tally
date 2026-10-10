import { describe, it, expect } from 'vitest';
import { baseModelId, isChatModel, diffModels } from './models.js';

describe('baseModelId', () => {
  it('drops a release date, in either style', () => {
    expect(baseModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
    expect(baseModelId('gpt-4o-2024-08-06')).toBe('gpt-4o');
  });

  it('leaves an undated id alone, including version numbers', () => {
    expect(baseModelId('claude-opus-5')).toBe('claude-opus-5');
    expect(baseModelId('gpt-5.1-mini')).toBe('gpt-5.1-mini');
  });
});

describe('isChatModel', () => {
  it('accepts Claude models and nothing else for Anthropic', () => {
    expect(isChatModel('anthropic', 'claude-sonnet-5')).toBe(true);
    expect(isChatModel('anthropic', 'gpt-5.1')).toBe(false);
  });

  it('accepts OpenAI chat models, GPT and o-series', () => {
    expect(isChatModel('openai', 'gpt-5.1')).toBe(true);
    expect(isChatModel('openai', 'gpt-5.1-mini')).toBe(true);
    expect(isChatModel('openai', 'o3-mini')).toBe(true);
  });

  it('skips the non-chat models OpenAI lists alongside them', () => {
    for (const id of [
      'text-embedding-3-large',
      'whisper-1',
      'dall-e-3',
      'gpt-image-1',
      'gpt-4o-realtime-preview',
      'gpt-4o-audio-preview',
      'gpt-4o-transcribe',
      'gpt-4o-mini-tts',
      'gpt-4o-search-preview',
      'gpt-5.1-codex',
      'gpt-3.5-turbo-instruct',
      'omni-moderation-latest',
      'davinci-002'
    ])
      expect(isChatModel('openai', id), id).toBe(false);
  });
});

describe('diffModels', () => {
  const known = [{ id: 'claude-opus-5' }, { id: 'claude-haiku-4-5' }];

  it('recognises a dated snapshot as a model it already offers', () => {
    const remote = [{ id: 'claude-haiku-4-5-20251001' }, { id: 'claude-opus-5' }];
    const { fresh, missing } = diffModels('anthropic', remote, known);
    expect(fresh).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('finds a model it has not offered yet, newest first', () => {
    const remote = [
      { id: 'claude-opus-5', created: 100 },
      { id: 'claude-haiku-4-5', created: 90 },
      { id: 'claude-sonnet-6', label: 'Claude Sonnet 6', created: 300 },
      { id: 'claude-opus-6', label: 'Claude Opus 6', created: 400 }
    ];
    const { fresh } = diffModels('anthropic', remote, known);
    expect(fresh.map((m) => m.id)).toEqual(['claude-opus-6', 'claude-sonnet-6']);
    expect(fresh[0].label).toBe('Claude Opus 6');
  });

  it('lists a new model once even when several dated snapshots exist, preferring the alias', () => {
    const remote = [
      { id: 'gpt-6-2026-03-01', created: 10 },
      { id: 'gpt-6-2026-05-01', created: 20 },
      { id: 'gpt-6', created: 5 }
    ];
    expect(diffModels('openai', remote, []).fresh.map((m) => m.id)).toEqual(['gpt-6']);
  });

  it('with no alias, keeps the newest snapshot', () => {
    const remote = [
      { id: 'gpt-6-2026-03-01', created: 10 },
      { id: 'gpt-6-2026-05-01', created: 20 }
    ];
    expect(diffModels('openai', remote, []).fresh.map((m) => m.id)).toEqual(['gpt-6-2026-05-01']);
  });

  it('ignores models that are not for chat', () => {
    const remote = [{ id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'gpt-6' }];
    expect(diffModels('openai', remote, []).fresh.map((m) => m.id)).toEqual(['gpt-6']);
  });

  it('flags an offered model the provider no longer lists', () => {
    const remote = [{ id: 'claude-opus-5' }];
    expect(diffModels('anthropic', remote, known).missing).toEqual(['claude-haiku-4-5']);
  });

  it('falls back to the id when a model has no display name', () => {
    expect(diffModels('openai', [{ id: 'gpt-6' }], []).fresh[0].label).toBe('gpt-6');
  });
});
