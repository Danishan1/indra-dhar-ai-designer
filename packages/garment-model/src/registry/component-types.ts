export type Repeatability =
  /** At most one per parent (a shirt has one collar). */
  | 'single'
  /** At most one per parent and side (left/right sleeve, cuff). */
  | 'sided'
  /** Any number (pockets, decorative regions). */
  | 'multiple';

export interface ComponentTypeDef {
  type: string;
  label: string;
  defaultDisplayName: string;
  /** Types this component may sit under. `'*'` = any component. */
  allowedParents: readonly string[] | '*';
  /** May exist without a parent (only the garment body, and `custom`). */
  rootAllowed: boolean;
  repeatability: Repeatability;
  /** Property keys a component of this type may carry; `'*'` = any registered key. */
  allowedProperties: readonly string[] | '*';
  /** Categories where the type is typical; `'*'` = all. Others get a warning, not an error. */
  garmentCategories: readonly string[] | '*';
}

const GENERIC_PROPS = ['appearance.color', 'material.fabric_ref'] as const;

const t = (d: ComponentTypeDef): ComponentTypeDef => Object.freeze(d);

/** SPEC-003 §8.2. Extend through `extendCatalog` (registry/catalog.ts) — never by editing schemas. */
export const COMPONENT_TYPES: readonly ComponentTypeDef[] = Object.freeze([
  t({
    type: 'garment_body',
    label: 'Garment body',
    defaultDisplayName: 'Body',
    allowedParents: [],
    rootAllowed: true,
    repeatability: 'single',
    allowedProperties: [
      'appearance.color',
      'appearance.silhouette',
      'appearance.pattern',
      'material.fabric_ref',
      'material.composition',
      'material.gsm',
      'dimension.body_length',
      'dimension.chest_width',
      'dimension.shoulder_width',
    ],
    garmentCategories: '*',
  }),
  t({
    type: 'front_body_panel',
    label: 'Front body panel',
    defaultDisplayName: 'Front panel',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: ['appearance.color', 'appearance.pattern', 'material.fabric_ref'],
    garmentCategories: '*',
  }),
  t({
    type: 'back_body_panel',
    label: 'Back body panel',
    defaultDisplayName: 'Back panel',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: ['appearance.color', 'appearance.pattern', 'material.fabric_ref'],
    garmentCategories: '*',
  }),
  t({
    type: 'sleeve',
    label: 'Sleeve',
    defaultDisplayName: 'Sleeve',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'sided',
    allowedProperties: [
      'construction.sleeve_type',
      'dimension.sleeve_length',
      'appearance.color',
      'material.fabric_ref',
    ],
    garmentCategories: '*',
  }),
  t({
    type: 'cuff',
    label: 'Cuff',
    defaultDisplayName: 'Cuff',
    allowedParents: ['sleeve'],
    rootAllowed: false,
    repeatability: 'sided',
    allowedProperties: [
      'construction.cuff_type',
      'dimension.cuff_width',
      'appearance.color',
      'material.fabric_ref',
    ],
    garmentCategories: ['woven_shirt'],
  }),
  t({
    type: 'collar',
    label: 'Collar',
    defaultDisplayName: 'Collar',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [
      'construction.collar_type',
      'dimension.collar_height',
      'appearance.color',
      'material.fabric_ref',
    ],
    garmentCategories: ['woven_shirt'],
  }),
  t({
    type: 'neckline',
    label: 'Neckline',
    defaultDisplayName: 'Neckline',
    allowedParents: ['garment_body', 'front_body_panel'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [
      'construction.neckline_type',
      'dimension.neckline_width',
      'appearance.color',
      'material.fabric_ref',
    ],
    garmentCategories: ['knit_tshirt'],
  }),
  t({
    type: 'placket',
    label: 'Placket',
    defaultDisplayName: 'Placket',
    allowedParents: ['garment_body', 'front_body_panel'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [
      'construction.placket_type',
      'construction.closure_type',
      'construction.button_count',
      'dimension.placket_width',
      'appearance.color',
    ],
    garmentCategories: ['woven_shirt'],
  }),
  t({
    type: 'pocket',
    label: 'Pocket',
    defaultDisplayName: 'Pocket',
    allowedParents: ['garment_body', 'front_body_panel', 'back_body_panel', 'sleeve'],
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: [
      'construction.pocket_type',
      'placement.pocket_position',
      'appearance.color',
      'material.fabric_ref',
    ],
    garmentCategories: '*',
  }),
  t({
    type: 'waistband',
    label: 'Waistband',
    defaultDisplayName: 'Waistband',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [...GENERIC_PROPS, 'material.composition'],
    garmentCategories: [],
  }),
  t({
    type: 'hem',
    label: 'Hem',
    defaultDisplayName: 'Hem',
    allowedParents: ['garment_body', 'sleeve'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: ['construction.hem_type', 'dimension.hem_depth', 'appearance.color'],
    garmentCategories: '*',
  }),
  t({
    type: 'yoke',
    label: 'Yoke',
    defaultDisplayName: 'Yoke',
    allowedParents: ['garment_body', 'back_body_panel'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [...GENERIC_PROPS],
    garmentCategories: ['woven_shirt'],
  }),
  t({
    type: 'hood',
    label: 'Hood',
    defaultDisplayName: 'Hood',
    allowedParents: ['garment_body'],
    rootAllowed: false,
    repeatability: 'single',
    allowedProperties: [...GENERIC_PROPS, 'material.composition'],
    garmentCategories: [],
  }),
  t({
    type: 'lining',
    label: 'Lining',
    defaultDisplayName: 'Lining',
    allowedParents: ['garment_body', 'sleeve'],
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: [...GENERIC_PROPS, 'material.composition'],
    garmentCategories: [],
  }),
  t({
    type: 'facing',
    label: 'Facing',
    defaultDisplayName: 'Facing',
    allowedParents: ['garment_body', 'collar', 'neckline'],
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: [...GENERIC_PROPS],
    garmentCategories: '*',
  }),
  t({
    type: 'gusset',
    label: 'Gusset',
    defaultDisplayName: 'Gusset',
    allowedParents: ['garment_body', 'sleeve'],
    rootAllowed: false,
    repeatability: 'sided',
    allowedProperties: [...GENERIC_PROPS],
    garmentCategories: [],
  }),
  t({
    type: 'seam_group',
    label: 'Seam group',
    defaultDisplayName: 'Seams',
    allowedParents: '*',
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: ['construction.seam_type', 'dimension.seam_allowance'],
    garmentCategories: '*',
  }),
  t({
    type: 'decorative_region',
    label: 'Decorative region',
    defaultDisplayName: 'Decorative region',
    allowedParents: '*',
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: ['appearance.color', 'appearance.pattern'],
    garmentCategories: '*',
  }),
  t({
    type: 'artwork_placement_region',
    label: 'Artwork placement region',
    defaultDisplayName: 'Artwork region',
    allowedParents: '*',
    rootAllowed: false,
    repeatability: 'multiple',
    allowedProperties: ['appearance.color', 'appearance.pattern'],
    garmentCategories: '*',
  }),
  t({
    type: 'custom',
    label: 'Custom component',
    defaultDisplayName: 'Custom component',
    allowedParents: '*',
    rootAllowed: true,
    repeatability: 'multiple',
    allowedProperties: '*',
    garmentCategories: '*',
  }),
]);
