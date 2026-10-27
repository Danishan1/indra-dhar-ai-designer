# @ai-designer/garment-model

The canonical, framework-free definition of what a garment design **is** (SPEC-003). Pure TypeScript with two runtime dependencies (`zod`, `@noble/hashes`); it runs unchanged in Node, the browser and the worker. No React, NestJS, Prisma, queue or AI-provider imports are allowed (enforced by lint and `boundaries.test.ts`).

Everything else builds on it: persistence and revisions (I12), reusable artifacts (I13), the operation engine (I14), SVG rendering (I16), the editor (I17), validation (I20).

## Concepts

| Concept              | Where                      | Notes                                                                                                                                                                                                                 |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GarmentDesignState` | `schema/design-state.ts`   | The root snapshot: `schemaVersion`, `garmentType`, `garmentCategory`, `components[]`, `relationships[]`, `constraints[]`, `metadata`, `provenance`. Stored as `WorkingCopy.state` / `DesignRevision.snapshot` in I12. |
| `DesignComponent`    | `schema/component.ts`      | A garment part instance with a stable `cmp_…` id, a catalog `componentType`, optional parent, `side`, `properties`, pinned `artifactBindings`. `visible`/`locked` are editor flags, not physical.                     |
| `PropertyValue`      | `schema/property-value.ts` | `{ value, unit, status, sourceType, sourceRefs, confidence, reviewRequired, confirmedBy, confirmedAt }`. `value: null` means unknown — never an invented default.                                                     |
| Value status         | `status.ts`                | `confirmed · inferred · proposed · missing · needs_review · not_applicable` (SPEC-003 §9.2, exactly).                                                                                                                 |
| `DesignRelationship` | `schema/relationship.ts`   | Typed link between components/artifact revisions with optional `Placement` (always names its `coordinateSpace`).                                                                                                      |
| Registries           | `registry/`                | Component types, property definitions, relationship types, categories. Read-only; extend with `extendCatalog`.                                                                                                        |
| Units                | `units.ts`                 | Length is canonical **mm** (ADR-020); `cm`, `in`, `gsm`, `deg`, `percent`. Deterministic conversion and rounding.                                                                                                     |

## The rules the code enforces

1. **Unknown stays unknown.** New properties are `missing`. Templates may _propose_ a value (`sourceType: 'template'`, `reviewRequired: true`) but never `confirmed`, and never guess dimensions, materials or colours.
2. **AI never confirms.** `promote(pv, { confirmedBy, confirmedAt })` is the only way to `confirmed` and needs a person; a confidence score does nothing. The schema also rejects `confirmed` without who/when. A generated picture cannot make a critical value `inferred` (PROP-007).
3. **Physical values carry units.** A `dimension.*` value without a unit, or with the wrong kind of unit, fails validation (PROP-003).
4. **Artifact bindings pin a revision** (`artifactRevisionId` is required, ART-004). Two components may bind the same revision and keep separate properties.
5. **Placement names its space.** A physical offset in image coordinates needs a `calibrationRef` (GEO-002); `approximate` placements stay visibly approximate (REL-008).
6. **Migrations never promote.** `migrateToLatest` clones the input, runs registered steps, and fails if anything becomes `confirmed` that was not (VER-003). Stored snapshots are never rewritten.

## Examples

```ts
import {
  templates,
  validateDesignState,
  contentHash,
  semanticHash,
  diffDesignStates,
  userValue,
  promote,
  convertLength,
  extendCatalog,
  defaultCatalog,
  readAnyVersion,
} from '@ai-designer/garment-model';

// 1. Start from a template (valid, nothing confirmed)
const state = templates.create('woven_shirt'); // or 'knit_tshirt'
validateDesignState(state).ok; // true; findings explain the rest

// 2. Edit a property as a person
const sleeve = state.components.find((c) => c.componentType === 'sleeve' && c.side === 'left')!;
sleeve.properties['dimension.sleeve_length'] = userValue(
  convertLength(22.8, 'in', 'mm'),
  { confirmedBy: userId, confirmedAt: new Date().toISOString() },
  'mm',
);

// 3. Confirm an AI suggestion — explicit, attributed
sleeve.properties['construction.sleeve_type'] = promote(proposal, {
  confirmedBy: userId,
  confirmedAt: now,
});

// 4. Identity and comparison
contentHash(state); // sha256 of the canonical JSON (everything)
semanticHash(state); // ignores editor flags, metadata, provenance, schema version
const d = diffDesignStates(before, after);
d.metadataOnly; // true when only flags/metadata changed

// 5. Extending without touching the core
const catalog = extendCatalog(defaultCatalog, {
  enumExtensions: { 'construction.collar_type': ['wing'] },
});
validateDesignState(state, catalog);

// 6. Reading stored snapshots of any version
const { state: current } = readAnyVersion(row.snapshot);
```

## Public API

Schemas and inferred types · `templates.create` · registries and `extendCatalog` · `validateDesignState(state, catalog?, { knownArtifactRevisions? })` · `canonicalize`, `canonicalJson`, `contentHash`, `semanticHash`, `sha256Hex` · `diffDesignStates` · `cloneWithNewIds`, `createComponentId` and friends · `SCHEMA_VERSION`, `MIGRATIONS`, `migrateToLatest`, `readAnyVersion` · unit helpers · `promote`, `isConfirmed` · `evaluatePropertyRules` / `PROPERTY_RULES` (dependency rules: which properties do not apply, and conflicting values still set — I17).

## Extending

- **New garment category:** add to `registry/garment-categories.ts`, add a template under `templates/`, register it in `templates/index.ts`. Add component types/properties in the registries (or at runtime with `extendCatalog`). No schema change.
- **New property:** add a `PropertyDefinition`; set `manufacturingCritical` honestly; `ui.advanced` puts it under "More" in the editor. Enum values can grow additively. The editor builds its controls from these definitions — no UI code per property.
- **New dependency rule:** add a `PropertyRule` to `registry/property-rules.ts` (disables properties with a reason; values still set become conflicts — never changed automatically).
- **Schema change:** additive → bump the minor version only. Breaking → bump major, add a `Migration` (with `renamedProperties` when keys move) and a test; never edit a released shape in place.
- Hashes depend on the canonical form: changing `canonicalize` changes every stored hash — treat as a major change.

## Not in this package

Persistence (I12), operations (I14), geometry/SVG (I16), versioned business constraint sets (I20), the production specification (I38).
