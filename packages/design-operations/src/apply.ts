import {
  allowedPropertyKeys,
  type ArtifactDefinition,
  type Catalog,
  checkCompatibility,
  createBindingId,
  createComponentId,
  createRelationshipId,
  defaultCatalog,
  type DesignComponent,
  type DesignRelationship,
  type EntityRef,
  type GarmentDesignState,
  GarmentModelError,
  type GeometryCapability,
  isLengthUnit,
  missingValue,
  notApplicableValue,
  type Placement,
  promote,
  type PropertyValue,
  type RandomBytes,
  readAnyVersion,
  toCanonicalLength,
  validateDesignState,
  type ValidationFinding,
} from '@ai-designer/garment-model';

import { applyEntityPatch, diffEntities, type EntityPatch } from './patch.js';
import type { Operation, PlacementRequest } from './schema.js';

/** What the server resolved about an artifact revision the operation names (access already checked). */
export interface ArtifactRevisionInfo {
  artifactRevisionId: string;
  artifactId: string;
  category: string;
  definition: ArtifactDefinition;
  geometryCapability: GeometryCapability;
  /** False for deactivated/deprecated artifacts: existing pins stay, new uses are refused. */
  active: boolean;
  /** Display name (provenance notes). */
  name?: string;
  /** Visual property values the artifact states (copied as proposals when attached, I18). */
  visual?: Readonly<Record<string, PropertyValue>>;
}

/** Categories whose artifacts define a component's design (their visual values are applied). */
export const COMPONENT_ARTIFACT_CATEGORIES: ReadonlySet<string> = new Set([
  'sleeve',
  'collar',
  'cuff',
  'pocket',
  'placket',
  'neckline',
  'fabric',
]);

export interface ApplyContext {
  /** The person the change is attributed to (confirmations are stamped with it). */
  actorUserId: string;
  /** ISO time stamped on confirmations. */
  now: string;
  /** Recorded as provenance on relationships this operation creates (REL-007). */
  operationId?: string | null;
  artifacts?: ReadonlyMap<string, ArtifactRevisionInfo>;
  randomBytes?: RandomBytes;
  catalog?: Catalog;
}

export type ApplyResult =
  | {
      ok: true;
      state: GarmentDesignState;
      /** The operation with generated ids filled in — store and replay this one. */
      operation: Operation;
      changed: EntityRef[];
      before: EntityPatch;
      after: EntityPatch;
      /** Non-blocking findings (warnings, manual review). */
      findings: ValidationFinding[];
    }
  | { ok: false; findings: ValidationFinding[] };

class Blocked extends Error {
  constructor(readonly findings: ValidationFinding[]) {
    super('blocked');
  }
}

const finding = (
  ruleId: string,
  message: string,
  entity: EntityRef | null = null,
  outcome: ValidationFinding['outcome'] = 'error',
  resolution: string | null = null,
): ValidationFinding => ({ ruleId, outcome, entity, path: null, message, resolution });

const comp = (id: string): EntityRef => ({ entityType: 'design_component', entityId: id });
const relRef = (id: string): EntityRef => ({ entityType: 'relationship', entityId: id });

/** Artifact categories that sit ON a component and therefore get a placed relationship. */
const PLACED_RELATIONSHIP: Record<string, DesignRelationship['type']> = {
  lace: 'decorative_trim_applied_to',
  trim: 'decorative_trim_applied_to',
  embroidery: 'embroidery_placed_on',
  artwork: 'applied_to',
  button: 'applied_to',
};

class Applier {
  readonly warnings: ValidationFinding[] = [];
  readonly catalog: Catalog;

  constructor(
    readonly state: GarmentDesignState,
    readonly ctx: ApplyContext,
  ) {
    this.catalog = ctx.catalog ?? defaultCatalog;
  }

  component(id: string): DesignComponent {
    const c = this.state.components.find((x) => x.componentId === id);
    if (!c)
      throw new Blocked([
        finding('operation.target_missing', `Component ${id} does not exist`, comp(id)),
      ]);
    return c;
  }

  relationship(id: string): DesignRelationship {
    const r = this.state.relationships.find((x) => x.relationshipId === id);
    if (!r)
      throw new Blocked([
        finding('operation.target_missing', `Relationship ${id} does not exist`, relRef(id)),
      ]);
    return r;
  }

