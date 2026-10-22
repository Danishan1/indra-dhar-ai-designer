import type { Actor } from '@ai-designer/contracts';

/** Who/what caused a write, propagated into audit records, outbox events and jobs. */
export interface WriteMeta {
  actor: Actor;
  organizationId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
}

export const SYSTEM_ACTOR: Actor = { type: 'system', id: null };
