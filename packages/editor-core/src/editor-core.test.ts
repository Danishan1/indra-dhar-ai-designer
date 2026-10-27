import type { SingleClientOperation } from '@ai-designer/design-operations';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  acknowledgeBoundary,
  canRedo,
  canUndo,
  clearHistory,
  completeRedo,
  completeUndo,
  createCommandStack,
  peekRedo,
  peekUndo,
  recordOperation,
  revertSequence,
} from './command-stack.js';
import {
  ackBatch,
  discardAll,
  dropBatch,
  emptyQueue,
  enqueue,
  hasPending,
  markAttemptFailed,
  MAX_BATCH_SIZE,
  pendingOps,
  type PendingOp,
  replay,
  retryDelayMs,
  returnToQueue,
  takeBatch,
} from './pending-ops.js';
import {
  hasUnsavedWork,
  initialSaveState,
  saveReducer,
  type SaveEvent,
  type SaveState,
} from './save-state.js';
import {
  clearSelection,
  emptySelection,
  isSelected,
  pruneSelection,
  select,
  selectMany,
} from './selection.js';
import { holdTool, initialToolState, isTool, releaseTool, setTool } from './tools.js';
import {
  clampZoom,
  fitToBounds,
  initialViewport,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  toScreen,
  toWorld,
  zoomBy,
  zoomLabel,
  zoomTo,
} from './viewport.js';

const rec = (operationId: string, extra: Partial<Parameters<typeof recordOperation>[1]> = {}) => ({
  operationId,
  label: `op ${operationId}`,
  revertible: true,
  ...extra,
});

