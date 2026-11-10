import { AiProviderError, type AiProviderName, type AiTask } from './types.js';

/**
 * Model discovery and capability-based selection (ADR-057). Discovery (what a key can see),
 * compatibility (what a model can do) and execution are separate steps: a model is only used for
 * an operation whose required capabilities it has — never just because it is listed.
 */

export const ModelCapabilities = [
  'text',
  'vision',
  'multi_image',
  'structured_output',
  'image_generation',
  'image_editing',
] as const;
export type AiCapability = (typeof ModelCapabilities)[number];

export const AiOperations = [
  'image_analysis',
  'garment_reconstruction',
  'pattern_interpretation',
  'techpack_documentation',
  'image_generation',
] as const;
export type AiOperation = (typeof AiOperations)[number];

export const OPERATION_LABELS: Record<AiOperation, string> = {
  image_analysis: 'Image analysis (component details)',
  garment_reconstruction: 'Garment reconstruction (editable geometry)',
  pattern_interpretation: 'Pattern interpretation',
  techpack_documentation: 'Tech pack documentation',
  image_generation: 'Image generation (views, mannequin, model)',
};

export const OPERATION_REQUIREMENTS: Record<AiOperation, readonly AiCapability[]> = {
  image_analysis: ['vision', 'multi_image', 'structured_output'],
  garment_reconstruction: ['vision', 'multi_image', 'structured_output'],
  pattern_interpretation: ['vision', 'structured_output'],
  techpack_documentation: ['text', 'structured_output'],
  image_generation: ['image_generation'],
};

/** Which operation each task belongs to (routing + model preferences). */
export const TASK_OPERATION: Record<AiTask, AiOperation> = {
  garment_decomposition: 'garment_reconstruction',
  component_detail: 'image_analysis',
  sketch_reading: 'image_analysis',
  sketch_classify: 'image_analysis',
  sketch_details: 'image_analysis',
  pattern_interpretation: 'pattern_interpretation',
  fabric_analysis: 'image_analysis',
  techpack_text: 'techpack_documentation',
  image_design_view: 'image_generation',
  image_mannequin: 'image_generation',
  image_model: 'image_generation',
  image_component: 'image_generation',
  image_look_view: 'image_generation',
  image_line_sketch: 'image_generation',
  image_fabric_design: 'image_generation',
  fabric_suggest: 'image_analysis',
};

export interface DiscoveredModel {
  provider: AiProviderName;
  /** Id used in requests, e.g. `gemini-2.5-flash` (no `models/` prefix). */
  id: string;
  displayName: string;
  capabilities: AiCapability[];
  /** Methods the provider reports (Gemini `supportedGenerationMethods`). */
  methods: string[];
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  /** Preview / experimental / deprecated hints from the listing. */
  stage: 'stable' | 'preview' | 'experimental';
}

export const supports = (m: Pick<DiscoveredModel, 'capabilities'>, op: AiOperation) =>
  OPERATION_REQUIREMENTS[op].every((c) => m.capabilities.includes(c));

interface DiscoveryOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

async function getJson(
  provider: AiProviderName,
  url: string,
  headers: Record<string, string>,
  opts: DiscoveryOptions,
): Promise<unknown> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
  } catch (err) {
    throw new AiProviderError(
      'unavailable',
      `Could not reach ${provider}: ${err instanceof Error ? err.message : String(err)}`,
      provider,
    );
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(provider, res.status, text);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiProviderError('invalid_response', `${provider} returned invalid JSON`, provider);
  }
}

/**
 * Turns a provider HTTP failure into an error kind the fallback logic can act on. Key, permission,
 * billing and quota problems cannot be fixed by another model of the same provider; unknown or
 * unsupported models can.
 */
export function classifyHttpError(
  provider: AiProviderName,
  status: number,
  body: string,
): AiProviderError {
  let message = body.slice(0, 400);
  let reason = '';
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; status?: string; details?: { reason?: string }[] };
    };
    message = j.error?.message ?? message;
    reason = `${j.error?.status ?? ''} ${(j.error?.details ?? []).map((d) => d.reason ?? '').join(' ')}`;
  } catch {
    /* plain text */
  }
  const text = `${message} ${reason}`.toLowerCase();
  const short = message.replace(/\s+/g, ' ').slice(0, 300);
  if (
    status === 401 ||
    /api[_ ]key.*(invalid|not valid)|api_key_invalid|unauthenticated/.test(text)
  )
    return new AiProviderError('auth', `The ${provider} API key was rejected: ${short}`, provider);
  if (status === 403)
    return new AiProviderError(
      'auth',
      `${provider} denied access (permission, project or region): ${short}`,
      provider,
    );
  if (status === 429 && /billing|exceeded your current quota|insufficient_quota/.test(text))
    return new AiProviderError(
      'quota',
      `${provider} quota or billing limit reached: ${short}`,
      provider,
    );
  if (status === 429)
    return new AiProviderError('rate_limited', `${provider} rate limit reached`, provider);
  if (status >= 500)
    return new AiProviderError('unavailable', `${provider} is unavailable (${status})`, provider);
  if (
    status === 404 ||
    /not found|not supported for generatecontent|unexpected model name|model_not_found|does not exist|unsupported model|not available/.test(
      text,
    )
  )
    return new AiProviderError(
      'model_unavailable',
      `The model is not available for this key or operation: ${short}`,
      provider,
    );
  if (
    /(image|modality|response_modalities|response ?mime ?type|json mode).*(not supported|unsupported|not enabled)/.test(
      text,
    )
  )
    return new AiProviderError('unsupported', `${provider}: ${short}`, provider);
  return new AiProviderError(
    'bad_request',
    `${provider} refused the request (${status}): ${short}`,
    provider,
  );
}

