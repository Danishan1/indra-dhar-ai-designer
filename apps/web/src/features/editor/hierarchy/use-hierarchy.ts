import { COMPONENT_TYPES, type DesignComponent, defaultCatalog } from '@ai-designer/garment-model';
import { useMemo } from 'react';

export interface TreeNode {
  component: DesignComponent;
  depth: number;
  children: TreeNode[];
}

const TYPE_ORDER = new Map(COMPONENT_TYPES.map((t, i) => [t.type, i]));
const SIDE_ORDER: Record<string, number> = { left: 0, right: 1, center: 2, none: 3 };

/** Garment-type ordering: by catalog type order, then side (left before right), then name. */
export function compareComponents(a: DesignComponent, b: DesignComponent): number {
  return (
    (TYPE_ORDER.get(a.componentType) ?? 999) - (TYPE_ORDER.get(b.componentType) ?? 999) ||
    (SIDE_ORDER[a.side] ?? 9) - (SIDE_ORDER[b.side] ?? 9) ||
    a.displayName.localeCompare(b.displayName)
  );
}

/** Builds the component tree from `parentComponentId` (orphans become roots, never lost). */
export function buildTree(components: readonly DesignComponent[]): TreeNode[] {
  const ids = new Set(components.map((c) => c.componentId));
  const byParent = new Map<string | null, DesignComponent[]>();
  for (const c of components) {
    const parent = c.parentComponentId && ids.has(c.parentComponentId) ? c.parentComponentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): TreeNode[] =>
    (byParent.get(parent) ?? [])
      .slice()
      .sort(compareComponents)
      .filter((c) => !seen.has(c.componentId))
      .map((c) => {
        const next = new Set(seen).add(c.componentId);
        return { component: c, depth, children: build(c.componentId, depth + 1, next) };
      });
  return build(null, 1, new Set());
}

/** Visible rows in order, honouring collapsed nodes. */
export function flattenTree(nodes: TreeNode[], collapsed: ReadonlySet<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length && !collapsed.has(n.component.componentId)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export interface AddableType {
  type: string;
  label: string;
  side: 'left' | 'right' | 'none';
  /** Why it cannot be added here (single per parent already present). */
  disabledReason: string | null;
}

/** Component types that may be added under `parent` (catalog rules; repeatability respected). */
export function addableChildren(
  parent: DesignComponent,
  components: readonly DesignComponent[],
  catalog = defaultCatalog,
): AddableType[] {
  const siblings = components.filter((c) => c.parentComponentId === parent.componentId);
  const out: AddableType[] = [];
  for (const def of catalog.componentTypes.values()) {
    const allowed = def.allowedParents === '*' || def.allowedParents.includes(parent.componentType);
    if (!allowed) continue;
    const same = siblings.filter((s) => s.componentType === def.type);
    if (def.repeatability === 'sided') {
      for (const side of ['left', 'right'] as const)
        out.push({
          type: def.type,
          label: `${def.label} (${side})`,
          side,
          disabledReason: same.some((s) => s.side === side)
            ? `There is already a ${side} ${def.label.toLowerCase()}`
            : null,
        });
    } else {
      out.push({
        type: def.type,
        label: def.label,
        side: 'none',
        disabledReason:
          def.repeatability === 'single' && same.length > 0
            ? `Only one ${def.label.toLowerCase()} per ${parent.displayName}`
            : null,
      });
    }
  }
  return out.sort((a, b) => (TYPE_ORDER.get(a.type) ?? 999) - (TYPE_ORDER.get(b.type) ?? 999));
}

export function useTree(components: readonly DesignComponent[]) {
  return useMemo(() => buildTree(components), [components]);
}
