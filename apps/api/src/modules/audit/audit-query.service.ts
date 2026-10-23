import {
  type AuditEventView,
  type AuditSearchQuery,
  auditSearchQuerySchema,
  decodeCursor,
  encodeCursor,
  type Page,
} from '@ai-designer/contracts';
import type { Prisma } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AccountService } from '../identity/account.service.js';

type Query = z.output<typeof auditSearchQuerySchema>;

/**
 * Organization audit search (FR-SEC-180/182): read-only, always scoped to the caller's verified
 * organization (no API can alter audit rows; the table also rejects UPDATE/DELETE). Searching is
 * itself audited.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounts: AccountService,
  ) {}

  async search(organizationId: string, query: Query): Promise<Page<AuditEventView>> {
    const cursor = query.cursor ? decodeCursor<{ t: string; id: string }>(query.cursor) : null;
    if (query.cursor && !cursor)
      throw new AppError('VALIDATION_FAILED', 'Invalid cursor', {
        issues: [{ path: 'cursor', message: 'Invalid cursor', code: 'invalid' }],
      });
    const where: Prisma.AuditEventWhereInput = {
      organizationId,
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.eventType ? { eventType: { startsWith: query.eventType } } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: new Date(cursor.t) } },
              { occurredAt: new Date(cursor.t), id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const actorIds = [
      ...new Set(
        page.filter((r) => r.actorType === 'human' && r.actorId).map((r) => r.actorId as string),
      ),
    ];
    const profiles = await this.accounts.getProfiles(actorIds);

    await this.audit.record(
      {
        eventType: 'audit.searched',
        action: 'audit.view',
        outcome: 'success',
        resourceType: 'audit_log',
        resourceId: organizationId,
        metadata: { filters: { ...query, cursor: undefined }, results: page.length },
      },
      undefined,
      { organizationId },
    );

    return {
      items: page.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        eventType: r.eventType,
        action: r.action,
        outcome: r.outcome as AuditEventView['outcome'],
        actor: {
          type: r.actorType,
          id: r.actorId,
          displayName: r.actorId ? (profiles.get(r.actorId)?.displayName ?? null) : null,
        },
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        reasonCode: r.reasonCode,
        requestId: r.requestId,
        metadata: (r.metadata as Record<string, unknown> | null) ?? {},
      })),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ t: last.occurredAt.toISOString(), id: last.id })
          : null,
    };
  }
}

export type { AuditSearchQuery };
