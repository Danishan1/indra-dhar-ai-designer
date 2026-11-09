import {
  type AiEnv,
  type AiImageInput,
  type AiProvider,
  AiProviderError,
  type AiProviderName,
  type AiTask,
  type AiUsage,
  type AttemptRecord,
  createAdapter,
  type DiscoveredModel,
  discoverModels,
  FAKE_MODELS,
  healthFrom,
  type ModelPreferences,
  type ModelRef,
  planChain,
  readAiEnv,
  AiRoutingError,
  routedProvider,
  TASK_OPERATION,
} from '@ai-designer/ai';
import { type Provenance } from '@ai-designer/contracts';
import { newId, type PrismaClient } from '@ai-designer/db';
import {
  ANALYST_SYSTEM,
  type AnalysisResult,
  analyzeDesign,
  type AnalyzerImage,
  type ArtifactName,
  buildTechPack,
  designDescriptionForImages,
  designSummary,
  fakeResponders,
  imagePrompt,
  type LibraryEntry,
  libraryEntryFromArtifact,
  TECHPACK_TEXT_SHAPE,
  type TechPackImage,
  type TechPackText,
  techPackHtml,
  techPackTextPrompt,
  techPackTextSchema,
  technicalFlats,
  type TechPackDocument,
  reconstructionSvg,
  DEFAULT_PRESENTATION,
  type Presentation,
  readSketch,
  patternDescription,
  patternSection,
} from '@ai-designer/design-ai';
import {
  canonicalJson,
  type GarmentDesignState,
  type PatternAudience,
  type PropertyValue,
  readAnyVersion,
  sha256Hex,
} from '@ai-designer/garment-model';
import { type AssetProcessingDeps, processAsset, storeGeneratedAsset } from '@ai-designer/media';
import { sewingOrder } from '@ai-designer/pattern-model';
import { createSecretCipher } from '@ai-designer/secrets';
import type { Logger } from 'pino';
import sharp from 'sharp';
import { z } from 'zod';

import type { JobHandler, JobHandlerContext } from './durable-job-processor.js';

/**
 * AI studio jobs (ADR-056): `design.analysis` (Component 1) and `techpack.generate` (Component 3).
 * The worker reads input assets and library artifacts read-only and writes `design_analyses`,
 * `tech_packs`, `ai_usage_records` and generated assets (documented deviation from module
 * ownership: the worker is the AI runtime). Provider failures never crash the job: the row is
 * marked `failed` with the error kind so the user sees what happened.
 */

export interface AiStudioDeps {
  assets: AssetProcessingDeps;
  /** Defaults to `readAiEnv(process.env)`. */
  aiEnv?: AiEnv;
  /** Chromium for PDFs; undefined = Playwright's installed browser. */
  pdfChromiumPath?: string;
  /** Test hook: override the adapter per provider. */
  providerFactory?: (name: AiProviderName) => AiProvider;
}

const MAX_INPUT_EDGE = 1600;

export type UsageOutcome = 'succeeded' | 'failed' | 'outcome_unknown';
export type UsageSink = (
  usage: AiUsage,
  outcome: UsageOutcome,
  error?: AiProviderError | null,
) => Promise<void>;

/** Records every provider call (succeeded / failed / outcome_unknown) — never free when unknown. */
export function meteredProvider(inner: AiProvider, record: UsageSink): AiProvider {
  const failure = async (task: AiTask, model: string, started: number, err: unknown) => {
    const e = err instanceof AiProviderError ? err : null;
    const unknown = e ? e.kind === 'unavailable' : true;
    await record(
      {
        provider: inner.name,
        model,
        task,
        inputTokens: null,
        outputTokens: null,
        images: 0,
        latencyMs: Date.now() - started,
      },
      unknown ? 'outcome_unknown' : 'failed',
      e,
    ).catch(() => undefined);
  };
  return {
    name: inner.name,
    models: inner.models,
    capabilities: inner.capabilities,
    async generateStructured(req) {
      const started = Date.now();
      try {
        const out = await inner.generateStructured(req);
        await record(out.usage, 'succeeded');
        return out;
      } catch (err) {
        await failure(req.task, inner.models.text, started, err);
        throw err;
      }
    },
    async generateImage(req) {
      const started = Date.now();
      try {
        const out = await inner.generateImage(req);
        await record(out.usage, 'succeeded');
        return out;
      } catch (err) {
        await failure(req.task, inner.models.image, started, err);
        throw err;
      }
    },
  };
}

