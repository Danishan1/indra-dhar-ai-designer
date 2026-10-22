import { newId, type PrismaClient } from '@ai-designer/db';
import type { Logger } from 'pino';

export interface SweeperOptions {
  intervalMs: number;
  requeueAfterMs: number;
  staleAfterMs: number;
}

export interface SweepResult {
  requeued: number;
  recovered: number;
  failed: number;
  expiredIdempotencyKeys: number;
}

/**
 * Periodic recovery (ADR-023): re-enqueues `queued` jobs whose queue message was lost, returns
 * abandoned `running` jobs (no heartbeat, e.g. the worker crashed) to `queued` — or `failed` when
 * out of attempts — and deletes expired idempotency keys.
 */
export class MaintenanceSweeper {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly enqueueJob: (jobId: string) => Promise<void>,
    private readonly options: SweeperOptions,
    private readonly logger: Logger,
  ) {}

  async sweepOnce(): Promise<SweepResult> {
    const now = Date.now();
    const staleBefore = new Date(now - this.options.staleAfterMs);
    const abandoned = await this.prisma.job.findMany({
      where: {
        status: 'running',
        OR: [{ heartbeatAt: { lt: staleBefore } }, { heartbeatAt: null }],
      },
      take: 500,
    });
    let recovered = 0;
    let failed = 0;
    for (const job of abandoned) {
      const final = job.attempts >= job.maxAttempts;
      const failure = {
        name: 'AbandonedJob',
        message: 'Worker stopped responding while running the job',
      };
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.job.updateMany({
          where: { id: job.id, status: 'running', attempts: job.attempts },
          data: final
            ? { status: 'failed', failure, completedAt: new Date() }
            : { status: 'queued', failure },
        });
        if (count === 0) return;
        await tx.jobAttempt.updateMany({
          where: { jobId: job.id, attemptNumber: job.attempts, status: 'running' },
          data: { status: 'abandoned', error: failure, endedAt: new Date() },
        });
        if (final) failed += 1;
        else recovered += 1;
      });
      if (!final) await this.enqueueJob(job.id);
    }

    const requeueBefore = new Date(now - this.options.requeueAfterMs);
    const queued = await this.prisma.job.findMany({
      where: { status: 'queued', updatedAt: { lte: requeueBefore } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    for (const job of queued) await this.enqueueJob(job.id);

    const { count: expiredIdempotencyKeys } = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });

    const result = { requeued: queued.length, recovered, failed, expiredIdempotencyKeys };
    if (queued.length || recovered || failed || expiredIdempotencyKeys) {
      this.logger.info({ ...result, sweepId: newId() }, 'maintenance sweep');
    }
    return result;
  }

  start(): void {
    const tick = async (): Promise<void> => {
      try {
        await this.sweepOnce();
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'maintenance sweep failed',
        );
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), this.options.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
