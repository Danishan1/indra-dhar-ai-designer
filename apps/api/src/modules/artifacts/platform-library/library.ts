import type {
  ArtifactCategory,
  ArtifactDefinitionInput,
  PropertyValue,
} from '@ai-designer/garment-model';
import { missingValue } from '@ai-designer/garment-model';

import {
  artworkSvg,
  borderSvg,
  buttonSvg,
  collarSvg,
  cuffSvg,
  motifSvg,
  necklineSvg,
  placketSvg,
  pocketSvg,
  sleeveSvg,
  swatchSvg,
} from './svg.js';

/**
 * The built-in library (FR-050, ADR-008 categories: woven shirt + knit T-shirt). Synced into the
 * database at API start (`PlatformLibraryService`); changing an entry here creates a new immutable
 * revision, removing one marks it deprecated. Keys are permanent — never reuse or rename them.
 *
 * Built-ins describe *design* intent only: physical/manufacturing properties stay `missing`
 * (ART-008, ART-014), so nothing here is ever production-validated.
 */
export interface PlatformArtifactSpec {
  key: string;
  category: ArtifactCategory;
  artifactType: string;
  name: string;
  description: string;
  tags: string[];
  definition: ArtifactDefinitionInput;
  visual?: Record<string, PropertyValue>;
  physical?: Record<string, PropertyValue>;
}

/** Facts the platform states about its own library items (e.g. a swatch's colour). */
const LIBRARY_CONFIRMATION = {
  confirmedBy: 'platform-library',
  confirmedAt: '2026-10-26T00:00:00.000Z',
};
const stated = (value: string): PropertyValue => ({
  value,
  unit: null,
  status: 'confirmed',
  sourceType: 'imported_data',
  sourceRefs: [
    { sourceType: 'imported_data', entityId: 'platform-library', revisionId: null, note: null },
  ],
  confidence: null,
  reviewRequired: false,
  ...LIBRARY_CONFIRMATION,
});
const unknownMaterial = () => ({
  'material.composition': missingValue(),
  'material.gsm': missingValue(),
});

const BODY_PARTS = [
  'garment_body',
  'front_body_panel',
  'back_body_panel',
  'sleeve',
  'collar',
  'cuff',
  'pocket',
  'placket',
  'yoke',
  'neckline',
  'hem',
];

const sleeves: PlatformArtifactSpec[] = [
  {
    key: 'sleeve.set_in_short',
    name: 'Short set-in sleeve',
    lengthRatio: 0.3,
    raglan: false,
    tags: ['short', 'tshirt'],
  },
  {
    key: 'sleeve.set_in_elbow',
    name: 'Elbow set-in sleeve',
    lengthRatio: 0.55,
    raglan: false,
    tags: ['elbow'],
  },
  {
    key: 'sleeve.set_in_long',
    name: 'Long set-in sleeve',
    lengthRatio: 1,
    raglan: false,
    tags: ['long', 'shirt'],
  },
  {
    key: 'sleeve.raglan_long',
    name: 'Long raglan sleeve',
    lengthRatio: 1,
    raglan: true,
    tags: ['long', 'raglan'],
  },
  {
    key: 'sleeve.raglan_short',
    name: 'Short raglan sleeve',
    lengthRatio: 0.3,
    raglan: true,
    tags: ['short', 'raglan'],
  },
  {
    key: 'sleeve.cap',
    name: 'Cap sleeve',
    lengthRatio: 0.15,
    raglan: false,
    tags: ['short', 'cap'],
  },
].map((s) => ({
  key: s.key,
  category: 'sleeve' as const,
  artifactType: s.raglan ? 'raglan_sleeve' : 'set_in_sleeve',
  name: s.name,
  description: `${s.name}; length about ${Math.round(s.lengthRatio * 100)}% of a full sleeve.`,
  tags: ['sleeve', ...s.tags],
  definition: {
    compatibleTargetTypes: ['sleeve'],
    placementModes: ['attach'],
    shapeParams: {
      kind: 'sleeve',
      params: {
        style: s.raglan ? 'raglan' : 'set_in',
        lengthRatio: s.lengthRatio,
        taper: 0.2,
        capHeightRatio: s.raglan ? 0 : 0.25,
      },
    },
    previewSvg: sleeveSvg(s.lengthRatio, s.raglan),
  },
  visual: { 'construction.sleeve_type': stated(s.raglan ? 'raglan' : 'set_in') },
}));

