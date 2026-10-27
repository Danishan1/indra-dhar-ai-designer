'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';

import type { EditorStore, EditorStoreState } from './store';

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorStoreProvider({
  store,
  children,
}: {
  store: EditorStore;
  children: ReactNode;
}) {
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditor must be used inside <EditorStoreProvider>');
  return store;
}

/**
 * Subscribes to one slice of the editor state. Select primitives or stable references (or wrap the
 * selector with `useShallow`) so a change elsewhere does not re-render the component.
 */
export function useEditor<T>(selector: (state: EditorStoreState) => T): T {
  return useStore(useEditorStore(), selector);
}
