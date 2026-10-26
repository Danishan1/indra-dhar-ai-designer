# @ai-designer/design-operations

Every change to a garment design is a typed **design operation** (SPEC-004 §7, SPEC-003 §16). This package is pure TypeScript (depends only on `@ai-designer/garment-model` and `zod`) so the API applies operations authoritatively and the editor (I15) can preview them optimistically.

## Operation types (schema version `1`)

| Type                                                                 | What it does                                                                                                                         | Strategy                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `set_property`                                                       | Sets a value typed by a person (stamped `user_input`, `confirmed` or `proposed`; lengths stored in mm)                               | deterministic_model_update |
| `reset_property`                                                     | Back to `missing`                                                                                                                    | deterministic              |
| `set_property_status`                                                | Review: `confirm` (explicit, attributed), `reject` (→ missing), `needs_review`, `not_applicable`                                     | deterministic              |
| `add_component` / `remove_component`                                 | Add a catalog component (all properties `missing`); remove — blocked with dependents unless `cascade` (CMP-019)                      | deterministic              |
| `rename_component`, `set_component_visibility`, `set_component_lock` | Names and editor flags                                                                                                               | deterministic              |
| `attach_artifact` / `replace_artifact` / `detach_artifact`           | Pin an exact artifact revision (ART-004); lace/trim/embroidery/artwork/buttons also get a placed relationship; compatibility checked | rule_based_composition     |
| `update_placement`                                                   | Move a placement (allowed regions re-checked)                                                                                        | deterministic              |
| `add_relationship` / `remove_relationship`                           | Structured relationships (endpoints untouched on removal)                                                                            | deterministic              |
| `batch`                                                              | Several operations, all or nothing (one undo step)                                                                                   | deterministic              |
| `revert_operation`                                                   | Undo/redo: the server applies the inverse it stored                                                                                  | deterministic              |
| `regenerate_region`, `interpret_reference`                           | AI-only — refused with `UNSUPPORTED_CAPABILITY` until I25                                                                            | AI strategies              |
| `restore_entities`, `replace_state`                                  | **Internal only** (stored inverses, imports): never accepted from clients                                                            | deterministic              |

## API

- `operationEnvelopeSchema` — `{ operation, preservationConstraints, sourceRefs, executionPolicy }`.
- `applyOperation(state, op, ctx)` → `{ ok, state, operation (ids filled), changed, before, after, findings }` or `{ ok: false, findings }`. Pure; refuses anything that would add a structural error.
- `invert(prev, next)` → exact undo (`restore_entities` or `replace_state`).
- `diffEntities`, `applyEntityPatch`, `entitySnapshots` — the small patches the API returns and the hashes used to refuse stale undos.
- `selectStrategy(type, policy, availableAi)` — deterministic first (STR-001), records a rationale (STR-005), refuses clearly (STR-004).

Placements on components without boundary geometry are `approximate` and the relationship is `needs_review` (SPEC-003 AC-05, REL-008).
