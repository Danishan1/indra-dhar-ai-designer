/**
 * Undo/redo history of the editor (FR-EDT-079…085).
 *
 * The server is the store: every change is a design operation with a server id, and undo/redo are
 * `revert_operation` requests that apply the inverse the server stored (never local snapshots), so
 * history stays consistent with the working copy and never touches committed revisions.
 *
 * An entry is one user-visible step. It holds the ids of the server operations that currently
 * represent it (in the order they were applied):
 * - after the change (or a redo) — the operations that made the change;
 * - after an undo — the `revert_operation`s that took it back.
 * Undoing or redoing an entry reverts its operations in reverse order and stores the new ids, so
 * undo → redo → undo … always reverts the most recent server operation of that step.
 *
 * Immutable: every function returns a new stack.
 */

export interface CommandEntry {
  /** Local id of the step. */
  id: string;
  /** Human label, e.g. "Rename component" (shown in Undo tooltips). */
  label: string;
  /** Changes sharing a group id (e.g. one drag, one text edit) merge into one step. */
  groupId: string | null;
  /** Current server operation ids for this step (see module comment). */
  operationIds: readonly string[];
}

/** Why history was cut (an operation that cannot be undone, or an undo that is no longer possible). */
export interface HistoryBoundary {
  reason: 'not_invertible' | 'conflict' | 'reset';
  label: string;
}

export interface CommandStack {
  readonly undo: readonly CommandEntry[];
  readonly redo: readonly CommandEntry[];
  readonly maxDepth: number;
  /** Set when history was cleared; the editor explains it once ("restore a revision instead"). */
  readonly boundary: HistoryBoundary | null;
}

export const DEFAULT_MAX_DEPTH = 100;

export function createCommandStack(options: { maxDepth?: number } = {}): CommandStack {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxDepth) || maxDepth < 1)
    throw new RangeError('maxDepth must be a positive integer');
  return { undo: [], redo: [], maxDepth, boundary: null };
}

export interface RecordedOperation {
  /** Server operation id. */
  operationId: string;
  label: string;
  groupId?: string | null;
  /** The server stored an exact inverse (operation `revertible`). */
  revertible: boolean;
  /** Local id for a new entry; defaults to the operation id. */
  entryId?: string;
}

/**
 * A new change was acknowledged by the server. Redo is cleared (FR-EDT-081); a change that cannot be
 * undone clears the whole history and records a boundary (FR-EDT-084).
 */
export function recordOperation(stack: CommandStack, op: RecordedOperation): CommandStack {
  if (!op.revertible)
    return {
      ...stack,
      undo: [],
      redo: [],
      boundary: { reason: 'not_invertible', label: op.label },
    };
  const groupId = op.groupId ?? null;
  const top = stack.undo.at(-1);
  if (groupId !== null && top && top.groupId === groupId) {
    const merged: CommandEntry = { ...top, operationIds: [...top.operationIds, op.operationId] };
    return { ...stack, undo: [...stack.undo.slice(0, -1), merged], redo: [] };
  }
  const entry: CommandEntry = {
    id: op.entryId ?? op.operationId,
    label: op.label,
    groupId,
    operationIds: [op.operationId],
  };
  const undo = [...stack.undo, entry];
  return {
    ...stack,
    undo: undo.length > stack.maxDepth ? undo.slice(undo.length - stack.maxDepth) : undo,
    redo: [],
  };
}

export const canUndo = (stack: CommandStack): boolean => stack.undo.length > 0;
export const canRedo = (stack: CommandStack): boolean => stack.redo.length > 0;
export const peekUndo = (stack: CommandStack): CommandEntry | null => stack.undo.at(-1) ?? null;
export const peekRedo = (stack: CommandStack): CommandEntry | null => stack.redo.at(-1) ?? null;

/** The server operations to revert (in this order) to undo or redo `entry`. */
export const revertSequence = (entry: CommandEntry): string[] => [...entry.operationIds].reverse();

/** The undo of the top entry succeeded: it moves to redo, represented by the revert operations. */
export function completeUndo(
  stack: CommandStack,
  entryId: string,
  revertOperationIds: readonly string[],
): CommandStack {
  const top = stack.undo.at(-1);
  if (!top || top.id !== entryId) return stack;
  return {
    ...stack,
    undo: stack.undo.slice(0, -1),
    redo: [...stack.redo, { ...top, operationIds: [...revertOperationIds] }],
  };
}

/** The redo of the top redo entry succeeded: it moves back to undo. */
export function completeRedo(
  stack: CommandStack,
  entryId: string,
  revertOperationIds: readonly string[],
): CommandStack {
  const top = stack.redo.at(-1);
  if (!top || top.id !== entryId) return stack;
  return {
    ...stack,
    redo: stack.redo.slice(0, -1),
    undo: [...stack.undo, { ...top, operationIds: [...revertOperationIds] }],
  };
}

/**
 * History can no longer be trusted (the server refused an undo because the same parts changed since,
 * a step was only partly reverted, the state was reloaded after a conflict…): clear it.
 */
export function clearHistory(
  stack: CommandStack,
  reason: HistoryBoundary['reason'],
  label = '',
): CommandStack {
  return { ...stack, undo: [], redo: [], boundary: { reason, label } };
}

/** The boundary was shown to the person. */
export const acknowledgeBoundary = (stack: CommandStack): CommandStack =>
  stack.boundary ? { ...stack, boundary: null } : stack;