/** One AI processing record per provider call (ADR-057): operation, subject, attempt, error. */
export function usageRecorder(
  prisma: PrismaClient,
  organizationId: string,
  jobId: string,
  subject: { type: 'design_analysis' | 'tech_pack' | 'design_look'; id: string },
): UsageSink {
  const attempts = new Map<string, number>();
  return async (usage, outcome, error) => {
    const n = (attempts.get(usage.task) ?? 0) + 1;
    attempts.set(usage.task, n);
    await prisma.aiUsageRecord.create({
      data: {
        id: newId(),
        organizationId,
        jobId,
        provider: usage.provider,
        model: usage.model,
        task: usage.task,
        operation: TASK_OPERATION[usage.task],
        subjectType: subject.type,
        subjectId: subject.id,
        attempt: n,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        images: usage.images,
        latencyMs: Math.round(usage.latencyMs),
        outcome,
        errorKind: error?.kind ?? null,
        errorMessage: error?.message.slice(0, 300) ?? null,
      },
    });
  };
}

const PROVIDER_LABEL: Record<string, string> = { gemini: 'Gemini', openai: 'OpenAI', fake: 'Demo' };
const keyContext = (organizationId: string, provider: string) =>
  `ai-provider:${organizationId}:${provider}`;
const serverDiscovery = new Map<string, { at: number; models: DiscoveredModel[] }>();

/** Models and keys usable by an organization: its own encrypted keys first, then `.env` keys. */
async function loadCatalog(
  prisma: PrismaClient,
  env: AiEnv,
  organizationId: string,
): Promise<{ catalog: DiscoveredModel[]; keys: Partial<Record<string, string>> }> {
  const cipher = createSecretCipher({
    masterKey: process.env['SECRETS_MASTER_KEY'],
    devSecret: process.env['BETTER_AUTH_SECRET'],
  });
  const rows = await prisma.aiProviderConnection.findMany({ where: { organizationId } });
  const catalog: DiscoveredModel[] = [...FAKE_MODELS];
  const keys: Partial<Record<string, string>> = { fake: 'fake' };
  for (const provider of ['gemini', 'openai'] as const) {
    const row = rows.find((r) => r.provider === provider);
    if (row) {
      if (row.status !== 'connected') continue;
      keys[provider] = cipher.decrypt(row.encryptedKey, keyContext(organizationId, provider));
      catalog.push(...(row.models as unknown as DiscoveredModel[]));
      continue;
    }
    const key = provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
    if (!key) continue;
    keys[provider] = key;
    let cached = serverDiscovery.get(provider);
    if (!cached || Date.now() - cached.at > 10 * 60_000) {
      try {
        cached = { at: Date.now(), models: await discoverModels(provider, key) };
      } catch {
        cached = { at: Date.now(), models: [] };
      }
      serverDiscovery.set(provider, cached);
    }
    catalog.push(...cached.models);
  }
  return { catalog, keys };
}

/**
 * The provider for a job (ADR-057): each task runs on the best compatible model for its operation
 * (organization preference → `.env` default → automatic ranking), with retries while a vendor is
 * busy and capability-safe fallback to other compatible models. Every call is metered; the
 * returned `history` is stored with the result.
 */
