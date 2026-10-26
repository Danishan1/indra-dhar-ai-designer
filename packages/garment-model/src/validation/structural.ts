import {
  allowedPropertyKeys,
  defaultCatalog,
  isEnumValueAllowed,
  type Catalog,
} from '../registry/catalog.js';
import type { DesignComponent } from '../schema/component.js';
import { garmentDesignStateSchema, type GarmentDesignState } from '../schema/design-state.js';
import type { EntityRef } from '../schema/entity-ref.js';
import type { FindingOutcome, ValidationFinding } from '../schema/finding.js';
import { hasBlockingFindings } from '../schema/finding.js';
import { dataTypeValueSchemas, type PropertyValue } from '../schema/property-value.js';
import { unitKind } from '../units.js';

export interface ValidateOptions {
  /**
   * Artifact revision ids known to exist (the caller resolves them, e.g. via the artifact service).
   * When given, bindings and relationship endpoints that point elsewhere are errors.
   */
  knownArtifactRevisions?: ReadonlySet<string>;
}

export interface ValidationResult {
  /** No blocking (`error`) findings. Structural validity says nothing about manufacturing feasibility (CST-006). */
  ok: boolean;
  /** The parsed state (defaults applied), or null when the shape itself is invalid. */
  state: GarmentDesignState | null;
  findings: ValidationFinding[];
}

const comp = (id: string): EntityRef => ({ entityType: 'design_component', entityId: id });
const rel = (id: string): EntityRef => ({ entityType: 'relationship', entityId: id });

class Findings {
  readonly list: ValidationFinding[] = [];
  add(
    ruleId: string,
    outcome: FindingOutcome,
    entity: EntityRef | null,
    message: string,
    opts: { path?: string; resolution?: string } = {},
  ): void {
    this.list.push({
      ruleId,
      outcome,
      entity,
      message,
      path: opts.path ?? null,
      resolution: opts.resolution ?? null,
    });
  }
}

const KEY = (e: EntityRef) => `${e.entityType}:${e.entityId}`;

function checkValue(
  catalog: Catalog,
  c: DesignComponent,
  key: string,
  pv: PropertyValue,
  out: Findings,
): void {
  const path = `components[${c.componentId}].properties.${key}`;
  const entity = comp(c.componentId);
  const def = catalog.properties.get(key);

  if (!def) {
    if (key.startsWith('ext.')) {
      out.add(
        'property.unregistered_extension',
        'warning',
        entity,
        `"${key}" is not a registered extension property; it is kept but not checked`,
        { path },
      );
    } else {
      out.add('property.unknown', 'error', entity, `"${key}" is not a known property`, {
        path,
        resolution: 'Use a registered property or an ext.* extension key',
      });
    }
    return;
  }

  if (!allowedPropertyKeys(catalog, c.componentType).includes(key)) {
    out.add(
      'property.not_allowed_for_type',
      'error',
      entity,
      `${def.label} does not apply to a ${c.componentType.replaceAll('_', ' ')}`,
      { path },
    );
  }

  if (pv.value !== null) {
    if (def.dataType === 'enum') {
      if (typeof pv.value !== 'string' || !isEnumValueAllowed(catalog, key, pv.value)) {
        out.add(
          'property.enum_value_not_allowed',
          'error',
          entity,
          `${def.label}: "${String(pv.value)}" is not an allowed option`,
          { path, resolution: 'Pick a listed option or register an extension value' },
        );
      }
    } else {
      const parsed = dataTypeValueSchemas[def.dataType].safeParse(pv.value);
      if (!parsed.success) {
        out.add(
          'property.invalid_value',
          'error',
          entity,
          `${def.label}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`,
          { path },
        );
      } else if (typeof pv.value === 'number') {
        if (
          (def.min !== undefined && pv.value < def.min) ||
          (def.max !== undefined && pv.value > def.max)
        ) {
          out.add(
            'property.out_of_range',
            'error',
            entity,
            `${def.label} must be between ${String(def.min ?? '−∞')} and ${String(def.max ?? '∞')}`,
            { path },
          );
        }
      }
    }
    if (def.unitKind !== null) {
      if (pv.unit === null) {
        out.add('property.unit_missing', 'error', entity, `${def.label} needs a unit`, {
          path,
          resolution: 'Choose mm, cm or in (or gsm for fabric weight)',
        });
      } else if (unitKind(pv.unit) !== def.unitKind) {
        out.add(
          'property.unit_mismatch',
          'error',
          entity,
          `${def.label} cannot be measured in ${pv.unit}`,
          { path },
        );
      }
    } else if (pv.unit !== null) {
      out.add('property.unit_unexpected', 'error', entity, `${def.label} has no unit`, { path });
    }
  }

  if (def.manufacturingCritical) {
    if (pv.status === 'confirmed' && pv.sourceRefs.length === 0) {
      out.add(
        'property.critical_unevidenced',
        'warning',
        entity,
        `${def.label} is confirmed without a recorded source`,
        { path, resolution: 'Attach the evidence (reference, document or measurement)' },
      );
    }
    if (
      (pv.status === 'proposed' || pv.status === 'inferred' || pv.status === 'needs_review') &&
      !pv.reviewRequired
    ) {
      out.add(
        'property.critical_needs_review',
        'warning',
        entity,
        `${def.label} is not confirmed and must stay marked for review`,
        { path },
      );
    }
    if (pv.sourceType === 'ai_generation' && pv.status === 'inferred') {
      out.add(
        'property.ai_generation_critical',
        'error',
        entity,
        `${def.label} cannot be inferred from a generated picture`,
        { path, resolution: 'Mark it proposed and have a person confirm it' },
      );
    }
  }
}

