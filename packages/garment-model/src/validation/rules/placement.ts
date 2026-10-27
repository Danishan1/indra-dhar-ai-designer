import { componentRef, type EntityRef } from '../../schema/entity-ref.js';
import type { DesignRule, RuleFinding } from '../engine.js';

const relRef = (id: string): EntityRef => ({ entityType: 'relationship', entityId: id });

/** Trim/lace categories (binding roles) that are usually woven or rigid. */
const RIGID_TRIMS = new Set(['lace', 'trim', 'embroidery']);

/**
 * Material compatibility: rigid trims on a knit garment need stretch allowance — a warning to check,
 * never a silent pass (SPEC-003 §15.3).
 */
export const trimOnKnit: DesignRule = {
  id: 'material.trim_on_knit',
  version: '1.0.0',
  category: 'material_compatibility',
  appliesTo: '*',
  evaluate(state, ctx) {
    if (ctx.category?.fabricBase !== 'knit') return [];
    const out: RuleFinding[] = [];
    for (const c of state.components)
      for (const b of c.artifactBindings) {
        if (!b.role || !RIGID_TRIMS.has(b.role)) continue;
        out.push({
          outcome: 'warning',
          entity: componentRef(c.componentId),
          path: `components[${c.componentId}].artifactBindings[${b.bindingId}]`,
          message: `${c.displayName}: ${b.role} on a knit garment may restrict stretch`,
          resolution: 'Check that the trim stretches or that the seam allows for it',
        });
      }
    return out;
  },
};

/**
 * Rendering capability (GEO-007, REL-008): a placement computed without boundary geometry is an
 * approximation; it stays visible for manual review until the geometry exists or it is replaced.
 */
export const approximatePlacement: DesignRule = {
  id: 'rendering.approximate_placement',
  version: '1.0.0',
  category: 'rendering_capability',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const r of state.relationships) {
      if (!r.placement?.approximate) continue;
      const target =
        r.target.entityType === 'design_component'
          ? ctx.componentById.get(r.target.entityId)
          : undefined;
      out.push({
        outcome: 'requires_manual_review',
        entity: relRef(r.relationshipId),
        path: `relationships[${r.relationshipId}].placement`,
        message: `The placement${target ? ` on ${target.displayName}` : ''}${r.placement.region ? ` (${r.placement.region.replaceAll('_', ' ')})` : ''} is approximate — there is no boundary geometry to attach it to`,
        resolution: 'Review the placement on the drawing; it is not a production-valid attachment',
      });
    }
    return out;
  },
};