export async function studioProvider(
  deps: AiStudioDeps,
  organizationId: string,
  requested: string,
  opts: { record: UsageSink; stage: (text: string) => Promise<void> },
): Promise<AiProvider & { history: AttemptRecord[]; chains: Partial<Record<AiTask, ModelRef[]>> }> {
  const env = deps.aiEnv ?? readAiEnv(process.env);
  const prisma = deps.assets.prisma;
  const [{ catalog, keys }, settings, recent] = await Promise.all([
    loadCatalog(prisma, env, organizationId),
    prisma.aiSettings.findUnique({ where: { organizationId } }),
    prisma.aiUsageRecord.findMany({
      where: { organizationId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      select: { provider: true, model: true, outcome: true, errorMessage: true },
      take: 500,
    }),
  ]);
  const plan = {
    catalog,
    preferences: (settings?.preferences as ModelPreferences | undefined) ?? {},
    provider: requested as AiProviderName,
    env,
    health: healthFrom(recent),
    crossProviderFallback: settings?.crossProviderFallback ?? true,
  };
  const chains: Partial<Record<AiTask, ModelRef[]>> = {};
  const router = routedProvider({
    chainFor: (task) => (chains[task] ??= planChain(plan, TASK_OPERATION[task])),
    create: (ref) =>
      meteredProvider(
        deps.providerFactory
          ? deps.providerFactory(ref.provider)
          : createAdapter(ref, keys[ref.provider] ?? '', env, fakeResponders),
        opts.record,
      ),
    busyRetries: env.AI_BUSY_RETRIES,
    busyWaitMs: env.AI_BUSY_WAIT_MS,
    onBusy: async ({ provider, model, waitMs, next }) =>
      opts.stage(
        next
          ? `${model} could not be used — continuing with ${PROVIDER_LABEL[next.provider] ?? next.provider} ${next.model}`
          : `${PROVIDER_LABEL[provider] ?? provider} (${model}) is busy right now — trying again in ${Math.round(waitMs / 1000)} s`,
      ),
  });
  return Object.assign(router, { chains });
}

export function errorOf(err: unknown): {
  message: string;
  kind: string | null;
  history?: AttemptRecord[];
} {
  const history = err instanceof AiRoutingError ? { history: err.history } : {};
  return { ...errorBase(err), ...history };
}

function errorBase(err: unknown): { message: string; kind: string | null } {
  if (err instanceof AiProviderError && err.kind === 'auth')
    return {
      message: `${PROVIDER_LABEL[err.provider] ?? err.provider} rejected the API key or denied access. Check the key in Settings → AI. (${err.message.slice(0, 200)})`,
      kind: err.kind,
    };
  if (err instanceof AiProviderError && err.kind === 'quota')
    return {
      message: `${PROVIDER_LABEL[err.provider] ?? err.provider} quota or billing limit reached for this key. (${err.message.slice(0, 200)})`,
      kind: err.kind,
    };
  if (err instanceof AiProviderError && (err.kind === 'unavailable' || err.kind === 'rate_limited'))
    return {
      message: `${PROVIDER_LABEL[err.provider] ?? err.provider} is overloaded or rate limited right now (we retried several times). Try again in a few minutes, or choose another provider.`,
      kind: err.kind,
    };
  if (err instanceof AiProviderError) return { message: err.message.slice(0, 500), kind: err.kind };
  return {
    message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    kind: null,
  };
}

/** Loads an asset of the organization and returns a provider-friendly image (≤ 1600 px). */
export async function loadImage(
  deps: AiStudioDeps,
  organizationId: string,
  assetId: string,
): Promise<{ image: AiImageInput; buffer: Buffer; width: number; height: number } | null> {
  const asset = await deps.assets.prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null, status: 'ready' },
  });
  if (!asset) return null;
  const raw = await deps.assets.storage.getObject(asset.bucket, asset.storageKey);
  if (asset.mediaType === 'image/svg+xml' || asset.mediaType === 'application/pdf') return null;
  const img = sharp(raw, { limitInputPixels: deps.assets.maxPixels }).rotate();
  const resized = img.resize({
    width: MAX_INPUT_EDGE,
    height: MAX_INPUT_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const isPng = asset.mediaType === 'image/png';
  const { data, info } = await (isPng ? resized.png() : resized.jpeg({ quality: 88 })).toBuffer({
    resolveWithObject: true,
  });
  return {
    image: { mediaType: isPng ? 'image/png' : 'image/jpeg', data: new Uint8Array(data) },
    buffer: data,
    width: info.width,
    height: info.height,
  };
}

export async function storeImage(
  deps: AiStudioDeps,
  input: {
    organizationId: string;
    projectId: string | null;
    buffer: Buffer;
    fileName: string;
    assetType: 'generated_image' | 'export';
    provenance: Provenance;
    createdBy: string | null;
  },
): Promise<string> {
  const { assetId } = await storeGeneratedAsset(deps.assets, input);
  const outcome = await processAsset(deps.assets, assetId);
  if (outcome.status === 'rejected') throw new Error(`generated file rejected: ${outcome.reason}`);
  return assetId;
}

/** Library entries this organization can reuse (built-in, organization and the requester's own). */
async function loadLibrary(
  prisma: PrismaClient,
  organizationId: string,
  userId: string | null,
): Promise<LibraryEntry[]> {
  const rows = await prisma.artifact.findMany({
    where: {
      OR: [{ organizationId }, { organizationId: null }],
      deletedAt: null,
      lifecycleStatus: 'active',
      category: { notIn: ['fabric', 'lace', 'trim', 'embroidery', 'button', 'artwork'] },
      AND: [
        {
          OR: [
            { ownerScope: { not: 'user' } },
            ...(userId ? [{ ownerScope: 'user', ownerUserId: userId }] : []),
          ],
        },
      ],
    },
    include: { currentRevision: true },
    take: 500,
  });
  const entries: LibraryEntry[] = [];
  for (const a of rows) {
    if (!a.currentRevision) continue;
    const entry = libraryEntryFromArtifact({
      artifactId: a.id,
      artifactRevisionId: a.currentRevision.id,
      displayId: a.displayId,
      name: a.name,
      category: a.category,
      artifactType: a.artifactType,
      description: a.description,
      definition: a.currentRevision.definition as Record<string, unknown>,
      properties: a.currentRevision.properties as { visual?: Record<string, PropertyValue> },
    });
    if (entry) entries.push(entry);
  }
  return entries;
}

// ── design.analysis ─────────────────────────────────────────────────────────

const analysisPayload = z.object({ analysisId: z.uuid() });

export function designAnalysisHandler(deps: AiStudioDeps): JobHandler {
  return async (ctx: JobHandlerContext) => {
    const { analysisId } = analysisPayload.parse(ctx.payload);
    const prisma = deps.assets.prisma;
    const row = await prisma.designAnalysis.findUnique({ where: { id: analysisId } });
    if (!row) return { skipped: 'not_found' };
    if (row.status === 'succeeded' || row.status === 'failed') return { skipped: row.status };
    const stage = async (text: string) => {
      await prisma.designAnalysis.update({
        where: { id: row.id },
        data: { stage: text, status: 'running' },
      });
      await ctx.heartbeat();
    };
    try {
      await stage('Preparing your images');
      const inputs = row.inputs as { assetId: string; role: string; fileName: string | null }[];
      const loaded: { buffer: Buffer; width: number; height: number }[] = [];
      const images: AnalyzerImage[] = [];
      for (const [index, input] of inputs.entries()) {
        const img = await loadImage(deps, row.organizationId, input.assetId);
        if (!img) throw new Error(`Input ${input.fileName ?? input.assetId} is not available`);
        loaded[index] = img;
        images.push({ index, role: input.role, fileName: input.fileName, image: img.image });
      }
      const library = await loadLibrary(prisma, row.organizationId, row.createdBy);
      const provider = await studioProvider(deps, row.organizationId, row.provider, {
        record: usageRecorder(prisma, row.organizationId, ctx.job.id, {
          type: 'design_analysis',
          id: row.id,
        }),
        stage,
      });
      if (row.mode === 'sketch') {
        // ADR-058: the AI reads the sketch; patterns are drafted by the engine when the user confirms.
        const audience = ['women', 'men', 'girls', 'boys'].includes(row.audience ?? '')
          ? (row.audience as PatternAudience)
          : null;
        const sketch = await readSketch(
          {
            images: images.map((i) => i.image),
            garmentHint: row.garmentHint,
            audience,
            size: row.size,
            notes: row.notes,
          },
          { provider, progress: stage },
        );
        await prisma.designAnalysis.update({
          where: { id: row.id },
          data: {
            status: 'succeeded',
            stage: null,
            result: JSON.parse(
              JSON.stringify({
                ...sketch,
                imageSizes: loaded.map((l) => (l ? { width: l.width, height: l.height } : null)),
                processing: { chains: provider.chains, history: provider.history },
              }),
            ) as object,
            completedAt: new Date(),
          },
        });
        return { family: sketch.spec.family, size: sketch.spec.size };
      }
      const result = await analyzeDesign(
        { images, notes: row.notes, garmentHint: row.garmentHint, audience: row.audience },
        { provider, library, progress: stage },
      );
      await stage('Cutting out component images');
      const crops = await cropComponents(deps, ctx.logger, row, result, loaded, ctx.job.id);
      await prisma.designAnalysis.update({
        where: { id: row.id },
        data: {
          status: 'succeeded',
          stage: null,
          result: JSON.parse(
            JSON.stringify({
              ...result,
              imageSizes: loaded.map((l) => (l ? { width: l.width, height: l.height } : null)),
              processing: { chains: provider.chains, history: provider.history },
            }),
          ) as object,
          crops,
          completedAt: new Date(),
        },
      });
      return {
        components: result.decomposition.components.length,
        libraryReuse: result.libraryReuseFor.length,
      };
    } catch (err) {
      ctx.logger.warn({ err, analysisId }, 'design analysis failed');
      await prisma.designAnalysis.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          stage: null,
          error: errorOf(err) as object,
          completedAt: new Date(),
        },
      });
      return { failed: errorOf(err).kind ?? 'error' };
    }
  };
}

