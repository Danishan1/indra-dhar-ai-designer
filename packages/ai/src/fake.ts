import {
  type AiProvider,
  AiProviderError,
  type AiTask,
  type ImageRequest,
  type StructuredRequest,
} from './types.js';

/** Produces a fake structured answer for a task (tests, demos without keys). */
export type FakeResponder = (req: StructuredRequest<unknown>) => unknown;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const IMAGE_TITLES: Partial<Record<AiTask, string>> = {
  image_design_view: 'Design view',
  image_mannequin: 'On mannequin',
  image_model: 'On model',
  image_component: 'Component detail',
  image_look_view: 'Look preview',
};

/**
 * Deterministic provider: answers come from registered responders (validated with the request's
 * schema like real answers) and images are labelled SVG placeholders. Never calls the network.
 */
export class FakeProvider implements AiProvider {
  readonly name = 'fake' as const;
  readonly models = { text: 'fake-text', image: 'fake-image' };
  readonly capabilities = {
    vision: true,
    multiImage: true,
    structuredOutput: true,
    imageGeneration: true,
    referenceImages: true,
    accurateMeasurements: false,
  } as const;
  /** Every request, for assertions. */
  readonly calls: { task: AiTask; prompt: string; images: number }[] = [];

  constructor(private readonly responders: Partial<Record<AiTask, FakeResponder>> = {}) {}

  async generateStructured<T>(req: StructuredRequest<T>) {
    this.calls.push({ task: req.task, prompt: req.prompt, images: req.images.length });
    const responder = this.responders[req.task];
    if (!responder)
      throw new AiProviderError('unsupported', `No fake answer registered for ${req.task}`, 'fake');
    const data = req.schema.parse(responder(req as StructuredRequest<unknown>));
    return {
      data,
      usage: {
        provider: this.name,
        model: this.models.text,
        task: req.task,
        inputTokens: req.prompt.length,
        outputTokens: 100,
        images: 0,
        latencyMs: 1,
      },
    };
  }

  async generateImage(req: ImageRequest) {
    this.calls.push({ task: req.task, prompt: req.prompt, images: req.referenceImages.length });
    const [w, h] =
      req.aspect === 'portrait'
        ? [768, 1024]
        : req.aspect === 'landscape'
          ? [1024, 768]
          : [1024, 1024];
    const title = IMAGE_TITLES[req.task] ?? 'AI image';
    const line = esc(req.prompt.replace(/\s+/g, ' ').slice(0, 90));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f1f5f9"/><rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="16 10"/><text x="50%" y="46%" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#334155">${title}</text><text x="50%" y="52%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#64748b">Placeholder (fake AI provider)</text><text x="50%" y="58%" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#94a3b8">${line}</text></svg>`;
    return {
      image: { mediaType: 'image/svg+xml', data: new TextEncoder().encode(svg) },
      usage: {
        provider: this.name,
        model: this.models.image,
        task: req.task,
        inputTokens: null,
        outputTokens: null,
        images: 1,
        latencyMs: 1,
      },
    };
  }
}
