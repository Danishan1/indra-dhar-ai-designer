import type { ArtifactRenderInfo } from '@ai-designer/contracts';
import { COMPONENT_ARTIFACT_CATEGORIES } from '@ai-designer/design-operations';
import type {
  ArtifactBinding,
  DesignComponent,
  DesignRelationship,
  GarmentDesignState,
} from '@ai-designer/garment-model';

import type { OperationInput } from '../store';

/** What the library needs to know about an artifact to offer it for a component. */
export interface ArtifactSummary {
  id: string;
  name: string;
  displayId?: string;
  category: string;
  currentRevisionId: string | null;
  compatibleTargetTypes: readonly string[];
  geometryCapability: 'G0' | 'G1' | 'G2' | null;
  lifecycleStatus: string;
}

export type FitStatus = 'compatible' | 'review' | 'incompatible';
export interface Fit {
  status: FitStatus;
  /** Why it is not plainly compatible (shown next to the badge and in the refusal). */
  reason: string | null;
}

const human = (s: string) => s.replaceAll('_', ' ');

/**
 * Whether an artifact can go on a component (FR-EDT-051/055). Mirrors the server's checks so the
 * library can explain itself up front; the server still decides (ART-006, CMP-005).
 */
export function artifactFit(a: ArtifactSummary, c: DesignComponent): Fit {
  if (a.lifecycleStatus !== 'active')
    return {
      status: 'incompatible',
      reason: 'Deactivated — designs that use it keep it, but it cannot be added again',
    };
  if (!a.currentRevisionId) return { status: 'incompatible', reason: 'Has no revision yet' };
  if (c.locked) return { status: 'incompatible', reason: `${c.displayName} is locked` };
  if (a.compatibleTargetTypes.length > 0 && !a.compatibleTargetTypes.includes(c.componentType))
    return {
      status: 'incompatible',
      reason: `Fits ${a.compatibleTargetTypes.map(human).join(', ')} — not ${human(c.componentType)}`,
    };
  if (a.geometryCapability !== 'G2')
    return {
      status: 'review',
      reason: 'No editable geometry — the placement is approximate and needs review',
    };
  return { status: 'compatible', reason: null };
}

/** Categories a component carries at most one of (a second one replaces the first). */
export const exclusiveCategory = (category: string) => COMPONENT_ARTIFACT_CATEGORIES.has(category);

/**
 * The operation that puts an artifact on a component: a sleeve/collar/fabric… replaces the binding
 * of the same category (explicitly, as `replace_artifact`), anything else is attached. The exact
 * current revision is pinned (ART-004).
 */
export function planAttach(
  a: ArtifactSummary,
  c: DesignComponent,
  infos: ReadonlyMap<string, Pick<ArtifactRenderInfo, 'category'>>,
): { operation: OperationInput; label: string } | null {
  if (!a.currentRevisionId) return null;
  if (exclusiveCategory(a.category)) {
    const existing = c.artifactBindings.find(
      (b) => (infos.get(b.artifactRevisionId)?.category ?? b.role) === a.category,
    );
    if (existing) {
      if (existing.artifactRevisionId === a.currentRevisionId) return null;
      return {
        operation: {
          type: 'replace_artifact',
          componentId: c.componentId,
          bindingId: existing.bindingId,
          artifactRevisionId: a.currentRevisionId,
        },
        label: `Replace ${human(a.category)} on ${c.displayName} with ${a.name}`,
      };
    }
  }
  return {
    operation: {
      type: 'attach_artifact',
      componentId: c.componentId,
      artifactRevisionId: a.currentRevisionId,
    },
    label: `Attach ${a.name} to ${c.displayName}`,
  };
}

export interface BindingView {
  binding: ArtifactBinding;
  info: ArtifactRenderInfo | null;
  relationship: DesignRelationship | null;
  /** The pinned revision is not visible to this person (deleted, private to someone else…). */
  unavailable: boolean;
  deactivated: boolean;
  approximate: boolean;
  /** A newer revision exists — offered as an explicit "Update to Rn" (ART-005). */
  update: { revisionId: string; revisionNumber: number } | null;
}

/** The artifacts used by a component, with what the editor shows about each (FR-EDT-056). */
export function bindingViews(
  state: GarmentDesignState,
  c: DesignComponent,
  infos: ReadonlyMap<string, ArtifactRenderInfo>,
  loaded: boolean,
): BindingView[] {
  return c.artifactBindings.map((binding) => {
    const info = infos.get(binding.artifactRevisionId) ?? null;
    const relationship =
      state.relationships.find(
        (r) =>
          r.source.entityType === 'artifact_revision' &&
          r.source.entityId === binding.artifactRevisionId &&
          r.target.entityId === c.componentId,
      ) ?? null;
    const update =
      info?.currentRevisionId &&
      info.currentRevisionId !== binding.artifactRevisionId &&
      info.currentRevisionNumber > info.revisionNumber
        ? { revisionId: info.currentRevisionId, revisionNumber: info.currentRevisionNumber }
        : null;
    return {
      binding,
      info,
      relationship,
      unavailable: loaded && !info,
      deactivated: !!info && info.lifecycleStatus !== 'active',
      approximate: !!relationship?.placement?.approximate,
      update,
    };
  });
}

export const revisionLabel = (n: number) => `R${String(n).padStart(3, '0')}`;

/** Drag payload from a library card to the canvas (FR-EDT-050). */
export const ARTIFACT_DRAG_TYPE = 'application/x-ai-designer-artifact';

export function encodeDrag(a: ArtifactSummary): string {
  return JSON.stringify(a);
}

export function decodeDrag(raw: string): ArtifactSummary | null {
  try {
    const v = JSON.parse(raw) as Partial<ArtifactSummary>;
    if (typeof v.id !== 'string' || typeof v.category !== 'string' || !v.name) return null;
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      currentRevisionId: v.currentRevisionId ?? null,
      compatibleTargetTypes: Array.isArray(v.compatibleTargetTypes) ? v.compatibleTargetTypes : [],
      geometryCapability: v.geometryCapability ?? null,
      lifecycleStatus: v.lifecycleStatus ?? 'active',
      ...(v.displayId ? { displayId: v.displayId } : {}),
    };
  } catch {
    return null;
  }
}

// The artifact being dragged (drag events only expose the payload on drop; the canvas needs it while
// hovering to show whether the component under the pointer fits).
let activeDrag: ArtifactSummary | null = null;
export const setActiveDrag = (a: ArtifactSummary | null) => {
  activeDrag = a;
};
export const getActiveDrag = () => activeDrag;