const collars: PlatformArtifactSpec[] = (
  [
    ['point', 'Point collar', 'Classic dress-shirt collar with narrow points.'],
    ['spread', 'Spread collar', 'Wide-set points for a tie or open neck.'],
    ['button_down', 'Button-down collar', 'Points fastened to the body with small buttons.'],
    ['mandarin', 'Mandarin collar', 'Short stand collar without points.'],
    ['camp', 'Camp collar', 'Flat, open collar for relaxed shirts.'],
  ] as const
).map(([style, name, description]) => ({
  key: `collar.${style}`,
  category: 'collar' as const,
  artifactType: `${style}_collar`,
  name,
  description,
  tags: ['collar', 'shirt'],
  definition: {
    compatibleTargetTypes: ['collar'],
    shapeParams: {
      kind: 'collar',
      params: {
        style,
        pointLengthMm: style === 'mandarin' ? 0 : style === 'spread' ? 75 : 80,
        standHeightMm: 30,
      },
    },
    previewSvg: collarSvg(style),
  },
  visual: { 'construction.collar_type': stated(style === 'mandarin' ? 'mandarin' : style) },
}));

const cuffs: PlatformArtifactSpec[] = [
  {
    key: 'cuff.barrel_one',
    name: 'Barrel cuff, one button',
    type: 'barrel_single_button',
    svg: cuffSvg(1),
  },
  {
    key: 'cuff.barrel_two',
    name: 'Barrel cuff, two buttons',
    type: 'barrel_double_button',
    svg: cuffSvg(2),
  },
  { key: 'cuff.french', name: 'French cuff', type: 'french', svg: cuffSvg(0, false, true) },
  { key: 'cuff.rib', name: 'Rib cuff', type: 'rib', svg: cuffSvg(0, true) },
].map((c) => ({
  key: c.key,
  category: 'cuff' as const,
  artifactType: `${c.type}_cuff`,
  name: c.name,
  description: `${c.name} for long sleeves.`,
  tags: ['cuff'],
  definition: {
    compatibleTargetTypes: ['cuff'],
    shapeParams: {
      kind: 'cuff',
      params: { style: c.type, depthMm: c.type === 'french' ? 75 : 60 },
    },
    previewSvg: c.svg,
  },
  visual: { 'construction.cuff_type': stated(c.type) },
}));

const pockets: PlatformArtifactSpec[] = (
  [
    ['patch_rounded', 'Rounded patch pocket', 'rounded', 'patch'],
    ['patch_pointed', 'Pointed patch pocket', 'pointed', 'patch'],
    ['patch_flap', 'Patch pocket with flap', 'flap', 'patch_with_flap'],
    ['welt', 'Welt pocket', 'welt', 'welt'],
  ] as const
).map(([key, name, shape, type]) => ({
  key: `pocket.${key}`,
  category: 'pocket' as const,
  artifactType: `${type}_pocket`,
  name,
  description: `${name} for chests and fronts.`,
  tags: ['pocket'],
  definition: {
    compatibleTargetTypes: ['front_body_panel', 'back_body_panel', 'garment_body'],
    preferredPlacementRegions: ['left_chest', 'right_chest'],
    shapeParams: { kind: 'pocket', params: { shape, widthMm: 120, heightMm: 140 } },
    previewSvg: pocketSvg(shape),
  },
  visual: { 'construction.pocket_type': stated(type) },
}));

const plackets: PlatformArtifactSpec[] = (
  [
    ['standard', 'Standard placket', 'Visible front strip with buttons.'],
    ['concealed', 'Concealed placket', 'Buttons hidden under a fly.'],
    ['half', 'Half placket (henley)', 'Short placket for pull-over shirts and henleys.'],
  ] as const
).map(([kind, name, description]) => ({
  key: `placket.${kind}`,
  category: 'placket' as const,
  artifactType: `${kind}_placket`,
  name,
  description,
  tags: ['placket'],
  definition: {
    compatibleTargetTypes: ['placket'],
    shapeParams: { kind: 'placket', params: { style: kind, widthMm: 35 } },
    previewSvg: placketSvg(kind),
  },
  visual: { 'construction.placket_type': stated(kind) },
}));

