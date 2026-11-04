import {
  type Analysis,
  type createAnalysisRequestSchema,
  type createDesignFromAnalysisRequestSchema,
  DisplayIdPrefixes,
  JobKinds,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, type Prisma } from '@ai-designer/db';
import {
  type AnalysisResult,
  buildDesignState,
  type ComponentDecision,
  type FabricChoice,
  type InputRole,
  libraryCategoryOf,
  normalizedAttributes,
  type SketchAnalysis,
  type SourceImage,
} from '@ai-designer/design-ai';
import {
  patternSpecSchema,
  type PropertyValue,
  validateDesignState,
} from '@ai-designer/garment-model';
import { draftPattern, patternDesignState } from '@ai-designer/pattern-model';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { JobService } from '../../platform/jobs/job.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { DesignsService } from '../designs/designs.service.js';
import { ProjectsService } from '../projects/projects.service.js';

type AnalysisRow = Prisma.DesignAnalysisGetPayload<object>;

/** Component types a fabric artifact may be used on. */
const FABRIC_TARGETS = [
  'garment_body',
  'front_body_panel',
  'back_body_panel',
  'sleeve',
  'cuff',
  'collar',
  'collar_stand',
  'placket',
  'pocket',
  'yoke',
  'waistband',
  'skirt_panel',
  'leg_panel',
  'hood',
  'lining',
  'facing',
  'neckline',
  'custom',
];

const aiProperty = (value: string, analysisId: string): PropertyValue => ({
  value,
  unit: null,
  status: 'inferred',
  sourceType: 'ai_interpretation',
  sourceRefs: [
    { sourceType: 'ai_interpretation', entityId: analysisId, revisionId: null, note: null },
  ],
  confidence: null,
  reviewRequired: true,
  confirmedBy: null,
  confirmedAt: null,
});

/**
 * Component 1 — AI design analyzer (ADR-056). Owns `design_analyses`. Creating an analysis queues a
 * durable job (worker: decomposition, library matching, detail pass, crops); the user reviews the
 * result and creates a design from it — fabrics and new components are saved to the library then.
 */
