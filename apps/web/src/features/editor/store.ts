/**
 * Editor store (ADR-015: Zustand) — wires `@ai-designer/editor-core` to the server.
 *
 * Pipeline (SPEC-007 §13, I15): UI intent → design operation → optimistic local apply (display =
 * server state + pending operations replayed with `applyOperation`) → debounced flush of everything
 * pending as ONE request (`batch` when several) with `expectedVersion` and an idempotency key that is
 * reused for retries → on acknowledgement the server's patch replaces the optimistic result.
 *
 * - Network / 5xx failures keep the changes and retry with backoff (same key: never applied twice).
 * - 409 CONCURRENT_MODIFICATION → conflict: nothing is overwritten until the person reloads or
 *   re-applies their changes on top of the newer version.
 * - Other refusals (validation, permission…) drop that batch and explain why.
 * - Undo/redo submit `revert_operation` for the server operations of a history step (never local
 *   snapshots), so history matches the working copy and committed revisions are never touched.
 *
 * One store per open design; components subscribe with selectors so an operation does not re-render
 * the whole editor (TECH §9.3).
 */
import type { DesignFinding, EditorState } from '@ai-designer/contracts';
import {
  applyEntityPatch,
  applyOperation,
  type EntityPatch,
  normalizeOperation,
  type Operation,
  type SingleClientOperation,
  singleClientOperationSchema,
} from '@ai-designer/design-operations';
import {
  acknowledgeBoundary,
  canRedo,
  canUndo,
  clearHistory,
  clearSelection,
  type CommandStack,
  completeRedo,
  completeUndo,
  createCommandStack,
  dropBatch,
  emptyQueue,
  emptySelection,
  enqueue,
  hasPending,
  initialSaveState,
  type Bounds,
  type CanvasLayer,
  defaultLayers,
  fitToBounds,
  holdTool,
  initialToolState,
  initialViewport,
  type LayerVisibility,
  releaseTool,
  toggleLayer,
  type ViewMode,
  zoomBy,
  zoomTo,
  type InFlightBatch,
  markAttemptFailed,
  peekRedo,
  peekUndo,
  pendingOps,
  type PendingQueue,
  pruneSelection,
  recordOperation,
  replay,
  retryDelayMs,
  returnToQueue,
  revertSequence,
  saveReducer,
  type SaveState,
  select,
  type SelectMode,
  type Selection,
  setTool,
  takeBatch,
  type Tool,
  type ToolState,
  type Viewport,
  ackBatch,
} from '@ai-designer/editor-core';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import type { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { type ApiError, toApiError } from '@/lib/api/errors';

import type { EditorApi } from './api';

export type OperationInput = z.input<typeof singleClientOperationSchema>;

/** Operation types the browser cannot preview (they need server-side artifact data or AI). */
const SERVER_ONLY_PREVIEW = new Set<string>([
  'attach_artifact',
  'replace_artifact',
  'regenerate_region',
  'interpret_reference',
]);

export interface EditorNotifier {
  error(message: string, details?: string[]): void;
  info(message: string): void;
}

export interface EditorTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface EditorDeps {
  api: EditorApi;
  notify: EditorNotifier;
  newId?: () => string;
  now?: () => string;
  /** Rapid changes within this window are sent together (default 500 ms). */
  debounceMs?: number;
  /** Automatic retries of a failed save before waiting for the person (default 5). */
  maxAutoRetries?: number;
  timers?: EditorTimers;
  isOnline?: () => boolean;
}

export type EditorMeta = Omit<EditorState, 'workingCopy'>;

export interface EditorConflict {
  /** Version the server has now (from the 409), when known. */
  currentVersion: number | null;
  dialogOpen: boolean;
}

export interface EditorStoreState {
  meta: EditorMeta;
  /** Last acknowledged server state — the truth. */
  server: { state: GarmentDesignState; version: number; hasUncommittedChanges: boolean };
  /** What the editor shows: server state + pending changes. */
  display: GarmentDesignState;
  queue: PendingQueue;
  history: CommandStack;
  save: SaveState;
  selection: Selection;
  viewport: Viewport;
  tool: ToolState;
  viewMode: ViewMode;
  layers: LayerVisibility;
  /** Canvas size in pixels and drawn content bounds (mm), reported by the canvas. */
  canvas: {
    width: number;
    height: number;
    content: Bounds | null;
    /** Keep the garment fitted when the canvas or the drawing changes (until the person zooms/pans). */
    autoFit: boolean;
    /** A view-mode switch asked for a fit that has not happened yet. */
    pendingFit: boolean;
  };
  conflict: EditorConflict | null;
  /** Non-blocking findings returned with the last acknowledged change. */
  findings: DesignFinding[];
  /** An undo / redo is running. */
  historyBusy: boolean;
  lastOperation: { id: string; displayId: string; label: string } | null;

  /** Make a change. Returns false when it was refused locally (nothing queued). */
  apply(operation: OperationInput, options: { label: string; groupId?: string | null }): boolean;
  /** Send pending changes now (Ctrl+S, Retry). */
  flush(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Conflict: discard my pending changes and load the server version. */
  reloadFromServer(): Promise<void>;
  /** Conflict: load the server version and re-apply my pending changes on top. */
  reapplyMine(): Promise<void>;
  setConflictDialogOpen(open: boolean): void;
  setOnline(online: boolean): void;
  select(id: string, mode?: SelectMode): void;
  clearSelection(): void;
  setViewport(viewport: Viewport): void;
  setTool(tool: Tool): void;
  /** Temporarily switch tools while a key is held (Space → pan). */
  holdTool(tool: Tool): void;
  releaseTool(): void;
  setViewMode(mode: ViewMode): void;
  toggleLayer(layer: CanvasLayer): void;
  /** The canvas reports its size and content; the first report fits the garment to the view. */
  setCanvas(size: { width: number; height: number }, content: Bounds | null): void;
  fitToView(): void;
  zoomIn(): void;
  zoomOut(): void;
  /** 100 % (1 mm = 1 px), centred on the garment. */
  zoomReset(): void;
  dispose(): void;
}

export type EditorStore = StoreApi<EditorStoreState>;

const defaultTimers: EditorTimers = {
  set: (fn, ms) => globalThis.setTimeout(fn, ms),
  clear: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

const isRetryable = (e: ApiError) => e.status === 0 || e.status >= 500;

const findingMessages = (e: ApiError): string[] =>
  ((e.details?.findings as { message?: string }[] | undefined) ?? [])
    .map((f) => f.message ?? '')
    .filter(Boolean);

function splitMeta(es: EditorState): { meta: EditorMeta; wc: EditorState['workingCopy'] } {
  const { workingCopy, ...meta } = es;
  return { meta, wc: workingCopy };
}

export function createEditorStore(initial: EditorState, deps: EditorDeps): EditorStore {
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const debounceMs = deps.debounceMs ?? 500;
  const maxAutoRetries = deps.maxAutoRetries ?? 5;
  const timers = deps.timers ?? defaultTimers;
  const isOnline =
    deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const { api, notify } = deps;

  let flushTimer: unknown = null;
  let retryTimer: unknown = null;
  let inFlight: Promise<void> | null = null;

  const { meta, wc } = splitMeta(initial);
  const serverState = wc.state as unknown as GarmentDesignState;

  const applyLocal = (state: GarmentDesignState, op: SingleClientOperation) => {
    const r = applyOperation(state, op as Operation, {
      actorUserId: get().meta.userId,
      now: now(),
    });
    return r.ok ? r.state : null;
  };
  const displayOf = (state: GarmentDesignState, queue: PendingQueue) =>
    replay(state, pendingOps(queue), applyLocal).state;
  const componentExists = (state: GarmentDesignState) => {
    const ids = new Set(state.components.map((c) => c.componentId));
    return (id: string) => ids.has(id);
  };

  const store = createStore<EditorStoreState>()((set, getState) => ({
    meta,
    server: {
      state: serverState,
      version: wc.version,
      hasUncommittedChanges: wc.hasUncommittedChanges,
    },
    display: serverState,
    queue: emptyQueue,
    history: createCommandStack(),
    save: initialSaveState(wc.updatedAt, isOnline()),
    selection: emptySelection,
    viewport: initialViewport,
    tool: initialToolState,
    viewMode: 'split',
    layers: defaultLayers,
    canvas: { width: 0, height: 0, content: null, autoFit: true, pendingFit: true },
    conflict: null,
    findings: wc.findings,
    historyBusy: false,
    lastOperation: null,

    apply(input, options) {
      const s = getState();
      if (!s.meta.capabilities.canEdit) return false;
      const parsed = singleClientOperationSchema.safeParse(input);
      if (!parsed.success) {
        notify.error('This change is not valid', [parsed.error.issues[0]?.message ?? '']);
        return false;
      }
      // Ids are generated here so the optimistic result and the server agree on them.
      const op = normalizeOperation(parsed.data as Operation) as SingleClientOperation;
      const local = applyOperation(s.display, op as Operation, {
        actorUserId: s.meta.userId,
        now: now(),
      });
      const serverOnly = SERVER_ONLY_PREVIEW.has(op.type);
      if (!local.ok && !serverOnly) {
        notify.error(
          'This change is not possible',
          local.findings.map((f) => f.message),
        );
        return false;
      }
      if (local.ok && local.changed.length === 0) return false;
      const queue = enqueue(s.queue, {
        localId: newId(),
        operation: op,
        label: options.label,
        groupId: options.groupId ?? null,
      });
      const display = local.ok ? local.state : s.display;
      set({
        queue,
        display,
        selection: pruneSelection(s.selection, componentExists(display)),
        save: saveReducer(s.save, { type: 'changed' }),
      });
      scheduleFlush(serverOnly ? 0 : debounceMs);
      return true;
    },

    flush: () => flush(),

    undo: () => runHistory('undo'),
    redo: () => runHistory('redo'),

    async reloadFromServer() {
      const fresh = await load();
      if (!fresh) return;
      const s = getState();
      const state = fresh.wc.state as unknown as GarmentDesignState;
      set({
        meta: fresh.meta,
        server: {
          state,
          version: fresh.wc.version,
          hasUncommittedChanges: fresh.wc.hasUncommittedChanges,
        },
        display: state,
        queue: emptyQueue,
        conflict: null,
        findings: fresh.wc.findings,
        selection: pruneSelection(s.selection, componentExists(state)),
        save: saveReducer(s.save, { type: 'conflict_resolved', pending: false }),
      });
    },

    async reapplyMine() {
      const fresh = await load();
      if (!fresh) return;
      const s = getState();
      const state = fresh.wc.state as unknown as GarmentDesignState;
      const { state: display, kept, dropped } = replay(state, pendingOps(s.queue), applyLocal);
      if (dropped.length)
        notify.info(
          `${dropped.length === 1 ? 'One change' : `${dropped.length} changes`} no longer fit the newer version and ${dropped.length === 1 ? 'was' : 'were'} not re-applied.`,
        );
      const queue: PendingQueue = { queued: kept, inFlight: null };
      set({
        meta: fresh.meta,
        server: {
          state,
          version: fresh.wc.version,
          hasUncommittedChanges: fresh.wc.hasUncommittedChanges,
        },
        display,
        queue,
        conflict: null,
        selection: pruneSelection(s.selection, componentExists(display)),
        save: saveReducer(s.save, { type: 'conflict_resolved', pending: kept.length > 0 }),
      });
      if (kept.length) await flush();
    },

    setConflictDialogOpen(open) {
      const c = getState().conflict;
      if (c && c.dialogOpen !== open) set({ conflict: { ...c, dialogOpen: open } });
    },

    setOnline(online) {
      const s = getState();
      set({
        save: saveReducer(s.save, { type: 'connectivity', online, pending: hasPending(s.queue) }),
      });
      if (online && hasPending(s.queue)) void flush();
    },

    select(id, mode = 'replace') {
      set({ selection: select(getState().selection, id, mode) });
    },
    clearSelection() {
      const s = getState();
      const next = clearSelection(s.selection);
      if (next !== s.selection) set({ selection: next });
    },
    setViewport(viewport) {
      // A manual zoom/pan stops fitting the garment automatically on resize.
      const { canvas } = getState();
      set({ viewport, ...(canvas.autoFit ? { canvas: { ...canvas, autoFit: false } } : {}) });
    },
    setTool(tool) {
      set({ tool: setTool(getState().tool, tool) });
    },
    holdTool(tool) {
      const s = getState();
      const next = holdTool(s.tool, tool);
      if (next !== s.tool) set({ tool: next });
    },
    releaseTool() {
      const s = getState();
      const next = releaseTool(s.tool);
      if (next !== s.tool) set({ tool: next });
    },
    setViewMode(viewMode) {
      const s = getState();
      if (s.viewMode !== viewMode)
        set({ viewMode, canvas: { ...s.canvas, autoFit: true, pendingFit: true } });
    },
    toggleLayer(layer) {
      set({ layers: toggleLayer(getState().layers, layer) });
    },
    setCanvas(size, content) {
      const c = getState().canvas;
      const sameBounds =
        c.content === content ||
        (c.content !== null &&
          content !== null &&
          c.content.x === content.x &&
          c.content.y === content.y &&
          c.content.width === content.width &&
          c.content.height === content.height);
      const fit = c.autoFit && content !== null && size.width > 0 && size.height > 0;
      if (c.width === size.width && c.height === size.height && sameBounds && !c.pendingFit) return;
      const canvas = { ...size, content, autoFit: c.autoFit, pendingFit: c.pendingFit && !fit };
      if (fit) set({ canvas, viewport: fitToBounds(content, size, 32) });
      else set({ canvas });
    },
    fitToView() {
      const { canvas } = getState();
      if (canvas.content && canvas.width > 0)
        set({
          viewport: fitToBounds(canvas.content, canvas, 32),
          canvas: { ...canvas, autoFit: true },
        });
    },
    zoomIn() {
      const { canvas, viewport } = getState();
      set({
        viewport: zoomBy(viewport, 1.25, { x: canvas.width / 2, y: canvas.height / 2 }),
        canvas: { ...canvas, autoFit: false },
      });
    },
    zoomOut() {
      const { canvas, viewport } = getState();
      set({
        viewport: zoomBy(viewport, 0.8, { x: canvas.width / 2, y: canvas.height / 2 }),
        canvas: { ...canvas, autoFit: false },
      });
    },
    zoomReset() {
      const { canvas } = getState();
      const b = canvas.content;
      set({
        viewport: b
          ? {
              ...zoomTo(initialViewport, 1),
              panX: canvas.width / 2 - (b.x + b.width / 2),
              panY: canvas.height / 2 - (b.y + b.height / 2),
            }
          : initialViewport,
        canvas: { ...canvas, autoFit: false },
      });
    },
    dispose() {
      // Leaving the editor: send what is still pending right away instead of waiting for the
      // debounce. Not terminal (React may remount the same store in development).
      clearTimers();
      if (hasPending(getState().queue)) void flush();
    },
  }));

  const get = store.getState;
  const set = store.setState;

  function clearTimers() {
    if (flushTimer !== null) timers.clear(flushTimer);
    if (retryTimer !== null) timers.clear(retryTimer);
    flushTimer = null;
    retryTimer = null;
  }

  function scheduleFlush(ms: number) {
    if (flushTimer !== null) timers.clear(flushTimer);
    flushTimer = timers.set(() => {
      flushTimer = null;
      void flush();
    }, ms);
  }

  async function load() {
    try {
      return splitMeta(await api.loadState());
    } catch (e) {
      notify.error('Could not load the latest version', [toApiError(e).message]);
      return null;
    }
  }

  /** Sends pending changes (one batch at a time). Resolves when that request settled. */
  async function flush(): Promise<void> {
    if (flushTimer !== null) {
      timers.clear(flushTimer);
      flushTimer = null;
    }
    if (retryTimer !== null) {
      timers.clear(retryTimer);
      retryTimer = null;
    }
    if (inFlight) return inFlight;
    const s = get();
    if (s.conflict || !hasPending(s.queue) || !isOnline()) return;
    let queue = s.queue;
    let batch = queue.inFlight;
    if (!batch) {
      const taken = takeBatch(queue, { batchId: newId(), idempotencyKey: newId() });
      queue = taken.queue;
      batch = taken.batch;
    }
    if (!batch) return;
    set({ queue, save: saveReducer(s.save, { type: 'flush_started' }) });
    const sent = batch;
    inFlight = send(sent).finally(() => {
      inFlight = null;
    });
    await inFlight;
    // More changes arrived meanwhile: send them right away.
    const after = get();
    if (!after.conflict && after.queue.queued.length && !after.queue.inFlight) scheduleFlush(0);
  }

  async function send(batch: InFlightBatch): Promise<void> {
    try {
      const res = await api.submit(
        { expectedVersion: get().server.version, operation: batch.operation },
        batch.idempotencyKey,
      );
      const s = get();
      const queue = ackBatch(s.queue, batch.batchId);
      let history = recordOperation(s.history, {
        operationId: res.operation.id,
        label: batch.label,
        groupId: batch.groupId,
        revertible: res.operation.revertible,
      });
      if (history.boundary?.reason === 'not_invertible') {
        notify.info(
          `“${history.boundary.label}” cannot be undone. To go back further, restore an earlier revision.`,
        );
        history = acknowledgeBoundary(history);
      }
      acceptServer(res, { queue, history });
      set({
        save: saveReducer(get().save, {
          type: 'acknowledged',
          at: now(),
          pending: hasPending(queue),
        }),
        lastOperation: {
          id: res.operation.id,
          displayId: res.operation.displayId,
          label: batch.label,
        },
      });
    } catch (e) {
      failBatch(batch, toApiError(e));
    }
  }

  /** Applies an acknowledged server change (the patch is authoritative). */
  function acceptServer(
    res: Awaited<ReturnType<EditorApi['submit']>>,
    next: { queue?: PendingQueue; history?: CommandStack } = {},
  ) {
    const s = get();
    const state = applyEntityPatch(s.server.state, res.patch as unknown as EntityPatch);
    const queue = next.queue ?? s.queue;
    const display = displayOf(state, queue);
    set({
      server: {
        state,
        version: res.workingCopy.version,
        hasUncommittedChanges: res.workingCopy.hasUncommittedChanges,
      },
      display,
      queue,
      history: next.history ?? s.history,
      findings: res.findings,
      selection: pruneSelection(s.selection, componentExists(display)),
      meta: {
        ...s.meta,
        design: {
          ...s.meta.design,
          workingCopyVersion: res.workingCopy.version,
          hasUncommittedChanges: res.workingCopy.hasUncommittedChanges,
        },
      },
    });
  }

  function failBatch(batch: InFlightBatch, err: ApiError) {
    const s = get();
    if (isRetryable(err)) {
      const queue = markAttemptFailed(s.queue, batch.batchId);
      set({
        queue,
        save: saveReducer(s.save, { type: 'failed', retryable: true, message: err.message }),
      });
      const attempts = queue.inFlight?.attempts ?? 0;
      if (attempts <= maxAutoRetries && isOnline()) {
        retryTimer = timers.set(() => {
          retryTimer = null;
          void flush();
        }, retryDelayMs(attempts));
      }
      return;
    }
    if (err.code === 'CONCURRENT_MODIFICATION') {
      const current = err.details?.currentVersion;
      set({
        queue: returnToQueue(s.queue),
        conflict: {
          currentVersion: typeof current === 'number' ? current : null,
          dialogOpen: true,
        },
        save: saveReducer(s.save, { type: 'conflict' }),
      });
      return;
    }
    const queue = dropBatch(s.queue, batch.batchId);
    set({
      queue,
      display: displayOf(s.server.state, queue),
      save: saveReducer(s.save, { type: 'discarded', pending: hasPending(queue) }),
    });
    if (err.code === 'NO_CHANGES') notify.info('That change would not change anything.');
    else notify.error(`“${batch.label}” was not saved: ${err.message}`, findingMessages(err));
    if (hasPending(queue)) scheduleFlush(0);
  }

  /** Sends pending changes until none are left (or sending stops making progress). */
  async function drain(): Promise<boolean> {
    for (let i = 0; i < 20 && hasPending(get().queue); i++) {
      if (get().conflict || !isOnline()) return false;
      const before = get().queue;
      await flush();
      const after = get().queue;
      if (after.inFlight && after.inFlight.attempts > 0) return false;
      if (after === before) return false;
    }
    return !hasPending(get().queue);
  }

  async function runHistory(direction: 'undo' | 'redo'): Promise<void> {
    const s = get();
    if (s.historyBusy || s.conflict || !s.meta.capabilities.canEdit) return;
    if (direction === 'undo' ? !canUndo(s.history) && !hasPending(s.queue) : !canRedo(s.history))
      return;
    set({ historyBusy: true });
    try {
      if (!(await drain())) {
        if (!get().conflict) notify.info('Waiting for your changes to save before undoing.');
        return;
      }
      const h = get().history;
      const entry = direction === 'undo' ? peekUndo(h) : peekRedo(h);
      if (!entry) return;
      set({ save: saveReducer(get().save, { type: 'flush_started' }) });
      const done: string[] = [];
      for (const operationId of revertSequence(entry)) {
        try {
          const res = await api.submit(
            {
              expectedVersion: get().server.version,
              operation: { type: 'revert_operation', operationId },
            },
            newId(),
          );
          acceptServer(res);
          done.push(res.operation.id);
        } catch (e) {
          historyFailed(direction, entry.label, toApiError(e), done.length > 0);
          return;
        }
      }
      const current = get().history;
      set({
        history:
          direction === 'undo'
            ? completeUndo(current, entry.id, done)
            : completeRedo(current, entry.id, done),
        save: saveReducer(get().save, {
          type: 'acknowledged',
          at: now(),
          pending: hasPending(get().queue),
        }),
      });
    } finally {
      set({ historyBusy: false });
    }
  }

  function historyFailed(
    direction: 'undo' | 'redo',
    label: string,
    err: ApiError,
    partial: boolean,
  ) {
    const s = get();
    if (err.code === 'CONCURRENT_MODIFICATION') {
      set({
        conflict: { currentVersion: null, dialogOpen: true },
        save: saveReducer(s.save, { type: 'conflict' }),
        ...(partial ? { history: clearHistory(s.history, 'conflict', label) } : {}),
      });
      return;
    }
    if (isRetryable(err) && !partial) {
      set({ save: saveReducer(s.save, { type: 'failed', retryable: true, message: err.message }) });
      notify.error(`Could not ${direction} “${label}”. Check your connection and try again.`);
      return;
    }
    // The server refused (the same parts changed since, or the step is no longer revertible):
    // this history can no longer be replayed safely.
    set({
      history: clearHistory(s.history, 'conflict', label),
      save: saveReducer(s.save, { type: 'discarded', pending: hasPending(s.queue) }),
    });
    notify.error(
      `Could not ${direction} “${label}”: ${err.message}. Undo history was cleared; restore an earlier revision to go further back.`,
    );
  }

  return store;
}

/** Whether there is anything not yet durably saved (navigation guard, FR-PRJ-018). */
export const selectHasUnsavedWork = (s: EditorStoreState): boolean =>
  hasPending(s.queue) || s.save.status === 'conflict' || s.save.status === 'saving';

export const selectCanUndo = (s: EditorStoreState): boolean =>
  s.meta.capabilities.canEdit &&
  !s.historyBusy &&
  !s.conflict &&
  (canUndo(s.history) || hasPending(s.queue));
export const selectCanRedo = (s: EditorStoreState): boolean =>
  s.meta.capabilities.canEdit && !s.historyBusy && !s.conflict && canRedo(s.history);
export const selectUndoLabel = (s: EditorStoreState): string | null =>
  peekUndo(s.history)?.label ?? null;
export const selectRedoLabel = (s: EditorStoreState): string | null =>
  peekRedo(s.history)?.label ?? null;
