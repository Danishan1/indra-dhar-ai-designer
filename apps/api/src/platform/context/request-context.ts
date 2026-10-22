import { AsyncLocalStorage } from 'node:async_hooks';

import type { Actor } from '@ai-designer/contracts';
import type { WriteMeta } from '@ai-designer/db';

/**
 * Per-request context (requestId, correlationId, principal, organization) propagated with
 * AsyncLocalStorage so services, audit, outbox and logs can read it without threading parameters.
 * I05 fills `principal` from the session; I06/I07 fill `organizationId` from the route/membership.
 */
export interface RequestContextData {
  requestId: string;
  correlationId: string;
  principal: Actor;
  organizationId: string | null;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const ANONYMOUS: Actor = { type: 'anonymous', id: null };

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  /** Current context, or undefined outside a request (workers, scripts, bootstrap). */
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  /** Current context; throws when called outside a request. */
  require(): RequestContextData {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('RequestContext is not available outside an HTTP request');
    return ctx;
  },
  /** Mutates the current context (e.g. auth guard sets the principal). No-op outside a request. */
  patch(update: Partial<RequestContextData>): void {
    const ctx = storage.getStore();
    if (ctx) Object.assign(ctx, update);
  },
  /** Write metadata for audit/outbox/jobs derived from the current request. */
  writeMeta(overrides: Partial<WriteMeta> = {}): WriteMeta {
    const ctx = storage.getStore();
    return {
      actor: ctx?.principal ?? { type: 'system', id: null },
      organizationId: ctx?.organizationId ?? null,
      requestId: ctx?.requestId ?? null,
      correlationId: ctx?.correlationId ?? null,
      ...overrides,
    };
  },
  /** Fields merged into every log line (pino mixin). */
  logFields(): Record<string, unknown> {
    const ctx = storage.getStore();
    if (!ctx) return {};
    return {
      correlationId: ctx.correlationId,
      principalId: ctx.principal.id ?? undefined,
      principalType: ctx.principal.type,
      organizationId: ctx.organizationId ?? undefined,
    };
  },
};