  artifact(revisionId: string, target: EntityRef): ArtifactRevisionInfo {
    const info = this.ctx.artifacts?.get(revisionId);
    if (!info)
      throw new Blocked([
        finding(
          'operation.artifact_unknown',
          'The artifact revision does not exist or is not available to you',
          target,
        ),
      ]);
    return info;
  }

  propertyKeyAllowed(c: DesignComponent, key: string): void {
    if (key.startsWith('ext.')) return;
    if (!this.catalog.properties.has(key))
      throw new Blocked([
        finding('property.unknown', `"${key}" is not a known property`, comp(c.componentId)),
      ]);
    if (!allowedPropertyKeys(this.catalog, c.componentType).includes(key))
      throw new Blocked([
        finding(
          'property.not_allowed_for_type',
          `${key} does not apply to a ${c.componentType.replaceAll('_', ' ')}`,
          comp(c.componentId),
        ),
      ]);
  }

  compatibility(
    info: ArtifactRevisionInfo,
    c: DesignComponent,
    region: string | null,
    existingUses: number,
  ): void {
    if (!info.active)
      throw new Blocked([
        finding(
          'artifact.inactive',
          'This artifact is deactivated; existing designs keep it but it cannot be used again',
          comp(c.componentId),
        ),
      ]);
    const result = checkCompatibility(info.definition, info.geometryCapability, {
      componentType: c.componentType,
      region,
      existingUses,
    });
    const located = result.findings.map((f) => ({ ...f, entity: comp(c.componentId) }));
    if (!result.compatible) throw new Blocked(located);
    this.warnings.push(...located);
  }

  /** Approximate unless the component has boundary geometry and the artifact has outline geometry (REL-008). */
  placement(
    c: DesignComponent,
    info: ArtifactRevisionInfo | null,
    req: PlacementRequest | null,
  ): Placement {
    const def = info?.definition;
    const region = req?.region ?? def?.preferredPlacementRegions[0] ?? null;
    const mode = req?.mode ?? def?.placementModes[0] ?? null;
    const approximate =
      c.geometryRefs.length === 0 || (info !== null && info.geometryCapability === 'G0');
    return {
      region,
      anchor: req?.anchor ?? null,
      coordinateSpace: 'component_local',
      translation: null,
      rotationDeg: req?.rotationDeg ?? null,
      scale: req?.scale ?? null,
      orientation: mode === 'follow_boundary' ? 'follow_boundary' : null,
      offset:
        req?.offsetMm !== null && req?.offsetMm !== undefined
          ? { value: req.offsetMm, unit: 'mm' }
          : null,
      geometryRevisionId: c.geometryRefs[0]?.geometryRevisionId ?? null,
      calibrationRef: null,
      approximate,
      confidence: null,
    };
  }

  /**
   * Applies what a component/fabric artifact states to the component (I18): its visual values become
   * proposals sourced from the artifact revision (never confirmed automatically — a person's confirmed
   * value is kept and reported); a fabric becomes the component's `material.fabric_ref`.
   */
  applyArtifactValues(
    c: DesignComponent,
    info: ArtifactRevisionInfo,
    replaced: string | null,
  ): void {
    if (!COMPONENT_ARTIFACT_CATEGORIES.has(info.category)) return;
    const allowed = new Set(allowedPropertyKeys(this.catalog, c.componentType));
    const ref = {
      sourceType: 'artifact_revision' as const,
      entityId: info.artifactId,
      revisionId: info.artifactRevisionId,
      note: info.name ?? null,
    };
    const kept: string[] = [];
    for (const [key, pv] of Object.entries(info.visual ?? {})) {
      if (!allowed.has(key) || pv.value === null) continue;
      const current = c.properties[key];
      const fromReplaced =
        replaced !== null &&
        current?.sourceType === 'artifact_revision' &&
        current.sourceRefs.some((r) => r.revisionId === replaced);
      if (
        current?.status === 'confirmed' &&
        current.sourceType !== 'artifact_revision' &&
        !fromReplaced
      ) {
        if (JSON.stringify(current.value) !== JSON.stringify(pv.value)) kept.push(key);
        continue;
      }
      c.properties[key] = {
        value: pv.value,
        unit: pv.unit,
        status: 'proposed',
        sourceType: 'artifact_revision',
        sourceRefs: [ref],
        confidence: null,
        reviewRequired: true,
        confirmedBy: null,
        confirmedAt: null,
      };
    }
    if (info.category === 'fabric' && allowed.has('material.fabric_ref')) {
      const current = c.properties['material.fabric_ref']?.value as { entityId?: string } | null;
      if (
        replaced === null ||
        current?.entityId === replaced ||
        current === null ||
        current === undefined
      )
        c.properties['material.fabric_ref'] = this.stampedValue(
          {
            entityType: 'artifact_revision',
            entityId: info.artifactRevisionId,
            revisionId: info.artifactRevisionId,
          },
          null,
          'confirmed',
          info.name ?? null,
        );
    }
    if (kept.length)
      this.warnings.push(
        finding(
          'artifact.kept_confirmed_values',
          `Kept your confirmed ${kept.map((k) => (k.split('.')[1] ?? k).replaceAll('_', ' ')).join(', ')} (the artifact suggests different values)`,
          comp(c.componentId),
          'warning',
        ),
      );
  }

