import type { PropertyDataType } from '../schema/property-value.js';
import type { UnitKind } from '../units.js';

export type PropertyControl =
  'select' | 'number' | 'dimension' | 'toggle' | 'color' | 'text' | 'composition' | 'reference';

export interface PropertyDefinition {
  key: string;
  label: string;
  dataType: PropertyDataType;
  /** `length` for dimensions, `mass_area` for gsm, … ; null means the value is unitless. */
  unitKind: UnitKind | null;
  /** Permitted values for `enum` properties (extensions are registered on the catalog, PROP-004). */
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  /** Wrong or invented values here can cause bad garments: they keep evidence and review status (PROP-006). */
  manufacturingCritical: boolean;
  ui: { control: PropertyControl; group: string; hint?: string };
}

const def = (
  d: Omit<PropertyDefinition, 'ui'> & { ui: PropertyDefinition['ui'] },
): PropertyDefinition => Object.freeze(d);

const select = (group: string) => ({ control: 'select' as const, group });

export const PROPERTY_DEFINITIONS: readonly PropertyDefinition[] = Object.freeze([
  // appearance
  def({
    key: 'appearance.color',
    label: 'Colour',
    dataType: 'color',
    unitKind: null,
    manufacturingCritical: false,
    ui: { control: 'color', group: 'Appearance' },
  }),
  def({
    key: 'appearance.silhouette',
    label: 'Silhouette',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['slim', 'regular', 'relaxed', 'oversized', 'boxy'],
    manufacturingCritical: false,
    ui: select('Appearance'),
  }),
  def({
    key: 'appearance.pattern',
    label: 'Pattern',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['solid', 'stripe', 'check', 'print', 'jacquard'],
    manufacturingCritical: false,
    ui: select('Appearance'),
  }),
  // construction
  def({
    key: 'construction.sleeve_type',
    label: 'Sleeve type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['set_in', 'raglan', 'drop_shoulder', 'dolman', 'sleeveless'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.cuff_type',
    label: 'Cuff type',
    dataType: 'enum',
    unitKind: null,
    enumValues: [
      'barrel_single_button',
      'barrel_double_button',
      'french',
      'rib',
      'plain',
      'hemmed',
    ],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.collar_type',
    label: 'Collar type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['spread', 'point', 'button_down', 'mandarin', 'camp', 'band', 'none'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.neckline_type',
    label: 'Neckline type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['crew', 'v_neck', 'scoop', 'henley', 'boat'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.placket_type',
    label: 'Placket type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['standard', 'concealed', 'covered', 'half', 'none'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.closure_type',
    label: 'Closure',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['button', 'snap', 'zip', 'none'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.button_count',
    label: 'Button count',
    dataType: 'number',
    unitKind: null,
    min: 0,
    max: 40,
    manufacturingCritical: true,
    ui: { control: 'number', group: 'Construction' },
  }),
  def({
    key: 'construction.pocket_type',
    label: 'Pocket type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['patch', 'patch_with_flap', 'welt', 'inseam', 'none'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.hem_type',
    label: 'Hem type',
    dataType: 'enum',
    unitKind: null,
    enumValues: [
      'shirt_tail',
      'straight',
      'single_fold',
      'double_fold',
      'coverstitch',
      'rolled',
      'raw_edge',
    ],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  def({
    key: 'construction.seam_type',
    label: 'Seam type',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['plain', 'flat_felled', 'french', 'overlock', 'coverstitch'],
    manufacturingCritical: true,
    ui: select('Construction'),
  }),
  // dimension
  def({
    key: 'dimension.body_length',
    label: 'Body length',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.chest_width',
    label: 'Chest width',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.shoulder_width',
    label: 'Shoulder width',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.sleeve_length',
    label: 'Sleeve length',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.cuff_width',
    label: 'Cuff width',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.collar_height',
    label: 'Collar height',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.neckline_width',
    label: 'Neckline width',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.placket_width',
    label: 'Placket width',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.hem_depth',
    label: 'Hem depth',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  def({
    key: 'dimension.seam_allowance',
    label: 'Seam allowance',
    dataType: 'dimension',
    unitKind: 'length',
    manufacturingCritical: true,
    ui: { control: 'dimension', group: 'Dimensions' },
  }),
  // material
  def({
    key: 'material.fabric_ref',
    label: 'Fabric',
    dataType: 'reference',
    unitKind: null,
    manufacturingCritical: true,
    ui: { control: 'reference', group: 'Material' },
  }),
  def({
    key: 'material.composition',
    label: 'Fibre composition',
    dataType: 'composition',
    unitKind: null,
    manufacturingCritical: true,
    ui: { control: 'composition', group: 'Material' },
  }),
  def({
    key: 'material.gsm',
    label: 'Fabric weight (GSM)',
    dataType: 'number',
    unitKind: 'mass_area',
    min: 20,
    max: 1000,
    manufacturingCritical: true,
    ui: { control: 'number', group: 'Material' },
  }),
  // placement
  def({
    key: 'placement.pocket_position',
    label: 'Pocket position',
    dataType: 'enum',
    unitKind: null,
    enumValues: ['left_chest', 'right_chest', 'center_chest', 'lower_left', 'lower_right'],
    manufacturingCritical: true,
    ui: select('Placement'),
  }),
]);

export const PROPERTY_KEYS: readonly string[] = PROPERTY_DEFINITIONS.map((d) => d.key);
