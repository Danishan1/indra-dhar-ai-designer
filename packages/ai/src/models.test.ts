import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { FakeProvider } from './fake.js';
import {
  classifyHttpError,
  discoverGeminiModels,
  discoverOpenAiModels,
  geminiCapabilities,
  modelChain,
  openAiCapabilities,
  supports,
} from './models.js';
import { routedProvider } from './router.js';
import { AiProviderError, type StructuredRequest } from './types.js';

const req: StructuredRequest<{ ok: boolean }> = {
  task: 'garment_decomposition',
  system: 's',
  prompt: 'p',
  images: [],
  schema: z.object({ ok: z.boolean() }),
  shapeHint: '{"ok":true}',
};

const geminiListing = {
  models: [
    {
      name: 'models/gemini-2.5-flash',
      supportedGenerationMethods: ['generateContent', 'countTokens'],
    },
    { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    {
      name: 'models/gemini-2.5-flash-preview-tts',
      supportedGenerationMethods: ['generateContent'],
    },
    { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
  ],
};

describe('model discovery and capabilities (ADR-057)', () => {
  it('lists Gemini models with the key in a header and derives capabilities per model', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(geminiListing)));
    const models = await discoverGeminiModels('secret-key', { fetch: fetch as never });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const by = Object.fromEntries(models.map((m) => [m.id, m]));
    expect(supports(by['gemini-2.5-flash']!, 'garment_reconstruction')).toBe(true);
    expect(supports(by['gemini-2.5-flash']!, 'image_generation')).toBe(false);
    expect(supports(by['gemini-2.5-flash-image']!, 'image_generation')).toBe(true);
    expect(supports(by['gemini-2.5-flash-image']!, 'techpack_documentation')).toBe(false);
    expect(by['text-embedding-004']!.capabilities).toEqual([]);
    expect(by['gemini-2.5-flash-preview-tts']!.capabilities).toEqual([]);
    expect(by['imagen-4.0-generate-001']!.capabilities).toEqual([]); // predict, not generateContent
    expect(supports(by['gemma-3-27b-it']!, 'garment_reconstruction')).toBe(false);
    expect(
      geminiCapabilities({
        name: 'models/gemini-1.0-pro',
        supportedGenerationMethods: ['generateContent'],
      }),
    ).toEqual(['text']);
  });

  it('lists OpenAI models and only marks known families as capable', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-image-1' }, { id: 'whisper-1' }],
          }),
        ),
    );
    const models = await discoverOpenAiModels('k', { fetch: fetch as never });
    expect(models.map((m) => [m.id, m.capabilities.length > 0])).toEqual([
      ['gpt-4.1-mini', true],
      ['gpt-image-1', true],
      ['whisper-1', false],
    ]);
    expect(openAiCapabilities('gpt-image-1')).not.toContain('structured_output');
  });

  it('classifies provider errors so fallback can decide', () => {
    expect(
      classifyHttpError(
        'gemini',
        404,
        JSON.stringify({
          error: {
            code: 404,
            message:
              'models/gemini-3.1-flash is not found for API version v1beta, or is not supported for generateContent.',
            status: 'NOT_FOUND',
          },
        }),
      ).kind,
    ).toBe('model_unavailable');
    expect(
      classifyHttpError(
        'gemini',
        400,
        JSON.stringify({
          error: {
            message: '* GenerateContentRequest.model: unexpected model name format',
            status: 'INVALID_ARGUMENT',
          },
        }),
      ).kind,
    ).toBe('model_unavailable');
    expect(
      classifyHttpError(
        'gemini',
        400,
        JSON.stringify({
          error: {
            message: 'API key not valid. Please pass a valid API key.',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        }),
      ).kind,
    ).toBe('auth');
    expect(
      classifyHttpError('openai', 429, '{"error":{"message":"You exceeded your current quota"}}')
        .kind,
    ).toBe('quota');
    expect(classifyHttpError('gemini', 503, 'busy').kind).toBe('unavailable');
    expect(classifyHttpError('gemini', 403, 'PERMISSION_DENIED').kind).toBe('auth');
  });

  it('builds capability-safe chains: preference first, never an incompatible model', () => {
    const catalog = [
      {
        provider: 'gemini' as const,
        id: 'gemini-2.5-flash',
        displayName: '',
        capabilities: ['text', 'vision', 'multi_image', 'structured_output'] as never,
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        stage: 'stable' as const,
      },
      {
        provider: 'gemini' as const,
        id: 'gemini-2.5-pro',
        displayName: '',
        capabilities: ['text', 'vision', 'multi_image', 'structured_output'] as never,
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        stage: 'stable' as const,
      },
      {
        provider: 'gemini' as const,
        id: 'gemini-2.5-flash-image',
        displayName: '',
        capabilities: [
          'text',
          'vision',
          'multi_image',
          'image_generation',
          'image_editing',
        ] as never,
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        stage: 'stable' as const,
      },
      {
        provider: 'openai' as const,
        id: 'gpt-4.1-mini',
        displayName: '',
        capabilities: ['text', 'vision', 'multi_image', 'structured_output'] as never,
        methods: [],
        inputTokenLimit: null,
        outputTokenLimit: null,
        stage: 'stable' as const,
      },
    ];
    expect(
      modelChain({
        operation: 'garment_reconstruction',
        catalog,
        preference: { provider: 'gemini', model: 'gemini-2.5-pro' },
      }),
    ).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-pro' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
    ]);
    expect(modelChain({ operation: 'image_generation', catalog, crossProvider: true })).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-flash-image' },
    ]);
    // A preference for an unlisted or incompatible model is ignored.
    expect(
      modelChain({
        operation: 'image_generation',
        catalog,
        preference: { provider: 'gemini', model: 'gemini-2.5-flash' },
      })[0]!.model,
    ).toBe('gemini-2.5-flash-image');
    expect(
      modelChain({
        operation: 'garment_reconstruction',
        catalog,
        provider: 'gemini',
        crossProvider: true,
      }).at(-1),
    ).toEqual({ provider: 'openai', model: 'gpt-4.1-mini' });
  });
});