  approximateFinding(rel: DesignRelationship, c: DesignComponent): void {
    if (rel.placement?.approximate)
      this.warnings.push(
        finding(
          'placement.approximate',
          `${c.displayName} has no boundary geometry yet, so this placement is approximate and needs review`,
          relRef(rel.relationshipId),
          'requires_manual_review',
        ),
      );
  }

  stampedValue(
    value: unknown,
    unit: PropertyValue['unit'],
    status: 'confirmed' | 'proposed',
    note: string | null,
  ): PropertyValue {
    let v = value as PropertyValue['value'];
    let u = unit;
    // Lengths are stored in canonical millimetres (ADR-020).
    if (typeof v === 'number' && isLengthUnit(u)) ({ value: v, unit: u } = toCanonicalLength(v, u));
    const confirmed = status === 'confirmed';
    return {
      value: v,
      unit: u,
      status,
      sourceType: 'user_input',
      sourceRefs: [
        { sourceType: 'user_input', entityId: this.ctx.actorUserId, revisionId: null, note },
      ],
      confidence: null,
      reviewRequired: !confirmed,
      confirmedBy: confirmed ? this.ctx.actorUserId : null,
      confirmedAt: confirmed ? this.ctx.now : null,
    };
  }

  newComponent(
    id: string,
    type: string,
    name: string | undefined,
    parent: string | null,
    side: DesignComponent['side'],
  ): DesignComponent {
    const def = this.catalog.componentTypes.get(type);
    if (!def)
      throw new Blocked([
        finding('component.type_unknown', `"${type}" is not a registered component type`),
      ]);
    const properties: Record<string, PropertyValue> = {};
    for (const key of allowedPropertyKeys(this.catalog, type)) properties[key] = missingValue();
    return {
      componentId: id,
      componentType: type,
      displayName: name ?? def.defaultDisplayName,
      parentComponentId: parent,
      side,
      properties,
      artifactBindings: [],
      geometryRefs: [],
      assetRefs: [],
      tags: [],
      visible: true,
      locked: false,
    };
  }

