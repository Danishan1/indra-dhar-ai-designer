/**
 * Save-status state machine (FR-EDT-005, FR-EDT-086…092, FR-PRJ-016).
 *
 * "Saved" is reached only from a server acknowledgement with nothing else pending. Conflict is sticky
 * until the person resolves it; offline is left only when connectivity returns. Pure reducer.
 */
export const SaveStatuses = [
  'saved',
  'saving',
  'unsaved',
  'save_failed',
  'conflict',
  'offline',
] as const;
export type SaveStatus = (typeof SaveStatuses)[number];

export interface SaveState {
  readonly status: SaveStatus;
  /** Time of the last server acknowledgement (ISO). */
  readonly lastSavedAt: string | null;
  /** Message of the last failure, when status is save_failed. */
  readonly error: string | null;
  readonly online: boolean;
}

export type SaveEvent =
  /** A local change was queued. */
  | { type: 'changed' }
  /** A request with pending changes was sent. */
  | { type: 'flush_started' }
  /** The server acknowledged; `pending` = more local changes are still waiting. */
  | { type: 'acknowledged'; at: string; pending: boolean }
  /** The request failed; `retryable` for network / server errors (pending changes are kept). */
  | { type: 'failed'; retryable: boolean; message: string }
  /** The server refused the changes for good (validation…); they were dropped, nothing is lost. */
  | { type: 'discarded'; pending: boolean }
  /** The server has a newer version (409); nothing is overwritten until the person decides. */
  | { type: 'conflict' }
  /** The conflict was resolved (reloaded, or changes re-queued). */
  | { type: 'conflict_resolved'; pending: boolean }
  | { type: 'connectivity'; online: boolean; pending: boolean };

export function initialSaveState(at: string | null = null, online = true): SaveState {
  return { status: online ? 'saved' : 'offline', lastSavedAt: at, error: null, online };
}

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  const s = state.status;
  switch (event.type) {
    case 'changed':
      if (s === 'saved') return { ...state, status: 'unsaved' };
      return state;
    case 'flush_started':
      if (s === 'conflict') return state;
      return { ...state, status: 'saving', error: null };
    case 'acknowledged':
      if (s === 'conflict') return { ...state, lastSavedAt: event.at };
      return {
        ...state,
        status: !state.online ? 'offline' : event.pending ? 'unsaved' : 'saved',
        lastSavedAt: event.at,
        error: null,
      };
    case 'failed':
      if (s === 'conflict') return state;
      if (event.retryable && !state.online) return { ...state, status: 'offline' };
      return { ...state, status: 'save_failed', error: event.message };
    case 'discarded':
      if (s === 'conflict') return state;
      return {
        ...state,
        status: !state.online ? 'offline' : event.pending ? 'unsaved' : 'saved',
        error: null,
      };
    case 'conflict':
      return { ...state, status: 'conflict', error: null };
    case 'conflict_resolved':
      if (s !== 'conflict') return state;
      return {
        ...state,
        status: !state.online ? 'offline' : event.pending ? 'unsaved' : 'saved',
      };
    case 'connectivity':
      if (!event.online)
        return { ...state, online: false, status: s === 'conflict' ? s : 'offline' };
      if (s === 'offline')
        return { ...state, online: true, status: event.pending ? 'unsaved' : 'saved' };
      return { ...state, online: true };
  }
}

/** Anything not yet durably saved — guards navigation and closing the tab (FR-PRJ-018). */
export const hasUnsavedWork = (state: SaveState, pending: boolean): boolean =>
  pending || state.status === 'conflict' || state.status === 'saving';

export const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  save_failed: 'Save failed',
  conflict: 'Conflict',
  offline: 'Offline',
};
