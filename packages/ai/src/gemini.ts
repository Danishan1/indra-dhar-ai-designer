import { httpError, toBase64, withValidation } from './json.js';
import {
  type AiProvider,
  AiProviderError,
  type GeneratedImage,
  type ImageRequest,
  type StructuredRequest,
} from './types.js';

export interface GeminiConfig {
  apiKey: string;
  textModel: string;
  imageModel: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Tried in order when the main model is overloaded or rate limited (503/429). */
  fallbackTextModels?: readonly string[];
  fallbackImageModels?: readonly string[];
  fetch?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

const ASPECT_TEXT = {
  portrait: 'Portrait orientation (3:4).',
  square: 'Square (1:1).',
  landscape: 'Landscape orientation (4:3).',
} as const;

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }

    const date = Date.parse(retryAfter);

    if (Number.isFinite(date)) {
      return Math.min(Math.max(0, date - Date.now()), 30_000);
    }
  }

  // Exponential backoff with jitter.
  const base = Math.min(1000 * 2 ** attempt, 15_000);
  return base + Math.floor(Math.random() * 500);
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const isBusy = (err: unknown) =>
  err instanceof AiProviderError && (err.kind === 'unavailable' || err.kind === 'rate_limited');

/** Runs `fn` with the first model, then the fallbacks while the provider reports it is busy. */
async function withModelFallback<T>(
  models: readonly string[],
  fn: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  let last: unknown;
  for (const [i, model] of models.entries()) {
    try {
      return { result: await fn(model), model };
    } catch (err) {
      last = err;
      if (!isBusy(err) || i === models.length - 1) throw err;
      console.warn(`[Gemini] ${model} is busy — trying ${models[i + 1]}`);
    }
  }
  throw last;
}

