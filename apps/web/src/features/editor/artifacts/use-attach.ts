'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import { useArtifactInfos } from '../canvas/scene-context';
import { useEditor, useEditorStore } from '../store-context';

import { artifactFit, type ArtifactSummary, planAttach } from './attach';

/**
 * Puts a library artifact on a component (button, drop on the canvas): explains refusals before
 * anything is sent, pins the current revision and selects the target so its Artifacts section shows.
 */
export function useAttachArtifact(): (a: ArtifactSummary, componentId: string) => boolean {
  const store = useEditorStore();
  const apply = useEditor((s) => s.apply);
  const { infos } = useArtifactInfos();
  return useCallback(
    (a, componentId) => {
      const c = store.getState().display.components.find((x) => x.componentId === componentId);
      if (!c) return false;
      const fit = artifactFit(a, c);
      if (fit.status === 'incompatible') {
        toast.error(`${a.name} can’t go on ${c.displayName}`, {
          description: fit.reason ?? undefined,
        });
        return false;
      }
      const plan = planAttach(a, c, infos);
      if (!plan) {
        toast.info(`${c.displayName} already uses this revision of ${a.name}`);
        return false;
      }
      const ok = apply(plan.operation, { label: plan.label });
      if (ok) {
        store.getState().select(c.componentId, 'replace');
        if (fit.status === 'review') toast.info(`${a.name}: ${fit.reason ?? 'needs review'}`);
      }
      return ok;
    },
    [store, apply, infos],
  );
}