async function cropComponents(
  deps: AiStudioDeps,
  logger: Logger,
  row: { id: string; organizationId: string; projectId: string; createdBy: string | null },
  result: AnalysisResult,
  loaded: readonly { buffer: Buffer; width: number; height: number }[],
  jobId: string,
): Promise<Record<string, string>> {
  const crops: Record<string, string> = {};
  for (const c of result.decomposition.components.slice(0, 30)) {
    const r = c.region;
    const src = r ? loaded[r.imageIndex] : undefined;
    if (!r || !src || c.componentType === 'garment_body') continue;
    // A little margin around the region so the part reads in context.
    const pad = 0.04;
    const left = Math.max(0, Math.floor((r.x - pad) * src.width));
    const top = Math.max(0, Math.floor((r.y - pad) * src.height));
    const width = Math.min(src.width - left, Math.ceil((r.width + 2 * pad) * src.width));
    const height = Math.min(src.height - top, Math.ceil((r.height + 2 * pad) * src.height));
    if (width < 8 || height < 8) continue;
    try {
      const buffer = await sharp(src.buffer)
        .extract({ left, top, width, height })
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      crops[c.key] = await storeImage(deps, {
        organizationId: row.organizationId,
        projectId: row.projectId,
        buffer,
        fileName: `${c.key}.png`,
        assetType: 'generated_image',
        provenance: { sourceType: 'ai_job', sourceEntityId: row.id, jobId },
        createdBy: row.createdBy,
      });
    } catch (err) {
      logger.warn({ err, key: c.key }, 'component crop failed');
    }
  }
  return crops;
}