/** Google Gemini Generative Language API provider. */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;

  readonly capabilities = {
    vision: true,
    multiImage: true,
    structuredOutput: true,
    imageGeneration: true,
    referenceImages: true,
    accurateMeasurements: false,
  } as const;

  readonly models: { text: string; image: string };

  constructor(private readonly cfg: GeminiConfig) {
    if (!cfg.apiKey) {
      throw new AiProviderError('not_configured', 'GEMINI_API_KEY is not set', 'gemini');
    }

    this.models = {
      text: this.normalizeModel(cfg.textModel),
      image: this.normalizeModel(cfg.imageModel),
    };
  }

  /**
   * Accepts both:
   * gemini-3.8-flash
   * models/gemini-3.8-flash
   */
  private normalizeModel(model: string): string {
    const normalized = model.trim().replace(/^models\//, '');

    if (!normalized || normalized.includes('/')) {
      throw new AiProviderError(
        'invalid_response',
        `Invalid Gemini model name: ${model}`,
        'gemini',
      );
    }

    return normalized;
  }

  private modelChain(main: string, fallbacks: readonly string[] = []): string[] {
    const chain = [main, ...fallbacks.filter((m) => m.trim()).map((m) => this.normalizeModel(m))];
    return [...new Set(chain)];
  }

  private async call(model: string, body: unknown): Promise<GeminiResponse> {
    const base = (this.cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
      /\/+$/,
      '',
    );

    const modelId = this.normalizeModel(model);
    const url = `${base}/models/${encodeURIComponent(modelId)}:generateContent`;

    const f = this.cfg.fetch ?? fetch;
    const maxRetries = Math.max(0, this.cfg.maxRetries ?? DEFAULT_RETRIES);

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response: Response;

      try {
        response = await f(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.cfg.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? DEFAULT_TIMEOUT),
        });
      } catch (error) {
        lastError = error;

        if (attempt >= maxRetries) {
          throw new AiProviderError(
            'unavailable',
            `Gemini network request failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            'gemini',
          );
        }

        await sleep(getRetryDelay(null, attempt));
        continue;
      }

      const responseText = await response.text();

      if (!response.ok) {
        let details: unknown = responseText;

        try {
          details = JSON.parse(responseText);
        } catch {
          // Preserve original response text.
        }

        console.error('[Gemini API Error]', {
          status: response.status,
          statusText: response.statusText,
          model: modelId,
          attempt: attempt + 1,
          details,
          retryAfter: response.headers.get('retry-after'),
        });

        if (isRetryable(response.status) && attempt < maxRetries) {
          await sleep(getRetryDelay(response, attempt));
          continue;
        }

        throw httpError('gemini', response.status, responseText);
      }

      let json: GeminiResponse;

      try {
        json = JSON.parse(responseText) as GeminiResponse;
      } catch {
        throw new AiProviderError('invalid_response', 'Gemini returned invalid JSON', 'gemini');
      }

      if (json.promptFeedback?.blockReason) {
        throw new AiProviderError(
          'refused',
          `Gemini blocked the request (${json.promptFeedback.blockReason})`,
          'gemini',
        );
      }

      return json;
    }

    throw new AiProviderError(
      'unavailable',
      `Gemini request failed: ${String(lastError ?? 'Unknown error')}`,
      'gemini',
    );
  }

  async generateStructured<T>(req: StructuredRequest<T>) {
    const started = Date.now();

    const images = req.images.flatMap((img, i) => [
      {
        text: `Image ${i + 1}${img.label ? ` (${img.label})` : ''}:`,
      },
      {
        inline_data: {
          mime_type: img.mediaType,
          data: toBase64(img.data),
        },
      },
    ]);

    const textModels = this.modelChain(this.models.text, this.cfg.fallbackTextModels);
    const { result, model } = await withModelFallback(textModels, (m) =>
      withValidation('gemini', req, async (prompt) => {
        const json = await this.call(m, {
          systemInstruction: {
            parts: [{ text: req.system }],
          },
          contents: [
            {
              role: 'user',
              parts: [...images, { text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: req.temperature ?? 0.2,
          },
        });

        const text = (json.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? '')
          .join('');

        if (!text) {
          throw new AiProviderError(
            'invalid_response',
            'Gemini returned an empty structured response',
            'gemini',
          );
        }

        return {
          text,
          inputTokens: json.usageMetadata?.promptTokenCount ?? null,
          outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
        };
      }),
    );

    return {
      data: result.data,
      usage: {
        provider: this.name,
        model,
        task: req.task,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        images: req.images.length,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateImage(req: ImageRequest) {
    const started = Date.now();

    const refs = req.referenceImages.flatMap((img) => [
      ...(img.label ? [{ text: `Reference: ${img.label}` }] : []),
      {
        inline_data: {
          mime_type: img.mediaType,
          data: toBase64(img.data),
        },
      },
    ]);

    const imageModels = this.modelChain(this.models.image, this.cfg.fallbackImageModels);
    const { result: json, model } = await withModelFallback(imageModels, (m) =>
      this.call(m, {
        contents: [
          {
            role: 'user',
            parts: [
              ...refs,
              {
                text: `${req.prompt}\n${ASPECT_TEXT[req.aspect]}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    );

    const parts = json.candidates?.[0]?.content?.parts ?? [];

    const part = parts.find((p) => p.inlineData || p.inline_data);

    const data = part?.inlineData?.data ?? part?.inline_data?.data;

    const mime = part?.inlineData?.mimeType ?? part?.inline_data?.mime_type ?? 'image/png';

    if (!data) {
      throw new AiProviderError(
        json.candidates?.[0]?.finishReason === 'SAFETY' ? 'refused' : 'invalid_response',
        'Gemini returned no image',
        'gemini',
      );
    }

    const image: GeneratedImage = {
      mediaType: mime,
      data: Buffer.from(data, 'base64'),
    };

    return {
      image,
      usage: {
        provider: this.name,
        model,
        task: req.task,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
        images: 1,
        latencyMs: Date.now() - started,
      },
    };
  }
}
