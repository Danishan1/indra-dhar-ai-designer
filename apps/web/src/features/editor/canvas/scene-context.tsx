'use client';

import { createRenderer, type Renderer, type Scene } from '@ai-designer/garment-render';
import {
  createContext,
  type ReactNode,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';

import { useOrganization } from '@/features/organizations/organization-provider';

import { useEditor } from '../store-context';

import { type ArtifactRenderData, useArtifactRenderData } from './artifact-render-info';

const SceneContext = createContext<Scene | null>(null);
/** The drawing lags behind the latest change (a heavy re-render is in progress — FR-EDT-031). */
const PendingContext = createContext(false);
const ArtifactContext = createContext<ArtifactRenderData>({
  infos: new Map(),
  loaded: true,
  resolvers: {},
});

/**
 * Renders the displayed design state (server state + pending changes) into a scene. The renderer
 * memoizes geometry per component, so a property change recomputes only what it affects (I16).
 */
export function SceneProvider({ children }: { children: ReactNode }) {
  const { active } = useOrganization();
  const latest = useEditor((s) => s.display);
  // Rendering may fall behind typing; React keeps the previous drawing until the new one is ready.
  const display = useDeferredValue(latest);
  const artifacts = useArtifactRenderData(active.id, display);
  const [renderer] = useState<Renderer>(() => createRenderer());
  const resolvers = artifacts.resolvers;
  const scene = useMemo(() => renderer.render(display, resolvers), [renderer, display, resolvers]);
  return (
    <SceneContext.Provider value={scene}>
      <ArtifactContext.Provider value={artifacts}>
        <PendingContext.Provider value={display !== latest}>{children}</PendingContext.Provider>
      </ArtifactContext.Provider>
    </SceneContext.Provider>
  );
}

export function useScene(): Scene {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error('useScene must be used inside <SceneProvider>');
  return scene;
}

export const useScenePending = (): boolean => useContext(PendingContext);

/** Render info of the artifact revisions the displayed design uses (names, revision pins, regions). */
export const useArtifactInfos = (): ArtifactRenderData => useContext(ArtifactContext);
