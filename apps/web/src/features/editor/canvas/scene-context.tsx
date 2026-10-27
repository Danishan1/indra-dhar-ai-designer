'use client';

import { createRenderer, type Renderer, type Scene } from '@ai-designer/garment-render';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import { useOrganization } from '@/features/organizations/organization-provider';

import { useEditor } from '../store-context';

import { useArtifactResolvers } from './artifact-render-info';

const SceneContext = createContext<Scene | null>(null);

/**
 * Renders the displayed design state (server state + pending changes) into a scene. The renderer
 * memoizes geometry per component, so a property change recomputes only what it affects (I16).
 */
export function SceneProvider({ children }: { children: ReactNode }) {
  const { active } = useOrganization();
  const display = useEditor((s) => s.display);
  const resolvers = useArtifactResolvers(active.id, display);
  const [renderer] = useState<Renderer>(() => createRenderer());
  const scene = useMemo(() => renderer.render(display, resolvers), [renderer, display, resolvers]);
  return <SceneContext.Provider value={scene}>{children}</SceneContext.Provider>;
}

export function useScene(): Scene {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error('useScene must be used inside <SceneProvider>');
  return scene;
}
