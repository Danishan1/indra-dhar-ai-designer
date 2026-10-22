import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** false during SSR and hydration, true afterwards — for UI that depends on browser-only state. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
