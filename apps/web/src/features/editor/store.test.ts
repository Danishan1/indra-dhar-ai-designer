import type { EditorState, SubmitOperationResponse } from '@ai-designer/contracts';
import {
  applyOperation,
  type ClientOperation,
  diffEntities,
  type InternalOperation,
  invert,
  type Operation,
} from '@ai-designer/design-operations';
import { type GarmentDesignState, templates } from '@ai-designer/garment-model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import type { EditorApi } from './api';
import {
  createEditorStore,
  type EditorStore,
  selectCanRedo,
  selectCanUndo,
  selectHasUnsavedWork,
} from './store';

const USER = '00000000-0000-4000-8000-000000000001';
const DESIGN = '00000000-0000-4000-8000-0000000000d1';
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** In-memory server with the same semantics as the API (versions, idempotency, stored inverses). */
class FakeServer implements EditorApi {
  version = 1;
  state: GarmentDesignState;
  calls: { body: { expectedVersion: number; operation: ClientOperation }; key: string }[] = [];
  failures: ApiError[] = [];
  revertible = true;
  private readonly inverses = new Map<string, InternalOperation>();
  private readonly replies = new Map<string, SubmitOperationResponse>();

  constructor(state: GarmentDesignState) {
    this.state = state;
  }

  editorState(canEdit = true): EditorState {
    return {
      design: { id: DESIGN, workingCopyVersion: this.version } as EditorState['design'],
      project: {
        id: uuid(),
        displayId: 'PRJ-1',
        name: 'Project',
        status: 'ACTIVE',
        editable: true,
      } as EditorState['project'],
      workingCopy: {
        designId: DESIGN,
        version: this.version,
        baseRevisionId: null,
        restoredFromRevisionId: null,
        schemaVersion: '1',
        migratedFrom: null,
        state: structuredClone(this.state) as unknown as Record<string, unknown>,
        hasUncommittedChanges: false,
        findings: [],
        lastModifiedBy: USER,
        updatedAt: '2026-10-27T10:00:00.000Z',
      },
      headRevision: null,
      approvedRevision: null,
      capabilities: { canEdit, canCommit: canEdit, canRestore: canEdit, canGenerate: false },
      readOnlyReason: canEdit ? null : 'permission',
      userId: USER,
    };
  }

  loadState = () => Promise.resolve(this.editorState());

  /** Someone else changes the design. */
  otherEdit(op: Operation) {
    const r = applyOperation(this.state, op, { actorUserId: USER, now: 'x' });
    if (!r.ok) throw new Error('bad op');
    this.state = r.state;
    this.version++;
  }

  submit = (
    body: { expectedVersion: number; operation: ClientOperation },
    key: string,
  ): Promise<SubmitOperationResponse> => {
    this.calls.push({ body: structuredClone(body), key });
    const replay = this.replies.get(key);
    if (replay) return Promise.resolve(replay);
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    if (body.expectedVersion !== this.version)
      return Promise.reject(
        new ApiError('CONCURRENT_MODIFICATION', 'Changed', 409, null, {
          currentVersion: this.version,
        }),
      );
    const op = body.operation;
    const apply: Operation =
      op.type === 'revert_operation' ? this.inverses.get(op.operationId)! : (op as Operation);
    const r = applyOperation(this.state, apply, {
      actorUserId: USER,
      now: '2026-10-27T10:00:00.000Z',
    });
    if (!r.ok)
      return Promise.reject(
        new ApiError('VALIDATION_BLOCKED', 'Blocked', 422, null, { findings: r.findings }),
      );
    const id = uuid();
    this.inverses.set(id, invert(this.state, r.state));
    const { after } = diffEntities(this.state, r.state);
    this.state = r.state;
    this.version++;
    const res = {
      operation: { id, displayId: `OP-${this.version}`, revertible: this.revertible },
      workingCopy: {
        designId: DESIGN,
        version: this.version,
        baseRevisionId: null,
        hasUncommittedChanges: true,
      },
      patch: after,
      findings: [],
    } as unknown as SubmitOperationResponse;
    this.replies.set(key, res);
    return Promise.resolve(res);
  };
}

const sleeveOf = (s: GarmentDesignState) => s.components.find((c) => c.componentType === 'sleeve')!;
const rename = (s: GarmentDesignState, name: string) => ({
  type: 'rename_component' as const,
  componentId: sleeveOf(s).componentId,
  displayName: name,
});

