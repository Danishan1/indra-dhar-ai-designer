import { defaultCatalog, isEnumValueAllowed, type Catalog } from '../registry/catalog.js';
import type { ValidationFinding } from '../schema/finding.js';
import { dataTypeValueSchemas, type PropertyValue } from '../schema/property-value.js';
import { unitKind } from '../units.js';

import {
  artifactDefinitionSchema,
  artifactPropertiesSchema,
  type ArtifactDefinition,
  type ArtifactProperties,
} from './artifact-schema.js';

export interface ArtifactRevisionValidation {
  ok: boolean;
  definition: ArtifactDefinition | null;
  properties: ArtifactProperties | null;
  findings: ValidationFinding[];
}

const f = (ruleId: string, path: string, message: string): ValidationFinding => ({
  ruleId,
  outcome: 'error',
  entity: null,
  path,
  message,
  resolution: null,
});

function checkProperty(
  catalog: Catalog,
  path: string,
  key: string,
  pv: PropertyValue,
): ValidationFinding[] {
  const def = catalog.properties.get(key);
  if (!def)
    return key.startsWith('ext.')
      ? []
      : [f('property.unknown', path, `"${key}" is not a known property`)];
  const out: ValidationFinding[] = [];
  if (pv.value !== null) {
    if (def.dataType === 'enum') {
      if (typeof pv.value !== 'string' || !isEnumValueAllowed(catalog, key, pv.value))
        out.push(
          f(
            'property.enum_value_not_allowed',
            path,
            `${def.label}: "${String(pv.value)}" is not an allowed option`,
          ),
        );
    } else if (!dataTypeValueSchemas[def.dataType].safeParse(pv.value).success) {
      out.push(f('property.invalid_value', path, `${def.label}: invalid value`));
    }
    if (def.unitKind !== null && (pv.unit === null || unitKind(pv.unit) !== def.unitKind))
      out.push(f('property.unit_missing', path, `${def.label} needs a ${def.unitKind} unit`));
    if (def.unitKind === null && pv.unit !== null)
      out.push(f('property.unit_unexpected', path, `${def.label} has no unit`));
  }
  return out;
}

/**
 * Validates a proposed artifact revision: definition shape, target component types known to the
 * catalog, property keys/values/units (PROP-001…004). Physical properties may be `missing` —
 * an artifact can be a valid design asset without manufacturing facts (§11.3).
 */
export function validateArtifactRevision(
  definitionInput: unknown,
  propertiesInput: unknown,
  catalog: Catalog = defaultCatalog,
): ArtifactRevisionValidation {
  const findings: ValidationFinding[] = [];
  const def = artifactDefinitionSchema.safeParse(definitionInput);
  if (!def.success)
    for (const i of def.error.issues)
      findings.push(f('artifact.definition_invalid', `definition.${i.path.join('.')}`, i.message));
  const props = artifactPropertiesSchema.safeParse(propertiesInput ?? {});
  if (!props.success)
    for (const i of props.error.issues)
      findings.push(f('artifact.properties_invalid', `properties.${i.path.join('.')}`, i.message));
  if (def.success) {
    for (const t of def.data.compatibleTargetTypes)
      if (!catalog.componentTypes.has(t))
        findings.push(
          f(
            'artifact.target_type_unknown',
            'definition.compatibleTargetTypes',
            `"${t}" is not a component type`,
          ),
        );
  }
  if (props.success) {
    for (const group of ['visual', 'physical'] as const)
      for (const [key, pv] of Object.entries(props.data[group]))
        findings.push(...checkProperty(catalog, `properties.${group}.${key}`, key, pv));
  }
  return {
    ok: findings.length === 0,
    definition: def.success ? def.data : null,
    properties: props.success ? props.data : null,
    findings,
  };
}