@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly assets: AssetsService,
    private readonly projects: ProjectsService,
    private readonly designs: DesignsService,
    private readonly artifacts: ArtifactsService,
    private readonly ai: AiUsageService,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('analysis', {
      label: 'Analysis',
      organizationOf: async (id) =>
        (
          await this.prisma.designAnalysis.findFirst({
            where: { id },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      governedBy: async (id) => {
        const row = await this.prisma.designAnalysis.findFirst({
          where: { id },
          select: { projectId: true },
        });
        return row ? { type: 'project', id: row.projectId } : null;
      },
    });
  }

  async create(
    ctx: AuthzContext,
    projectId: string,
    body: z.output<typeof createAnalysisRequestSchema>,
  ): Promise<Analysis> {
    await this.projects.requireWorkable(ctx.organizationId, projectId);
    const inputs: { assetId: string; role: string; fileName: string | null }[] = [];
    for (const input of body.inputs) {
      const asset = await this.assets.get(ctx, input.assetId);
      if (
        asset.status !== 'ready' ||
        !asset.mediaType ||
        !/^image\/(png|jpeg|webp)$/.test(asset.mediaType)
      )
        throw new AppError(
          'VALIDATION_FAILED',
          'Every input must be a PNG, JPEG or WebP image that finished uploading',
          {
            issues: [
              {
                path: 'inputs',
                message: `${asset.fileName ?? asset.displayId} is not a ready image`,
                code: 'asset_not_ready',
              },
            ],
          },
        );
      inputs.push({ assetId: asset.id, role: input.role, fileName: asset.fileName });
    }
    const sketch = body.mode === 'sketch';
    if (sketch && body.inputs.length > 4)
      throw new AppError('VALIDATION_FAILED', 'Upload one sketch (and up to 3 more views of it)', {
        issues: [{ path: 'inputs', message: 'Too many images for a sketch', code: 'too_many' }],
      });
    const provider = await this.ai.preflight(
      ctx,
      body.provider,
      sketch ? 1 : 2,
      sketch ? ['image_analysis'] : ['garment_reconstruction'],
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const id = newId();
      const created = await tx.designAnalysis.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          projectId,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.analysis),
          status: 'queued',
          stage: 'Waiting for the analyzer',
          inputs: inputs as unknown as Prisma.InputJsonValue,
          notes: body.notes ?? null,
          garmentHint: body.garmentHint ?? null,
          audience: body.audience ?? null,
          mode: body.mode,
          size: body.size ?? null,
          provider,
          createdBy: ctx.userId,
        },
      });
      const job = await this.jobs.create(
        { kind: JobKinds.designAnalysis, payload: { analysisId: id }, maxAttempts: 2 },
        tx,
      );
      await this.audit.record(
        {
          eventType: 'analysis.requested',
          action: 'design.create',
          outcome: 'success',
          resourceType: 'analysis',
          resourceId: id,
          metadata: { projectId, provider, inputs: inputs.length },
        },
        tx,
      );
      return tx.designAnalysis.update({ where: { id: created.id }, data: { jobId: job.id } });
    });
    return this.view(row);
  }

  async get(ctx: AuthzContext, analysisId: string): Promise<Analysis> {
    return this.view(await this.find(ctx, analysisId));
  }

  async createDesign(
    ctx: AuthzContext,
    analysisId: string,
    body: z.output<typeof createDesignFromAnalysisRequestSchema>,
  ) {
    const row = await this.find(ctx, analysisId);
    if (row.status !== 'succeeded' || !row.result)
      throw new AppError('INVALID_STATE_TRANSITION', 'The analysis has not finished', {
        status: row.status,
      });
    if (row.mode === 'sketch') return this.createPatternDesign(ctx, row, body);
    const result = row.result as unknown as AnalysisResult;
    const inputs = row.inputs as unknown as {
      assetId: string;
      role: string;
      fileName: string | null;
    }[];
    const crops = row.crops as unknown as Record<string, string>;
    const scope = ctx.permissions.has('artifact.publish') ? 'organization' : 'user';
    const notes: string[] = [];
    const canCreateArtifacts = ctx.permissions.has('artifact.create');

    // Sources with their roles (the model decided the roles left on "auto").
    const sources: SourceImage[] = inputs.map((input, index) => {
      const decided = result.decomposition.inputs.find((i) => i.index === index)?.role;
      const role = (input.role === 'auto' ? (decided ?? 'other') : input.role) as InputRole;
      return { index, assetId: input.assetId, role, label: input.fileName };
    });

    // Fabrics become reusable fabric artifacts (preview = the uploaded swatch).
    const fabrics: Record<string, FabricChoice> = {};
    let fabricsCreated = 0;
    if (canCreateArtifacts)
      for (const f of result.decomposition.fabrics) {
        try {
          const preview = f.imageIndex !== null ? inputs[f.imageIndex]?.assetId : undefined;
          const visual: Record<string, PropertyValue> = {};
          if (f.color) visual['appearance.color'] = aiProperty(f.color.toLowerCase(), row.id);
          if (['solid', 'stripe', 'check', 'print'].includes(f.pattern))
            visual['appearance.pattern'] = aiProperty(
              f.pattern === 'stripe' ? 'stripe' : f.pattern,
              row.id,
            );
          const created = await this.artifacts.create(ctx, {
            category: 'fabric',
            name: f.name.slice(0, 120),
            description: [
              f.texture,
              f.likelyMaterial ? `Likely ${f.likelyMaterial} (unconfirmed)` : '',
              f.notes,
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 2000),
            tags: ['ai'],
            scope,
            definition: {
              compatibleTargetTypes: FABRIC_TARGETS,
              placementModes: ['tiled_fill'],
              repeatable: true,
              shapeParams: { kind: 'swatch', params: { repeatMm: 120 } },
            },
            properties: { visual, physical: {} },
            ...(preview ? { previewAssetId: preview } : {}),
            changeNote: `Identified by the AI design analyzer (${row.displayId})`,
          });
          fabrics[f.key] = {
            artifactId: created.id,
            artifactRevisionId: created.currentRevisionId!,
            name: created.name,
            color: f.color,
          };
          fabricsCreated++;
        } catch (e) {
          // Keep going without that fabric (e.g. invalid visual value) — never block the design.
          notes.push(`Fabric "${f.name}" was not saved to the library: ${(e as Error).message}`);
          this.logger.warn({ err: e, analysisId }, 'fabric artifact not created');
        }
      }

    const decisions: Record<string, ComponentDecision> = {};
    for (const c of result.decomposition.components) {
      const choice = body.decisions[c.key];
      const match = result.matches[c.key];
      if (choice === 'skip') decisions[c.key] = { use: 'skip' };
      else if (
        (choice === 'library' ||
          (!choice && (match?.kind === 'exact' || match?.kind === 'compatible'))) &&
        match?.entry
      )
        decisions[c.key] = { use: 'library', entry: match.entry };
      else decisions[c.key] = { use: 'ai' };
    }

    const built = buildDesignState({
      analysisId: row.id,
      analysis: result.decomposition,
      details: result.details,
      sources,
      crops,
      decisions,
      fabrics,
      fabricAssignments: body.fabricAssignments,
      ...(result.imageSizes ? { imageSizes: result.imageSizes } : {}),
      actor: { userId: ctx.userId, now: new Date().toISOString() },
    });
    notes.push(...built.notes);
    if (built.problems.length)
      throw new AppError(
        'VALIDATION_FAILED',
        `The analysed garment could not be turned into a valid design: ${built.problems.slice(0, 3).join('; ')}`,
        {
          issues: built.problems
            .slice(0, 20)
            .map((message) => ({ path: 'analysis', message, code: 'design_invalid' })),
        },
      );
    const design = await this.designs.createFromState(ctx, row.projectId, {
      name: body.name,
      state: built.state,
      summary: `Created by the AI design analyzer (${row.displayId}, ${result.provider})`,
    });

    // Save newly identified components to the library (deduplicated by signature).
    let libraryEntriesCreated = 0;
    if (body.saveToLibrary && canCreateArtifacts) {
      const seen = new Set<string>();
      for (const c of result.decomposition.components) {
        const decision = decisions[c.key];
        if (decision?.use !== 'ai') continue;
        const category = libraryCategoryOf(c.componentType);
        if (!category) continue;
        const detail = result.details?.details.find((d) => d.key === c.key);
        const attributes = normalizedAttributes({ ...c.attributes, ...(detail?.attributes ?? {}) });
        const dims = { ...c.measurementsMm, ...(detail?.measurementsMm ?? {}) };
        const signature = JSON.stringify([c.componentType, attributes]);
        if (seen.has(signature)) continue;
        seen.add(signature);
        const componentId = built.componentIds[c.key];
        const component = built.state.components.find((x) => x.componentId === componentId);
        const pieces = (built.state.patternPieces ?? []).filter(
          (p) => p.componentId === componentId,
        );
        const visual: Record<string, PropertyValue> = {};
        for (const [key, pv] of Object.entries(component?.properties ?? {}))
          if (
            pv.value !== null &&
            (key.startsWith('construction.') || key.startsWith('appearance.')) &&
            pv.sourceType === 'ai_interpretation'
          )
            visual[key] = pv;
        try {
          await this.artifacts.create(ctx, {
            category: category as never,
            artifactType: c.componentType,
            name:
              (c.side !== 'none' ? c.name.replace(/^(left|right)\s+/i, '') : c.name).slice(
                0,
                120,
              ) || c.name,
            description: (detail?.description || c.description).slice(0, 2000),
            tags: ['ai', c.componentType],
            scope,
            definition: {
              compatibleTargetTypes: [c.componentType],
              placementModes: ['attach'],
              matchSignature: { componentType: c.componentType, attributes, dimensionsMm: dims },
              patternPieces: pieces.map((p) => ({ ...p, status: 'provisional' })),
              details: {
                description: (detail?.description || c.description).slice(0, 2000),
                constructionNotes: detail?.constructionNotes ?? [],
              },
            },
            properties: { visual, physical: {} },
            ...(crops[c.key] ? { previewAssetId: crops[c.key] } : {}),
            changeNote: `Identified by the AI design analyzer (${row.displayId})`,
          });
          libraryEntriesCreated++;
        } catch (e) {
          notes.push(`"${c.name}" was not saved to the library: ${(e as Error).message}`);
          this.logger.warn({ err: e, analysisId }, 'library entry not created');
        }
      }
    }

    await this.prisma.designAnalysis.update({
      where: { id: row.id },
      data: { designId: design.id },
    });
    return { design, libraryEntriesCreated, fabricsCreated, notes: notes.slice(0, 30) };
  }

  /**
   * Sketch mode (ADR-058): the reviewed pattern spec → pattern engine → a pattern-first design whose
   * pieces carry exact dimensions. The sketch stays as the reference image.
   */
  private async createPatternDesign(
    ctx: AuthzContext,
    row: AnalysisRow,
    body: z.output<typeof createDesignFromAnalysisRequestSchema>,
  ) {
    const result = row.result as unknown as SketchAnalysis;
    const parsed = patternSpecSchema.safeParse(body.patternSpec ?? result.spec);
    if (!parsed.success)
      throw new AppError('VALIDATION_FAILED', 'The pattern options are not valid', {
        issues: parsed.error.issues.slice(0, 20).map((i) => ({
          path: `patternSpec.${i.path.join('.')}`,
          message: i.message,
          code: i.code,
        })),
      });
    const inputs = row.inputs as unknown as { assetId: string; fileName: string | null }[];
    const draft = draftPattern(parsed.data);
    const state = patternDesignState(draft, {
      createdFrom: 'ai',
      sources: inputs.map((i, n) => ({
        assetId: i.assetId,
        role: 'sketch' as const,
        label: i.fileName ?? (n === 0 ? 'Sketch' : `View ${n + 1}`),
      })),
    });
    state.metadata = {
      garmentLabel: result.reading?.label ?? draft.rootName,
      analysisId: row.id,
      sketchDetails: result.reading?.details ?? [],
    };
    const issues = validateDesignState(state).findings.filter((f) => f.outcome === 'error');
    if (issues.length)
      throw new AppError(
        'VALIDATION_FAILED',
        `The drafted pattern is not valid: ${issues[0]!.message}`,
        {
          issues: issues
            .slice(0, 20)
            .map((f) => ({ path: 'pattern', message: f.message, code: f.ruleId })),
        },
      );
    const design = await this.designs.createFromState(ctx, row.projectId, {
      name: body.name,
      state,
      summary: `Patterns drafted from a sketch (${row.displayId}, ${result.provider})`,
    });
    await this.prisma.designAnalysis.update({
      where: { id: row.id },
      data: { designId: design.id },
    });
    return {
      design,
      libraryEntriesCreated: 0,
      fabricsCreated: 0,
      notes: [...(result.notes ?? [])].slice(0, 30),
    };
  }

  private async find(ctx: AuthzContext, id: string): Promise<AnalysisRow> {
    const row = await this.prisma.designAnalysis.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!row) throw AppError.notFound('Analysis');
    return row;
  }

  private view(row: AnalysisRow): Analysis {
    const error = row.error as { message?: string; kind?: string } | null;
    return {
      id: row.id,
      displayId: row.displayId,
      projectId: row.projectId,
      status: row.status as Analysis['status'],
      stage: row.stage,
      inputs: row.inputs as unknown as Analysis['inputs'],
      notes: row.notes,
      garmentHint: row.garmentHint,
      audience: row.audience,
      mode: row.mode === 'sketch' ? 'sketch' : 'images',
      size: row.size,
      provider: row.provider as Analysis['provider'],
      result: (row.result as Record<string, unknown> | null) ?? null,
      crops: (row.crops as Record<string, string>) ?? {},
      error: error
        ? { message: error.message ?? 'The analysis failed', kind: error.kind ?? null }
        : null,
      designId: row.designId,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}