// ── techpack.generate ───────────────────────────────────────────────────────

const techPackPayload = z.object({ techPackId: z.uuid(), pdfOnly: z.boolean().optional() });

interface TechPackOptions {
  modelImages?: boolean;
  presentation?: Presentation;
  revisionLabel?: string;
  designName?: string;
  designDisplayId?: string;
  projectName?: string;
}

async function artifactNames(
  prisma: PrismaClient,
  organizationId: string,
  state: GarmentDesignState,
): Promise<Map<string, ArtifactName>> {
  const ids = new Set<string>();
  for (const c of state.components) {
    for (const b of c.artifactBindings) ids.add(b.artifactRevisionId);
    const fabric = c.properties['material.fabric_ref']?.value;
    if (typeof fabric === 'string') ids.add(fabric);
  }
  const rows = await prisma.artifactRevision.findMany({
    where: {
      id: { in: [...ids] },
      OR: [{ organizationId }, { organizationId: null }],
    },
    include: { artifact: { select: { name: true, category: true } } },
  });
  const map = new Map<string, ArtifactName>();
  for (const r of rows) {
    const props = r.properties as {
      visual?: Record<string, PropertyValue>;
      physical?: Record<string, PropertyValue>;
    };
    const color = props.visual?.['appearance.color']?.value;
    const composition =
      props.physical?.['material.composition']?.value ??
      props.physical?.['material.fiber_content']?.value;
    map.set(r.id, {
      name: r.artifact.name,
      category: r.artifact.category,
      color: typeof color === 'string' ? color : null,
      composition: typeof composition === 'string' ? composition : null,
    });
  }
  return map;
}

type ImageKind = 'front' | 'back' | 'side' | 'mannequin' | 'model';
const IMAGE_TITLES: Record<ImageKind, string> = {
  front: 'Front view',
  back: 'Back view',
  side: 'Side view',
  mannequin: 'On a mannequin',
  model: 'On a model',
};
const IMAGE_TASK: Record<ImageKind, AiTask> = {
  front: 'image_design_view',
  back: 'image_design_view',
  side: 'image_design_view',
  mannequin: 'image_mannequin',
  model: 'image_model',
};

