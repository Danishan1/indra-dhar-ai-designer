import type { EventDefinition } from '@ai-designer/contracts';
import { appendOutboxEvent, type DbClient, type WriteMeta } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { RequestContext } from '../context/request-context.js';

/**
 * Transactional outbox (ADR-005). ALWAYS pass the transaction client of the state change:
 * `await prisma.$transaction(async (tx) => { …write…; await outbox.append(tx, ProjectCreated, {...}); })`.
 */
@Injectable()
export class OutboxService {
  append<P extends z.ZodType>(
    db: DbClient,
    def: EventDefinition<P>,
    payload: z.input<P>,
    meta: Partial<WriteMeta> = {},
  ): Promise<string> {
    return appendOutboxEvent(db, def, payload, RequestContext.writeMeta(meta));
  }
}
