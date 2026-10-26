import { COMPONENT_TYPES, type ComponentTypeDef } from './component-types.js';
import { GARMENT_CATEGORIES, type GarmentCategoryDef } from './garment-categories.js';
import { PROPERTY_DEFINITIONS, type PropertyDefinition } from './property-definitions.js';
import { RELATIONSHIP_TYPES, type RelationshipTypeDef } from './relationship-types.js';

/** Read-only view over everything the validator and editor need to know. */
export interface Catalog {
  readonly componentTypes: ReadonlyMap<string, ComponentTypeDef>;
  readonly properties: ReadonlyMap<string, PropertyDefinition>;
  readonly relationshipTypes: ReadonlyMap<string, RelationshipTypeDef>;
  readonly categories: ReadonlyMap<string, GarmentCategoryDef>;
  /** Registered extra enum values per property key (PROP-004). */
  readonly enumExtensions: ReadonlyMap<string, ReadonlySet<string>>;
}

const byKey = <T>(items: readonly T[], key: (t: T) => string): Map<string, T> =>
  new Map(items.map((i) => [key(i), i]));

export const defaultCatalog: Catalog = Object.freeze({
  componentTypes: byKey(COMPONENT_TYPES, (c) => c.type),
  properties: byKey(PROPERTY_DEFINITIONS, (p) => p.key),
  relationshipTypes: byKey(RELATIONSHIP_TYPES, (r) => r.type),
  categories: byKey(GARMENT_CATEGORIES, (c) => c.key),
  enumExtensions: new Map<string, ReadonlySet<string>>(),
});

export interface CatalogExtension {
  componentTypes?: readonly ComponentTypeDef[];
  properties?: readonly PropertyDefinition[];
  categories?: readonly GarmentCategoryDef[];
  /** `{ 'construction.collar_type': ['wing'] }` adds values to an existing enum. */
  enumExtensions?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Returns a NEW catalog with extra component types, properties, categories or enum values.
 * The core never changes; extensions can add but not redefine (a clash throws), so stored designs
 * keep their meaning (SPEC-003 §4.4, §6.4).
 */
export function extendCatalog(base: Catalog, ext: CatalogExtension): Catalog {
  const componentTypes = new Map(base.componentTypes);
  for (const c of ext.componentTypes ?? []) {
    if (componentTypes.has(c.type))
      throw new Error(`Component type "${c.type}" is already registered`);
    componentTypes.set(c.type, c);
  }
  const properties = new Map(base.properties);
  for (const p of ext.properties ?? []) {
    if (properties.has(p.key)) throw new Error(`Property "${p.key}" is already registered`);
    properties.set(p.key, p);
  }
  const categories = new Map(base.categories);
  for (const c of ext.categories ?? []) {
    if (categories.has(c.key)) throw new Error(`Category "${c.key}" is already registered`);
    categories.set(c.key, c);
  }
  const enumExtensions = new Map(base.enumExtensions);
  for (const [key, values] of Object.entries(ext.enumExtensions ?? {})) {
    const def = properties.get(key);
    if (def?.dataType !== 'enum') throw new Error(`"${key}" is not a registered enum property`);
    enumExtensions.set(key, new Set([...(base.enumExtensions.get(key) ?? []), ...values]));
  }
  return Object.freeze({
    componentTypes,
    properties,
    categories,
    enumExtensions,
    relationshipTypes: base.relationshipTypes,
  });
}

export function isEnumValueAllowed(catalog: Catalog, key: string, value: string): boolean {
  const def = catalog.properties.get(key);
  if (def?.dataType !== 'enum') return false;
  return (
    (def.enumValues ?? []).includes(value) || (catalog.enumExtensions.get(key)?.has(value) ?? false)
  );
}

/** Property keys a component type may carry. */
export function allowedPropertyKeys(catalog: Catalog, componentType: string): readonly string[] {
  const def = catalog.componentTypes.get(componentType);
  if (!def) return [];
  return def.allowedProperties === '*' ? [...catalog.properties.keys()] : def.allowedProperties;
}