export function techPackHandler(deps: AiStudioDeps): JobHandler {
  return async (ctx: JobHandlerContext) => {
    const payload = techPackPayload.parse(ctx.payload);
    const { techPackId } = payload;
    const prisma = deps.assets.prisma;
    const row = await prisma.techPack.findUnique({ where: { id: techPackId } });
    if (!row) return { skipped: 'not_found' };
    const options = row.options as TechPackOptions;
    if (payload.pdfOnly) {
      if (row.status !== 'succeeded' || !row.document) return { skipped: 'not_ready' };
      const doc = row.document as unknown as TechPackDocument;
      const dataUris = await dataUrisFor(deps, row.organizationId, doc);
      const pdf = await printPdf(deps, row, doc, options, dataUris, ctx.job.id, ctx.logger);
      await prisma.techPack.update({
        where: { id: row.id },
        data: {
          pdfAssetId: pdf.assetId ?? row.pdfAssetId,
          pdfStatus: pdf.assetId ? 'ready' : 'failed',
          pdfError: pdf.error,
        },
      });
      return { pdf: !!pdf.assetId };
    }
    if (row.status === 'succeeded' || row.status === 'failed') return { skipped: row.status };
    const stage = async (text: string) => {
      await prisma.techPack.update({
        where: { id: row.id },
        data: { stage: text, status: 'running' },
      });
      await ctx.heartbeat();
    };
    try {
      await stage('Reading the committed design');
      const revision = await prisma.designRevision.findFirst({
        where: { id: row.revisionId, organizationId: row.organizationId, designId: row.designId },
      });
      if (!revision) throw new Error('The revision no longer exists');
      if (sha256Hex(canonicalJson(revision.snapshot)) !== revision.contentHash)
        throw new Error('The revision failed its integrity check');
      const design = await prisma.design.findFirst({
        where: { id: row.designId },
        select: { projectId: true },
      });
      const state = readAnyVersion(revision.snapshot).state;
      const artifacts = await artifactNames(prisma, row.organizationId, state);
      const provider = await studioProvider(deps, row.organizationId, row.provider, {
        record: usageRecorder(prisma, row.organizationId, ctx.job.id, {
          type: 'tech_pack',
          id: row.id,
        }),
        stage,
      });
      const projectId = design?.projectId ?? null;
      const dataUris = new Map<string, string>();
      const store = async (
        buffer: Buffer,
        fileName: string,
        assetType: 'generated_image' | 'export',
      ) =>
        storeImage(deps, {
          organizationId: row.organizationId,
          projectId,
          buffer,
          fileName,
          assetType,
          provenance: { sourceType: 'ai_job', sourceEntityId: row.id, jobId: ctx.job.id },
          createdBy: row.createdBy,
        });

      // Final geometry first: the editable reconstruction (and the technical flat for shirts).
      const reconstructed = (['front', 'back'] as const)
        .map((view) => ({ view, svg: reconstructionSvg(state, view) }))
        .filter((v): v is { view: 'front' | 'back'; svg: string } => !!v.svg)
        .map((v): TechPackImage => ({
          key: `garment_${v.view}`,
          title: `Garment — ${v.view} (final geometry)`,
          kind: 'reconstruction',
          svg: v.svg,
        }));
      const patternFirst = !!state.patternSpec;
      const flats = patternFirst ? [] : technicalFlats(state);
      // Original uploads: references for the document and the image model.
      const references: TechPackImage[] = [];
      let original: AiImageInput | null = null;
      for (const src of (state.sources ?? []).filter(
        (x) => x.role === 'sketch' || x.role === 'reference',
      )) {
        const img = await loadImage(deps, row.organizationId, src.assetId).catch(() => null);
        if (!img) continue;
        dataUris.set(
          src.assetId,
          `data:${img.image.mediaType};base64,${img.buffer.toString('base64')}`,
        );
        references.push({
          key: `original_${src.assetId}`,
          title: src.label ? `Original — ${src.label}` : `Original ${src.role}`,
          kind: 'original',
          assetId: src.assetId,
        });
        original ??= { ...img.image, label: `original ${src.role} (reference only)` };
      }
      // The image model follows the final drawing; the original only helps with look and feel.
      let reference: AiImageInput | null = null;
      const drawing = reconstructed[0]?.svg ?? flats[0]?.svg;
      if (drawing) {
        const png = await sharp(Buffer.from(drawing))
          .resize({ width: 1024 })
          .flatten({ background: '#ffffff' })
          .png()
          .toBuffer();
        reference = {
          mediaType: 'image/png',
          data: new Uint8Array(png),
          label: 'finalized garment drawing',
        };
      }
      const imageRefs = [reference, original].filter((x): x is AiImageInput => !!x);

      await stage('Drafting construction notes');
      let text: TechPackText | null = null;
      try {
        text = (
          await provider.generateStructured({
            task: 'techpack_text',
            system: ANALYST_SYSTEM,
            prompt: techPackTextPrompt({
              state,
              summary: patternFirst
                ? {
                    garment: patternDescription(state),
                    pattern: patternSection(state),
                    // ADR-060: the deterministic order from the parts, for the AI to refine.
                    proposedSewingOrder: state.patternSpec
                      ? sewingOrder({
                          patternSpec: state.patternSpec,
                          components: state.components,
                          patternPieces: state.patternPieces ?? [],
                        }).map((x) => `${x.step}. ${x.title}: ${x.detail}`)
                      : [],
                  }
                : designSummary(state, artifacts),
            }),
            images: imageRefs,
            schema: techPackTextSchema,
            shapeHint: TECHPACK_TEXT_SHAPE,
          })
        ).data;
      } catch (err) {
        ctx.logger.warn({ err, techPackId }, 'tech pack text failed; using generic steps');
      }

      // Pattern-first designs: the garment sewn from the patterns (the sketch only shows the look).
      const description = patternDescription(state) ?? designDescriptionForImages(state, artifacts);
      const category = state.garmentCategory ?? '';
      const kinds: ImageKind[] = ['front', 'back'];
      if (['jacket', 'dress', 'hoodie', 'trousers'].includes(category)) kinds.push('side');
      if (options.modelImages !== false) kinds.push('mannequin', 'model');
      const aiViews: TechPackImage[] = [];
      for (const kind of kinds) {
        await stage(`Generating the ${IMAGE_TITLES[kind].toLowerCase()} image`);
        try {
          const out = await provider.generateImage({
            task: IMAGE_TASK[kind],
            prompt: imagePrompt(kind, description, options.presentation ?? DEFAULT_PRESENTATION),
            referenceImages: imageRefs,
            aspect: 'portrait',
          });
          // Normalize (the fake returns SVG placeholders) to PNG for storage and the PDF.
          const png = await sharp(Buffer.from(out.image.data)).png().toBuffer();
          const assetId = await store(png, `${kind}.png`, 'generated_image');
          dataUris.set(assetId, `data:image/png;base64,${png.toString('base64')}`);
          aiViews.push({ key: `ai_${kind}`, title: IMAGE_TITLES[kind], kind: 'ai', assetId });
        } catch (err) {
          aiViews.push({
            key: `ai_${kind}`,
            title: IMAGE_TITLES[kind],
            kind: 'ai',
            assetId: null,
            note: `Not generated: ${errorOf(err).message}`,
          });
        }
      }

      await stage('Collecting component images');
      const componentImages: Record<string, TechPackImage> = {};
      for (const c of state.components) {
        const visual = c.assetRefs.find((a) => a.role === 'visual');
        if (!visual) continue;
        const img = await loadImage(deps, row.organizationId, visual.assetId).catch(() => null);
        if (!img) continue;
        dataUris.set(
          visual.assetId,
          `data:${img.image.mediaType};base64,${img.buffer.toString('base64')}`,
        );
        componentImages[c.componentId] = {
          key: `component_${c.componentId}`,
          title: c.displayName,
          kind: 'crop',
          assetId: visual.assetId,
        };
      }

      await stage('Assembling the tech pack');
      const document = buildTechPack({
        state,
        header: {
          designName: options.designName ?? 'Design',
          designDisplayId: options.designDisplayId ?? '',
          revisionLabel: options.revisionLabel ?? '',
          revisionId: row.revisionId,
          projectName: options.projectName ?? '',
          generatedAt: new Date().toISOString(),
          provider: `${provider.name} (${provider.models.text} / ${provider.models.image})`,
        },
        artifacts,
        text,
        views: [...reconstructed, ...flats, ...aiViews],
        componentImages,
        references,
      });

      const finalDocument = {
        ...document,
        processing: { chains: provider.chains, history: provider.history },
      };
      await stage('Printing the PDF');
      const pdf = await printPdf(
        deps,
        row,
        finalDocument,
        options,
        dataUris,
        ctx.job.id,
        ctx.logger,
      );

      await prisma.techPack.update({
        where: { id: row.id },
        data: {
          status: 'succeeded',
          stage: null,
          document: JSON.parse(JSON.stringify(finalDocument)) as object,
          pdfAssetId: pdf.assetId,
          pdfStatus: pdf.assetId ? 'ready' : 'failed',
          pdfError: pdf.error,
          completedAt: new Date(),
        },
      });
      return { pdf: pdf.assetId !== null, images: aiViews.filter((v) => v.assetId).length };
    } catch (err) {
      ctx.logger.warn({ err, techPackId }, 'tech pack generation failed');
      await prisma.techPack.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          stage: null,
          error: errorOf(err) as object,
          completedAt: new Date(),
        },
      });
      return { failed: errorOf(err).kind ?? 'error' };
    }
  };
}

