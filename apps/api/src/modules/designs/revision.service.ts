import {
  decodeCursor,
  encodeCursor,
  formatRevisionId,
  type Page,
  type Revision,
  type RevisionSummary,
  type ValidationSummary,
} from '@ai-designer/contracts';
import { newId, type Design, type DesignRevision, type Prisma } from '@ai-designer/db';
import {
  canonicalJson,
  canonicalize,
  contentHash,
  diffDesignStates,
  readAnyVersion,
  semanticHash,
  sha256Hex,
  type DesignDiff,
  type GarmentDesignState,
  type ValidationFinding,
} from '@ai-designer/garment-model';
import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AccountService } from '../identity/account.service.js';

import {
  composeChangeSummary,
  diffCounts,
  extractRefs,
  summarizeDiff,
  validationSummaryOf,
} from './change-summary.js';

type Db = Prisma.TransactionClient | PrismaService;

export interface NewRevision {
  /** Pre-allocated id (so commit hooks can reference it); generated when omitted. */
  id?: string;
  design: Design;
  state: GarmentDesignState;
  /** Parent revision and its (read-upgraded) state; null for the first revision. */
  parent: { id: string; state: GarmentDesignState } | null;
  restoredFromRevisionId: string | null;
  /** Summary typed by the user, or the fixed text for creation/duplication. */
  summaryText: string | undefined;
  findings: readonly ValidationFinding[];
  createdBy: string;
  /** Design operations included in this revision (I14). */
  operationIds?: string[];
}

