import { componentRef } from '../../schema/entity-ref.js';
import type { DesignRule, RuleFinding } from '../engine.js';

const human = (s: string) => s.replaceAll('_', ' ');

/** Components a garment of these families cannot do without (dependency, SPEC-003 §15.2). */
const REQUIRED_COMPONENTS: Readonly<Record<string, readonly string[]>> = {
  shirt: ['front_body_panel', 'back_body_panel'],
  tshirt: ['front_body_panel', 'back_body_panel'],
};

export const requiredComponents: DesignRule = {
  id: 'dependency.required_component',
  version: '1.0.0',
  category: 'dependency',
  appliesTo: Object.keys(REQUIRED_COMPONENTS),
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const type of REQUIRED_COMPONENTS[state.garmentType] ?? []) {
      if (state.components.some((c) => c.componentType === type)) continue;
      const label = ctx.catalog.componentTypes.get(type)?.label ?? human(type);
      out.push({
        outcome: 'error',
        entity: null,
        path: `components.${type}`,
        message: `A ${human(state.garmentType)} needs a ${label.toLowerCase()}, and this design has none`,
        resolution: `Add a ${label.toLowerCase()} to the garment body`,
      });
    }
    return out;
  },
};

/** A cuff finishes a sleeve opening: it needs a sleeve, and a sleeveless armhole has no cuff. */
export const cuffRequiresSleeve: DesignRule = {
  id: 'dependency.cuff_requires_sleeve',
  version: '1.0.0',
  category: 'dependency',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components) {
      if (c.componentType !== 'cuff') continue;
      const parent = c.parentComponentId ? ctx.componentById.get(c.parentComponentId) : undefined;
      if (!parent || parent.componentType !== 'sleeve')
        out.push({
          outcome: 'error',
          entity: componentRef(c.componentId),
          message: `${c.displayName} is not attached to a sleeve`,
          resolution: 'Move the cuff under a sleeve or remove it',
        });
      else if (parent.properties['construction.sleeve_type']?.value === 'sleeveless')
        out.push({
          outcome: 'error',
          entity: componentRef(c.componentId),
          path: `components[${parent.componentId}].properties.construction.sleeve_type`,
          message: `${c.displayName} sits on ${parent.displayName}, which is sleeveless — a sleeveless armhole has no cuff`,
          resolution: `Remove ${c.displayName}, or choose a sleeve type for ${parent.displayName}`,
        });
    }
    return out;
  },
};

/** Sided components come in pairs (a left sleeve without a right one is usually a mistake). */
export const sidedPairs: DesignRule = {
  id: 'dependency.sided_pair',
  version: '1.0.0',
  category: 'dependency',
  appliesTo: '*',
  evaluate(state, ctx) {
    const out: RuleFinding[] = [];
    for (const c of state.components) {
      if (c.side !== 'left' && c.side !== 'right') continue;
      if (ctx.catalog.componentTypes.get(c.componentType)?.repeatability !== 'sided') continue;
      const other = c.side === 'left' ? 'right' : 'left';
      const parentType = c.parentComponentId
        ? ctx.componentById.get(c.parentComponentId)?.componentType
        : undefined;
      const twin = state.components.some(
        (x) =>
          x.componentType === c.componentType &&
          x.side === other &&
          (parentType === undefined ||
            (x.parentComponentId !== null &&
              ctx.componentById.get(x.parentComponentId)?.componentType === parentType)),
      );
      if (!twin)
        out.push({
          outcome: 'warning',
          entity: componentRef(c.componentId),
          message: `${c.displayName} has no ${other} counterpart`,
          resolution: `Add the ${other} ${human(c.componentType)}, or confirm the asymmetry is intended`,
        });
    }
    return out;
  },
};

/** Options that exclude each other on the same garment (SPEC-003 §15.2 "mutually exclusive"). */
export const collarOrHood: DesignRule = {
  id: 'exclusive.collar_and_hood',
  version: '1.0.0',
  category: 'mutually_exclusive',
  appliesTo: '*',
  evaluate(state) {
    const collars = state.components.filter(
      (c) =>
        c.componentType === 'collar' && c.properties['construction.collar_type']?.value !== 'none',
    );
    const hood = state.components.find((c) => c.componentType === 'hood');
    if (!hood || !collars.length) return [];
    return [
      {
        outcome: 'warning',
        entity: componentRef(hood.componentId),
        message: `${hood.displayName} and ${collars.map((c) => c.displayName).join(', ')} both finish the neckline`,
        resolution: 'Keep either the collar or the hood, or set the collar type to "none"',
      },
    ];
  },
};
