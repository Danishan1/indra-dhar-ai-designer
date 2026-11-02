import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createProvider, providerStatuses, readAiEnv } from './config.js';
import { FakeProvider } from './fake.js';
import { GeminiProvider } from './gemini.js';
import { extractJson } from './json.js';
import { OpenAiProvider } from './openai.js';
import { AiProviderError, type StructuredRequest } from './types.js';

const schema = z.object({ garment: z.string(), parts: z.array(z.string()) });
const req: StructuredRequest<z.infer<typeof schema>> = {
  task: 'garment_decomposition',
  system: 'You analyse garments.',
  prompt: 'What is this?',
  images: [{ mediaType: 'image/png', data: new Uint8Array([1, 2, 3]), label: 'sketch' }],
  schema,
  shapeHint: '{"garment": string, "parts": string[]}',
};

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('AI provider layer (ADR-056)', () => {
  it('extracts JSON from fenced or chatty answers', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a": [1]} done')).toEqual({ a: [1] });
  });

  it('Gemini: sends images inline with the key in a header, validates and reports usage', async () => {
    const fetch = respond({
      candidates: [{ content: { parts: [{ text: '{"garment":"shirt","parts":["collar"]}' }] } }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
    });
    const p = new GeminiProvider({ apiKey: 'k1', textModel: 'tm', imageModel: 'im', fetch });
    const r = await p.generateStructured(req);
    expect(r.data).toEqual({ garment: 'shirt', parts: ['collar'] });
    expect(r.usage).toMatchObject({
      provider: 'gemini',
      model: 'tm',
      inputTokens: 50,
      outputTokens: 10,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/tm:generateContent');
    expect(url).not.toContain('k1');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k1');
    expect(String(init.body)).toContain('"inline_data"');
  });

  it('retries once with the validation error, then fails clearly', async () => {
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      const text = n === 1 ? '{"garment": 3}' : '{"garment":"dress","parts":[]}';
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    });
    const p = new GeminiProvider({ apiKey: 'k', textModel: 't', imageModel: 'i', fetch });
    expect((await p.generateStructured(req)).data.garment).toBe('dress');
    expect(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)).toContain(
      'did not match',
    );
    const bad = respond({ candidates: [{ content: { parts: [{ text: 'nope' }] } }] });
    await expect(
      new GeminiProvider({
        apiKey: 'k',
        textModel: 't',
        imageModel: 'i',
        fetch: bad,
      }).generateStructured(req),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('maps HTTP failures without leaking the key', async () => {
    const p = new OpenAiProvider({
      apiKey: 'sk-secret',
      textModel: 't',
      imageModel: 'i',
      fetch: respond({ error: 'x' }, 401),
    });
    const err = (await p.generateStructured(req).catch((e: unknown) => e)) as AiProviderError;
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.kind).toBe('auth');
    expect(err.message).not.toContain('sk-secret');
    const limited = new OpenAiProvider({
      apiKey: 'k',
      textModel: 't',
      imageModel: 'i',
      fetch: respond({}, 429),
    });
    await expect(limited.generateStructured(req)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryable: true,
    });
  });

  it('OpenAI: JSON mode chat for analysis; edits endpoint when reference images are given', async () => {
    const chat = respond({
      choices: [{ message: { content: '{"garment":"skirt","parts":["waistband"]}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 5 },
    });
    const p = new OpenAiProvider({ apiKey: 'k', textModel: 'gpt', imageModel: 'img', fetch: chat });
    expect((await p.generateStructured(req)).data.parts).toEqual(['waistband']);
    const body = JSON.parse(
      String((chat.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt', response_format: { type: 'json_object' } });

    const png = Buffer.from('fake-png').toString('base64');
    const images = respond({ data: [{ b64_json: png }] });
    const q = new OpenAiProvider({
      apiKey: 'k',
      textModel: 'gpt',
      imageModel: 'img',
      fetch: images,
    });
    const out = await q.generateImage({
      task: 'image_model',
      prompt: 'model wearing the shirt',
      referenceImages: [{ mediaType: 'image/png', data: new Uint8Array([1]) }],
      aspect: 'portrait',
    });
    expect(Buffer.from(out.image.data).toString()).toBe('fake-png');
    expect((images.mock.calls[0] as unknown as [string])[0]).toContain('/images/edits');
  });

  it('fake provider answers from responders and draws placeholders; config picks the provider', async () => {
    const fake = new FakeProvider({
      garment_decomposition: () => ({ garment: 'tshirt', parts: [] }),
    });
    expect((await fake.generateStructured(req)).data.garment).toBe('tshirt');
    const img = await fake.generateImage({
      task: 'image_mannequin',
      prompt: 'x',
      referenceImages: [],
      aspect: 'portrait',
    });
    expect(new TextDecoder().decode(img.image.data)).toContain('On mannequin');
    const env = readAiEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' });
    expect(createProvider(env).name).toBe('gemini');
    expect(() => createProvider(readAiEnv({ AI_PROVIDER: 'openai' }))).toThrow(/OPENAI_API_KEY/);
    expect(providerStatuses(env).find((s) => s.name === 'openai')?.configured).toBe(false);
    expect(JSON.stringify(providerStatuses(env))).not.toContain('"g"');
  });
});
