import { describe, expect, it } from 'vitest';

import { RequestContext } from './request-context.js';

describe('RequestContext', () => {
  it('is undefined outside a request and system-attributed in writeMeta', () => {
    expect(RequestContext.get()).toBeUndefined();
    expect(RequestContext.writeMeta().actor).toEqual({ type: 'system', id: null });
    expect(RequestContext.logFields()).toEqual({});
  });

  it('propagates across async boundaries and can be patched', async () => {
    await RequestContext.run(
      {
        requestId: 'r1',
        correlationId: 'c1',
        principal: { type: 'anonymous', id: null },
        organizationId: null,
      },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        RequestContext.patch({ principal: { type: 'human', id: 'u1' } });
        expect(RequestContext.writeMeta()).toMatchObject({
          requestId: 'r1',
          correlationId: 'c1',
          actor: { id: 'u1' },
        });
        expect(RequestContext.logFields()).toMatchObject({
          principalId: 'u1',
          correlationId: 'c1',
        });
      },
    );
  });
});
