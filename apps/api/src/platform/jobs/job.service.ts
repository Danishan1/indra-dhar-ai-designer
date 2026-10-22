import { type JobView } from '@ai-designer/contracts';
import {
  type CreatedJob,
  type CreateJobInput,
  createDurableJob,
  type DbClient,
  type WriteMeta,
} from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Durable jobs (ADR-023): a Postgres `jobs` row is the source of truth; BullMQ only carries the id.
 * `create` writes the row + `job.queued` outbox event (pass the transaction client of the related
 * state change); the worker enqueues and runs it (apps/worker/src/jobs).
 */
@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: CreateJobInput,
    db: DbClient = this.prisma,
    meta: Partial<WriteMeta> = {},
  ): Promise<CreatedJob> {
    return createDurableJob(db, input, RequestContext.writeMeta(meta));
  }

  /** Tenant-scoped lookup: a job of another organization is reported as not found. */
  async get(id: string, organizationId: string | null): Promise<JobView> {
    const job = await this.prisma.job.findFirst({ where: { id, organizationId } });
    if (!job) throw AppError.notFound('Job');
    return {
      id: job.id,
      displayId: job.displayId,
      kind: job.kind,
      status: job.status as JobView['status'],
      attempts: job.attempts,
      result: job.result ?? null,
      failure: job.failure ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }
}
