import {
  createBindingId,
  createPatternPieceId,
  defaultCatalog,
  type GarmentDesignState,
  missingValue,
  type RandomBytes,
  validateDesignState,
  type ValidationFinding,
} from '@ai-designer/garment-model';

/**
 * Makes an AI-built design structurally valid (ADR-056): real model output can contain duplicate
 * parts, wrong parents, unknown values or odd pattern pieces. Instead of refusing the design, each
 * blocking finding is resolved by the smallest change — reset a value, give a part its missing side,
 * move it under the body, or leave it out — and every change is reported as a note.
 */
export function repairDesignState(
  input: GarmentDesignState,
  randomBytes?: RandomBytes,
): { state: GarmentDesignState; notes: string[]; ok: boolean; remaining: ValidationFinding[] } {
  const state: GarmentDesignState = structuredClone(input);
  const notes: string[] = [];
  const reparented = new Set<string>();
  const nameOf = (id: string) =>
    state.components.find((c) => c.componentId === id)?.displayName ?? id;
  const body = () => state.components.find((c) => c.componentType === 'garment_body');

  const removeComponent = (id: string, why: string) => {
    const c = state.components.find((x) => x.componentId === id);
    if (!c) return;
    const root = body();
    if (
      root &&
      root.componentId === id &&
      state.components.filter((x) => x.componentType === 'garment_body').length === 1
    )
      return; // never remove the only body
    notes.push(`Left out "${c.displayName}": ${why}`);
    state.components = state.components.filter((x) => x.componentId !== id);
    for (const child of state.components)
      if (child.parentComponentId === id)
        child.parentComponentId = root && root.componentId !== id ? root.componentId : null;
    state.patternPieces = (state.patternPieces ?? []).filter((p) => p.componentId !== id);
    state.relationships = state.relationships.filter(
      (r) => r.source.entityId !== id && r.target.entityId !== id,
    );
  };

  // Paired parts the model left without a side get left/right (in order).
  for (const c of state.components) {
    if (c.side !== 'none') continue;
    if (defaultCatalog.componentTypes.get(c.componentType)?.repeatability !== 'sided') continue;
    const used = new Set(
      state.components
        .filter(
          (x) =>
            x !== c &&
            x.componentType === c.componentType &&
            x.parentComponentId === c.parentComponentId,
        )
        .map((x) => x.side),
    );
    const free = (['left', 'right'] as const).find((s) => !used.has(s));
    if (free) {
      c.side = free;
      notes.push(`"${c.displayName}" set to the ${free} side`);
    }
  }

  for (let round = 0; round < 25; round++) {
    const result = validateDesignState(state);
    const errors = result.findings.filter((f) => f.outcome === 'error');
    if (result.ok || errors.length === 0)
      return { state: result.state ?? state, notes, ok: true, remaining: [] };
    // One finding at a time for component-level changes (they can resolve others).
    const f = errors[0]!;
    const entityId = f.entity?.entityType === 'design_component' ? f.entity.entityId : null;
    const propPath = f.path
      ? /^components\[(cmp_[a-z0-9]+)\]\.properties\.(.+)$/.exec(f.path)
      : null;
    const schemaPath = f.ruleId === 'schema.invalid' && f.path ? f.path.split('.') : null;

    if (propPath) {
      const c = state.components.find((x) => x.componentId === propPath[1]);
      const key = propPath[2]!;
      if (c) {
        if (f.ruleId === 'property.unknown' || f.ruleId === 'property.not_allowed_for_type')
          delete c.properties[key];
        else if (f.ruleId === 'property.ai_generation_critical' && c.properties[key])
          c.properties[key] = { ...c.properties[key], status: 'proposed', reviewRequired: true };
        else c.properties[key] = missingValue();
        notes.push(
          `Cleared ${key.split('.').pop()?.replaceAll('_', ' ')} of "${c.displayName}": ${f.message}`,
        );
        continue;
      }
    }

    if (schemaPath) {
      const [section, index, field, key] = schemaPath;
      const i = Number(index);
      if (section === 'components' && Number.isInteger(i) && state.components[i]) {
        const c = state.components[i]!;
        if (field === 'properties' && key) {
          delete c.properties[key];
          notes.push(`Removed an invalid value from "${c.displayName}"`);
        } else if (field === 'shapes') {
          delete (c as { shapes?: unknown }).shapes;
          notes.push(`Dropped an invalid shape of "${c.displayName}"`);
        } else if (field === 'sourceRegion') {
          delete (c as { sourceRegion?: unknown }).sourceRegion;
        } else if (field === 'assetRefs') {
          c.assetRefs = [];
        } else removeComponent(c.componentId, f.message);
        continue;
      }
      if (section === 'patternPieces' && Number.isInteger(i) && state.patternPieces?.[i]) {
        notes.push(`Dropped pattern piece "${state.patternPieces[i]!.name}": ${f.message}`);
        state.patternPieces.splice(i, 1);
        continue;
      }
      if (section === 'sources' && Number.isInteger(i) && state.sources?.[i]) {
        state.sources.splice(i, 1);
        continue;
      }
      if (section === 'relationships' && Number.isInteger(i) && state.relationships[i]) {
        state.relationships.splice(i, 1);
        continue;
      }
      if (section === 'metadata') {
        state.metadata = {};
        continue;
      }
    }

    if (f.ruleId.startsWith('relationship.') && f.entity?.entityType === 'relationship') {
      const id = f.entity.entityId;
      state.relationships = state.relationships.filter((r) => r.relationshipId !== id);
      continue;
    }
    if (f.ruleId === 'category.unknown' || f.ruleId === 'category.type_mismatch') {
      state.garmentCategory = null;
      continue;
    }
    if (f.ruleId === 'id.duplicate' && /Pattern piece id/.test(f.message)) {
      const seen = new Set<string>();
      for (const p of state.patternPieces ?? []) {
        if (seen.has(p.pieceId)) p.pieceId = createPatternPieceId(randomBytes);
        seen.add(p.pieceId);
      }
      continue;
    }
    if (f.ruleId === 'pattern.component_missing') {
      const m = f.path ? /^patternPieces\[(pat_[a-z0-9]+)\]$/.exec(f.path) : null;
      state.patternPieces = (state.patternPieces ?? []).filter((p) => p.pieceId !== m?.[1]);
      continue;
    }

    if (entityId) {
      const c = state.components.find((x) => x.componentId === entityId);
      if (!c) continue;
      switch (f.ruleId) {
        case 'id.duplicate':
        case 'binding.revision_unknown': {
          if (/Binding/.test(f.message) || f.ruleId === 'binding.revision_unknown') {
            if (f.ruleId === 'binding.revision_unknown') c.artifactBindings = [];
            else for (const b of c.artifactBindings) b.bindingId = createBindingId(randomBytes);
          } else removeComponent(c.componentId, f.message);
          continue;
        }
        case 'component.duplicate_sided': {
          // Two parts on the same side: try the other side once.
          const used = new Set(
            state.components
              .filter(
                (x) =>
                  x !== c &&
                  x.componentType === c.componentType &&
                  x.parentComponentId === c.parentComponentId,
              )
              .map((x) => x.side),
          );
          const free = (['left', 'right'] as const).find((s) => !used.has(s));
          if (free && !reparented.has(`side:${c.componentId}`)) {
            reparented.add(`side:${c.componentId}`);
            notes.push(`"${c.displayName}" set to the ${free} side`);
            c.side = free;
          } else removeComponent(c.componentId, f.message);
          continue;
        }
        case 'component.parent_not_allowed':
        case 'component.parent_missing':
        case 'component.parent_self':
        case 'component.parent_cycle':
        case 'component.root_not_allowed': {
          const root = body();
          if (root && root.componentId !== c.componentId && !reparented.has(c.componentId)) {
            reparented.add(c.componentId);
            notes.push(`"${c.displayName}" moved under "${nameOf(root.componentId)}"`);
            c.parentComponentId = root.componentId;
          } else removeComponent(c.componentId, f.message);
          continue;
        }
        default:
          removeComponent(c.componentId, f.message);
          continue;
      }
    }
    // Something we cannot attribute: stop and report it.
    return { state, notes, ok: false, remaining: errors };
  }
  const final = validateDesignState(state);
  return {
    state: final.state ?? state,
    notes,
    ok: final.ok,
    remaining: final.findings.filter((f) => f.outcome === 'error'),
  };
}