function checkComponents(
  catalog: Catalog,
  state: GarmentDesignState,
  opts: ValidateOptions,
  out: Findings,
): void {
  const byId = new Map(state.components.map((c) => [c.componentId, c]));
  const category = state.garmentCategory
    ? catalog.categories.get(state.garmentCategory)
    : undefined;

  if (
    state.components.length > 0 &&
    !state.components.some((c) => c.componentType === 'garment_body')
  ) {
    out.add('design.no_body', 'warning', null, 'The design has no garment body component');
  }
  const bodies = state.components.filter((c) => c.componentType === 'garment_body');
  if (bodies.length > 1) {
    for (const b of bodies.slice(1))
      out.add(
        'design.multiple_bodies',
        'error',
        comp(b.componentId),
        'A design has exactly one garment body',
      );
  }

  const seen = new Set<string>();
  const bindingIds = new Set<string>();
  const slotCounts = new Map<string, number>();

  for (const c of state.components) {
    const entity = comp(c.componentId);
    if (seen.has(c.componentId))
      out.add('id.duplicate', 'error', entity, `Component id ${c.componentId} is used twice`);
    seen.add(c.componentId);

    const def = catalog.componentTypes.get(c.componentType);
    if (!def) {
      out.add(
        'component.type_unknown',
        'error',
        entity,
        `"${c.componentType}" is not a registered component type`,
        { resolution: 'Use a catalog type or "custom"' },
      );
    } else {
      if (
        category &&
        def.garmentCategories !== '*' &&
        !def.garmentCategories.includes(category.key)
      ) {
        out.add(
          'component.type_not_typical',
          'warning',
          entity,
          `${def.label} is not usual for a ${category.label.toLowerCase()}`,
        );
      }
      // Parent rules.
      if (c.parentComponentId === null) {
        if (!def.rootAllowed)
          out.add(
            'component.root_not_allowed',
            'error',
            entity,
            `${def.label} must sit under another component`,
          );
      } else if (c.parentComponentId === c.componentId) {
        out.add('component.parent_self', 'error', entity, 'A component cannot be its own parent');
      } else {
        const parent = byId.get(c.parentComponentId);
        if (!parent) {
          out.add(
            'component.parent_missing',
            'error',
            entity,
            `Parent ${c.parentComponentId} does not exist`,
          );
        } else if (
          def.allowedParents !== '*' &&
          !def.allowedParents.includes(parent.componentType)
        ) {
          out.add(
            'component.parent_not_allowed',
            'error',
            entity,
            `${def.label} cannot sit under a ${parent.componentType.replaceAll('_', ' ')}`,
          );
        }
      }
      // Repeatability.
      const slot = `${def.type}|${c.parentComponentId ?? ''}|${def.repeatability === 'sided' ? c.side : ''}`;
      const n = (slotCounts.get(slot) ?? 0) + 1;
      slotCounts.set(slot, n);
      if (def.repeatability === 'single' && n > 1) {
        out.add(
          'component.duplicate_single',
          'error',
          entity,
          `There can be only one ${def.label.toLowerCase()} here`,
        );
      }
      if (def.repeatability === 'sided') {
        if (c.side === 'none')
          out.add(
            'component.side_missing',
            'warning',
            entity,
            `${def.label} needs a side (left, right or center)`,
          );
        else if (n > 1)
          out.add(
            'component.duplicate_sided',
            'error',
            entity,
            `There is already a ${c.side} ${def.label.toLowerCase()} here`,
          );
      }
    }

    for (const key of Object.keys(c.properties).sort()) {
      checkValue(catalog, c, key, c.properties[key] as PropertyValue, out);
    }

    for (const b of c.artifactBindings) {
      if (bindingIds.has(b.bindingId))
        out.add('id.duplicate', 'error', entity, `Binding id ${b.bindingId} is used twice`);
      bindingIds.add(b.bindingId);
      if (opts.knownArtifactRevisions && !opts.knownArtifactRevisions.has(b.artifactRevisionId)) {
        out.add(
          'binding.revision_unknown',
          'error',
          entity,
          `Artifact revision ${b.artifactRevisionId} does not exist`,
          {
            path: `components[${c.componentId}].artifactBindings`,
            resolution: 'Pin an existing artifact revision',
          },
        );
      }
    }
  }

  // Parent cycles (each cycle reported once, on its smallest id).
  const reported = new Set<string>();
  for (const c of state.components) {
    const path: string[] = [];
    let cur: DesignComponent | undefined = c;
    while (cur && !path.includes(cur.componentId)) {
      path.push(cur.componentId);
      cur = cur.parentComponentId ? byId.get(cur.parentComponentId) : undefined;
    }
    if (cur && cur.parentComponentId !== null) {
      const cycle = path.slice(path.indexOf(cur.componentId));
      const first = [...cycle].sort()[0] as string;
      if (cycle.length > 1 && !reported.has(first)) {
        reported.add(first);
        out.add('component.parent_cycle', 'error', comp(first), 'Components form a parent loop');
      }
    }
  }
}

