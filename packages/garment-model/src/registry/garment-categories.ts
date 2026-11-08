/**
 * Initial garment categories (ADR-008, default accepted in I11; owner may still change it).
 * New categories are added here plus a template — no schema change.
 */
export interface GarmentCategoryDef {
  key: string;
  label: string;
  /** Family stored in `garmentType`. */
  garmentType: string;
  fabricBase: 'woven' | 'knit';
}

export const GARMENT_CATEGORIES: readonly GarmentCategoryDef[] = Object.freeze([
  { key: 'woven_shirt', label: 'Woven shirt', garmentType: 'shirt', fabricBase: 'woven' },
  { key: 'knit_tshirt', label: 'Knit T-shirt', garmentType: 'tshirt', fabricBase: 'knit' },
  // Demo track (ADR-056): further families recognised by the AI analyzer. They have no parametric
  // drawing yet; the editor shows their reference image with AI-identified parts and patterns.
  { key: 'dress', label: 'Dress', garmentType: 'dress', fabricBase: 'woven' },
  { key: 'skirt', label: 'Skirt', garmentType: 'skirt', fabricBase: 'woven' },
  { key: 'trousers', label: 'Trousers', garmentType: 'trousers', fabricBase: 'woven' },
  { key: 'jacket', label: 'Jacket', garmentType: 'jacket', fabricBase: 'woven' },
  { key: 'hoodie', label: 'Hoodie / sweatshirt', garmentType: 'hoodie', fabricBase: 'knit' },
  // Pattern-first families (ADR-061).
  { key: 'jumpsuit', label: 'Jumpsuit / romper', garmentType: 'jumpsuit', fabricBase: 'woven' },
  { key: 'dungarees', label: 'Dungarees', garmentType: 'dungarees', fabricBase: 'woven' },
  { key: 'coord_set', label: 'Co-ord set', garmentType: 'set', fabricBase: 'woven' },
]);