const necklines: PlatformArtifactSpec[] = (
  [
    ['crew', 'Crew neck with rib', 'Round neckline finished with rib.'],
    ['v_neck', 'V-neck with rib', 'V-shaped neckline finished with rib.'],
    ['scoop', 'Scoop neck', 'Wide, low round neckline.'],
  ] as const
).map(([kind, name, description]) => ({
  key: `neckline.${kind}`,
  category: 'neckline' as const,
  artifactType: `${kind}_neckline`,
  name,
  description,
  tags: ['neckline', 'tshirt'],
  definition: {
    compatibleTargetTypes: ['neckline'],
    shapeParams: { kind: 'neckline', params: { style: kind, ribWidthMm: 20 } },
    previewSvg: necklineSvg(kind),
  },
  visual: { 'construction.neckline_type': stated(kind) },
}));

const fabrics: PlatformArtifactSpec[] = (
  [
    ['white_poplin', 'White poplin', '#f8fafc', 'solid', '#ffffff', 'woven'],
    ['blue_chambray', 'Light blue chambray', '#93c5fd', 'chambray', '#ffffff', 'woven'],
    ['blue_oxford', 'Blue oxford', '#bfdbfe', 'oxford', '#ffffff', 'woven'],
    ['navy_twill', 'Navy twill', '#1e3a8a', 'twill', '#ffffff', 'woven'],
    ['black_jersey', 'Black jersey', '#111827', 'jersey', '#ffffff', 'knit'],
    ['grey_jersey', 'Heather grey jersey', '#9ca3af', 'jersey', '#e5e7eb', 'knit'],
    ['red_stripe', 'Red and white stripe', '#ffffff', 'stripe', '#dc2626', 'woven'],
    ['indigo_check', 'Indigo check', '#312e81', 'check', '#c7d2fe', 'woven'],
  ] as const
).map(([key, name, color, pattern, accent, base]) => ({
  key: `fabric.${key}`,
  category: 'fabric' as const,
  artifactType: `${base}_fabric`,
  name,
  description: `${name} (${base}). Visual swatch only — fibre content and weight are not specified.`,
  tags: ['fabric', base, pattern === 'solid' ? 'solid' : pattern],
  definition: {
    compatibleTargetTypes: BODY_PARTS,
    repeatable: true,
    placementModes: ['tiled_fill'],
    shapeParams: {
      kind: 'swatch',
      params: {
        color,
        pattern,
        accent,
        repeatMm: pattern === 'stripe' ? 12 : pattern === 'check' ? 20 : 4,
      },
    },
    previewSvg: swatchSvg(color, pattern, accent),
  },
  visual: {
    'appearance.color': stated(color),
    'appearance.pattern': stated(
      pattern === 'stripe' ? 'stripe' : pattern === 'check' ? 'check' : 'solid',
    ),
  },
  physical: unknownMaterial(),
}));

const lace: PlatformArtifactSpec[] = (
  [
    ['scalloped_border', 'Scalloped lace border', 'scallop'],
    ['eyelet_border', 'Eyelet border', 'eyelet'],
    ['picot_edge', 'Picot edge', 'picot'],
  ] as const
).map(([key, name, kind]) => ({
  key: `lace.${key}`,
  category: 'lace' as const,
  artifactType: 'lace_border',
  name,
  description: `${name} that follows hems and openings.`,
  tags: ['lace', 'border', 'hem'],
  definition: {
    compatibleTargetTypes: ['sleeve', 'hem', 'cuff'],
    allowedPlacementRegions: ['hem', 'opening', 'edge'],
    preferredPlacementRegions: ['hem'],
    repeatable: true,
    placementModes: ['follow_boundary'],
    shapeParams: { kind: 'border', params: { pattern: kind, widthMm: kind === 'picot' ? 6 : 25 } },
    previewSvg: borderSvg(kind),
  },
  physical: { 'material.composition': missingValue() },
}));