describe('editor store (I15 save pipeline)', () => {
  let server: FakeServer;
  let store: EditorStore;
  let online: boolean;
  const notify = { error: vi.fn(), info: vi.fn() };

  const make = (canEdit = true) => {
    store = createEditorStore(server.editorState(canEdit), {
      api: server,
      notify,
      newId: uuid,
      isOnline: () => online,
    });
    return store;
  };
  const s = () => store.getState();
  const nameShown = () => sleeveOf(s().display).displayName;
  const settle = () => vi.advanceTimersByTimeAsync(600);

  beforeEach(() => {
    vi.useFakeTimers();
    online = true;
    notify.error.mockReset();
    notify.info.mockReset();
    server = new FakeServer(templates.create('woven_shirt'));
    make();
  });
  afterEach(() => {
    s().dispose();
    vi.useRealTimers();
  });

  it('applies optimistically and shows Saved only after the server acknowledged (AC2, AC3)', async () => {
    expect(s().apply(rename(server.state, 'Left sleeve A'), { label: 'Rename' })).toBe(true);
    expect(nameShown()).toBe('Left sleeve A');
    expect(s().save.status).toBe('unsaved');
    expect(sleeveOf(s().server.state).displayName).not.toBe('Left sleeve A');
    expect(server.calls).toHaveLength(0);
    expect(selectHasUnsavedWork(s())).toBe(true);
    await settle();
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]!.body.expectedVersion).toBe(1);
    expect(s().save.status).toBe('saved');
    expect(s().server.version).toBe(2);
    expect(sleeveOf(s().server.state).displayName).toBe('Left sleeve A');
    expect(s().history.undo).toHaveLength(1);
    expect(selectHasUnsavedWork(s())).toBe(false);
  });

  it('batches rapid changes into one request and one undo step', async () => {
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    s().apply(rename(server.state, 'B'), { label: 'Rename' });
    s().apply(rename(server.state, 'C'), { label: 'Rename' });
    await settle();
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]!.body.operation.type).toBe('batch');
    expect(s().history.undo).toHaveLength(1);
    expect(nameShown()).toBe('C');
  });

  it('ignores changes that change nothing and refuses invalid ones locally', () => {
    expect(
      s().apply(rename(server.state, sleeveOf(server.state).displayName), { label: 'x' }),
    ).toBe(false);
    expect(
      s().apply(
        { type: 'rename_component', componentId: 'cmp_missing', displayName: 'x' },
        {
          label: 'x',
        },
      ),
    ).toBe(false);
    expect(notify.error).toHaveBeenCalled();
    expect(s().queue.queued).toHaveLength(0);
  });

  it('undo and redo revert server operations; a new change clears redo (AC4)', async () => {
    const original = sleeveOf(server.state).displayName;
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await settle();
    expect(selectCanUndo(s())).toBe(true);
    await s().undo();
    expect(server.calls.at(-1)!.body.operation.type).toBe('revert_operation');
    expect(nameShown()).toBe(original);
    expect(sleeveOf(server.state).displayName).toBe(original);
    expect(selectCanRedo(s())).toBe(true);
    await s().redo();
    expect(nameShown()).toBe('A');
    expect(server.calls).toHaveLength(3);
    // Undo again reverts the redo operation (the newest server op of the step).
    await s().undo();
    expect(nameShown()).toBe(original);
    s().apply(rename(server.state, 'B'), { label: 'Rename' });
    await settle();
    expect(selectCanRedo(s())).toBe(false);
  });

  it('undo right after a change first saves it, then reverts it', async () => {
    const original = sleeveOf(server.state).displayName;
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await s().undo();
    expect(server.calls.map((c) => c.body.operation.type)).toEqual([
      'rename_component',
      'revert_operation',
    ]);
    expect(nameShown()).toBe(original);
  });

  it('retries network failures with the same idempotency key and keeps the change (AC6)', async () => {
    server.failures.push(
      new ApiError('DEPENDENCY_UNAVAILABLE', 'Cannot reach the server', 0, null),
    );
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await settle();
    expect(s().save.status).toBe('save_failed');
    expect(nameShown()).toBe('A');
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1]!.key).toBe(server.calls[0]!.key);
    expect(s().save.status).toBe('saved');
  });

  it('stops retrying after the limit and resumes on Retry (flush)', async () => {
    for (let i = 0; i < 10; i++)
      server.failures.push(new ApiError('INTERNAL_ERROR', 'Boom', 500, null));
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.calls).toHaveLength(6);
    expect(s().save.status).toBe('save_failed');
    server.failures = [];
    await s().flush();
    expect(s().save.status).toBe('saved');
    expect(new Set(server.calls.map((c) => c.key)).size).toBe(1);
  });

  it('a version conflict never overwrites; re-apply puts my changes on top (AC5)', async () => {
    server.otherEdit({
      type: 'rename_component',
      componentId: server.state.components.find((c) => c.componentType === 'collar')!.componentId,
      displayName: 'Their collar',
    });
    s().apply(rename(server.state, 'Mine'), { label: 'Rename' });
    await settle();
    expect(s().save.status).toBe('conflict');
    expect(s().conflict).toMatchObject({ currentVersion: 2, dialogOpen: true });
    expect(nameShown()).toBe('Mine');
    expect(server.calls).toHaveLength(1);
    // Nothing is sent while in conflict.
    s().apply(rename(server.state, 'Mine 2'), { label: 'Rename' });
    await settle();
    expect(server.calls).toHaveLength(1);
    await s().reapplyMine();
    expect(s().conflict).toBeNull();
    expect(s().save.status).toBe('saved');
    expect(sleeveOf(server.state).displayName).toBe('Mine 2');
    expect(server.state.components.find((c) => c.componentType === 'collar')!.displayName).toBe(
      'Their collar',
    );
  });

  it('reload discards my pending changes after a conflict', async () => {
    server.otherEdit(rename(server.state, 'Theirs'));
    s().apply(rename(server.state, 'Mine'), { label: 'Rename' });
    await settle();
    expect(s().save.status).toBe('conflict');
    await s().reloadFromServer();
    expect(nameShown()).toBe('Theirs');
    expect(s().save.status).toBe('saved');
    expect(s().server.version).toBe(2);
    expect(selectHasUnsavedWork(s())).toBe(false);
  });

  it('drops a refused change, explains it and keeps later ones', async () => {
    server.failures.push(
      new ApiError('VALIDATION_BLOCKED', 'Blocked', 422, null, {
        findings: [{ message: 'Sleeve is locked' }],
      }),
    );
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await settle();
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Rename'), [
      'Sleeve is locked',
    ]);
    expect(s().save.status).toBe('saved');
    expect(nameShown()).toBe(sleeveOf(server.state).displayName);
  });

  it('waits while offline and sends when back online', async () => {
    online = false;
    s().setOnline(false);
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await settle();
    expect(server.calls).toHaveLength(0);
    expect(s().save.status).toBe('offline');
    online = true;
    s().setOnline(true);
    await settle();
    expect(server.calls).toHaveLength(1);
    expect(s().save.status).toBe('saved');
  });

  it('view state (fit, zoom, view mode, layers) never touches the design (AC6)', () => {
    const version = s().server.version;
    s().setCanvas({ width: 1000, height: 600 }, { x: -400, y: -150, width: 800, height: 900 });
    expect(s().canvas.autoFit).toBe(true);
    const fitted = s().viewport.zoom;
    expect(fitted).toBeCloseTo((600 - 64) / 900, 5);
    // Resizing keeps it fitted until the person zooms.
    s().setCanvas({ width: 1000, height: 900 }, s().canvas.content);
    const refit = s().viewport.zoom;
    expect(refit).toBeGreaterThan(fitted);
    s().setCanvas({ width: 1000, height: 600 }, s().canvas.content);
    s().zoomIn();
    expect(s().viewport.zoom).toBeCloseTo(fitted * 1.25, 5);
    expect(s().canvas.autoFit).toBe(false);
    s().setCanvas({ width: 1000, height: 900 }, s().canvas.content);
    expect(s().viewport.zoom).toBeCloseTo(fitted * 1.25, 5);
    s().setCanvas({ width: 1000, height: 600 }, s().canvas.content);
    s().zoomReset();
    expect(s().viewport.zoom).toBe(1);
    s().fitToView();
    expect(s().viewport.zoom).toBeCloseTo(fitted, 5);
    s().zoomIn();
    s().setViewMode('front');
    expect(s().canvas.autoFit).toBe(true);
    s().toggleLayer('guides');
    expect(s().layers.guides).toBe(true);
    s().holdTool('pan');
    expect(s().tool.active).toBe('pan');
    s().releaseTool();
    expect(s().tool.active).toBe('select');
    expect(server.calls).toHaveLength(0);
    expect(s().server.version).toBe(version);
    expect(s().queue.queued).toHaveLength(0);
  });

  it('read-only editors refuse changes', () => {
    make(false);
    expect(s().apply(rename(server.state, 'A'), { label: 'Rename' })).toBe(false);
    expect(selectCanUndo(s())).toBe(false);
  });

  it('a change that cannot be undone is a history boundary', async () => {
    server.revertible = false;
    s().apply(rename(server.state, 'A'), { label: 'Rename' });
    await settle();
    expect(notify.info).toHaveBeenCalledWith(expect.stringContaining('cannot be undone'));
    expect(selectCanUndo(s())).toBe(false);
  });

  it('generates ids locally so the server keeps them; selection drops removed ids', async () => {
    const front = server.state.components.find((c) => c.componentType === 'front_body_panel')!;
    s().apply(
      { type: 'add_component', componentType: 'pocket', parentComponentId: front.componentId },
      { label: 'Add pocket' },
    );
    await settle();
    const pocket = s().display.components.find((c) => c.componentType === 'pocket')!;
    expect(server.state.components.some((c) => c.componentId === pocket.componentId)).toBe(true);
    s().select(pocket.componentId);
    expect(s().selection.primary).toBe(pocket.componentId);
    expect(
      s().apply({ type: 'remove_component', componentId: pocket.componentId }, { label: 'Remove' }),
    ).toBe(true);
    expect(s().selection.ids).toEqual([]);
    await settle();
    expect(s().save.status).toBe('saved');
  });
});