describe('command stack', () => {
  it('records, undoes and redoes with server revert ids', () => {
    let s = createCommandStack();
    expect(canUndo(s)).toBe(false);
    s = recordOperation(s, rec('a'));
    s = recordOperation(s, rec('b'));
    expect(peekUndo(s)?.operationIds).toEqual(['b']);
    const top = peekUndo(s)!;
    expect(revertSequence(top)).toEqual(['b']);
    s = completeUndo(s, top.id, ['rb']);
    expect(peekUndo(s)?.id).toBe('a');
    expect(peekRedo(s)?.operationIds).toEqual(['rb']);
    // Redo reverts the revert; the entry carries the newest server id.
    s = completeRedo(s, peekRedo(s)!.id, ['rrb']);
    expect(canRedo(s)).toBe(false);
    expect(peekUndo(s)?.operationIds).toEqual(['rrb']);
  });

  it('a new change clears redo (FR-EDT-081)', () => {
    let s = recordOperation(createCommandStack(), rec('a'));
    s = completeUndo(s, 'a', ['ra']);
    expect(canRedo(s)).toBe(true);
    s = recordOperation(s, rec('b'));
    expect(canRedo(s)).toBe(false);
    expect(s.undo.map((e) => e.id)).toEqual(['b']);
  });

  it('groups changes with the same group id into one step', () => {
    let s = createCommandStack();
    s = recordOperation(s, rec('a', { groupId: 'drag-1' }));
    s = recordOperation(s, rec('b', { groupId: 'drag-1' }));
    s = recordOperation(s, rec('c', { groupId: 'drag-2' }));
    s = recordOperation(s, rec('d'));
    s = recordOperation(s, rec('e'));
    expect(s.undo.map((e) => e.operationIds)).toEqual([['a', 'b'], ['c'], ['d'], ['e']]);
    // Grouped steps revert newest first.
    expect(revertSequence(s.undo[0]!)).toEqual(['b', 'a']);
    // Ungrouped changes never merge.
    expect(s.undo.at(-1)?.groupId).toBeNull();
  });

  it('continues a group whose step is on top again', () => {
    let s = recordOperation(createCommandStack(), rec('a', { groupId: 'g' }));
    s = recordOperation(s, rec('b', { groupId: 'x' }));
    s = completeUndo(s, 'b', ['rb']);
    s = recordOperation(s, rec('c', { groupId: 'g' }));
    // 'a' is at the top again, so the same group continues it — that is one gesture.
    expect(s.undo.map((e) => e.operationIds)).toEqual([['a', 'c']]);
  });

  it('keeps at most maxDepth steps (oldest dropped)', () => {
    let s = createCommandStack({ maxDepth: 3 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) s = recordOperation(s, rec(id));
    expect(s.undo.map((e) => e.id)).toEqual(['c', 'd', 'e']);
    expect(() => createCommandStack({ maxDepth: 0 })).toThrow(RangeError);
  });

  it('a non-invertible change is a history boundary (FR-EDT-084)', () => {
    let s = recordOperation(createCommandStack(), rec('a'));
    s = completeUndo(recordOperation(s, rec('b')), 'b', ['rb']);
    s = recordOperation(s, rec('gen', { revertible: false, label: 'Regenerate region' }));
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
    expect(s.boundary).toEqual({ reason: 'not_invertible', label: 'Regenerate region' });
    s = acknowledgeBoundary(s);
    expect(s.boundary).toBeNull();
    expect(acknowledgeBoundary(s)).toBe(s);
  });

  it('ignores completions for an entry that is no longer on top', () => {
    const s = recordOperation(recordOperation(createCommandStack(), rec('a')), rec('b'));
    expect(completeUndo(s, 'a', ['x'])).toBe(s);
    expect(completeRedo(s, 'a', ['x'])).toBe(s);
  });

  it('clears history on conflicts', () => {
    const s = clearHistory(recordOperation(createCommandStack(), rec('a')), 'conflict');
    expect(canUndo(s)).toBe(false);
    expect(s.boundary?.reason).toBe('conflict');
  });

  it('property: undo then redo of every step restores the same stack shape', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.constantFrom('g1', 'g2'), { nil: null }), { maxLength: 30 }),
        (groups) => {
          let s = createCommandStack({ maxDepth: 10 });
          groups.forEach((g, i) => (s = recordOperation(s, rec(`o${i}`, { groupId: g }))));
          const depth = s.undo.length;
          expect(depth).toBeLessThanOrEqual(10);
          const labels = s.undo.map((e) => e.id);
          for (let i = 0; i < depth; i++) s = completeUndo(s, peekUndo(s)!.id, [`u${i}`]);
          expect(s.undo).toHaveLength(0);
          for (let i = 0; i < depth; i++) s = completeRedo(s, peekRedo(s)!.id, [`r${i}`]);
          expect(s.undo.map((e) => e.id)).toEqual(labels);
          expect(canRedo(s)).toBe(false);
        },
      ),
    );
  });
});

describe('selection', () => {
  it('replaces, adds and toggles by stable id', () => {
    let s = select(emptySelection, 'a');
    expect(s).toEqual({ ids: ['a'], primary: 'a' });
    s = select(s, 'b', 'add');
    expect(s).toEqual({ ids: ['a', 'b'], primary: 'b' });
    expect(select(s, 'a', 'add')).toEqual({ ids: ['a', 'b'], primary: 'a' });
    expect(select(s, 'b', 'add')).toBe(s);
    s = select(s, 'b', 'toggle');
    expect(s).toEqual({ ids: ['a'], primary: 'a' });
    s = select(s, 'c', 'toggle');
    expect(s).toEqual({ ids: ['a', 'c'], primary: 'c' });
    expect(select(s, 'a', 'toggle')).toEqual({ ids: ['c'], primary: 'c' });
    expect(select(s, 'z')).toEqual({ ids: ['z'], primary: 'z' });
    expect(isSelected(s, 'c')).toBe(true);
    expect(clearSelection(s)).toEqual(emptySelection);
    expect(clearSelection(emptySelection)).toBe(emptySelection);
  });

  it('selectMany de-duplicates; prune drops removed ids', () => {
    expect(selectMany(['a', 'b', 'a'])).toEqual({ ids: ['a', 'b'], primary: 'b' });
    expect(selectMany([])).toEqual(emptySelection);
    const s = selectMany(['a', 'b', 'c']);
    expect(pruneSelection(s, () => true)).toBe(s);
    expect(pruneSelection(s, (id) => id !== 'c')).toEqual({ ids: ['a', 'b'], primary: 'b' });
    expect(pruneSelection(s, (id) => id === 'c')).toEqual({ ids: ['c'], primary: 'c' });
    expect(pruneSelection(s, () => false)).toEqual(emptySelection);
  });
});

