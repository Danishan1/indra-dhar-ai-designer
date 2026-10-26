import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { outboxBackoffMs } from '../outbox/dispatcher.js';

import type { JobHandlerContext } from './durable-job-processor.js';
import { createJobHandlers, noopHandler } from './handlers.js';

const ctx = (attempts: number, payload: Record<string, unknown>) =>
  ({
    job: { attempts },
    payload,
    logger: pino({ level: 'silent' }),
    heartbeat: async () => undefined,
  }) as unknown as JobHandlerContext;

describe('job handlers', () => {
  it('registers system.noop', () => {
    expect(createJobHandlers().get('system.noop')).toBe(noopHandler);
  });

  it('noop succeeds, echoing the message, and can simulate failures', async () => {
    await expect(noopHandler(ctx(1, { message: 'hi' }))).resolves.toEqual({
      ok: true,
      message: 'hi',
    });
    await expect(noopHandler(ctx(1, { failTimes: 1 }))).rejects.toThrow(/simulated/);
    await expect(noopHandler(ctx(2, { failTimes: 1 }))).resolves.toEqual({ ok: true });
  });
});

describe('outboxBackoffMs', () => {
  it('doubles from 1s and caps at 5 minutes', () => {
    expect([1, 2, 3].map(outboxBackoffMs)).toEqual([1000, 2000, 4000]);
    expect(outboxBackoffMs(30)).toBe(300_000);
  });
});

describe('asset.process registration', () => {
  it('is registered only when asset dependencies are given', () => {
    expect(createJobHandlers().has('asset.process')).toBe(false);
    const deps = {} as Parameters<typeof createJobHandlers>[0];
    expect(createJobHandlers({ assets: deps as never }).has('asset.process')).toBe(true);
  });
});
