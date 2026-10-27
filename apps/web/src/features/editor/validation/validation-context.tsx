'use client';

import type { ValidationFindingView, ValidationRun } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';

import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { selectHasUnsavedWork } from '../store';
import { useEditor } from '../store-context';

import { validationApi } from './api';

/** Delay after the last saved change before the server re-checks the working copy. */
export const REVALIDATE_DELAY_MS = 1200;

export interface ValidationState {
  run: ValidationRun | null;
  /** The results describe an older version of the working copy (FR-EDT-121). */
  stale: boolean;
  /** A run is in flight. */
  checking: boolean;
  /** Loading or running failed (results, if any, are kept). */
  error: unknown;
  rerun(): void;
  /** Findings per component id (relationship findings count for their target component). */
  byComponent: ReadonlyMap<string, readonly ValidationFindingView[]>;
}

export const ValidationContext = createContext<ValidationState | null>(null);
const Ctx = ValidationContext;
const EMPTY: ReadonlyMap<string, readonly ValidationFindingView[]> = new Map();

/**
 * Keeps the working copy's design-structure validation current (I20): reads the latest run, and
 * re-runs it on the server shortly after every saved change. Older results stay visible, marked
 * stale, until the new run arrives.
 */
export function ValidationProvider({ children }: { children: ReactNode }) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const designId = useEditor((s) => s.meta.design.id);
  const version = useEditor((s) => s.server.version);
  const unsaved = useEditor(selectHasUnsavedWork);
  const relationships = useEditor((s) => s.display.relationships);
  const api = useMemo(() => validationApi(active.id, designId), [active.id, designId]);
  const key = queryKeys.org(active.id).validation(designId, 'working_copy');

  const latest = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await api.latest(signal)).run,
    staleTime: Infinity,
  });
  // A failed automatic run is not retried for the same version (Re-run is still available).
  const failedVersion = useRef<number | null>(null);
  const run = useMutation({
    mutationFn: () => api.run({ target: 'working_copy' }),
    onError: () => {
      failedVersion.current = version;
    },
    onSuccess: (r) => queryClient.setQueryData(key, r),
  });
  const current = latest.data ?? null;
  const { mutate, isPending } = run;

  // Re-check after changes settle (only saved state is validated by the server).
  useEffect(() => {
    if (latest.isPending || unsaved || isPending) return;
    if (current && current.targetVersion === version) return;
    if (failedVersion.current === version) return;
    const timer = setTimeout(() => mutate(), current ? REVALIDATE_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [latest.isPending, unsaved, isPending, current, version, mutate]);

  const value = useMemo<ValidationState>(() => {
    const targetOf = new Map(
      relationships
        .filter((r) => r.target.entityType === 'design_component')
        .map((r) => [r.relationshipId, r.target.entityId]),
    );
    const byComponent = new Map<string, ValidationFindingView[]>();
    for (const f of current?.findings ?? []) {
      const id =
        f.entity?.entityType === 'design_component'
          ? f.entity.entityId
          : f.entity?.entityType === 'relationship'
            ? targetOf.get(f.entity.entityId)
            : undefined;
      if (!id) continue;
      byComponent.set(id, [...(byComponent.get(id) ?? []), f]);
    }
    return {
      run: current,
      stale: !!current && (current.targetVersion !== version || unsaved),
      checking: isPending,
      error: run.error ?? latest.error,
      rerun: () => mutate(),
      byComponent,
    };
  }, [current, version, unsaved, isPending, run.error, latest.error, mutate, relationships]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useValidation(): ValidationState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useValidation must be used inside <ValidationProvider>');
  return v;
}

/** Validation findings about one property of the given components (inline, FR-EDT-117). */
export function usePropertyFindings(componentIds: readonly string[], key: string) {
  // Optional: rows rendered outside the editor (tests, previews) simply show no findings.
  const byComponent = useContext(Ctx)?.byComponent ?? EMPTY;
  return useMemo(
    () =>
      componentIds.flatMap((id) =>
        (byComponent.get(id) ?? []).filter((f) => f.path?.endsWith(`.properties.${key}`) ?? false),
      ),
    [byComponent, componentIds, key],
  );
}

/** All findings about one component (properties panel summary). */
export function useComponentFindings(componentId: string): readonly ValidationFindingView[] {
  return useContext(Ctx)?.byComponent.get(componentId) ?? [];
}