/** Data URIs for every stored image a document references (PDF is printed offline). */
async function dataUrisFor(
  deps: AiStudioDeps,
  organizationId: string,
  doc: TechPackDocument,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  const add = (img: TechPackImage | null | undefined) => {
    if (img?.assetId) ids.add(img.assetId);
  };
  doc.views.forEach(add);
  (doc.references ?? []).forEach(add);
  doc.components.forEach((c) => add(c.image));
  const out = new Map<string, string>();
  for (const id of ids) {
    const img = await loadImage(deps, organizationId, id).catch(() => null);
    if (img) out.set(id, `data:${img.image.mediaType};base64,${img.buffer.toString('base64')}`);
  }
  return out;
}

/** Prints and stores the PDF; failures are reported, never fatal (the document stays usable). */
async function printPdf(
  deps: AiStudioDeps,
  row: { id: string; organizationId: string; designId: string; createdBy: string | null },
  doc: TechPackDocument,
  options: TechPackOptions,
  dataUris: Map<string, string>,
  jobId: string,
  logger: Logger,
): Promise<{ assetId: string | null; error: string | null }> {
  try {
    const html = techPackHtml(doc, (img) =>
      img.assetId ? (dataUris.get(img.assetId) ?? null) : null,
    );
    const footer = `${options.designName ?? 'Design'} · ${options.designDisplayId ?? ''} · ${options.revisionLabel ?? ''}`;
    const pdf = await renderPdf(html, deps.pdfChromiumPath, footer);
    const design = await deps.assets.prisma.design.findFirst({
      where: { id: row.designId },
      select: { projectId: true },
    });
    const name = `${options.designDisplayId ?? 'design'}-${options.revisionLabel ?? ''}-tech-pack.pdf`;
    const assetId = await storeImage(deps, {
      organizationId: row.organizationId,
      projectId: design?.projectId ?? null,
      buffer: pdf,
      fileName: name,
      assetType: 'export',
      provenance: { sourceType: 'export', sourceEntityId: row.id, jobId },
      createdBy: row.createdBy,
    });
    return { assetId, error: null };
  } catch (err) {
    logger.warn({ err, techPackId: row.id }, 'tech pack PDF failed (document kept)');
    const msg = (err as Error).message ?? String(err);
    return {
      assetId: null,
      error: /Executable doesn't exist|no browser|Chromium/i.test(msg)
        ? 'No Chrome/Chromium was found on the server to print the PDF. Install Chrome or Edge, run `pnpm e2e:install`, or set PDF_CHROMIUM_PATH — or use “Print / Save as PDF” in the browser.'
        : msg.slice(0, 300),
    };
  }
}