const trims: PlatformArtifactSpec[] = (
  [
    ['piping', 'Piping', 'piping', 'Corded edge trim for seams and edges.'],
    ['twill_tape', 'Twill tape', 'tape', 'Flat tape for neck and inner seams.'],
  ] as const
).map(([key, name, kind, description]) => ({
  key: `trim.${key}`,
  category: 'trim' as const,
  artifactType: key,
  name,
  description,
  tags: ['trim'],
  definition: {
    compatibleTargetTypes: ['collar', 'cuff', 'placket', 'pocket', 'neckline', 'seam_group', 'hem'],
    allowedPlacementRegions: ['edge', 'seam', 'hem', 'opening'],
    preferredPlacementRegions: ['edge'],
    repeatable: true,
    placementModes: ['follow_boundary'],
    shapeParams: { kind: 'border', params: { pattern: kind, widthMm: kind === 'piping' ? 4 : 10 } },
    previewSvg: borderSvg(kind),
  },
  physical: { 'material.composition': missingValue() },
}));

const embroidery: PlatformArtifactSpec[] = (
  [
    ['small_flower', 'Small flower motif', 'flower'],
    ['monogram_frame', 'Monogram frame', 'monogram'],
    ['leaf_sprig', 'Leaf sprig', 'leaf'],
  ] as const
).map(([key, name, kind]) => ({
  key: `embroidery.${key}`,
  category: 'embroidery' as const,
  artifactType: 'embroidery_motif',
  name,
  description: `${name} for chests, pockets, collars and cuffs.`,
  tags: ['embroidery', 'motif'],
  definition: {
    compatibleTargetTypes: ['front_body_panel', 'pocket', 'collar', 'cuff', 'sleeve'],
    preferredPlacementRegions: ['left_chest', 'collar_point', 'cuff_corner'],
    repeatable: true,
    placementModes: ['fixed_position'],
    shapeParams: { kind: 'motif', params: { motif: kind, widthMm: 40 } },
    previewSvg: motifSvg(kind),
  },
}));

const buttons: PlatformArtifactSpec[] = (
  [
    ['four_hole', 'Four-hole button', 'Flat round shirt button.'],
    ['shank', 'Shank button', 'Domed button with a shank.'],
    ['snap', 'Snap fastener', 'Press stud for knits and casual shirts.'],
  ] as const
).map(([kind, name, description]) => ({
  key: `button.${kind}`,
  category: 'button' as const,
  artifactType: kind === 'snap' ? 'snap' : 'button',
  name,
  description,
  tags: ['button', 'fastener'],
  definition: {
    compatibleTargetTypes: ['placket', 'cuff', 'pocket', 'collar'],
    repeatable: true,
    placementModes: ['fixed_position'],
    shapeParams: { kind: 'button', params: { style: kind, diameterMm: kind === 'snap' ? 12 : 11 } },
    previewSvg: buttonSvg(kind),
  },
  physical: { 'material.composition': missingValue() },
}));

const artwork: PlatformArtifactSpec[] = [
  {
    key: 'artwork.chest_logo_area',
    category: 'artwork',
    artifactType: 'placement_template',
    name: 'Chest logo area',
    description: 'Placement template for a small left-chest logo (about 80 × 60 mm).',
    tags: ['artwork', 'placement', 'logo'],
    definition: {
      compatibleTargetTypes: ['front_body_panel'],
      allowedPlacementRegions: ['left_chest', 'right_chest', 'center_chest'],
      preferredPlacementRegions: ['left_chest'],
      placementModes: ['fixed_position'],
      shapeParams: { kind: 'motif', params: { motif: 'area', widthMm: 80, heightMm: 60 } },
      previewSvg: artworkSvg('chest'),
    },
  },
  {
    key: 'artwork.back_print_area',
    category: 'artwork',
    artifactType: 'placement_template',
    name: 'Back print area',
    description: 'Placement template for a large back print (about 300 × 350 mm).',
    tags: ['artwork', 'placement', 'print'],
    definition: {
      compatibleTargetTypes: ['back_body_panel'],
      allowedPlacementRegions: ['center_back', 'upper_back'],
      preferredPlacementRegions: ['center_back'],
      placementModes: ['fixed_position'],
      shapeParams: { kind: 'motif', params: { motif: 'area', widthMm: 300, heightMm: 350 } },
      previewSvg: artworkSvg('back'),
    },
  },
];

export const PLATFORM_LIBRARY: readonly PlatformArtifactSpec[] = [
  ...sleeves,
  ...collars,
  ...cuffs,
  ...pockets,
  ...plackets,
  ...necklines,
  ...fabrics,
  ...lace,
  ...trims,
  ...embroidery,
  ...buttons,
  ...artwork,
];
