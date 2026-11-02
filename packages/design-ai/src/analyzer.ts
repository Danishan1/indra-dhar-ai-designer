import type { AiImageInput, AiProvider, AiUsage } from '@ai-designer/ai';

import {
  type ComponentDetails,
  componentDetailSchema,
  type Decomposition,
  decompositionSchema,
} from './analysis-schema.js';
import {
  type LibraryEntry,
  matchComponent,
  type MatchKind,
  skipsAiDetail,
} from './library-match.js';
import {
  ANALYST_SYSTEM,
  COMPONENT_DETAIL_SHAPE,
  componentDetailPrompt,
  DECOMPOSITION_SHAPE,
  decompositionPrompt,
} from './prompts.js';

/**
 * Component 1 — the AI design analyzer (ADR-056):
 * 1. one multimodal call decomposes ALL inputs together (garment, components, fabrics, patterns);
 * 2. every component is compared with the component library;
 * 3. one detail call only for components without a suitable library entry (exact/compatible
 *    matches skip it — the library is what saves repeated AI work).
 */

export interface AnalyzerImage {
  index: number;
  role: string;
  fileName: string | null;
  image: AiImageInput;
}

export interface AnalyzerInput {
  images: readonly AnalyzerImage[];
  notes?: string | null;
  garmentHint?: string | null;
  audience?: string | null;
}

export interface AnalyzerDeps {
  provider: AiProvider;
  library: readonly LibraryEntry[];
  recordUsage?(usage: AiUsage, outcome: 'succeeded' | 'failed'): Promise<void>;
  progress?(stage: string): Promise<void>;
}

export interface ComponentMatchView {
  kind: MatchKind;
  score: number;
  reasons: string[];
  entry: LibraryEntry | null;
}

export interface AnalysisResult {
  decomposition: Decomposition;
  details: ComponentDetails | null;
  matches: Record<string, ComponentMatchView>;
  /** Components that went through the AI detail pass. */
  aiDetailFor: string[];
  /** Components whose detail came from the library (AI skipped). */
  libraryReuseFor: string[];
  provider: string;
  models: { text: string; image: string };
  /** Pixel size per input image (set by the worker; scale of the reconstruction). */
  imageSizes?: ({ width: number; height: number } | null)[];
}

export async function analyzeDesign(
  input: AnalyzerInput,
  deps: AnalyzerDeps,
): Promise<AnalysisResult> {
  const { provider } = deps;
  await deps.progress?.('Reading your images');
  const images = input.images.map((i) => ({
    ...i.image,
    label: i.role === 'auto' ? undefined : i.role,
  }));
  let decomposition: Decomposition;
  try {
    const res = await provider.generateStructured({
      task: 'garment_decomposition',
      system: ANALYST_SYSTEM,
      prompt: decompositionPrompt({
        inputs: input.images.map((i) => ({ index: i.index, role: i.role, fileName: i.fileName })),
        notes: input.notes ?? null,
        garmentHint: input.garmentHint ?? null,
        audience: input.audience ?? null,
      }),
      images: images.map((i) => ({
        mediaType: i.mediaType,
        data: i.data,
        ...(i.label ? { label: i.label } : {}),
      })),
      schema: decompositionSchema,
      shapeHint: DECOMPOSITION_SHAPE,
    });
    decomposition = res.data;
    await deps.recordUsage?.(res.usage, 'succeeded');
  } catch (e) {
    await deps.recordUsage?.(
      {
        provider: provider.name,
        model: provider.models.text,
        task: 'garment_decomposition',
        inputTokens: null,
        outputTokens: null,
        images: 0,
        latencyMs: 0,
      },
      'failed',
    );
    throw e;
  }

  await deps.progress?.('Checking the component library');
  const matches: Record<string, ComponentMatchView> = {};
  for (const c of decomposition.components) {
    if (c.componentType === 'garment_body') continue;
    const m = matchComponent(c, deps.library);
    matches[c.key] = {
      kind: m.kind,
      score: Math.round(m.score * 100) / 100,
      reasons: m.reasons,
      entry: m.entry,
    };
  }
  const libraryReuseFor = Object.entries(matches)
    .filter(([, m]) => skipsAiDetail(m.kind))
    .map(([k]) => k);
  const needDetail = decomposition.components.filter(
    (c) => c.componentType !== 'garment_body' && !libraryReuseFor.includes(c.key),
  );

  let details: ComponentDetails | null = null;
  if (needDetail.length) {
    await deps.progress?.(
      `Detailing ${needDetail.length} new component${needDetail.length === 1 ? '' : 's'}`,
    );
    try {
      const res = await provider.generateStructured({
        task: 'component_detail',
        system: ANALYST_SYSTEM,
        prompt: componentDetailPrompt({
          garmentLabel: decomposition.garment.label,
          components: needDetail,
        }),
        images: images.map((i) => ({
          mediaType: i.mediaType,
          data: i.data,
          ...(i.label ? { label: i.label } : {}),
        })),
        schema: componentDetailSchema,
        shapeHint: COMPONENT_DETAIL_SHAPE,
      });
      details = res.data;
      await deps.recordUsage?.(res.usage, 'succeeded');
    } catch {
      // The decomposition is enough to continue; details are an improvement.
      await deps.recordUsage?.(
        {
          provider: provider.name,
          model: provider.models.text,
          task: 'component_detail',
          inputTokens: null,
          outputTokens: null,
          images: 0,
          latencyMs: 0,
        },
        'failed',
      );
    }
  }
  return {
    decomposition,
    details,
    matches,
    aiDetailFor: needDetail.map((c) => c.key),
    libraryReuseFor,
    provider: provider.name,
    models: provider.models,
  };
}
