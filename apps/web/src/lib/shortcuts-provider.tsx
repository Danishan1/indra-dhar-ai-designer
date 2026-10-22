'use client';

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { type ShortcutDefinition, ShortcutRegistry } from './shortcuts';

const RegistryContext = createContext<ShortcutRegistry | null>(null);

/** One window-level keydown listener for the whole app. */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new ShortcutRegistry());
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void registry.handle(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [registry]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useShortcutRegistry(): ShortcutRegistry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useShortcut must be used inside <ShortcutsProvider>');
  return registry;
}

/** Registers a shortcut while the component is mounted. The latest handler is always used. */
export function useShortcut(def: ShortcutDefinition): void {
  const registry = useShortcutRegistry();
  const handlerRef = useRef(def.handler);
  useEffect(() => {
    handlerRef.current = def.handler;
  });
  const { id, combo, description, allowInInputs } = def;
  useEffect(
    () =>
      registry.register({
        id,
        combo,
        description,
        ...(allowInInputs === undefined ? {} : { allowInInputs }),
        handler: (event) => handlerRef.current(event),
      }),
    [registry, id, combo, description, allowInInputs],
  );
}
