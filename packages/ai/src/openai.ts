import { httpError, toBase64, withValidation } from './json.js';
import {
  type AiProvider,
  AiProviderError,
  type ImageRequest,
  type StructuredRequest,
} from './types.js';

export interface OpenAiConfig {
  apiKey: string;
  textModel: string;
  imageModel: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const SIZES = { portrait: '1024x1536', square: '1024x1024', landscape: '1536x1024' } as const;

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ImageResponse {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** OpenAI: Chat Completions (vision + JSON mode) and the Images API (generations / edits). */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  readonly capabilities = {
    vision: true,
    multiImage: true,
    structuredOutput: true,
    imageGeneration: true,
    referenceImages: true,
    accurateMeasurements: false,
  } as const;
  readonly models: { text: string; image: string };

  constructor(private readonly cfg: OpenAiConfig) {
    if (!cfg.apiKey)
      throw new AiProviderError('not_configured', 'OPENAI_API_KEY is not set', 'openai');
    this.models = { text: cfg.textModel, image: cfg.imageModel };
  }

  private async post(path: string, body: string | FormData, json: boolean): Promise<unknown> {
    const base = this.cfg.baseUrl ?? 'https://api.openai.com/v1';
    const f = this.cfg.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.cfg.apiKey}`,
          ...(json ? { 'content-type': 'application/json' } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 180_000),
      });
    } catch (e) {
      throw new AiProviderError(
        'unavailable',
        `OpenAI request failed: ${(e as Error).message}`,
        'openai',
      );
    }
    const text = await res.text();
    if (!res.ok) throw httpError('openai', res.status, text);
    return JSON.parse(text);
  }

  async generateStructured<T>(req: StructuredRequest<T>) {
    const started = Date.now();
    const images = req.images.flatMap((img, i) => [
      { type: 'text', text: `Image ${i + 1}${img.label ? ` (${img.label})` : ''}:` },
      {
        type: 'image_url',
        image_url: { url: `data:${img.mediaType};base64,${toBase64(img.data)}` },
      },
    ]);
    const result = await withValidation('openai', req, async (prompt) => {
      const json = (await this.post(
        '/chat/completions',
        JSON.stringify({
          model: this.models.text,
          temperature: req.temperature ?? 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: [...images, { type: 'text', text: prompt }] },
          ],
        }),
        true,
      )) as ChatResponse;
      const msg = json.choices?.[0]?.message;
      if (msg?.refusal)
        throw new AiProviderError('refused', 'OpenAI refused the request', 'openai');
      return {
        text: msg?.content ?? '',
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      };
    });
    return {
      data: result.data,
      usage: {
        provider: this.name,
        model: this.models.text,
        task: req.task,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        images: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateImage(req: ImageRequest) {
    const started = Date.now();
    let json: ImageResponse;
    if (req.referenceImages.length) {
      const form = new FormData();
      form.append('model', this.models.image);
      form.append('prompt', req.prompt);
      form.append('size', SIZES[req.aspect]);
      req.referenceImages.slice(0, 8).forEach((img, i) => {
        const ext = img.mediaType.split('/')[1] ?? 'png';
        form.append(
          'image[]',
          new Blob([Buffer.from(img.data)], { type: img.mediaType }),
          `ref-${i}.${ext}`,
        );
      });
      json = (await this.post('/images/edits', form, false)) as ImageResponse;
    } else {
      json = (await this.post(
        '/images/generations',
        JSON.stringify({ model: this.models.image, prompt: req.prompt, size: SIZES[req.aspect] }),
        true,
      )) as ImageResponse;
    }
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new AiProviderError('invalid_response', 'OpenAI returned no image', 'openai');
    return {
      image: { mediaType: 'image/png', data: Buffer.from(b64, 'base64') },
      usage: {
        provider: this.name,
        model: this.models.image,
        task: req.task,
        inputTokens: json.usage?.input_tokens ?? null,
        outputTokens: json.usage?.output_tokens ?? null,
        images: 1,
        latencyMs: Date.now() - started,
      },
    };
  }
}
