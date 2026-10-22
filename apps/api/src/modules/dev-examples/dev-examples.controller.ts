import { DevEchoedEvent, JobKinds, jobViewSchema } from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { JobService } from '../../platform/jobs/job.service.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

export const echoRequestSchema = z.object({ message: z.string().trim().min(1).max(500) });
export const echoResponseSchema = z.object({
  echo: z.string(),
  eventId: z.uuid(),
  auditId: z.uuid(),
  job: z.object({ id: z.uuid(), displayId: z.string() }),
});

/**
 * Reference implementation of the platform primitives (I03). Copy this shape for real modules:
 * validated input → one transaction → state change + audit + outbox event (+ durable job).
 * Registered only when dev routes are enabled (never in production).
 */
@Controller('_dev')
export class DevExamplesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly jobs: JobService,
  ) {}

  @Post('echo-idempotent')
  @Idempotent()
  @Endpoint({
    summary: 'Demo: idempotent write with audit, outbox event and durable job',
    tags: ['dev'],
    body: echoRequestSchema,
    response: echoResponseSchema,
    internal: true,
  })
  async echo(
    @Body() body: z.infer<typeof echoRequestSchema>,
  ): Promise<z.infer<typeof echoResponseSchema>> {
    return this.prisma.$transaction(async (tx) => {
      const eventId = await this.outbox.append(tx, DevEchoedEvent, { message: body.message });
      const job = await this.jobs.create(
        { kind: JobKinds.systemNoop, payload: { message: body.message } },
        tx,
      );
      const auditId = await this.audit.record(
        {
          eventType: 'dev.echo',
          action: 'dev.echo',
          outcome: 'success',
          resourceType: 'job',
          resourceId: job.id,
        },
        tx,
      );
      return {
        echo: body.message,
        eventId,
        auditId,
        job: { id: job.id, displayId: job.displayId },
      };
    });
  }

  @Get('jobs/:jobId')
  @Endpoint({
    summary: 'Demo: read a durable job',
    tags: ['dev'],
    params: z.object({ jobId: z.uuid() }),
    response: jobViewSchema,
    errors: ['NOT_FOUND'],
    internal: true,
  })
  getJob(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId, RequestContext.get()?.organizationId ?? null);
  }
}