  /** Applies one (normalized) operation to `this.state` in place (the state is a private clone). */
  apply(op: Operation): void {
    const s = this.state;
    switch (op.type) {
      case 'set_property': {
        const c = this.component(op.componentId);
        this.propertyKeyAllowed(c, op.key);
        if (op.value === null)
          throw new Blocked([
            finding(
              'operation.value_required',
              'Give a value, or clear the property instead',
              comp(c.componentId),
            ),
          ]);
        c.properties[op.key] = this.stampedValue(op.value, op.unit, op.status, op.note);
        return;
      }
      case 'reset_property': {
        const c = this.component(op.componentId);
        this.propertyKeyAllowed(c, op.key);
        c.properties[op.key] = missingValue();
        return;
      }
      case 'set_property_status': {
        const c = this.component(op.componentId);
        const pv = c.properties[op.key];
        if (!pv)
          throw new Blocked([
            finding(
              'operation.target_missing',
              `${op.key} is not set on ${c.displayName}`,
              comp(c.componentId),
            ),
          ]);
        try {
          if (op.action === 'confirm')
            c.properties[op.key] = promote(pv, {
              confirmedBy: this.ctx.actorUserId,
              confirmedAt: this.ctx.now,
            });
          else if (op.action === 'reject') c.properties[op.key] = missingValue();
          else if (op.action === 'not_applicable') c.properties[op.key] = notApplicableValue();
          else {
            if (pv.value === null)
              throw new Blocked([
                finding(
                  'operation.value_required',
                  'There is no value to review',
                  comp(c.componentId),
                ),
              ]);
            c.properties[op.key] = {
              ...pv,
              status: 'needs_review',
              reviewRequired: true,
              confirmedBy: null,
              confirmedAt: null,
            };
          }
        } catch (e) {
          if (e instanceof GarmentModelError)
            throw new Blocked([
              finding('property.promotion_refused', e.message, comp(c.componentId)),
            ]);
          throw e;
        }
        return;
      }
      case 'add_component': {
        const id = op.componentId as string;
        if (s.components.some((c) => c.componentId === id))
          throw new Blocked([
            finding('id.duplicate', `Component id ${id} is used already`, comp(id)),
          ]);
        if (op.parentComponentId) this.component(op.parentComponentId);
        s.components.push(
          this.newComponent(id, op.componentType, op.displayName, op.parentComponentId, op.side),
        );
        return;
      }
      case 'remove_component': {
        this.component(op.componentId);
        const removed = new Set([op.componentId]);
        for (let grew = true; grew;) {
          grew = false;
          for (const c of s.components)
            if (
              c.parentComponentId &&
              removed.has(c.parentComponentId) &&
              !removed.has(c.componentId)
            ) {
              removed.add(c.componentId);
              grew = true;
            }
        }
        const touching = s.relationships.filter(
          (r) =>
            (r.source.entityType === 'design_component' && removed.has(r.source.entityId)) ||
            (r.target.entityType === 'design_component' && removed.has(r.target.entityId)),
        );
        if (!op.cascade && (removed.size > 1 || touching.length > 0))
          throw new Blocked([
            finding(
              'operation.has_dependents',
              `Removing it also affects ${removed.size - 1} child component(s) and ${touching.length} relationship(s)`,
              comp(op.componentId),
              'error',
              'Remove them first, or remove with cascade',
            ),
          ]);
        const gone = new Set(touching.map((r) => r.relationshipId));
        s.components = s.components.filter((c) => !removed.has(c.componentId));
        s.relationships = s.relationships.filter((r) => !gone.has(r.relationshipId));
        return;
      }
      case 'set_component_visibility':
        this.component(op.componentId).visible = op.visible;
        return;
      case 'set_component_lock':
        this.component(op.componentId).locked = op.locked;
        return;
      case 'rename_component':
        this.component(op.componentId).displayName = op.displayName;
        return;
      case 'attach_artifact': {
        const c = this.component(op.componentId);
        const info = this.artifact(op.artifactRevisionId, comp(c.componentId));
        const uses = c.artifactBindings.filter((b) => b.artifactId === info.artifactId).length;
        this.compatibility(info, c, op.placement?.region ?? null, uses);
        c.artifactBindings.push({
          bindingId: op.bindingId as string,
          artifactId: info.artifactId,
          artifactRevisionId: info.artifactRevisionId,
          role: op.role ?? info.category,
        });
        this.applyArtifactValues(c, info, null);
        const relType = PLACED_RELATIONSHIP[info.category] ?? (op.placement ? 'applied_to' : null);
        if (relType) {
          const placement = this.placement(c, info, op.placement);
          if (placement.region !== null)
            this.compatibility({ ...info, active: true }, c, placement.region, 0);
          const rel: DesignRelationship = {
            relationshipId: op.relationshipId as string,
            type: relType,
            source: { entityType: 'artifact_revision', entityId: info.artifactRevisionId },
            target: comp(c.componentId),
            placement,
            constraints: [],
            status: placement.approximate ? 'needs_review' : 'confirmed',
            provenanceRefs: this.ctx.operationId ? [this.ctx.operationId] : [],
          };
          s.relationships.push(rel);
          this.approximateFinding(rel, c);
        }
        return;
      }
      case 'replace_artifact': {
        const c = this.component(op.componentId);
        const binding = c.artifactBindings.find((b) => b.bindingId === op.bindingId);
        if (!binding)
          throw new Blocked([
            finding(
              'operation.target_missing',
              `Binding ${op.bindingId} does not exist`,
              comp(c.componentId),
            ),
          ]);
        const info = this.artifact(op.artifactRevisionId, comp(c.componentId));
        const uses = c.artifactBindings.filter(
          (b) => b.artifactId === info.artifactId && b.bindingId !== binding.bindingId,
        ).length;
        this.compatibility(info, c, null, uses);
        const old = binding.artifactRevisionId;
        binding.artifactId = info.artifactId;
        binding.artifactRevisionId = info.artifactRevisionId;
        this.applyArtifactValues(c, info, old);
        for (const r of s.relationships) {
          if (
            r.source.entityType === 'artifact_revision' &&
            r.source.entityId === old &&
            r.target.entityId === c.componentId
          ) {
            if (r.placement?.region) this.compatibility(info, c, r.placement.region, 0);
            r.source = { entityType: 'artifact_revision', entityId: info.artifactRevisionId };
            if (r.placement)
              r.placement.approximate =
                c.geometryRefs.length === 0 || info.geometryCapability === 'G0';
          }
        }
        return;
      }
      case 'detach_artifact': {
        const c = this.component(op.componentId);
        const binding = c.artifactBindings.find((b) => b.bindingId === op.bindingId);
        if (!binding)
          throw new Blocked([
            finding(
              'operation.target_missing',
              `Binding ${op.bindingId} does not exist`,
              comp(c.componentId),
            ),
          ]);
        c.artifactBindings = c.artifactBindings.filter((b) => b.bindingId !== binding.bindingId);
        // The fabric reference goes with the binding; values copied from the artifact stay (they are
        // the design's own values now and can be edited or cleared like any other).
        const fabric = c.properties['material.fabric_ref']?.value as { entityId?: string } | null;
        if (fabric?.entityId === binding.artifactRevisionId)
          c.properties['material.fabric_ref'] = missingValue();
        const stillUsed = c.artifactBindings.some(
          (b) => b.artifactRevisionId === binding.artifactRevisionId,
        );
        if (!stillUsed)
          s.relationships = s.relationships.filter(
            (r) =>
              !(
                r.source.entityType === 'artifact_revision' &&
                r.source.entityId === binding.artifactRevisionId &&
                r.target.entityId === c.componentId
              ),
          );
        return;
      }
      case 'update_placement': {
        const r = this.relationship(op.relationshipId);
        const target =
          r.target.entityType === 'design_component' ? this.component(r.target.entityId) : null;
        const p: Placement =
          r.placement ??
          (target ? this.placement(target, null, null) : { ...this.placementFallback() });
        const next: Placement = {
          ...p,
          ...(op.placement.region !== undefined ? { region: op.placement.region } : {}),
          ...(op.placement.anchor !== undefined ? { anchor: op.placement.anchor } : {}),
          ...(op.placement.mode !== undefined
            ? { orientation: op.placement.mode === 'follow_boundary' ? 'follow_boundary' : null }
            : {}),
          ...(op.placement.rotationDeg !== undefined
            ? { rotationDeg: op.placement.rotationDeg }
            : {}),
          ...(op.placement.scale !== undefined ? { scale: op.placement.scale } : {}),
          ...(op.placement.offsetMm !== undefined
            ? {
                offset:
                  op.placement.offsetMm === null
                    ? null
                    : { value: op.placement.offsetMm, unit: 'mm' as const },
              }
            : {}),
        };
        if (
          target &&
          r.source.entityType === 'artifact_revision' &&
          op.placement.region !== undefined &&
          next.region !== null
        ) {
          const info = this.artifact(r.source.entityId, relRef(r.relationshipId));
          this.compatibility({ ...info, active: true }, target, next.region, 0);
        }
        r.placement = next;
        if (target) this.approximateFinding(r, target);
        return;
      }
      case 'add_relationship': {
        const id = op.relationshipId as string;
        if (s.relationships.some((r) => r.relationshipId === id))
          throw new Blocked([
            finding('id.duplicate', `Relationship id ${id} is used already`, relRef(id)),
          ]);
        s.relationships.push({
          relationshipId: id,
          type: op.relationshipType,
          source: op.source,
          target: op.target,
          placement: op.placement,
          constraints: op.constraints,
          status: op.placement?.approximate ? 'needs_review' : 'confirmed',
          provenanceRefs: this.ctx.operationId ? [this.ctx.operationId] : [],
        });
        return;
      }
      case 'remove_relationship':
        this.relationship(op.relationshipId);
        s.relationships = s.relationships.filter((r) => r.relationshipId !== op.relationshipId);
        return;
      case 'batch':
        for (const inner of op.operations) this.apply(inner);
        return;
      case 'regenerate_region':
      case 'interpret_reference':
        throw new Blocked([
          finding(
            'operation.ai_required',
            'This change needs AI generation, which is not available yet',
          ),
        ]);
      case 'restore_entities':
      case 'replace_state':
        // Handled before cloning (they replace whole entities).
        throw new Error('restore operations are applied by applyOperation');
    }
  }

