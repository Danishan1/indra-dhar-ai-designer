import {
  type AiEnv,
  type AiImageInput,
  type AiProvider,
  AiProviderError,
  type AiTask,
  type AiUsage,
  createProvider,
  readAiEnv,
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
} from '@ai-designer/design-ai';
import {
  canonicalJson,
  type GarmentDesignState,
  type PropertyValue,
  readAnyVersion,
  sha256Hex,
} from '@ai-designer/garment-model';
import { type AssetProcessingDeps, processAsset, storeGeneratedAsset } from '@ai-designer/media';
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
  /** Test hook: override the provider. */
  providerFactory?: (name: AiEnv['AI_PROVIDER']) => AiProvider;
}

type ProviderName = AiEnv['AI_PROVIDER'];

const MAX_INPUT_EDGE = 1600;

/** Records every provider call (succeeded / failed / outcome_unknown) — never free when unknown. */
export function meteredProvider(
  inner: AiProvider,
  record: (usage: AiUsage, outcome: 'succeeded' | 'failed' | 'outcome_unknown') => Promise<void>,
): AiProvider {
  const failure = async (task: AiTask, model: string, started: number, err: unknown) => {
    const unknown = err instanceof AiProviderError ? err.kind === 'unavailable' : true;
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

function usageRecorder(prisma: PrismaClient, organizationId: string, jobId: string) {
  return async (usage: AiUsage, outcome: string) => {
    await prisma.aiUsageRecord.create({
      data: {
        id: newId(),
        organizationId,
        jobId,
        provider: usage.provider,
        model: usage.model,
        task: usage.task,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        images: usage.images,
        latencyMs: Math.round(usage.latencyMs),
        outcome,
      },
    });
  };
}

function providerFor(deps: AiStudioDeps, name: string): AiProvider {
  const env = deps.aiEnv ?? readAiEnv(process.env);
  const n = name as ProviderName;
  return deps.providerFactory ? deps.providerFactory(n) : createProvider(env, n, fakeResponders);
}

function errorOf(err: unknown): { message: string; kind: string | null } {
  if (err instanceof AiProviderError) return { message: err.message.slice(0, 500), kind: err.kind };
  return {
    message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    kind: null,
  };
}

/** Loads an asset of the organization and returns a provider-friendly image (≤ 1600 px). */
async function loadImage(
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

async function storeImage(
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
      const provider = meteredProvider(
        providerFor(deps, row.provider),
        usageRecorder(prisma, row.organizationId, ctx.job.id),
      );
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
          result: JSON.parse(JSON.stringify(result)) as object,
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
        data: { status: 'failed', stage: null, error: errorOf(err), completedAt: new Date() },
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

const techPackPayload = z.object({ techPackId: z.uuid() });

interface TechPackOptions {
  modelImages?: boolean;
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
    const { techPackId } = techPackPayload.parse(ctx.payload);
    const prisma = deps.assets.prisma;
    const row = await prisma.techPack.findUnique({ where: { id: techPackId } });
    if (!row) return { skipped: 'not_found' };
    if (row.status === 'succeeded' || row.status === 'failed') return { skipped: row.status };
    const options = row.options as TechPackOptions;
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
      const provider = meteredProvider(
        providerFor(deps, row.provider),
        usageRecorder(prisma, row.organizationId, ctx.job.id),
      );
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

      // Reference image for the AI: the technical flat (G2) or the uploaded sketch/reference.
      const flats = technicalFlats(state);
      let reference: AiImageInput | null = null;
      if (flats[0]?.svg) {
        const png = await sharp(Buffer.from(flats[0].svg)).resize({ width: 1024 }).png().toBuffer();
        reference = { mediaType: 'image/png', data: new Uint8Array(png), label: 'technical flat' };
      } else {
        const src = (state.sources ?? []).find(
          (s) => s.role === 'sketch' || s.role === 'reference',
        );
        const img = src ? await loadImage(deps, row.organizationId, src.assetId) : null;
        if (img) reference = { ...img.image, label: src!.role };
      }

      await stage('Drafting construction notes');
      let text: TechPackText | null = null;
      try {
        text = (
          await provider.generateStructured({
            task: 'techpack_text',
            system: ANALYST_SYSTEM,
            prompt: techPackTextPrompt({ state, summary: designSummary(state, artifacts) }),
            images: reference ? [reference] : [],
            schema: techPackTextSchema,
            shapeHint: TECHPACK_TEXT_SHAPE,
          })
        ).data;
      } catch (err) {
        ctx.logger.warn({ err, techPackId }, 'tech pack text failed; using generic steps');
      }

      const description = designDescriptionForImages(state, artifacts);
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
            prompt: imagePrompt(kind, description),
            referenceImages: reference ? [reference] : [],
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
        views: [...flats, ...aiViews],
        componentImages,
      });

      await stage('Printing the PDF');
      let pdfAssetId: string | null = null;
      try {
        const html = techPackHtml(document, (img) =>
          img.assetId ? (dataUris.get(img.assetId) ?? null) : null,
        );
        const pdf = await renderPdf(html, deps.pdfChromiumPath);
        const name = `${options.designDisplayId ?? 'design'}-${options.revisionLabel ?? ''}-tech-pack.pdf`;
        pdfAssetId = await store(pdf, name, 'export');
      } catch (err) {
        ctx.logger.warn({ err, techPackId }, 'tech pack PDF failed (document kept)');
      }

      await prisma.techPack.update({
        where: { id: row.id },
        data: {
          status: 'succeeded',
          stage: null,
          document: JSON.parse(JSON.stringify(document)) as object,
          pdfAssetId,
          completedAt: new Date(),
        },
      });
      return { pdf: pdfAssetId !== null, images: aiViews.filter((v) => v.assetId).length };
    } catch (err) {
      ctx.logger.warn({ err, techPackId }, 'tech pack generation failed');
      await prisma.techPack.update({
        where: { id: row.id },
        data: { status: 'failed', stage: null, error: errorOf(err), completedAt: new Date() },
      });
      return { failed: errorOf(err).kind ?? 'error' };
    }
  };
}

/** HTML → A4 PDF with headless Chromium (no network: everything is inlined). */
export async function renderPdf(html: string, executablePath?: string): Promise<Buffer> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    return Buffer.from(
      await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    await browser.close();
  }
}