describe('routed provider: retry and capability-safe fallback', () => {
  const fail = (kind: ConstructorParameters<typeof AiProviderError>[0]) => () => {
    throw new AiProviderError(kind, kind, 'gemini');
  };

  it('moves to the next compatible model on model errors and records the history', async () => {
    const p = routedProvider({
      chainFor: () => [
        { provider: 'gemini', model: 'gone' },
        { provider: 'gemini', model: 'good' },
      ],
      create: (ref) =>
        new FakeProvider({
          garment_decomposition:
            ref.model === 'gone' ? fail('model_unavailable') : () => ({ ok: true }),
        }),
      busyRetries: 1,
      busyWaitMs: 1,
      sleep: async () => undefined,
    });
    expect((await p.generateStructured(req)).data.ok).toBe(true);
    expect(p.history.map((h) => [h.model, h.outcome, h.errorKind])).toEqual([
      ['gone', 'failed', 'model_unavailable'],
      ['good', 'succeeded', null],
    ]);
  });

  it('retries busy models with backoff, skips a provider with a bad key, stops on refusals', async () => {
    let busy = 0;
    const p = routedProvider({
      chainFor: () => [
        { provider: 'gemini', model: 'a' },
        { provider: 'gemini', model: 'b' },
        { provider: 'openai', model: 'c' },
      ],
      create: (ref) =>
        new FakeProvider({
          garment_decomposition:
            ref.model === 'a'
              ? () => {
                  busy++;
                  throw new AiProviderError('unavailable', 'busy', 'gemini');
                }
              : ref.model === 'b'
                ? fail('auth')
                : () => ({ ok: true }),
        }),
      busyRetries: 2,
      busyWaitMs: 1,
      sleep: async () => undefined,
    });
    expect((await p.generateStructured(req)).data.ok).toBe(true);
    expect(busy).toBe(3);
    expect(p.history.at(-1)).toMatchObject({ provider: 'openai', outcome: 'succeeded' });

    const auth = routedProvider({
      chainFor: () => [
        { provider: 'gemini', model: 'a' },
        { provider: 'gemini', model: 'b' },
      ],
      create: () => new FakeProvider({ garment_decomposition: fail('auth') }),
      busyRetries: 0,
      busyWaitMs: 0,
    });
    await expect(auth.generateStructured(req)).rejects.toMatchObject({ kind: 'auth' });
    expect(auth.history).toHaveLength(1); // the second Gemini model is not tried with a bad key

    const refused = routedProvider({
      chainFor: () => [
        { provider: 'gemini', model: 'a' },
        { provider: 'gemini', model: 'b' },
      ],
      create: () => new FakeProvider({ garment_decomposition: fail('refused') }),
      busyRetries: 0,
      busyWaitMs: 0,
    });
    await expect(refused.generateStructured(req)).rejects.toMatchObject({ kind: 'refused' });
    expect(refused.history).toHaveLength(1);
  });

  it('refuses clearly when no model supports the operation', async () => {
    const p = routedProvider({
      chainFor: () => [],
      create: () => new FakeProvider({}),
      busyRetries: 0,
      busyWaitMs: 0,
    });
    await expect(p.generateStructured(req)).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('planChain', () => {
  it('uses .env defaults only when listed, honours explicit providers and keeps fake separate', async () => {
    const { planChain } = await import('./catalog.js');
    const { readAiEnv } = await import('./config.js');
    const env = readAiEnv({
      GEMINI_TEXT_MODEL: 'gemini-2.5-pro',
      GEMINI_IMAGE_MODEL: 'retired-image',
    });
    const m = (id: string, caps: string[]) => ({
      provider: 'gemini' as const,
      id,
      displayName: id,
      capabilities: caps as never,
      methods: [],
      inputTokenLimit: null,
      outputTokenLimit: null,
      stage: 'stable' as const,
    });
    const catalog = [
      m('gemini-2.5-flash', ['text', 'vision', 'multi_image', 'structured_output']),
      m('gemini-2.5-pro', ['text', 'vision', 'multi_image', 'structured_output']),
      m('gemini-2.5-flash-image', ['image_generation']),
    ];
    const base = { catalog, preferences: {}, env, crossProviderFallback: true };
    expect(planChain(base, 'garment_reconstruction')[0]).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
    });
    // The .env image model is not listed (retired) → the discovered compatible model is used.
    expect(planChain(base, 'image_generation')).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-flash-image' },
    ]);
    expect(planChain({ ...base, provider: 'fake' }, 'image_generation')).toEqual([
      { provider: 'fake', model: 'fake-image' },
    ]);
    expect(planChain({ ...base, provider: 'openai' }, 'garment_reconstruction')[0]?.provider).toBe(
      'gemini',
    );
  });
});
