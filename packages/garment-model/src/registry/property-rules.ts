/**
 * Dependency rules between properties (FR-EDT-033): when one value makes another property irrelevant,
 * the editor disables it with a reason, and a value that is still set there is reported as a conflict
 * to resolve (never changed automatically — PROP-005). Data-driven so categories can add rules.
 */
import type { DesignComponent } from '../schema/component.js';
import type { GarmentDesignState } from '../schema/design-state.js';
import type { PropertyValue } from '../schema/property-value.js';
import { convertLength, isLengthUnit } from '../units.js';

export interface PropertyRuleContext {
  component: DesignComponent;
  parent: DesignComponent | null;
}

export interface PropertyRule {
  id: string;
  /** Component type the affected property belongs to. */
  componentType: string;
  /** Affected property keys (`*` = every property of the component). */
  keys: readonly string[] | '*';
  /** True when the rule applies (the properties are not relevant). */
  when: (ctx: PropertyRuleContext) => boolean;
  reason: string;
}

export interface PropertyRuleResult {
  ruleId: string;
  key: string;
  reason: string;
}

export interface PropertyConflict extends PropertyRuleResult {
  /** The value that is still set although the property no longer applies. */
  value: unknown;
}

const valueOf = (c: DesignComponent | null, key: string): unknown =>
  c?.properties[key]?.value ?? null;

/** Length in mm, or null when unset. */
export function lengthMm(pv: PropertyValue | undefined): number | null {
  if (!pv || typeof pv.value !== 'number') return null;
  return pv.unit && isLengthUnit(pv.unit) ? convertLength(pv.value, pv.unit, 'mm') : pv.value;
}

/** Below this sleeve length, a sleeve is short and has no cuff (renderer and rules agree). */
export const SHORT_SLEEVE_MAX_MM = 350;

export const PROPERTY_RULES: readonly PropertyRule[] = Object.freeze([
  {
    id: 'sleeveless.no_length',
    componentType: 'sleeve',
    keys: ['dimension.sleeve_length'],
    when: ({ component }) => valueOf(component, 'construction.sleeve_type') === 'sleeveless',
    reason: 'A sleeveless armhole has no sleeve length',
  },
  {
    id: 'cuff.sleeveless',
    componentType: 'cuff',
    keys: '*',
    when: ({ parent }) => valueOf(parent, 'construction.sleeve_type') === 'sleeveless',
    reason: 'The sleeve is sleeveless, so it has no cuff',
  },
  {
    id: 'cuff.short_sleeve',
    componentType: 'cuff',
    keys: ['construction.cuff_type', 'dimension.cuff_width'],
    when: ({ parent }) => {
      const mm = lengthMm(parent?.properties['dimension.sleeve_length']);
      return mm !== null && mm < SHORT_SLEEVE_MAX_MM;
    },
    reason: `Short sleeves (under ${SHORT_SLEEVE_MAX_MM / 10} cm) are not cuffed`,
  },
  {
    id: 'placket.no_buttons',
    componentType: 'placket',
    keys: ['construction.button_count'],
    when: ({ component }) => {
      const closure = valueOf(component, 'construction.closure_type');
      return closure === 'zip' || closure === 'none';
    },
    reason: 'Only buttons and snaps are counted',
  },
  {
    id: 'placket.none',
    componentType: 'placket',
    keys: ['dimension.placket_width', 'construction.closure_type', 'construction.button_count'],
    when: ({ component }) => valueOf(component, 'construction.placket_type') === 'none',
    reason: 'There is no placket',
  },
  {
    id: 'pocket.none',
    componentType: 'pocket',
    keys: ['placement.pocket_position'],
    when: ({ component }) => valueOf(component, 'construction.pocket_type') === 'none',
    reason: 'There is no pocket to place',
  },
  {
    id: 'collar.none',
    componentType: 'collar',
    keys: ['dimension.collar_height'],
    when: ({ component }) => valueOf(component, 'construction.collar_type') === 'none',
    reason: 'There is no collar',
  },
] satisfies PropertyRule[]);

/**
 * Which properties of `component` do not apply, and which of those still hold a value (conflicts).
 * The first matching rule per key wins.
 */
export function evaluatePropertyRules(
  state: Pick<GarmentDesignState, 'components'>,
  component: DesignComponent,
  rules: readonly PropertyRule[] = PROPERTY_RULES,
): { disabled: Map<string, PropertyRuleResult>; conflicts: PropertyConflict[] } {
  const parent =
    state.components.find((c) => c.componentId === component.parentComponentId) ?? null;
  const disabled = new Map<string, PropertyRuleResult>();
  for (const rule of rules) {
    if (rule.componentType !== component.componentType) continue;
    if (!rule.when({ component, parent })) continue;
    const keys = rule.keys === '*' ? Object.keys(component.properties) : rule.keys;
    for (const key of keys)
      if (!disabled.has(key)) disabled.set(key, { ruleId: rule.id, key, reason: rule.reason });
  }
  const conflicts: PropertyConflict[] = [];
  for (const r of disabled.values()) {
    const pv = component.properties[r.key];
    if (pv && pv.value !== null && pv.status !== 'not_applicable')
      conflicts.push({ ...r, value: pv.value });
  }
  return { disabled, conflicts };
}
