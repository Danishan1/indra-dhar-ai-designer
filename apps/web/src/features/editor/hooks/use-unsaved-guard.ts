'use client';

import { useEffect } from 'react';

import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

/**
 * Warns before closing or reloading the tab while changes are not durably saved (FR-PRJ-018), and
 * feeds browser connectivity into the save state (offline indicator, resume on reconnect).
 */
export function useUnsavedGuard() {
  const store = useEditorStore();
  const unsaved = useEditor(selectHasUnsavedWork);

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Try to get the last changes out; the browser shows its own confirmation.
      void store.getState().flush();
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [store, unsaved]);

  useEffect(() => {
    const online = () => store.getState().setOnline(true);
    const offline = () => store.getState().setOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [store]);
}