// ── Gemini ───────────────────────────────────────────────────────────────────

interface GeminiModelInfo {
  name?: string;
  baseModelId?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

const stageOf = (id: string, text = ''): DiscoveredModel['stage'] =>
  /exp(erimental)?\b|-exp-/.test(`${id} ${text}`.toLowerCase())
    ? 'experimental'
    : /preview/.test(`${id} ${text}`.toLowerCase())
      ? 'preview'
      : 'stable';

/** Capabilities of a Gemini model from its listing (methods) and family naming. */
export function geminiCapabilities(info: GeminiModelInfo): AiCapability[] {
  const id = (info.name ?? '').replace(/^models\//, '').toLowerCase();
  const methods = info.supportedGenerationMethods ?? [];
  if (!methods.includes('generateContent')) return [];
  // Not usable for our operations: embeddings, attribution, speech, live audio, robotics, agents.
  if (/embedding|aqa|tts|native-audio|-live|audio|robotics|computer-use|learnlm/.test(id))
    return [];
  if (/image/.test(id))
    // "Nano Banana" family: text+image in, image out; no JSON mode.
    return ['text', 'vision', 'multi_image', 'image_generation', 'image_editing'];
  if (/^gemma/.test(id)) {
    // Gemma 3 (≥4b) reads images; JSON response mode is not offered for Gemma.
    return /gemma-3(n)?-(1b)/.test(id) || !/gemma-3/.test(id) ? ['text'] : ['text', 'vision'];
  }
  if (/^gemini-/.test(id)) {
    if (/^gemini-1\.0|gemini-pro$/.test(id)) return ['text'];
    return ['text', 'vision', 'multi_image', 'structured_output'];
  }
  return ['text'];
}

export async function discoverGeminiModels(
  apiKey: string,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  const base = (opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/+$/,
    '',
  );
  const out: DiscoveredModel[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = `${base}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const json = (await getJson('gemini', url, { 'x-goog-api-key': apiKey }, opts)) as {
      models?: GeminiModelInfo[];
      nextPageToken?: string;
    };
    for (const m of json.models ?? []) {
      const id = (m.name ?? '').replace(/^models\//, '');
      if (!id) continue;
      out.push({
        provider: 'gemini',
        id,
        displayName: m.displayName ?? id,
        capabilities: geminiCapabilities(m),
        methods: m.supportedGenerationMethods ?? [],
        inputTokenLimit: m.inputTokenLimit ?? null,
        outputTokenLimit: m.outputTokenLimit ?? null,
        stage: stageOf(id, m.description),
      });
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

/** Capabilities of an OpenAI model id (the listing has no capability metadata). */
export function openAiCapabilities(id: string): AiCapability[] {
  const m = id.toLowerCase();
  if (
    /embedding|whisper|tts|transcribe|audio|realtime|moderation|search|davinci|babbage|codex|sora|computer-use/.test(
      m,
    )
  )
    return [];
  if (/^gpt-image|^dall-e-3/.test(m)) return ['image_generation', 'image_editing'];
  if (/^dall-e-2/.test(m)) return ['image_generation'];
  if (/^gpt-3\.5|^gpt-4(-\d{4})?$|^gpt-4-turbo-preview|instruct|^o1-mini|^o1-preview/.test(m))
    return ['text', 'structured_output'];
  if (/^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|o1|o3|o4|chatgpt-4o|gpt-4-turbo)/.test(m))
    return ['text', 'vision', 'multi_image', 'structured_output'];
  return [];
}

export async function discoverOpenAiModels(
  apiKey: string,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  const base = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const json = (await getJson(
    'openai',
    `${base}/models`,
    { authorization: `Bearer ${apiKey}` },
    opts,
  )) as {
    data?: { id?: string }[];
  };
  return (json.data ?? [])
    .map((d) => d.id ?? '')
    .filter(Boolean)
    .map((id) => ({
      provider: 'openai' as const,
      id,
      displayName: id,
      capabilities: openAiCapabilities(id),
      methods: [],
      inputTokenLimit: null,
      outputTokenLimit: null,
      stage: stageOf(id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const FAKE_MODELS: DiscoveredModel[] = [
  {
    provider: 'fake',
    id: 'fake-text',
    displayName: 'Demo analyzer (offline)',
    capabilities: ['text', 'vision', 'multi_image', 'structured_output'],
    methods: [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    stage: 'stable',
  },
  {
    provider: 'fake',
    id: 'fake-image',
    displayName: 'Demo images (offline placeholders)',
    capabilities: ['image_generation', 'image_editing'],
    methods: [],
    inputTokenLimit: null,
    outputTokenLimit: null,
    stage: 'stable',
  },
];

export function discoverModels(
  provider: AiProviderName,
  apiKey: string,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  if (provider === 'gemini') return discoverGeminiModels(apiKey, opts);
  if (provider === 'openai') return discoverOpenAiModels(apiKey, opts);
  return Promise.resolve(FAKE_MODELS);
}

// ── selection ────────────────────────────────────────────────────────────────

export interface ModelRef {
  provider: AiProviderName;
  model: string;
}

/** Per-operation choice: a specific model, or `auto`. */
export type ModelPreference = ModelRef | 'auto';
export type ModelPreferences = Partial<Record<AiOperation, ModelPreference>>;

export interface ModelHealth {
  /** Recent successes and failures per `provider:model` (e.g. last 24 h of usage records). */
  [key: string]: { ok: number; failed: number; lastError?: string | null };
}

/**
 * Preferred families when choosing automatically (best first). Only a ranking hint: a model is
 * only considered when discovery listed it and it has the operation's capabilities.
 */
const RANK: Record<AiProviderName, RegExp[]> = {
  gemini: [
    /^gemini-2\.5-flash$/,
    /^gemini-2\.5-pro$/,
    /^gemini-2\.5-flash-image$/,
    /^gemini-flash-latest$/,
    /^gemini-2\.0-flash$/,
    /^gemini-2\.5-flash-lite$/,
    /^gemini-3.*-flash/,
    /^gemini-3.*-pro/,
    /image-preview$/,
    /^gemini-/,
  ],
  openai: [
    /^gpt-4\.1-mini$/,
    /^gpt-4\.1$/,
    /^gpt-4o$/,
    /^gpt-image-1$/,
    /^gpt-5/,
    /^gpt-4o-mini$/,
    /^gpt-/,
    /^dall-e-3$/,
  ],
  fake: [/./],
};

function rankScore(m: DiscoveredModel, health: ModelHealth): number {
  const list = RANK[m.provider];
  const idx = list.findIndex((r) => r.test(m.id));
  let score = 1000 - (idx < 0 ? 500 : idx * 10);
  if (m.stage === 'preview') score -= 40;
  if (m.stage === 'experimental') score -= 80;
  const h = health[`${m.provider}:${m.id}`];
  if (h) score += Math.min(h.ok, 10) * 5 - Math.min(h.failed, 10) * 15;
  return score;
}

/**
 * Ordered candidates for an operation: the user's choice (when compatible) first, then the best
 * compatible models of the same provider, then — when `crossProvider` — of other providers.
 * Incompatible or unlisted models are never returned.
 */
export function modelChain(input: {
  operation: AiOperation;
  catalog: readonly DiscoveredModel[];
  preference?: ModelPreference;
  /** Provider asked for by the user for this run (keeps auto mode on it first). */
  provider?: AiProviderName;
  health?: ModelHealth;
  crossProvider?: boolean;
  max?: number;
}): ModelRef[] {
  const health = input.health ?? {};
  const compatible = input.catalog.filter((m) => supports(m, input.operation));
  const pref = input.preference && input.preference !== 'auto' ? input.preference : null;
  const firstProvider = pref?.provider ?? input.provider ?? compatible[0]?.provider;
  const sorted = [...compatible].sort((a, b) => {
    const pa = a.provider === firstProvider ? 0 : 1;
    const pb = b.provider === firstProvider ? 0 : 1;
    return pa - pb || rankScore(b, health) - rankScore(a, health);
  });
  const out: ModelRef[] = [];
  if (pref && compatible.some((m) => m.provider === pref.provider && m.id === pref.model))
    out.push({ provider: pref.provider, model: pref.model });
  for (const m of sorted) {
    if (!input.crossProvider && m.provider !== firstProvider) continue;
    if (!out.some((o) => o.provider === m.provider && o.model === m.id))
      out.push({ provider: m.provider, model: m.id });
  }
  return out.slice(0, input.max ?? 4);
}
