import { describe, expect, it } from 'vitest';

import { pingJobPayloadSchema, QueueNames } from './queues.js';

describe('queue contracts', () => {
  it('names the system queue', () => {
    expect(QueueNames.system).toBe('system');
  });

  it('validates ping payloads', () => {
    expect(
      pingJobPayloadSchema.safeParse({ requestedAt: new Date().toISOString(), requestedBy: 'api' })
        .success,
    ).toBe(true);
    expect(
      pingJobPayloadSchema.safeParse({ requestedAt: 'yesterday', requestedBy: '' }).success,
    ).toBe(false);
  });
});
