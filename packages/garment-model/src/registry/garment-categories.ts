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
]);
