/**
 * @ai-designer/garment-model — the canonical, framework-free definition of what a garment design is.
 * See README.md. No React, NestJS, Prisma or AI-provider imports are allowed here.
 */
export * from './errors.js';
export * from './status.js';
export * from './units.js';
export * from './ids.js';
export * from './clone.js';

export * from './schema/entity-ref.js';
export * from './schema/property-value.js';
export * from './schema/placement.js';
export * from './schema/component.js';
export * from './schema/relationship.js';
export * from './schema/constraint.js';
export * from './schema/finding.js';
export * from './schema/design-state.js';

export * from './registry/garment-categories.js';
export * from './registry/property-definitions.js';
export * from './registry/component-types.js';
export * from './registry/relationship-types.js';
export * from './registry/catalog.js';

export * from './canonical/canonicalize.js';
export * from './canonical/hash.js';
export * from './diff/diff-design-states.js';
export * from './validation/structural.js';
export * from './versioning/version.js';
export * from './versioning/migrations.js';
export * from './templates/index.js';
