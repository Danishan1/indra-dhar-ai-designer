import { sha256Hex } from '../canonical/hash.js';
import { type Catalog, defaultCatalog } from '../registry/catalog.js';
import type { GarmentCategoryDef } from '../registry/garment-categories.js';
import type { DesignComponent } from '../schema/component.js';
import { type GarmentDesignState, SCHEMA_VERSION } from '../schema/design-state.js';
import type { EntityRef } from '../schema/entity-ref.js';
import type { FindingOutcome, ValidationFinding } from '../schema/finding.js';

import { validateDesignState } from './structural.js';

/**
 * Design-structure validation engine (I20, SPEC-003 §15). Pure and deterministic: the same state and
 * the same constraint-set version always give the same findings in the same order (CST-004). It
 * checks the *design structure* only — passing it never means production readiness (CST-006).
 */

/** How much a finding matters (CST-003): blocking errors, warnings, informative notes. */
export const FindingSeverities = ['blocking', 'warning', 'info'] as const;
export type FindingSeverity = (typeof FindingSeverities)[number];

/** What a rule looks at (SPEC-003 §15.2). */
export type RuleCategory =
  | 'type_compatibility'
  | 'dependency'
  | 'geometric_bounds'
  | 'required_property'
  | 'mutually_exclusive'
  | 'material_compatibility'
  | 'rendering_capability'
  | 'relationship'
  | 'unconfirmed_values'
  | 'structural';

/** A finding as a rule reports it (the engine adds ids, severity and versions). */
export interface RuleFinding {
  outcome: FindingOutcome;
  entity: EntityRef | null;
  message: string;
  resolution?: string | null;
  path?: string | null;
  /** Overrides the default severity of the outcome (e.g. an informative warning). */
  severity?: FindingSeverity;
}

export interface RuleContext {
  catalog: Catalog;
  /** The garment category definition, when the design has a registered one. */
  category: GarmentCategoryDef | null;
  /** Typical/limit ranges of the constraint set for this garment type. */
  ranges: Readonly<Record<string, DimensionRange>>;
  componentById: ReadonlyMap<string, DesignComponent>;
}

export interface DesignRule {
  /** Stable id, e.g. `dependency.cuff_requires_sleeve`. */
  id: string;
  /** Bumped whenever the rule's behaviour changes. */
  version: string;
  category: RuleCategory;
  /** Garment types the rule applies to (`*` = all). */
  appliesTo: readonly string[] | '*';
  evaluate(state: GarmentDesignState, ctx: RuleContext): RuleFinding[];
}

/** mm. Outside `typical` is a warning; outside `limits` a blocking error. */
export interface DimensionRange {
  typical: readonly [number, number];
  limits: readonly [number, number];
}

export interface ConstraintSet {
  key: string;
  version: string;
  label: string;
  /** Garment types it covers (`*` = all). */
  garmentTypes: readonly string[] | '*';
  rules: readonly DesignRule[];
  /** Dimension ranges per garment type, keyed by property key. */
  ranges: Readonly<Record<string, Readonly<Record<string, DimensionRange>>>>;
}

export interface DesignFinding extends ValidationFinding {
  /** Stable id: same rule + entity + path ⇒ same id across runs. */
  findingId: string;
  severity: FindingSeverity;
  ruleVersion: string;
  category: RuleCategory;
}

export interface FindingCounts {
  errors: number;
  warnings: number;
  manualReview: number;
  info: number;
}

export interface DesignValidationReport {
  constraintSet: { key: string; version: string };
  /** `design-structure@1.0.0` — recorded with every run and revision (CST-004). */
  constraintSetRef: string;
  findings: DesignFinding[];
  counts: FindingCounts;
  /** Rules that ran, as `id@version`. */
  evaluatedRules: string[];
  /** The state's shape is invalid: only schema findings, nothing else could be checked. */
  shapeInvalid: boolean;
}

export const defaultSeverity = (outcome: FindingOutcome): FindingSeverity =>
  outcome === 'error'
    ? 'blocking'
    : outcome === 'warning' || outcome === 'requires_manual_review'
      ? 'warning'
      : 'info';

export function findingIdOf(f: Pick<ValidationFinding, 'ruleId' | 'entity' | 'path'>): string {
  const entity = f.entity ? `${f.entity.entityType}:${f.entity.entityId}` : '-';
  return `vf_${sha256Hex(`${f.ruleId}|${entity}|${f.path ?? ''}`).slice(-16)}`;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { blocking: 0, warning: 1, info: 2 };

function compareFindings(a: DesignFinding, b: DesignFinding): number {
  return (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
    (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0)
  );
}

export function countFindings(findings: readonly DesignFinding[]): FindingCounts {
  const c: FindingCounts = { errors: 0, warnings: 0, manualReview: 0, info: 0 };
  for (const f of findings) {
    if (f.outcome === 'requires_manual_review') c.manualReview++;
    else if (f.severity === 'blocking') c.errors++;
    else if (f.severity === 'warning') c.warnings++;
    else c.info++;
  }
  return c;
}

const appliesTo = (list: readonly string[] | '*', garmentType: string) =>
  list === '*' || list.includes(garmentType);

/**
 * Runs the structural checks (schema, references, units — `validateDesignState`) and every rule of
 * the constraint set that applies to the garment type. Findings carry a stable id, severity and the
 * rule version; the list is sorted (severity, rule, id) so equal inputs give equal output.
 */
export function runDesignValidation(
  input: unknown,
  constraintSet: ConstraintSet,
  catalog: Catalog = defaultCatalog,
): DesignValidationReport {
  const structural = validateDesignState(input, catalog);
  const out: DesignFinding[] = [];
  const push = (rule: Pick<DesignRule, 'id' | 'version' | 'category'>, f: RuleFinding) => {
    const base: ValidationFinding = {
      ruleId: rule.id,
      outcome: f.outcome,
      entity: f.entity,
      path: f.path ?? null,
      message: f.message,
      resolution: f.resolution ?? null,
    };
    out.push({
      ...base,
      findingId: findingIdOf(base),
      severity: f.severity ?? defaultSeverity(f.outcome),
      ruleVersion: rule.version,
      category: rule.category,
    });
  };
  for (const f of structural.findings)
    push(
      { id: f.ruleId, version: SCHEMA_VERSION, category: 'structural' },
      {
        outcome: f.outcome,
        entity: f.entity,
        message: f.message,
        resolution: f.resolution,
        path: f.path,
      },
    );

  const evaluated: string[] = [];
  const state = structural.state;
  if (state) {
    const category = state.garmentCategory
      ? (catalog.categories.get(state.garmentCategory) ?? null)
      : null;
    const ctx: RuleContext = {
      catalog,
      category,
      ranges: constraintSet.ranges[state.garmentType] ?? {},
      componentById: new Map(state.components.map((c) => [c.componentId, c])),
    };
    for (const rule of constraintSet.rules) {
      if (!appliesTo(rule.appliesTo, state.garmentType)) continue;
      evaluated.push(`${rule.id}@${rule.version}`);
      for (const f of rule.evaluate(state, ctx)) push(rule, f);
    }
  }

  // One finding per id (a rule may meet the same entity twice).
  const unique = [...new Map(out.map((f) => [f.findingId, f])).values()].sort(compareFindings);
  return {
    constraintSet: { key: constraintSet.key, version: constraintSet.version },
    constraintSetRef: `${constraintSet.key}@${constraintSet.version}`,
    findings: unique,
    counts: countFindings(unique),
    evaluatedRules: evaluated,
    shapeInvalid: state === null,
  };
}
