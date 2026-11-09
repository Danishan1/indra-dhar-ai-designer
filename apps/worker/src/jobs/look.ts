import type { AiImageInput } from '@ai-designer/ai';
import {
  LOOK_VIEW_TITLES,
  type LookStyle,
  type LookView,
  lookPrompt,
} from '@ai-designer/design-ai';
import { canonicalJson, readAnyVersion, sha256Hex } from '@ai-designer/garment-model';
import { patternSheetSvg } from '@ai-designer/pattern-model';
import sharp from 'sharp';
import { z } from 'zod';

import {
  type AiStudioDeps,
  errorOf,
  loadImage,
  storeImage,
  studioProvider,
  usageRecorder,
} from './ai-studio.js';
import type { JobHandler, JobHandlerContext } from './durable-job-processor.js';

const VIEWS: readonly LookView[] = ['front', 'back', 'left', 'right'];
const payloadSchema = z.object({ lookId: z.uuid() });

interface StoredView {
  view: LookView;
  assetId: string | null;
  note: string | null;
}

/**
 * `look.generate` (ADR-064): draws the garment sewn from the pattern pieces of one committed
 * revision from four sides. Inputs to the image model: the pattern sheet (the shapes), the front
 * view once drawn (so the other views show the same garment) and the original sketch (mood only).
 * Each view is stored as soon as it is ready so the editor shows progress; a failed view is
 * recorded with its reason and the others still run. The design is never changed.
 */
export function lookHandler(deps: AiStudioDeps): JobHandler {
  return async (ctx: JobHandlerContext) => {
    const { lookId } = payloadSchema.parse(ctx.payload);
    const prisma = deps.assets.prisma;
    const row = await prisma.designLook.findUnique({ where: { id: lookId } });
    if (!row) return { skipped: 'not_found' };
    if (row.status === 'succeeded' || row.status === 'failed') return { skipped: row.status };
    const views: StoredView[] = [];
    const save = async (data: { stage?: string | null; status?: string }) => {
      await prisma.designLook.update({
        where: { id: row.id },
        data: { status: 'running', ...data, views: JSON.parse(JSON.stringify(views)) as object },
      });
      await ctx.heartbeat();
    };
    const stage = (text: string) => save({ stage: text });
    try {
      await stage('Reading the patterns');
      const revision = await prisma.designRevision.findFirst({
        where: { id: row.revisionId, organizationId: row.organizationId, designId: row.designId },
      });
      if (!revision) throw new Error('The revision no longer exists');
      if (sha256Hex(canonicalJson(revision.snapshot)) !== revision.contentHash)
        throw new Error('The revision failed its integrity check');
      const state = readAnyVersion(revision.snapshot).state;
      const pieces = state.patternPieces ?? [];
      if (!pieces.length) throw new Error('The revision has no pattern pieces');
      const design = await prisma.design.findFirst({
        where: { id: row.designId },
        select: { projectId: true },
      });
      const provider = await studioProvider(deps, row.organizationId, row.provider, {
        record: usageRecorder(prisma, row.organizationId, ctx.job.id, {
          type: 'design_look',
          id: row.id,
        }),
        stage,
      });

      // The pattern sheet is the source of the shape (names, cut, sizes printed on each piece).
      const sheetPng = await sharp(Buffer.from(patternSheetSvg(pieces)), { density: 72 })
        .resize({ width: 1600, height: 1600, fit: 'inside' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      const sheet: AiImageInput = {
        mediaType: 'image/png',
        data: new Uint8Array(sheetPng),
        label: 'pattern sheet (source of the shape)',
      };
      let sketch: AiImageInput | null = null;
      for (const src of (state.sources ?? []).filter(
        (x) => x.role === 'sketch' || x.role === 'reference',
      )) {
        const img = await loadImage(deps, row.organizationId, src.assetId).catch(() => null);
        if (img) {
          sketch = { ...img.image, label: 'original sketch (mood only)' };
          break;
        }
      }

      const style: LookStyle = row.style === 'realistic' ? 'realistic' : 'sketch';
      let front: AiImageInput | null = null;
      let lastError: ReturnType<typeof errorOf> | null = null;
      for (const view of VIEWS) {
        await stage(`Drawing the ${LOOK_VIEW_TITLES[view].toLowerCase()}`);
        try {
          const out = await provider.generateImage({
            task: 'image_look_view',
            prompt: lookPrompt(view, {
              state,
              style,
              hasFrontReference: !!front,
              hasSketch: !!sketch,
            }),
            referenceImages: [sheet, front, sketch].filter((x): x is AiImageInput => !!x),
            aspect: 'portrait',
          });
          // Normalize to PNG (the fake provider returns SVG placeholders).
          const png = await sharp(Buffer.from(out.image.data)).png().toBuffer();
          const assetId = await storeImage(deps, {
            organizationId: row.organizationId,
            projectId: design?.projectId ?? null,
            buffer: png,
            fileName: `${row.displayId}-${view}.png`,
            assetType: 'generated_image',
            provenance: { sourceType: 'ai_job', sourceEntityId: row.id, jobId: ctx.job.id },
            createdBy: row.createdBy,
          });
          if (view === 'front')
            front = { mediaType: 'image/png', data: new Uint8Array(png), label: 'front view' };
          views.push({ view, assetId, note: null });
        } catch (err) {
          lastError = errorOf(err);
          ctx.logger.warn({ err, lookId, view }, 'look view failed');
          views.push({ view, assetId: null, note: `Not drawn: ${lastError.message}` });
        }
        await save({});
      }

      const drawn = views.filter((v) => v.assetId).length;
      await prisma.designLook.update({
        where: { id: row.id },
        data: {
          status: drawn > 0 ? 'succeeded' : 'failed',
          stage: null,
          views: JSON.parse(JSON.stringify(views)) as object,
          error: drawn > 0 || !lastError ? undefined : (lastError as object),
          completedAt: new Date(),
        },
      });
      return { views: drawn };
    } catch (err) {
      ctx.logger.warn({ err, lookId }, 'look preview failed');
      await prisma.designLook.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          stage: null,
          views: JSON.parse(JSON.stringify(views)) as object,
          error: errorOf(err) as object,
          completedAt: new Date(),
        },
      });
      return { failed: errorOf(err).kind ?? 'error' };
    }
  };
}
