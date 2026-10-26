import { createComponentId, type RandomBytes } from '../ids.js';
import { allowedPropertyKeys, defaultCatalog } from '../registry/catalog.js';
import type { ComponentSide, DesignComponent } from '../schema/component.js';
import type { GarmentDesignState } from '../schema/design-state.js';
import { SCHEMA_VERSION } from '../schema/design-state.js';
import {
  missingValue,
  proposedFromTemplate,
  type PropertyValue,
} from '../schema/property-value.js';

export interface TemplateOptions {
  /** Deterministic ids for tests (see `sequentialRandomBytes`). */
  randomBytes?: RandomBytes;
}

export interface ComponentSpec {
  type: string;
  name?: string;
  side?: ComponentSide;
  parent?: DesignComponent;
  /** Template suggestions: always stored as `proposed`, source `template`, review required. */
  proposed?: Record<string, string | number | boolean>;
}

/**
 * Builds a component whose every allowed property exists and is `missing` unless the template
 * suggests a value — suggestions are `proposed` and marked as coming from a template. Nothing a
 * template creates is ever `confirmed` (PROP-005, SPEC-003 AC-06).
 */
export function buildComponent(spec: ComponentSpec, opts: TemplateOptions): DesignComponent {
  const def = defaultCatalog.componentTypes.get(spec.type);
  if (!def) throw new Error(`Unknown component type ${spec.type}`);
  const properties: Record<string, PropertyValue> = {};
  for (const key of allowedPropertyKeys(defaultCatalog, spec.type)) {
    const suggestion = spec.proposed?.[key];
    properties[key] = suggestion === undefined ? missingValue() : proposedFromTemplate(suggestion);
  }
  return {
    componentId: createComponentId(opts.randomBytes),
    componentType: spec.type,
    displayName: spec.name ?? def.defaultDisplayName,
    parentComponentId: spec.parent?.componentId ?? null,
    side: spec.side ?? 'none',
    properties,
    artifactBindings: [],
    geometryRefs: [],
    assetRefs: [],
    tags: [],
    visible: true,
    locked: false,
  };
}

export function buildState(
  category: { key: string; garmentType: string },
  components: DesignComponent[],
): GarmentDesignState {
  return {
    schemaVersion: SCHEMA_VERSION,
    garmentType: category.garmentType,
    garmentCategory: category.key,
    components,
    relationships: [],
    constraints: [],
    annotationsRef: null,
    metadata: {},
    provenance: { createdFrom: 'template', templateKey: category.key, sourceRevisionId: null },
  };
}
