/**
 * Render templates per garment category (ADR-008: woven shirt, knit T-shirt). A template gives the
 * default measurements used when a property has no value, the drawing constants that are not design
 * properties, and whether the back view is defined (FR-RV-030: never mirrored by guesswork).
 */
import type { View } from './types.js';

export interface TemplateDefaults {
  /** Flat chest width (pit to pit), mm. */
  chestWidth: number;
  shoulderWidth: number;
  /** HPS to hem at centre front. */
  bodyLength: number;
  /** Neck opening width (HPS to HPS). */
  neckWidth: number;
  frontNeckDepth: number;
  backNeckDepth: number;
  shoulderDrop: number;
  /** HPS to underarm. */
  armholeDepth: number;
  sleeveLength: number;
  /** Flat sleeve opening at the end (before cuff). */
  sleeveOpening: number;
  cuffWidth: number;
  collarHeight: number;
  placketWidth: number;
  buttonCount: number;
  hemDepth: number;
  /** Rib/binding width of a knit neckline (drawing constant, not a property). */
  neckBandWidth: number;
}

export interface RenderTemplate {
  key: string;
  label: string;
  garmentType: string;
  /** Views this template defines explicitly. */
  views: readonly View[];
  defaults: TemplateDefaults;
  defaultSleeveType: SleeveType;
  defaultHemType: HemType;
}

export const SleeveTypes = ['set_in', 'raglan', 'drop_shoulder', 'dolman', 'sleeveless'] as const;
export type SleeveType = (typeof SleeveTypes)[number];
export const HemTypes = [
  'shirt_tail',
  'straight',
  'single_fold',
  'double_fold',
  'coverstitch',
  'rolled',
  'raw_edge',
] as const;
export type HemType = (typeof HemTypes)[number];
export const Silhouettes = ['slim', 'regular', 'relaxed', 'oversized', 'boxy'] as const;
export type Silhouette = (typeof Silhouettes)[number];

const TEMPLATES: readonly RenderTemplate[] = Object.freeze([
  {
    key: 'woven_shirt',
    label: 'Woven shirt',
    garmentType: 'shirt',
    views: ['front', 'back'],
    defaultSleeveType: 'set_in',
    defaultHemType: 'shirt_tail',
    defaults: {
      chestWidth: 560,
      shoulderWidth: 460,
      bodyLength: 780,
      neckWidth: 170,
      frontNeckDepth: 75,
      backNeckDepth: 20,
      shoulderDrop: 40,
      armholeDepth: 250,
      sleeveLength: 620,
      sleeveOpening: 125,
      cuffWidth: 65,
      collarHeight: 40,
      placketWidth: 32,
      buttonCount: 7,
      hemDepth: 8,
      neckBandWidth: 0,
    },
  },
  {
    key: 'knit_tshirt',
    label: 'Knit T-shirt',
    garmentType: 'tshirt',
    views: ['front', 'back'],
    defaultSleeveType: 'set_in',
    defaultHemType: 'coverstitch',
    defaults: {
      chestWidth: 520,
      shoulderWidth: 440,
      bodyLength: 700,
      neckWidth: 180,
      frontNeckDepth: 90,
      backNeckDepth: 25,
      shoulderDrop: 45,
      armholeDepth: 220,
      sleeveLength: 200,
      sleeveOpening: 170,
      cuffWidth: 0,
      collarHeight: 0,
      placketWidth: 0,
      buttonCount: 3,
      hemDepth: 22,
      neckBandWidth: 18,
    },
  },
]);

export function getTemplate(category: string | null | undefined): RenderTemplate | null {
  return TEMPLATES.find((t) => t.key === category) ?? null;
}

export function listTemplates(): {
  key: string;
  label: string;
  garmentType: string;
  views: View[];
}[] {
  return TEMPLATES.map((t) => ({
    key: t.key,
    label: t.label,
    garmentType: t.garmentType,
    views: [...t.views],
  }));
}

/** Component types this renderer draws (others are listed as unsupported, never guessed). */
export const DRAWN_COMPONENT_TYPES = [
  'garment_body',
  'front_body_panel',
  'back_body_panel',
  'sleeve',
  'cuff',
  'collar',
  'neckline',
  'placket',
  'pocket',
  'hem',
  'yoke',
] as const;
/** Inside the garment: part of the design, not visible in a technical flat. */
export const INVISIBLE_COMPONENT_TYPES = ['lining', 'facing', 'seam_group'] as const;