function checkRelationships(
  catalog: Catalog,
  state: GarmentDesignState,
  opts: ValidateOptions,
  out: Findings,
): void {
  const componentIds = new Set(state.components.map((c) => c.componentId));
  const relationshipIds = new Set(state.relationships.map((r) => r.relationshipId));
  const constraintIds = new Set(state.constraints.map((c) => c.constraintId));
  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  const perTarget = new Map<string, number>();
  const dupes = new Set<string>();

  const endpointExists = (e: EntityRef): boolean => {
    switch (e.entityType) {
      case 'design_component':
        return componentIds.has(e.entityId);
      case 'relationship':
        return relationshipIds.has(e.entityId);
      case 'constraint':
        return constraintIds.has(e.entityId);
      case 'artifact_revision':
        return opts.knownArtifactRevisions ? opts.knownArtifactRevisions.has(e.entityId) : true;
      default:
        return true; // design_revision / asset are owned by other modules
    }
  };

  for (const r of state.relationships) {
    const entity = rel(r.relationshipId);
    if (seen.has(r.relationshipId))
      out.add('id.duplicate', 'error', entity, `Relationship id ${r.relationshipId} is used twice`);
    seen.add(r.relationshipId);

    const def = catalog.relationshipTypes.get(r.type);
    if (!def) {
      out.add(
        'relationship.type_unknown',
        'error',
        entity,
        `"${r.type}" is not a registered relationship type`,
      );
      continue;
    }
    for (const [which, e, allowed] of [
      ['source', r.source, def.allowedSources],
      ['target', r.target, def.allowedTargets],
    ] as const) {
      if (!allowed.includes(e.entityType)) {
        out.add(
          'relationship.endpoint_type_not_allowed',
          'error',
          entity,
          `A "${def.label}" ${which} cannot be a ${e.entityType.replaceAll('_', ' ')}`,
        );
      } else if (!endpointExists(e)) {
        out.add(
          'relationship.endpoint_missing',
          'error',
          entity,
          `The ${which} ${e.entityId} does not exist`,
          { resolution: 'Remove the relationship or point it at an existing entity' },
        );
      }
    }
    if (KEY(r.source) === KEY(r.target))
      out.add(
        'relationship.self_reference',
        'error',
        entity,
        'A relationship cannot point at itself',
      );
    if (def.sameKind && r.source.entityType !== r.target.entityType) {
      out.add(
        'relationship.kind_mismatch',
        'error',
        entity,
        `"${def.label}" links two things of the same kind`,
      );
    }
    if (def.requiresPlacement && r.placement === null) {
      out.add(
        'relationship.placement_required',
        'error',
        entity,
        `"${def.label}" needs a placement`,
        { resolution: 'Set where it sits on the target' },
      );
    }
    if (r.placement?.approximate) {
      out.add(
        'relationship.placement_approximate',
        'warning',
        entity,
        'The placement is an approximation, not a production-valid attachment',
        { path: `relationships[${r.relationshipId}].placement` },
      );
    }
    if (r.status === 'proposed' || r.status === 'inferred' || r.status === 'needs_review') {
      out.add(
        'relationship.needs_review',
        'requires_manual_review',
        entity,
        `This ${def.label.toLowerCase()} relationship is ${r.status.replace('_', ' ')} and needs a person to confirm it`,
      );
    }
    for (const cid of r.constraints) {
      if (!constraintIds.has(cid))
        out.add(
          'relationship.constraint_missing',
          'error',
          entity,
          `Constraint ${cid} does not exist`,
        );
    }

    if (def.maxPerSource !== undefined) {
      const k = `${r.type}|${KEY(r.source)}`;
      const n = (perSource.get(k) ?? 0) + 1;
      perSource.set(k, n);
      if (n > def.maxPerSource)
        out.add(
          'relationship.cardinality_source',
          'error',
          entity,
          `A source can have at most ${String(def.maxPerSource)} "${def.label}" relationship`,
        );
    }
    if (def.maxPerTarget !== undefined) {
      const k = `${r.type}|${KEY(r.target)}`;
      const n = (perTarget.get(k) ?? 0) + 1;
      perTarget.set(k, n);
      if (n > def.maxPerTarget)
        out.add(
          'relationship.cardinality_target',
          'error',
          entity,
          `A target can have at most ${String(def.maxPerTarget)} "${def.label}" relationship`,
        );
    }
    const ends = def.symmetric
      ? [KEY(r.source), KEY(r.target)].sort().join('>')
      : `${KEY(r.source)}>${KEY(r.target)}`;
    const dk = `${r.type}|${ends}`;
    if (dupes.has(dk))
      out.add(
        'relationship.duplicate',
        'warning',
        entity,
        'The same relationship is already defined',
      );
    dupes.add(dk);
  }
  const cseen = new Set<string>();
  for (const c of state.constraints) {
    if (cseen.has(c.constraintId))
      out.add('id.duplicate', 'error', null, `Constraint id ${c.constraintId} is used twice`);
    cseen.add(c.constraintId);
  }
}

