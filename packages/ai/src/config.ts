import { z } from 'zod';

import { type FakeResponder, FakeProvider } from './fake.js';
import { GeminiProvider } from './gemini.js';
import { OpenAiProvider } from './openai.js';
import { type AiProvider, AiProviderError, type AiTask } from './types.js';

/**
 * AI settings from the environment (server only). `AI_PROVIDER` picks the default adapter; models
 * are configurable because vendors rename them. Keys are only ever read here.
 */
export const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(['gemini', 'openai', 'fake']).default('fake'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_TEXT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_TEXT_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),
  /** Requests per organization per day (simple preflight until metering, I24). */
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).default(300),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(180_000),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export function readAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  return aiEnvSchema.parse(env);
}

export interface ProviderStatus {
  name: 'gemini' | 'openai' | 'fake';
  configured: boolean;
  models: { text: string; image: string };
}

/** Which providers can be used (no secrets in the result). */
export function providerStatuses(env: AiEnv): ProviderStatus[] {
  return [
    {
      name: 'gemini',
      configured: !!env.GEMINI_API_KEY,
      models: { text: env.GEMINI_TEXT_MODEL, image: env.GEMINI_IMAGE_MODEL },
    },
    {
      name: 'openai',
      configured: !!env.OPENAI_API_KEY,
      models: { text: env.OPENAI_TEXT_MODEL, image: env.OPENAI_IMAGE_MODEL },
    },
    { name: 'fake', configured: true, models: { text: 'fake-text', image: 'fake-image' } },
  ];
}

export function createProvider(
  env: AiEnv,
  name: AiEnv['AI_PROVIDER'] = env.AI_PROVIDER,
  fakeResponders: Partial<Record<AiTask, FakeResponder>> = {},
): AiProvider {
  switch (name) {
    case 'gemini':
      return new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        textModel: env.GEMINI_TEXT_MODEL,
        imageModel: env.GEMINI_IMAGE_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
      });
    case 'openai':
      return new OpenAiProvider({
        apiKey: env.OPENAI_API_KEY,
        textModel: env.OPENAI_TEXT_MODEL,
        imageModel: env.OPENAI_IMAGE_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
      });
    case 'fake':
      return new FakeProvider(fakeResponders);
    default:
      throw new AiProviderError('not_configured', `Unknown AI provider ${String(name)}`, 'fake');
  }
}