/** Installed Chrome / Edge / Chromium executables to try when Playwright's browser is missing. */
export function browserCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const roots = [
      env['PROGRAMFILES'],
      env['PROGRAMFILES(X86)'],
      env['ProgramFiles(x86)'],
      env['LOCALAPPDATA'],
    ].filter(Boolean) as string[];
    return roots.flatMap((r) => [
      `${r}\\Google\\Chrome\\Application\\chrome.exe`,
      `${r}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${r}\\Chromium\\Application\\chrome.exe`,
    ]);
  }
  if (platform === 'darwin')
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/opt/pw-browsers/chromium',
  ];
}

/** HTML → A4 PDF with headless Chromium (no network: everything is inlined), page numbers in the footer. */
export async function renderPdf(
  html: string,
  executablePath?: string,
  footer = '',
): Promise<Buffer> {
  const { chromium } = await import('playwright-core');
  const { existsSync } = await import('node:fs');
  const tries = [executablePath, undefined, ...browserCandidates().filter((p) => existsSync(p))];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let lastError: unknown = null;
  for (const path of [...new Set(tries)]) {
    if (path === undefined && tries[0]) continue; // an explicit path was given
    try {
      browser = await chromium.launch({
        ...(path ? { executablePath: path } : {}),
        args: ['--no-sandbox'],
      });
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!browser) throw lastError instanceof Error ? lastError : new Error('No Chromium available');
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    return Buffer.from(
      await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#6b7280;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>${esc(footer)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      }),
    );
  } finally {
    await browser.close();
  }
}
