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
  fetch?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const ASPECT_TEXT = {
  portrait: 'Portrait orientation (3:4).',
  square: 'Square (1:1).',
  landscape: 'Landscape orientation (4:3).',
} as const;

/** Google Gemini (Generative Language API `generateContent`): vision + JSON and image output. */
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
    if (!cfg.apiKey)
      throw new AiProviderError('not_configured', 'GEMINI_API_KEY is not set', 'gemini');
    this.models = { text: cfg.textModel, image: cfg.imageModel };
  }

  private async call(model: string, body: unknown): Promise<GeminiResponse> {
    const base = this.cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const f = this.cfg.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 120_000),
      });
    } catch (e) {
      throw new AiProviderError(
        'unavailable',
        `Gemini request failed: ${(e as Error).message}`,
        'gemini',
      );
    }
    const text = await res.text();
    if (!res.ok) throw httpError('gemini', res.status, text);
    const json = JSON.parse(text) as GeminiResponse;
    if (json.promptFeedback?.blockReason)
      throw new AiProviderError(
        'refused',
        `Gemini blocked the request (${json.promptFeedback.blockReason})`,
        'gemini',
      );
    return json;
  }

  async generateStructured<T>(req: StructuredRequest<T>) {
    const started = Date.now();
    const images = req.images.flatMap((img, i) => [
      { text: `Image ${i + 1}${img.label ? ` (${img.label})` : ''}:` },
      { inline_data: { mime_type: img.mediaType, data: toBase64(img.data) } },
    ]);
    const result = await withValidation('gemini', req, async (prompt) => {
      const json = await this.call(this.models.text, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [...images, { text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: req.temperature ?? 0.2,
        },
      });
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      return {
        text,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
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
    const refs = req.referenceImages.flatMap((img) => [
      ...(img.label ? [{ text: `Reference: ${img.label}` }] : []),
      { inline_data: { mime_type: img.mediaType, data: toBase64(img.data) } },
    ]);
    const json = await this.call(this.models.image, {
      contents: [
        { role: 'user', parts: [...refs, { text: `${req.prompt}\n${ASPECT_TEXT[req.aspect]}` }] },
      ],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });
    const part = (json.candidates?.[0]?.content?.parts ?? []).find(
      (p) => p.inlineData ?? p.inline_data,
    );
    const data = part?.inlineData?.data ?? part?.inline_data?.data;
    const mime = part?.inlineData?.mimeType ?? part?.inline_data?.mime_type ?? 'image/png';
    if (!data)
      throw new AiProviderError(
        json.candidates?.[0]?.finishReason === 'SAFETY' ? 'refused' : 'invalid_response',
        'Gemini returned no image',
        'gemini',
      );
    const image: GeneratedImage = { mediaType: mime, data: Buffer.from(data, 'base64') };
    return {
      image,
      usage: {
        provider: this.name,
        model: this.models.image,
        task: req.task,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
        images: 1,
        latencyMs: Date.now() - started,
      },
    };
  }
}
