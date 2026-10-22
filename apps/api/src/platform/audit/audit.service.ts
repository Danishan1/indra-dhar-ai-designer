import { type AuditInput, type DbClient, recordAuditEvent, type WriteMeta } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { RequestContext } from '../context/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Append-only audit trail (SPEC-009 §15). Actor/org/request ids come from the RequestContext. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    input: AuditInput,
    db: DbClient = this.prisma,
    meta: Partial<WriteMeta> = {},
  ): Promise<string> {
    return recordAuditEvent(db, input, RequestContext.writeMeta(meta));
  }
}
