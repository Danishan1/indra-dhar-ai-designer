import type { ValidationFinding } from '../schema/finding.js';

import type { ArtifactDefinition, GeometryCapability } from './artifact-schema.js';

export interface CompatibilityTarget {
  /** Component type the artifact would be used on, e.g. `sleeve`. */
  componentType: string;
  /** Region on that component, e.g. `hem`; null when not placed in a region. */
  region?: string | null;
  /** How many times the component already uses this artifact (for non-repeatable ones). */
  existingUses?: number;
}

export interface CompatibilityResult {
  /** No blocking (`error`) findings. Warnings stay visible (never silently a pass). */
  compatible: boolean;
  findings: ValidationFinding[];
}

const finding = (
  ruleId: string,
  outcome: ValidationFinding['outcome'],
  message: string,
  resolution: string | null = null,
): ValidationFinding => ({ ruleId, outcome, entity: null, path: null, message, resolution });

const human = (s: string) => s.replaceAll('_', ' ');

/**
 * Machine-readable compatibility (ART-012, FR-055): may this artifact revision go on that component
 * (and region)? Deterministic; I18 calls it before attaching, I20 re-runs it in validation.
 */
export function checkCompatibility(
  definition: ArtifactDefinition,
  geometryCapability: GeometryCapability,
  target: CompatibilityTarget,
): CompatibilityResult {
  const findings: ValidationFinding[] = [];
  if (!definition.compatibleTargetTypes.includes(target.componentType)) {
    findings.push(
      finding(
        'artifact.target_incompatible',
        'error',
        `This artifact cannot be used on a ${human(target.componentType)}`,
        `Use it on: ${definition.compatibleTargetTypes.map(human).join(', ')}`,
      ),
    );
  }
  const region = target.region ?? null;
  if (region !== null) {
    if (
      definition.allowedPlacementRegions !== null &&
      !definition.allowedPlacementRegions.includes(region)
    ) {
      findings.push(
        finding(
          'artifact.region_not_allowed',
          'error',
          `It cannot be placed on the ${human(region)}`,
          `Allowed: ${definition.allowedPlacementRegions.map(human).join(', ')}`,
        ),
      );
    } else if (
      definition.preferredPlacementRegions.length > 0 &&
      !definition.preferredPlacementRegions.includes(region)
    ) {
      findings.push(
        finding(
          'artifact.region_not_preferred',
          'warning',
          `The ${human(region)} is not a usual place for it`,
        ),
      );
    }
  }
  if (!definition.repeatable && (target.existingUses ?? 0) > 0) {
    findings.push(
      finding(
        'artifact.not_repeatable',
        'error',
        'This artifact can be used only once on a component',
      ),
    );
  }
  if (geometryCapability === 'G0' && definition.placementModes.includes('follow_boundary')) {
    findings.push(
      finding(
        'artifact.placement_approximate',
        'warning',
        'It has no outline geometry, so following an edge will only be an approximation',
      ),
    );
  }
  return { compatible: !findings.some((f) => f.outcome === 'error'), findings };
}