describe('viewport', () => {
  it('converts between screen and world', () => {
    const v = { zoom: 2, panX: 10, panY: -5 };
    expect(toScreen(v, { x: 3, y: 4 })).toEqual({ x: 16, y: 3 });
    expect(toWorld(v, toScreen(v, { x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
  });

  it('zooms around an anchor and clamps', () => {
    const anchor = { x: 100, y: 50 };
    const v = zoomBy(initialViewport, 2, anchor);
    expect(v.zoom).toBe(2);
    // The world point under the anchor stays under it.
    expect(toScreen(v, toWorld(initialViewport, anchor))).toEqual(anchor);
    expect(zoomTo(v, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomTo(v, 0).zoom).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(zoomLabel(zoomTo(initialViewport, 1.254))).toBe('125%');
    expect(panBy(initialViewport, 5, 6)).toEqual({ zoom: 1, panX: 5, panY: 6 });
  });

  it('fits content into the viewport, centred', () => {
    const v = fitToBounds({ x: 0, y: 0, width: 100, height: 50 }, { width: 248, height: 248 }, 24);
    expect(v.zoom).toBe(2);
    expect(toScreen(v, { x: 50, y: 25 })).toEqual({ x: 124, y: 124 });
    expect(fitToBounds({ x: 0, y: 0, width: 0, height: 10 }, { width: 10, height: 10 })).toEqual(
      initialViewport,
    );
  });
});

describe('tools', () => {
  it('sets, holds and releases tools', () => {
    let t = setTool(initialToolState, 'zoom');
    expect(t).toEqual({ active: 'zoom', previous: null });
    expect(setTool(t, 'zoom')).toBe(t);
    t = holdTool(t, 'pan');
    expect(t).toEqual({ active: 'pan', previous: 'zoom' });
    expect(holdTool(t, 'pan')).toBe(t);
    expect(holdTool(t, 'select')).toEqual({ active: 'select', previous: 'zoom' });
    t = releaseTool(t);
    expect(t).toEqual({ active: 'zoom', previous: null });
    expect(releaseTool(t)).toBe(t);
    expect(isTool('pan')).toBe(true);
    expect(isTool('lasso')).toBe(false);
  });
});

const op = (n: number, groupId: string | null = null, label = 'Rename'): PendingOp => ({
  localId: `l${n}`,
  operation: { type: 'rename_component', componentId: `cmp_${n}`, displayName: `N${n}` },
  label,
  groupId,
});
const ids = (n: number) => ({ batchId: `b${n}`, idempotencyKey: `k${n}` });

describe('pending operations', () => {
  it('batches queued changes into one operation with one idempotency key', () => {
    let q = enqueue(enqueue(emptyQueue, op(1)), op(2));
    const { queue, batch } = takeBatch(q, ids(1));
    expect(batch?.operation.type).toBe('batch');
    expect(batch?.ops).toHaveLength(2);
    expect(batch?.idempotencyKey).toBe('k1');
    expect(batch?.label).toBe('Rename');
    q = queue;
    // Only one batch in flight; later changes wait.
    q = enqueue(q, op(3, null, 'Set'));
    expect(takeBatch(q, ids(2)).batch).toBeNull();
    expect(pendingOps(q).map((o) => o.localId)).toEqual(['l1', 'l2', 'l3']);
    q = ackBatch(q, 'b1');
    expect(ackBatch(q, 'b1')).toBe(q);
    const next = takeBatch(q, ids(2));
    // A single change is submitted as itself.
    expect(next.batch?.operation).toEqual(op(3).operation);
    expect(next.batch?.label).toBe('Set');
    expect(hasPending(next.queue)).toBe(true);
    expect(hasPending(ackBatch(next.queue, 'b2'))).toBe(false);
    expect(takeBatch(emptyQueue, ids(3)).batch).toBeNull();
  });

  it('labels mixed batches and keeps a shared group id', () => {
    const mixed = takeBatch(enqueue(enqueue(emptyQueue, op(1, 'g')), op(2, 'g', 'Set')), ids(1));
    expect(mixed.batch?.label).toBe('2 changes');
    expect(mixed.batch?.groupId).toBe('g');
    const split = takeBatch(enqueue(enqueue(emptyQueue, op(1, 'g')), op(2, 'h')), ids(1));
    expect(split.batch?.groupId).toBeNull();
  });

  it('respects the server batch limit', () => {
    let q = emptyQueue;
    for (let i = 0; i < MAX_BATCH_SIZE + 5; i++) q = enqueue(q, op(i));
    const { queue, batch } = takeBatch(q, ids(1), 1000);
    expect(batch?.ops).toHaveLength(MAX_BATCH_SIZE);
    expect(queue.queued).toHaveLength(5);
  });

  it('retries keep the batch and key; a refused batch is dropped', () => {
    let { queue: q } = takeBatch(enqueue(emptyQueue, op(1)), ids(1));
    q = enqueue(q, op(2));
    q = markAttemptFailed(q, 'b1');
    expect(q.inFlight?.attempts).toBe(1);
    expect(q.inFlight?.idempotencyKey).toBe('k1');
    expect(markAttemptFailed(q, 'other')).toBe(q);
    const dropped = dropBatch(q, 'b1');
    expect(pendingOps(dropped).map((o) => o.localId)).toEqual(['l2']);
    expect(dropBatch(dropped, 'b1')).toBe(dropped);
  });

  it('after a conflict, in-flight changes return to the front of the queue', () => {
    let { queue: q } = takeBatch(enqueue(emptyQueue, op(1)), ids(1));
    q = enqueue(q, op(2));
    q = returnToQueue(q);
    expect(q.inFlight).toBeNull();
    expect(q.queued.map((o) => o.localId)).toEqual(['l1', 'l2']);
    expect(returnToQueue(q)).toBe(q);
    expect(discardAll()).toEqual(emptyQueue);
  });

  it('replays changes on a newer state, dropping those that no longer apply', () => {
    const apply = (state: string[], o: SingleClientOperation) =>
      o.type === 'rename_component' && o.componentId !== 'cmp_2' ? [...state, o.displayName] : null;
    const r = replay(['base'], [op(1), op(2), op(3)], apply);
    expect(r.state).toEqual(['base', 'N1', 'N3']);
    expect(r.kept.map((o) => o.localId)).toEqual(['l1', 'l3']);
    expect(r.dropped.map((o) => o.localId)).toEqual(['l2']);
  });

  it('backs off exponentially with a cap', () => {
    expect([1, 2, 3, 4, 5, 6].map((a) => retryDelayMs(a))).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000,
    ]);
    expect(retryDelayMs(0)).toBe(1000);
  });
});

describe('save state', () => {
  const run = (events: SaveEvent[], from: SaveState = initialSaveState()) =>
    events.reduce(saveReducer, from);
  const at = '2026-10-27T10:00:00.000Z';

  it('shows Saved only after the server acknowledged everything (FR-PRJ-016)', () => {
    let s = run([{ type: 'changed' }]);
    expect(s.status).toBe('unsaved');
    s = saveReducer(s, { type: 'flush_started' });
    expect(s.status).toBe('saving');
    s = saveReducer(s, { type: 'changed' });
    expect(s.status).toBe('saving');
    s = saveReducer(s, { type: 'acknowledged', at, pending: true });
    expect(s.status).toBe('unsaved');
    s = run([{ type: 'flush_started' }, { type: 'acknowledged', at, pending: false }], s);
    expect(s).toMatchObject({ status: 'saved', lastSavedAt: at, error: null });
  });

  it('failures keep changes and allow retry (FR-EDT-091)', () => {
    let s = run([{ type: 'changed' }, { type: 'flush_started' }]);
    s = saveReducer(s, { type: 'failed', retryable: true, message: 'Server error' });
    expect(s).toMatchObject({ status: 'save_failed', error: 'Server error' });
    expect(saveReducer(s, { type: 'changed' }).status).toBe('save_failed');
    expect(hasUnsavedWork(s, true)).toBe(true);
    s = run([{ type: 'flush_started' }, { type: 'acknowledged', at, pending: false }], s);
    expect(s.status).toBe('saved');
    expect(hasUnsavedWork(s, false)).toBe(false);
  });

  it('refused changes are dropped without blocking later saves', () => {
    const s = run([{ type: 'changed' }, { type: 'flush_started' }]);
    expect(saveReducer(s, { type: 'discarded', pending: false }).status).toBe('saved');
    expect(saveReducer(s, { type: 'discarded', pending: true }).status).toBe('unsaved');
    expect(run([{ type: 'conflict' }, { type: 'discarded', pending: false }]).status).toBe(
      'conflict',
    );
    expect(run([{ type: 'discarded', pending: false }], initialSaveState(null, false)).status).toBe(
      'offline',
    );
  });

  it('conflict is sticky until resolved (FR-EDT-089)', () => {
    let s = run([{ type: 'changed' }, { type: 'flush_started' }, { type: 'conflict' }]);
    for (const e of [
      { type: 'changed' },
      { type: 'flush_started' },
      { type: 'failed', retryable: false, message: 'x' },
      { type: 'acknowledged', at, pending: false },
      { type: 'connectivity', online: false, pending: true },
    ] satisfies SaveEvent[])
      expect(saveReducer(s, e).status).toBe('conflict');
    expect(hasUnsavedWork(s, false)).toBe(true);
    s = saveReducer(s, { type: 'conflict_resolved', pending: true });
    expect(s.status).toBe('unsaved');
    expect(saveReducer(s, { type: 'conflict_resolved', pending: false })).toBe(s);
    expect(
      saveReducer(run([{ type: 'conflict' }]), { type: 'conflict_resolved', pending: false })
        .status,
    ).toBe('saved');
  });

  it('goes offline and comes back', () => {
    let s = run([{ type: 'changed' }, { type: 'connectivity', online: false, pending: true }]);
    expect(s).toMatchObject({ status: 'offline', online: false });
    s = saveReducer(s, { type: 'failed', retryable: true, message: 'Cannot reach the server' });
    expect(s.status).toBe('offline');
    expect(saveReducer(s, { type: 'acknowledged', at, pending: false }).status).toBe('offline');
    s = saveReducer(s, { type: 'connectivity', online: true, pending: true });
    expect(s).toMatchObject({ status: 'unsaved', online: true });
    expect(
      saveReducer(run([{ type: 'connectivity', online: false, pending: false }]), {
        type: 'connectivity',
        online: true,
        pending: false,
      }).status,
    ).toBe('saved');
    expect(
      saveReducer(initialSaveState(), { type: 'connectivity', online: true, pending: false })
        .status,
    ).toBe('saved');
    expect(initialSaveState(null, false).status).toBe('offline');
    expect(
      run([{ type: 'conflict' }, { type: 'connectivity', online: false, pending: false }]).status,
    ).toBe('conflict');
    expect(
      run(
        [{ type: 'conflict' }, { type: 'conflict_resolved', pending: false }],
        initialSaveState(null, false),
      ).status,
    ).toBe('offline');
  });
});
