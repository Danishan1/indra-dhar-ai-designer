import { type DbClient, nextDisplayId, nextSequenceValue } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Human-readable display ids (ADR-001): `PRJ-000123`, `JOB-000042` … unique per organization,
 * gap-tolerant, allocated atomically (single INSERT … ON CONFLICT … RETURNING row lock). Pass the
 * transaction client so the id is allocated in the same transaction as the record.
 */
@Injectable()
export class IdSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  next(prefix: string, organizationId: string | null, db: DbClient = this.prisma): Promise<string> {
    return nextDisplayId(db, organizationId, prefix);
  }

  nextValue(scopeKey: string, prefix: string, db: DbClient = this.prisma): Promise<bigint> {
    return nextSequenceValue(db, scopeKey, prefix);
  }
}