/**
 * Structural validation (type safety, references, hierarchy, units, evidence rules). Business
 * constraint sets are I20; passing here never implies manufacturing feasibility (CST-006).
 * Findings are deterministic: same state and catalog → same list.
 */
export function validateDesignState(
  input: unknown,
  catalog: Catalog = defaultCatalog,
  opts: ValidateOptions = {},
): ValidationResult {
  const parsed = garmentDesignStateSchema.safeParse(input);
  const out = new Findings();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      out.add('schema.invalid', 'error', null, issue.message, {
        path: issue.path.map(String).join('.'),
      });
    }
    return { ok: false, state: null, findings: out.list };
  }
  const state = parsed.data;

  if (state.garmentCategory !== null) {
    const cat = catalog.categories.get(state.garmentCategory);
    if (!cat)
      out.add(
        'category.unknown',
        'error',
        null,
        `"${state.garmentCategory}" is not a registered garment category`,
      );
    else if (cat.garmentType !== state.garmentType) {
      out.add(
        'category.type_mismatch',
        'error',
        null,
        `${cat.label} belongs to garment type "${cat.garmentType}", not "${state.garmentType}"`,
      );
    }
  }
  checkComponents(catalog, state, opts, out);
  checkRelationships(catalog, state, opts, out);

  return { ok: !hasBlockingFindings(out.list), state, findings: out.list };
}