  placementFallback(): Placement {
    return {
      region: null,
      anchor: null,
      coordinateSpace: 'component_local',
      translation: null,
      rotationDeg: null,
      scale: null,
      orientation: null,
      offset: null,
      geometryRevisionId: null,
      calibrationRef: null,
      approximate: true,
      confidence: null,
    };
  }
}

/** Fills server-generated ids so the stored operation replays identically. */
export function normalizeOperation(op: Operation, randomBytes?: RandomBytes): Operation {
  const copy = structuredClone(op);
  const fill = (o: Operation) => {
    if (o.type === 'add_component') o.componentId ??= createComponentId(randomBytes);
    if (o.type === 'attach_artifact') {
      o.bindingId ??= createBindingId(randomBytes);
      o.relationshipId ??= createRelationshipId(randomBytes);
    }
    if (o.type === 'add_relationship') o.relationshipId ??= createRelationshipId(randomBytes);
    if (o.type === 'batch') for (const inner of o.operations) fill(inner as Operation);
  };
  fill(copy);
  return copy;
}

const findingKey = (f: ValidationFinding) =>
  `${f.ruleId}|${f.entity?.entityType ?? ''}:${f.entity?.entityId ?? ''}|${f.path ?? ''}`;

/**
 * Applies an operation to a design state — pure: the input is never mutated, the same input gives the
 * same output (ids come from `normalizeOperation`). The result must still pass structural validation;
 * an operation that would introduce a new structural error is refused and nothing changes (OPR-002).
 */
