import type { AiImageInput } from '@ai-designer/ai';
import {
  LOOK_VIEW_TITLES,
  type LookStyle,
  type LookView,
  lookPrompt,
} from '@ai-designer/design-ai';
import { canonicalJson, readAnyVersion, sha256Hex } from '@ai-designer/garment-model';
import {
  type DesignGarment,
  designGarments,
  patternSheetSvg,
  piecesOfGarment,
} from '@ai-designer/pattern-model';
import sharp from 'sharp';
import { z } from 'zod';

import {
  type AiStudioDeps,
  errorOf,
  storeImage,
  studioProvider,
  usageRecorder,
} from './ai-studio.js';
import type { JobHandler, JobHandlerContext } from './durable-job-processor.js';

const ALL_VIEWS: readonly LookView[] = ['front', 'back', 'left', 'right'];
const payloadSchema = z.object({ lookId: z.uuid() });

interface StoredView {
  view: LookView;
  /** Line sketches: the garment of the set (`main`, `shorts`…); null for a model look. */
  garment: string | null;
  garmentName: string | null;
  assetId: string | null;
  note: string | null;
}

/**
 * `look.generate` (ADR-064): draws the garment sewn from the pattern pieces of one committed
 * revision. The drawings to make are the row's initial `views` (written by the API): on a model,
 * one per chosen view (whole outfit); as a line sketch, one per garment and view (front/back), each
 * garment on its own. Inputs to the image model are the patterns only: the pattern sheet (of that
 * garment for a sketch) and the first drawing made from it (so the others match). The original
 * sketch and reference photos are never sent — the look shows the edited patterns.
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
    // The drawings to make (placeholders written by the API); rows without them draw all four.
    const stored = ((row.views as Partial<StoredView>[] | null) ?? []).filter(
      (v): v is Partial<StoredView> & { view: LookView } => ALL_VIEWS.includes(v.view as LookView),
    );
    const views: StoredView[] = (
      stored.length
        ? stored
        : ALL_VIEWS.map((view): Partial<StoredView> & { view: LookView } => ({ view }))
    ).map((v) => ({
      view: v.view,
      garment: v.garment ?? null,
      garmentName: v.garmentName ?? null,
      assetId: null,
      note: null,
    }));
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

      // The pattern sheet is the source of the shape (names, cut, sizes printed on each piece);
      // a line sketch of one garment of a set gets the sheet of that garment only.
      const garments: DesignGarment[] = state.patternSpec ? designGarments(state.patternSpec) : [];
      const piecesFor = (key: string | null) => {
        if (!key || !garments.length) return pieces;
        const own = piecesOfGarment(pieces, garments, key);
        return own.length ? own : pieces;
      };
      const sheets = new Map<string, AiImageInput>();
      const sheetFor = async (key: string | null) => {
        const id = key ?? '*';
        let sheet = sheets.get(id);
        if (!sheet) {
          const png = await sharp(Buffer.from(patternSheetSvg(piecesFor(key))), { density: 72 })
            .resize({ width: 1600, height: 1600, fit: 'inside' })
            .flatten({ background: '#ffffff' })
            .png()
            .toBuffer();
          sheet = {
            mediaType: 'image/png',
            data: new Uint8Array(png),
            label: 'pattern sheet (source of the shape)',
          };
          sheets.set(id, sheet);
        }
        return sheet;
      };
      // Legacy 'realistic' looks were a dress form; they are drawn on a model now.
      const style: LookStyle = row.style === 'sketch' ? 'sketch' : 'model';
      const references = new Map<string, { view: LookView; image: AiImageInput }>();
      let lastError: ReturnType<typeof errorOf> | null = null;
      for (const [i, entry] of views.entries()) {
        const { view } = entry;
        const key = style === 'sketch' ? entry.garment : null;
        const reference = references.get(key ?? '*') ?? null;
        const sheet = await sheetFor(key);
        const what = entry.garmentName ? `${entry.garmentName.toLowerCase()} — ` : '';
        await stage(`Drawing the ${what}${LOOK_VIEW_TITLES[view].toLowerCase()}`);
        try {
          const out = await provider.generateImage({
            task: 'image_look_view',
            prompt: lookPrompt(view, {
              state,
              style,
              reference: reference?.view ?? null,
              garment:
                style === 'sketch'
                  ? {
                      name: entry.garmentName ?? 'Garment',
                      pieces: piecesFor(key),
                      ofSet: garments.length > 1,
                    }
                  : null,
            }),
            // Only the patterns (and a drawing already made from them) — never the original
            // sketch or reference photos (ADR-064).
            referenceImages: [sheet, reference?.image].filter((x): x is AiImageInput => !!x),
            aspect: 'portrait',
          });
          // Normalize to PNG (the fake provider returns SVG placeholders).
          const png = await sharp(Buffer.from(out.image.data)).png().toBuffer();
          const assetId = await storeImage(deps, {
            organizationId: row.organizationId,
            projectId: design?.projectId ?? null,
            buffer: png,
            fileName: `${row.displayId}-${key && key !== 'main' ? `${key}-` : ''}${view}.png`,
            assetType: 'generated_image',
            provenance: { sourceType: 'ai_job', sourceEntityId: row.id, jobId: ctx.job.id },
            createdBy: row.createdBy,
          });
          if (!reference)
            references.set(key ?? '*', {
              view,
              image: { mediaType: 'image/png', data: new Uint8Array(png), label: `${view} view` },
            });
          views[i] = { ...entry, assetId, note: null };
        } catch (err) {
          lastError = errorOf(err);
          ctx.logger.warn({ err, lookId, view, garment: key }, 'look view failed');
          views[i] = { ...entry, assetId: null, note: `Not drawn: ${lastError.message}` };
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