/** Revision summary columns only — snapshots are never loaded for lists (TECH §9.1). */
const SUMMARY_SELECT = {
  id: true,
  organizationId: true,
  designId: true,
  displayId: true,
  revisionNumber: true,
  parentRevisionIds: true,
  restoredFromRevisionId: true,
  contentHash: true,
  semanticHash: true,
  schemaVersion: true,
  changeSummary: true,
  validationSummary: true,
  artifactRevisionRefs: true,
  sourceAssetRefs: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.DesignRevisionSelect;
type SummaryRow = Prisma.DesignRevisionGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Immutable design revisions (I12, ADR-003). Owns writes to `design_revisions` (inserts only — a
 * trigger rejects UPDATE/DELETE) and the head pointer on `designs`. Every read of a snapshot
 * recomputes its hash first (FR-PRJ-023).
 */
@Injectable()
export class RevisionService {
  private readonly logger = new Logger('Revisions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
  ) {}

  /**
   * Inserts the next revision and moves the design's head to it. Call inside the transaction that
   * holds the working-copy lock (or creates the design).
   */
  async insert(tx: Prisma.TransactionClient, input: NewRevision): Promise<DesignRevision> {
    const { design, state, parent } = input;
    const number = design.revisionCounter + 1;
    const diff = parent ? diffDesignStates(parent.state, state) : null;
    const lines = diff ? summarizeDiff(diff, parent?.state ?? null, state) : [];
    const refs = extractRefs(state);
    const snapshot = JSON.parse(canonicalize(state)) as Prisma.InputJsonValue;
    const row = await tx.designRevision.create({
      data: {
        id: input.id ?? newId(),
        organizationId: design.organizationId,
        designId: design.id,
        displayId: formatRevisionId(design.displayId, number),
        revisionNumber: number,
        parentRevisionIds: parent ? [parent.id] : [],
        restoredFromRevisionId: input.restoredFromRevisionId,
        snapshot,
        contentHash: contentHash(state),
        semanticHash: semanticHash(state),
        schemaVersion: state.schemaVersion,
        artifactRevisionRefs: refs.artifactRevisionRefs,
        sourceAssetRefs: refs.sourceAssetRefs,
        changeSummary: diff
          ? composeChangeSummary(input.summaryText, lines)
          : (input.summaryText ?? ''),
        changeDiffSummary: (diff
          ? { lines, counts: diffCounts(diff) }
          : { lines: [], counts: null }) as Prisma.InputJsonValue,
        validationSummary: validationSummaryOf(state) as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        operationIds: input.operationIds ?? [],
      },
    });
    const { count } = await tx.design.updateMany({
      where: { id: design.id, revisionCounter: design.revisionCounter },
      data: {
        headRevisionId: row.id,
        revisionCounter: number,
        garmentType: state.garmentType,
        garmentCategory: state.garmentCategory,
      },
    });
    if (count !== 1)
      throw new AppError('CONCURRENT_MODIFICATION', 'Another revision was saved at the same time', {
        designId: design.id,
      });
    return row;
  }

  /** Semantic hash of the design's head (to know whether a working copy has uncommitted changes). */
  async headSemanticHash(db: Db, design: Pick<Design, 'headRevisionId'>): Promise<string | null> {
    if (!design.headRevisionId) return null;
    const head = await db.designRevision.findUnique({
      where: { id: design.headRevisionId },
      select: { semanticHash: true },
    });
    return head?.semanticHash ?? null;
  }

  /**
   * Loads a revision of `designId` (when given) in the tenant, verifies its hash and returns it with
   * its state upgraded to the current schema for reading — the stored snapshot is never rewritten
   * (VER-004, FR-PRJ-040).
   */
  async loadVerified(
    db: Db,
    organizationId: string,
    revisionId: string,
    designId?: string,
  ): Promise<{ row: DesignRevision; state: GarmentDesignState }> {
    const row = await db.designRevision.findFirst({
      where: { id: revisionId, organizationId, ...(designId ? { designId } : {}) },
    });
    if (!row) throw new AppError('REVISION_NOT_FOUND', 'Revision not found', { revisionId });
    this.verify(row);
    return { row, state: readAnyVersion(row.snapshot).state };
  }

  /** Recomputes the canonical hash; a mismatch means the stored snapshot was altered. */
  verify(row: Pick<DesignRevision, 'id' | 'snapshot' | 'contentHash' | 'organizationId'>): void {
    const actual = sha256Hex(canonicalJson(row.snapshot));
    if (actual !== row.contentHash) {
      this.logger.error(
        { alert: 'revision_integrity', revisionId: row.id, organizationId: row.organizationId },
        'design revision snapshot does not match its content hash',
      );
      throw new AppError(
        'INTEGRITY_CHECK_FAILED',
        'This revision failed its integrity check and cannot be used. The incident was logged.',
        { revisionId: row.id },
      );
    }
  }

  async history(
    organizationId: string,
    designId: string,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<Page<RevisionSummary>> {
    const cursor = query.cursor ? decodeCursor<{ n: number }>(query.cursor) : null;
    const rows = await this.prisma.designRevision.findMany({
      where: {
        organizationId,
        designId,
        ...(cursor ? { revisionNumber: { lt: cursor.n } } : {}),
      },
      select: SUMMARY_SELECT,
      orderBy: { revisionNumber: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.toSummaries(page),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ n: last.revisionNumber }) : null,
    };
  }

  async get(organizationId: string, revisionId: string): Promise<Revision> {
    const { row } = await this.loadVerified(this.prisma, organizationId, revisionId);
    const [summary] = await this.toSummaries([row]);
    return {
      ...(summary as RevisionSummary),
      snapshot: row.snapshot as Record<string, unknown>,
      changeDiffSummary: row.changeDiffSummary as Record<string, unknown>,
      integrity: 'verified',
    };
  }

  diff(from: GarmentDesignState, to: GarmentDesignState): { diff: DesignDiff; lines: string[] } {
    const diff = diffDesignStates(from, to);
    return { diff, lines: summarizeDiff(diff, from, to) };
  }

  /** Summaries of the given revisions of a design, keyed by id (missing ids are skipped). */
  async summariesByIds(
    organizationId: string,
    designId: string,
    ids: readonly string[],
  ): Promise<Map<string, RevisionSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.designRevision.findMany({
      where: { organizationId, designId, id: { in: [...ids] } },
      select: SUMMARY_SELECT,
    });
    return new Map((await this.toSummaries(rows)).map((s) => [s.id, s]));
  }

  async toSummaries(rows: readonly SummaryRow[]): Promise<RevisionSummary[]> {
    const ids = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
    const profiles = ids.length ? await this.accounts.getProfiles(ids) : new Map();
    return rows.map((r) => ({
      id: r.id,
      designId: r.designId,
      displayId: r.displayId,
      revisionNumber: r.revisionNumber,
      parentRevisionIds: r.parentRevisionIds,
      restoredFromRevisionId: r.restoredFromRevisionId,
      contentHash: r.contentHash,
      schemaVersion: r.schemaVersion,
      changeSummary: r.changeSummary,
      validationSummary: r.validationSummary as ValidationSummary,
      artifactRevisionRefs: r.artifactRevisionRefs,
      sourceAssetRefs: r.sourceAssetRefs,
      createdBy: r.createdBy,
      createdByName: r.createdBy ? (profiles.get(r.createdBy)?.displayName ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      reviewStatus: null,
    }));
  }
}