export function applyOperation(
  state: GarmentDesignState,
  op: Operation,
  ctx: ApplyContext,
): ApplyResult {
  const normalized = normalizeOperation(op, ctx.randomBytes);
  let next: GarmentDesignState;
  const applier = new Applier(structuredClone(state), ctx);
  try {
    if (normalized.type === 'replace_state') {
      next = readAnyVersion(normalized.state).state;
    } else if (normalized.type === 'restore_entities') {
      const patch: EntityPatch = {
        components: normalized.components,
        relationships: normalized.relationships,
      };
      next = applyEntityPatch(applier.state, patch);
    } else {
      applier.apply(normalized);
      next = applier.state;
    }
  } catch (e) {
    if (e instanceof Blocked) return { ok: false, findings: e.findings };
    if (e instanceof GarmentModelError)
      return { ok: false, findings: [finding('operation.invalid', e.message)] };
    throw e;
  }
  const catalog = ctx.catalog ?? defaultCatalog;
  const before = new Set(
    validateDesignState(state, catalog)
      .findings.filter((f) => f.outcome === 'error')
      .map(findingKey),
  );
  const after = validateDesignState(next, catalog);
  if (!after.state) return { ok: false, findings: after.findings };
  const introduced = after.findings.filter(
    (f) => f.outcome === 'error' && !before.has(findingKey(f)),
  );
  if (introduced.length) return { ok: false, findings: introduced };
  const diff = diffEntities(state, after.state);
  const touched = new Set(diff.changed.map((r) => `${r.entityType}:${r.entityId}`));
  const related = after.findings.filter(
    (f) =>
      f.outcome !== 'error' &&
      f.outcome !== 'valid' &&
      f.entity &&
      touched.has(`${f.entity.entityType}:${f.entity.entityId}`),
  );
  const seen = new Set<string>();
  const findings = [...applier.warnings, ...related].filter((f) => {
    const k = `${findingKey(f)}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    ok: true,
    state: after.state,
    operation: normalized,
    changed: diff.changed,
    before: diff.before,
    after: diff.after,
    findings,
  };
}
