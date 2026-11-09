import type { z } from 'zod';

/**
 * Provider-independent AI interface (ADR-056). The application asks for *capabilities* — structured
 * understanding of images, or an image — and never talks to a vendor API directly. Adapters live in
 * this package; credentials are read on the server only and are never logged or returned.
 */

export type AiProviderName = 'gemini' | 'openai' | 'fake';

/** What the application asks for (used for routing, usage records and fakes). */
export type AiTask =
  | 'garment_decomposition'
  | 'component_detail'
  | 'sketch_reading'
  | 'sketch_classify'
  | 'sketch_details'
  | 'pattern_interpretation'
  | 'fabric_analysis'
  | 'techpack_text'
  | 'image_design_view'
  | 'image_mannequin'
  | 'image_model'
  | 'image_component'
  /** Look preview: the garment drawn from its pattern pieces (ADR-064). */
  | 'image_look_view';

export interface AiImageInput {
  /** image/png · image/jpeg · image/webp */
  mediaType: string;
  data: Uint8Array;
  /** Short role description given to the model ("sketch", "fabric A"…). */
  label?: string;
}

export interface StructuredRequest<T> {
  task: AiTask;
  /** System / role instructions. */
  system: string;
  prompt: string;
  images: readonly AiImageInput[];
  /** The response is validated with this schema (one corrective retry on mismatch). */
  schema: z.ZodType<T>;
  /** Example or description of the JSON shape, included in the prompt. */
  shapeHint: string;
  temperature?: number;
}

export type ImageAspect = 'portrait' | 'square' | 'landscape';

export interface ImageRequest {
  task: AiTask;
  prompt: string;
  /** Reference images (design, fabrics); used when the model supports image editing/conditioning. */
  referenceImages: readonly AiImageInput[];
  aspect: ImageAspect;
}

export interface AiUsage {
  provider: AiProviderName;
  model: string;
  task: AiTask;
  inputTokens: number | null;
  outputTokens: number | null;
  images: number;
  latencyMs: number;
}

export interface GeneratedImage {
  mediaType: string;
  data: Uint8Array;
}

export interface AiCapabilities {
  vision: boolean;
  multiImage: boolean;
  structuredOutput: boolean;
  imageGeneration: boolean;
  /** Image generation conditioned on reference images. */
  referenceImages: boolean;
  /** Never claimed by any adapter: manufacturing-accurate measurements or vector patterns. */
  accurateMeasurements: false;
}

export interface AiProvider {
  readonly name: AiProviderName;
  readonly models: { text: string; image: string };
  readonly capabilities: AiCapabilities;
  generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage }>;
  generateImage(req: ImageRequest): Promise<{ image: GeneratedImage; usage: AiUsage }>;
}

export type AiErrorKind =
  | 'not_configured'
  | 'auth'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'refused'
  | 'unsupported'
  | 'bad_request'
  /** Quota or billing limit of the account — another model of the same provider will not help. */
  | 'quota'
  /** The model id is unknown, retired or not enabled for this key/API version. */
  | 'model_unavailable';

/** Failures with a kind the caller can act on; messages never contain credentials. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly provider: AiProviderName,
    readonly retryable = kind === 'rate_limited' || kind === 'unavailable',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
