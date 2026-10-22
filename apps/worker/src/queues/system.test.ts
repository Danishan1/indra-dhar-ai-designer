import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { processSystemJob } from './system.js';

const deps = { workerId: 'w-1', logger: pino({ level: 'silent' }) };

describe('processSystemJob', () => {
  it('answers ping with pong', async () => {
    const res = await processSystemJob(
      {
        id: '1',
        name: 'ping',
        data: { requestedAt: new Date().toISOString(), requestedBy: 'api' },
      },
      deps,
    );
    expect(res).toMatchObject({ pong: true, workerId: 'w-1' });
  });

  it('rejects invalid payloads and unknown jobs', async () => {
    await expect(processSystemJob({ id: '2', name: 'ping', data: {} }, deps)).rejects.toThrow();
    await expect(processSystemJob({ id: '3', name: 'nope', data: {} }, deps)).rejects.toThrow(
      /Unknown/,
    );
  });
});
