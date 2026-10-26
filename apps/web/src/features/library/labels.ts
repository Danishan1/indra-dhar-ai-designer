import type { Artifact, ArtifactCategoryKey } from '@ai-designer/contracts';

export const CATEGORY_LABELS: Record<ArtifactCategoryKey, string> = {
  sleeve: 'Sleeves',
  collar: 'Collars',
  cuff: 'Cuffs',
  pocket: 'Pockets',
  placket: 'Plackets',
  neckline: 'Necklines',
  fabric: 'Fabrics',
  lace: 'Lace',
  trim: 'Trims',
  embroidery: 'Embroidery',
  button: 'Buttons',
  artwork: 'Artwork',
};

export const SCOPE_LABELS: Record<Artifact['ownerScope'], string> = {
  platform: 'Built-in',
  organization: 'Organization',
  user: 'Private',
};

export const CAPABILITY_LABELS: Record<'G0' | 'G1' | 'G2', string> = {
  G0: 'Image only',
  G1: 'Annotated image',
  G2: 'Editable 2D',
};

export const VALIDATION_LABELS: Record<NonNullable<Artifact['validationStatus']>, string> = {
  unvalidated: 'Not validated',
  design_asset_validated: 'Design asset',
  production_validated: 'Production-validated',
};

/** Component types an artifact can target (subset of the garment-model catalog shown in filters). */
export const TARGET_TYPES = [
  'sleeve',
  'collar',
  'cuff',
  'pocket',
  'placket',
  'neckline',
  'hem',
  'front_body_panel',
  'back_body_panel',
  'garment_body',
] as const;

export const human = (s: string) => s.replaceAll('_', ' ');
