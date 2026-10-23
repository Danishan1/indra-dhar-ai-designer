import { DevEchoedEvent, type EventEnvelope, JobKinds, QueueNames } from '@ai-designer/contracts';
import {
  appendOutboxEvent,
  createDurableJob,
  createPrismaClient,
  newId,
  type PrismaClient,
  SYSTEM_ACTOR,
  toEnvelope,
} from '@ai-designer/db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseWorkerEnv } from '../src/config.js';
import { type EventConsumer, processEvent } from '../src/events/consumers.js';
import { OutboxDispatcher } from '../src/outbox/dispatcher.js';
import { startWorker, type WorkerHandle } from '../src/worker.js';

const logger = pino({ level: 'silent' });
const meta = { actor: SYSTEM_ACTOR };

async function waitFor<T>(
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function workerEnv(id: string) {
  return parseWorkerEnv({
    ...process.env,
    WORKER_ID: id,
    OUTBOX_POLL_INTERVAL_MS: '100',
    JOB_SWEEP_INTERVAL_MS: '600000',
  });
}

describe('outbox, consumers and durable jobs (integration)', () => {
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(() => {
    prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    redis = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: null });
  });

  beforeEach(async () => {
    // Previous tests may leave unpublished rows; keep each test's outbox view isolated.
    await prisma.outboxEvent.updateMany({
      where: { publishedAt: null },
      data: { publishedAt: new Date() },
    });
    for (const name of [QueueNames.events, QueueNames.jobs]) {
      const q = new Queue(name, { connection: redis });
      await q.obliterate({ force: true });
      await q.close();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  it('dispatcher publishes each event exactly once and marks it published', async () => {
    const ids = [
      await appendOutboxEvent(prisma, DevEchoedEvent, { message: 'one' }, meta),
      await appendOutboxEvent(prisma, DevEchoedEvent, { message: 'two' }, meta),
    ];
    const published: EventEnvelope[] = [];
    const dispatcher = new OutboxDispatcher(
      prisma,
      async (e) => {
        published.push(e);
      },
      { batchSize: 10, maxAttempts: 3, pollIntervalMs: 50 },
      logger,
    );
    // Two dispatchers racing (two worker processes) must not double-publish.
    const [a, b] = await Promise.all([dispatcher.dispatchOnce(), dispatcher.dispatchOnce()]);
    expect(a + b).toBe(2);
    expect(published.map((e) => e.eventId).sort()).toEqual([...ids].sort());
    expect(await dispatcher.dispatchOnce()).toBe(0);
    const rows = await prisma.outboxEvent.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.publishedAt && r.attempts === 1)).toBe(true);
  });

  it('dispatcher retries with backoff and dead-letters after max attempts', async () => {
    const id = await appendOutboxEvent(prisma, DevEchoedEvent, { message: 'poison' }, meta);
    const dispatcher = new OutboxDispatcher(
      prisma,
      () => Promise.reject(new Error('redis down')),
      { batchSize: 10, maxAttempts: 2, pollIntervalMs: 50 },
      logger,
    );
    await dispatcher.dispatchOnce();
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      attempts: 1,
      lastError: 'redis down',
      deadLetteredAt: null,
      publishedAt: null,
    });
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.outboxEvent.update({ where: { id }, data: { availableAt: new Date() } });
    await dispatcher.dispatchOnce();
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row.attempts).toBe(2);
    expect(row.deadLetteredAt).not.toBeNull();
    await prisma.outboxEvent.update({ where: { id }, data: { availableAt: new Date() } });
    expect(await dispatcher.dispatchOnce()).toBe(0);
  });

  it('consumers process a duplicated delivery only once', async () => {
    const id = await appendOutboxEvent(prisma, DevEchoedEvent, { message: 'dup' }, meta);
    const envelope = toEnvelope(await prisma.outboxEvent.findUniqueOrThrow({ where: { id } }));
    let effects = 0;
    const counting: EventConsumer = {
      name: 'test.counting',
      types: [DevEchoedEvent.type],
      async handle(_event, tx) {
        effects += 1;
        await tx.schemaMeta.upsert({
          where: { key: `it.dup.${id}` },
          update: { value: String(effects) },
          create: { key: `it.dup.${id}`, value: String(effects) },
        });
      },
    };
    const deps = { logger, enqueueJob: async () => undefined };
    const results = await Promise.all([
      processEvent(envelope, [counting], prisma, deps),
      processEvent(envelope, [counting], prisma, deps),
    ]);
    await processEvent(envelope, [counting], prisma, deps);
    expect(effects).toBe(1);
    expect(results.flat().filter((r) => r.processed)).toHaveLength(1);
  });

  it('a failing consumer rolls back its processed marker so the retry runs it', async () => {
    const id = await appendOutboxEvent(prisma, DevEchoedEvent, { message: 'flaky' }, meta);
    const envelope = toEnvelope(await prisma.outboxEvent.findUniqueOrThrow({ where: { id } }));
    let calls = 0;
    const flaky: EventConsumer = {
      name: 'test.flaky',
      types: [DevEchoedEvent.type],
      async handle() {
        calls += 1;
        if (calls === 1) throw new Error('transient');
      },
    };
    const deps = { logger, enqueueJob: async () => undefined };
    await expect(processEvent(envelope, [flaky], prisma, deps)).rejects.toThrow('transient');
    expect(await processEvent(envelope, [flaky], prisma, deps)).toEqual([
      { consumer: 'test.flaky', processed: true },
    ]);
    expect(calls).toBe(2);
  });

  describe('durable jobs through a running worker', () => {
    let handle: WorkerHandle | undefined;

    afterAll(async () => {
      await handle?.stop();
    });

    it('a job created while no worker runs stays queued and completes once a worker starts', async () => {
      const job = await prisma.$transaction((tx) =>
        createDurableJob(tx, { kind: JobKinds.systemNoop, payload: { message: 'later' } }, meta),
      );
      await new Promise((r) => setTimeout(r, 300));
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('queued');

      handle = await startWorker(workerEnv('it-durable-1'), { logger });
      const done = await waitFor(async () => {
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        return row.status === 'succeeded' && row;
      });
      expect(done.result).toEqual({ ok: true, message: 'later' });
      expect(done.attempts).toBe(1);
      const finished = await prisma.outboxEvent.findMany({
        where: { type: 'job.finished', payload: { path: ['jobId'], equals: job.id } },
      });
      expect(finished).toHaveLength(1);
    });

    it('retries failed attempts and records each attempt', async () => {
      const job = await createDurableJob(
        prisma,
        { kind: JobKinds.systemNoop, payload: { failTimes: 1 }, maxAttempts: 3 },
        meta,
      );
      const done = await waitFor(async () => {
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        return row.status === 'succeeded' && row;
      }, 15_000);
      expect(done.attempts).toBe(2);
      const attempts = await prisma.jobAttempt.findMany({
        where: { jobId: job.id },
        orderBy: { attemptNumber: 'asc' },
      });
      expect(attempts.map((a) => a.status)).toEqual(['failed', 'succeeded']);
    });

    it('fails permanently after maxAttempts and for unknown kinds', async () => {
      const exhausted = await createDurableJob(
        prisma,
        { kind: JobKinds.systemNoop, payload: { failTimes: 5 }, maxAttempts: 1 },
        meta,
      );
      const unknown = await createDurableJob(prisma, { kind: 'nope.unknown' }, meta);
      for (const id of [exhausted.id, unknown.id]) {
        const row = await waitFor(async () => {
          const r = await prisma.job.findUniqueOrThrow({ where: { id } });
          return r.status === 'failed' && r;
        });
        expect(row.failure).toMatchObject({ message: expect.any(String) as string });
      }
    });

    it('the sweeper re-enqueues a queued job whose queue message was lost', async () => {
      await handle?.stop();
      handle = undefined;
      const job = await createDurableJob(prisma, { kind: JobKinds.systemNoop }, meta);
      // Simulate Redis losing everything: publish nothing, mark the event as already published.
      await prisma.outboxEvent.updateMany({
        where: { publishedAt: null },
        data: { publishedAt: new Date() },
      });
      handle = await startWorker(workerEnv('it-durable-2'), { logger });
      await new Promise((r) => setTimeout(r, 300));
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('queued');
      // Configured requeue delay is 60s; force an immediate sweep with a zero threshold.
      await prisma.job.update({
        where: { id: job.id },
        data: { updatedAt: new Date(Date.now() - 120_000) },
      });
      const sweep = await handle.sweeper.sweepOnce();
      expect(sweep.requeued).toBeGreaterThanOrEqual(1);
      await waitFor(
        async () =>
          (await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status === 'succeeded',
      );
    });

    it('the sweeper recovers a job abandoned by a crashed worker', async () => {
      const job = await createDurableJob(prisma, { kind: JobKinds.systemNoop }, meta);
      await prisma.outboxEvent.updateMany({
        where: { publishedAt: null },
        data: { publishedAt: new Date() },
      });
      // Simulate a worker that claimed the job and died 10 minutes ago.
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'running', attempts: 1, heartbeatAt: new Date(Date.now() - 600_000) },
      });
      await prisma.jobAttempt.create({
        data: { id: newId(), jobId: job.id, attemptNumber: 1, status: 'running', workerId: 'dead' },
      });
      const sweep = await handle!.sweeper.sweepOnce();
      expect(sweep.recovered).toBe(1);
      const done = await waitFor(async () => {
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        return row.status === 'succeeded' && row;
      });
      expect(done.attempts).toBe(2);
      const attempts = await prisma.jobAttempt.findMany({
        where: { jobId: job.id },
        orderBy: { attemptNumber: 'asc' },
      });
      expect(attempts.map((a) => a.status)).toEqual(['abandoned', 'succeeded']);
    });

    it('the sweeper deletes expired idempotency keys', async () => {
      await prisma.idempotencyKey.create({
        data: {
          id: newId(),
          principalKey: 'anonymous:-:-',
          route: 'POST /x',
          key: `k-${newId()}`,
          requestHash: 'h',
          status: 'completed',
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      expect((await handle!.sweeper.sweepOnce()).expiredIdempotencyKeys).toBeGreaterThanOrEqual(1);
    });

    it('the sweeper marks pending invitations past their expiry as expired', async () => {
      const orgId = newId();
      await prisma.organization.create({
        data: {
          id: orgId,
          displayId: `ORG-${orgId.slice(0, 8)}`,
          name: 'Sweep Org',
          slug: `sweep-${orgId}`,
          createdBy: newId(),
        },
      });
      const base = { organizationId: orgId, proposedRoleIds: [], invitedBy: newId() };
      const expired = await prisma.invitation.create({
        data: {
          ...base,
          id: newId(),
          email: `a-${orgId}@example.com`,
          tokenHash: `h-${newId()}`,
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const fresh = await prisma.invitation.create({
        data: {
          ...base,
          id: newId(),
          email: `b-${orgId}@example.com`,
          tokenHash: `h-${newId()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect((await handle!.sweeper.sweepOnce()).expiredInvitations).toBeGreaterThanOrEqual(1);
      const after = await prisma.invitation.findMany({
        where: { id: { in: [expired.id, fresh.id] } },
      });
      expect(Object.fromEntries(after.map((i) => [i.id, i.status]))).toEqual({
        [expired.id]: 'expired',
        [fresh.id]: 'pending',
      });
    });
  });
});
