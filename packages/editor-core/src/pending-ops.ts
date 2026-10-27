/**
 * Local changes awaiting server acknowledgement (FR-EDT-086…091).
 *
 * The editor applies each change optimistically (display = server state + pending ops replayed) and
 * queues it. Rapid changes are flushed together as ONE `batch` operation (one request, one undo step)
 * carrying an idempotency key that stays the same across retries, so a retried request can never be
 * applied twice. Only one batch is in flight at a time — the working copy is versioned, and each
 * request needs the version the previous one produced.
 *
 * Immutable: every function returns a new queue.
 */
import type { ClientOperation, SingleClientOperation } from '@ai-designer/design-operations';

export interface PendingOp {
  localId: string;
  operation: SingleClientOperation;
  /** Human label for history ("Set sleeve length"). */
  label: string;
  /** Changes with the same group id become one undo step even across flushes. */
  groupId: string | null;
}

export interface InFlightBatch {
  batchId: string;
  /** Sent as `Idempotency-Key`; reused for retries of this exact batch. */
  idempotencyKey: string;
  ops: readonly PendingOp[];
  /** What is submitted: the single operation, or a `batch` of them. */
  operation: ClientOperation;
  label: string;
  groupId: string | null;
  /** Failed attempts so far (network / server errors). */
  attempts: number;
}

export interface PendingQueue {
  readonly queued: readonly PendingOp[];
  readonly inFlight: InFlightBatch | null;
}

/** The server accepts at most 100 operations in one batch. */
export const MAX_BATCH_SIZE = 100;

export const emptyQueue: PendingQueue = { queued: [], inFlight: null };

export const enqueue = (q: PendingQueue, op: PendingOp): PendingQueue => ({
  ...q,
  queued: [...q.queued, op],
});

/** Everything not yet acknowledged, in the order it was made (in-flight first). */
export const pendingOps = (q: PendingQueue): PendingOp[] => [
  ...(q.inFlight?.ops ?? []),
  ...q.queued,
];

export const hasPending = (q: PendingQueue): boolean => q.inFlight !== null || q.queued.length > 0;

function labelFor(ops: readonly PendingOp[]): string {
  const labels = new Set(ops.map((o) => o.label));
  if (labels.size === 1) return ops[0]!.label;
  return `${ops.length} changes`;
}

/**
 * Moves queued changes into a new in-flight batch. Returns `batch: null` when a batch is already in
 * flight or nothing is queued.
 */
export function takeBatch(
  q: PendingQueue,
  ids: { batchId: string; idempotencyKey: string },
  maxSize = MAX_BATCH_SIZE,
): { queue: PendingQueue; batch: InFlightBatch | null } {
  if (q.inFlight || q.queued.length === 0) return { queue: q, batch: null };
  const ops = q.queued.slice(0, Math.max(1, Math.min(maxSize, MAX_BATCH_SIZE)));
  const groups = new Set(ops.map((o) => o.groupId));
  const batch: InFlightBatch = {
    batchId: ids.batchId,
    idempotencyKey: ids.idempotencyKey,
    ops,
    operation:
      ops.length === 1
        ? ops[0]!.operation
        : { type: 'batch', operations: ops.map((o) => o.operation) },
    label: labelFor(ops),
    groupId: groups.size === 1 ? (ops[0]!.groupId ?? null) : null,
    attempts: 0,
  };
  return { queue: { queued: q.queued.slice(ops.length), inFlight: batch }, batch };
}

/** The server acknowledged the batch: it is no longer pending. */
export function ackBatch(q: PendingQueue, batchId: string): PendingQueue {
  if (q.inFlight?.batchId !== batchId) return q;
  return { ...q, inFlight: null };
}

/** A retryable failure (network, 5xx): keep the batch — same key — and count the attempt. */
export function markAttemptFailed(q: PendingQueue, batchId: string): PendingQueue {
  if (q.inFlight?.batchId !== batchId) return q;
  return { ...q, inFlight: { ...q.inFlight, attempts: q.inFlight.attempts + 1 } };
}

/** The server refused the batch for good (validation, 422): drop it, keep later changes. */
export function dropBatch(q: PendingQueue, batchId: string): PendingQueue {
  if (q.inFlight?.batchId !== batchId) return q;
  return { ...q, inFlight: null };
}

/**
 * The batch was not applied (version conflict): put its changes back in front of the queue so they
 * can be re-applied on top of the newer server state, or discarded.
 */
export function returnToQueue(q: PendingQueue): PendingQueue {
  if (!q.inFlight) return q;
  return { queued: [...q.inFlight.ops, ...q.queued], inFlight: null };
}

/** Drops every pending change (the person chose "reload server version"). */
export const discardAll = (): PendingQueue => emptyQueue;

/**
 * Replays changes on top of a state (optimistic display, or re-applying after a conflict).
 * `apply` returns the new state, or null when the change no longer applies (it is then dropped).
 */
export function replay<S>(
  state: S,
  ops: readonly PendingOp[],
  apply: (state: S, op: SingleClientOperation) => S | null,
): { state: S; kept: PendingOp[]; dropped: PendingOp[] } {
  let current = state;
  const kept: PendingOp[] = [];
  const dropped: PendingOp[] = [];
  for (const op of ops) {
    const next = apply(current, op.operation);
    if (next === null) dropped.push(op);
    else {
      current = next;
      kept.push(op);
    }
  }
  return { state: current, kept, dropped };
}

/** Retry delay with exponential backoff and a cap (attempt 1 → ~1 s, then 2, 4, 8, 15 s…). */
export function retryDelayMs(attempt: number, baseMs = 1000, maxMs = 15_000): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(maxMs, baseMs * 2 ** (n - 1));
}
