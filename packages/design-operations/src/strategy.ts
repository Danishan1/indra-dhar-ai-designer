import type { ExecutionPolicy, OperationType } from './schema.js';

/** SPEC-004 §8.1. Listing a strategy does not mean an engine for it is enabled. */
export const ExecutionStrategies = [
  'deterministic_model_update',
  'vector_operation',
  'rule_based_composition',
  'render_only',
  'image_interpretation',
  'text_to_image',
  'image_to_image',
  'targeted_image_edit',
  'multimodal_reasoning',
  'geometry_generation',
  'composite_pipeline',
] as const;
export type ExecutionStrategy = (typeof ExecutionStrategies)[number];

const AI_STRATEGIES = new Set<ExecutionStrategy>([
  'image_interpretation',
  'text_to_image',
  'image_to_image',
  'targeted_image_edit',
  'multimodal_reasoning',
  'geometry_generation',
]);
export const requiresAi = (s: ExecutionStrategy) => AI_STRATEGIES.has(s);

export interface OperationTypeDef {
  type: OperationType;
  label: string;
  /** Eligible strategies in preference order (deterministic first, STR-001). */
  strategies: readonly ExecutionStrategy[];
  /** Clients may submit it (internal restores are server-only). */
  clientAllowed: boolean;
  /** The server can store an exact inverse (undo). */
  invertible: boolean;
}

const d = (
  type: OperationType,
  label: string,
  strategies: ExecutionStrategy[] = ['deterministic_model_update'],
): OperationTypeDef => ({
  type,
  label,
  strategies,
  clientAllowed: true,
  invertible: true,
});

/** Versioned registry of operation types (a public contract — add, never repurpose). */
export const OPERATION_TYPES: readonly OperationTypeDef[] = [
  d('set_property', 'Set a property'),
  d('reset_property', 'Clear a property'),
  d('set_property_status', 'Review a property'),
  d('add_component', 'Add a component'),
  d('remove_component', 'Remove a component'),
  d('set_component_visibility', 'Show or hide a component'),
  d('set_component_lock', 'Lock or unlock a component'),
  d('rename_component', 'Rename a component'),
  d('attach_artifact', 'Attach an artifact', [
    'rule_based_composition',
    'deterministic_model_update',
  ]),
  d('replace_artifact', 'Use another artifact revision', [
    'rule_based_composition',
    'deterministic_model_update',
  ]),
  d('detach_artifact', 'Detach an artifact'),
  d('update_placement', 'Move a placement'),
  d('add_relationship', 'Add a relationship'),
  d('remove_relationship', 'Remove a relationship'),
  d('batch', 'Several changes'),
  d('revert_operation', 'Undo or redo'),
  {
    type: 'regenerate_region',
    label: 'Regenerate a region with AI',
    strategies: ['targeted_image_edit', 'image_to_image'],
    clientAllowed: true,
    invertible: false,
  },
  {
    type: 'interpret_reference',
    label: 'Read garment details from an image',
    strategies: ['image_interpretation', 'multimodal_reasoning'],
    clientAllowed: true,
    invertible: false,
  },
  {
    type: 'restore_entities',
    label: 'Restore entities',
    strategies: ['deterministic_model_update'],
    clientAllowed: false,
    invertible: true,
  },
  {
    type: 'replace_state',
    label: 'Replace the whole state',
    strategies: ['deterministic_model_update'],
    clientAllowed: false,
    invertible: true,
  },
];

export const operationTypeDef = (type: OperationType): OperationTypeDef => {
  const def = OPERATION_TYPES.find((t) => t.type === type);
  if (!def) throw new Error(`Unknown operation type ${type}`);
  return def;
};

export interface StrategyChoice {
  strategy: ExecutionStrategy;
  rationale: string;
}

export interface StrategyRejection {
  strategy: null;
  /** Why nothing could run (STR-004): reported to the user, never silently substituted. */
  rationale: string;
  reason: 'policy_forbids' | 'no_engine_available';
}

/**
 * Picks the first eligible strategy (STR-001…005): deterministic strategies are preferred and always
 * available; AI strategies need `policy.allowAi` and an enabled engine (`availableAi`, empty until I25).
 */
export function selectStrategy(
  type: OperationType,
  policy: ExecutionPolicy,
  availableAi: ReadonlySet<ExecutionStrategy> = new Set(),
): StrategyChoice | StrategyRejection {
  const def = operationTypeDef(type);
  const skipped: string[] = [];
  for (const s of def.strategies) {
    if (requiresAi(s)) {
      if (!policy.allowAi) {
        skipped.push(`${s}: AI not allowed by the request`);
        continue;
      }
      if (!availableAi.has(s)) {
        skipped.push(`${s}: no engine is enabled`);
        continue;
      }
      return { strategy: s, rationale: `${s}: AI execution allowed and an engine is available` };
    }
    if (!policy.allowDeterministic) {
      skipped.push(`${s}: deterministic execution not allowed by the request`);
      continue;
    }
    return {
      strategy: s,
      rationale:
        s === 'rule_based_composition'
          ? `${s}: structured composition with a pinned artifact revision; no AI needed (STR-001)`
          : `${s}: exact structured state change; no AI needed (STR-001)`,
    };
  }
  const aiOnly = def.strategies.every(requiresAi);
  return {
    strategy: null,
    reason: aiOnly && policy.allowAi ? 'no_engine_available' : 'policy_forbids',
    rationale: `No strategy can run "${def.label}": ${skipped.join('; ')}`,
  };
}
