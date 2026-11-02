import type { AiEnv } from './config.js';
import {
  type AiOperation,
  type DiscoveredModel,
  FAKE_MODELS,
  type ModelHealth,
  type ModelPreferences,
  type ModelRef,
  modelChain,
  supports,
} from './models.js';
import type { AiProviderName } from './types.js';

/**
 * Which models a run may use (ADR-057): the discovered catalog of every connected provider, the
 * organization's per-operation preferences, `.env` defaults (as a preference when listed) and the
 * provider asked for. `fake` is only used when the run asks for it (offline demo, tests).
 */
export interface PlanInput {
  catalog: readonly DiscoveredModel[];
  preferences: ModelPreferences;
  /** Provider chosen for this run; `auto`/undefined = the organization's preferences. */
  provider?: AiProviderName | 'auto' | undefined;
  env: Pick<
    AiEnv,
    'GEMINI_TEXT_MODEL' | 'GEMINI_IMAGE_MODEL' | 'OPENAI_TEXT_MODEL' | 'OPENAI_IMAGE_MODEL'
  >;
  health?: ModelHealth;
  crossProviderFallback: boolean;
}

const envModel = (env: PlanInput['env'], provider: AiProviderName, op: AiOperation) =>
  provider === 'gemini'
    ? op === 'image_generation'
      ? env.GEMINI_IMAGE_MODEL
      : env.GEMINI_TEXT_MODEL
    : provider === 'openai'
      ? op === 'image_generation'
        ? env.OPENAI_IMAGE_MODEL
        : env.OPENAI_TEXT_MODEL
      : op === 'image_generation'
        ? 'fake-image'
        : 'fake-text';

export function planChain(input: PlanInput, operation: AiOperation): ModelRef[] {
  const wantsFake = input.provider === 'fake';
  const catalog = wantsFake ? FAKE_MODELS : input.catalog.filter((m) => m.provider !== 'fake');
  const explicit = input.provider && input.provider !== 'auto' ? input.provider : undefined;
  let preference = input.preferences[operation];
  if (preference && preference !== 'auto' && explicit && preference.provider !== explicit)
    preference = 'auto';
  if (!preference || preference === 'auto') {
    // `.env` model of the chosen (or first connected) provider, when discovery lists it.
    const provider = explicit ?? catalog.find((m) => supports(m, operation))?.provider;
    const model = provider ? envModel(input.env, provider, operation) : undefined;
    if (provider && model && catalog.some((m) => m.provider === provider && m.id === model))
      preference = { provider, model };
  }
  return modelChain({
    operation,
    catalog,
    preference: preference ?? 'auto',
    ...(explicit ? { provider: explicit } : {}),
    health: input.health ?? {},
    crossProvider: !wantsFake && input.crossProviderFallback,
    max: 4,
  });
}

/** Health from recent usage records: successes and failures per provider:model. */
export function healthFrom(
  rows: readonly {
    provider: string;
    model: string;
    outcome: string;
    errorMessage?: string | null;
  }[],
): ModelHealth {
  const out: ModelHealth = {};
  for (const r of rows) {
    const k = `${r.provider}:${r.model}`;
    const h = (out[k] ??= { ok: 0, failed: 0, lastError: null });
    if (r.outcome === 'succeeded') h.ok++;
    else {
      h.failed++;
      h.lastError ??= r.errorMessage ?? null;
    }
  }
  return out;
}
