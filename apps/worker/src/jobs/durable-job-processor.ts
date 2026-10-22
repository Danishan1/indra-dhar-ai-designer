import { JobFinishedEvent } from '@ai-designer/contracts';
import {
  appendOutboxEvent,
  type Job,
  newId,
  type PrismaClient,
  redactSecrets,
  SYSTEM_ACTOR,
} from '@ai-designer/db';
import type { Logger } from 'pino';

export interface JobHandlerContext {
  job: Job;
  payload: Record<string, unknown>;
  logger: Logger;
  /** Call periodically in long handlers so the sweeper does not treat the job as abandoned. */
  heartbeat(): Promise<void>;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<Record<string, unknown> | void>;

export type JobRunOutcome = 'succeeded' | 'failed' | 'retry' | 'skipped';

export interface DurableJobDeps {
  prisma: PrismaClient;
  handlers: ReadonlyMap<string, JobHandler>;
  workerId: string;
  logger: Logger;
}

/** Thrown to make BullMQ retry the message after backoff (the DB job is back to `queued`). */
export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableJobError';
  }
}

function failureOf(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { name: err.name, message: err.message.slice(0, 2000) };
  return { message: String(err).slice(0, 2000) };
}

/**
 * Runs one durable job (ADR-023). The Postgres row is the source of truth: the job is claimed
 * atomically (`queued` → `running`), so duplicate queue messages never run it twice; the result or
 * failure is written with a `job.finished` outbox event. Failed attempts go back to `queued` until
 * `maxAttempts`, then the job is `failed` for good.
 */
export async function runDurableJob(jobId: string, deps: DurableJobDeps): Promise<JobRunOutcome> {
  const { prisma, logger } = deps;
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; attempts: number }[]>`
      UPDATE jobs
      SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, now()),
          heartbeat_at = now(), updated_at = now()
      WHERE id = ${jobId}::uuid AND status = 'queued'
      RETURNING id, attempts`;
    const row = rows[0];
    if (!row) return undefined;
    await tx.jobAttempt.create({
      data: {
        id: newId(),
        jobId,
        attemptNumber: row.attempts,
        status: 'running',
        workerId: deps.workerId,
      },
    });
    return tx.job.findUniqueOrThrow({ where: { id: jobId } });
  });
  if (!claimed) {
    logger.debug({ jobId }, 'job not claimable (already running or finished), skipped');
    return 'skipped';
  }

  const log = logger.child({
    jobId,
    jobDisplayId: claimed.displayId,
    kind: claimed.kind,
    attempt: claimed.attempts,
  });
  const handler = deps.handlers.get(claimed.kind);
  const heartbeat = async (): Promise<void> => {
    await prisma.job.updateMany({
      where: { id: jobId, status: 'running' },
      data: { heartbeatAt: new Date() },
    });
  };

  try {
    if (!handler)
      throw Object.assign(new Error(`No handler registered for job kind "${claimed.kind}"`), {
        permanent: true,
      });
    const result = await handler({
      job: claimed,
      payload: (claimed.payload ?? {}) as Record<string, unknown>,
      logger: log,
      heartbeat,
    });
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'succeeded',
          result: redactSecrets(result ?? {}) as object,
          failure: undefined,
          completedAt: new Date(),
        },
      });
      await tx.jobAttempt.updateMany({
        where: { jobId, attemptNumber: claimed.attempts },
        data: { status: 'succeeded', endedAt: new Date() },
      });
      await appendOutboxEvent(
        tx,
        JobFinishedEvent,
        { jobId, kind: claimed.kind, status: 'succeeded' },
        {
          actor: SYSTEM_ACTOR,
          organizationId: claimed.organizationId,
          correlationId: claimed.correlationId,
        },
      );
    });
    log.info('job succeeded');
    return 'succeeded';
  } catch (err) {
    const failure = failureOf(err);
    const permanent =
      typeof err === 'object' &&
      err !== null &&
      (err as { permanent?: unknown }).permanent === true;
    const final = permanent || claimed.attempts >= claimed.maxAttempts;
    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: final
          ? { status: 'failed', failure: failure as object, completedAt: new Date() }
          : { status: 'queued', failure: failure as object },
      });
      await tx.jobAttempt.updateMany({
        where: { jobId, attemptNumber: claimed.attempts },
        data: { status: 'failed', error: failure as object, endedAt: new Date() },
      });
      if (final) {
        await appendOutboxEvent(
          tx,
          JobFinishedEvent,
          { jobId, kind: claimed.kind, status: 'failed' },
          {
            actor: SYSTEM_ACTOR,
            organizationId: claimed.organizationId,
            correlationId: claimed.correlationId,
          },
        );
      }
    });
    if (final) {
      log.error({ err: failure }, 'job failed permanently');
      return 'failed';
    }
    log.warn({ err: failure }, 'job attempt failed, will retry');
    return 'retry';
  }
}
