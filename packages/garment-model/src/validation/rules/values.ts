import { allowedPropertyKeys } from '../../registry/catalog.js';
import { evaluatePropertyRules, lengthMm } from '../../registry/property-rules.js';
import { componentRef } from '../../schema/entity-ref.js';
import type { DesignRule, RuleFinding } from '../engine.js';

const fmt = (mm: number) => `${Math.round(mm)} mm`;
const pathOf = (componentId: string, key: string) => `components[${componentId}].properties.${key}`;

/**
 * Dimensions within the ranges of the garment type (geometric bounds): outside the typical range is
 * a warning, outside the limits a blocking error. Properties that do not apply are skipped.
 */
export const dimensionRanges: DesignRule = {
  id: 'bounds.dimension_range',
  version: '1.0.0',
  category: 'geometric_bounds',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components) {
      const disabled = evaluatePropertyRules(state, c).disabled;
      for (const [key, range] of Object.entries(ctx.ranges)) {
        if (disabled.has(key)) continue;
        const pv = c.properties[key];
        const mm = lengthMm(pv);
        if (mm === null || pv?.status === 'not_applicable') continue;
        const label = ctx.catalog.properties.get(key)?.label ?? key;
        const [lo, hi] = range.limits;
        const [tlo, thi] = range.typical;
        if (mm < lo || mm > hi)
          out.push({
            outcome: 'error',
            entity: componentRef(c.componentId),
            path: pathOf(c.componentId, key),
            message: `${c.displayName}: ${label} ${fmt(mm)} is outside what a ${state.garmentType.replaceAll('_', ' ')} can have (${fmt(lo)}–${fmt(hi)})`,
            resolution: `Enter a ${label.toLowerCase()} between ${fmt(lo)} and ${fmt(hi)}`,
          });
        else if (mm < tlo || mm > thi)
          out.push({
            outcome: 'warning',
            entity: componentRef(c.componentId),
            path: pathOf(c.componentId, key),
            message: `${c.displayName}: ${label} ${fmt(mm)} is unusual (typical ${fmt(tlo)}–${fmt(thi)})`,
            resolution: 'Check the value, or keep it if it is intended',
          });
      }
    }
    return out;
  },
};

/** Values still set on properties that no longer apply (e.g. a cuff width on a short sleeve). */
export const conflictingOptions: DesignRule = {
  id: 'exclusive.conflicting_value',
  version: '1.0.0',
  category: 'mutually_exclusive',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components)
      for (const conflict of evaluatePropertyRules(state, c).conflicts) {
        const label = ctx.catalog.properties.get(conflict.key)?.label ?? conflict.key;
        out.push({
          outcome: 'warning',
          entity: componentRef(c.componentId),
          path: pathOf(c.componentId, conflict.key),
          message: `${c.displayName}: ${label} is set but does not apply — ${conflict.reason}`,
          resolution: `Clear ${label.toLowerCase()} or change the option that excludes it`,
        });
      }
    return out;
  },
};

/** The option that defines a component (sleeve type, collar type…) should be chosen. */
const DEFINING_PROPERTY: Readonly<Record<string, string>> = {
  sleeve: 'construction.sleeve_type',
  collar: 'construction.collar_type',
  cuff: 'construction.cuff_type',
  placket: 'construction.placket_type',
  pocket: 'construction.pocket_type',
  hem: 'construction.hem_type',
  neckline: 'construction.neckline_type',
};

export const definingProperties: DesignRule = {
  id: 'required.defining_property',
  version: '1.0.0',
  category: 'required_property',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components) {
      const key = DEFINING_PROPERTY[c.componentType];
      if (!key || !allowedPropertyKeys(ctx.catalog, c.componentType).includes(key)) continue;
      if (evaluatePropertyRules(state, c).disabled.has(key)) continue;
      const pv = c.properties[key];
      if (pv && (pv.value !== null || pv.status === 'not_applicable')) continue;
      const label = ctx.catalog.properties.get(key)?.label ?? key;
      out.push({
        outcome: 'warning',
        entity: componentRef(c.componentId),
        path: pathOf(c.componentId, key),
        message: `${c.displayName}: ${label} is not chosen`,
        resolution: `Choose a ${label.toLowerCase()}`,
      });
    }
    return out;
  },
};

/**
 * Informative: production-critical values that are set but not confirmed by a person (AI or
 * artifact proposals, inferences). Never blocking at design stage; tech packs check them (I41).
 */
export const unconfirmedCritical: DesignRule = {
  id: 'values.unconfirmed_critical',
  version: '1.0.0',
  category: 'unconfirmed_values',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components) {
      const disabled = evaluatePropertyRules(state, c).disabled;
      const open = Object.entries(c.properties)
        .filter(
          ([key, pv]) =>
            ctx.catalog.properties.get(key)?.manufacturingCritical &&
            !disabled.has(key) &&
            pv.value !== null &&
            (pv.status === 'inferred' || pv.status === 'proposed' || pv.status === 'needs_review'),
        )
        .map(
          ([key, pv]) =>
            `${ctx.catalog.properties.get(key)?.label ?? key} (${pv.status.replace('_', ' ')})`,
        )
        .sort();
      if (!open.length) continue;
      out.push({
        outcome: 'warning',
        severity: 'info',
        entity: componentRef(c.componentId),
        message: `${c.displayName}: not confirmed yet — ${open.join(', ')}`,
        resolution: 'Review and confirm these values (or mark them as needing review)',
      });
    }
    return out;
  },
};
